import { Redis } from '@upstash/redis';
import { verifyAdmin, computeIsAdmin } from '../lib/admin.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const userKey = (id) => `rebalancer:user:${id}`;
const USERS_SET_KEY = 'rebalancer:users';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const { adminId, adminPassword } = req.body || {};
    const check = await verifyAdmin(redis, adminId, adminPassword);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const ids = await redis.smembers(USERS_SET_KEY);
    const users = await Promise.all(ids.map(async (id) => {
      const u = await redis.get(userKey(id));
      return {
        id,
        suspended: !!(u && u.suspended),
        lockedUntil: (u && u.lockedUntil) || null,
        isAdmin: u ? await computeIsAdmin(redis, u, id) : false,
      };
    }));
    users.sort((a, b) => a.id.localeCompare(b.id));
    return res.status(200).json({ users });
  } catch (err) {
    return res.status(500).json({ error: '계정 목록을 불러오는 중 오류가 발생했습니다.', detail: String(err) });
  }
}
