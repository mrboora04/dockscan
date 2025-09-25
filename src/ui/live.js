// src/ui/live.js

import { makeLiveCapture } from "../vision/live-capture.js";
import { extractMs, extractCustomer, extractModel, norm } from "../vision/extractors.js";
import { saveScan } from "../core/store.js";
import { processImageForScanning } from "../vision/image-processor.js";
// NEW: Import Firestore functions to get a document
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app } from "../core/firebase.js";

const db = getFirestore(app);

const v = document.getElementById("cam");
const box = document.getElementById("box");
const hud = document.getElementById("hud");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const shutterBtn = document.getElementById("shutter");

function uiLight(color, msg) { box.style.borderColor = color; hud.textContent = msg; }
function downsample(canvas) { const W=160,H=120,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d",{willReadFrequently:true});g.drawImage(canvas,0,0,W,H);const d=g.getImageData(0,0,W,H).data;const out=new Uint8Array(W*H);for(let i=0,j=0;i<d.length;i+=4,j++){out[j]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0}return out;}
function delta(a, b) { if(!a||!b)return 1;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/(a.length*255)}

let cap = null, loop = null, busy = false, frozen = false, prev = null;
let activeProfile = null; // This will hold our loaded Brand Profile

const ocrWorker = await Tesseract.createWorker("eng", 1);
await ocrWorker.setParameters({
  tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
  tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:/",
});

const barcodeReader = new ZXing.BrowserMultiFormatReader();

// --- NEW: Function to load our Brand Profile from Firestore ---
async function loadBrandProfile(brandId) {
    console.log(`Loading profile for brand: ${brandId}`);
    uiLight("#f59e0b", `Loading ${brandId} profile...`);
    try {
        const profileDoc = await getDoc(doc(db, "brand_profiles", brandId));
        if (profileDoc.exists()) {
            activeProfile = profileDoc.data();
            console.log("Profile loaded:", activeProfile);
            uiLight("#34d399", "Ready to scan.");
        } else {
            console.error(`Profile not found for brand: ${brandId}`);
            uiLight("#ef4444", `Error: Profile '${brandId}' not found.`);
            activeProfile = null;
        }
    } catch (e) {
        console.error("Error loading profile:", e);
        uiLight("#ef4444", "Error loading profile.");
    }
}


async function analyzeAndSave(canvas) {
  if (frozen) return;
  if (!activeProfile) {
      uiLight("#ef4444", "No brand profile loaded. Cannot scan.");
      return;
  }
  frozen = true;
  uiLight("#1d4ed8", "Processing...");

  // (We will upgrade this logic in the next step to use the profile)
  const msFromBarcode = ""; // Placeholder
  const ocrText = ""; // Placeholder
  const finalMs = ""; // Placeholder
  const model = ""; // Placeholder

  if (!finalMs && !model) {
    uiLight("#ef4444", "Capture failed. Try again.");
    await new Promise(r => setTimeout(r, 1000));
    frozen = false;
    return;
  }

  // ... saveScan logic will go here ...
}

async function tick() {
  if (busy || frozen || v.videoWidth === 0 || !cap) return;
  if (!activeProfile) return; // Don't scan if no profile is loaded
  busy = true;
  try {
    const crop = await cap.grabCropCanvas();
    const m = delta(downsample(crop), prev);
    prev = downsample(crop);
    
    const { guidance } = processImageForScanning(crop, m);
    uiLight(guidance.color, guidance.text);

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
    loop = setInterval(tick, 250);
    btnStart.disabled = true;
    btnStop.disabled = false;
  } catch (e) { hud.innerHTML = `<b>Camera error.</b>`; }
}

function stop() {
  if (loop) { clearInterval(loop); loop = null; }
  barcodeReader.reset();
  if (v.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
  cap = null; frozen = false; prev = null;
  uiLight("#34d399", "Ready…");
  btnStart.disabled = false;
  btnStop.disabled = true;
}

btnStart.addEventListener("click", start);
btnStop.addEventListener("click", stop);
shutterBtn.addEventListener("click", async () => { if (!cap || frozen) return; const crop = await cap.grabCropCanvas(); await analyzeAndSave(crop); });
window.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });


// --- Load the LG profile as soon as the app starts ---
loadBrandProfile("LG");