// ==== "📋 종목별 평가금액 요약" 박스: 종목별 합산 표 ====

// 종목별 평가금액 요약: 모든 계좌를 통틀어 같은 종목끼리 평가금액을 합산
function renderStockSummary(){
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
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--muted);">계좌별 리밸런싱 현황에 종목을 추가하면 여기에 요약이 표시됩니다.</td></tr>`;
    fitSummaryLayout();
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

  fitSummaryLayout();
}

// 종목이 없는 경로와 있는 경로가 똑같이 거쳐야 하는 마무리 처리.
function fitSummaryLayout(){
  const table = document.getElementById('stockSummaryTable');
  fitNameColumn(table, document.querySelectorAll('#stockSummaryBody .summary-name'),
                NAME_COL_MIN_W, NAME_COL_MAX_W);

  const headerCells = table.querySelectorAll('thead th');
  const bodyRows = Array.from(document.querySelectorAll('#stockSummaryBody tr'))
    .filter(r => r.children.length > 1); // "데이터 없음" 안내 행(colspan) 제외
  [1, 2, 3].forEach(colIdx => {
    const cellEls = bodyRows.map(r => r.children[colIdx]).filter(Boolean);
    fitSimpleColumnWidth(table, colIdx, headerCells[colIdx], cellEls, 36, 220);
  });
  syncTableMinWidth(table);
}
