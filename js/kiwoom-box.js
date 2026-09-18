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
    <div><span style="color:var(--muted);">총평가금액</span> <strong>${fmt(data.totalEvalAmount)}</strong></div>
    <div><span style="color:var(--muted);">총평가손익</span> <strong class="${kiwoomColorClass(data.totalEvalProfit)}">${fmt(data.totalEvalProfit)}</strong></div>
    <div><span style="color:var(--muted);">총수익률</span> <strong class="${kiwoomColorClass(data.totalProfitRate)}">${fmtTrim(data.totalProfitRate, 2)}%</strong></div>
    <div><span style="color:var(--muted);">예수금(국내)</span> <strong>${fmt(data.cashBalance)}</strong></div>
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

  // "📊 계좌별 리밸런싱 현황"과 같은 방식(비중→목표금액→목표가→차액→비고→과비중)으로
  // 계산한다 — 목표비중(%)만 사용자가 직접 입력하고(kiwoomHoldingWeights), 나머지는 그
  // 표와 똑같은 단계(%)/과비중 임계값(%) 입력을 그대로 써서 계산한다. 현금성 종목(예수금)은
  // 매뉴얼 표처럼 목표가를 항상 100% 기준으로 계산한다. My Data는 계좌당 예수금 행이 최대
  // 1개뿐이라, 매뉴얼 표의 "현금성자산 여러 행 병합" 로직 없이 그 행 자신의 값을 그대로 쓴다.
  const stage = (parseFloat(document.getElementById('stagePercentInput').value) || 0) / 100;
  const threshold = (parseFloat(document.getElementById('overweightThreshold').value) || 0) / 100;

  // 계좌(증권사+계좌+계좌유형)별로 나뉘어 있던 여러 개의 표를, "계좌별 리밸런싱 현황"처럼
  // 증권사·계좌 컬럼을 rowspan으로 병합한 하나의 표로 합친다. 계좌 셀은 그 계좌의 보유종목
  // 행 + 소계 행(rows.length+1)만큼, 증권사 셀은 순서상 연속된 같은 증권사 계좌들을 모아
  // 그 합만큼 병합한다(메인 테이블의 brokerRenderAt/brokerSpan과 같은 방식).
  const groupsData = order.map((key) => {
    const rows = groupMap.get(key);
    const [broker, account, accountType] = key.split('|');
    const override = kiwoomGroupOverrides[key] || {};
    const brokerDisplay = override.broker || broker;
    const accountDisplay = override.account || account;
    const subEval = rows.reduce((s, h) => s + (h.evalAmount || 0), 0);
    const subProfit = rows.reduce((s, h) => s + (h.evalProfit || 0), 0);
    const subPurchase = rows.reduce((s, h) => s + ((h.evalAmount || 0) - (h.evalProfit || 0)), 0);
    const subRate = subPurchase ? (subProfit / subPurchase) * 100 : 0;
    return { key, rows, accountType, brokerDisplay, accountDisplay, subEval, subProfit, subRate, rowspan: rows.length + 1 };
  });

  const brokerRenderAt = groupsData.map((g, i) => i === 0 || groupsData[i - 1].brokerDisplay !== g.brokerDisplay);
  const brokerSpan = groupsData.map((g, i) => {
    if (!brokerRenderAt[i]) return 0;
    let span = g.rowspan;
    for (let j = i + 1; j < groupsData.length && groupsData[j].brokerDisplay === g.brokerDisplay; j++) span += groupsData[j].rowspan;
    return span;
  });

  let bodyHtml = '';
  groupsData.forEach((gd, gi) => {
    const { key, rows, accountType, brokerDisplay, accountDisplay, subEval, subProfit, subRate, rowspan } = gd;

    rows.forEach((h, ri) => {
      const holdingKey = `${key}::${h.code || h.name}`;
      const weight = kiwoomHoldingWeights[holdingKey] || 0;
      const target = subEval * weight / 100; // 목표금액
      const targetPrice = h.isCash ? target : target * stage; // 목표가(현금성은 항상 100% 기준)
      const diff = targetPrice - (h.evalAmount || 0); // 차액
      const remark = diff < 0 ? '축소' : (diff > 0 ? '확대' : '');
      const ratio = subEval > 0 ? roundDown(Math.abs(diff) / subEval, 3) : 0;
      const overweight = ratio >= threshold;

      let rowCells = '';
      if (ri === 0) {
        if (brokerRenderAt[gi]) {
          rowCells += `<td class="grp-cell grp-cell-broker" rowspan="${brokerSpan[gi]}"><span class="kiwoom-group-name-edit" data-key="${kiwoomEscapeHtml(key)}" data-field="broker" title="클릭하여 증권사명 변경">${kiwoomEscapeHtml(brokerDisplay)}</span></td>`;
        }
        rowCells += `<td class="grp-cell grp-cell-account" rowspan="${rowspan}"><span class="kiwoom-group-name-edit" data-key="${kiwoomEscapeHtml(key)}" data-field="account" title="클릭하여 계좌명 변경">${kiwoomEscapeHtml(accountDisplay)}</span> <span style="color:var(--muted); font-size:11px;">(${kiwoomEscapeHtml(accountType)})</span></td>`;
      }

      // 보유수량/평가손익/수익률은 참고용이라 흐리게(kiwoom-disabled-cell), 현재가/평가금액은
      // 실제 리밸런싱 판단에 쓰는 금액이라 또렷하게 남긴다.
      rowCells += `
        <td>${kiwoomEscapeHtml(h.name)}</td>
        <td><div class="stepper">
          <input type="text" class="cell-input kiwoom-weight-input numpad-trigger" data-label="${kiwoomEscapeHtml(h.name)} 목표비중(%)" data-key="${kiwoomEscapeHtml(holdingKey)}" value="${weight}" readonly>
          <span class="spin-btns">
            <button type="button" class="step-btn kiwoom-step-up" data-key="${kiwoomEscapeHtml(holdingKey)}" data-step="1">▲</button>
            <button type="button" class="step-btn kiwoom-step-down" data-key="${kiwoomEscapeHtml(holdingKey)}" data-step="1">▼</button>
          </span>
        </div></td>
        <td class="num">${fmt(target)}</td>
        <td class="num kiwoom-disabled-cell">${h.qty != null ? fmt(h.qty) : '-'}</td>
        <td class="num">${h.currentPrice != null ? fmt(h.currentPrice) : '-'}</td>
        <td class="num">${fmt(h.evalAmount)}</td>
        <td class="num kiwoom-disabled-cell ${kiwoomColorClass(h.evalProfit)}">${fmt(h.evalProfit)}</td>
        <td class="num kiwoom-disabled-cell ${kiwoomColorClass(h.profitRate)}">${fmtTrim(h.profitRate, 2)}%</td>
        <td class="num">${fmt(targetPrice)}</td>
        <td class="num ${diff < 0 ? 'remark-down' : (diff > 0 ? 'remark-up' : '')}">${fmt(diff)}</td>
        <td class="center ${remark === '확대' ? 'remark-up' : (remark === '축소' ? 'remark-down' : '')}">${remark}</td>
        <td class="num center">${h.isCash ? fmt(diff) : ''}</td>
        <td class="center">${overweight ? `<span class="flag-o">O</span>` : ''}</td>
      `;
      bodyHtml += `<tr${ri === 0 ? ' class="group-first"' : ''}>${rowCells}</tr>`;
    });

    // 소계 행. 증권사·계좌 컬럼은 위 첫 행의 rowspan이 이미 덮고 있으므로 이 행에서는 다시
    // 만들지 않고, "종목" 자리부터 colspan=2로 소계 라벨(+이동 버튼)을 넣는다 — 소계 라벨이
    // 앞에 별도로 증권사·계좌 칸을 또 차지하면 rowspan과 겹쳐 이후 값들이 두 칸씩 밀린다.
    bodyHtml += `
      <tr class="subtotal-row">
        <td colspan="2" class="center">
          <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
            <span>소계</span>
            <span class="spin-btns">
              <button type="button" class="group-move-btn kiwoom-group-up" data-key="${kiwoomEscapeHtml(key)}" title="위로 이동" ${gi === 0 ? 'disabled' : ''}>▲</button>
              <button type="button" class="group-move-btn kiwoom-group-down" data-key="${kiwoomEscapeHtml(key)}" title="아래로 이동" ${gi === groupsData.length - 1 ? 'disabled' : ''}>▼</button>
            </span>
          </div>
        </td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td class="num">${fmt(subEval)}</td>
        <td class="num ${kiwoomColorClass(subProfit)}">${fmt(subProfit)}</td>
        <td class="num ${kiwoomColorClass(subRate)}">${fmtTrim(subRate, 2)}%</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
      </tr>
    `;
  });

  container.innerHTML = `
    <div class="table-scroll">
      <table class="price-table kiwoom-table">
        <colgroup>
          <col style="width:70px;">
          <col style="width:90px;">
          <col style="width:auto;">
          <col style="width:90px;">
          <col style="width:100px;">
          <col style="width:90px;">
          <col style="width:100px;">
          <col style="width:110px;">
          <col style="width:100px;">
          <col style="width:80px;">
          <col style="width:100px;">
          <col style="width:100px;">
          <col style="width:60px;">
          <col style="width:100px;">
          <col style="width:70px;">
        </colgroup>
        <thead><tr>
          <th>증권사</th><th>계좌</th><th>종목</th><th>비중(%)</th><th>목표금액</th><th>보유수량</th><th>현재가</th>
          <th>평가금액</th><th>평가손익</th><th>수익률</th><th>목표가</th><th>차액</th><th>비고</th><th>현금성자산</th><th>과비중</th>
        </tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;

  // "📋 요약" 박스(계좌 모드)와 "⚙️ 설정" 박스의 평가금액 합계가 My Data 최신값을 바로
  // 반영하도록 함께 다시 그린다.
  if (typeof renderStockSummary === 'function') renderStockSummary();
  if (typeof renderMainTable === 'function') renderMainTable();
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
  // 증권사명·계좌명이 둘 다 확정되는 순간 표가 새로 나타날 수 있어(위 renderKiwoomBalance의
  // confirmed 조건), 단순히 라벨 텍스트만 바꾸지 않고 전체를 다시 그린다.
  if (lastKiwoomData) renderKiwoomBalance(lastKiwoomData);
});

// My Data 종목별 목표비중(%) 입력 — "계좌별 리밸런싱 현황"의 weight-input/step-btn과 같은
// 동작이지만, groups[g].rows[r] 대신 kiwoomHoldingWeights(홀딩 키 기준)에 저장한다는 점만
// 다르다. 클래스명을 kiwoom- 접두어로 따로 둬서 main-table-box.js의 전역 핸들러(data-g/data-r
// 기준)와 서로 간섭하지 않게 한다.
document.addEventListener('input', (e) => {
  if (!e.target.classList.contains('kiwoom-weight-input')) return;
  const key = e.target.dataset.key;
  kiwoomHoldingWeights[key] = parseFloat(e.target.value) || 0;
  if (lastKiwoomData) renderKiwoomBalance(lastKiwoomData);
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.kiwoom-step-up, .kiwoom-step-down');
  if (!btn) return;
  const key = btn.dataset.key;
  const step = parseFloat(btn.dataset.step) || 1;
  const delta = btn.classList.contains('kiwoom-step-up') ? step : -step;
  kiwoomHoldingWeights[key] = Math.max(0, Number(kiwoomHoldingWeights[key] || 0) + delta);
  if (lastKiwoomData) renderKiwoomBalance(lastKiwoomData);
});

// 로그인 시 updateKiwoomPanelVisibility() 와 applyLoadedData() 두 경로가 거의 동시에 이 함수를
// 각각 호출할 수 있어(서로 존재를 모름), 그대로 두면 같은 kiwoomRefreshBtn을 두고 withButtonLoading
// 두 개가 동시에 돌면서 서로의 "원래 텍스트" 기록을 어긋나게 만들어 버튼이 "불러오는중"에 영영
// 멈춰버리는 경합이 있었다. 진행 중인 호출이 있으면 새로 시작하지 않고 그 결과를 그대로 같이
// 기다리게 해서 막는다.
let kiwoomBalanceInFlight = null;

// 반환값(true/false)으로 호출자가 성공 여부를 알 수 있게 한다 — refreshAllPrices 가 이 결과를
// 기다리지 않고(await 누락) 곧바로 자기 성공 메시지를 띄우면, 여기서 보여준 실패 메시지가
// 화면에 뜨자마자 덮어써져 사라지는 버그가 있었다.
function loadKiwoomBalance(){
  // 이미 진행 중인 호출이 있으면(joiner) 그 Promise를 그대로 돌려준다 — 이 Promise는 아래에서
  // 성공 여부(true/false)로 resolve되므로, 나중에 합류한 호출자도 같은 결과를 정확히 받는다.
  if (kiwoomBalanceInFlight) return kiwoomBalanceInFlight;
  const btn = document.getElementById('kiwoomRefreshBtn');
  const run = (async () => {
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
  })();
  kiwoomBalanceInFlight = run.finally(() => { kiwoomBalanceInFlight = null; });
  return kiwoomBalanceInFlight;
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
