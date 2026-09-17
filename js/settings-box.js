// ==== "⚙️ 설정" 박스: 평가금액 합계 표시 / 저장·불러오기 / File 내보내기·가져오기 / 초기화 ====

function buildExportFilename(){
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `투자_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
}

// 브라우저가 실제로 이 기능들을 제공하는지로만 판단한다 — User-Agent로 "모바일이니 꺼야 한다"고
// 단정하지 않는다. 일부 모바일 브라우저는 showDirectoryPicker 는 되고 showSaveFilePicker 는
// 안 되는 등 지원이 API별로 갈리므로, exportToFile() 은 되는 단계까지만 쓰고 안 되면 다음
// 단계로 자연스럽게 넘어가도록 짜여 있다.
const SUPPORTS_FS_ACCESS = !!window.showDirectoryPicker;
const SUPPORTS_SAVE_PICKER = !!window.showSaveFilePicker;

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
  if (!SUPPORTS_FS_ACCESS) return;
  const stored = await idbGet('workDirHandle');
  if (!stored) return;
  // queryPermission() 결과를 재확인하지 않고 그대로 신뢰한다 — 일부 브라우저(삼성 인터넷 등)는
  // 이 API가 있어도 예외 없이 그냥 'granted' 가 아닌 값만 돌려줘서, 방금까지 정상 사용하던
  // 폴더도 재확인 절차 때문에 "지정 안 됨"으로 취급돼버리는 문제가 있었다. 실제로 쓰기 권한이
  // 없다면 그건 실제 쓰기 시점에 오류로 드러나고, exportToFile()/importFromFile() 이 잡아서
  // 다음 방법으로 넘어간다.
  workDirHandle = stored;
  updateWorkDirStatus();
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
  if (!SUPPORTS_FS_ACCESS) {
    showFieldStatus(btn, '이 브라우저는 폴더를 직접 지정하는 기능을 지원하지 않습니다. 데스크톱 Chrome이나 Edge 최신 버전에서 사용해주세요.', 'error');
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
  if (!SUPPORTS_FS_ACCESS) return null;
  // 이미 사용자가 직접 고른 폴더가 있으면 그대로 쓴다 — queryPermission/requestPermission 을
  // 다시 확인하지 않는다. 이 API가 있어도 항상 'granted' 가 아닌 값만 돌려주는 브라우저(삼성
  // 인터넷 등)가 있어서, 재확인 절차 자체가 방금까지 정상 지정돼 있던 폴더를 "지정 안 됨"으로
  // 잘못 취급해버리는 원인이었다. 정말로 쓰기 권한이 없다면 실제 쓰기 시점에 오류로 드러나고,
  // 그건 exportToFile()/importFromFile() 이 잡아서 다음 방법으로 넘어간다.
  if (workDirHandle) return workDirHandle;
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

// 이미 같은 이름의 파일이 그 폴더에 있는지 확인한다(있으면 getFileHandle 이 성공, 없으면
// NotFoundError 로 실패하는 걸 이용).
async function fileExistsInDir(dir, filename){
  try {
    await dir.getFileHandle(filename, { create: false });
    return true;
  } catch (e) {
    return false;
  }
}

async function exportToFile(anchor){
  const btn = anchor || document.getElementById('exportBtn');
  await ensureWorkDir(btn);

  const jsonStr = JSON.stringify(buildStateSnapshot(), null, 2);
  const filename = buildExportFilename(); // 파일명은 항상 규칙대로 자동 생성 — 다시 물어보지 않는다.

  // 1) 작업 폴더가 지정돼 있으면 오직 그 폴더에만 써 본다 — 이름/위치를 다시 묻지 않고, 같은
  //    이름의 파일이 이미 있을 때만 덮어쓸지 확인한다. 실패해도(일부 브라우저는 폴더 핸들
  //    자체는 주면서 그 안에 파일을 쓰는 기능은 지원하지 않는다 — 삼성 인터넷 등) 다른 폴더
  //    선택 대화상자를 새로 띄우지 않는다 — 이미 폴더를 지정해 둔 사용자에게 또 다른 위치를
  //    고르라고 하면 안 되기 때문. 이 경우 조용히 표준 다운로드로 넘어간다.
  if (SUPPORTS_FS_ACCESS && workDirHandle) {
    try {
      if (await fileExistsInDir(workDirHandle, filename) && !confirm(`"${filename}" 파일이 이미 있습니다. 덮어쓸까요?`)) return;
      const fileHandle = await workDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      showFieldStatus(btn, `저장했습니다. (${filename})`);
      return;
    } catch (e) {}
  } else if (SUPPORTS_SAVE_PICKER) {
    // 2) 작업 폴더가 아예 지정돼 있지 않을 때만 세이브 피커로 저장 위치를 고르게 한다 — 이
    //    경우엔 애초에 정해둔 위치가 없으니 물어보는 게 자연스럽다.
    try {
      const opts = {
        suggestedName: filename,
        types: [{ description: 'JSON 파일', accept: { 'application/json': ['.json'] } }],
      };
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

  // 3) 표준 다운로드(모든 브라우저의 최종 대체 경로). 이미 있는 파일과의 충돌 확인은 브라우저
  //    다운로드 기능의 몫이라 여기선 할 수 없다 — 예외가 나도 조용히 실패하지 않도록만 감싼다.
  try {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showFieldStatus(btn, `다운로드했습니다. (${filename})`);
  } catch (e) {
    showFieldStatus(btn, '파일을 저장하는 중 오류가 발생했습니다: ' + e.message, 'error');
  }
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

// files 배열을 직접 변형(삭제 시 splice)하면서 다시 그릴 수 있도록 렌더링만 분리했다.
function renderFolderFileList(dir, files){
  const listEl = document.getElementById('folderFileListItems');
  listEl.innerHTML = '';
  if (files.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted); padding:8px 0;">이 폴더에 JSON 파일이 없습니다.</div>`;
    return;
  }
  files.forEach(f => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:4px;';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = f.name;
    btn.style.cssText = 'flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; text-align:left; padding:8px 10px; border:1px solid var(--border-strong); border-radius:6px; background:#fff; cursor:pointer; font-size:12.5px; font-family:inherit;';
    btn.addEventListener('click', async () => {
      document.getElementById('folderFileListOverlay').classList.remove('open');
      const importBtn = document.getElementById('importBtn');
      try {
        const file = await f.handle.getFile();
        const text = await file.text();
        applyImportedJson(text, importBtn);
      } catch (e) {
        showFieldStatus(importBtn, '파일을 읽는 중 오류가 발생했습니다: ' + e.message, 'error');
      }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '삭제';
    delBtn.title = `"${f.name}" 파일 삭제`;
    delBtn.style.cssText = 'flex:0 0 auto; padding:8px 10px; border:1px solid var(--down); border-radius:6px; background:#fff; color:var(--down); cursor:pointer; font-size:12px; font-family:inherit;';
    // confirm() 은 쓰지 않는다 — 크롬은 removeEntry() 에 "일시적 사용자 활성화"를 요구하는데,
    // confirm() 같은 네이티브 대화상자를 띄우면 그 활성화가 소모되어 버려서, 클릭→confirm→
    // removeEntry 순서로는 "The request is not allowed by the user agent..." 에러가 난다.
    // 대신 "한 번 더 누르면 삭제" 방식으로, 두 번째 클릭 자체의 새 사용자 동작으로 바로 지운다.
    delBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!delBtn.dataset.armed) {
        delBtn.dataset.armed = '1';
        delBtn.textContent = '정말 삭제?';
        clearTimeout(delBtn._disarmTimer);
        delBtn._disarmTimer = setTimeout(() => {
          delete delBtn.dataset.armed;
          delBtn.textContent = '삭제';
        }, 3000);
        return;
      }
      clearTimeout(delBtn._disarmTimer);
      try {
        await dir.removeEntry(f.name);
        files.splice(files.indexOf(f), 1);
        renderFolderFileList(dir, files);
      } catch (e) {
        alert('파일을 삭제하는 중 오류가 발생했습니다: ' + e.message);
      }
    });

    row.appendChild(btn);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  });
}

