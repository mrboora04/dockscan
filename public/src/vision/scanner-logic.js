// src/vision/scanner-logic.js
// This is the Specialist Coordinator. It handles the image pipeline and V2 data mapping.

import { runLabelDetector } from "./specialists/label-detector.js";
import { extractInfoFromRegions } from "./specialists/info-extractor.js";
import { extractMs, extractCustomer, extractModel } from "../extractors.js";
import { runConditionSpecialist } from "./specialists/condition-specialist.js"; // <--- CONDITION SPECIALIST INTEGRATION

// Constants for thumbnail generation
const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_QUALITY = 0.6;
const MIN_DIMENSION = 1; // Minimum width/height to avoid division by zero

// Helper to get rect array [x,y,w,h] from crop canvas size
function getCropRectArray(canvas) { return [0, 0, canvas.width, canvas.height]; }

/**
 * Generate a thumbnail from a source canvas and rect
 * @param {HTMLCanvasElement} sourceCanvas - The source canvas
 * @param {Array<number>} rect - [x, y, w, h] array
 * @returns {string} Data URL of the thumbnail
 */
function generateThumbnail(sourceCanvas, rect) {
    const [x, y, w, h] = rect;
    
    // Safety check: ensure valid dimensions
    if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
        console.warn('Invalid rect dimensions for thumbnail generation:', rect);
        return '';
    }
    
    const c = document.createElement('canvas');
    const scale = THUMBNAIL_WIDTH / w;
    
    c.width = THUMBNAIL_WIDTH;
    c.height = Math.max(MIN_DIMENSION, h * scale);

    const ctx = c.getContext('2d');
    
    try {
        ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', THUMBNAIL_QUALITY); 
    } catch(e) {
        // This catch block handles the persistent security error you were hitting.
        console.error("Thumbnail generation failed due to drawing issue:", e);
        return ''; 
    }
}

/**
 * Executes a full scan analysis in the Live Mode.
 * @param {HTMLCanvasElement} canvas - The cropped image captured from the camera.
 * @param {object} activeProfile - The brand profile data.
 * @param {object} ocrWorker - The active Tesseract worker instance.
 * @param {number} motion - The calculated motion value.
 * @returns {Promise<object>} The full scan result adhering to the V2 Firestore schema.
 */
export async function runScanAnalysis(canvas, activeProfile, ocrWorker, motion) {
    // FIX: Ensure the primary thumbnail is generated immediately and safely.
    const originalThumb = generateThumbnail(canvas, getCropRectArray(canvas)); 
    
    const brandName = activeProfile?.brandName || 'Generic';

    // Step 0: Run Condition Specialist (for metrics and guidance)
    const { diagnostics: conditionDiagnostics } = runConditionSpecialist(canvas, motion);
    const motionValue = conditionDiagnostics.motion; 

    // Step 1: Run Label Detector Specialist 
    // CRITICAL FIX: Pass the Canvas directly (NOT the Blob)
    const { primaryRect, det, cropSuggestions } = await runLabelDetector(canvas, activeProfile); 
    
    // Fallback: If no label was found, use the full canvas as the primary rect (Live Mode)
    const rectToUse = primaryRect || { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const rectArrayToUse = [rectToUse.x, rectToUse.y, rectToUse.width, rectToUse.height];

    // Step 2: Crop image to primary ROI
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = rectToUse.width;
    labelCanvas.height = rectToUse.height;
    const ctx = labelCanvas.getContext('2d');
    ctx.drawImage(canvas, rectToUse.x, rectToUse.y, rectToUse.width, rectToUse.height, 0, 0, labelCanvas.width, labelCanvas.height);

    // --- Core Extraction ---
    const { data: ocrData } = await ocrWorker.recognize(labelCanvas);
    const ocrConfidence = Math.round(ocrData.confidence);
    
    // B. Targeted Extraction via Info Extractor Specialist
    let targetedFields = {};
    try {
        targetedFields = await extractInfoFromRegions(labelCanvas, activeProfile, ocrWorker);
    } catch (e) {
        console.warn("Info Extractor (Zone OCR) failed:", e);
    }
    
    // C. Combine Results
    const msFallback = extractMs(ocrData, activeProfile);
    const modelFallback = extractModel(ocrData, activeProfile);
    const customerFallback = extractCustomer(ocrData, activeProfile);

    const ms = targetedFields.ms || msFallback;
    const model = targetedFields.model || modelFallback;
    const customer = targetedFields.customer || customerFallback;

    // Step 4: Map result to V2 Schema (Critical step for Training Hub)
    
    // CRITICAL FIX: Generate thumbnails for ALL suggestions from the Label Detector
    const finalizedCropSuggestions = cropSuggestions.map(s => ({
        rect: s.rect,
        thumb: generateThumbnail(canvas, s.rect), // Use the SAFE generator here
        source: s.source || 'unknown'
    }));

    // Add the original full-frame image as the last suggestion for manual review fallback
    finalizedCropSuggestions.push({ 
        rect: getCropRectArray(canvas), 
        thumb: originalThumb, 
        source: 'full_frame' 
    });

    return {
        ms: ms || "", 
        model: model || "", 
        customer: customer || "",
        brand: brandName,
        raw: ocrData.text || "No OCR text.",
        thumb: originalThumb, // The main thumbnail is the safely generated one

        scanQuality: { // V2 Schema: Diagnostics
            confidence: ocrConfidence,
            cropRect: rectArrayToUse,
            smartCropUsed: !!primaryRect,
            barcodeRaw: det?.raw || '',
            // Add Condition Specialist metrics
            ...conditionDiagnostics 
        },
        trainingData: { // V2 Schema: Supervisor Training Hub data
            cropSuggestions: finalizedCropSuggestions
        }
    };
}