// src/vision/extractors.js

export function norm(t = "") {
  return t.replace(/\r/g, "").replace(/[^\x20-\x7E\n]/g, "").replace(/[OQ]/g, "0").replace(/[IL]/g, "1").toUpperCase();
}

/**
 * Finds a value geometrically related to a key word's location.
 * @param {object} ocrData - The full data object from Tesseract.js.
 * @param {string[]} keys - An array of keywords to search for (e.g., ["MODEL", "MODÈLE"]).
 * @returns {string|null} The found value or null.
 */
function findValueByKey(ocrData, keys) {
  if (!ocrData || !ocrData.words || !Array.isArray(keys)) return null;

  const words = ocrData.words;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordText = norm(word.text);
    
    // Check if the current word is one of our keys
    const keyFound = keys.some(key => wordText.includes(key));

    if (keyFound) {
      // We found a key. Now look for the value to its right.
      // A value is typically on the same line (similar y-coordinate) and to the right (greater x-coordinate).
      const keyBbox = word.bbox;
      const keyCenterY = keyBbox.y0 + (keyBbox.y1 - keyBbox.y0) / 2;

      for (let j = i + 1; j < words.length; j++) {
        const valueWord = words[j];
        const valueBbox = valueWord.bbox;
        const valueCenterY = valueBbox.y0 + (valueBbox.y1 - valueBbox.y0) / 2;

        // Check if the word is on roughly the same horizontal line and to the right
        const isHorizontallyAligned = Math.abs(keyCenterY - valueCenterY) < (keyBbox.y1 - keyBbox.y0) * 0.7;
        const isToTheRight = valueBbox.x0 > keyBbox.x0;
        
        if (isHorizontallyAligned && isToTheRight) {
          // We found the value. Return it after cleaning it up.
          return norm(valueWord.text).replace(/[:\/]/g, '').trim();
        }
      }
      
      // If no value was found to the right, check the line directly below
      for (let j = i + 1; j < words.length; j++) {
          const valueWord = words[j];
          const valueBbox = valueWord.bbox;
          
          // Check if the word is roughly below the key
          const isBelow = valueBbox.y0 > keyBbox.y1;
          const isVerticallyAligned = Math.abs(valueBbox.x0 - keyBbox.x0) < (keyBbox.x1 - keyBbox.x0);

          if(isBelow && isVerticallyAligned){
              return norm(valueWord.text).replace(/[:\/]/g, '').trim();
          }
      }
    }
  }
  return null;
}

/**
 * New extractor functions that use the brand profile and geometric logic.
 */
export function extractModel(ocrData, profile) {
  const keys = profile?.productLabelKeys?.model || profile?.shippingLabelKeys?.model || [];
  return findValueByKey(ocrData, keys);
}

export function extractCustomer(ocrData, profile) {
  const keys = profile?.shippingLabelKeys?.customer || [];
  return findValueByKey(ocrData, keys);
}

export function extractMs(ocrData, profile) {
    const t = norm(ocrData.text);
    // MS# extraction can still rely on simple text search because its pattern is so unique.
    const keywordMatch = t.match(/(?:MS#|M5#|M5N)\s*:?\s*(\b6100\d{6}\b)/);
    if (keywordMatch && keywordMatch[1]) return keywordMatch[1];
    
    const exact = t.match(/\b6100[0-9]{6}\b/);
    if (exact) return exact[0];
    
    const looser = t.replace(/[^0-9]/g, "");
    const i = looser.indexOf("6100");
    if (i >= 0) { const cand = looser.slice(i, i + 10); if (/^6100\d{6}$/.test(cand)) return cand; }
    return "";
}