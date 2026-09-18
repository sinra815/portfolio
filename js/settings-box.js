// ==== "⚙️ 설정" 박스: 평가금액 합계 표시 / 저장·불러오기 / File 내보내기·가져오기 / 초기화 ====

function buildExportFilename(){
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `투자_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}.json`;
}

// showSaveFilePicker(다운로드할 때마다 저장 위치를 직접 고르는 대화상자)만 지원 여부를 보고
// 쓴다 — 매번 위치를 고르는 방식이라 지원되면 그대로 쓰고, 안 되면 표준 다운로드로 넘어간다.
// (예전에 있던 "작업 폴더 지정"(showDirectoryPicker로 폴더를 고정해두는 기능)은 모바일은
// 물론 데스크톱에서도 브라우저마다 하위 기능이 들쭉날쭉해서 완전히 제거했다.)
const SUPPORTS_SAVE_PICKER = !!window.showSaveFilePicker;

async function exportToFile(anchor){
  const btn = anchor || document.getElementById('exportBtn');
  const jsonStr = JSON.stringify(buildStateSnapshot(), null, 2);
  const filename = buildExportFilename(); // 파일명은 항상 규칙대로 자동 생성 — 다시 물어보지 않는다.

  if (SUPPORTS_SAVE_PICKER) {
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

  // 표준 다운로드(showSaveFilePicker 미지원 브라우저의 대체 경로). 이미 있는 파일과의 충돌
  // 확인은 브라우저 다운로드 기능의 몫이라 여기선 할 수 없다 — 예외가 나도 조용히 실패하지
  // 않도록만 감싼다.
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

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFileInput').click();
});

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
  kiwoomGroupNames = saved.kiwoomGroupNames || kiwoomGroupNames;
  kiwoomGroupOrder = saved.kiwoomGroupOrder || kiwoomGroupOrder;
  if (saved.stage !== undefined) document.getElementById('stagePercentInput').value = saved.stage;
  if (saved.threshold !== undefined) document.getElementById('overweightThreshold').value = saved.threshold;
  renderAll();
  // 불러온 이름을 계좌 잔고(키움) 표 제목에도 바로 반영 — 패널이 보이는 중이면 다시 가져와 그린다.
  if (typeof loadKiwoomBalance === 'function' && typeof KIWOOM_OWNER_ID !== 'undefined' && currentUserId === KIWOOM_OWNER_ID) {
    loadKiwoomBalance();
  }
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
