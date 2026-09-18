// 관리자 권한(isAdmin) 지정과 사용중지(suspended) 처리를 한 파일로 합쳤다 — 요청 모양이
// {adminId, adminPassword, targetId, ...} 로 동일해서, 어떤 필드가 왔는지로 분기하면 충분하다.
// (Vercel Hobby 플랜의 배포당 서버리스 함수 개수 제한 때문에 파일을 늘릴 여유가 없다.)
import { Redis } from '@upstash/redis';
import { verifyAdmin, isUserAdmin, hasOtherAdmin } from '../lib/admin.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const userKey = (id) => `rebalancer:user:${id}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const { adminId, adminPassword, targetId, isAdmin, suspended } = req.body || {};
    const check = await verifyAdmin(redis, adminId, adminPassword);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    if (!targetId) return res.status(400).json({ error: '대상 ID가 필요합니다.' });
    if (targetId === adminId) {
      return res.status(400).json({ error: '자기 자신에게는 이 작업을 할 수 없습니다.' });
    }
    const target = await redis.get(userKey(targetId));
    if (!target) return res.status(404).json({ error: '존재하지 않는 ID입니다.' });

    const updated = { ...target };
    if (isAdmin !== undefined) updated.isAdmin = !!isAdmin;
    if (suspended !== undefined) {
      // 정지된 계정은 로그인이 막히므로, 마지막 남은 관리자를 정지시키면 삭제와 똑같이
      // 아무도 관리자 패널에 못 들어가게 된다 — 해제(suspended:false)는 막을 이유가 없다.
      if (suspended && isUserAdmin(target, targetId) && !(await hasOtherAdmin(redis, targetId))) {
        return res.status(400).json({ error: '다른 관리자 계정이 없어 이 관리자 계정은 사용중지할 수 없습니다.' });
      }
      updated.suspended = !!suspended;
    }

    await redis.set(userKey(targetId), updated);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.', detail: String(err) });
  }
}