function openFolderFileList(dir, files){
  const overlay = document.getElementById('folderFileListOverlay');
  document.getElementById('folderFileListDirName').textContent = dir.name;
  renderFolderFileList(dir, files);
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
  // 폴더는 지정돼 있어도 그 안의 파일 목록을 나열하는 기능(entries())은 지원하지 않는 브라우저가
  // 있다(삼성 인터넷 등 — showDirectoryPicker/getFileHandle 은 되는데 entries() 는 없음). 그런
  // 경우 매번 오류 메시지를 보여주는 대신 조용히 표준 파일 선택으로 넘어간다.
  if (dir && typeof dir.entries === 'function') {
    try {
      const files = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.json')) files.push({ name, handle });
      }
      files.sort((a, b) => a.name.localeCompare(b.name));
      openFolderFileList(dir, files);
      return;
    } catch (e) {}
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

// ==== 저장 버튼의 초록 배지: 현재 위치(로그인=서버 / 게스트=이 기기)에 저장된 데이터가 있는지 ====
function setSaveBadge(visible){
  const badge = document.getElementById('saveBadge');
  if (badge) badge.style.display = visible ? 'block' : 'none';
}

// "저장"·"불러오기"는 버튼을 눌렀을 때만 동작한다(자동저장 없음). 로그인 상태면 서버(/api/save,
// /api/load)에, 로그인 없이(게스트) 들어온 경우엔 이 기기(localStorage)에 저장/불러오기한다.
document.getElementById('saveBtn').addEventListener('click', () => {
  const btn = document.getElementById('saveBtn');
  if (serverLoadPending) { showFieldStatus(btn, '서버 데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.', 'error'); return; }
  if (!currentUserId) {
    saveWorkingStateToDevice();
    setSaveBadge(true);
    showFieldStatus(btn, '이 기기에 저장되었습니다.');
    return;
  }
  const original = btn.textContent;
  btn.textContent = '저장 중...';
  btn.disabled = true;
  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...buildStateSnapshot(), id: currentUserId }),
  }).then(async (res) => {
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || '저장 실패 - 네트워크 상태를 확인해주세요.');
    setSaveBadge(true);
    showFieldStatus(btn, '저장되었습니다.');
  }).catch((err) => {
    showFieldStatus(btn, err.message || '저장 실패 - 네트워크 상태를 확인해주세요.', 'error');
  }).finally(() => {
    btn.textContent = original;
    btn.disabled = false;
  });
});

