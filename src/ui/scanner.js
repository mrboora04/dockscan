// src/ui/scanner.js

import { makeLiveCapture } from "../vision/live-capture.js";
import { runScanAnalysis } from "../vision/scanner-logic.js";
import { saveScan } from "../core/store.js";
import { processImageForScanning } from "../vision/image-processor.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app } from "../core/firebase.js";

// --- NEW: Mode Detection ---
const urlParams = new URLSearchParams(window.location.search);
const SCAN_MODE = urlParams.get('mode') || 'manual'; // Default to 'manual' if not specified
// ---

const db = getFirestore(app);
const v = document.getElementById("cam");
const box = document.getElementById("box");
const hud = document.getElementById("hud");
const shutterBtn = document.getElementById("shutter");
const btnStop = document.getElementById("btnStop");
const brandSelector = document.getElementById("brand-selector");
const zoomCtl = document.getElementById("zoomCtl");
const zoomBtns = [...document.querySelectorAll(".zoom-btn")];

// --- MODIFIED: Start the camera as soon as the page loads ---
let cap = null, loop = null, busy = false, frozen = false, prev = null;
let activeProfile = null;
let stagedScan = null;
// ---

const ocrWorker = await Tesseract.createWorker("eng", 1);
await ocrWorker.setParameters({
  tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:/#",
});

function uiLight(color, msg) { box.style.borderColor = color; hud.textContent = msg; }
function setActive(btn) { zoomBtns.forEach(b => b.classList.toggle("on", b === btn)); }
function downsample(canvas) { const W=160,H=120,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(canvas,0,0,W,H);const d=g.getImageData(0,0,W,H).data;const out=new Uint8Array(W*H);for(let i=0,j=0;i<d.length;i+=4,j++){out[j]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0}return out;}
function delta(a, b) { if(!a||!b)return 1;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/(a.length*255)}

async function populateBrandSelector() { /* ... same as live.js ... */ }
async function loadBrandProfile(brandId) { /* ... same as live.js ... */ }

async function analyzeAndSave(canvas, motion) {
    if (frozen) return;
    if (!activeProfile) {
        uiLight("#ef4444", "Please select a brand first!");
        await new Promise(r => setTimeout(r, 1500));
        uiLight("#34d399", `Select a brand to begin. [${SCAN_MODE.toUpperCase()} MODE]`);
        return;
    }
    frozen = true;
    uiLight("#1d4ed8", "Processing...");

    const isInDualLabelModelSearch = (activeProfile.logicType === 'dual_label' && stagedScan);
    if (isInDualLabelModelSearch) {
        await ocrWorker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE });
    }

    const result = await runScanAnalysis(canvas, activeProfile, ocrWorker, motion);

    if (isInDualLabelModelSearch) {
        await ocrWorker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
    }

    if (activeProfile.logicType === 'dual_label') {
        // ... dual-label logic remains the same
    } else { // Single-label logic
        if (result) {
            await saveScan({ ...result, raw: result.raw.slice(0, 300) });
            uiLight("#22c55e", `Saved: ${result.model || result.ms}`);
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    if (!result) {
        uiLight("#f59e0b", "Scan again. Aim for key info.");
        await new Promise(r => setTimeout(r, 1000));
    }
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
        
        // --- NEW: Only auto-capture in 'auto' mode ---
        if (SCAN_MODE === 'auto' && guidance.qualityOK && m < 0.06) {
            setTimeout(() => { if (!frozen) analyzeAndSave(crop, m); }, 150);
        }
    } catch (e) { console.error("Tick error:", e); }
    finally { busy = false; }
}

async function start() {
    if (loop) return;
    try {
        uiLight("#f59e0b", `Requesting camera... [${SCAN_MODE.toUpperCase()} MODE]`);
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
        await populateBrandSelector(); // Populate brands after camera starts
        uiLight("#34d399", `Select a brand to begin. [${SCAN_MODE.toUpperCase()} MODE]`);
    } catch (e) {
        hud.innerHTML = `<b>Camera error. Please grant permission.</b>`;
    }
}

function stop() {
    if (loop) { clearInterval(loop); loop = null; }
    if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    cap = null; frozen = false; prev = null; stagedScan = null;
    window.location.href = '/main-menu.html'; // Go back to menu when stopped
}

// Event Listeners
btnStop.addEventListener("click", stop);
shutterBtn.addEventListener("click", async () => {
    if (!cap || frozen) return;
    const crop = await cap.grabCropCanvas(); 
    await analyzeAndSave(crop, 0); // Manual capture always works
});
window.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });

// Auto-start the camera on page load
start();