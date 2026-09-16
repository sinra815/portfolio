// ==== "⚙️ 설정" 박스: 평가금액 합계 표시 / 저장·불러오기 / File 내보내기·가져오기 / 초기화 ====

function buildExportFilename(){
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `투자_리밸런싱_데이터_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
}

const IDB_NAME = 'investRebalanceDB';
const IDB_STORE = 'handles';
let workDirHandle = null;

function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key){
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return undefined; }
}
async function idbSet(key, value){
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

function updateWorkDirStatus(){
  const el = document.getElementById('workDirStatus');
  if (!el) return;
  el.textContent = workDirHandle ? `작업 폴더: 📁 ${workDirHandle.name}` : '작업 폴더: 미설정';
}

async function restoreWorkDirHandle(){
  if (!window.showDirectoryPicker) return;
  const stored = await idbGet('workDirHandle');
  if (!stored) return;
  try {
    const perm = await stored.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      workDirHandle = stored;
      updateWorkDirStatus();
    }
  } catch (e) {}
}

function getCurrentFolderHint(){
  try {
    if (location.protocol !== 'file:') return '';
    let path = decodeURIComponent(location.pathname).replace(/^\/+/, '');
    const parts = path.split('/');
    parts.pop();
    return parts[parts.length - 1] || '';
  } catch (e) { return ''; }
}

async function chooseWorkDir(anchor){
  const btn = anchor || document.getElementById('chooseWorkDirBtn');
  if (!window.showDirectoryPicker) {
    showFieldStatus(btn, '이 브라우저는 폴더를 직접 지정하는 기능을 지원하지 않습니다. Chrome이나 Edge 최신 버전에서 사용해주세요.', 'error');
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    workDirHandle = handle;
    await idbSet('workDirHandle', handle);
    updateWorkDirStatus();
    return handle;
  } catch (e) {
    if (e && e.name !== 'AbortError') showFieldStatus(btn, '폴더를 지정하는 중 오류가 발생했습니다: ' + e.message, 'error');
    return null;
  }
}

async function ensureWorkDir(anchor){
  if (!window.showDirectoryPicker) return null;
  if (workDirHandle) {
    try {
      const perm = await workDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return workDirHandle;
      const granted = await workDirHandle.requestPermission({ mode: 'readwrite' });
      if (granted === 'granted') return workDirHandle;
    } catch (e) {}
  }
  const hint = getCurrentFolderHint();
  const hintMsg = hint ? `\n\n👉 이 파일은 "${hint}" 폴더 안에 있습니다. 다음 창에서 그 폴더를 선택해주세요.` : '';
  if (!confirm(`내보내기/가져오기에 항상 사용할 "작업 폴더"가 아직 지정되지 않았습니다.\n지금 폴더를 선택할까요?${hintMsg}`)) return null;
  return await chooseWorkDir(anchor);
}

document.getElementById('chooseWorkDirBtn').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const hint = getCurrentFolderHint();
  if (hint) showFieldStatus(btn, `👉 이 파일은 "${hint}" 폴더 안에 있습니다. 다음 창에서 그 폴더를 선택해주세요.`);
  chooseWorkDir(btn);
});
restoreWorkDirHandle();

async function exportToFile(anchor){
  const btn = anchor || document.getElementById('exportBtn');
  await ensureWorkDir(btn);

  const jsonStr = JSON.stringify(buildStateSnapshot(), null, 2);
  const defaultName = buildExportFilename();

  if (window.showSaveFilePicker) {
    try {
      const opts = {
        suggestedName: defaultName,
        types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
      };
      if (workDirHandle) opts.startIn = workDirHandle;
      const handle = await window.showSaveFilePicker(opts);
      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      showFieldStatus(btn, `저장했습니다. (${handle.name})`);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      showFieldStatus(btn, '저장하는 중 오류가 발생해 다른 방법으로 저장합니다: ' + e.message, 'error');
    }
  }

  let filename = prompt('저장할 파일명을 입력하세요.', defaultName);
  if (filename === null) return;
  filename = filename.trim();
  if (!filename) { showFieldStatus(btn, '파일명을 입력해주세요.', 'error'); return; }
  if (!filename.toLowerCase().endsWith('.json')) filename += '.json';

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
document.getElementById('exportBtn').addEventListener('click', (e) => exportToFile(e.currentTarget));

function applyImportedJson(text, anchor){
  const btn = anchor || document.getElementById('importBtn');
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    showFieldStatus(btn, '올바른 JSON 파일이 아닙니다.', 'error');
    return;
  }
  if (!data || !Array.isArray(data.master) || !Array.isArray(data.groups)) {
    showFieldStatus(btn, '이 파일에서 내보낸 형식이 아닙니다. (master/groups 항목이 없습니다)', 'error');
    return;
  }
  if (!confirm('현재 화면의 데이터를 모두 지우고, 가져온 데이터로만 채울까요?')) return;
  master = data.master;
  groups = data.groups;
  document.getElementById('stagePercentInput').value = data.stage !== undefined ? data.stage : '100';
  document.getElementById('overweightThreshold').value = data.threshold !== undefined ? data.threshold : '10';
  renderAll();
  showFieldStatus(btn, '가져오기가 완료되었습니다.');
}

function openFolderFileList(dir, files){
  const overlay = document.getElementById('folderFileListOverlay');
  const listEl = document.getElementById('folderFileListItems');
  document.getElementById('folderFileListDirName').textContent = dir.name;
  listEl.innerHTML = '';
  if (files.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted); padding:8px 0;">이 폴더에 JSON 파일이 없습니다.</div>`;
  } else {
    files.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = f.name;
      btn.style.cssText = 'display:block; width:100%; text-align:left; padding:8px 10px; margin-bottom:4px; border:1px solid var(--border-strong); border-radius:6px; background:#fff; cursor:pointer; font-size:12.5px; font-family:inherit;';
      btn.addEventListener('click', async () => {
        overlay.classList.remove('open');
        const importBtn = document.getElementById('importBtn');
        try {
          const file = await f.handle.getFile();
          const text = await file.text();
          applyImportedJson(text, importBtn);
        } catch (e) {
          showFieldStatus(importBtn, '파일을 읽는 중 오류가 발생했습니다: ' + e.message, 'error');
        }
      });
      listEl.appendChild(btn);
    });
  }
  overlay.classList.add('open');
}
document.getElementById('folderFileListCancel').addEventListener('click', () => {
  document.getElementById('folderFileListOverlay').classList.remove('open');
});
document.getElementById('folderFileListBrowse').addEventListener('click', () => {
  document.getElementById('folderFileListOverlay').classList.remove('open');
  document.getElementById('importFileInput').click();
});

