import crypto from 'crypto';

// sinra815 는 관리자 기능이 생기기 전부터 있던 계정이라 isAdmin 필드가 아예 없을 수 있다.
// 매 요청마다 비밀번호도 다시 검증한다 — 프런트 코드는 누구나 볼 수 있으므로 클라이언트가
// 보내는 adminId 만으로는 인증이 되지 않는다.
export const ADMIN_ID = 'sinra815';

const userKey = (id) => `rebalancer:user:${id}`;

export function isUserAdmin(user, id){
  return !!(user && (user.isAdmin || (id === ADMIN_ID && user.isAdmin === undefined)));
}

// 관리자 계정을 삭제하려 할 때, 그 계정 말고도 관리자가 한 명 이상 더 있는지 확인한다.
// 마지막 남은 관리자가 삭제되면 아무도 관리자 패널에 들어갈 수 없게 되어 버리기 때문.
export async function hasOtherAdmin(redis, excludeId){
  const ids = await redis.smembers('rebalancer:users');
  for (const id of ids) {
    if (id === excludeId) continue;
    const u = await redis.get(`rebalancer:user:${id}`);
    if (isUserAdmin(u, id)) return true;
  }
  return false;
}

// isUserAdmin() 에 더해, 시스템 전체에 관리자가 단 한 명도 남아있지 않은 비상 상황이면
// sinra815 만은 예외적으로 관리자로 복구시켜준다 — 관리자 권한을 주고받다가(또는 과거
// 버그로) 마지막 관리자가 사라지면 그 뒤로는 아무도 관리자 패널에 들어갈 수 없어 영영
// 복구할 방법이 없어지기 때문. 관리자가 한 명이라도 남아있는 정상적인 경우에는 이 예외가
// 적용되지 않으므로, 의도적으로 넘기거나 해제한 권한은 그대로 존중된다.
export async function computeIsAdmin(redis, user, id){
  if (isUserAdmin(user, id)) return true;
  if (id === ADMIN_ID && user && !(await hasOtherAdmin(redis, id))) return true;
  return false;
}

export async function verifyAdmin(redis, adminId, adminPassword){
  if (!adminId) {
    return { ok: false, status: 403, error: '관리자 권한이 없습니다.' };
  }
  const admin = await redis.get(userKey(adminId));
  const isAdmin = admin && (await computeIsAdmin(redis, admin, adminId));
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
