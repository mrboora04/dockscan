import { makeLiveCapture } from "../vision/live-capture.js";
import { runScanAnalysis } from "../vision/scanner-logic.js";
import { saveScan } from "../core/store.js";
import { processImageForScanning } from "../vision/image-processor.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app ,auth} from "../core/firebase.js";

const urlParams = new URLSearchParams(window.location.search);
const SCAN_MODE = urlParams.get('mode') || 'manual';
const PRE_SELECTED_BRAND = urlParams.get('brand');

const db = getFirestore(app);
const v = document.getElementById("cam");
const box = document.getElementById("box");
const hud = document.getElementById("hud");
const shutterBtn = document.getElementById("shutter");
const btnStop = document.getElementById("btnStop");
const brandSelector = document.getElementById("brand-selector");
const zoomCtl = document.getElementById("zoomCtl");
const zoomBtns = [...document.querySelectorAll(".zoom-btn")];

let cap = null, loop = null, busy = false, frozen = false, prev = null;
let activeProfile = null;
let stagedScan = null;

const ocrWorker = await Tesseract.createWorker("eng", 1);
await ocrWorker.setParameters({
  tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:/#",
});

function uiLight(color, msg) { box.style.borderColor = color; hud.textContent = msg; }
function setActive(btn) { zoomBtns.forEach(b => b.classList.toggle("on", b === btn)); }
function downsample(canvas) { const W=160,H=120,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(canvas,0,0,W,H);const d=g.getImageData(0,0,W,H).data;const out=new Uint8Array(W*H);for(let i=0,j=0;i<d.length;i+=4,j++){out[j]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0}return out;}
function delta(a, b) { if(!a||!b)return 1;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/(a.length*255)}

async function populateBrandSelector() {
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

        // If a brand was pre-selected from the menu, activate its button
        if (PRE_SELECTED_BRAND && PRE_SELECTED_BRAND === doc.id) {
            btn.click();
        }
    });
}

async function loadBrandProfile(brandId) {
    stagedScan = null;
    activeProfile = null;
    uiLight(window.getComputedStyle(box).borderColor, `Loading ${brandId} profile...`);
    try {
        const profileDoc = await getDoc(doc(db, "brand_profiles", brandId));
        if (profileDoc.exists()) {
            activeProfile = profileDoc.data();
            uiLight(window.getComputedStyle(box).borderColor, `Ready for ${activeProfile.brandName}`);
        }
    } catch (e) { console.error("Error loading profile", e); }
}

async function analyzeAndSave(canvas, motion) {
    if (frozen) return;

    if (SCAN_MODE === 'auto' && !activeProfile) {
        uiLight("#ef4444", "Please select a brand for Auto Scan!");
        await new Promise(r => setTimeout(r, 1500));
        uiLight("#34d399", `Select a brand to begin. [AUTO MODE]`);
        return;
    }

    frozen = true;
    uiLight("#1d4ed8", "Processing...");

    const result = await runScanAnalysis(canvas, activeProfile, ocrWorker, motion);

    // --- THIS IS THE FIX ---
    // Map the result from our specialist to the schema your store.js expects.
    const scanDataForDb = {
        msNumber: result.ms,
        model: result.model,
        customer: result.customer,
        brand: result.diagnostics.brandProfileUsed,
        thumbnail: result.thumb,
        rawText: result.raw,
        scanQuality: { // The diagnostics object becomes the scanQuality object
            confidence: result.diagnostics.ocrConfidence,
            motionDetected: result.diagnostics.motion > 0.08,
            smartCropUsed: result.diagnostics.smartCropUsed,
            cropRect: result.diagnostics.cropRect,
        },
        userName: auth.currentUser?.email || "Unknown" // Get the user's email
    };
    
    // Now we save the correctly formatted data.
    await saveScan(scanDataForDb);
    // --- END OF FIX ---

    if (result.diagnostics.smartCropUsed) {
        const savedItem = result.model || result.ms || 'Label Scan';
        uiLight("#22c55e", `Saved: ${savedItem}`);
    } else {
        uiLight("#f59e0b", `Saved full image for review.`);
    }
    
    await new Promise(r => setTimeout(r, 1500));
    
    frozen = false;
}
async function tick() {
    if (busy || frozen || v.videoWidth === 0 || !cap) return;
    
    // In AUTO mode, we need a brand selected to do anything. In MANUAL, we don't.
    if (SCAN_MODE === 'auto' && !activeProfile) {
        return;
    }

    busy = true;
    try {
        const crop = await cap.grabCropCanvas();
        const m = delta(downsample(crop), prev);
        prev = downsample(crop);
        const { guidance } = processImageForScanning(crop, m);
        
        if (!stagedScan) {
            uiLight(guidance.color, guidance.text);
        }
        
        if (SCAN_MODE === 'auto' && guidance.qualityOK && m < 0.06) {
            setTimeout(() => { if (!frozen) analyzeAndSave(crop, m); }, 150);
        }
    } catch (e) { console.error("Tick error:", e); }
    finally { busy = false; }
}

async function start() {
    if (loop) return;
    try {
        uiLight(getComputedStyle(box).borderColor, `Requesting camera...`);
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
        }
        
        loop = setInterval(tick, 250);
        
        // Only show brand selector in Auto mode
        if (SCAN_MODE === 'auto') {
            await populateBrandSelector();
            brandSelector.style.display = 'flex';
            uiLight("#34d399", `Select a brand to begin. [AUTO MODE]`);
        } else {
            brandSelector.style.display = 'none';
            uiLight("#34d399", `Ready to scan. [MANUAL MODE]`);
        }
    } catch (e) {
        hud.innerHTML = `<b>Camera error. Please grant permission.</b>`;
    }
}

function stop() {
    if (loop) { clearInterval(loop); loop = null; }
    if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    cap = null; frozen = false; prev = null; stagedScan = null;
    window.location.href = '/main-menu.html';
}

shutterBtn.addEventListener("click", async () => {
    if (!cap || frozen) return;
    const crop = await cap.grabCropCanvas(); 
    await analyzeAndSave(crop, 0);
});
btnStop.addEventListener("click", stop);
window.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });

start();