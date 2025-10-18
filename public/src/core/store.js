// src/core/store.js
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app, auth } from "./firebase.js";
const db = getFirestore(app);

export async function saveScan({
  ms, customer = "", model = "", brand = "",
  raw = "",                 // short raw snippet
  thumb = "",               // data URL (small JPEG)
  // Diagnostics from the Specialist Architecture (formerly individual fields)
  scanQuality = {},         // { confidence: 0, motion: 0, cropRect: [x,y,w,h], smartCropUsed: false, ... }
  trainingData = {},        // { cropSuggestions: [ {rect, thumb}, ... ], approvedRect: [x,y,w,h], ... }
}) {
  return addDoc(collection(db, "scans"), {
    ms, customer, model, brand, raw, thumb,
    scanQuality,
    trainingData,
    status: "pending", // All new scans start as pending for review
    by: auth.currentUser?.uid || null,
    timestamp: serverTimestamp(), // Use 'timestamp' for consistency with viewer.js orderBy
    mode: "live"
  });
}