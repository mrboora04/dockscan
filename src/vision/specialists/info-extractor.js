// src/vision/specialists/info-extractor.js

/**
 * This specialist extracts specific pieces of information by running OCR
 * on predefined regions of a label, rather than the whole thing.
 */

/**
 * Crops a canvas to a specified region.
 * @param {HTMLCanvasElement} sourceCanvas The canvas to crop from.
 * @param {object} region - The region to crop, with { x, y, width, height } in pixels.
 * @returns {HTMLCanvasElement} A new canvas containing just the cropped region.
 */
function cropCanvas(sourceCanvas, region) {
    const c = document.createElement('canvas');
    c.width = region.width;
    c.height = region.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(sourceCanvas, region.x, region.y, region.width, region.height, 0, 0, c.width, c.height);
    return c;
}

/**
 * Extracts text by running OCR on targeted sub-regions of a canvas.
 * @param {HTMLCanvasElement} labelCanvas The cropped canvas containing just the label.
 * @param {object} activeProfile The brand profile, which will eventually contain region data.
 * @param {Tesseract.Worker} ocrWorker The Tesseract worker instance.
 * @returns {Promise<object>} An object with the extracted data, e.g., { model, customer }.
 */
export async function extractInfoFromRegions(labelCanvas, activeProfile, ocrWorker) {
    const W = labelCanvas.width;
    const H = labelCanvas.height;
    const extractedData = {};

    // --- Hardcoded Regions (Proof of Concept) ---
    // In the future, this will come from activeProfile.
    // Coordinates are relative (0.0 to 1.0).
    const regionsToScan = {
        model:    { x: 0.05, y: 0.05, width: 0.90, height: 0.40 }, // Top 40%
        customer: { x: 0.40, y: 0.40, width: 0.55, height: 0.55 }, // Bottom-right quadrant
    };
    // ---

    for (const key in regionsToScan) {
        const region = regionsToScan[key];
        // Convert relative coordinates to absolute pixels
        const pixelRegion = {
            x: Math.floor(region.x * W),
            y: Math.floor(region.y * H),
            width: Math.floor(region.width * W),
            height: Math.floor(region.height * H)
        };

        // Ensure region is valid
        if (pixelRegion.width < 10 || pixelRegion.height < 10) continue;

        const regionCanvas = cropCanvas(labelCanvas, pixelRegion);
        const { data: { text } } = await ocrWorker.recognize(regionCanvas);

        // Simple cleanup of the result
        const cleanText = text.replace(/\s+/g, ' ').trim();
        if (cleanText) {
            extractedData[key] = cleanText;
        }
    }

    return extractedData;
}