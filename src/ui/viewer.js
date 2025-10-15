import { app } from "../core/firebase.js";
import {
  getFirestore, collection, query, where, orderBy, limit, onSnapshot,
  doc, deleteDoc, getDocs, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const db = getFirestore(app);
const scanGrid = document.getElementById("scan-grid");
const btnDelSel = document.getElementById("btnDelSel");
const btnClearAll = document.getElementById("btnClearAll");
const chkAll = document.getElementById("chkAll");
const SAFE_PLACEHOLDER_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="350" height="200"><rect width="100%" height="100%" fill="%231f2937"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20" fill="%239ca3af">No Image</text></svg>';

function formatTimestamp(ts) {
  if (!ts || !ts.seconds) return "";
  return new Date(ts.seconds * 1000).toLocaleString();
}

/**
 * Generates the list of clickable crop thumbnails for the Supervisor Hub.
 * It combines the main image and the suggestions from the Label Detector Specialist.
 */
function generateCropSelector(docId, data) {
    const crops = [];
    // The main crop rect used for the initial scan (used for default selection)
    const primaryCropRect = data.scanQuality?.cropRect || null;
    
    // 1. Primary/Original Scan: The image/crop that the scanner used first.
    crops.push({
        index: 0,
        label: "Primary Scan",
        src: data.thumb || SAFE_PLACEHOLDER_SVG, 
        rect: primaryCropRect
    });

    // 2. Suggested Crops (from trainingData)
    const suggestions = data.trainingData?.cropSuggestions || [];
    
    suggestions.forEach((suggestion) => {
        // Only include suggestions that have a thumbnail and are not duplicates
        const rectAttr = suggestion.rect ? suggestion.rect.join(',') : '';
        const isDuplicate = rectAttr === primaryCropRect?.join(',');
        
        if (suggestion.thumb && !isDuplicate) {
            crops.push({
                index: crops.length, // Ensure unique index
                label: suggestion.source || `Crop ${crops.length}`,
                src: suggestion.thumb,
                rect: suggestion.rect
            });
        }
    });

    const defaultRect = primaryCropRect;

    const cropHtml = crops.map(crop => {
        if (!crop.rect) return ''; 

        const rectAttr = crop.rect.join(','); 
        
        return `
            <img 
                src="${crop.src}" 
                class="crop-thumbnail crop-select-btn" 
                data-id="${docId}" 
                data-rect="${rectAttr}"
                data-index="${crop.index}"
                title="${crop.label}"
            />
        `;
    }).join('');

    return { 
        html: `<div class="crop-selector">${cropHtml}</div>`, 
        defaultRect 
    };
}


function createCardElement(docId, data) {
    const card = document.createElement("div");
    card.className = "scan-card";
    card.dataset.id = docId;
    if (data.status === 'approved') {
        card.classList.add('approved');
    }
    if (data.status === 'rejected') {
        card.classList.add('rejected');
    }

    // --- Local State for Supervisor Selection ---
    const { html: cropSelectorHtml, defaultRect: initialCropRect } = generateCropSelector(docId, data);
    let selectedCropRect = initialCropRect;

    // Use data.brand saved by the Live Scanner
    const brand = data.brand || 'Generic';
    if (brand) {
        const brandTag = document.createElement("div");
        brandTag.className = "card-brand-tag";
        brandTag.textContent = brand;
        card.appendChild(brandTag);
    }

    // New Image Section to hold the main image and crops
    const imageSection = document.createElement("div");
    imageSection.className = "card-image-section";
    
    const thumbnail = document.createElement("img");
    thumbnail.className = "card-thumbnail";
    thumbnail.src = data.thumb || SAFE_PLACEHOLDER_SVG; 
    imageSection.appendChild(thumbnail);
    
    // Use insertAdjacentHTML to preserve the thumbnail element
    imageSection.insertAdjacentHTML('beforeend', cropSelectorHtml);
    card.appendChild(imageSection);

    
    const body = document.createElement("div");
    body.className = "card-body";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "card-checkbox pick";
    chk.dataset.id = docId;
    card.appendChild(chk);

    const infoRow = document.createElement("div");
    infoRow.className = "card-info-row";
    infoRow.innerHTML = `
        <div class="model"><div class="label">Model</div><div class="value">${data.model || "N/A"}</div></div>
        <div class="ms" style="text-align: right;"><div class="label">MS#</div><div class="value">${data.ms || "N/A"}</div></div>`; // <-- FIXED: Was data.msNumber
    
    const customer = document.createElement("div");
    customer.className = "card-customer";
    customer.innerHTML = `<div class="label">Customer</div><div class="value">${data.customer || "N/A"}</div>`;

    const details = document.createElement("div");
    details.className = "card-details";
    const ocrConfidence = data.scanQuality?.confidence ?? 0;
    const smartCropStatus = data.scanQuality?.smartCropUsed ? "Cropped" : "Full";
    
    // Display Brand in details section for clarity
    details.innerHTML = `
        Brand: ${brand}<br>
        Time: ${formatTimestamp(data.timestamp)}<br>
        Summary: conf ${ocrConfidence}% · ${smartCropStatus}`;

    body.appendChild(infoRow);
    body.appendChild(customer);
    body.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    
    const approveBtn = document.createElement("button");
    approveBtn.className = "btn approve-btn";
    approveBtn.innerHTML = '<i data-lucide="check-circle"></i> <span>Approve</span>';
    
    const rejectBtn = document.createElement("button"); 
    rejectBtn.className = "btn reject-btn";
    rejectBtn.innerHTML = '<i data-lucide="x"></i> <span>Reject</span>';


    // Check if approved or rejected to disable the action buttons
    if (data.status === 'approved' || data.status === 'rejected') {
        approveBtn.disabled = true;
        rejectBtn.disabled = true;
        approveBtn.innerHTML = data.status === 'approved' ? '<span>Approved</span>' : '<span>Rejected</span>';
        rejectBtn.style.display = 'none'; // Hide reject if approved
        if (data.status === 'rejected') {
            approveBtn.style.display = 'none'; // Hide approve if rejected
        }
    }


    approveBtn.onclick = async () => {
        if (data.status === 'rejected') return;

        if (!selectedCropRect) {
             alert("Please select a valid crop (Pic1 or Pic2) before approving.");
             return;
        }

        approveBtn.disabled = true;
        approveBtn.textContent = "Learning...";
        const scanRef = doc(db, "scans", docId);
        
        try {
            await runTransaction(db, async (transaction) => {
                // 1. Mark scan as approved and save the chosen crop for future reference
                transaction.update(scanRef, { 
                    status: "approved",
                    "trainingData.approvedRect": selectedCropRect // Save the Supervisor's choice
                });
                
                // 2. Feed the chosen crop dimensions to the Dimension Specialist (Brand Profile)
                const brandName = data.brand;
                if (brandName) {
                    const profileQuery = query(collection(db, "brand_profiles"), where("brandName", "==", brandName));
                    const profileSnapshot = await getDocs(profileQuery);
                    if (!profileSnapshot.empty) {
                        const profileDoc = profileSnapshot.docs[0];
                        const profileRef = profileDoc.ref;
                        const currentData = profileDoc.data().learnedData || {};
                        const samples = currentData.dimensionSamples || [];
                        
                        // Use the selectedCropRect [x, y, w, h]
                        const newSample = { 
                            width: selectedCropRect[2], 
                            height: selectedCropRect[3] 
                        }; 
                        
                        samples.push(newSample);
                        while (samples.length > 20) {
                            samples.shift(); // Keep only the last 20 samples
                        }
                        transaction.update(profileRef, { "learnedData.dimensionSamples": samples });
                    }
                }
            });
        } catch (error) {
            console.error("Transaction failed: ", error);
            alert("Approval failed. See console for details.");
            approveBtn.disabled = false;
            approveBtn.innerHTML = '<i data-lucide="check-circle"></i> <span>Approve</span>';
        }
    };

    // REJECT button logic: Updates status to 'rejected' for negative feedback
    rejectBtn.onclick = async () => {
        if (!confirm("Reject this scan? It will be marked as a bad training sample and remove the ability to approve.")) {
            return;
        }

        rejectBtn.disabled = true;
        rejectBtn.innerHTML = '<span>Rejecting...</span>';
        const scanRef = doc(db, "scans", docId);

        try {
            // Log rejection (Negative Feedback)
            await runTransaction(db, async (transaction) => {
                transaction.update(scanRef, {
                    status: "rejected",
                    "trainingData.rejectedBySupervisor": true
                });
            });
        } catch (error) {
            console.error("Transaction failed: ", error);
            alert("Rejection failed. See console for details.");
            rejectBtn.disabled = false;
            rejectBtn.innerHTML = '<i data-lucide="x"></i> <span>Reject</span>';
        }
    };
    
    actions.appendChild(rejectBtn);
    actions.appendChild(approveBtn);

    card.appendChild(body);
    card.appendChild(actions);

    // --- Event Listener for Crop Selection ---
    card.addEventListener('click', (e) => {
        if (data.status === 'approved' || data.status === 'rejected') return;
        
        const btn = e.target.closest('.crop-select-btn');
        if (btn) {
            card.querySelectorAll('.crop-select-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            const rectArray = btn.dataset.rect.split(',').map(Number);
            selectedCropRect = rectArray;
        }
    });
    
    // Initial selection style (select the first one if present)
    const defaultCropBtn = card.querySelector('.crop-select-btn[data-index="0"]');
    if (defaultCropBtn) {
        defaultCropBtn.classList.add('selected');
        if (initialCropRect) {
            selectedCropRect = initialCropRect;
        }
    }


    lucide.createIcons({
        attrs: { 'stroke-width': 1.5 },
        nodes: card.querySelectorAll("[data-lucide]")
    });

    return card;
}

// Correctly order by the 'timestamp' field.
onSnapshot(query(collection(db, "scans"), orderBy("timestamp", "desc"), limit(100)), (snapshot) => {
    scanGrid.innerHTML = "";
    snapshot.forEach(doc => {
        scanGrid.appendChild(createCardElement(doc.id, doc.data()));
    });
    if (chkAll) chkAll.checked = false;
});

if (chkAll) {
    chkAll.addEventListener("change", () => {
        scanGrid.querySelectorAll(".pick").forEach(cb => cb.checked = chkAll.checked);
    });
}

btnDelSel.addEventListener("click", async () => {
    const pickedIds = [...document.querySelectorAll(".pick:checked")].map(cb => cb.dataset.id);
    if (!pickedIds.length || !confirm(`Delete ${pickedIds.length} item(s)?`)) return;

    btnDelSel.disabled = true;
    try {
        const batch = writeBatch(db);
        pickedIds.forEach(id => batch.delete(doc(db, "scans", id)));
        await batch.commit();
    } catch (e) {
        console.error("Error deleting selected items:", e);
    } finally {
        btnDelSel.disabled = false;
    }
});

btnClearAll.addEventListener("click", async () => {
    if (!confirm("Delete ALL listed items? This cannot be undone.")) return;

    btnClearAll.disabled = true;
    try {
        const q = query(collection(db, "scans"), limit(100));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    } catch (e) {
        console.error("Error clearing all items:", e);
    } finally {
        btnClearAll.disabled = false;
    }
});