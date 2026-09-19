// ==== "📊 계좌별 리밸런싱 현황" 박스: 메인 테이블 렌더링 + 조작 ====

function renderMainTable(){
  const tbody = document.getElementById('mainBody');
  tbody.innerHTML = '';
  let grand = { D:0, G:0, H:0, I:0, J:0, K:0, M:0, N:0 };

  const groupRowspans = groups.map(g => g.rows.length + 2 + computeDividerCount(g));

  const brokerRenderAt = groups.map((g, i) => i === 0 || groups[i - 1].broker !== g.broker);
  const brokerSpan = groups.map((g, i) => {
    if (!brokerRenderAt[i]) return 0;
    let span = groupRowspans[i];
    for (let j = i + 1; j < groups.length && groups[j].broker === g.broker; j++) span += groupRowspans[j];
    return span;
  });

  groups.forEach((g, groupIdx) => {
    let dividerCount = 0;
    g.rows.forEach((r, i) => {
      if (i > 0 && getRowType(r) === 'cash' && getRowType(g.rows[i - 1]) !== 'cash') dividerCount++;
    });
    const groupRowspan = g.rows.length + 2 + dividerCount;
    let groupHeaderInserted = false;

    g.rows.forEach((r, idx) => {
      if (idx > 0 && getRowType(r) === 'cash' && getRowType(g.rows[idx - 1]) !== 'cash') {
        const divider = document.createElement('tr');
        divider.innerHTML = `<td colspan="12" style="padding:0; height:2px; background:var(--border-strong); border:none;"></td>`;
        tbody.appendChild(divider);
      }

      const tr = document.createElement('tr');
      if (idx === 0) tr.classList.add('group-first');

      let cells = '';
      if (!groupHeaderInserted) {
        if (brokerRenderAt[groupIdx]) {
          cells += `<td class="grp-cell grp-cell-broker" rowspan="${brokerSpan[groupIdx]}"><span class="group-name-edit" data-g="${g.__idx}" data-field="broker" title="클릭하여 증권사명 변경">${g.broker}</span></td>`;
        }
        cells += `<td class="grp-cell grp-cell-account" rowspan="${groupRowspan}"><span class="group-name-edit" data-g="${g.__idx}" data-field="account" title="클릭하여 계좌명 변경">${g.account}</span></td>`;
        groupHeaderInserted = true;
      }
      // 모든 행을 똑같이 다룬다. 이동은 핸들러가 같은 유형끼리만 교환하도록 막아주므로,
      // 현금성 행들은 (+ 종목 추가 시 항상 아래쪽에 붙는 규칙과 함께) 계속 아래쪽에 뭉쳐 있는다.
      const canMoveUp = idx > 0 && getRowType(g.rows[idx - 1]) === getRowType(r);
      const canMoveDown = idx < g.rows.length - 1 && getRowType(g.rows[idx + 1]) === getRowType(r);
      const stockExists = master.some(m => m.name === r.stock);
      const stockLabel = stockExists ? r.stock : `${r.stock} <span style="color:var(--down); font-size:11px;">(삭제됨)</span>`;
      cells += `<td class="label"><div style="display:flex; align-items:center; gap:4px;">
        <span style="flex:1; min-width:0;">${stockLabel}</span>
        <span class="spin-btns">
          <button type="button" class="reorder-btn row-up" data-g="${g.__idx}" data-r="${idx}" title="위로 이동" ${canMoveUp ? '' : 'disabled'}>▲</button>
          <button type="button" class="reorder-btn row-down" data-g="${g.__idx}" data-r="${idx}" title="아래로 이동" ${canMoveDown ? '' : 'disabled'}>▼</button>
        </span>
        <button type="button" class="row-delete-btn" data-g="${g.__idx}" data-r="${idx}" title="이 항목 삭제" style="flex:0 0 auto; width:20px; height:22px; padding:0; border:1px solid var(--border-strong); border-radius:4px; background:#fff; color:var(--down); cursor:pointer; font-size:12px; line-height:1;">×</button>
      </div></td>`;

      if (r.weight === null) {
        cells += `<td><div class="stepper">
          <span class="value-box">${fmtTrim(r.resolvedWeight,1)}</span>
          <span class="spin-btns spin-fake"><button type="button" class="step-btn" disabled>▲</button><button type="button" class="step-btn" disabled>▼</button></span>
        </div></td>`;
      } else {
        cells += `<td><div class="stepper">
          <input type="text" class="cell-input weight-input numpad-trigger" data-label="비중(%)" data-g="${g.__idx}" data-r="${idx}" value="${r.weight}" readonly>
          <span class="spin-btns">
            <button type="button" class="step-btn step-up" data-field="weight" data-g="${g.__idx}" data-r="${idx}" data-step="1">▲</button>
            <button type="button" class="step-btn step-down" data-field="weight" data-g="${g.__idx}" data-r="${idx}" data-step="1">▼</button>
          </span>
        </div></td>`;
      }

      cells += `<td>${fmt(r.G)}</td>`;

      cells += `<td><div class="stepper">
        <input type="text" class="cell-input avgprice-input numpad-trigger" data-label="${r.stock} 평균매입금액" data-g="${g.__idx}" data-r="${idx}" value="${r.avgPurchasePrice || 0}" readonly>
        <span class="spin-btns">
          <button type="button" class="step-btn step-up" data-field="avgPrice" data-g="${g.__idx}" data-r="${idx}" data-step="1">▲</button>
          <button type="button" class="step-btn step-down" data-field="avgPrice" data-g="${g.__idx}" data-r="${idx}" data-step="1">▼</button>
        </span>
      </div></td>`;

      cells += `<td><div class="stepper">
        <input type="text" class="cell-input qty-input numpad-trigger" data-label="${r.stock} 수량" data-g="${g.__idx}" data-r="${idx}" value="${r.qty}" readonly>
        <span class="spin-btns">
          <button type="button" class="step-btn step-up" data-field="qty" data-g="${g.__idx}" data-r="${idx}" data-step="1">▲</button>
          <button type="button" class="step-btn step-down" data-field="qty" data-g="${g.__idx}" data-r="${idx}" data-step="1">▼</button>
        </span>
      </div></td>`;

      cells += `<td>${fmt(getPrice(r.stock))}</td>`;
      cells += `<td>${fmt(r.M)}</td>`;
      cells += `<td class="${r.evalProfit<0?'remark-down':(r.evalProfit>0?'remark-up':'')}">${fmt(r.evalProfit)}</td>`;
      cells += `<td class="${r.evalProfit<0?'remark-down':(r.evalProfit>0?'remark-up':'')}">${fmtTrim(r.profitRate,2)}%</td>`;
      cells += `<td>${fmt(r.targetPrice)}</td>`;

      cells += `<td class="${r.N<0?'remark-down':(r.N>0?'remark-up':'')} ${r.isMaxDiff?'diff-maxgap':''}">${fmt(r.N)}</td>`;
      cells += `<td class="center ${r.remark==='확대'?'remark-up':(r.remark==='축소'?'remark-down':'')}">${r.remark}</td>`;

      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });

    const addOptions = `<option value="" selected>선택...</option>` + master.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    const addRowTr = document.createElement('tr');
    let addRowHead = '';
    if (!groupHeaderInserted) {
      addRowTr.classList.add('group-first');
      const brokerCellHtml = brokerRenderAt[groupIdx]
        ? `<td class="grp-cell grp-cell-broker" rowspan="${brokerSpan[groupIdx]}"><span class="group-name-edit" data-g="${g.__idx}" data-field="broker" title="클릭하여 증권사명 변경">${g.broker}</span></td>`
        : '';
      addRowHead = `${brokerCellHtml}<td class="grp-cell grp-cell-account" rowspan="${groupRowspan}"><span class="group-name-edit" data-g="${g.__idx}" data-field="account" title="클릭하여 계좌명 변경">${g.account}</span></td>`;
      groupHeaderInserted = true;
    }
    addRowTr.innerHTML = `
      ${addRowHead}
      <td colspan="12" style="text-align:left;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="color:var(--muted); font-size:12px;">+ 종목 추가:</span>
          <select class="add-row-select" data-g="${g.__idx}" style="padding:4px 6px; border:1px solid var(--border-strong); border-radius:4px; font-size:12.5px; font-family:inherit; background:#fff; max-width:220px;">${addOptions}</select>
          <button type="button" class="add-row-btn" data-g="${g.__idx}" style="padding:4px 10px; border-radius:5px; border:1px solid var(--border-strong); background:#fff; cursor:pointer; font-size:12px;">추가</button>
        </div>
      </td>
    `;
    tbody.appendChild(addRowTr);

    const sumG = g.rows.reduce((s,r)=>s+r.G,0);
    const sumM = g.rows.reduce((s,r)=>s+r.M,0);
    const sumPrevM = g.rows.reduce((s,r)=>s+r.prevM,0);
    const sumN = g.rows.reduce((s,r)=>s+r.N,0);
    const sumTarget = g.rows.reduce((s,r)=>s+r.targetPrice,0);

    const subtotalTr = document.createElement('tr');
    subtotalTr.classList.add('subtotal-row');
    subtotalTr.innerHTML = `
      <td colspan="2" class="center">
        <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
          <span>소계 (${g.broker} · ${g.account})</span>
          <span class="spin-btns">
            <button type="button" class="group-move-btn group-up" data-g="${g.__idx}" title="위로 이동" ${g.__idx === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="group-move-btn group-down" data-g="${g.__idx}" title="아래로 이동" ${g.__idx === groups.length - 1 ? 'disabled' : ''}>▼</button>
          </span>
          <button type="button" class="remove-group-btn" data-g="${g.__idx}" title="이 계좌(그룹) 삭제" style="padding:1px 6px; border-radius:4px; border:1px solid var(--border-strong); background:#fff; color:var(--down); cursor:pointer; font-size:11px; line-height:1.4;">그룹삭제</button>
        </div>
      </td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>${fmt(sumM)}</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td><td>-</td>
    `;
    tbody.appendChild(subtotalTr);

    grand.D += g.D;
    grand.G += sumG;
    grand.T = (grand.T||0) + sumTarget;
    grand.M += sumM;
    grand.prevM = (grand.prevM||0) + sumPrevM;
    grand.N += sumN;
  });

  // My Data(키움/NH 실계좌) 평가금액도 합산한다. My Data는 종목별 당일 등락률을 안 내려주므로
  // prevM(전일 추정치)에도 같은 값을 더해 전일대비 변동 계산에는 기여하지 않게 한다 — 그래야
  // My Data를 더했다고 전일대비가 그 금액만큼 갑자기 뛴 것처럼 보이지 않는다.
  const kiwoomTotalM = (typeof lastKiwoomData !== 'undefined' && lastKiwoomData) ? (lastKiwoomData.totalEvalAmount || 0) : 0;
  grand.M += kiwoomTotalM;
  grand.prevM = (grand.prevM || 0) + kiwoomTotalM;

  const totalMEl = document.getElementById('settingsTotalM');
  if (totalMEl) totalMEl.textContent = totalMHidden ? '••••••' : fmt(grand.M);

  const totalMChangeEl = document.getElementById('settingsTotalMChange');
  if (totalMChangeEl) {
    if (totalMHidden) {
      totalMChangeEl.innerHTML = '&nbsp;';
    } else {
      const change = grand.M - grand.prevM;
      const changePct = grand.prevM > 0 ? (change / grand.prevM * 100) : 0;
      const cls = change > 0 ? 'remark-up' : (change < 0 ? 'remark-down' : '');
      const sign = change > 0 ? '+' : (change < 0 ? '-' : '');
      totalMChangeEl.innerHTML = `<span class="${cls}">전일대비 ${sign}${fmt(Math.abs(change))} (${sign}${fmtTrim(Math.abs(changePct), 2)}%)</span>`;
    }
  }

  const addGroupTr = document.createElement('tr');
  addGroupTr.innerHTML = `
    <td colspan="14" style="text-align:left; background:#f5f6f8;">
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <span style="color:var(--muted); font-size:12px;">+ 계좌(그룹) 추가:</span>
        <input type="text" id="newGroupBroker" placeholder="증권사 (예: 키움)" style="width:120px; padding:4px 6px; border:1px solid var(--border-strong); border-radius:4px; font-size:12.5px; font-family:inherit;">
        <input type="text" id="newGroupAccount" placeholder="계좌 (예: 일반)" style="width:120px; padding:4px 6px; border:1px solid var(--border-strong); border-radius:4px; font-size:12.5px; font-family:inherit;">
        <button type="button" id="addGroupBtn" style="padding:5px 10px; border-radius:5px; border:1px solid var(--border-strong); background:#fff; cursor:pointer; font-size:12px;">+ 추가</button>
      </div>
    </td>
  `;
  tbody.appendChild(addGroupTr);

  const tfoot = document.getElementById('mainFoot');
  tfoot.innerHTML = `
    <tr class="total-row">
      <td colspan="2" class="center">합계</td>
      <td class="label">전체</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>${fmt(grand.M)}</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
    </tr>`;
}

