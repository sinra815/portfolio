// ==== 로그인 / ID 생성 게이트 (화면 진입 시 ID·비밀번호 확인, 로그아웃 전까지 로그인 유지) ====
// AUTH_STORAGE_KEY 는 js/core.js 에서 선언한다 (자동저장 복원 여부를 거기서도 판단해야 해서).
let currentUserId = null;
// 로그인한 계정이 관리자인지(고정 계정 sinra815 이거나, 다른 관리자가 권한을 부여한 계정).
// 실제 관리자 기능 사용 가능 여부는 서버가 매 요청마다 다시 검증하므로, 이 값은 "🛠 관리자"
// 버튼을 보여줄지 정하는 용도일 뿐이다.
let currentUserIsAdmin = false;
const AUTH_ADMIN_STORAGE_KEY = 'investRebalanceAuthIsAdmin';
// "아이디 저장" 체크박스 — 로그인 상태 유지(AUTH_STORAGE_KEY)와는 별개로, 로그인 화면에
// ID 입력만 미리 채워두는 용도. 비밀번호는 저장하지 않는다.
const REMEMBER_ID_STORAGE_KEY = 'investRebalanceRememberedId';

const authOverlay = document.getElementById('authOverlay');
const authLoginView = document.getElementById('authLoginView');
const authRegisterView = document.getElementById('authRegisterView');
const authIdInput = document.getElementById('authIdInput');
const authPasswordInput = document.getElementById('authPasswordInput');
const authLoginError = document.getElementById('authLoginError');
const authLoginBtn = document.getElementById('authLoginBtn');
const authNewIdInput = document.getElementById('authNewIdInput');
const authNewPasswordInput = document.getElementById('authNewPasswordInput');
const authRegisterError = document.getElementById('authRegisterError');
const authRegisterHint = document.getElementById('authRegisterHint');
const authRegisterBtn = document.getElementById('authRegisterBtn');
const currentUserIdLabel = document.getElementById('currentUserIdLabel');
const logoutBtn = document.getElementById('logoutBtn');
const continueAsGuestBtn = document.getElementById('continueAsGuestBtn');
const rememberIdCheckbox = document.getElementById('rememberIdCheckbox');
const saveBtnEl = document.getElementById('saveBtn');
const loadBtnEl = document.getElementById('loadBtn');
const changePasswordBtnEl = document.getElementById('changePasswordBtn');
const deleteAccountBtnEl = document.getElementById('deleteAccountBtn');

let isGuestMode = false;

// 저장해 둔 ID가 있으면 로그인 화면에 미리 채워 넣고 체크박스도 켜둔다.
try {
  const rememberedId = localStorage.getItem(REMEMBER_ID_STORAGE_KEY);
  if (rememberedId) {
    authIdInput.value = rememberedId;
    rememberIdCheckbox.checked = true;
  }
} catch (e) {}

// 로그인 상태에 맞춰 계정 버튼과 계정 영역 표시를 갱신한다.
// 게스트로 들어온 경우 계정이 없어 비밀번호 변경·계정 삭제만 사용할 수 없다(저장/불러오기는 가능).
function setAccountUI(loggedIn){
  // 저장/불러오기는 로그인 여부와 무관하게 항상 쓸 수 있다 — 로그인했으면 서버, 아니면(게스트)
  // 이 기기에 저장/불러오기한다.
  saveBtnEl.disabled = false;
  loadBtnEl.disabled = false;
  changePasswordBtnEl.disabled = !loggedIn;
  deleteAccountBtnEl.disabled = !loggedIn;
  logoutBtn.textContent = loggedIn ? '로그아웃' : '로그인';
  if (typeof showAdminButtonIfAdmin === 'function') showAdminButtonIfAdmin();
  if (typeof updateKiwoomPanelVisibility === 'function') updateKiwoomPanelVisibility();
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
  (prefillId ? authNewPasswordInput : authNewIdInput).focus();
}

