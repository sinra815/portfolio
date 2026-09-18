import { Redis } from '@upstash/redis';
import { callKiwoom } from '../lib/kiwoom.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const code = (req.query.code || '').toString().trim().toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(code)) {
    return res.status(400).json({ error: '미국 상장 종목코드(알파벳)를 입력해주세요.' });
  }
  try {
    // usa20100(현재가)은 거래소구분(stex_tp)이 필수라, 먼저 usa10098로 어느 거래소(나스닥/
    // NYSE/AMEX) 상장인지 조회한 다음에야 현재가를 물어볼 수 있다.
    const exInfo = await callKiwoom(redis, 'usa10098', '/api/us/stkinfo', { stk_cd: code });
    const stexTp = exInfo.list && exInfo.list[0] && exInfo.list[0].stex_tp;
    if (!stexTp) {
      return res.status(404).json({ error: `"${code}"에 해당하는 미국 상장 종목을 찾지 못했습니다.` });
    }

    const data = await callKiwoom(redis, 'usa20100', '/api/us/mrkcond', { stex_tp: stexTp, stk_cd: code });
    const rawPrice = Math.abs(Number(data.cur_prc) || 0);
    const exchangeRate = Number(data.base_exrt) || 0;
    if (!rawPrice || !exchangeRate) {
      return res.status(404).json({ error: `"${code}"의 현재가를 가져오지 못했습니다.` });
    }
    // 화면 전체가 원화 기준이라, 여기서도 환율(base_exrt)로 환산한 원화 가격을 돌려준다.
    const price = Math.round(rawPrice * exchangeRate);
    const changePercent = Number(data.flu_rt) || 0;
    return res.status(200).json({ price, name: data.stk_nm || '', changePercent, currency: 'USD', rawPrice, exchangeRate });
  } catch (err) {
    return res.status(500).json({ error: '현재가를 불러오는 중 오류가 발생했습니다.', detail: String(err) });
  }
}
