// src/vision/image-processor.js

/**
 * Takes the pre-processed (black & white) image data and analyzes it to provide guidance.
 * It checks for motion and, most importantly, if the text is large enough to be read.
 * @param {ImageData} imageData - The black and white image data.
 * @param {number} motion - The calculated motion value.
 * @returns {{color: string, text: string, qualityOK: boolean}}
 */
function getSmartGuidance(imageData, motion) {
  if (motion > 0.08) {
    return { color: "#ef4444", text: "Hold Steady", qualityOK: false };
  }

  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  let maxContourHeight = 0;
  const visited = new Uint8Array(data.length / 4);

  // Simple contour detection to find the height of the largest character
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x);
      if (data[i * 4] === 0 && !visited[i]) { // Find a black pixel that hasn't been visited
        let minY = y, maxY = y;
        const stack = [[x, y]];
        visited[i] = 1;
        let pixelCount = 0;

        while (stack.length > 0) {
          const [cx, cy] = stack.pop();
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
          pixelCount++;

          // Check neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const ni = (ny * width + nx);
                if (data[ni * 4] === 0 && !visited[ni]) {
                  visited[ni] = 1;
                  stack.push([nx, ny]);
                }
              }
            }
          }
        }
        if (pixelCount > 10) { // Filter out tiny noise specks
          maxContourHeight = Math.max(maxContourHeight, maxY - minY);
        }
      }
    }
  }

  // A character needs to be at least ~20px tall for reliable OCR
  const MIN_TEXT_HEIGHT = 20;

  if (maxContourHeight < MIN_TEXT_HEIGHT) {
    return { color: "#ef4444", text: "Move Closer", qualityOK: false };
  }

  return { color: "#22c55e", text: "Ready to Capture", qualityOK: true };
}


/**
 * Takes a canvas, resizes it for performance, and pre-processes it for OCR.
 * Also returns the new smart guidance based on the processed image.
 * @param {HTMLCanvasElement} canvas The source canvas.
 * @param {number} motion The calculated motion value.
 * @returns {{processedCanvas: HTMLCanvasElement, guidance: object}}
 */
export function processImageForScanning(canvas, motion) {
  const MAX_WIDTH = 1000;
  const scale = canvas.width > MAX_WIDTH ? MAX_WIDTH / canvas.width : 1;

  const newCanvas = document.createElement('canvas');
  newCanvas.width = canvas.width * scale;
  newCanvas.height = canvas.height * scale;
  const ctx = newCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);

  const imageData = ctx.getImageData(0, 0, newCanvas.width, newCanvas.height);
  const data = imageData.data;
  
  // Grayscale and Binarize (simplified for speed)
  const threshold = 128; // A simple threshold is fine after resizing and for guidance
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const color = avg > threshold ? 255 : 0;
    data[i] = data[i+1] = data[i+2] = color;
  }
  ctx.putImageData(imageData, 0, 0);
  
  const guidance = getSmartGuidance(imageData, motion);

  return { processedCanvas: newCanvas, guidance };
}