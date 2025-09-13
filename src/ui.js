export const queueFiles = [];
const tbody = document.getElementById('tbody');
const progressInner = document.getElementById('progressInner');
const concurrencyBadge = document.getElementById('concurrencyBadge');

const modal = document.getElementById('rawModal');
const modalText = document.getElementById('modalRawText');
const modalCloseBtn = document.getElementById('modalCloseBtn');
modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

function showModalWithText(text) {
  modalText.textContent = text;
  modal.classList.remove('hidden');
}

let resultCb = () => {};
export function onResult(cb){ resultCb = cb; }

export function setConcurrencyBadge(n){ concurrencyBadge.textContent = n; }

export function setProgress(done, total){
  const pct = total > 0 ? (done / total) * 100 : 0;
  progressInner.style.width = pct + '%';
}

export function resetQueue(){
  queueFiles.length = 0;
  tbody.innerHTML = '';
}

export function addRow(index, fileName){
  const tr = document.createElement('tr');
  tr.id = `row-${index}`;
  tr.innerHTML = `
    <td>${index+1}</td>
    <td>${fileName}</td>
    <td id="ms-${index}">—</td>
    <td id="st-${index}"><span class="status-chip warn">queued…</span></td>
    <td id="raw-${index}" class="raw-text"></td>
  `;
  tbody.appendChild(tr);
}

export function updateRow(index, patch){
  const msCell = document.getElementById(`ms-${index}`);
  const stCell = document.getElementById(`st-${index}`);
  const rawCell = document.getElementById(`raw-${index}`);

  if (patch.ms !== undefined) {
    if (patch.ms) {
      msCell.innerHTML = `${patch.ms} <button class="copy-btn" data-ms="${patch.ms}">Copy</button>`;
      msCell.querySelector('.copy-btn').addEventListener('click', (e) => {
        const button = e.target;
        navigator.clipboard.writeText(button.dataset.ms).then(() => {
          button.textContent = 'Copied!';
          setTimeout(() => { button.textContent = 'Copy'; }, 1600);
        });
      });
    } else {
      msCell.textContent = '—';
    }
  }
  if (patch.statusHtml !== undefined) stCell.innerHTML = patch.statusHtml;

  if (patch.fullRaw !== undefined) {
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.style.padding = '4px 10px';
    btn.textContent = 'View Raw';
    btn.onclick = () => showModalWithText(patch.fullRaw);
    rawCell.innerHTML = '';
    rawCell.appendChild(btn);
  }
}

export function emitResult(r){ resultCb(r); }

export function exportCSV(rows){
  const headers = ['index','file','ms','from','time_ms','raw'];
  const csv = [headers.join(',')]
    .concat(rows.map((r,i)=>[
      i+1,
      JSON.stringify(r.fileName),
      JSON.stringify(r.ms || ''),
      r.from || '',
      r.timeMs || 0,
      JSON.stringify((r.raw||'').slice(0,180))
    ].join(',')))
    .join('\n');

  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dockscan_results_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}
