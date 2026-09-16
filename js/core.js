// ==== 핵심 상태 · 계산 로직 (모든 박스가 공유) ====
const STAGES = [0.5, 0.7, 0.8, 0.9, 1];
let totalMHidden = true; // 설정 박스의 "평가금액 합계" 숨기기 여부 (기본값: 숨김)

const INITIAL_MASTER = [];
const INITIAL_GROUPS = [];

// 예전 버전이 "저장" 버튼으로 기록했던 localStorage 키. 저장은 서버 API(/api/save)로 옮겨졌고
// 이 키에 새로 쓰는 코드는 없지만, 그때 저장해둔 데이터를 복원하기 위한 폴백으로 읽기만 유지한다.
const LEGACY_STORAGE_KEY = 'investRebalanceState_v1';
const AUTOSAVE_KEY = 'investRebalanceAutosave_v1';

function buildStateSnapshot(){
  return {
    master: master,
    groups: groups,
    stage: document.getElementById('stagePercentInput') ? document.getElementById('stagePercentInput').value : '100',
    threshold: document.getElementById('overweightThreshold') ? document.getElementById('overweightThreshold').value : '10',
  };
}

function loadLegacyState(){
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function loadAutosave(){
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function autosaveWorkingState(){
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildStateSnapshot())); } catch(e) {}
}

const __autosaved = loadAutosave();
const __restore = __autosaved || loadLegacyState();
let master = (__restore && __restore.master) ? __restore.master : JSON.parse(JSON.stringify(INITIAL_MASTER));
let groups = (__restore && __restore.groups) ? __restore.groups : JSON.parse(JSON.stringify(INITIAL_GROUPS));

function fmt(n, digits){
  if (n === null || n === undefined || isNaN(n)) return "";
  digits = digits === undefined ? 0 : digits;
  return Number(n).toLocaleString('ko-KR', {minimumFractionDigits:digits, maximumFractionDigits:digits});
}

function fmtTrim(n, maxDigits){
  if (n === null || n === undefined || isNaN(n)) return "";
  maxDigits = maxDigits === undefined ? 1 : maxDigits;
  const rounded = Number(Number(n).toFixed(maxDigits));
  return Number.isInteger(rounded) ? fmt(rounded, 0) : fmt(rounded, maxDigits);
}

function getPrice(stockName){
  const m = master.find(x => x.name === stockName);
  return m ? Number(m.price) || 0 : 0;
}

function getRowType(r){
  if (r.cash) return 'cash';
  const m = master.find(x => x.name === r.stock);
  return (m && m.type === 'cash') ? 'cash' : 'stock';
}

function setPrice(stockName, val){
  const m = master.find(x => x.name === stockName);
  if (m) m.price = val;
}

function roundDown(value, digits){
  const f = Math.pow(10, digits);
  return Math.floor(value * f) / f;
}

