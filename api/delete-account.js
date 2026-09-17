import { Redis } from '@upstash/redis';
import crypto from 'crypto';

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
    const { id, password } = req.body || {};
    if (!id || !password) {
      return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' });
    }
    const user = await redis.get(userKey(id));
    if (!user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash !== user.passwordHash) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
    }
    await redis.del(userKey(id));
    await redis.del(dataKey(id));
    await redis.srem(USERS_SET_KEY, id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '계정 삭제 중 오류가 발생했습니다.', detail: String(err) });
  }
}