// id 로 서버에 저장된 데이터를 가져온다. 데이터가 없으면 null.
async function fetchServerData(id){
  const res = await fetch('/api/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || '불러오기 실패 - 네트워크 상태를 확인해주세요.');
  return json.data;
}

// 서버·기기 어느 쪽에서 불러온 데이터든 화면에 그대로 반영한다.
function applyLoadedData(saved){
  master = saved.master || master;
  groups = saved.groups || groups;
  if (saved.stage !== undefined) document.getElementById('stagePercentInput').value = saved.stage;
  if (saved.threshold !== undefined) document.getElementById('overweightThreshold').value = saved.threshold;
  renderAll();
}

// 로그인 직후 자동으로 호출: 이 기기에 저장된 값이 아니라 서버에 저장된 값을 보여준다.
// 서버에 아직 저장된 데이터가 없는 ID(새 계정 등)는 배지만 끄고 조용히 넘어간다.
async function autoLoadServerData(id){
  try {
    const data = await fetchServerData(id);
    if (data) {
      applyLoadedData(data);
      setSaveBadge(true);
    } else {
      setSaveBadge(false);
    }
  } catch (e) {
    console.warn('서버 데이터 자동 불러오기 실패:', e.message);
  } finally {
    // 이제 서버 상태를 반영했으니(혹은 반영할 데이터가 없거나 조회에 실패했으니), 저장/불러오기
    // 버튼을 다시 눌러도 안전하다. 여기서 풀어주지 않으면 로그인 상태에서 계속 막혀 있게 된다.
    serverLoadPending = false;
    setServerLoadingIndicator(false);
  }
}

document.getElementById('loadBtn').addEventListener('click', () => {
  const btn = document.getElementById('loadBtn');
  if (serverLoadPending) { showFieldStatus(btn, '서버 데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.', 'error'); return; }
  if (!currentUserId) {
    const data = loadDeviceSave();
    if (!data) {
      setSaveBadge(false);
      showFieldStatus(btn, '이 기기에 저장된 데이터가 없습니다.', 'error');
      return;
    }
    setSaveBadge(true);
    if (!confirm('이 기기에 저장된 데이터를 불러올까요? 현재 화면의 변경 사항은 사라집니다.')) return;
    applyLoadedData(data);
    showFieldStatus(btn, '불러왔습니다.');
    return;
  }
  const original = btn.textContent;
  btn.textContent = '불러오는 중...';
  btn.disabled = true;
  fetchServerData(currentUserId).then((data) => {
    if (!data) {
      setSaveBadge(false);
      showFieldStatus(btn, '서버에 저장된 데이터가 없습니다.', 'error');
      return;
    }
    setSaveBadge(true);
    if (!confirm('서버에 저장된 데이터를 불러올까요? 현재 화면의 변경 사항은 사라집니다.')) return;
    applyLoadedData(data);
    showFieldStatus(btn, '불러왔습니다.');
  }).catch((err) => {
    showFieldStatus(btn, err.message || '불러오기 실패 - 네트워크 상태를 확인해주세요.', 'error');
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
