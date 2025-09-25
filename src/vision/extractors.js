// src/vision/extractors.js

export function norm(t = "") {
  return t.replace(/\r/g, "").replace(/[^\x20-\x7E\n]/g, "").replace(/[OQ]/g, "0").replace(/[IL]/g, "1").toUpperCase();
}

export function extractMs(txt = "") {
  const t = norm(txt);
  const keywordMatch = t.match(/(?:MS#|M5#|M5N)\s*:?\s*(\b6100\d{6}\b)/);
  if (keywordMatch && keywordMatch[1]) return keywordMatch[1];
  
  const exact = t.match(/\b6100[0-9]{6}\b/);
  if (exact) return exact[0];
  
  const looser = t.replace(/[^0-9]/g, "");
  const i = looser.indexOf("6100");
  if (i >= 0) { const cand = looser.slice(i, i + 10); if (/^6100\d{6}$/.test(cand)) return cand; }
  return "";
}

/**
 * NEW "Key-Value" Logic for Customer Name
 * It now looks for multiple keywords and extracts the text that follows,
 * which is how a human would read the label.
 */
export function extractCustomer(txt = "") {
  const t = norm(txt);
  const lines = t.split('\n');
  
  // Define all the possible keys for "customer"
  const customerKeys = ["CONSUMER", "CONSOMMATEUR", "CONSIGNEE", "CUSTOMER", "CUSTADOR"];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if any of our keys are in the current line
    const key = customerKeys.find(k => line.includes(k));

    if (key) {
      // The customer name is usually on the same line, right after the key.
      // Or sometimes it's on the next line.
      let name = line.substring(line.indexOf(key) + key.length).replace(/[:\/]/g, '').trim();

      // If the rest of the line is empty, the name is likely on the next line.
      if (name.length < 3 && lines[i + 1]) {
        name = lines[i + 1].trim();
      }
      
      // Filter out junk results
      if (name && name.length > 3) {
          return name;
      }
    }
  }
  return "";
}

/**
 * Refined "Key-Value" Logic for Model
 * This is now much stricter and relies heavily on finding a keyword first.
 * This will prevent it from grabbing addresses like "THDCACGBARRIE".
 */
export function extractModel(txt = "") {
    const t = norm(txt);
    // This regex looks for a keyword, optional colon, and then captures the value.
    const keywordMatch = t.match(/(?:MODEL|MODÈLE|SKU|REF)\s*:?\s*([A-Z0-9-\/]{5,})/);
    if (keywordMatch && keywordMatch[1]) {
        return keywordMatch[1].trim();
    }
    
    // We will NOT use a fallback for now, to increase accuracy.
    // If there's no "MODEL:" key, we shouldn't guess.
    return "";
}