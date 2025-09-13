// src/worker-pipeline.js
import { addRow, updateRow, emitResult } from './ui.js';
import { msFromBarcode } from './barcode.js';
import { createOcrWorker, ocrFindMsNumber } from './ocr.js';

export async function processOne({ file, index, mode }) {
  addRow(index, file.name);
  const t0 = performance.now();
  let final = null;

  try {
    // 1) barcode (fast)
    updateRow(index, { statusHtml: `<span class="status-chip warn">barcode…</span>` });
    const b = await msFromBarcode(file);
    if (b?.ok && b.ms) final = { ...b, from:'barcode' };

    // 2) OCR (LG priority finds “MS” line)
    if (!final) {
      const ocr = await createOcrWorker();
      try {
        const r = await ocrFindMsNumber(ocr, file, mode, s =>
          updateRow(index, { statusHtml: `<span class="status-chip warn">${s}</span>` })
        );
        final = r.ok ? { ...r, from:'ocr' } : { ok:false, ms:'', raw:r.raw, from:'none' };
      } finally {
        await ocr.terminate();
      }
    }

    const timeMs = Math.round(performance.now() - t0);
    updateRow(index, {
      ms: final?.ms || '',
      statusHtml: final?.ms
        ? `<span class="status-chip ok">✓ ${final.from}</span>`
        : `<span class="status-chip err">⚠ Not Found</span>`,
      fullRaw: final?.raw || '',
    });

    emitResult({
      index, fileName:file.name, ms: final?.ms || '', from: final?.from || 'none',
      raw: final?.raw || '', timeMs
    });

  } catch (e) {
    const timeMs = Math.round(performance.now() - t0);
    updateRow(index, {
      ms:'', statusHtml:`<span class="status-chip err">Error</span>`, fullRaw: String(e?.stack||e)
    });
    emitResult({ index, fileName:file.name, ms:'', from:'error', raw:String(e), timeMs });
  }
}
