// src/barcode.js
// Uses ZXing UMD already included in index.html and our label finder.
import { findAndCropLabel } from './pre-process.js';

let nativeBarcodeDetector = null;
if ('BarcodeDetector' in window) {
  try {
    const fmts = await BarcodeDetector.getSupportedFormats();
    const want = ['code_128','code_39','ean_13','itf','upc_a','qr_code'].filter(f => fmts.includes(f));
    nativeBarcodeDetector = new BarcodeDetector({ formats: want });
    console.log('[Barcode] Native BarcodeDetector active:', want.join(', '));
  } catch (e) {
    console.warn('[Barcode] Native init failed:', e);
  }
}

// ZXing fallback
const zxingHints = new Map();
zxingHints.set(ZXing.DecodeHintType.TRY_HARDER, true);
zxingHints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.ITF,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.QR_CODE
]);
const zxingReader = new ZXing.BrowserMultiFormatReader(zxingHints);

// --- utils ---
function extractMsDigits(s) {
  if (!s) return '';
  const digits = String(s).replace(/\D/g,'');
  const i = digits.indexOf('6100');
  if (i === -1) return '';
  const cand = digits.slice(i, i+10);
  return /^6100\d{6}$/.test(cand) ? cand : '';
}

function drawToCanvas(bitmap, w) {
  const scale = w / bitmap.width;
  const h = Math.round(bitmap.height * scale);
  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bitmap, 0, 0, w, h);
  return c;
}

async function detectNative(imgBitmap) {
  if (!nativeBarcodeDetector) return null;
  try {
    const found = await nativeBarcodeDetector.detect(imgBitmap);
    for (const b of found) {
      const ms = extractMsDigits(b.rawValue);
      if (ms) return { ok: true, ms, raw: b.rawValue, format: `Native/${b.format}` };
    }
  } catch {}
  return null;
}

async function detectZXingFromCanvas(canvas) {
  try {
    const url = canvas.convertToBlob ? URL.createObjectURL(await canvas.convertToBlob({ type:'image/jpeg', quality:0.92 })) :
                                       canvas.toDataURL('image/jpeg', 0.92);
    const res = await zxingReader.decodeFromImageUrl(url);
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    if (res && res.getText()) {
      const raw = res.getText();
      const ms = extractMsDigits(raw);
      if (ms) return { ok: true, ms, raw, format: `ZXing/${res.getBarcodeFormat()}` };
    }
  } catch { /* ignore */ }
  return null;
}

async function tryAllAngles(imgBitmap) {
  const angles = [0, 90, 180, 270];
  for (const a of angles) {
    // Normalize scale (helps ZXing a lot)
    const base = drawToCanvas(imgBitmap, 1400);

    // rotate if needed
    const c = new OffscreenCanvas(a % 180 === 0 ? base.width : base.height,
                                  a % 180 === 0 ? base.height : base.width);
    const cx = c.getContext('2d');
    cx.translate(c.width/2, c.height/2);
    cx.rotate(a * Math.PI/180);
    cx.drawImage(base, -base.width/2, -base.height/2);

    // 1) Native on the rotated bitmap (fast)
    const rotatedBitmap = await createImageBitmap(c);
    const nativeHit = await detectNative(rotatedBitmap);
    if (nativeHit) return nativeHit;

    // 2) ZXing on the rotated + normalized canvas
    const zxingHit = await detectZXingFromCanvas(c);
    if (zxingHit) return zxingHit;
  }
  return null;
}

// --- main entry ---
export async function msFromBarcode(file) {
  try {
    const full = await createImageBitmap(file);

    // Crop to the best label candidate first
    const rect = await findAndCropLabel(file).catch(() => null);
    const target = rect
      ? await createImageBitmap(full, rect.x|0, rect.y|0, rect.width|0, rect.height|0)
      : full;

    // Try native + ZXing across rotations on the cropped region
    const hit = await tryAllAngles(target);
    if (hit) return hit;

    return { ok: false, ms: '', raw: 'No barcode found' };
  } catch (err) {
    console.error('[Barcode] pipeline failed:', err);
    return { ok:false, ms:'', raw:'', error: err?.message || 'decode_failed' };
  }
}
