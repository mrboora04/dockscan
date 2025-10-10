// src/vision/scanner-logic.js

import { findLabelRect } from "./specialists/label-detector.js";
// NEW: Import our new specialist
import { extractInfoFromRegions } from "./specialists/info-extractor.js";
import { extractMs, extractCustomer, extractModel } from "./extractors.js"; // We still need these for fallback/MS#
import { processImageForScanning } from "./image-processor.js";

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export async function runScanAnalysis(canvas, activeProfile, ocrWorker, motion) {
    const analysisBlob = await canvasToBlob(canvas);
    const smartRect = await findLabelRect(analysisBlob);

    if (!smartRect) {
        console.log("Label detector failed to find a label.");
        return null; // If we can't find the label, we can't proceed.
    }

    // Create a new canvas cropped precisely to the found label
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = smartRect.width;
    labelCanvas.height = smartRect.height;
    const ctx = labelCanvas.getContext('2d');
    ctx.drawImage(canvas, smartRect.x, smartRect.y, smartRect.width, smartRect.height, 0, 0, labelCanvas.width, labelCanvas.height);

    // --- DELEGATE TO THE NEW SPECIALIST ---
    const extractedRegionData = await extractInfoFromRegions(labelCanvas, activeProfile, ocrWorker);
    console.log("Data from regions:", extractedRegionData);
    // ---

    // We still need to run a general MS# search for now, as it can appear anywhere
    // In the future, MS# could also be a defined region.
    const { data: ocrData } = await ocrWorker.recognize(labelCanvas);
    const ms = extractMs(ocrData, activeProfile);
    
    // Combine results: prioritize specialist data, then use old extractors as fallback
    const model = extractedRegionData.model || extractModel(ocrData, activeProfile);
    const customer = extractedRegionData.customer || extractCustomer(ocrData, activeProfile);

    const diagnostics = {
        brandProfileUsed: activeProfile.brandName,
        foundMs: !!ms, foundModel: !!model, foundCustomer: !!customer,
        msSource: 'ocr',
        ocrConfidence: ocrData.confidence, // This confidence is for the whole label scan
        motion: +motion.toFixed(3),
        smartCropUsed: !!smartRect,
        cropRect: smartRect ? [smartRect.x, smartRect.y, smartRect.width, smartRect.height] : null,
    };
    
    if (ms || model) {
        return {
            ms, model, customer,
            raw: ocrData.text,
            thumb: canvas.toDataURL("image/jpeg", 0.7),
            diagnostics
        };
    }

    return null;
}