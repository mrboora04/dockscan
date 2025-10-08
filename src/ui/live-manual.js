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

let cap = null, frozen = false;
const state = {
    activeProfile: null,
    stagedScan: null
};

async function analyzeAndSave(canvas) {
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
        msNumber: ms, model, customer,
        brand: state.activeProfile.brandName,
        thumbnail: canvas.toDataURL("image/jpeg", 0.7),
        rawText: ocrData.text,
        scanQuality: {
            confidence: Math.round(ocrData.confidence),
            motion: 0, // Manual capture has no motion metric
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
                ...state.stagedScan, model,
                rawText: `${state.stagedScan.rawText}\n---\n${ocrData.text}`,
                thumbnail: canvas.toDataURL("image/jpeg", 0.7),
                scanQuality: { ...state.stagedScan.scanQuality, ...scanData.scanQuality }
            };
            await saveScan(finalScan);
            uiLight("#22c55e", `Success! Complete ${state.activeProfile.brandName} scan saved.`);
            state.stagedScan = null;
        }
    } else { // Single-label logic
        await saveScan(scanData);
        const foundInfo = model || scanData.msNumber;
        if (foundInfo) {
            uiLight("#22c55e", `Saved: ${foundInfo}`);
        } else {
            uiLight("#f59e0b", "Saved with missing info. Check viewer.");
        }
    }

    await new Promise(r => setTimeout(r, 1500));
    uiLight("#34d399", "Ready for next scan.");
    frozen = false;
}

async function start() {
    if (cap) return;
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
        uiLight("#34d399", "Ready to capture. Use the shutter button.");
        btnStart.disabled = true;
        btnStop.disabled = false;
    } catch (e) {
        hud.innerHTML = `<b>Camera error. Please grant permission.</b>`;
    }
}

function stop() {
    if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    cap = null; frozen = false; state.stagedScan = null;
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
    await analyzeAndSave(crop); 
});
window.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });

const loadBrandProfileWrapper = (brandId) => loadBrandProfile(brandId, uiLight, state);
populateBrandSelector(brandSelector, uiLight, loadBrandProfileWrapper);