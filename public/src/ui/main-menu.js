import { app, auth } from "../core/firebase.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const db = getFirestore(app);
const brandGrid = document.getElementById('brandGrid');
const btnAuto = document.getElementById('btnAuto');
const btnManual = document.getElementById('btnManual');
const userEmailEl = document.getElementById('userEmail');

let selectedBrand = null;

async function loadBrands() {
    try {
        const querySnapshot = await getDocs(collection(db, "brand_profiles"));
        querySnapshot.forEach((doc) => {
            const brand = doc.data();
            const brandId = doc.id;
            const btn = document.createElement('button');
            btn.className = 'brand-btn';
            btn.textContent = brand.brandName || brandId;
            btn.dataset.brandId = brandId;

            btn.addEventListener('click', () => {
                if (btn.classList.contains('selected')) {
                    btn.classList.remove('selected');
                    selectedBrand = null;
                    btnAuto.disabled = true;
                } else {
                    document.querySelectorAll('.brand-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    selectedBrand = brandId;
                    btnAuto.disabled = false;
                }
            });
            brandGrid.appendChild(btn);
        });
    } catch (error) {
        console.error("Error loading brands:", error);
        brandGrid.innerHTML = '<p>Could not load brands.</p>';
    }
}

function launchScanner(mode) {
    let url = '/scanner.html';
    if (mode === 'auto') {
        if (selectedBrand) {
            window.location.href = `${url}?brand=${selectedBrand}&mode=auto`;
        } else {
            alert("Please select a brand for Auto Scan!");
        }
    } else if (mode === 'manual') {
        if (selectedBrand) {
            window.location.href = `${url}?brand=${selectedBrand}&mode=manual`;
        } else {
            window.location.href = `${url}?mode=manual`;
        }
    }
}

function displayUser() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userEmailEl.textContent = `Logged in as: ${user.email}`;
        } else {
            userEmailEl.textContent = "Not logged in";
            window.location.href = '/index.html';
        }
    });
}

// --- Event Listeners and Initial Calls ---
btnAuto.addEventListener('click', () => launchScanner('auto'));
btnManual.addEventListener('click', () => launchScanner('manual'));

loadBrands();
displayUser();