function computeAll(){
  const stage = (parseFloat(document.getElementById('stagePercentInput').value) || 0) / 100;
  const threshold = (parseFloat(document.getElementById('overweightThreshold').value) || 0) / 100;

  groups.forEach(g => {
    g.rows.forEach(r => {
      if (r.cash) {
        r.M = Number(r.qty) || 0;
      } else {
        r.M = (getPrice(r.stock) * (Number(r.qty) || 0)) / 10000;
      }
    });
    g.D = g.rows.reduce((s, r) => s + r.M, 0);
  });

  groups.forEach(g => {
    const fixedSum = g.rows.filter(r => r.weight !== null).reduce((s, r) => s + (Number(r.weight) || 0), 0);
    g.rows.forEach(r => {
      r.resolvedWeight = (r.weight === null) ? (100 - fixedSum) : Number(r.weight);
      r.G = g.D * r.resolvedWeight / 100;
      r.stageTargets = {};
      STAGES.forEach(s => r.stageTargets[s] = r.G * s);
      r.diffs = {};
      STAGES.forEach(s => r.diffs[s] = r.stageTargets[s] - r.M);
    });
  });

  groups.forEach(g => {
    g.rows.forEach(r => {
      r.targetPrice = (getRowType(r) === 'cash') ? r.G : r.G * stage;
      r.N = r.targetPrice - r.M;
      r.remark = r.N < 0 ? '축소' : (r.N > 0 ? '확대' : '');
      const ratio = g.D > 0 ? roundDown(Math.abs(r.N) / g.D, 3) : 0;
      r.overweight = ratio >= threshold ? 'O' : '';
    });
    g.rows.forEach(r => { r.cashLikeTotal = null; r.cashGroupSpan = 1; r.skipCashCell = false; r.overweightMerged = null; r.skipOverweightCell = false; });
    const cashRows = g.rows.filter(r => getRowType(r) === 'cash');
    if (cashRows.length > 0) {
      const cashTotal = cashRows.reduce((s, r) => s + r.N, 0);
      const mergedRatio = g.D > 0 ? roundDown(Math.abs(cashTotal) / g.D, 3) : 0;
      const mergedFlag = mergedRatio >= threshold ? 'O' : '';
      cashRows.forEach((r, i) => {
        if (i === 0) {
          r.cashLikeTotal = cashTotal;
          r.cashGroupSpan = cashRows.length;
          r.overweightMerged = mergedFlag;
        } else {
          r.skipCashCell = true;
          r.skipOverweightCell = true;
        }
      });
    }
  });

  let maxDiffVal = -Infinity;
  groups.forEach(g => {
    g.rows.forEach(r => {
      if (getRowType(r) !== 'cash' && r.N > maxDiffVal) maxDiffVal = r.N;
    });
  });
  groups.forEach(g => {
    g.rows.forEach(r => {
      r.isMaxDiff = maxDiffVal !== -Infinity && getRowType(r) !== 'cash' && r.N === maxDiffVal;
    });
  });

  return { stage, threshold };
}

function computeDividerCount(g){
  let dividerCount = 0;
  g.rows.forEach((r, i) => {
    if (i > 0 && getRowType(r) === 'cash' && getRowType(g.rows[i - 1]) !== 'cash') dividerCount++;
  });
  return dividerCount;
}

let fieldStatusEl = null;
let fieldStatusTimer = null;
function showFieldStatus(anchor, message, type){
  if (!anchor) return;
  if (!fieldStatusEl) {
    fieldStatusEl = document.createElement('div');
    fieldStatusEl.className = 'field-status';
    document.body.appendChild(fieldStatusEl);
  }
  clearTimeout(fieldStatusTimer);
  fieldStatusEl.textContent = message;
  fieldStatusEl.className = 'field-status' + (type ? ' ' + type : '');

  const rect = anchor.getBoundingClientRect();
  const showBelow = rect.bottom + 60 < window.innerHeight;
  fieldStatusEl.style.top = showBelow ? (rect.bottom + 6) + 'px' : '';
  fieldStatusEl.style.bottom = showBelow ? '' : (window.innerHeight - rect.top + 6) + 'px';
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 268));
  fieldStatusEl.style.left = left + 'px';

  requestAnimationFrame(() => fieldStatusEl.classList.add('show'));
  fieldStatusTimer = setTimeout(() => { fieldStatusEl.classList.remove('show'); }, 2600);
}

async function withButtonLoading(btn, loadingText, task){
  const original = btn.textContent;
  btn.textContent = loadingText;
  btn.disabled = true;
  try {
    return await task();
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function fetchPriceForTicker(ticker, opts){
  const silent = opts && opts.silent;
  const anchor = opts && opts.anchor;
  const query = (ticker || '').trim();
  if (!query) { if (!silent) showFieldStatus(anchor, '티커를 먼저 입력해주세요.', 'error'); return null; }
  try {
    const res = await fetch('/api/price?query=' + encodeURIComponent(query));
    const json = await res.json();
    if (!res.ok || json.error) {
      if (!silent) showFieldStatus(anchor, json.error || '현재가를 불러오지 못했습니다.', 'error');
      else console.warn(`[${query}] 현재가 조회 실패:`, json.error);
      return null;
    }
    return json.price;
  } catch (e) {
    if (!silent) showFieldStatus(anchor, '현재가를 불러오는 중 오류가 발생했습니다: ' + e.message, 'error');
    else console.warn(`[${query}] 현재가 조회 오류:`, e.message);
    return null;
  }
}

function renderAll(){
  groups.forEach((g,i)=> g.__idx = i);
  computeAll();
  renderMainTable();
  renderStockSummary();
  renderPriceTable();
  renderStageSummary();
  autosaveWorkingState();
}
