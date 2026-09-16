import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const userKey = (id) => `rebalancer:user:${id}`;
const dataKey = (id) => `rebalancer:user:${id}:data`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'ID가 필요합니다.' });
    }
    const user = await redis.get(userKey(id));
    if (!user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    const data = await redis.get(dataKey(id));
    return res.status(200).json({ data: data || null });
  } catch (err) {
    return res.status(500).json({ error: '불러오기 중 오류가 발생했습니다.', detail: String(err) });
  }
}
