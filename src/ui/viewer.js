// src/ui/viewer.js
import { app } from "../core/firebase.js";
import {
  getFirestore, collection, query, orderBy, limit, onSnapshot,
  doc, updateDoc, deleteDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const db        = getFirestore(app);
const rows      = document.getElementById("rows");
const chkAll    = document.getElementById("chkAll");
const btnDelSel = document.getElementById("btnDelSel");
const btnClearAll = document.getElementById("btnClearAll");

// A more standard time format
function fmtTs(ts) {
  try {
    return new Date((ts?.seconds || ts?._seconds) * 1000).toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return ""
  }
}

// Function to create a table row element
function createRowElement(id, data) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="checkbox" class="pick" data-id="${id}"></td>
    <td>${fmtTs(data.ts) || ""}</td>
    <td contenteditable data-k="ms">${data.ms || ""}</td>
    <td contenteditable data-k="model">${data.model || ""}</td>
    <td contenteditable data-k="customer">${data.customer || ""}</td>
    <td>${data.status || ""}</td>
    <td>${data.thumb ? `<img src="${data.thumb}" class="thumb">` : ""}</td>
    <td>${data.conf != null ? `conf ${data.conf}% · motion ${data.motion||0}` : ""}</td>
    <td><code class="raw-text">${(data.raw || "").replace(/</g, "&lt;")}</code></td>
    <td>
      <button class="saveBtn btn ghost">Save</button>
      <button class="delBtn btn ghost">Delete</button>
    </td>
  `;

  // Save button logic
  const saveBtn = tr.querySelector(".saveBtn");
  saveBtn.onclick = async () => {
    const payload = {};
    tr.querySelectorAll("[data-k]").forEach(td => payload[td.dataset.k] = td.textContent.trim());
    
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;
    await updateDoc(doc(db, "scans", id), payload);
    saveBtn.textContent = "Saved!";
    setTimeout(() => {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }, 1200);
  };

  // Inline delete button logic
  tr.querySelector(".delBtn").onclick = async () => {
    if (confirm("Delete this row?")) {
      await deleteDoc(doc(db, "scans", id));
    }
  };

  return tr;
}

// Listen for real-time updates from Firestore
onSnapshot(query(collection(db, "scans"), orderBy("ts", "desc"), limit(200)), (snapshot) => {
  rows.innerHTML = ""; // Clear existing rows
  snapshot.forEach(doc => {
    rows.appendChild(createRowElement(doc.id, doc.data()));
  });
  chkAll.checked = false; // Uncheck "select all" after re-render
});

// "Select All" checkbox logic
chkAll.addEventListener("change", () => {
  rows.querySelectorAll(".pick").forEach(cb => cb.checked = chkAll.checked);
});

// "Delete Selected" button logic
btnDelSel.addEventListener("click", async () => {
  const pickedIds = [...rows.querySelectorAll(".pick:checked")].map(cb => cb.dataset.id);
  if (!pickedIds.length) return alert("Nothing selected.");
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

// "Clear All" button logic
btnClearAll.addEventListener("click", async () => {
  if (!confirm("Delete EVERYTHING currently listed? This cannot be undone.")) return;

  const originalText = btnClearAll.textContent;
  btnClearAll.disabled = true;
  btnClearAll.textContent = "Clearing...";

  try {
    const q = query(collection(db, "scans"), limit(200)); // No need to order for deletion
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