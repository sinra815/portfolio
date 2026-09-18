// ==== "🏦 계좌 잔고 (키움)" 박스: 키움증권 REST API로 조회한 실제 계좌 잔고 (읽기 전용) ====
// 이 앱의 키움 앱키/시크릿은 sinra815 개인 계좌에 연결돼 있어, 서버(api/kiwoom-balance.js)가
// 그 ID로만 조회를 허용한다. 여기서는 그 계정으로 로그인했을 때만 패널을 보여주는 UI
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

function renderKiwoomBalance(data){
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

  // 증권사+계좌+계좌유형 조합별로 묶어 표를 나눈다 — 처음 등장하는 순서를 그대로 유지.
  const groupOrder = [];
  const groupMap = new Map();
  for (const h of data.holdings) {
    const key = kiwoomGroupKey(h);
    if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key); }
    groupMap.get(key).push(h);
  }

  container.innerHTML = groupOrder.map((key) => {
    const rows = groupMap.get(key);
    const [broker, account, accountType] = key.split('|');
    const title = kiwoomGroupNames[key] || `${broker} ${account} ${accountType}`;
    // 보유수량/평가손익/수익률은 참고용이라 흐리게(kiwoom-disabled-cell), 현재가/평가금액은
    // 실제 리밸런싱 판단에 쓰는 금액이라 또렷하게 남긴다. 예수금 행은 수량/손익/수익률 개념이
    // 없어 "-"로 표시.
    const rowsHtml = rows.map((h) => `
      <tr>
        <td>${kiwoomEscapeHtml(h.name)}</td>
        <td class="num kiwoom-disabled-cell">${h.qty != null ? fmt(h.qty) : '-'}</td>
        <td class="num">${h.currentPrice != null ? fmt(h.currentPrice) + ' 원' : '-'}</td>
        <td class="num">${fmt(h.evalAmount)} 원</td>
        <td class="num kiwoom-disabled-cell ${h.evalProfit != null ? kiwoomColorClass(h.evalProfit) : ''}">${h.evalProfit != null ? fmt(h.evalProfit) : '-'}</td>
        <td class="num kiwoom-disabled-cell ${h.profitRate != null ? kiwoomColorClass(h.profitRate) : ''}">${h.profitRate != null ? fmtTrim(h.profitRate, 2) + '%' : '-'}</td>
      </tr>
    `).join('');
    return `
      <div class="kiwoom-group-title">
        <span class="kiwoom-group-name-edit" data-key="${kiwoomEscapeHtml(key)}" title="클릭하여 표 이름 변경">${kiwoomEscapeHtml(title)}</span>
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
}

// 표 제목 클릭 → 이름 직접 수정(다른 곳의 계좌명 수정과 같은 prompt() 방식). 새로고침해도
// 유지되도록 kiwoomGroupNames(core.js 에서 선언, 저장/불러오기 대상)에 저장한다.
document.addEventListener('click', (e) => {
  const el = e.target.closest('.kiwoom-group-name-edit');
  if (!el) return;
  const key = el.dataset.key;
  const current = kiwoomGroupNames[key] || el.textContent;
  const newValue = prompt('표 이름을 입력하세요.', current);
  if (newValue === null) return;
  const trimmed = newValue.trim();
  if (!trimmed) { showFieldStatus(el, '이름은 비워둘 수 없습니다.', 'error'); return; }
  kiwoomGroupNames[key] = trimmed;
  el.textContent = trimmed;
});

async function loadKiwoomBalance(){
  const btn = document.getElementById('kiwoomRefreshBtn');
  // 여러 계좌를 순서대로 조회하느라 응답이 몇 초 걸릴 수 있어, 끝날 때까지 버튼을 잠그고
  // "새로고침 중..."으로 바꿔서 지금 진행 중이라는 걸 보여준다("금액 불러오기" 버튼과 동일한 패턴).
  await withButtonLoading(btn, '새로고침 중...', async () => {
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
    }
  });
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

document.getElementById('kiwoomRefreshBtn').addEventListener('click', loadKiwoomBalance);

// auth-box.js 의 로그인 유지 복원은 이 스크립트가 로드되기 전에 이미 실행됐을 수 있어(그때는
// 이 함수가 아직 없어 setAccountUI 안의 typeof 가드가 조용히 넘어간다), 여기서 한 번 더
// currentUserId 기준으로 패널 표시를 맞춘다.
updateKiwoomPanelVisibility();
