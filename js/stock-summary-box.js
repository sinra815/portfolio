// ==== "📋 종목별 평가금액 요약" 박스: 파이 차트 + 종목별 합산 표 ====

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
  const chartEl = document.getElementById('stockPieChart');
  const legendEl = document.getElementById('stockPieLegend');

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted);">계좌별 리밸런싱 현황에 종목을 추가하면 여기에 요약이 표시됩니다.</td></tr>`;
    chartEl.style.background = '#eef1f6';
    legendEl.innerHTML = `<span style="color:var(--muted);">데이터 없음</span>`;
    resizePieChartToTable();
    return;
  }

  const PIE_COLORS = ['#2563eb','#16a34a','#dc2626','#e0a94f','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#4b5563'];
  let cursor = 0;
  const gradientParts = [];
  const legendParts = [];
  rows.forEach(([name, entry], i) => {
    const pct = grandTotal > 0 ? (entry.total / grandTotal * 100) : 0;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    const start = cursor;
    const end = cursor + pct;
    gradientParts.push(`${color} ${start}% ${end}%`);
    cursor = end;
    legendParts.push(`<span style="display:flex; align-items:center; gap:5px;"><span style="width:9px; height:9px; border-radius:2px; background:${color}; flex:0 0 auto;"></span>${name} (${fmtTrim(pct,1)}%)</span>`);
  });
  chartEl.style.background = `conic-gradient(${gradientParts.join(', ')})`;
  legendEl.innerHTML = legendParts.join('');

  rows.forEach(([name, entry]) => {
    const m = master.find(x => x.name === name);
    const type = name === '현금' ? '현금' : (m ? ((m.type || 'stock') === 'cash' ? '현금' : '주식') : '-');
    const pct = grandTotal > 0 ? (entry.total / grandTotal * 100) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${name}</td>
      <td class="num">${type}</td>
      <td class="num">${entry.accounts.size}</td>
      <td class="num">${fmt(entry.total)}</td>
      <td class="num">${fmtTrim(pct, 1)}</td>
    `;
    tbody.appendChild(tr);
  });

  resizePieChartToTable();
}

// 원형 차트 크기를 오른쪽 표의 실제 높이에 비례해서 맞춤
function resizePieChartToTable(){
  const table = document.getElementById('stockSummaryTable');
  const chartEl = document.getElementById('stockPieChart');
  if (!table || !chartEl) return;
  const h = table.getBoundingClientRect().height;
  const size = Math.max(100, Math.min(320, Math.round(h * 0.8)));
  chartEl.style.width = size + 'px';
  chartEl.style.height = size + 'px';
}
