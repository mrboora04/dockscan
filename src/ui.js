export const queueFiles = [];

const tbody = document.getElementById('tbody');
const progressInner = document.getElementById('progressInner');
const concurrencyBadge = document.getElementById('concurrencyBadge');

const modal = document.getElementById('rawModal');
const modalText = document.getElementById('modalRawText');
const modalClose = document.getElementById('modalCloseBtn');
modalClose.addEventListener('click', ()=> modal.classList.add('hidden'));
modal.addEventListener('click', (e)=>{ if (e.target === modal) modal.classList.add('hidden'); });

function showModal(text){ modalText.textContent = text; modal.classList.remove('hidden'); }

let resultCb = ()=>{};
export function onResult(cb){ resultCb = cb; }
export function emitResult(r){ resultCb(r); }

export function setConcurrencyBadge(t){ concurrencyBadge.textContent = t; }
export function setProgress(done,total){ progressInner.style.width = (total? (done/total)*100 : 0) + '%'; }

export function resetQueue(){ queueFiles.length = 0; tbody.innerHTML = ''; }

export function addRow(index, fileName){
  const tr = document.createElement('tr');
  tr.id = `row-${index}`;
  tr.innerHTML = `
    <td>${index+1}</td>
    <td>${fileName}</td>
    <td id="ms-${index}">—</td>
    <td id="st-${index}"><span class="status-chip warn">queued…</span></td>
    <td id="raw-${index}"></td>
  `;
  tbody.appendChild(tr);
}

export function updateRow(index, patch){
  const msCell = document.getElementById(`ms-${index}`);
  const stCell = document.getElementById(`st-${index}`);
  const rawCell = document.getElementById(`raw-${index}`);

  if (patch.ms !== undefined){
    if (patch.ms){
      msCell.innerHTML = `${patch.ms} <button class="copy-btn" data-ms="${patch.ms}">Copy</button>`;
      msCell.querySelector('.copy-btn').onclick = (e)=>{
        navigator.clipboard.writeText(e.currentTarget.dataset.ms);
        e.currentTarget.textContent = 'Copied!';
        setTimeout(()=> e.currentTarget.textContent = 'Copy', 1600);
      };
    } else {
      msCell.textContent = '—';
    }
  }
  if (patch.statusHtml !== undefined) stCell.innerHTML = patch.statusHtml;

  if (patch.fullRaw !== undefined){
    rawCell.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'view-raw-btn';
    btn.textContent = 'View Raw';
    btn.onclick = ()=> showModal(patch.fullRaw);
    rawCell.appendChild(btn);
  }
  if (patch.confirmLastN !== undefined){
  const stCell = document.getElementById(`st-${index}`);
  const n = String(patch.confirmLastN || '').trim();
  if (n){
    stCell.innerHTML = `
      <span style="margin-right:.5rem">Confirm ends: <b>**** ${n}</b>?</span>
      <button class="btn ghost" id="yes-${index}">Yes</button>
      <button class="btn ghost" id="no-${index}">No</button>
    `;
    document.getElementById(`yes-${index}`).onclick = ()=>{
      stCell.innerHTML = `<span class="status-chip ok">✔ confirmed **** ${n}</span>`;
      emitResult({ index, confirmLastN: n, confirmed: true });
    };
    document.getElementById(`no-${index}`).onclick = ()=>{
      stCell.innerHTML = `<span class="status-chip warn">retry / manual</span>`;
      emitResult({ index, confirmLastN: n, confirmed: false });
    };
  }
}

}

export function exportCSV(rows){
  const headers = ['index','file','ms','from','time_ms','raw'];
  const csv = [headers.join(',')].concat(rows.map((r,i)=>[
    i+1,
    JSON.stringify(r.fileName),
    JSON.stringify(r.ms||''),
    r.from||'',
    r.timeMs||0,
    JSON.stringify(r.raw||'')
  ].join(','))).join('\n');

  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dockscan_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}
