// ==== 로그인 / ID 생성 게이트 (화면 진입 시 ID·비밀번호 확인, 로그아웃 전까지 로그인 유지) ====
// AUTH_STORAGE_KEY 는 js/core.js 에서 선언한다 (자동저장 복원 여부를 거기서도 판단해야 해서).
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
const currentUserIdLabel = document.getElementById('currentUserIdLabel');
const logoutBtn = document.getElementById('logoutBtn');
const continueAsGuestBtn = document.getElementById('continueAsGuestBtn');
const saveBtnEl = document.getElementById('saveBtn');
const loadBtnEl = document.getElementById('loadBtn');
const changePasswordBtnEl = document.getElementById('changePasswordBtn');
const deleteAccountBtnEl = document.getElementById('deleteAccountBtn');

let isGuestMode = false;

// 로그인 상태에 맞춰 저장/불러오기·계정 버튼과 계정 영역 표시를 갱신한다.
// 게스트로 들어온 경우 서버 저장/불러오기·비밀번호 변경·계정 삭제는 계정이 없어 사용할 수 없다.
function setAccountUI(loggedIn){
  saveBtnEl.disabled = !loggedIn;
  loadBtnEl.disabled = !loggedIn;
  changePasswordBtnEl.disabled = !loggedIn;
  deleteAccountBtnEl.disabled = !loggedIn;
  logoutBtn.textContent = loggedIn ? '로그아웃' : '로그인';
  if (typeof showAdminButtonIfAdmin === 'function') showAdminButtonIfAdmin();
}

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
  isGuestMode = false;
  serverLoadPending = true;
  try { localStorage.setItem(AUTH_STORAGE_KEY, id); } catch (e) {}
  currentUserIdLabel.textContent = id;
  setAccountUI(true);
  authOverlay.classList.remove('open');
  // 지금부터는 서버가 기준이니, 남아있던 기기 자동저장은 지운다(다음에 로그인 없이 들어왔을 때
  // 방금 로그인한 계정의 데이터가 그대로 남아 보이지 않도록).
  if (typeof clearAutosave === 'function') clearAutosave();
  // 기기에 자동저장된 값이 아니라, 이 ID로 서버에 저장된 값을 보여준다.
  if (typeof autoLoadServerData === 'function') autoLoadServerData(id);
}

function continueAsGuest(){
  currentUserId = null;
  isGuestMode = true;
  currentUserIdLabel.textContent = '게스트 (서버 저장 불가)';
  setAccountUI(false);
  if (typeof setSaveBadge === 'function') setSaveBadge(false);
  authOverlay.classList.remove('open');
}

// 실제로 계정을 벗어나는 처리. 확인창 없이 바로 실행하므로, 로그아웃 버튼(logout())과
// 계정 삭제 직후(account-box.js) 둘 다 확인은 각자 하고 나서 이 함수를 부른다.
function performLogout(){
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {}
  currentUserId = null;
  currentUserIdLabel.textContent = '';
  if (typeof clearAutosave === 'function') clearAutosave();
  if (typeof setSaveBadge === 'function') setSaveBadge(false);
  // 화면(메모리)에 남은 방금 계정의 데이터가 다음 로그인/게스트 진입 때 그대로 보이지 않도록 비운다.
  master = [];
  groups = [];
  renderAll();
  setAccountUI(false);
  showLoginView();
  authOverlay.classList.add('open');
}

function logout(){
  if (isGuestMode) {
    // 게스트는 로그아웃할 계정이 없으니 바로 로그인 화면으로 되돌아간다.
    isGuestMode = false;
    currentUserIdLabel.textContent = '';
    setAccountUI(false);
    showLoginView();
    authOverlay.classList.add('open');
    return;
  }
  if (!confirm('로그아웃 하시겠습니까?')) return;
  performLogout();
}

// 새로고침해도 로그아웃 전까지는 다시 로그인하지 않도록, 저장된 ID가 있으면 바로 복원한다.
try {
  const savedId = localStorage.getItem(AUTH_STORAGE_KEY);
  if (savedId) {
    currentUserId = savedId;
    serverLoadPending = true;
    currentUserIdLabel.textContent = savedId;
    setAccountUI(true);
    authOverlay.classList.remove('open');
    // 이 시점에는 뒤에 오는 <script>(settings-box.js)가 아직 로드되지 않았을 수 있어,
    // 모든 스크립트가 실행된 뒤로 미룬다.
    setTimeout(() => {
      if (typeof autoLoadServerData === 'function') autoLoadServerData(savedId);
    }, 0);
  }
} catch (e) {}

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
logoutBtn.addEventListener('click', logout);
continueAsGuestBtn.addEventListener('click', continueAsGuest);

authPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
authIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authPasswordInput.focus(); });
authNewIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authNewPasswordInput.focus(); });
authNewPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authNewPasswordConfirmInput.focus(); });
authNewPasswordConfirmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptRegister(); });
