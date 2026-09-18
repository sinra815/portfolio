// ==== "🏦 계좌 잔고 (키움)" 박스: 키움증권 REST API로 조회한 실제 계좌 잔고 (읽기 전용) ====
// 이 앱의 키움 앱키/시크릿은 sinra815 개인 계좌에 연결돼 있어, 서버(api/kiwoom-balance.js)가
// 그 ID로만 조회를 허용한다. 여기서는 그 계정으로 로그인했을 때만 패널을 보여주는 UI
// 스위치일 뿐이고, 실제 접근 제어는 서버 쪽에서 한다 — 프런트 코드는 누구나 볼 수 있으므로
// 이 상수만으로는 아무것도 못 한다.
const KIWOOM_OWNER_ID = 'sinra815';

function kiwoomColorClass(n){
  return n > 0 ? 'remark-up' : (n < 0 ? 'remark-down' : '');
}

function renderKiwoomBalance(data){
  const failedNote = (data.failedAccounts && data.failedAccounts.length)
    ? `<div style="width:100%; color:var(--down); font-size:12px;">⚠ 일부 계좌 조회 실패: ${data.failedAccounts.join(', ')}</div>`
    : '';
  document.getElementById('kiwoomSummary').innerHTML = `
    <div><span style="color:var(--muted);">총평가금액</span> <strong>${fmt(data.totalEvalAmount)} 원</strong></div>
    <div><span style="color:var(--muted);">총평가손익</span> <strong class="${kiwoomColorClass(data.totalEvalProfit)}">${fmt(data.totalEvalProfit)} 원</strong></div>
    <div><span style="color:var(--muted);">총수익률</span> <strong class="${kiwoomColorClass(data.totalProfitRate)}">${fmtTrim(data.totalProfitRate, 2)}%</strong></div>
    <div><span style="color:var(--muted);">예수금(국내)</span> <strong>${fmt(data.cashBalance)} 원</strong></div>
    ${failedNote}
  `;
  const tbody = document.getElementById('kiwoomHoldingsBody');
  if (!data.holdings || data.holdings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--muted);">보유 종목이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.holdings.map(h => `
    <tr>
      <td>${h.broker || ''}</td>
      <td>${h.account || ''}</td>
      <td>${h.accountType || ''}</td>
      <td>${h.name}</td>
      <td class="num">${fmt(h.qty)}</td>
      <td class="num">${fmt(h.currentPrice)}</td>
      <td class="num">${fmt(h.evalAmount)}</td>
      <td class="num ${kiwoomColorClass(h.evalProfit)}">${fmt(h.evalProfit)}</td>
      <td class="num ${kiwoomColorClass(h.profitRate)}">${fmtTrim(h.profitRate, 2)}%</td>
    </tr>
  `).join('');
}

async function loadKiwoomBalance(){
  const btn = document.getElementById('kiwoomRefreshBtn');
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
