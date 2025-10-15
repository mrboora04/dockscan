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

function formatTimestamp(ts) {
  if (!ts || !ts.seconds) return "";
  return new Date(ts.seconds * 1000).toLocaleString();
}

function createCardElement(docId, data) {
    const card = document.createElement("div");
    card.className = "scan-card";
    card.dataset.id = docId;
    if (data.status === 'approved') {
        card.classList.add('approved');
    }

    const brand = data.brand;
    if (brand) {
        const brandTag = document.createElement("div");
        brandTag.className = "card-brand-tag";
        brandTag.textContent = brand;
        card.appendChild(brandTag);
    }

    const thumbnail = document.createElement("img");
    thumbnail.className = "card-thumbnail";
    thumbnail.src = data.thumbnail || 'https://via.placeholder.com/350x200?text=No+Image';
    card.appendChild(thumbnail);
    
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
        <div class="ms" style="text-align: right;"><div class="label">MS#</div><div class="value">${data.msNumber || "N/A"}</div></div>`;

    const customer = document.createElement("div");
    customer.className = "card-customer";
    customer.innerHTML = `<div class="label">Customer</div><div class="value">${data.customer || "N/A"}</div>`;

    const details = document.createElement("div");
    details.className = "card-details";
    const ocrConfidence = data.scanQuality?.confidence ?? 0;
    const smartCropStatus = data.scanQuality?.smartCropUsed ? "Cropped" : "Full";
    details.innerHTML = `Time: ${formatTimestamp(data.timestamp)}<br>Summary: conf ${ocrConfidence}% · ${smartCropStatus}`;

    body.appendChild(infoRow);
    body.appendChild(customer);
    body.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    
    const approveBtn = document.createElement("button");
    approveBtn.className = "btn approve-btn";
    approveBtn.innerHTML = '<i data-lucide="check-circle"></i> <span>Approve</span>';
    
    if (data.status === 'approved') {
        approveBtn.disabled = true;
        approveBtn.innerHTML = '<span>Approved</span>';
    }

    approveBtn.onclick = async () => {
        approveBtn.disabled = true;
        approveBtn.textContent = "Learning...";
        const scanRef = doc(db, "scans", docId);
        
        try {
            await runTransaction(db, async (transaction) => {
                transaction.update(scanRef, { status: "approved" });
                const brandName = data.brand;
                const cropRect = data.scanQuality?.cropRect;
                if (brandName && cropRect) {
                    const profileQuery = query(collection(db, "brand_profiles"), where("brandName", "==", brandName));
                    const profileSnapshot = await getDocs(profileQuery);
                    if (!profileSnapshot.empty) {
                        const profileDoc = profileSnapshot.docs[0];
                        const profileRef = profileDoc.ref;
                        const currentData = profileDoc.data().learnedData || {};
                        const samples = currentData.dimensionSamples || [];
                        const newSample = { width: cropRect[2], height: cropRect[3] };
                        samples.push(newSample);
                        while (samples.length > 20) {
                            samples.shift();
                        }
                        transaction.update(profileRef, { "learnedData.dimensionSamples": samples });
                    }
                }
            });
        } catch (error) {
            console.error("Transaction failed: ", error);
            approveBtn.disabled = false;
            approveBtn.innerHTML = '<i data-lucide="check-circle"></i> <span>Approve</span>';
        }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.innerHTML = '<i data-lucide="trash"></i>';
    deleteBtn.onclick = async () => {
        if (confirm("Delete this scan?")) {
            await deleteDoc(doc(db, "scans", docId));
        }
    };
    
    actions.appendChild(deleteBtn);
    actions.appendChild(approveBtn);

    card.appendChild(body);
    card.appendChild(actions);
    
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