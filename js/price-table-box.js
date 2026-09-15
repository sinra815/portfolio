// ==== "📌 종목별 현재가 (마스터 테이블)" 박스 ====

function renderPriceTable(){
  master.sort((a, b) => ((a.type === 'cash') ? 1 : 0) - ((b.type === 'cash') ? 1 : 0));

  const tbody = document.getElementById('priceBody');
  tbody.innerHTML = '';
  master.forEach((m, idx) => {
    if (idx > 0 && m.type === 'cash' && master[idx - 1].type !== 'cash') {
      const divider = document.createElement('tr');
      divider.innerHTML = `<td colspan="4" style="padding:0; height:2px; background:var(--border-strong); border:none;"></td>`;
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
      <td style="text-align:left;">
        <select class="stock-type-select" data-idx="${idx}" style="width:auto; padding:4px 20px 4px 6px; border:1px solid var(--border-strong); border-radius:4px; font-size:12.5px; font-family:inherit; background:#fff;">
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

document.getElementById('addStockBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('newStockName');
  const priceInput = document.getElementById('newStockPrice');
  const typeInput = document.getElementById('newStockType');
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  if (master.some(m => m.name === name)) { alert('이미 등록된 종목명입니다.'); return; }
  master.push({ name, price: parseFloat(priceInput.value) || 0, type: typeInput.value });
  nameInput.value = '';
  priceInput.value = '0';
  typeInput.value = 'stock';
  renderAll();
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
  if (!trimmed) { alert('종목명은 비워둘 수 없습니다.'); return; }
  if (trimmed !== oldName && master.some((m, i) => i !== idx && m.name === trimmed)) {
    alert('이미 등록된 종목명입니다.');
    return;
  }
  master[idx].name = trimmed;
  groups.forEach(g => g.rows.forEach(r => { if (!r.cash && r.stock === oldName) r.stock = trimmed; }));
  renderAll();
});
