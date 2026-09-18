// ==== "🏦 My Data" 박스: 증권사 REST API로 조회한 실제 계좌 잔고 (읽기 전용) ====
// 키움증권 + NH투자증권(PLUG) 두 곳을 api/kiwoom.js 하나가 함께 조회해서 broker 필드로
// 구분한 채 같은 모양으로 돌려준다 — 이 파일은 broker 값이 뭐든 그대로 표에 나눠 보여줄
// 뿐이라 증권사가 늘어나도 손댈 필요가 없다.
// 이 앱의 앱키/시크릿은 sinra815 개인 계좌들에 연결돼 있어, 서버(api/kiwoom.js)가 그
// ID로만 조회를 허용한다. 여기서는 그 계정으로 로그인했을 때만 패널을 보여주는 UI
// 스위치일 뿐이고, 실제 접근 제어는 서버 쪽에서 한다 — 프런트 코드는 누구나 볼 수 있으므로
// 이 상수만으로는 아무것도 못 한다.
const KIWOOM_OWNER_ID = 'sinra815';

function kiwoomColorClass(n){
  return n > 0 ? 'remark-up' : (n < 0 ? 'remark-down' : '');
}

// 화면에 넣기 전에 사용자가 지정한 표 이름(prompt로 직접 입력) 등 신뢰할 수 없는 텍스트를 이스케이프.
function kiwoomEscapeHtml(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 표를 나누는 기준(증권사+계좌+계좌유형)을 하나의 키 문자열로 만든다.
function kiwoomGroupKey(h){
  return `${h.broker}|${h.account}|${h.accountType}`;
}

// 위/아래 이동 버튼을 다시 그리려면 새로 fetch하지 않고 마지막으로 받은 데이터로 재사용한다.
let lastKiwoomData = null;

function renderKiwoomBalance(data){
  lastKiwoomData = data;
  const failedNote = (data.failedAccounts && data.failedAccounts.length)
    ? `<div style="width:100%; color:var(--down); font-size:12px;">⚠ 일부 계좌 조회 실패: ${kiwoomEscapeHtml(data.failedAccounts.join(', '))}</div>`
    : '';
  document.getElementById('kiwoomSummary').innerHTML = `
    <div><span style="color:var(--muted);">총평가금액</span> <strong>${fmt(data.totalEvalAmount)} 원</strong></div>
    <div><span style="color:var(--muted);">총평가손익</span> <strong class="${kiwoomColorClass(data.totalEvalProfit)}">${fmt(data.totalEvalProfit)} 원</strong></div>
    <div><span style="color:var(--muted);">총수익률</span> <strong class="${kiwoomColorClass(data.totalProfitRate)}">${fmtTrim(data.totalProfitRate, 2)}%</strong></div>
    <div><span style="color:var(--muted);">예수금(국내)</span> <strong>${fmt(data.cashBalance)} 원</strong></div>
    ${failedNote}
  `;

  const container = document.getElementById('kiwoomGroupsContainer');
  if (!data.holdings || data.holdings.length === 0) {
    container.innerHTML = `<p class="note">보유 종목이 없습니다.</p>`;
    return;
  }

  // 증권사+계좌+계좌유형 조합별로 묶어 표를 나눈다 — 처음 등장하는 순서를 기본값으로 삼되,
  // 사용자가 순서를 바꿔둔 게 있으면(kiwoomGroupOrder) 그걸 우선한다. 새로 생긴 계좌는 끝에
  // 붙이고, 더 이상 없는 계좌는 저장된 순서 목록에서 자연히 빠진다.
  const naturalOrder = [];
  const groupMap = new Map();
  for (const h of data.holdings) {
    const key = kiwoomGroupKey(h);
    if (!groupMap.has(key)) { groupMap.set(key, []); naturalOrder.push(key); }
    groupMap.get(key).push(h);
  }
  // 보유 종목도 없고 예수금도 0원인 계좌(예: 미보유 해외 시장, 잔액 없는 계좌)는 빈 표를
  // 보여줄 필요가 없으니 걸러낸다.
  const isEmptyGroup = (rows) => rows.every((h) => !(h.evalAmount || 0) && !(h.qty || 0));
  for (const [key, rows] of groupMap) {
    if (isEmptyGroup(rows)) groupMap.delete(key);
  }
  const order = kiwoomGroupOrder.filter((k) => groupMap.has(k));
  for (const k of naturalOrder) if (groupMap.has(k) && !order.includes(k)) order.push(k);
  kiwoomGroupOrder = order;

  if (order.length === 0) {
    container.innerHTML = `<p class="note">보유 종목이 없습니다.</p>`;
    return;
  }

  container.innerHTML = order.map((key, idx) => {
    const rows = groupMap.get(key);
    const [broker, account, accountType] = key.split('|');
    const override = kiwoomGroupOverrides[key] || {};
    const brokerDisplay = override.broker || broker;
    const accountDisplay = override.account || account;

    // 이 표(계좌) 안의 평가금액/평가손익/수익률 소계. 매입금액은 종목마다 따로 안 내려주지만
    // 평가손익 = 평가금액 - 매입금액이라는 관계로 역산할 수 있다.
    const subEval = rows.reduce((s, h) => s + (h.evalAmount || 0), 0);
    const subProfit = rows.reduce((s, h) => s + (h.evalProfit || 0), 0);
    const subPurchase = rows.reduce((s, h) => s + ((h.evalAmount || 0) - (h.evalProfit || 0)), 0);
    const subRate = subPurchase ? (subProfit / subPurchase) * 100 : 0;

    // 보유수량/평가손익/수익률은 참고용이라 흐리게(kiwoom-disabled-cell), 현재가/평가금액은
    // 실제 리밸런싱 판단에 쓰는 금액이라 또렷하게 남긴다.
    const rowsHtml = rows.map((h) => `
      <tr>
        <td>${kiwoomEscapeHtml(h.name)}</td>
        <td class="num kiwoom-disabled-cell">${h.qty != null ? fmt(h.qty) : '-'}</td>
        <td class="num">${h.currentPrice != null ? fmt(h.currentPrice) + ' 원' : '-'}</td>
        <td class="num">${fmt(h.evalAmount)} 원</td>
        <td class="num kiwoom-disabled-cell ${kiwoomColorClass(h.evalProfit)}">${fmt(h.evalProfit)}</td>
        <td class="num kiwoom-disabled-cell ${kiwoomColorClass(h.profitRate)}">${fmtTrim(h.profitRate, 2)}%</td>
      </tr>
    `).join('');
    return `
      <div class="kiwoom-group-title" style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <span style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <span class="kiwoom-group-name-edit" data-key="${kiwoomEscapeHtml(key)}" data-field="broker" title="클릭하여 증권사명 변경">${kiwoomEscapeHtml(brokerDisplay)}</span>
          <span style="color:var(--muted);">·</span>
          <span class="kiwoom-group-name-edit" data-key="${kiwoomEscapeHtml(key)}" data-field="account" title="클릭하여 계좌명 변경">${kiwoomEscapeHtml(accountDisplay)}</span>
          <span style="color:var(--muted); font-size:12px;">(${kiwoomEscapeHtml(accountType)})</span>
        </span>
        <span class="spin-btns">
          <button type="button" class="group-move-btn kiwoom-group-up" data-key="${kiwoomEscapeHtml(key)}" title="위로 이동" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="group-move-btn kiwoom-group-down" data-key="${kiwoomEscapeHtml(key)}" title="아래로 이동" ${idx === order.length - 1 ? 'disabled' : ''}>▼</button>
        </span>
      </div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:4px;">
        평가금액 <strong style="color:var(--text);">${fmt(subEval)} 원</strong>
        · 평가손익 <strong class="${kiwoomColorClass(subProfit)}">${fmt(subProfit)} 원</strong>
        · 수익률 <strong class="${kiwoomColorClass(subRate)}">${fmtTrim(subRate, 2)}%</strong>
      </div>
      <div class="table-scroll" style="margin-bottom:16px;">
        <table class="price-table kiwoom-table">
          <colgroup>
            <col style="width:auto;">
            <col style="width:90px;">
            <col style="width:100px;">
            <col style="width:120px;">
            <col style="width:110px;">
            <col style="width:80px;">
          </colgroup>
          <thead><tr><th>종목</th><th>보유수량</th><th>현재가</th><th>평가금액</th><th>평가손익</th><th>수익률</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }).join('');

  // "📋 요약" 박스가 계좌 모드일 때 My Data 최신값을 바로 반영하도록 함께 다시 그린다.
  if (typeof renderStockSummary === 'function') renderStockSummary();
}

// 표 순서 위/아래 이동 — 새로 가져오지 않고 마지막 데이터로 즉시 다시 그린다.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.kiwoom-group-up, .kiwoom-group-down');
  if (!btn || btn.disabled || !lastKiwoomData) return;
  const key = btn.dataset.key;
  const idx = kiwoomGroupOrder.indexOf(key);
  const targetIdx = btn.classList.contains('kiwoom-group-up') ? idx - 1 : idx + 1;
  if (idx === -1 || targetIdx < 0 || targetIdx >= kiwoomGroupOrder.length) return;
  [kiwoomGroupOrder[idx], kiwoomGroupOrder[targetIdx]] = [kiwoomGroupOrder[targetIdx], kiwoomGroupOrder[idx]];
  renderKiwoomBalance(lastKiwoomData);
});

// 증권사명/계좌명 클릭 → 각각 직접 수정(다른 곳의 계좌명 수정과 같은 prompt() 방식). 새로고침해도
// 유지되도록 kiwoomGroupOverrides(core.js 에서 선언, 저장/불러오기 대상)에 저장한다.
document.addEventListener('click', (e) => {
  const el = e.target.closest('.kiwoom-group-name-edit');
  if (!el) return;
  const key = el.dataset.key;
  const field = el.dataset.field; // 'broker' | 'account'
  const label = field === 'broker' ? '증권사명' : '계좌명';
  const current = (kiwoomGroupOverrides[key] && kiwoomGroupOverrides[key][field]) || el.textContent;
  const newValue = prompt(`${label}을 입력하세요.`, current);
  if (newValue === null) return;
  const trimmed = newValue.trim();
  if (!trimmed) { showFieldStatus(el, '이름은 비워둘 수 없습니다.', 'error'); return; }
  kiwoomGroupOverrides[key] = kiwoomGroupOverrides[key] || {};
  kiwoomGroupOverrides[key][field] = trimmed;
  el.textContent = trimmed;
  // "📋 요약" 박스가 계좌 모드일 때 바뀐 이름이 바로 반영되도록 함께 다시 그린다.
  if (typeof renderStockSummary === 'function') renderStockSummary();
});

// 반환값(true/false)으로 호출자가 성공 여부를 알 수 있게 한다 — refreshAllPrices 가 이 결과를
// 기다리지 않고(await 누락) 곧바로 자기 성공 메시지를 띄우면, 여기서 보여준 실패 메시지가
// 화면에 뜨자마자 덮어써져 사라지는 버그가 있었다.
async function loadKiwoomBalance(){
  const btn = document.getElementById('kiwoomRefreshBtn');
  let ok = true;
  // 여러 계좌를 순서대로 조회하느라 응답이 몇 초 걸릴 수 있어, 끝날 때까지 버튼을 잠그고
  // "불러오는중"으로 바꿔서 지금 진행 중이라는 걸 보여준다.
  await withButtonLoading(btn, '불러오는중', async () => {
    try {
      const res = await fetch('/api/kiwoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentUserId }),
      });
      const json = await res.json().catch(() => ({}));
      // 서버는 사용자용 메시지(error)와 원인(detail)을 따로 내려주는데, detail 을 화면에
      // 안 띄우면 "오류가 발생했습니다"만 보여서 뭐가 문제인지 알 방법이 없다.
      if (!res.ok) throw new Error((json.error || '계좌 잔고를 불러오지 못했습니다.') + (json.detail ? ` (${json.detail})` : ''));
      renderKiwoomBalance(json);
      document.getElementById('kiwoomUpdatedAt').textContent = `${new Date().toLocaleTimeString('ko-KR')} 기준`;
    } catch (e) {
      showFieldStatus(btn, e.message, 'error');
      ok = false;
    }
  });
  return ok;
}

// 로그인 상태가 바뀔 때마다(로그인/게스트/로그아웃) 호출된다 — auth-box.js 의 setAccountUI() 가
// showAdminButtonIfAdmin() 과 같은 방식으로 훅을 걸어준다. 잔고는 키움 API 호출 비용/속도
// 때문에 주기적으로 자동 갱신하지 않고, 로그인 직후 한 번과 새로고침 버튼(이 패널의 버튼,
// 또는 "종목 마스터"의 금액 불러오기 버튼) 클릭 시에만 가져온다.
function updateKiwoomPanelVisibility(){
  const panel = document.getElementById('kiwoomPanel');
  if (!panel) return;
  const shouldShow = currentUserId === KIWOOM_OWNER_ID;
  panel.style.display = shouldShow ? '' : 'none';
  if (shouldShow) loadKiwoomBalance();
}

// 이 버튼은 "종목 마스터"의 금액 불러오기와 같은 동작(refreshAllPrices)을 한다 — 그 함수
// 자체가 끝에 계좌 잔고(키움)도 함께 갱신하도록 이미 연결돼 있어, 티커 가격과 잔고가 한 번에 맞춰진다.
document.getElementById('kiwoomRefreshBtn').addEventListener('click', (e) => refreshAllPrices(e.currentTarget, '불러오는중'));

// auth-box.js 의 로그인 유지 복원은 이 스크립트가 로드되기 전에 이미 실행됐을 수 있어(그때는
// 이 함수가 아직 없어 setAccountUI 안의 typeof 가드가 조용히 넘어간다), 여기서 한 번 더
// currentUserId 기준으로 패널 표시를 맞춘다.
updateKiwoomPanelVisibility();
