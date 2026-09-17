import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const userKey = (id) => `rebalancer:user:${id}`;
const USERS_SET_KEY = 'rebalancer:users';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const id = ((req.body && req.body.id) || '').trim();
    const password = (req.body && req.body.password) || '';
    if (!id || !password) {
      return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' });
    }

    const user = await redis.get(userKey(id));
    if (!user) {
      return res.status(200).json({ exists: false });
    }

    if (user.suspended) {
      return res.status(403).json({ error: '이 계정은 사용이 중지되었습니다.', exists: true });
    }

    const now = Date.now();
    if (user.lockedUntil && now < user.lockedUntil) {
      const remainMin = Math.ceil((user.lockedUntil - now) / 60000);
      return res.status(423).json({
        error: `비밀번호를 5회 잘못 입력하여 ${remainMin}분간 로그인이 제한되었습니다.`,
        lockedUntil: user.lockedUntil,
      });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    if (passwordHash === user.passwordHash) {
      await redis.set(userKey(id), { ...user, failedAttempts: 0, lockedUntil: null });
      // register.js 배포 전에 만들어진 계정은 목록 집합에 없을 수 있어, 로그인 때 채워 넣는다.
      await redis.sadd(USERS_SET_KEY, id);
      return res.status(200).json({ ok: true, exists: true, id });
    }

    const failedAttempts = (user.failedAttempts || 0) + 1;
    if (failedAttempts >= MAX_ATTEMPTS) {
      const lockedUntil = now + LOCK_MS;
      await redis.set(userKey(id), { ...user, failedAttempts: 0, lockedUntil });
      return res.status(423).json({
        error: '비밀번호를 5회 잘못 입력하여 10분간 로그인이 제한됩니다.',
        lockedUntil,
      });
    }

    await redis.set(userKey(id), { ...user, failedAttempts, lockedUntil: null });
    return res.status(401).json({
      error: `비밀번호가 일치하지 않습니다. (실패 ${failedAttempts}/${MAX_ATTEMPTS})`,
      exists: true,
    });
  } catch (err) {
    return res.status(500).json({ error: '로그인 중 오류가 발생했습니다.', detail: String(err) });
  }
}
