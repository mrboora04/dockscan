export function norm(t = "") {
  return t.replace(/\r/g, "").replace(/[^\x20-\x7E\n]/g, "").replace(/[OQ]/g, "0").replace(/[IL]/g, "1").toUpperCase();
}

function findValueByKey(ocrData, keys) {
    if (!ocrData || !ocrData.lines || !Array.isArray(keys)) return null;
    for (const line of ocrData.lines) {
        const lineText = norm(line.text);
        const keyFound = keys.find(key => lineText.includes(key));
        if (keyFound) {
            let value = lineText.substring(lineText.indexOf(keyFound) + keyFound.length);
            value = value.replace(/^[\s:\-\/]+/, '').trim();
            if (value.length > 2) {
                return value;
            }
        }
    }
    return null;
}

export function extractModel(ocrData, profile) {
  const keys = profile?.productLabelKeys?.model || profile?.shippingLabelKeys?.model || [];
  return findValueByKey(ocrData, keys);
}

export function extractCustomer(ocrData, profile) {
  const keys = profile?.shippingLabelKeys?.customer || [];
  return findValueByKey(ocrData, keys);
}

export function extractMs(ocrData, profile) {
    const text = norm(ocrData.text);
    const regexPattern = profile?.ms_regex;
    if (regexPattern && regexPattern !== '(no_ms)') {
        try {
            const regex = new RegExp(regexPattern);
            const match = text.match(regex);
            if (match && match[0]) return match[0];
        } catch (e) { console.error("Invalid regex in profile:", regexPattern); }
    }
    const exact = text.match(/\b6100[0-9]{6}\b/);
    if (exact) return exact[0];
    return "";
}