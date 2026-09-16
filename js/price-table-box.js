// ==== "📌 종목 마스터" 박스 ====

function renderPriceTable(){
  master.sort((a, b) => ((a.type === 'cash') ? 1 : 0) - ((b.type === 'cash') ? 1 : 0));

  const tbody = document.getElementById('priceBody');
  tbody.innerHTML = '';
  master.forEach((m, idx) => {
    if (idx > 0 && m.type === 'cash' && master[idx - 1].type !== 'cash') {
      const divider = document.createElement('tr');
      divider.innerHTML = `<td colspan="5" style="padding:0; height:2px; background:var(--border-strong); border:none;"></td>`;
      tbody.appendChild(divider);
    }
    const count = groups.reduce((s,g) => s + g.rows.filter(r => r.stock === m.name && (Number(r.qty)||0) > 0).length, 0);
    const canMoveUp = idx > 0 && master[idx - 1].type === m.type;
    const canMoveDown = idx < master.length - 1 && master[idx + 1].type === m.type;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div style="display:flex; align-items:center; gap:4px;">
        <span class="stock-name-edit" data-idx="${idx}" title="클릭하여 종목명 변경" style="flex:1; min-width:0;">${m.name}</span>
        <span class="spin-btns">
          <button type="button" class="reorder-btn master-up" data-idx="${idx}" title="위로 이동" ${canMoveUp ? '' : 'disabled'}>▲</button>
          <button type="button" class="reorder-btn master-down" data-idx="${idx}" title="아래로 이동" ${canMoveDown ? '' : 'disabled'}>▼</button>
        </span>
        <button type="button" class="remove-stock-btn" data-idx="${idx}" title="종목 삭제" style="flex:0 0 auto; width:20px; height:22px; padding:0; border:1px solid var(--border-strong); border-radius:4px; background:#fff; color:var(--down); cursor:pointer; font-size:12px; line-height:1;">×</button>
      </div></td>
      <td style="text-align:left; padding:0;"><span class="ticker-edit" data-idx="${idx}" title="클릭하여 티커 변경" style="display:block; width:100%; height:100%; box-sizing:border-box; padding:5px 8px; cursor:pointer; color:var(--muted);">${m.ticker || '-'}</span></td>
      <td style="text-align:left;">
        <select class="stock-type-select" data-idx="${idx}" style="width:100%; min-width:72px; box-sizing:border-box; padding:4px 18px 4px 6px; border:1px solid var(--border-strong); border-radius:4px; font-size:12.5px; font-family:inherit; background:#fff;">
          <option value="stock" ${(m.type || 'stock') === 'stock' ? 'selected' : ''}>주식</option>
          <option value="cash" ${m.type === 'cash' ? 'selected' : ''}>현금</option>
        </select>
      </td>
      <td class="num">${count}</td>
      <td class="num"><input type="text" class="cell-input wide price-input numpad-trigger" data-label="${m.name} 현재가(원)" data-idx="${idx}" value="${m.price}" readonly></td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener('input', (e) => {
  if (e.target.classList.contains('price-input')) {
    const idx = +e.target.dataset.idx;
    master[idx].price = parseFloat(e.target.value) || 0;
    renderAll();
  }
});

// ---- 종목명 입력 시 자동완성 제안 + 티커 자동 입력 ----
let stockNameSuggestionMap = {};
let stockNameSearchTimer = null;

async function fetchStockNameSuggestions(q){
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q));
    const json = await res.json();
    return (json.items || []);
  } catch (e) {
    console.warn('종목명 자동완성 조회 오류:', e.message);
    return [];
  }
}

document.getElementById('newStockName').addEventListener('input', (e) => {
  const nameInput = e.target;
  const tickerInput = document.getElementById('newStockTicker');
  const q = nameInput.value.trim();

  clearTimeout(stockNameSearchTimer);
  if (!q) {
    stockNameSuggestionMap = {};
    document.getElementById('newStockNameList').innerHTML = '';
    return;
  }

  // 이미 받아온 제안 중 정확히 일치하는 종목이 있으면 티커를 바로 채운다.
  if (stockNameSuggestionMap[q]) {
    tickerInput.value = stockNameSuggestionMap[q];
  }

  stockNameSearchTimer = setTimeout(async () => {
    const items = await fetchStockNameSuggestions(q);
    stockNameSuggestionMap = {};
    items.forEach(item => { stockNameSuggestionMap[item.name] = item.ticker; });

    const datalist = document.getElementById('newStockNameList');
    datalist.innerHTML = '';
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.name;
      datalist.appendChild(option);
    });

    // 응답이 도착한 시점에도 입력값이 그대로 완전히 일치하면 티커를 채운다.
    if (stockNameSuggestionMap[nameInput.value.trim()]) {
      tickerInput.value = stockNameSuggestionMap[nameInput.value.trim()];
    }
  }, 250);
});

