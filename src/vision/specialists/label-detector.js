// src/vision/specialists/label-detector.js

import { detectBarcode, expandAroundBarcode } from '../../barcode.js';
// NEW IMPORT: Dimension Specialist
import { calculateLearnedDimension, generateLearnedRect } from './dimension-specialist.js'; 

const ANALYSIS_W = 480; // Downscale for speed

/**
 * Finds the most "label-like" bright rectangle in an image using connected components.
 * @param {Blob | File} imageBlob - The image to analyze.
 * @returns {Promise<{x: number, y: number, width: number, height: number}|null>} A crop rectangle in ORIGINAL pixels.
 */
async function findLabelRect(imageBlob) {
    const bmp = await createImageBitmap(imageBlob);
    const scale = ANALYSIS_W / bmp.width;
    const H = Math.round(bmp.height * scale);

    const c = new OffscreenCanvas(ANALYSIS_W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, ANALYSIS_W, H);

    const im = g.getImageData(0, 0, ANALYSIS_W, H);
    const data = im.data;

    // Threshold to "white-ish"
    const white = new Uint8Array(ANALYSIS_W * H);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const y = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        white[p] = y > 200 ? 1 : 0;
    }

    // Connected components analysis to find blobs
    const seen = new Uint8Array(white.length);
    const blobs = [];
    const W = ANALYSIS_W;
    for (let p = 0; p < white.length; p++) {
        if (!white[p] || seen[p]) continue;
        const stack = [p];
        seen[p] = 1;
        let minX = W, minY = H, maxX = 0, maxY = 0, area = 0;

        while (stack.length) {
            const q = stack.pop();
            const x = q % W, y = (q / W) | 0;
            area++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            const n = [q-1, q+1, q-W, q-W-1, q-W+1, q+W, q+W-1, q+W+1]; // 8-way connectivity
            for (const t of n) {
                if (t >= 0 && t < white.length && !seen[t] && white[t]) {
                    seen[t] = 1;
                    stack.push(t);
                }
            }
        }
        const w = maxX - minX + 1, h = maxY - minY + 1;
        if (area < 500) continue;
        const ar = w / h;
        if (ar < 0.2 || ar > 7.0) continue;

        let dark = 0;
        for (let yy = minY; yy <= maxY; yy++) {
            for (let xx = minX; xx <= maxX; xx++) {
                const i = (yy * W + xx) * 4;
                const Y = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                if (Y < 150) dark++;
            }
        }
        const density = dark / (w * h);
        if (density < 0.05 || density > 0.8) continue;

        const score = area * density;
        blobs.push({ minX, minY, w, h, score, maxX, maxY });
    }

    if (!blobs.length) return null;
    blobs.sort((a,b) => b.score - a.score);
    const b = blobs[0];

    const padX = Math.round(b.w * 0.05);
    const padY = Math.round(b.h * 0.05);
    const x = Math.max(0, (b.minX - padX) / scale);
    const y = Math.max(0, (b.minY - padY) / scale);
    const width  = Math.min(bmp.width  - x, (b.w + 2*padX) / scale);
    const height = Math.min(bmp.height - y, (b.h + 2*padY) / scale);

    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}


/**
 * The Label Detector Specialist (External Interface)
 * Primary goal: Find the most promising Regions of Interest (ROI) for OCR.
 *
 * @param {File} file - The image file object.
 * @param {object | null} activeProfile - The brand profile (used for learned data). // UPDATED SIGNATURE
 * @returns {Promise<{
 * primaryRect: {x, y, width, height}, // The best single guess ROI
 * det: object,                       // Raw barcode detection data
 * cropSuggestions: Array<{
 * rect: [number, number, number, number], // [x, y, w, h] array
 * thumb: string                           // Data URL thumbnail (null for now)
 * }>
 * }>}
 */
export async function runLabelDetector(file, activeProfile = null) { // UPDATED SIGNATURE
    
    const bmp = await createImageBitmap(file);
    const imageSize = { width: bmp.width, height: bmp.height };
    
    // --- 1. LEARNING PRIORITY: Check for Learned Dimensions ---
    const samples = activeProfile?.learnedData?.dimensionSamples || [];
    const learnedDim = calculateLearnedDimension(samples);
    let learnedRect = null;
    
    if (learnedDim.ready) {
        learnedRect = generateLearnedRect(imageSize.width, imageSize.height, learnedDim);
        // If learning is ready, this becomes the highest priority crop.
        console.log(`[Dimension Specialist] Using learned rect: ${learnedRect.width}x${learnedRect.height}`);
    }

    // --- 2. HEURISTIC PRIORITY: Barcode Detection ---
    const det = await detectBarcode(file);
    let barcodeRect = null;
    if (det?.bbox && det?.imageSize) {
        barcodeRect = expandAroundBarcode(det.bbox, det.imageSize.width, det.imageSize.height);
    }

    // --- 3. HEURISTIC PRIORITY: Connected Components Detection ---
    const connectedRect = await findLabelRect(file);

    // --- 4. Determine Primary ROI (Learned > Barcode > Connected) ---
    const primaryRect = learnedRect || barcodeRect || connectedRect || null;
    
    // Convert to array format for storage and comparison
    const primaryRectArray = primaryRect ? [primaryRect.x, primaryRect.y, primaryRect.width, primaryRect.height] : null;


    // --- 5. Generate Crop Suggestions for the Supervisor (For training) ---
    const cropSuggestions = [];
    
    // Suggestion 1: Learned Rect (Highest Priority)
    if (learnedRect) {
        cropSuggestions.push({
            rect: [learnedRect.x, learnedRect.y, learnedRect.width, learnedRect.height],
            thumb: null, 
            source: 'learned'
        });
    }

    // Suggestion 2: Barcode-Anchored Crop
    if (barcodeRect) {
        const rectArray = [barcodeRect.x, barcodeRect.y, barcodeRect.width, barcodeRect.height];
        const isDuplicate = cropSuggestions.some(s => s.rect.join(',') === rectArray.join(','));
        if (!isDuplicate) {
            cropSuggestions.push({
                rect: rectArray,
                thumb: null,
                source: 'barcode'
            });
        }
    }

    // Suggestion 3: Connected-Components Crop
    if (connectedRect) {
        const rectArray = [connectedRect.x, connectedRect.y, connectedRect.width, connectedRect.height];
        const isDuplicate = cropSuggestions.some(s => s.rect.join(',') === rectArray.join(','));
        
        if (!isDuplicate) {
            cropSuggestions.push({
                rect: rectArray,
                thumb: null,
                source: 'connected'
            });
        }
    }
    
    // 6. Cleanup the primaryRect
    if (!primaryRect && cropSuggestions.length > 0) {
        const [x, y, w, h] = cropSuggestions[0].rect;
        // Re-assign primaryRect if a suggestion was found but primary was null
        primaryRect = { x, y, width: w, height: h }; 
    }
    
    return {
        primaryRect,
        det,
        cropSuggestions
    };
}