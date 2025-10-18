// src/barcode.js
// Detect any barcode. Return bounding box even if we can't decode MS#
// Uses Native BarcodeDetector when available, otherwise ZXing fallback.

let nativeBarcodeDetector = null;
if ('BarcodeDetector' in window) {
  try {
    const fmts = await BarcodeDetector.getSupportedFormats();
    nativeBarcodeDetector = new BarcodeDetector({
      formats: ['code_128', 'code_39', 'itf', 'ean_13', 'upc_a', 'qr_code'].filter(f => fmts.includes(f))
    });
    console.log('[Barcode] Native BarcodeDetector ready');
  } catch (e) {
    console.warn('[Barcode] Native init failed', e);
  }
}

// ZXing fallback
const zxingHints = new Map();
const zxingFormats = [
  ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.ITF,
  ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.QR_CODE
];
zxingHints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, zxingFormats);
zxingHints.set(ZXing.DecodeHintType.TRY_HARDER, true);
const zxingReader = new ZXing.BrowserMultiFormatReader(zxingHints);

function extractMsDigits(s='') {
  const d = String(s).replace(/\D/g,'');
  const i = d.indexOf('6100');
  if (i === -1) return '';
  const cand = d.slice(i, i+10);
  return /^6100\d{6}$/.test(cand) ? cand : '';
}

function rectFromPoints(pts) {
  if (!pts || !pts.length) return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const p of pts) { if (!p) continue; minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); }
  if (!isFinite(minX)) return null;
  return { x: Math.round(minX), y: Math.round(minY), width: Math.round(maxX-minX), height: Math.round(maxY-minY) };
}

// Ensure the expanded crop is valid, clamped and never zero-sized
export function expandAroundBarcode(bbox, imageW, imageH) {
  if (!bbox || !imageW || !imageH) return null;

  const padX = Math.round(bbox.width  * 2.2);
  const padY = Math.round(bbox.height * 1.5);

  let x = Math.max(0, Math.floor(bbox.x - padX));
  let y = Math.max(0, Math.floor(bbox.y - Math.round(padY * 0.8)));
  let w = Math.min(imageW - x, Math.floor(bbox.width + padX * 2));
  let h = Math.min(imageH - y, Math.floor(bbox.height + padY * 2));

  // enforce minimum crop size (prevents IndexSizeError downstream)
  const MIN = 32;
  if (w < MIN) { const grow = MIN - w; x = Math.max(0, x - Math.floor(grow/2)); w = Math.min(imageW - x, MIN); }
  if (h < MIN) { const grow = MIN - h; y = Math.max(0, y - Math.floor(grow/2)); h = Math.min(imageH - y, MIN); }

  // final safety clamp
  w = Math.max(MIN, Math.min(w, imageW - x));
  h = Math.max(MIN, Math.min(h, imageH - y));

  return { x, y, width: w, height: h };
}


export async function detectBarcode(file) {
  const bmp = await createImageBitmap(file);

  // Native first (fast, gives bbox)
  if (nativeBarcodeDetector) {
    try {
      const res = await nativeBarcodeDetector.detect(bmp);
      if (res && res.length) {
        // Choose the one closest to center (often the shipping label)
        const cx = bmp.width/2, cy = bmp.height/2;
        res.sort((a,b)=>{
          const ra = a.boundingBox; const rb = b.boundingBox;
          const da = Math.hypot((ra.x+ra.width/2)-cx, (ra.y+ra.height/2)-cy);
          const db = Math.hypot((rb.x+rb.width/2)-cx, (rb.y+rb.height/2)-cy);
          return da - db;
        });
        const r = res[0];
        const ms = extractMsDigits(r.rawValue || '');
        return {
          ok: true,
          ms: ms || '',
          raw: r.rawValue || '',
          format: `native/${r.format}`,
          bbox: { x:r.boundingBox.x, y:r.boundingBox.y, width:r.boundingBox.width, height:r.boundingBox.height },
          imageSize: { width: bmp.width, height: bmp.height }
        };
      }
    } catch (e) {
      console.warn('[Barcode] Native detect failed', e);
    }
  }

  // ZXing fallback — try rotations; use resultPoints as bbox
  const attempts = [0, 90, 270];
  for (const deg of attempts) {
    const c = new OffscreenCanvas(deg ? bmp.height : bmp.width, deg ? bmp.width : bmp.height);
    const g = c.getContext('2d');
    g.translate(c.width/2, c.height/2);
    g.rotate(deg * Math.PI/180);
    g.drawImage(bmp, -bmp.width/2, -bmp.height/2);
    const url = c.convertToBlob ? URL.createObjectURL(await c.convertToBlob()) : c.toDataURL('image/jpeg');

    try {
      const result = await zxingReader.decodeFromImageUrl(url);
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      if (result) {
        const txt = result.getText ? result.getText() : '';
        const ms = extractMsDigits(txt);
        const rps = result.getResultPoints ? result.getResultPoints() : [];
        const pts = (rps || []).map(p => {
          // rotate coordinates back to original orientation
          let x=p.getX(), y=p.getY();
          if (deg === 90)  { [x,y] = [y, c.width - x]; }
          if (deg === 270) { [x,y] = [c.height - y, x]; }
          return { x, y };
        });
        const bbox = rectFromPoints(pts);
        return {
          ok: true,
          ms: ms || '',
          raw: txt || '',
          format: `zxing/${result.getBarcodeFormat?.() || ''}`,
          bbox,
          imageSize: { width: bmp.width, height: bmp.height }
        };
      }
    } catch {}
  }

  return { ok: false, ms:'', raw:'', format:'none', bbox: null, imageSize:{ width:bmp.width, height:bmp.height } };
}