document.getElementById('addStockBtn').addEventListener('click', async (e) => {
  const nameInput = document.getElementById('newStockName');
  const tickerInput = document.getElementById('newStockTicker');
  const priceInput = document.getElementById('newStockPrice');
  const typeInput = document.getElementById('newStockType');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  if (master.some(m => m.name === name)) { showFieldStatus(e.currentTarget, '이미 등록된 종목명입니다.', 'error'); return; }

  let ticker = tickerInput.value.trim();
  // 자동완성에서 종목명을 고른 직후 바로 추가하면 티커 조회(디바운스)가 끝나기 전이라 비어 있을 수 있으므로,
  // 티커가 비어 있으면 추가 직전에 한 번 더 정확히 조회해서 채운다.
  if (!ticker) {
    if (stockNameSuggestionMap[name]) {
      ticker = stockNameSuggestionMap[name];
    } else {
      const items = await fetchStockNameSuggestions(name);
      const matched = items.find(item => item.name === name);
      if (matched) ticker = matched.ticker;
    }
  }

  master.push({ name, ticker, price: parseFloat(priceInput.value) || 0, type: typeInput.value });
  nameInput.value = '';
  tickerInput.value = '';
  priceInput.value = '0';
  typeInput.value = 'stock';
  renderAll();
});

document.getElementById('fetchAllPricesBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const targets = master.filter(m => (m.ticker || '').trim());
  if (targets.length === 0) { showFieldStatus(btn, '티커가 입력된 종목이 없습니다.', 'error'); return; }
  await withButtonLoading(btn, `불러오는 중... (0/${targets.length})`, async () => {
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      btn.textContent = `불러오는 중... (${i + 1}/${targets.length})`;
      const price = await fetchPriceForTicker(targets[i].ticker, { silent: true });
      if (price !== null) { targets[i].price = price; ok++; }
    }
    renderAll();
    showFieldStatus(btn, `${targets.length}개 중 ${ok}개 종목의 금액을 불러왔습니다.`);
  });
});

document.addEventListener('change', (e) => {
  if (e.target.classList.contains('stock-type-select')) {
    const idx = +e.target.dataset.idx;
    master[idx].type = e.target.value;
    renderAll();
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-stock-btn');
  if (!btn) return;
  const idx = +btn.dataset.idx;
  const removedName = master[idx].name;
  const usedCount = groups.reduce((s,g) => s + g.rows.filter(r => !r.cash && r.stock === removedName).length, 0);
  if (usedCount > 0 && !confirm(`"${removedName}"을(를) 사용 중인 계좌 항목이 ${usedCount}개 있습니다. 삭제하면 해당 항목에 "(삭제됨)" 표시가 붙습니다. 계속할까요?`)) return;
  master.splice(idx, 1);
  renderAll();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.master-up, .master-down');
  if (!btn || btn.disabled) return;
  const idx = +btn.dataset.idx;
  const target = btn.classList.contains('master-up') ? idx - 1 : idx + 1;
  if (target < 0 || target >= master.length) return;
  if (master[idx].type !== master[target].type) return;
  [master[idx], master[target]] = [master[target], master[idx]];
  renderAll();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('.stock-name-edit');
  if (!el) return;
  const idx = +el.dataset.idx;
  const oldName = master[idx].name;
  const newValue = prompt('새 종목명을 입력하세요.', oldName);
  if (newValue === null) return;
  const trimmed = newValue.trim();
  if (!trimmed) { showFieldStatus(el, '종목명은 비워둘 수 없습니다.', 'error'); return; }
  if (trimmed !== oldName && master.some((m, i) => i !== idx && m.name === trimmed)) {
    showFieldStatus(el, '이미 등록된 종목명입니다.', 'error');
    return;
  }
  master[idx].name = trimmed;
  groups.forEach(g => g.rows.forEach(r => { if (!r.cash && r.stock === oldName) r.stock = trimmed; }));
  renderAll();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('.ticker-edit');
  if (!el) return;
  const idx = +el.dataset.idx;
  const oldTicker = master[idx].ticker || '';
  const newValue = prompt('새 티커를 입력하세요.', oldTicker);
  if (newValue === null) return;
  master[idx].ticker = newValue.trim();
  renderAll();
});
