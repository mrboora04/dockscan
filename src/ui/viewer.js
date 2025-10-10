// src/ui/viewer.js

import { app } from "../core/firebase.js";
import {
  getFirestore, collection, query, where, orderBy, limit, onSnapshot, // Add 'where'
  doc, deleteDoc, getDocs, writeBatch, updateDoc, runTransaction // Add runTransaction for safe updates
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const db = getFirestore(app);
const scanGrid = document.getElementById("scan-grid");
const btnDelSel = document.getElementById("btnDelSel");
const btnClearAll = document.getElementById("btnClearAll");
const chkAll = document.getElementById("chkAll"); // Ensure this is also linked

function formatTimestamp(ts) {
  if (!ts || !ts.seconds) return "";
  return new Date(ts.seconds * 1000).toLocaleString();
}

/**
 * Creates a single "scan card" element.
 */
function createCardElement(docId, data) {
    const card = document.createElement("div");
    card.className = "scan-card";
    card.dataset.id = docId;
    // NEW: Add a class if the scan is already approved
    if (data.status === 'approved') {
        card.classList.add('approved');
    }

    // Brand Tag (using diagnostics.brandProfileUsed)
    const brand = data.diagnostics?.brandProfileUsed;
    if (brand) {
        const brandTag = document.createElement("div");
        brandTag.className = "card-brand-tag";
        brandTag.textContent = brand;
        card.appendChild(brandTag);
    }

    const thumbnail = document.createElement("img");
    thumbnail.className = "card-thumbnail";
    thumbnail.src = data.thumb || 'https://via.placeholder.com/350x200?text=No+Image'; // Better placeholder
    card.appendChild(thumbnail);
    
    const body = document.createElement("div");
    body.className = "card-body";

    // Checkbox for batch actions
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "card-checkbox pick";
    chk.dataset.id = docId;
    card.appendChild(chk);

    // Info Row for Model and MS#
    const infoRow = document.createElement("div");
    infoRow.className = "card-info-row";
    infoRow.innerHTML = `
        <div class="model">
            <div class="label">Model</div>
            <div class="value">${data.model || "N/A"}</div>
        </div>
        <div class="ms" style="text-align: right;">
            <div class="label">MS#</div>
            <div class="value">${data.ms || "N/A"}</div>
        </div>
    `;

    // Customer Info
    const customer = document.createElement("div");
    customer.className = "card-customer";
    customer.innerHTML = `
        <div class="label">Customer</div>
        <div class="value">${data.customer || "N/A"}</div>
    `;

    // Details/Summary (Now includes Confidence and Motion)
    const details = document.createElement("div");
    details.className = "card-details";
    const ocrConfidence = data.diagnostics?.ocrConfidence ?? 0;
    const motionValue = data.diagnostics?.motion ?? 0;

    details.innerHTML = `
        Time: ${formatTimestamp(data.ts)}<br>
        Summary: conf ${ocrConfidence}% · motion ${motionValue}
        <div class="raw-text-preview" style="white-space: pre-wrap; font-family: monospace; font-size: 0.9em; max-height: 80px; overflow: hidden; text-overflow: ellipsis; margin-top: 8px; color: var(--text-dark);">
            ${(data.raw || "").replace(/</g, "&lt;")}
        </div>
    `;

    body.appendChild(infoRow);
    body.appendChild(customer);
    body.appendChild(details);

    // --- ACTIONS (MODIFIED) ---
    const actions = document.createElement("div");
    actions.className = "card-actions";
    
    // The "Approve" button
    const approveBtn = document.createElement("button");
    approveBtn.className = "btn approve-btn";
    approveBtn.textContent = "✔️ Approve";
    
    // If already approved, disable it and change text
    if (data.status === 'approved') {
        approveBtn.disabled = true;
        approveBtn.textContent = "Approved";
    }

    approveBtn.onclick = async () => {
        approveBtn.disabled = true;
        approveBtn.textContent = "Learning...";
        const scanRef = doc(db, "scans", docId);
        
        // --- START OF LEARNING LOGIC ---
        try {
            await runTransaction(db, async (transaction) => {
                // 1. Mark the scan as approved
                transaction.update(scanRef, { status: "approved" });

                const brandName = data.diagnostics?.brandProfileUsed;
                const cropRect = data.diagnostics?.cropRect;

                // 2. Check if we have the necessary data to learn from
                if (brandName && cropRect) {
                    const profileQuery = query(collection(db, "brand_profiles"), where("brandName", "==", brandName));
                    const profileSnapshot = await getDocs(profileQuery);

                    if (!profileSnapshot.empty) {
                        const profileDoc = profileSnapshot.docs[0];
                        const profileRef = profileDoc.ref;
                        const currentData = profileDoc.data().learnedData || {};
                        const samples = currentData.dimensionSamples || [];

                        // 3. Add the new dimension as a sample
                        const newSample = { width: cropRect[2], height: cropRect[3] };
                        samples.push(newSample);

                        // 4. Keep only the last 20 samples to stay current
                        while (samples.length > 20) {
                            samples.shift();
                        }
                        
                        // 5. Update the brand profile with the new learned data
                        transaction.update(profileRef, { "learnedData.dimensionSamples": samples });
                        console.log(`Updated profile for ${brandName} with new dimensions.`);
                    }
                }
            });
        } catch (error) {
            console.error("Transaction failed: ", error);
            alert("Could not approve and learn from this scan. See console for details.");
            approveBtn.disabled = false;
            approveBtn.textContent = "✔️ Approve";
        }
        // --- END OF LEARNING LOGIC ---
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = async () => {
        if (confirm("Delete this scan?")) {
            await deleteDoc(doc(db, "scans", docId));
        }
    };
    
    actions.appendChild(deleteBtn);
    actions.appendChild(approveBtn); // Add the new button

    card.appendChild(body);
    card.appendChild(actions);

    return card;
}

// Listen for real-time updates from Firestore
onSnapshot(query(collection(db, "scans"), orderBy("ts", "desc"), limit(100)), (snapshot) => {
    scanGrid.innerHTML = ""; // Clear existing cards
    snapshot.forEach(doc => {
        scanGrid.appendChild(createCardElement(doc.id, doc.data()));
    });
    // Ensure select all checkbox is reset after re-render
    if (chkAll) chkAll.checked = false;
});

// Event listeners for batch actions
if (chkAll) {
    chkAll.addEventListener("change", () => {
        scanGrid.querySelectorAll(".pick").forEach(cb => cb.checked = chkAll.checked);
    });
}

btnDelSel.addEventListener("click", async () => {
  const pickedIds = [...document.querySelectorAll(".pick:checked")].map(cb => cb.dataset.id);
  if (!pickedIds.length) { alert("Nothing selected to delete."); return; }
  if (!confirm(`Delete ${pickedIds.length} item(s)?`)) return;

  const originalText = btnDelSel.textContent;
  btnDelSel.disabled = true;
  btnDelSel.textContent = `Deleting ${pickedIds.length}...`;

  try {
    const batch = writeBatch(db);
    pickedIds.forEach(id => batch.delete(doc(db, "scans", id)));
    await batch.commit();
  } catch (e) {
    console.error("Error deleting selected items:", e);
    alert("An error occurred. Please try again.");
  } finally {
    btnDelSel.disabled = false;
    btnDelSel.textContent = originalText;
  }
});

btnClearAll.addEventListener("click", async () => {
  if (!confirm("Delete ALL listed items? This cannot be undone.")) return;
  
  const originalText = btnClearAll.textContent;
  btnClearAll.disabled = true;
  btnClearAll.textContent = "Clearing...";

  try {
    const q = query(collection(db, "scans"), limit(100)); // Limit to avoid massive deletes
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (e) {
    console.error("Error clearing all items:", e);
    alert("An error occurred. Please try again.");
  } finally {
    btnClearAll.disabled = false;
    btnClearAll.textContent = originalText;
  }
});