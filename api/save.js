import { kv } from '@vercel/kv';

const KEY = 'rebalancer:data';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const payload = req.body || {};
    await kv.set(KEY, payload);
    return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: '저장 중 오류가 발생했습니다.', detail: String(err) });
  }
}
