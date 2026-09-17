// ==== "📌 종목 마스터" 박스 ====

// 종목 컬럼은 등록된 종목명 중 가장 긴 것에 맞춰 폭을 넓힌다. 이름 칸에는 정렬·삭제 버튼이
// 함께 들어가서, 고정 폭으로 두면 글자에 남는 공간이 절반도 되지 않는다.
function fitMasterNameColumn(){
  const table = document.getElementById('priceBody').closest('table');
  if (!table) return;
  fitNameColumn(table, table.querySelectorAll('.stock-name-edit'),
                NAME_COL_MIN_W, NAME_COL_MAX_W);

  // 티커·보유 계좌 수는 단순 텍스트라 내용에 맞춰 폭을 줄인다.
  // 유형(select)·현재가(입력창+버튼)는 컨트롤 자체 크기가 필요해 고정 폭을 유지한다.
  const headerCells = table.querySelectorAll('thead th');
  const bodyRows = Array.from(document.getElementById('priceBody').querySelectorAll('tr'))
    .filter(r => r.children.length > 1); // 구분선 행(colspan) 제외
  fitSimpleColumnWidth(table, 1, headerCells[1], bodyRows.map(r => r.querySelector('.ticker-edit')).filter(Boolean), 50, 160);
  fitSimpleColumnWidth(table, 3, headerCells[3], bodyRows.map(r => r.children[3]).filter(Boolean), 36, 120);
  syncTableMinWidth(table);
}

// 전일대비 등락률(부호 있는 %) 셀 HTML. 아직 조회한 적 없는 종목(changePercent 없음)은 "-".
function formatChangePercent(cp){
  if (cp === undefined || cp === null || isNaN(cp)) return `<span style="color:var(--muted);">-</span>`;
  const cls = cp > 0 ? 'remark-up' : (cp < 0 ? 'remark-down' : '');
  const sign = cp > 0 ? '+' : (cp < 0 ? '-' : '');
  return `<span class="${cls}">${sign}${fmtTrim(Math.abs(cp), 2)}%</span>`;
}