document.addEventListener('input', (e) => {
  if (e.target.classList.contains('weight-input')) {
    const g = +e.target.dataset.g, r = +e.target.dataset.r;
    groups[g].rows[r].weight = parseFloat(e.target.value) || 0;
    renderAll();
  } else if (e.target.classList.contains('qty-input')) {
    const g = +e.target.dataset.g, r = +e.target.dataset.r;
    groups[g].rows[r].qty = parseFloat(e.target.value) || 0;
    renderAll();
  } else if (e.target.classList.contains('avgprice-input')) {
    const g = +e.target.dataset.g, r = +e.target.dataset.r;
    groups[g].rows[r].avgPurchasePrice = parseFloat(e.target.value) || 0;
    renderAll();
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.step-up, .step-down');
  if (!btn || btn.disabled) return;
  const g = +btn.dataset.g, r = +btn.dataset.r;
  const step = parseFloat(btn.dataset.step) || 1;
  const delta = btn.classList.contains('step-up') ? step : -step;
  const row = groups[g].rows[r];
  if (btn.dataset.field === 'weight') {
    row.weight = Math.max(0, Number(row.weight || 0) + delta);
  } else if (btn.dataset.field === 'qty') {
    row.qty = Math.max(0, Number(row.qty || 0) + delta);
  } else if (btn.dataset.field === 'avgPrice') {
    row.avgPurchasePrice = Math.max(0, Number(row.avgPurchasePrice || 0) + delta);
  }
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.row-up, .row-down');
  if (!btn || btn.disabled) return;
  const g = +btn.dataset.g, r = +btn.dataset.r;
  const rows = groups[g].rows;
  const target = btn.classList.contains('row-up') ? r - 1 : r + 1;
  if (target < 0 || target >= rows.length) return;
  if (getRowType(rows[target]) !== getRowType(rows[r])) return;
  [rows[r], rows[target]] = [rows[target], rows[r]];
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.row-delete-btn');
  if (!btn) return;
  const g = +btn.dataset.g, r = +btn.dataset.r;
  const row = groups[g].rows[r];
  if (!confirm(`"${row.stock}" 항목을 삭제할까요?`)) return;
  groups[g].rows.splice(r, 1);
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.add-row-btn');
  if (!btn) return;
  const g = +btn.dataset.g;
  const select = document.querySelector(`.add-row-select[data-g="${g}"]`);
  const stockName = select ? select.value : null;
  if (!stockName) { showFieldStatus(btn, '추가할 종목을 선택해주세요.', 'error'); return; }
  const rows = groups[g].rows;
  if (rows.some(r => r.stock === stockName)) {
    showFieldStatus(btn, `"${stockName}"은(는) 이미 이 계좌에 등록되어 있습니다.`, 'error');
    return;
  }
  const newRow = { stock: stockName, weight: 0, qty: 0, avgPurchasePrice: 0 };
  const masterItem = master.find(m => m.name === stockName);
  if (masterItem && masterItem.type === 'cash') {
    rows.push(newRow);  // 현금성 종목은 항상 아래쪽에 모아둔다
  } else {
    const firstCashTypeIdx = rows.findIndex(r => getRowType(r) === 'cash');
    if (firstCashTypeIdx === -1) rows.push(newRow); else rows.splice(firstCashTypeIdx, 0, newRow);
  }
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#addGroupBtn');
  if (!btn) return;
  const brokerInput = document.getElementById('newGroupBroker');
  const accountInput = document.getElementById('newGroupAccount');
  const broker = brokerInput.value.trim();
  const account = accountInput.value.trim();
  if (!broker || !account) { showFieldStatus(btn, '증권사와 계좌를 모두 입력해주세요.', 'error'); return; }
  if (groups.some(g => g.broker === broker && g.account === account)) {
    showFieldStatus(btn, '이미 같은 증권사·계좌 조합이 있습니다.', 'error');
    return;
  }
  groups.push({ broker, account, rows: [] });
  renderAll();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('.group-name-edit');
  if (!el) return;
  const g = +el.dataset.g;
  const field = el.dataset.field;
  const group = groups[g];
  const label = field === 'broker' ? '증권사명' : '계좌명';
  const newValue = prompt(`새 ${label}을 입력하세요.`, group[field]);
  if (newValue === null) return;
  const trimmed = newValue.trim();
  if (!trimmed) { showFieldStatus(el, `${label}은 비워둘 수 없습니다.`, 'error'); return; }
  const other = field === 'broker' ? group.account : group.broker;
  const dup = groups.some((gr, i) => i !== g &&
    (field === 'broker' ? gr.broker === trimmed && gr.account === other : gr.broker === other && gr.account === trimmed));
  if (dup) { showFieldStatus(el, '이미 같은 증권사·계좌 조합이 있습니다.', 'error'); return; }
  group[field] = trimmed;
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.group-up, .group-down');
  if (!btn || btn.disabled) return;
  const g = +btn.dataset.g;
  const target = btn.classList.contains('group-up') ? g - 1 : g + 1;
  if (target < 0 || target >= groups.length) return;
  [groups[g], groups[target]] = [groups[target], groups[g]];
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-group-btn');
  if (!btn) return;
  const g = +btn.dataset.g;
  const group = groups[g];
  if (!confirm(`"${group.broker} · ${group.account}" 계좌를 삭제할까요? 안에 있는 모든 종목도 함께 삭제됩니다.`)) return;
  groups.splice(g, 1);
  renderAll();
});

document.getElementById('stagePercentInput').addEventListener('input', renderAll);

// 이 박스(증권사·계좌·종목)만 초기화 — "종목 마스터"(master)는 건드리지 않는다.
document.getElementById('resetGroupsBtn').addEventListener('click', () => {
  if (!confirm('모든 증권사·계좌와 안에 있는 종목을 삭제할까요?')) return;
  groups = [];
  renderAll();
});
