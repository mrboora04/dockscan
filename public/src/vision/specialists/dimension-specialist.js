// src/vision/specialists/dimension-specialist.js

/**
 * The Dimension Specialist is responsible for calculating statistically
 * reliable label dimensions (w, h) based on supervisor-approved samples.
 */

const MIN_SAMPLES = 5; // Minimum samples required to generate a reliable prediction

/**
 * Calculates a predicted, statistically reliable label dimension and offset.
 *
 * @param {Array<{width: number, height: number}>} samples - The list of approved crop dimensions.
 * @returns {{avgW: number, avgH: number, ready: boolean}|null} The calculated average dimensions.
 */
export function calculateLearnedDimension(samples) {
    if (!samples || samples.length < MIN_SAMPLES) {
        return { ready: false };
    }

    const w = samples.map(s => s.width);
    const h = samples.map(s => s.height);

    // Simple arithmetic mean (average) for width and height
    const sumW = w.reduce((acc, val) => acc + val, 0);
    const sumH = h.reduce((acc, val) => acc + val, 0);

    const avgW = sumW / samples.length;
    const avgH = sumH / samples.length;
    
    // We can add more advanced statistical checks (e.g., standard deviation filter) later.
    // For now, simple average is sufficient to start the learning loop.

    return {
        avgW: Math.round(avgW),
        avgH: Math.round(avgH),
        ready: true
    };
}

/**
 * Generates an ideal center-anchored bounding box using learned dimensions.
 * NOTE: This assumes the center of the image is the center of the label, 
 * which is a decent starting assumption for a scanner with a fixed crosshair.
 * * @param {number} imageW - The width of the full source image.
 * @param {number} imageH - The height of the full source image.
 * @param {{avgW: number, avgH: number}} learnedDim - The output of calculateLearnedDimension.
 * @returns {{x: number, y: number, width: number, height: number}} The predicted crop rect.
 */
export function generateLearnedRect(imageW, imageH, learnedDim) {
    const { avgW, avgH } = learnedDim;

    // Center the learned box on the image center
    let x = Math.round((imageW / 2) - (avgW / 2));
    let y = Math.round((imageH / 2) - (avgH / 2));

    // Clamp to boundaries
    x = Math.max(0, x);
    y = Math.max(0, y);
    let w = Math.min(avgW, imageW - x);
    let h = Math.min(avgH, imageH - y);
    
    // Final safety clamp for minimal size
    const MIN = 32;
    w = Math.max(MIN, w);
    h = Math.max(MIN, h);

    return { x, y, width: w, height: h };
}