function completeLogin(id, isAdmin){
  currentUserId = id;
  currentUserIsAdmin = !!isAdmin;
  isGuestMode = false;
  serverLoadPending = true;
  setServerLoadingIndicator(true);
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, id);
    localStorage.setItem(AUTH_ADMIN_STORAGE_KEY, currentUserIsAdmin ? '1' : '');
  } catch (e) {}
  currentUserIdLabel.textContent = id;
  setAccountUI(true);
  authOverlay.classList.remove('open');
  // 이 기기에 저장된 값이 아니라, 이 ID로 서버에 저장된 값을 보여준다.
  if (typeof autoLoadServerData === 'function') autoLoadServerData(id);
}

function continueAsGuest(){
  currentUserId = null;
  currentUserIsAdmin = false;
  isGuestMode = true;
  // 직전에 로그인 복원(새로고침 등)으로 서버 데이터를 기다리던 중이었다면, 게스트로 전환하는
  // 순간 그 대기는 더 이상 의미가 없다 — 풀어주지 않으면 저장/불러오기 버튼이 계속 막힌다.
  serverLoadPending = false;
  setServerLoadingIndicator(false);
  currentUserIdLabel.textContent = '게스트 (이 기기에 저장)';
  setAccountUI(false);
  // 이 기기에 저장해 둔 값을 불러와 보여준다 — ID로 로그인했을 때 서버 데이터를 자동으로
  // 불러오는 것과 대응된다. (로그아웃 직후처럼 화면이 이미 비어있는 상태로 게스트에
  // 들어오는 경우, 여기서 다시 불러오지 않으면 기기에 저장된 데이터가 있어도 안 보인다.)
  const data = typeof loadDeviceSave === 'function' ? loadDeviceSave() : null;
  if (data && typeof applyLoadedData === 'function') applyLoadedData(data);
  if (typeof setSaveBadge === 'function') setSaveBadge(!!data);
  authOverlay.classList.remove('open');
}

// 실제로 계정을 벗어나는 처리. 확인창 없이 바로 실행하므로, 로그아웃 버튼(logout())과
// 계정 삭제 직후(account-box.js) 둘 다 확인은 각자 하고 나서 이 함수를 부른다.
function performLogout(){
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_ADMIN_STORAGE_KEY);
  } catch (e) {}
  currentUserId = null;
  currentUserIsAdmin = false;
  // 서버 데이터 대기 중이었다면 로그아웃하는 순간 더 이상 의미가 없다 — 다음 로그인/게스트
  // 진입 때 저장/불러오기가 계속 막혀버리지 않도록 여기서도 풀어준다.
  serverLoadPending = false;
  setServerLoadingIndicator(false);
  currentUserIdLabel.textContent = '';
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
    currentUserIsAdmin = !!localStorage.getItem(AUTH_ADMIN_STORAGE_KEY);
    serverLoadPending = true;
    setServerLoadingIndicator(true);
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
    try {
      if (rememberIdCheckbox.checked) localStorage.setItem(REMEMBER_ID_STORAGE_KEY, id);
      else localStorage.removeItem(REMEMBER_ID_STORAGE_KEY);
    } catch (e) {}
    completeLogin(id, json.isAdmin);
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
  authRegisterError.textContent = '';
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(id)) {
    authRegisterError.textContent = 'ID는 영문/숫자/밑줄 2~20자로 입력해주세요.';
    return;
  }
  if (password.length < 4) {
    authRegisterError.textContent = '비밀번호는 4자 이상이어야 합니다.';
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
    completeLogin(id, false); // 새로 만든 계정은 관리자가 아니다
  } catch (e) {
    authRegisterError.textContent = 'ID 생성 중 오류가 발생했습니다: ' + e.message;
  } finally {
    authRegisterBtn.textContent = original;
    authRegisterBtn.disabled = false;
  }
}

authLoginBtn.addEventListener('click', attemptLogin);
document.getElementById('goToRegisterBtn').addEventListener('click', () => showRegisterView());
authRegisterBtn.addEventListener('click', attemptRegister);
document.getElementById('authBackToLoginBtn').addEventListener('click', showLoginView);
logoutBtn.addEventListener('click', logout);
continueAsGuestBtn.addEventListener('click', continueAsGuest);

authPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
authIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authPasswordInput.focus(); });
authNewIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') authNewPasswordInput.focus(); });
authNewPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptRegister(); });
