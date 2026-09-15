import { kv } from '@vercel/kv';

const KEY = 'rebalancer:data';

export default async function handler(req, res) {
  try {
    const data = await kv.get(KEY);
    return res.status(200).json({ data: data || null });
  } catch (err) {
    return res.status(500).json({ error: '불러오기 중 오류가 발생했습니다.', detail: String(err) });
  }
}
