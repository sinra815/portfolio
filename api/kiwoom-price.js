import { Redis } from '@upstash/redis';
import { callKiwoom } from '../lib/kiwoom.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const code = (req.query.code || '').toString().trim();
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: '6자리 국내 종목코드를 입력해주세요.' });
  }
  try {
    const data = await callKiwoom(redis, 'ka10001', '/api/dostk/stkinfo', { stk_cd: code });
    if (!data.cur_prc) {
      return res.status(404).json({ error: `"${code}"의 현재가를 가져오지 못했습니다.` });
    }
    // 현재가(cur_prc)는 스펙상 부호가 붙어 올 수 있으나(과거 HTS 관행) 가격 자체는 항상 절대값.
    // 등락률(flu_rt)은 이미 부호를 포함한 숫자 문자열로 내려온다(예: "-1.23").
    const price = Math.abs(Number(data.cur_prc) || 0);
    const changePercent = Number(data.flu_rt) || 0;
    return res.status(200).json({ price, name: data.stk_nm || '', changePercent });
  } catch (err) {
    return res.status(500).json({ error: '현재가를 불러오는 중 오류가 발생했습니다.', detail: String(err) });
  }
}
