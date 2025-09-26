import { makeLiveCapture } from "../vision/live-capture.js";
import { extractMs, extractCustomer, extractModel } from "../vision/extractors.js";
import { saveScan } from "../core/store.js";
import { processImageForScanning } from "../vision/image-processor.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app } from "../core/firebase.js";

const db = getFirestore(app);
const v = document.getElementById("cam");
const box = document.getElementById("box");
const hud = document.getElementById("hud");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const shutterBtn = document.getElementById("shutter");
const brandSelector = document.getElementById("brand-selector");
const zoomCtl = document.getElementById("zoomCtl");
const zoomBtns = [...document.querySelectorAll(".zoom-btn")];

function uiLight(color, msg) { box.style.borderColor = color; hud.textContent = msg; }
function setActive(btn) { zoomBtns.forEach(b => b.classList.toggle("on", b === btn)); }
function downsample(canvas) { const W=160,H=120,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(canvas,0,0,W,H);const d=g.getImageData(0,0,W,H).data;const out=new Uint8Array(W*H);for(let i=0,j=0;i<d.length;i+=4,j++){out[j]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0}return out;}
function delta(a, b) { if(!a||!b)return 1;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/(a.length*255)}

let cap = null, loop = null, busy = false, frozen = false, prev = null;
let activeProfile = null;
let stagedScan = null;

const ocrWorker = await Tesseract.createWorker("eng", 1);
await ocrWorker.setParameters({
  tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:/#",
});
const barcodeReader = new ZXing.BrowserMultiFormatReader();

async function populateBrandSelector() {
    uiLight("#f59e0b", "Loading brand profiles...");
    const profilesSnap = await getDocs(collection(db, "brand_profiles"));
    brandSelector.innerHTML = '';
    profilesSnap.forEach(doc => {
        const profile = doc.data();
        const btn = document.createElement("button");
        btn.className = "btn ghost";
        btn.textContent = profile.brandName;
        btn.onclick = () => {
            document.querySelectorAll('#brand-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadBrandProfile(doc.id);
        };
        brandSelector.appendChild(btn);
    });
    uiLight("#34d399", "Please select a brand to begin scanning.");
}

async function loadBrandProfile(brandId) {
    stagedScan = null;
    activeProfile = null;
    uiLight("#f59e0b", `Loading ${brandId} profile...`);
    try {
        const profileDoc = await getDoc(doc(db, "brand_profiles", brandId));
        if (profileDoc.exists()) {
            activeProfile = profileDoc.data();
            uiLight("#34d399", `Ready to scan ${activeProfile.brandName}.`);
        } else { uiLight("#ef4444", `Error: Profile '${brandId}' not found.`); }
    } catch (e) { uiLight("#ef4444", "Error loading profile."); }
}

async function analyzeAndSave(canvas) {
    if (frozen || !activeProfile) return;
    frozen = true;
    uiLight("#1d4ed8", "Processing...");
    const { processedCanvas } = processImageForScanning(canvas, 0);

    let msFromBarcode = "";
    try {
        const result = await barcodeReader.decodeFromCanvas(canvas);
        const barcodeText = result.getText();
        if (/6100\d{6}/.test(barcodeText)) {
            msFromBarcode = barcodeText.match(/6100\d{6}/)[0];
        }
    } catch (err) { /* no barcode found */ }

    const ocrData = (await ocrWorker.recognize(processedCanvas)).data;
    const ms = msFromBarcode || extractMs(ocrData, activeProfile);
    const model = extractModel(ocrData, activeProfile);
    const customer = extractCustomer(ocrData, activeProfile);

    const diagnostics = {
        brandProfileUsed: activeProfile.brandName,
        foundMs: !!ms,
        foundModel: !!model,
        foundCustomer: !!customer,
        msSource: msFromBarcode ? 'barcode' : 'ocr',
        ocrConfidence: Math.round(ocrData.confidence)
    };

    if (activeProfile.logicType === 'dual_label') {
        const isShippingLabelScan = ms && customer && !model;
        const isProductLabelScan = model && !ms;
        if (isShippingLabelScan) {
            stagedScan = { ms, customer, raw: ocrData.text, diagnostics };
            uiLight("#22c55e", `MS# Found: ${ms}. Now scan the MODEL NUMBER label.`);
            frozen = false;
            return;
        }
        if (isProductLabelScan && stagedScan) {
            const finalScan = { ...stagedScan, model: model, thumb: canvas.toDataURL("image/jpeg", 0.7) };
            finalScan.diagnostics.foundModel = true;
            await saveScan(finalScan);
            uiLight("#22c55e", `Success! Complete ${activeProfile.brandName} scan saved.`);
            stagedScan = null;
            await new Promise(r => setTimeout(r, 2000));
            frozen = false;
            return;
        }
    } else { // Single-label logic
        if (ms || model) {
            await saveScan({
                ms, model, customer,
                raw: ocrData.text.slice(0, 300),
                thumb: canvas.toDataURL("image/jpeg", 0.7),
                diagnostics: diagnostics
            });
            uiLight("#22c55e", `Saved: ${model || ms}`);
            await new Promise(r => setTimeout(r, 1200));
            frozen = false;
            return;
        }
    }
    uiLight("#f59e0b", "Scan again. Aim for key info.");
    await new Promise(r => setTimeout(r, 1000));
    frozen = false;
}

async function tick() {
    if (busy || frozen || v.videoWidth === 0 || !cap || !activeProfile) return;
    busy = true;
    try {
        const crop = await cap.grabCropCanvas();
        const m = delta(downsample(crop), prev);
        prev = downsample(crop);
        const { guidance } = processImageForScanning(crop, m);
        if (!stagedScan) { uiLight(guidance.color, guidance.text); }
        if (guidance.qualityOK && m < 0.06) {
            setTimeout(() => { if (!frozen) analyzeAndSave(crop); }, 150);
        }
    } catch (e) { console.error("Tick error:", e); }
    finally { busy = false; }
}

async function start() {
    if (loop) return;
    try {
        hud.textContent = "Requesting camera…";
        cap = await makeLiveCapture(v, box);
        const caps = cap.caps || {};
            if (caps.zoom) {
              const min = caps.zoom.min ?? 1, max = caps.zoom.max ?? 3;
              const map = { "1": min, "2": min + (max - min) * 0.5, "3": max };
              zoomCtl.style.display = 'flex';
              for (const b of zoomBtns) {
                b.onclick = async (e) => { await cap.setZoom(map[e.target.dataset.z]); setActive(e.target); };
              }
              setActive(zoomBtns[0]);
            } else {
              zoomCtl.style.display = 'none';
            }
        loop = setInterval(tick, 250);
        btnStart.disabled = true;
        btnStop.disabled = false;
    } catch (e) {
        hud.innerHTML = `<b>Camera error. Please grant permission.</b>`;
    }
}

function stop() {
    if (loop) { clearInterval(loop); loop = null; }
    barcodeReader.reset();
    if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    cap = null; frozen = false; prev = null; stagedScan = null;
    uiLight("#34d399", "Ready…");
    btnStart.disabled = false;
    btnStop.disabled = true;
    zoomCtl.style.display = 'none'; // Hide zoom controls when stopped
}

btnStart.addEventListener("click", start);
btnStop.addEventListener("click", stop);
shutterBtn.addEventListener("click", async () => { if (!cap || frozen) return; const crop = await cap.grabCropCanvas(); await analyzeAndSave(crop); });
window.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });

populateBrandSelector();