async function importFromFile(anchor){
  const btn = anchor || document.getElementById('importBtn');
  const dir = await ensureWorkDir(btn);
  if (dir) {
    try {
      const files = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) files.push({ name, handle });
      }
      files.sort((a, b) => a.name.localeCompare(b.name));
      openFolderFileList(dir, files);
      return;
    } catch (e) {
      showFieldStatus(btn, '작업 폴더를 읽는 중 오류가 발생해 다른 방법으로 불러옵니다: ' + e.message, 'error');
    }
  }
  document.getElementById('importFileInput').click();
}
document.getElementById('importBtn').addEventListener('click', (e) => importFromFile(e.currentTarget));

document.getElementById('importFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const importBtn = document.getElementById('importBtn');
  const reader = new FileReader();
  reader.onload = () => applyImportedJson(reader.result, importBtn);
  reader.onerror = () => showFieldStatus(importBtn, '파일을 읽는 중 오류가 발생했습니다.', 'error');
  reader.readAsText(file);
});

document.getElementById('resetAllBtn').addEventListener('click', () => {
  if (!confirm('모든 증권사·계좌와 종목 마스터를 삭제할까요? 안에 있는 종목도 모두 함께 삭제됩니다.')) return;
  groups = [];
  master = [];
  renderAll();
});

// ==== 저장 버튼의 초록 배지: 서버(/api/save)에 저장된 데이터가 있는지를 나타낸다 ====
function setSaveBadge(visible){
  const badge = document.getElementById('saveBadge');
  if (badge) badge.style.display = visible ? 'block' : 'none';
}

async function refreshSaveBadge(){
  try {
    const res = await fetch('/api/load?existsOnly=1');
    if (!res.ok) return;
    const json = await res.json();
    setSaveBadge(!!json.exists);
  } catch (e) {
    // 오프라인이거나 API가 없는 정적 호스팅에서는 배지를 건드리지 않는다.
  }
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const btn = document.getElementById('saveBtn');
  const original = btn.textContent;
  btn.textContent = '저장 중...';
  btn.disabled = true;
  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildStateSnapshot()),
  }).then((res) => {
    if (!res.ok) throw new Error('save failed');
    setSaveBadge(true);
    showFieldStatus(btn, '저장되었습니다.');
  }).catch(() => {
    showFieldStatus(btn, '저장 실패 - 네트워크 상태를 확인해주세요.', 'error');
  }).finally(() => {
    btn.textContent = original;
    btn.disabled = false;
  });
});

document.getElementById('loadBtn').addEventListener('click', () => {
  const btn = document.getElementById('loadBtn');
  const original = btn.textContent;
  btn.textContent = '불러오는 중...';
  btn.disabled = true;
  fetch('/api/load').then((res) => {
    if (!res.ok) throw new Error('load failed');
    return res.json();
  }).then((json) => {
    if (!json.data) {
      setSaveBadge(false);
      showFieldStatus(btn, '서버에 저장된 데이터가 없습니다.', 'error');
      return;
    }
    setSaveBadge(true);
    if (!confirm('서버에 저장된 데이터를 불러올까요? 현재 화면의 변경 사항은 사라집니다.')) return;
    const saved = json.data;
    master = saved.master || master;
    groups = saved.groups || groups;
    if (saved.stage !== undefined) document.getElementById('stagePercentInput').value = saved.stage;
    if (saved.threshold !== undefined) document.getElementById('overweightThreshold').value = saved.threshold;
    renderAll();
    showFieldStatus(btn, '불러왔습니다.');
  }).catch(() => {
    showFieldStatus(btn, '불러오기 실패 - 네트워크 상태를 확인해주세요.', 'error');
  }).finally(() => {
    btn.textContent = original;
    btn.disabled = false;
  });
});

document.getElementById('toggleTotalMBtn').addEventListener('click', (e) => {
  totalMHidden = !totalMHidden;
  e.currentTarget.textContent = totalMHidden ? '🙈' : '👁';
  renderAll();
});
