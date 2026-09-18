// ==== "📋 요약" 박스: 종목별 또는 계좌별 합산 표 (라디오로 전환) ====

let summaryMode = 'stock'; // 'stock' | 'account'

const SUMMARY_VIEWS = {
  stock: {
    note: '모든 계좌를 통틀어 같은 종목을 합산한 금액입니다. (현금 포함)',
    theadHtml: '<tr><th>종목</th><th>보유 계좌 수</th><th>합계 평가금액(만원)</th><th>비중(%)</th></tr>',
    colgroupHtml: '<col style="width:auto;"><col style="width:90px;"><col style="width:140px;"><col style="width:90px;">',
    emptyMessage: '계좌별 리밸런싱 현황에 종목을 추가하면 여기에 요약이 표시됩니다.',
    colspan: 4,
    nameColIndex: 0,
    fitColIndexes: [1, 2, 3],
  },
  account: {
    // 매입가/손익 개념은 수동 입력 표(계좌별 리밸런싱 현황)에는 없고 My Data(키움 실계좌)에만
    // 있어서, 평가금액은 두 데이터를 합치고 평가손익/수익률은 키움 데이터가 있는 계좌만 계산한다.
    note: '증권사+계좌별 평가금액/평가손익/수익률입니다. 평가금액은 계좌별 리밸런싱 현황(수동 입력)과 My Data(키움 실계좌)를 더한 값이고, 평가손익/수익률은 My Data가 있는 계좌만 계산됩니다.',
    theadHtml: '<tr><th>증권사</th><th>계좌</th><th>평가금액(만원)</th><th>평가손익(만원)</th><th>수익률(%)</th></tr>',
    colgroupHtml: '<col style="width:90px;"><col style="width:auto;"><col style="width:130px;"><col style="width:130px;"><col style="width:90px;">',
    emptyMessage: '계좌별 리밸런싱 현황 또는 My Data에 데이터가 있으면 여기에 요약이 표시됩니다.',
    colspan: 5,
    nameColIndex: 1,
    fitColIndexes: [2, 3, 4],
  },
};

function summaryColorClass(n){
  return n > 0 ? 'remark-up' : (n < 0 ? 'remark-down' : '');
}

function renderStockSummary(){
  const view = SUMMARY_VIEWS[summaryMode];
  document.getElementById('summaryNote').textContent = view.note;
  document.getElementById('summaryThead').innerHTML = view.theadHtml;
  document.getElementById('summaryColgroup').innerHTML = view.colgroupHtml;
  if (summaryMode === 'stock') renderSummaryByStock(view); else renderSummaryByAccount(view);
}

