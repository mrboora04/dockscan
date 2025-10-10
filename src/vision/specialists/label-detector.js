// src/vision/specialists/label-detector.js

// This is our first "specialist". Its job is to find the primary label in an image.

const ANALYSIS_W = 480; // Downscale for speed

/**
 * Finds the most "label-like" bright rectangle in an image.
 * @param {Blob | File} imageBlob - The image to analyze.
 * @returns {Promise<{x: number, y: number, width: number, height: number}|null>} A crop rectangle in ORIGINAL pixels.
 */
export async function findLabelRect(imageBlob) {
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
    // Basic filtering for label-like shapes
    if (area < 500) continue;
    const ar = w / h;
    if (ar < 0.2 || ar > 7.0) continue;

    // Ink density check: count dark pixels within the blob's bounding box
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
    blobs.push({ minX, minY, w, h, score });
  }

  if (!blobs.length) return null;
  blobs.sort((a,b) => b.score - a.score);
  const b = blobs[0];

  // Expand the best blob slightly and map it back to original image coordinates
  const padX = Math.round(b.w * 0.05);
  const padY = Math.round(b.h * 0.05);
  const x = Math.max(0, (b.minX - padX) / scale);
  const y = Math.max(0, (b.minY - padY) / scale);
  const width  = Math.min(bmp.width  - x, (b.w + 2*padX) / scale);
  const height = Math.min(bmp.height - y, (b.h + 2*padY) / scale);

  // This is where the "Dimension Specialist" would hook in.
  // We could record these dimensions (width, height) and associate them with the active brand profile.

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}