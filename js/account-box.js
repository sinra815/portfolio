// ==== 계정 관리: 비밀번호 변경 / 계정 삭제 / 관리자 패널 ====
// ADMIN_ID 는 여기선 "관리자" 버튼을 보여줄지 판단하는 용도일 뿐이다. 실제 권한은
// 서버(api/admin-*.js)가 매 요청마다 비밀번호로 다시 확인하므로, 이 값만으로는 아무것도 못 한다.
const ADMIN_ID = 'sinra815';

function showAdminButtonIfAdmin(){
  const isAdmin = currentUserId === ADMIN_ID;
  const adminBtn = document.getElementById('adminPanelBtn');
  if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
  // 계정 삭제는 지울 계정이 있는 일반 로그인 사용자에게만 의미가 있다 — 게스트(계정 자체가 없음)와
  // 관리자(여기서 자기 계정을 지울 수 없다 — admin-delete-user.js 가 서버에서도 막는다) 는 숨긴다.
  const deleteBtn = document.getElementById('deleteAccountBtn');
  if (deleteBtn) deleteBtn.style.display = (currentUserId && !isAdmin) ? '' : 'none';
}
// auth-box.js 의 로그인 유지 복원은 이 스크립트가 로드되기 전에 이미 실행됐을 수 있어
// (그때는 이 함수가 아직 없어 setAccountUI 안의 typeof 가드가 조용히 넘어간다), 여기서
// 한 번 더 currentUserId 기준으로 버튼 표시를 맞춘다.
showAdminButtonIfAdmin();

// ---- 비밀번호 변경 ----
const changePasswordOverlay = document.getElementById('changePasswordOverlay');
const currentPasswordInput = document.getElementById('currentPasswordInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const newPasswordConfirmInput = document.getElementById('newPasswordConfirmInput');
const changePasswordError = document.getElementById('changePasswordError');
const changePasswordSubmitBtn = document.getElementById('changePasswordSubmitBtn');

function openChangePassword(){
  if (!currentUserId) return;
  currentPasswordInput.value = '';
  newPasswordInput.value = '';
  newPasswordConfirmInput.value = '';
  changePasswordError.textContent = '';
  changePasswordOverlay.classList.add('open');
  currentPasswordInput.focus();
}
function closeChangePassword(){
  changePasswordOverlay.classList.remove('open');
}

document.getElementById('changePasswordBtn').addEventListener('click', openChangePassword);
document.getElementById('changePasswordCancelBtn').addEventListener('click', closeChangePassword);

async function submitChangePassword(){
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = newPasswordConfirmInput.value;
  changePasswordError.textContent = '';
  if (!currentPassword || !newPassword) { changePasswordError.textContent = '모든 항목을 입력해주세요.'; return; }
  if (newPassword.length < 4) { changePasswordError.textContent = '새 비밀번호는 4자 이상이어야 합니다.'; return; }
  if (newPassword !== confirmPassword) { changePasswordError.textContent = '새 비밀번호가 서로 다릅니다.'; return; }
  const original = changePasswordSubmitBtn.textContent;
  changePasswordSubmitBtn.textContent = '변경 중...';
  changePasswordSubmitBtn.disabled = true;
  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentUserId, currentPassword, newPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { changePasswordError.textContent = json.error || '비밀번호 변경에 실패했습니다.'; return; }
    closeChangePassword();
    showFieldStatus(document.getElementById('changePasswordBtn'), '비밀번호가 변경되었습니다.');
  } catch (e) {
    changePasswordError.textContent = '비밀번호 변경 중 오류가 발생했습니다: ' + e.message;
  } finally {
    changePasswordSubmitBtn.textContent = original;
    changePasswordSubmitBtn.disabled = false;
  }
}
changePasswordSubmitBtn.addEventListener('click', submitChangePassword);
newPasswordConfirmInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitChangePassword(); });

// ---- 계정 삭제 ----
const deleteAccountOverlay = document.getElementById('deleteAccountOverlay');
const deleteAccountPasswordInput = document.getElementById('deleteAccountPasswordInput');
const deleteAccountError = document.getElementById('deleteAccountError');
const deleteAccountSubmitBtn = document.getElementById('deleteAccountSubmitBtn');

function openDeleteAccount(){
  if (!currentUserId) return;
  deleteAccountPasswordInput.value = '';
  deleteAccountError.textContent = '';
  deleteAccountOverlay.classList.add('open');
  deleteAccountPasswordInput.focus();
}
function closeDeleteAccount(){
  deleteAccountOverlay.classList.remove('open');
}

document.getElementById('deleteAccountBtn').addEventListener('click', openDeleteAccount);
document.getElementById('deleteAccountCancelBtn').addEventListener('click', closeDeleteAccount);

async function submitDeleteAccount(){
  const password = deleteAccountPasswordInput.value;
  deleteAccountError.textContent = '';
  if (!password) { deleteAccountError.textContent = '비밀번호를 입력해주세요.'; return; }
  if (!confirm('정말 계정을 삭제할까요? 서버에 저장된 데이터도 함께 삭제되며 되돌릴 수 없습니다.')) return;
  const original = deleteAccountSubmitBtn.textContent;
  deleteAccountSubmitBtn.textContent = '삭제 중...';
  deleteAccountSubmitBtn.disabled = true;
  try {
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentUserId, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { deleteAccountError.textContent = json.error || '계정 삭제에 실패했습니다.'; return; }
    closeDeleteAccount();
    if (typeof performLogout === 'function') performLogout();
  } catch (e) {
    deleteAccountError.textContent = '계정 삭제 중 오류가 발생했습니다: ' + e.message;
  } finally {
    deleteAccountSubmitBtn.textContent = original;
    deleteAccountSubmitBtn.disabled = false;
  }
}
deleteAccountSubmitBtn.addEventListener('click', submitDeleteAccount);
deleteAccountPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitDeleteAccount(); });

