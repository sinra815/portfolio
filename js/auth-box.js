// ==== 로그인 / ID 생성 게이트 (화면 진입 시 ID·비밀번호 확인) ====
let currentUserId = null;

const authOverlay = document.getElementById('authOverlay');
const authLoginView = document.getElementById('authLoginView');
const authRegisterView = document.getElementById('authRegisterView');
const authIdInput = document.getElementById('authIdInput');
const authPasswordInput = document.getElementById('authPasswordInput');
const authLoginError = document.getElementById('authLoginError');
const authLoginBtn = document.getElementById('authLoginBtn');
const authNewIdInput = document.getElementById('authNewIdInput');
const authNewPasswordInput = document.getElementById('authNewPasswordInput');
const authNewPasswordConfirmInput = document.getElementById('authNewPasswordConfirmInput');
const authRegisterError = document.getElementById('authRegisterError');
const authRegisterHint = document.getElementById('authRegisterHint');
const authRegisterBtn = document.getElementById('authRegisterBtn');

function showLoginView(){
  authRegisterView.style.display = 'none';
  authLoginView.style.display = 'block';
  authLoginError.textContent = '';
  authPasswordInput.value = '';
  authIdInput.focus();
}

function showRegisterView(prefillId){
  authLoginView.style.display = 'none';
  authRegisterView.style.display = 'block';
  authRegisterError.textContent = '';
  authRegisterHint.textContent = prefillId ? `"${prefillId}" ID가 없습니다. 새로 만드시겠어요?` : '';
  authNewIdInput.value = prefillId || '';
  authNewPasswordInput.value = '';
  authNewPasswordConfirmInput.value = '';
  authNewPasswordInput.focus();
}

function completeLogin(id){
  currentUserId = id;
  authOverlay.classList.remove('open');
  if (typeof refreshSaveBadge === 'function') refreshSaveBadge();
}

async function attemptLogin(){
  const id = authIdInput.value.trim();
  const password = authPasswordInput.value;
  authLoginError.textContent = '';
  if (!id || !password) {
    authLoginError.textContent = 'ID와 비밀번호를 입력해주세요.';
    return;
  }
  const original = authLoginBtn.textContent;
  authLoginBtn.textContent = '확인 중...';
  authLoginBtn.disabled = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.exists === false) {
      showRegisterView(id);
      return;
    }
    if (!res.ok) {
      authLoginError.textContent = json.error || '로그인에 실패했습니다.';
      return;
    }
    completeLogin(id);
  } catch (e) {
    authLoginError.textContent = '로그인 중 오류가 발생했습니다: ' + e.message;
  } finally {
    authLoginBtn.textContent = original;
    authLoginBtn.disabled = false;
  }
}

async function attemptRegister(){
  const id = authNewIdInput.value.trim();
  const password = authNewPasswordInput.value;
  const passwordConfirm = authNewPasswordConfirmInput.value;
  authRegisterError.textContent = '';
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(id)) {
    authRegisterError.textContent = 'ID는 영문/숫자/밑줄 2~20자로 입력해주세요.';
    return;
  }
  if (password.length < 4) {
    authRegisterError.textContent = '비밀번호는 4자 이상이어야 합니다.';
    return;
  }
  if (password !== passwordConfirm) {
    authRegisterError.textContent = '비밀번호가 서로 다릅니다.';
    return;
  }
  const original = authRegisterBtn.textContent;
  authRegisterBtn.textContent = '생성 중...';
  authRegisterBtn.disabled = true;
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      authRegisterError.textContent = json.error || 'ID 생성에 실패했습니다.';
      return;
    }
    completeLogin(id);
  } catch (e) {
    authRegisterError.textContent = 'ID 생성 중 오류가 발생했습니다: ' + e.message;
  } finally {
    authRegisterBtn.textContent = original;
    authRegisterBtn.disabled = false;
  }
}

authLoginBtn.addEventListener('click', attemptLogin);
authRegisterBtn.addEventListener('click', attemptRegister);
document.getElementById('authBackToLoginBtn').addEventListener('click', showLoginView);

authPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
authIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authPasswordInput.focus(); });
authNewIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authNewPasswordInput.focus(); });
authNewPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authNewPasswordConfirmInput.focus(); });
authNewPasswordConfirmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptRegister(); });
