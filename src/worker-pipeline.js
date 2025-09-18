// src/worker-pipeline.js
import { addRow, updateRow, emitResult } from './ui.js';
import { detectBarcode, expandAroundBarcode } from './barcode.js';
import { createOcrWorker, ocrRegion } from './ocr.js';
import { summarizeFields } from './parser.js';
import { findLabelRect } from './pre-process.js';

function centerFallback(imageW, imageH) {
  // center 60% of the image as a safe fallback crop
  const w = Math.floor(imageW * 0.6);
  const h = Math.floor(imageH * 0.6);
  const x = Math.floor((imageW - w) / 2);
  const y = Math.floor((imageH - h) / 2);
  return { x, y, width: Math.max(32,w), height: Math.max(32,h) };
}

export async function processOne({ file, index, mode }) {
  addRow(index, file.name);
  const t0 = performance.now();

  try {
    // 1) Try to find ANY barcode to anchor the crop
    updateRow(index, { statusHtml: `<span class="status-chip warn">barcode…</span>` });
    const det = await detectBarcode(file);

    let rect = null;
    if (det?.bbox && det?.imageSize) {
      rect = expandAroundBarcode(det.bbox, det.imageSize.width, det.imageSize.height);
    }
    if (!rect) {                           // NEW
  rect = await findLabelRect(file);    // NEW
    }
    // if barcode missing or expansion failed, use a safe center crop
    if (!rect && det?.imageSize) {
      rect = centerFallback(det.imageSize.width, det.imageSize.height);
    }

    const worker = await createOcrWorker();
    try {
      updateRow(index, { statusHtml: `<span class="status-chip warn">ocr…</span>` });
      const pass = await ocrRegion(worker, file, rect, mode === 'lg' ? 'lg' : 'regular');

      const ms = pass.ms || det.ms || '';
      const fields = summarizeFields(pass);
      const timeMs = Math.round(performance.now() - t0);

      updateRow(index, {
        ms: ms,
        statusHtml: ms ? `<span class="status-chip ok">✓ ocr</span>`
                       : `<span class="status-chip err">⚠ Not Found</span>`,
        fullRaw: pass.raw || det.raw || '—'
      });

      emitResult({
        index,
        fileName: file.name,
        ms,
        from: ms ? 'ocr+barcode_anchor' : 'none',
        raw: pass.raw,
        meta: { model: pass.model || '', customer: pass.customer || '', fields },
        timeMs
      });
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.error(`Critical error processing ${file.name}:`, err);
    const ms = pass.ms || det.ms || '';
    const lastN = ms ? ms.slice(-4) : '';
    const fields = summarizeFields(pass);
    const timeMs = Math.round(performance.now() - t0);

    updateRow(index, {
      ms,
      statusHtml: ms
        ? `<span class="status-chip ok">✓ ocr ${Math.round(pass.conf||0)}%</span>`
        : `<span class="status-chip err">⚠ Not Found</span>`,
      fullRaw: pass.raw || det.raw || '—',
      confirmLastN: lastN              // NEW
    });

  }
}
