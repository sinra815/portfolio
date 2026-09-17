import { Redis } from '@upstash/redis';
import crypto from 'crypto';

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
    const { id, currentPassword, newPassword } = req.body || {};
    if (!id || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'ID·현재 비밀번호·새 비밀번호를 모두 입력해주세요.' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
    }
    const user = await redis.get(userKey(id));
    if (!user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    if (user.suspended) {
      return res.status(403).json({ error: '이 계정은 사용이 중지되었습니다.' });
    }
    const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    if (currentHash !== user.passwordHash) {
      return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
    }
    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    await redis.set(userKey(id), { ...user, passwordHash: newHash, failedAttempts: 0, lockedUntil: null });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다.', detail: String(err) });
  }
}
