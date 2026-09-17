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
// 로그인 없이(게스트로) 들어왔을 때 "저장"/"불러오기" 버튼이 쓰는 기기 저장 위치.
// 로그인한 경우의 저장 위치(서버 /api/save)와 대응된다 — 둘 다 버튼을 눌러야만 기록되고,
// 값을 바꿀 때마다 자동으로 저장되지는 않는다.
const DEVICE_SAVE_KEY = 'investRebalanceAutosave_v1';

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

function loadDeviceSave(){
  try {
    const raw = localStorage.getItem(DEVICE_SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function saveWorkingStateToDevice(){
  try { localStorage.setItem(DEVICE_SAVE_KEY, JSON.stringify(buildStateSnapshot())); } catch(e) {}
}

// 로그인 직후(새로고침으로 로그인이 복원된 경우 포함) 서버의 실제 데이터를 아직 받아오지 못한 동안
// true. 이 사이에 "저장" 버튼을 누르면 아직 도착하지 않은 진짜 서버 데이터를 빈 상태로 덮어쓸 수
// 있어, 그 동안은 저장/불러오기 버튼 클릭을 잠깐 막는다. auth-box.js 가 로그인 시점에 true 로
// 켜고, autoLoadServerData() 가 끝나면(성공/실패 무관) false 로 되돌린다.
let serverLoadPending = false;

// 서버에서 데이터를 불러오는 동안(위 serverLoadPending 과 같은 구간) 화면에 진행 표시를 보여준다.
// Vercel 서버리스 콜드 스타트 등으로 첫 응답이 늦어질 때, 화면이 그냥 비어 보이는 대신
// "불러오는 중"임을 알 수 있게 한다.
function setServerLoadingIndicator(visible){
  const el = document.getElementById('serverLoadingIndicator');
  if (el) el.style.display = visible ? 'inline' : 'none';
}

// 로그인 유지 키(js/auth-box.js 와 공유). 로그인된 채로 새로고침한 경우에는 기기 저장이
// 아니라 서버에 저장된 데이터를 보여줘야 하므로, 그 경우엔 기기 저장 복원을 건너뛴다.
const AUTH_STORAGE_KEY = 'investRebalanceAuthId';
function hasPersistedLogin(){
  try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch (e) { return false; }
}

const __deviceSaved = hasPersistedLogin() ? null : loadDeviceSave();
const __restore = __deviceSaved || (hasPersistedLogin() ? null : loadLegacyState());
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

// 전일대비 등락률(%, 부호 있음). 아직 "금액 새로고침"으로 조회한 적 없으면 undefined.
function getChangePercent(stockName){
  const m = master.find(x => x.name === stockName);
  return m ? m.changePercent : undefined;
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
      // 전일 평가금액 추정치: 현재가를 등락률로 역산한 전일 가격 기준. 등락률을 아직
      // 조회한 적 없는 종목은 변동이 없다고 간주한다(전일=오늘, 증감 0으로 계산됨).
      const cp = getChangePercent(r.stock);
      const cpValid = typeof cp === 'number' && !isNaN(cp) && (1 + cp / 100) !== 0;
      r.prevM = cpValid ? r.M / (1 + cp / 100) : r.M;
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

// 현재가와 함께 전일대비 등락률(changePercent, 부호 있는 %)도 반환한다.
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
    return { price: json.price, changePercent: json.changePercent };
  } catch (e) {
    if (!silent) showFieldStatus(anchor, '현재가를 불러오는 중 오류가 발생했습니다: ' + e.message, 'error');
    else console.warn(`[${query}] 현재가 조회 오류:`, e.message);
    return null;
  }
}

// ==== 종목명 컬럼 폭 맞추기 (종목 마스터 / 종목별 평가금액 요약 두 표가 공유) ====
// 두 표 모두 table-layout:fixed 라 컬럼 폭을 직접 정해줘야 하고, 종목명 컬럼만 width:auto 로
// 남는 공간을 받는다. 그대로 두면 긴 이름이 잘리거나 옆 셀을 침범한다.
const NAME_COL_MIN_W = 105;  // 짧은 이름만 있을 때의 하한
const NAME_COL_MAX_W = 360;  // 비정상적으로 긴 이름이 표를 망가뜨리지 않도록 상한

// 글자 폭 측정용 숨은 엘리먼트. 표 안의 엘리먼트를 직접 재면 두 가지가 어긋난다.
//  - scrollWidth: 컬럼이 넓어지면 글자 폭이 아니라 엘리먼트 폭을 돌려줘서 렌더링마다 컬럼이 늘어난다.
//  - Range: 이름이 줄바꿈되면 가장 긴 줄만 재므로, 한 줄에 필요한 폭을 알 수 없다.
// 화면 밖에 nowrap 으로 두고 같은 폰트로 재면 컬럼 폭·줄바꿈과 무관하게 항상 같은 값이 나온다.
let nameMeter = null;
function measureNameWidth(text, fontSource){
  if (!nameMeter) {
    nameMeter = document.createElement('span');
    nameMeter.style.cssText =
      'position:absolute; left:-9999px; top:0; white-space:pre; visibility:hidden;';
    document.body.appendChild(nameMeter);
  }
  const cs = getComputedStyle(fontSource);
  ['fontStyle', 'fontVariant', 'fontWeight', 'fontSize', 'fontFamily', 'letterSpacing']
    .forEach(p => { nameMeter.style[p] = cs[p]; });
  nameMeter.textContent = text;
  return nameMeter.getBoundingClientRect().width;
}

// nameEls 는 각 행의 종목명을 담은 엘리먼트들. 셀 전체 폭을 차지해야(flex:1 또는 display:block)
// "셀 폭 - 이름 엘리먼트 폭" 이 패딩·버튼 같은 고정 여유분으로 일정하게 나온다.
function fitNameColumn(table, nameEls, minW, maxW){
  if (!table) return;
  const cols = table.querySelectorAll('colgroup col');
  if (cols.length === 0) return;
  // 종목명 컬럼을 제외한 나머지는 colgroup 에 고정 폭으로 적혀 있다.
  const othersW = Array.from(cols).slice(1)
    .reduce((s, c) => s + (parseFloat(c.style.width) || 0), 0);

  let nameW = minW;
  if (nameEls.length > 0) {
    let textW = 0;
    nameEls.forEach(el => { textW = Math.max(textW, measureNameWidth(el.textContent, el)); });
    const td = nameEls[0].closest('td');
    const overhead = td.getBoundingClientRect().width - nameEls[0].getBoundingClientRect().width;
    const want = Math.ceil(textW + overhead) + 2; // 소수점 반올림 여유
    nameW = Math.max(minW, Math.min(maxW, want));
  }

  cols[0].style.width = nameW + 'px';
  table.style.minWidth = (nameW + othersW) + 'px';
}

// ==== 나머지 컬럼(숫자·티커·유형 등 단순 텍스트) 폭 맞추기 ====
// el 이 td/th 자신이면 자신의 padding·border 로, el 이 셀 안의 별도 엘리먼트(버튼과 함께 있는
// 이름 칸처럼)면 "셀 폭 - 엘리먼트 폭" 실측치로 여유분을 구한다.
function measureCellOverhead(el){
  const cell = el.closest('td, th');
  if (cell && cell !== el) {
    return cell.getBoundingClientRect().width - el.getBoundingClientRect().width;
  }
  const cs = getComputedStyle(el);
  return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
       + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
}

// 헤더에 <br> 로 줄바꿈이 들어간 경우, textContent 로 이어붙여 재면 실제보다 훨씬 넓게
// 나온다. <br> 기준으로 줄을 나눠 가장 넓은 한 줄만 기준으로 삼는다.
function measureHeaderTextWidth(th){
  let maxW = 0, current = '';
  const flush = () => { if (current.trim()) maxW = Math.max(maxW, measureNameWidth(current.trim(), th)); current = ''; };
  th.childNodes.forEach(node => {
    if (node.nodeType === 1 && node.tagName === 'BR') flush();
    else current += node.textContent || '';
  });
  flush();
  return maxW;
}

// headerEl(th)과 cellEls(그 컬럼의 각 행 엘리먼트) 중 가장 넓게 필요한 폭에 맞춘다.
function fitSimpleColumnWidth(table, colIndex, headerEl, cellEls, minW, maxW){
  if (!table) return;
  const cols = table.querySelectorAll('colgroup col');
  if (!cols[colIndex]) return;
  const measure = (el) => Math.ceil(measureNameWidth(el.textContent, el) + measureCellOverhead(el)) + 2;
  let want = minW;
  if (headerEl) want = Math.max(want, Math.ceil(measureHeaderTextWidth(headerEl) + measureCellOverhead(headerEl)) + 2);
  cellEls.forEach(el => { want = Math.max(want, measure(el)); });
  cols[colIndex].style.width = Math.max(minW, Math.min(maxW, want)) + 'px';
}

// 컬럼들을 다 맞춘 뒤, 표 전체 min-width 를 실제 컬럼 폭 합계로 다시 맞춘다.
function syncTableMinWidth(table){
  if (!table) return;
  const cols = table.querySelectorAll('colgroup col');
  const total = Array.from(cols).reduce((s, c) => s + (parseFloat(c.style.width) || 0), 0);
  if (total > 0) table.style.minWidth = total + 'px';
}

function renderAll(){
  migrateCashRows();
  groups.forEach((g,i)=> g.__idx = i);
  computeAll();
  renderMainTable();
  renderStockSummary();
  renderPriceTable();
  renderStageSummary();
}
