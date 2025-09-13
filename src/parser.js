// LG-first parser: robustly pull the MS# and ignore junk lines.
//  - Prefer “MS# 6100xxxxxx”
//  - Accept digits with spaces/dashes misread by OCR
//  - Try fallback “6100…” anywhere

function normalizeOCR(t){
  return t
    .toUpperCase()
    .replace(/[OQ]/g,'0')
    .replace(/[IL]/g,'1')
    .replace(/S/g,'5')
    .replace(/B/g,'8');
}

export function extractMsFromText(text){
  const T = normalizeOCR(text);

  // 1) “MS# …” anchored (LG labels often have “MS#” literal near the value)
  const msLine = /MS[#:\s-]*([^\n]+)/.exec(T);
  if (msLine) {
    const onlyDigits = msLine[1].replace(/\D/g,'');
    const i = onlyDigits.indexOf('6100');
    if (i !== -1) {
      const cand = onlyDigits.slice(i, i+10);
      if (/^6100\d{6}$/.test(cand)) return cand;
    }
  }

  // 2) tolerant pattern: 6 1 0 0 [digits] with spaces/dashes mixed
  const soft = T.match(/6\s*1\s*0\s*0[\s-]*\d[\d\s-]{6,8}/);
  if (soft) {
    const ms = soft[0].replace(/\D/g,'').slice(0,10);
    if (/^6100\d{6}$/.test(ms)) return ms;
  }

  // 3) sweep digits-only
  const digits = T.replace(/\D/g,'');
  const idx = digits.indexOf('6100');
  if (idx !== -1) {
    const cand = digits.slice(idx, idx+10);
    if (/^6100\d{6}$/.test(cand)) return cand;
  }

  return '';
}