function renderPriceTable(){
  master.sort((a, b) => ((a.type === 'cash') ? 1 : 0) - ((b.type === 'cash') ? 1 : 0));

  const tbody = document.getElementById('priceBody');
  tbody.innerHTML = '';
  master.forEach((m, idx) => {
    if (idx > 0 && m.type === 'cash' && master[idx - 1].type !== 'cash') {
      const divider = document.createElement('tr');
      divider.innerHTML = `<td colspan="6" style="padding:0; height:2px; background:var(--border-strong); border:none;"></td>`;
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
      <td class="num">${formatChangePercent(m.changePercent)}</td>
    `;
    tbody.appendChild(tr);
  });

  fitMasterNameColumn();
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

// 드롭다운은 "종목 마스터" 표의 가로 스크롤 컨테이너(.table-scroll, overflow-x:auto) 안에 있으면
// 세로로도 함께 잘려서 화면에 보이지 않으므로, body로 옮기고 position:fixed로 화면 좌표를 직접 계산해 띄운다.
const stockNameDropdown = document.getElementById('newStockNameList');
document.body.appendChild(stockNameDropdown);

function positionStockNameDropdown(){
  const rect = document.getElementById('newStockName').getBoundingClientRect();
  stockNameDropdown.style.left = rect.left + 'px';
  stockNameDropdown.style.top = rect.bottom + 'px';
  stockNameDropdown.style.width = rect.width + 'px';
}

function hideStockNameSuggestions(){
  stockNameDropdown.hidden = true;
  stockNameDropdown.innerHTML = '';
}

// 드롭다운이 열린 상태로 스크롤/리사이즈가 발생하면 위치를 다시 계산한다.
// (모바일에서는 입력창 포커스만으로도 가상 키보드 때문에 화면이 자동으로 스크롤되므로,
//  그냥 닫아버리면 타이핑 직후 뜬 드롭다운이 바로 사라지는 문제가 있어 위치 추적으로 대응한다.)
document.addEventListener('scroll', () => { if (!stockNameDropdown.hidden) positionStockNameDropdown(); }, true);
window.addEventListener('resize', () => { if (!stockNameDropdown.hidden) positionStockNameDropdown(); });

function selectStockNameSuggestion(name){
  const nameInput = document.getElementById('newStockName');
  const tickerInput = document.getElementById('newStockTicker');
  nameInput.value = name;
  if (stockNameSuggestionMap[name]) tickerInput.value = stockNameSuggestionMap[name];
  hideStockNameSuggestions();
}

document.getElementById('newStockName').addEventListener('input', (e) => {
  const nameInput = e.target;
  const tickerInput = document.getElementById('newStockTicker');
  const q = nameInput.value.trim();

  clearTimeout(stockNameSearchTimer);
  if (!q) {
    stockNameSuggestionMap = {};
    hideStockNameSuggestions();
    return;
  }

  // 이미 받아온 제안 중 정확히 일치하는 종목이 있으면 티커를 바로 채운다.
  if (stockNameSuggestionMap[q]) {
    tickerInput.value = stockNameSuggestionMap[q];
  }

  stockNameSearchTimer = setTimeout(async () => {
    const items = await fetchStockNameSuggestions(q);
    // 응답이 도착하기 전에 입력값이 바뀌었으면(이미 다른 검색이 진행 중이면) 이 결과는 버린다.
    if (nameInput.value.trim() !== q) return;

    stockNameSuggestionMap = {};
    items.forEach(item => { stockNameSuggestionMap[item.name] = item.ticker; });

    stockNameDropdown.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'suggest-item';
      div.textContent = item.name;
      div.dataset.name = item.name;
      stockNameDropdown.appendChild(div);
    });
    if (items.length > 0) positionStockNameDropdown();
    stockNameDropdown.hidden = items.length === 0;

    // 응답이 도착한 시점에도 입력값이 그대로 완전히 일치하면 티커를 채운다.
    if (stockNameSuggestionMap[nameInput.value.trim()]) {
      tickerInput.value = stockNameSuggestionMap[nameInput.value.trim()];
    }
  }, 250);
});

// 모바일 브라우저에서는 mousedown 시점에 입력창의 blur(→드롭다운 숨김)가 click보다 먼저 발생해
// 탭이 무시될 수 있으므로, mousedown 단계에서 기본 동작(포커스 이동)을 막아 blur 자체를 방지한다.
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('#newStockNameList')) e.preventDefault();
});

document.addEventListener('click', (e) => {
  const item = e.target.closest('.suggest-item');
  if (!item) return;
  selectStockNameSuggestion(item.dataset.name);
});

document.getElementById('newStockName').addEventListener('blur', () => {
  // mousedown 방어가 통하지 않는 경우를 대비한 안전장치(클릭 처리 시간을 확보하기 위해 지연)
  setTimeout(hideStockNameSuggestions, 150);
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

// "종목 마스터"의 금액 불러오기 버튼과 설정 박스의 금액 새로고침 버튼이 공유하는 동작.
async function refreshAllPrices(btn){
  const targets = master.filter(m => (m.ticker || '').trim());
  if (targets.length === 0) { showFieldStatus(btn, '티커가 입력된 종목이 없습니다.', 'error'); return; }
  await withButtonLoading(btn, `불러오는 중... (0/${targets.length})`, async () => {
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      btn.textContent = `불러오는 중... (${i + 1}/${targets.length})`;
      const result = await fetchPriceForTicker(targets[i].ticker, { silent: true });
      if (result !== null) { targets[i].price = result.price; targets[i].changePercent = result.changePercent; ok++; }
    }
    renderAll();
    showFieldStatus(btn, `${targets.length}개 중 ${ok}개 종목의 금액을 불러왔습니다.`);
  });
}

document.getElementById('fetchAllPricesBtn').addEventListener('click', (e) => refreshAllPrices(e.currentTarget));
document.getElementById('refreshPricesBtn').addEventListener('click', (e) => refreshAllPrices(e.currentTarget));

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
  const usedCount = groups.reduce((s,g) => s + g.rows.filter(r => r.stock === removedName).length, 0);
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
  groups.forEach(g => g.rows.forEach(r => { if (r.stock === oldName) r.stock = trimmed; }));
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
