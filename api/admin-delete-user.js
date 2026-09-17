import { Redis } from '@upstash/redis';
import { verifyAdmin, isUserAdmin, hasOtherAdmin } from '../lib/admin.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const userKey = (id) => `rebalancer:user:${id}`;
const dataKey = (id) => `rebalancer:user:${id}:data`;
const USERS_SET_KEY = 'rebalancer:users';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const { adminId, adminPassword, targetId } = req.body || {};
    const check = await verifyAdmin(redis, adminId, adminPassword);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    if (!targetId) return res.status(400).json({ error: '대상 ID가 필요합니다.' });
    if (targetId === adminId) {
      return res.status(400).json({ error: '자기 자신은 여기서 삭제할 수 없습니다.' });
    }
    const target = await redis.get(userKey(targetId));
    if (!target) return res.status(404).json({ error: '존재하지 않는 ID입니다.' });
    if (isUserAdmin(target, targetId) && !(await hasOtherAdmin(redis, targetId))) {
      return res.status(400).json({ error: '다른 관리자 계정이 없어 이 관리자 계정은 삭제할 수 없습니다.' });
    }

    await redis.del(userKey(targetId));
    await redis.del(dataKey(targetId));
    await redis.srem(USERS_SET_KEY, targetId);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '계정 삭제 중 오류가 발생했습니다.', detail: String(err) });
  }
}
