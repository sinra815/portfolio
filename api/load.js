import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'rebalancer:data';

export default async function handler(req, res) {
  try {
    const data = await redis.get(KEY);
    return res.status(200).json({ data: data || null });
  } catch (err) {
    return res.status(500).json({ error: '불러오기 중 오류가 발생했습니다.', detail: String(err) });
  }
}