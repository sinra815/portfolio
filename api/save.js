import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'rebalancer:data';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const payload = req.body || {};
    await redis.set(KEY, payload);
    return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.', detail: String(err) });
  }
}