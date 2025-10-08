// This file will hold functions shared between auto and manual scanners.
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { app } from "../core/firebase.js";

const db = getFirestore(app);

/**
 * Populates the brand selector buttons.
 * @param {HTMLElement} brandSelector - The div to put the buttons in.
 * @param {Function} uiLight - The function to update the HUD.
 * @param {Function} loadBrandProfile - A callback to the function that loads a profile.
 */
export async function populateBrandSelector(brandSelector, uiLight, loadBrandProfile) {
    uiLight("#f59e0b", "Loading brand profiles...");
    const profilesSnap = await getDocs(collection(db, "brand_profiles"));
    brandSelector.innerHTML = '';
    profilesSnap.forEach(doc => {
        const profile = doc.data();
        const btn = document.createElement("button");
        btn.className = "btn ghost";
        btn.textContent = profile.brandName;
        btn.onclick = () => {
            document.querySelectorAll('#brand-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadBrandProfile(doc.id);
        };
        brandSelector.appendChild(btn);
    });
    uiLight("#34d399", "Please select a brand to begin scanning.");
}

/**
 * Loads a specific brand's settings.
 * @param {string} brandId - The ID of the brand profile document in Firestore.
 * @param {Function} uiLight - The function to update the HUD.
 * @param {object} state - An object to hold the app's state (activeProfile, stagedScan).
 */
export async function loadBrandProfile(brandId, uiLight, state) {
    state.stagedScan = null; // Clear any previous staged scan
    state.activeProfile = null;
    uiLight("#f59e0b", `Loading ${brandId} profile...`);
    try {
        const profileDoc = await getDoc(doc(db, "brand_profiles", brandId));
        if (profileDoc.exists()) {
            state.activeProfile = profileDoc.data();
            uiLight("#34d399", `Ready to scan ${state.activeProfile.brandName}.`);
        } else { uiLight("#ef4444", `Error: Profile '${brandId}' not found.`); }
    } catch (e) { uiLight("#ef4444", "Error loading profile."); }
}