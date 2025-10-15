import { findLabelRect } from "./specialists/label-detector.js";
import { extractInfoFromRegions } from "./specialists/info-extractor.js";
import { extractMs, extractCustomer, extractModel } from "./extractors.js";

// A helper function to convert the canvas to a format our specialist can use
function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export async function runScanAnalysis(canvas, activeProfile, ocrWorker, motion) {
    // Step 1: Call the Label Detector Specialist
    const analysisBlob = await canvasToBlob(canvas);
    const smartRect = await findLabelRect(analysisBlob);

    // --- THIS IS THE KEY CHANGE ---
    // If the specialist fails, we DON'T give up. We create a "failure" record.
    if (!smartRect) {
        console.log("Label detector failed. Saving full image for review.");
        // We still create a result, but with no cropped data and a full-frame thumbnail.
        return {
            ms: "", model: "", customer: "", raw: "No label found.",
            thumb: canvas.toDataURL("image/jpeg", 0.7), // Use the original, full canvas
            diagnostics: {
                brandProfileUsed: activeProfile?.brandName || 'Generic',
                motion: +motion.toFixed(3),
                smartCropUsed: false, // Explicitly mark that the crop failed
                cropRect: null,
                ocrConfidence: 0
            }
        };
    }

    // --- This part of the code now only runs if a label WAS found ---
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = smartRect.width;
    labelCanvas.height = smartRect.height;
    const ctx = labelCanvas.getContext('2d');
    ctx.drawImage(canvas, smartRect.x, smartRect.y, smartRect.width, smartRect.height, 0, 0, labelCanvas.width, labelCanvas.height);

    const { data: ocrData } = await ocrWorker.recognize(labelCanvas);
    const ms = extractMs(ocrData, activeProfile);
    const model = extractModel(ocrData, activeProfile);
    const customer = extractCustomer(ocrData, activeProfile);

    const diagnostics = {
        brandProfileUsed: activeProfile?.brandName || 'Generic',
        foundMs: !!ms, foundModel: !!model, foundCustomer: !!customer,
        ocrConfidence: ocrData.confidence,
        motion: +motion.toFixed(3),
        smartCropUsed: true,
        cropRect: [smartRect.x, smartRect.y, smartRect.width, smartRect.height],
    };

    return {
        ms: ms || "", model: model || "", customer: customer || "",
        raw: ocrData.text,
        thumb: labelCanvas.toDataURL("image/jpeg", 0.7), // The successful cropped thumbnail
        diagnostics
    };
}