import crypto from 'crypto';

// sinra815 는 관리자 기능이 생기기 전부터 있던 계정이라 isAdmin 필드가 아예 없을 수 있다.
// 매 요청마다 비밀번호도 다시 검증한다 — 프런트 코드는 누구나 볼 수 있으므로 클라이언트가
// 보내는 adminId 만으로는 인증이 되지 않는다.
export const ADMIN_ID = 'sinra815';

const userKey = (id) => `rebalancer:user:${id}`;

export async function verifyAdmin(redis, adminId, adminPassword){
  if (!adminId) {
    return { ok: false, status: 403, error: '관리자 권한이 없습니다.' };
  }
  const admin = await redis.get(userKey(adminId));
  // isAdmin 이 명시적으로 설정된 적 없는 sinra815(레거시 계정)만 기본적으로 관리자로 취급한다.
  // 다른 관리자가 명시적으로 권한을 부여/해제(isAdmin:true/false 저장)하면 그 뒤로는 이 계정도
  // 예외 없이 그 값을 그대로 따른다 — sinra815 도 관리자 권한을 넘기거나 잃을 수 있다.
  const isAdmin = admin && (admin.isAdmin || (adminId === ADMIN_ID && admin.isAdmin === undefined));
  if (!admin || !isAdmin) {
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
