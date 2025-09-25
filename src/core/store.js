// src/core/store.js
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app, auth } from "./firebase.js";
const db = getFirestore(app);

export async function saveScan({
  ms, customer = "", model = "",
  raw = "",                 // short raw snippet
  thumb = "",               // data URL (small JPEG)
  conf = 0,                 // OCR confidence (0-100)
  motion = 0,               // frame motion (0..1)
  usedDigits = false,       // whether second pass (digits) helped
  ocrMs = 0,                // OCR duration for this capture
  roi = null                // {w,h} of the crop
}) {
  return addDoc(collection(db, "scans"), {
    ms, customer, model, raw, thumb,
    conf, motion, usedDigits, ocrMs, roi,
    status: "pending",
    by: auth.currentUser?.uid || null,
    ts: serverTimestamp(),
    mode: "live"
  });
}
