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
    // 계정 확인과 데이터 조회는 서로 의존하지 않으니 순서대로 기다리지 않고 동시에 보낸다 —
    // 로그인 직후 화면에 데이터가 뜨기까지 걸리는 시간의 상당 부분이 이 두 번의 Redis 왕복이었다.
    const [user, data] = await Promise.all([redis.get(userKey(id)), redis.get(dataKey(id))]);
    if (!user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    if (user.suspended) {
      return res.status(403).json({ error: '이 계정은 사용이 중지되었습니다.' });
    }
    return res.status(200).json({ data: data || null });
  } catch (err) {
    return res.status(500).json({ error: '불러오기 중 오류가 발생했습니다.', detail: String(err) });
  }
}
