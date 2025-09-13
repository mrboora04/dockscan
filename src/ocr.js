// inside createOcrWorker() keep as-is

export async function ocrFindMsNumber(worker, file, mode='regular', updateStatus=()=>{}, rect=null) {
  updateStatus('ocr…');

  // preprocess as you already do
  const canvas = await fileToPreprocessedCanvas(file);
  const opts = rect ? { rectangle: rect } : undefined;

  // IMPORTANT: tweak params for LG mode
  if (mode === 'lg') {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      tessedit_char_whitelist: '0123456789 -',
      preserve_interword_spaces: '1'
    });
  } else {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK
    });
  }

  const { data } = await worker.recognize(canvas, opts);
  const raw = (data?.text || '').toUpperCase();
  const ms = extractMsFromText(raw);
  return { ok: !!ms, ms, raw, from: ms ? 'OCR' : 'none' };
}
