import { queueFiles, onResult, resetQueue, exportCSV, setConcurrencyBadge, setProgress } from './ui.js';
import { processOne } from './worker-pipeline.js';

const input = document.getElementById('fileInput');
const dz = document.getElementById('dropZone');
const clearBtn = document.getElementById('clearBtn');
const csvBtn = document.getElementById('csvBtn');
const lgToggle = document.getElementById('lgToggle');

let LG_MODE = true;
const MAX_PARALLEL = 2;
setConcurrencyBadge(`${MAX_PARALLEL} parallel workers`);

let results = [];
let filesToProcess = [];

lgToggle?.addEventListener('click', () => {
  LG_MODE = !LG_MODE;
  lgToggle.classList.toggle('on', LG_MODE);
  lgToggle.textContent = LG_MODE ? 'LG priority mode' : 'Regular mode';
});

onResult((r) => {
  results[r.index] = r;
  setProgress(results.filter(Boolean).length, filesToProcess.length);
  csvBtn.disabled = results.every(v => !v);
});

csvBtn.addEventListener('click', () => exportCSV(results.filter(Boolean)));
clearBtn.addEventListener('click', () => {
  results = []; filesToProcess = [];
  resetQueue(); setProgress(0,0); csvBtn.disabled = true; input.value='';
});

input.addEventListener('change', () => handleFiles(input.files));
['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));

function handleFiles(list) {
  const files = [...list].filter(f => /^image\//.test(f.type));
  if (!files.length) return;

  resetQueue();
  filesToProcess = files;
  results = new Array(files.length);
  setProgress(0, files.length);

  files.forEach((f, i) => queueFiles.push({ file: f, index: i, mode: (LG_MODE ? 'lg' : 'regular') }));
  runPipeline();
}

async function runPipeline() {
  const parallel = Math.min(MAX_PARALLEL, queueFiles.length);
  await Promise.all(new Array(parallel).fill(0).map(() => workerLoop()));
}
async function workerLoop() {
  while (queueFiles.length) {
    const job = queueFiles.shift();
    if (!job) break;
    await processOne(job);
  }
}
