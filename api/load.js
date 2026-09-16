import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'rebalancer:data';

export default async function handler(req, res) {
  try {
    // 저장 배지는 데이터의 존재 여부만 알면 되므로, 전체 payload를 내려보내지 않는다.
    if (req.query.existsOnly) {
      const exists = await redis.exists(KEY);
      return res.status(200).json({ exists: exists === 1 });
    }
    const data = await redis.get(KEY);
    return res.status(200).json({ data: data || null });
  } catch (err) {
    return res.status(500).json({ error: '불러오기 중 오류가 발생했습니다.', detail: String(err) });
  }
}
