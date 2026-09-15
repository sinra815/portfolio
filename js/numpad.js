// ==== 숫자 입력 팝업 (넘패드) — 여러 박스에서 공유하는 공통 UI ====
const numpadOverlay = document.getElementById('numpadOverlay');
const numpadDisplay = document.getElementById('numpadDisplay');
const numpadLabel = document.getElementById('numpadLabel');
let numpadTarget = null;

function openNumpad(input){
  numpadTarget = input;
  numpadLabel.textContent = input.dataset.label || '숫자 입력';
  numpadDisplay.value = input.value || '0';
  numpadOverlay.classList.add('open');
  numpadDisplay.focus();
  numpadDisplay.select();
}

function closeNumpad(){
  numpadOverlay.classList.remove('open');
  numpadTarget = null;
}

function confirmNumpad(){
  if (numpadTarget) {
    let v = numpadDisplay.value.trim();
    if (v === '' || v === '-' || isNaN(Number(v))) v = '0';
    numpadTarget.value = v;
    numpadTarget.dispatchEvent(new Event('input', {bubbles:true}));
  }
  closeNumpad();
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.numpad-trigger');
  if (trigger) openNumpad(trigger);
});

document.addEventListener('focusin', (e) => {
  const trigger = e.target.closest && e.target.closest('.numpad-trigger');
  if (trigger && !(trigger === numpadTarget && numpadOverlay.classList.contains('open'))) {
    openNumpad(trigger);
  }
});

document.querySelectorAll('.numpad-grid button').forEach(btn => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    if (k === '-') {
      numpadDisplay.value = numpadDisplay.value.startsWith('-') ? numpadDisplay.value.slice(1) : ('-' + numpadDisplay.value);
    } else if (k === '.') {
      if (!numpadDisplay.value.includes('.')) numpadDisplay.value += '.';
    } else {
      numpadDisplay.value = (numpadDisplay.value === '0') ? k : numpadDisplay.value + k;
    }
    numpadDisplay.focus();
  });
});

document.getElementById('numpadClear').addEventListener('click', () => { numpadDisplay.value = ''; numpadDisplay.focus(); });
document.getElementById('numpadBackspace').addEventListener('click', () => { numpadDisplay.value = numpadDisplay.value.slice(0, -1); numpadDisplay.focus(); });
document.getElementById('numpadCancel').addEventListener('click', closeNumpad);
document.getElementById('numpadOk').addEventListener('click', confirmNumpad);

numpadOverlay.addEventListener('click', (e) => { if (e.target === numpadOverlay) closeNumpad(); });

numpadDisplay.addEventListener('keydown', (e) => {
  const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13 || e.which === 13;
  const isEscape = e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27;
  if (isEnter) { e.preventDefault(); confirmNumpad(); }
  else if (isEscape) { e.preventDefault(); closeNumpad(); }
});
numpadDisplay.addEventListener('input', () => {
  let v = numpadDisplay.value.replace(/[^0-9.\-]/g, '');
  v = v.replace(/(?!^)-/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  numpadDisplay.value = v;
});
