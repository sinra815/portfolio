// ==== 핵심 상태 · 계산 로직 (모든 박스가 공유) ====
const STAGES = [0.5, 0.7, 0.8, 0.9, 1];
// 현금처럼 "수량 1 = 1만원" 으로 쓰고 싶은 종목의 현재가. 평가금액 식이
// 현재가 × 수량 ÷ 10000 이므로, 현재가를 10000원으로 두면 수량이 곧 만원 금액이 된다.
const CASH_UNIT_PRICE = 10000;
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

// 예전 데이터 호환: '현금' 이라는 이름의 행만 cash:true 플래그를 달고 수량을 만원 금액으로
// 그대로 썼다. 이제 모든 행이 같은 식을 쓰므로, 마스터 현재가를 10000원으로 맞춰 두면
// 수량이 그대로 만원 금액이 되어 이전과 똑같은 평가금액이 나온다.
// renderAll() 에서 매번 호출한다. 플래그를 지우므로 두 번째부터는 아무것도 하지 않고,
// 자동복원·서버 불러오기·File 가져오기 어느 경로로 들어온 데이터든 한 곳에서 처리된다.
function migrateCashRows(){
  groups.forEach(g => g.rows.forEach(r => {
    if (!r.cash) return;
    let m = master.find(x => x.name === r.stock);
    if (!m) {
      // 마스터에서 지워진 현금 행. 되살리지 않으면 현재가가 없어 평가금액이 0 이 된다.
      m = { name: r.stock, ticker: '', price: CASH_UNIT_PRICE, type: 'cash' };
      master.push(m);
    }
    // 예전에는 이 행의 마스터 현재가가 계산에 쓰이지 않았으므로 값이 무엇이든 덮어써야 한다.
    m.price = CASH_UNIT_PRICE;
    m.type = 'cash';
    delete r.cash;
  }));
}

function computeAll(){
  const stage = (parseFloat(document.getElementById('stagePercentInput').value) || 0) / 100;
  const threshold = (parseFloat(document.getElementById('overweightThreshold').value) || 0) / 100;

  groups.forEach(g => {
    g.rows.forEach(r => {
      r.M = (getPrice(r.stock) * (Number(r.qty) || 0)) / 10000;
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
  migrateCashRows();
  groups.forEach((g,i)=> g.__idx = i);
  computeAll();
  renderMainTable();
  renderStockSummary();
  renderPriceTable();
  renderStageSummary();
  autosaveWorkingState();
}
