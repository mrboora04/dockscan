import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app, auth } from "./firebase.js";

const db = getFirestore(app);

/**
 * Saves a scan record to Firestore, adhering to the application's data schema.
 * @param {object} scanData - An object containing all the scan details.
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
  userName = ""
}) {
  return addDoc(collection(db, "scans"), {
    // Core Data
    msNumber,
    model,
    customer,

    // IDs
    userId: auth.currentUser?.uid || null,
    userName: userName,

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