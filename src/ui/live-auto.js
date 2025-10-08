import { app, auth } from "../core/firebase.js";
import { saveScan } from '../core/store.js';
import { makeLiveCapture } from "../vision/live-capture.js";
import { processImageForScanning } from "../vision/image-processor.js";
import { extractMs, extractCustomer, extractModel } from '../vision/extractors.js';
import { populateBrandSelector, loadBrandProfile } from './scanner.js';

const v = document.getElementById("cam");
const box = document.getElementById("box");
const hud = document.getElementById("hud");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const shutterBtn = document.getElementById("shutter");
const brandSelector = document.getElementById("brand-selector");
const zoomCtl = document.getElementById("zoomCtl");
const zoomBtns = [...document.querySelectorAll(".zoom-btn")];

const ocrWorker = await Tesseract.createWorker("eng", 1);
await ocrWorker.setParameters({
  tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:/#",
});

function uiLight(color, msg) { box.style.borderColor = color; hud.textContent = msg; }
function setActive(btn) { zoomBtns.forEach(b => b.classList.toggle("on", b === btn)); }
function downsample(canvas) { const W=160,H=120,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(canvas,0,0,W,H);const d=g.getImageData(0,0,W,H).data;const out=new Uint8Array(W*H);for(let i=0,j=0;i<d.length;i+=4,j++){out[j]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0}return out;}
function delta(a, b) { if(!a||!b)return 1;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/(a.length*255)}

let cap = null, loop = null, busy = false, frozen = false, prev = null;
const state = {
    activeProfile: null,
    stagedScan: null
};

async function analyzeAndSave(canvas, motion) {
    if (frozen) return;
    if (!state.activeProfile) {
        uiLight("#ef4444", "Please select a brand first!");
        await new Promise(r => setTimeout(r, 1500));
        uiLight("#34d399", "Please select a brand to begin scanning.");
        return;
    }
    frozen = true;
    uiLight("#1d4ed8", "Processing...");

    const isInDualLabelModelSearch = (state.activeProfile.logicType === 'dual_label' && state.stagedScan);
    if (isInDualLabelModelSearch) {
        await ocrWorker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE });
    }

    const { processedCanvas } = processImageForScanning(canvas, 0);
    let msFromBarcode = "";
    const ocrData = (await ocrWorker.recognize(processedCanvas)).data;

    if (isInDualLabelModelSearch) {
        await ocrWorker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
    }

    const ms = msFromBarcode || extractMs(ocrData, state.activeProfile);
    const model = extractModel(ocrData, state.activeProfile);
    const customer = extractCustomer(ocrData, state.activeProfile);

    const scanData = {
        msNumber: ms,
        model: model,
        customer: customer,
        brand: state.activeProfile.brandName,
        thumbnail: canvas.toDataURL("image/jpeg", 0.7),
        rawText: ocrData.text,
        scanQuality: {
            confidence: Math.round(ocrData.confidence),
            motion: +motion.toFixed(3),
            msSource: msFromBarcode ? 'barcode' : 'ocr',
        },
        userName: auth.currentUser?.displayName || ""
    };

    if (state.activeProfile.logicType === 'dual_label') {
        const isShippingLabelScan = ms && !model;
        const isProductLabelScan = model && !ms;

        if (isShippingLabelScan && !state.stagedScan) {
            state.stagedScan = scanData;
            const customerText = customer || "N/A";
            uiLight("#22c55e", `STAGED: MS# ${ms} | Customer: ${customerText}. Now scan MODEL label.`);
            frozen = false;
            return;
        }

        if (isProductLabelScan && state.stagedScan) {
            const finalScan = {
                ...state.stagedScan,
                model: model,
                rawText: `${state.stagedScan.rawText}\n---\n${ocrData.text}`,
                thumbnail: canvas.toDataURL("image/jpeg", 0.7),
                scanQuality: { ...state.stagedScan.scanQuality, ...scanData.scanQuality }
            };
            await saveScan(finalScan);
            uiLight("#22c55e", `Success! Complete ${state.activeProfile.brandName} scan saved.`);
            state.stagedScan = null;
            await new Promise(r => setTimeout(r, 2000));
            frozen = false;
            return;
        }
    } else { // Single-label logic
        await saveScan(scanData);
        const foundInfo = model || scanData.msNumber;
        if (foundInfo) {
            uiLight("#22c55e", `Saved: ${foundInfo}`);
        } else {
            uiLight("#f59e0b", "Saved with missing info. Check viewer.");
        }
        await new Promise(r => setTimeout(r, 1500));
        frozen = false;
        return;
    }

    uiLight("#f59e0b", "Scan again. Aim for key info.");
    await new Promise(r => setTimeout(r, 1000));
    frozen = false;
}

async function tick() {
    if (busy || frozen || v.videoWidth === 0 || !cap || !state.activeProfile) return;
    busy = true;
    try {
        const crop = await cap.grabCropCanvas();
        const m = delta(downsample(crop), prev);
        prev = downsample(crop);
        const { guidance } = processImageForScanning(crop, m);
        if (!state.stagedScan) { uiLight(guidance.color, guidance.text); }
        if (guidance.qualityOK && m < 0.06) {
            setTimeout(() => { if (!frozen) analyzeAndSave(crop, m); }, 150);
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
    if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    cap = null; frozen = false; prev = null; state.stagedScan = null;
    uiLight("#34d399", "Ready…");
    btnStart.disabled = false;
    btnStop.disabled = true;
    zoomCtl.style.display = 'none';
}

btnStart.addEventListener("click", start);
btnStop.addEventListener("click", stop);
shutterBtn.addEventListener("click", async () => {
    if (!cap || frozen) return;
    const crop = await cap.grabCropCanvas();
    await analyzeAndSave(crop, 0);
});
window.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });

const loadBrandProfileWrapper = (brandId) => loadBrandProfile(brandId, uiLight, state);
populateBrandSelector(brandSelector, uiLight, loadBrandProfileWrapper);