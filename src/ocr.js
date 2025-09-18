const OCR_TIMEOUT_MS = 15000;

export async function createOcrWorker() {
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => (m?.progress != null ? console.log(`[OCR] ${m.status} ${(m.progress*100|0)}%`) : 0),
  });
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
  });
  return worker;
}

// Clamp & enforce a minimum rect
function sanitizeRect(rect, imgW, imgH) {
  if (!imgW || !imgH) return { x:0, y:0, width:imgW||1, height:imgH||1 };
  const MIN = 32;
  let x = Math.max(0, Math.floor(rect?.x ?? 0));
  let y = Math.max(0, Math.floor(rect?.y ?? 0));
  let w = Math.floor(rect?.width ?? imgW);
  let h = Math.floor(rect?.height ?? imgH);

  if (x + w > imgW) w = imgW - x;
  if (y + h > imgH) h = imgH - y;
  if (w < MIN) { const add = MIN - w; x = Math.max(0, x - Math.floor(add/2)); w = Math.min(imgW - x, MIN); }
  if (h < MIN) { const add = MIN - h; y = Math.max(0, y - Math.floor(add/2)); h = Math.min(imgH - y, MIN); }

  w = Math.max(MIN, Math.min(w, imgW - x));
  h = Math.max(MIN, Math.min(h, imgH - y));
  return { x, y, width: w, height: h };
}

// Use a regular <canvas> for maximal compatibility
function drawCrop(bmp, rect) {
  const r = sanitizeRect(rect || { x:0, y:0, width:bmp.width, height:bmp.height }, bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = r.width; c.height = r.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return c;
}

// Safe Otsu (protect getImageData on zero sizes)
function otsu(canvas) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  if (!width || !height) return canvas; // nothing to do

  let img;
  try {
    img = ctx.getImageData(0, 0, width, height);
  } catch (e) {
    console.warn('[OCR] getImageData failed; skipping Otsu', e);
    return canvas;
  }

  const d = img.data, hist = new Array(256).fill(0);
  for (let i=0;i<d.length;i+=4){ const y=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0; hist[y]++; }
  let sum=0,sumB=0,wB=0,max=0,thr=0,tot=width*height;
  for (let i=0;i<256;i++) sum+=i*hist[i];
  for (let i=0;i<256;i++){ wB+=hist[i]; if(!wB)continue; const wF=tot-wB; if(!wF)break; sumB+=i*hist[i];
    const mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>max){max=v;thr=i;} }
  for (let i=0;i<d.length;i+=4){ const y=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0, v=y>thr?255:0; d[i]=d[i+1]=d[i+2]=v; d[i+3]=255; }
  ctx.putImageData(img, 0, 0);
  return canvas;
}


export function extractMs(text='') {
  let t = text.toUpperCase().replace(/[OQ]/g,'0').replace(/[IL]/g,'1').replace(/S/g,'5').replace(/B/g,'8');
  const m = t.match(/6\s*1\s*0\s*0[\s-]*[\d\s-]{6,}/);
  if (m){ const cand=m[0].replace(/\D/g,'').slice(0,10); if(/^6100\d{6}$/.test(cand)) return cand; }
  const digits = t.replace(/\D/g,''); const i = digits.indexOf('6100');
  if (i>=0){ const cand=digits.slice(i,i+10); if(/^6100\d{6}$/.test(cand)) return cand; }
  return '';
}

export function extractModel(text='') {
  const lines = text.toUpperCase().split(/\r?\n/).map(s=>s.trim());
  // LG models: letters+digits, often 6–12 chars, e.g., WKEX200HWA, LDTS5552S, LF29T6000S
  const rx = /\b[A-Z]{2,5}[A-Z0-9]{3,9}[A-Z]\b/;
  for (const L of lines) {
    const m = L.match(rx);
    if (m && !/CANADA|KOREA|MADE|BACK|FRONT|ELECTRIC|GAS|STAINLESS|BLACK|WHITE|MODEL|SERIAL|WASHTOWER|REFRIGERATOR|DISHWASHER/.test(L))
      return m[0];
  }
  return '';
}

export function extractCustomer(text='') {
  const T = text.toUpperCase();
  // pick line after a known key
  const keyRx = /(CONSIGNEE|CONSUMER|CUSTOMER|DESTINATAIRE)\s*:?\s*([A-Z\s'.-]{3,})/;
  const k = T.match(keyRx);
  if (k && k[2]) return k[2].replace(/\s{2,}/g,' ').trim();
  // fallback: a long namey line with spaces near address block
  const lines = T.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const guess = lines.find(L => /[A-Z]{3,}\s+[A-Z]{3,}/.test(L) && L.length <= 40 && !/\d{5,}/.test(L));
  return guess || '';
}

/**
 * OCR just the region we were given (usually expanded around barcode)
 * mode 'lg' narrows Tesseract to digits/spaces primarily for MS# detection.
 */
export async function ocrRegion(worker, file, rect=null, mode='regular') {
  const bmp = await createImageBitmap(file);
  const canvas = otsu(drawCrop(bmp, rect));

  if (mode === 'lg') {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',
      preserve_interword_spaces: '1'
    });
  } else {
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
  }

  const recog = worker.recognize(canvas);
  const timeout = new Promise((_,rej)=>setTimeout(()=>rej(new Error('ocr_timeout')), OCR_TIMEOUT_MS));
  const { data } = await Promise.race([recog, timeout]);
  const raw = (data?.text || '');
  const conf = data?.confidence ?? 0;

  return {
    raw,
    ms: extractMs(raw),
    model: extractModel(raw),
    customer: extractCustomer(raw),
    conf  
  };
}
