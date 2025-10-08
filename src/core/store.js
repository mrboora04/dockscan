// src/core/store.js
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app, auth } from "./firebase.js";
const db = getFirestore(app);

/**
 * Saves a scan record to Firestore, adhering to the new data schema.
 */
export async function saveScan({
  msNumber = "",
  model = "",
  customer = "",
  brand = "",
  thumbnail = "",
  rawText = "",
  wasCorrected = false,
  scanQuality = {},
  // Add userName parameter
  userName = "" 
}) {
  return addDoc(collection(db, "scans"), {
    // Core Data
    msNumber,
    model,
    customer,

    // IDs
    userId: auth.currentUser?.uid || null,
    userName: userName, // Save the user's name

    // Metadata
    timestamp: serverTimestamp(),
    brand,
    thumbnail,
    wasCorrected,

    // Training & Debug Data
    scanQuality,
    rawText,
  });
}