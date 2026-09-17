import { Redis } from '@upstash/redis';
import { verifyAdmin } from '../lib/admin.js';

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
    const { adminId, adminPassword, targetId, isAdmin } = req.body || {};
    const check = await verifyAdmin(redis, adminId, adminPassword);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    if (!targetId) return res.status(400).json({ error: '대상 ID가 필요합니다.' });
    if (targetId === adminId) {
      return res.status(400).json({ error: '자기 자신의 관리자 권한은 바꿀 수 없습니다.' });
    }
    const target = await redis.get(userKey(targetId));
    if (!target) return res.status(404).json({ error: '존재하지 않는 ID입니다.' });

    await redis.set(userKey(targetId), { ...target, isAdmin: !!isAdmin });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '관리자 권한 변경 중 오류가 발생했습니다.', detail: String(err) });
  }
}
