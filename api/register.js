import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ID_PATTERN = /^[a-zA-Z0-9_]{2,20}$/;
const userKey = (id) => `rebalancer:user:${id}`;
const USERS_SET_KEY = 'rebalancer:users';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const id = ((req.body && req.body.id) || '').trim();
    const password = (req.body && req.body.password) || '';
    if (!ID_PATTERN.test(id)) {
      return res.status(400).json({ error: 'ID는 영문/숫자/밑줄 2~20자로 입력해주세요.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }
    const existing = await redis.get(userKey(id));
    if (existing) {
      return res.status(409).json({ error: '이미 사용 중인 ID입니다.' });
    }
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    await redis.set(userKey(id), { passwordHash, failedAttempts: 0, lockedUntil: null, suspended: false });
    await redis.sadd(USERS_SET_KEY, id);
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    return res.status(500).json({ error: 'ID 생성 중 오류가 발생했습니다.', detail: String(err) });
  }
}