// ---- 관리자 패널 ----
const adminOverlay = document.getElementById('adminOverlay');
const adminAuthView = document.getElementById('adminAuthView');
const adminPanelView = document.getElementById('adminPanelView');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const adminAuthError = document.getElementById('adminAuthError');
const adminAuthSubmitBtn = document.getElementById('adminAuthSubmitBtn');
const adminUserList = document.getElementById('adminUserList');
// 관리자 패널이 열려있는 동안만 메모리에 유지 — 계정 목록/정지/삭제 요청마다
// 매번 비밀번호를 다시 입력받지 않도록. 패널을 닫으면 바로 지운다.
let adminPasswordCache = null;

function openAdminOverlay(){
  adminPasswordCache = null;
  adminPasswordInput.value = '';
  adminAuthError.textContent = '';
  adminAuthView.style.display = 'block';
  adminPanelView.style.display = 'none';
  adminOverlay.classList.add('open');
  adminPasswordInput.focus();
}
function closeAdminOverlay(){
  adminOverlay.classList.remove('open');
  adminPasswordCache = null;
}

document.getElementById('adminPanelBtn').addEventListener('click', openAdminOverlay);
document.getElementById('adminAuthCancelBtn').addEventListener('click', closeAdminOverlay);
document.getElementById('adminPanelCloseBtn').addEventListener('click', closeAdminOverlay);

async function fetchAdminUsers(){
  const res = await fetch('/api/admin-users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminId: currentUserId, adminPassword: adminPasswordCache }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || '계정 목록을 불러오지 못했습니다.');
  return json.users || [];
}

function renderAdminUserList(users){
  if (users.length === 0) {
    adminUserList.innerHTML = `<div style="color:var(--muted); padding:12px 0; text-align:center;">등록된 계정이 없습니다.</div>`;
    return;
  }
  adminUserList.innerHTML = users.map(u => `
    <div class="admin-user-row">
      <div>
        <span class="admin-user-id">${u.id}</span>
        <span class="admin-user-status ${u.suspended ? 'suspended' : 'active'}">${u.suspended ? '정지됨' : '정상'}</span>
        ${u.id === ADMIN_ID ? '<span style="color:var(--muted); font-size:11px; margin-left:6px;">(관리자)</span>' : ''}
      </div>
      ${u.id === ADMIN_ID ? '' : `
      <div style="display:flex; gap:6px;">
        <button type="button" class="admin-suspend-btn" data-id="${u.id}" data-suspended="${u.suspended}">${u.suspended ? '정지 해제' : '사용중지'}</button>
        <button type="button" class="admin-delete-btn danger" data-id="${u.id}">삭제</button>
      </div>`}
    </div>
  `).join('');
}

async function loadAdminPanel(){
  const users = await fetchAdminUsers();
  renderAdminUserList(users);
  adminAuthView.style.display = 'none';
  adminPanelView.style.display = 'block';
}

async function submitAdminAuth(){
  const password = adminPasswordInput.value;
  adminAuthError.textContent = '';
  if (!password) { adminAuthError.textContent = '비밀번호를 입력해주세요.'; return; }
  adminPasswordCache = password;
  const original = adminAuthSubmitBtn.textContent;
  adminAuthSubmitBtn.textContent = '확인 중...';
  adminAuthSubmitBtn.disabled = true;
  try {
    await loadAdminPanel();
  } catch (e) {
    adminAuthError.textContent = e.message;
    adminPasswordCache = null;
  } finally {
    adminAuthSubmitBtn.textContent = original;
    adminAuthSubmitBtn.disabled = false;
  }
}
adminAuthSubmitBtn.addEventListener('click', submitAdminAuth);
adminPasswordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdminAuth(); });

adminUserList.addEventListener('click', async (e) => {
  const suspendBtn = e.target.closest('.admin-suspend-btn');
  const deleteBtn = e.target.closest('.admin-delete-btn');
  if (!suspendBtn && !deleteBtn) return;
  const id = (suspendBtn || deleteBtn).dataset.id;

  if (suspendBtn) {
    const nextSuspended = suspendBtn.dataset.suspended !== 'true';
    const label = nextSuspended ? '사용중지' : '정지 해제';
    if (!confirm(`"${id}" 계정을 ${label}할까요?`)) return;
    try {
      const res = await fetch('/api/admin-set-suspended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentUserId, adminPassword: adminPasswordCache, targetId: id, suspended: nextSuspended }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.error || '처리에 실패했습니다.'); return; }
      renderAdminUserList(await fetchAdminUsers());
    } catch (err) {
      alert('처리 중 오류가 발생했습니다: ' + err.message);
    }
    return;
  }

  if (deleteBtn) {
    if (!confirm(`"${id}" 계정을 삭제할까요? 저장된 데이터도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch('/api/admin-delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentUserId, adminPassword: adminPasswordCache, targetId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.error || '삭제에 실패했습니다.'); return; }
      renderAdminUserList(await fetchAdminUsers());
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다: ' + err.message);
    }
  }
});