// 종목별 평가금액 요약: 모든 계좌를 통틀어 같은 종목끼리 평가금액을 합산
function renderSummaryByStock(view){
  const tbody = document.getElementById('stockSummaryBody');
  tbody.innerHTML = '';

  const byStock = new Map(); // name -> { total, accountSet }
  let grandTotal = 0;
  groups.forEach(g => {
    g.rows.forEach(r => {
      const entry = byStock.get(r.stock) || { total: 0, accounts: new Set() };
      entry.total += r.M;
      entry.accounts.add(g.broker + '·' + g.account);
      byStock.set(r.stock, entry);
      grandTotal += r.M;
    });
  });

  const rows = Array.from(byStock.entries())
    .filter(([, entry]) => entry.total !== 0)
    .sort((a, b) => b[1].total - a[1].total);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${view.colspan}" style="text-align:center; color:var(--muted);">${view.emptyMessage}</td></tr>`;
    fitSummaryLayout(view);
    return;
  }

  rows.forEach(([name, entry]) => {
    const pct = grandTotal > 0 ? (entry.total / grandTotal * 100) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="summary-name">${name}</span></td>
      <td class="num">${entry.accounts.size}</td>
      <td class="num">${fmt(entry.total)}</td>
      <td class="num">${fmtTrim(pct, 1)}</td>
    `;
    tbody.appendChild(tr);
  });

  fitSummaryLayout(view);
}

// 증권사+계좌별로 "계좌별 리밸런싱 현황"(수동, 만원 단위)과 "My Data"(키움 실계좌, 원 단위 →
// 만원으로 환산)를 더한다. 같은 증권사+계좌 문자열이면 두 데이터를 합산, 한쪽에만 있으면
// 그 데이터만으로 표시한다.
function renderSummaryByAccount(view){
  const tbody = document.getElementById('stockSummaryBody');
  tbody.innerHTML = '';

  const byAccount = new Map(); // "증권사·계좌" -> { broker, account, evalM, profitM, hasKiwoom }

  groups.forEach(g => {
    const key = g.broker + '·' + g.account;
    const sumM = g.rows.reduce((s, r) => s + r.M, 0);
    const entry = byAccount.get(key) || { broker: g.broker, account: g.account, evalM: 0, profitM: 0, hasKiwoom: false };
    entry.evalM += sumM;
    byAccount.set(key, entry);
  });

  const kiwoomHoldings = (typeof lastKiwoomData !== 'undefined' && lastKiwoomData && lastKiwoomData.holdings) || [];
  kiwoomHoldings.forEach(h => {
    // My Data 표에서 사용자가 직접 지정한 증권사명/계좌명(kiwoomGroupOverrides)이 있으면 그걸
    // 쓴다 — 서버가 내려주는 원본 값(환경변수 라벨 등) 대신 사용자가 실제로 부르는 이름을 써야
    // "계좌별 리밸런싱 현황"에 같은 이름으로 수동 입력해둔 행과 하나로 합쳐진다.
    const groupKey = `${h.broker}|${h.account}|${h.accountType}`;
    const override = kiwoomGroupOverrides[groupKey] || {};
    const displayBroker = override.broker || h.broker;
    const displayAccount = override.account || h.account;
    const key = displayBroker + '·' + displayAccount;
    const entry = byAccount.get(key) || { broker: displayBroker, account: displayAccount, evalM: 0, profitM: 0, hasKiwoom: false };
    entry.evalM += (h.evalAmount || 0) / 10000;
    entry.profitM += (h.evalProfit || 0) / 10000;
    entry.hasKiwoom = true;
    byAccount.set(key, entry);
  });

  const rows = Array.from(byAccount.values())
    .filter(entry => entry.evalM !== 0)
    .sort((a, b) => b.evalM - a.evalM);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${view.colspan}" style="text-align:center; color:var(--muted);">${view.emptyMessage}</td></tr>`;
    fitSummaryLayout(view);
    return;
  }

  rows.forEach(entry => {
    // 평가손익 = 평가금액 - 매입금액 관계를 거꾸로 써서 매입금액을 역산 — 개별 종목 매입가를
    // 따로 안 내려주는 키움 계좌 합계에도 쓰던 방식과 동일.
    const purchaseM = entry.evalM - entry.profitM;
    const rate = entry.hasKiwoom && purchaseM ? (entry.profitM / purchaseM) * 100 : null;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${entry.broker}</td>
      <td><span class="summary-name">${entry.account}</span></td>
      <td class="num">${fmt(entry.evalM)}</td>
      <td class="num ${entry.hasKiwoom ? summaryColorClass(entry.profitM) : ''}">${entry.hasKiwoom ? fmt(entry.profitM) : '-'}</td>
      <td class="num ${entry.hasKiwoom ? summaryColorClass(rate) : ''}">${rate !== null ? fmtTrim(rate, 2) : '-'}</td>
    `;
    tbody.appendChild(tr);
  });

  fitSummaryLayout(view);
}

document.getElementById('summaryModeStock').addEventListener('change', () => { summaryMode = 'stock'; renderStockSummary(); });
document.getElementById('summaryModeAccount').addEventListener('change', () => { summaryMode = 'account'; renderStockSummary(); });

// 종목/계좌 두 모드가 공통으로 거치는 마무리 처리. 이름 컬럼(종목명 또는 계좌명) 위치가 모드마다
// 달라(view.nameColIndex) fitNameColumn 에 그 위치를 넘겨준다.
function fitSummaryLayout(view){
  const table = document.getElementById('stockSummaryTable');
  fitNameColumn(table, document.querySelectorAll('#stockSummaryBody .summary-name'),
                NAME_COL_MIN_W, NAME_COL_MAX_W, view.nameColIndex);

  const headerCells = table.querySelectorAll('thead th');
  const bodyRows = Array.from(document.querySelectorAll('#stockSummaryBody tr'))
    .filter(r => r.children.length > 1); // "데이터 없음" 안내 행(colspan) 제외
  view.fitColIndexes.forEach(colIdx => {
    const cellEls = bodyRows.map(r => r.children[colIdx]).filter(Boolean);
    fitSimpleColumnWidth(table, colIdx, headerCells[colIdx], cellEls, 36, 220);
  });
  syncTableMinWidth(table);
}
