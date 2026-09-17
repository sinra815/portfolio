import crypto from 'crypto';

// sinra815 를 관리자 계정으로 고정한다. 클라이언트가 보내는 adminId 는 이 값과 정확히
// 일치해야 하고, 매 요청마다 비밀번호도 다시 검증한다 — 프런트 코드는 누구나 볼 수 있으므로
// "adminId === 관리자" 확인만으로는 인증이 되지 않는다.
export const ADMIN_ID = 'sinra815';

const userKey = (id) => `rebalancer:user:${id}`;

export async function verifyAdmin(redis, adminId, adminPassword){
  if (!adminId) {
    return { ok: false, status: 403, error: '관리자 권한이 없습니다.' };
  }
  const admin = await redis.get(userKey(adminId));
  // sinra815 는 항상 관리자다(고정 계정). 그 외에는 다른 관리자가 부여한 isAdmin 플래그로 판단한다.
  if (!admin || !(admin.isAdmin || adminId === ADMIN_ID)) {
    return { ok: false, status: 403, error: '관리자 권한이 없습니다.' };
  }
  if (!adminPassword) {
    return { ok: false, status: 401, error: '관리자 비밀번호를 입력해주세요.' };
  }
  const hash = crypto.createHash('sha256').update(adminPassword).digest('hex');
  if (hash !== admin.passwordHash) {
    return { ok: false, status: 401, error: '관리자 비밀번호가 일치하지 않습니다.' };
  }
  return { ok: true };
}
