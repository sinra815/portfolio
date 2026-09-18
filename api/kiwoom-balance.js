import { Redis } from '@upstash/redis';
import { callKiwoom } from '../lib/kiwoom.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 키움 앱키/시크릿은 sinra815 개인 계좌에 연결된 것이라, 다른 계정은 이 잔고를 조회할 수 없게
// 고정한다. 관리자 권한(admin)과는 별개의 제약이라 lib/admin.js 의 ADMIN_ID 를 재사용하지
// 않는다 — 관리자 권한은 다른 계정에 넘기거나 뺏을 수 있지만, 이 계좌의 소유자는 바뀌지 않는다.
const KIWOOM_OWNER_ID = 'sinra815';

const toNumber = (v) => Number(String(v ?? '0').trim()) || 0;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }
  try {
    const { id } = req.body || {};
    if (id !== KIWOOM_OWNER_ID) {
      return res.status(403).json({ error: '이 계좌 정보는 조회할 수 없습니다.' });
    }

    const data = await callKiwoom(redis, 'kt00018', '/api/dostk/acnt', {
      qry_tp: '1',
      dmst_stex_tp: 'KRX',
    });

    // 해외주식(미국) 잔고는 별도 TR. 해외 거래 계좌가 없거나 조회에 실패해도 국내 잔고는
    // 정상 표시해야 하므로, 이 호출만 실패를 삼키고 국내 결과만으로 계속 진행한다.
    let overseas = null;
    try {
      overseas = await callKiwoom(redis, 'ust21070', '/api/us/acnt', { stex_tp: '', stk_cd: '' });
    } catch (e) {
      overseas = null;
    }

    const holdings = (data.acnt_evlt_remn_indv_tot || []).map((row) => ({
      code: String(row.stk_cd || '').replace(/^[A-Z]/, ''), // 접두어(A:주식/J:ELW/Q:ETN) 제거
      name: row.stk_nm || '',
      qty: toNumber(row.rmnd_qty),
      currentPrice: Math.abs(toNumber(row.cur_prc)),
      purchasePrice: Math.abs(toNumber(row.pur_pric)),
      evalAmount: toNumber(row.evlt_amt),
      evalProfit: toNumber(row.evltv_prft),
      profitRate: toNumber(row.prft_rt),
      weightPercent: toNumber(row.poss_rt),
    }));

    // 해외 API는 원화 환산 필드(_krw)를 함께 내려주므로, 화면이 통화 단위 없이 원화 기준으로
    // 통일해서 보여줄 수 있도록 그 값을 그대로 쓴다.
    const overseasHoldings = ((overseas && overseas.result_list) || []).map((row) => ({
      code: row.stk_cd || '',
      name: row.frgn_stk_nm || '',
      qty: toNumber(row.poss_qty),
      currentPrice: toNumber(row.now_pric_krw),
      purchasePrice: toNumber(row.frgn_stk_book_uv_krw),
      evalAmount: toNumber(row.evlt_amt_krw),
      evalProfit: toNumber(row.pl_amt_krw),
      profitRate: toNumber(row.pl_rt),
    }));

    const overseasEvalAmount = overseas ? toNumber(overseas.tot_evlt_amt_krw) : 0;
    const overseasPurchaseAmount = overseas ? toNumber(overseas.tot_prch_amt_krw) : 0;
    const overseasEvalProfit = overseas ? toNumber(overseas.tot_pl_amt_krw) : 0;

    const totalPurchaseAmount = toNumber(data.tot_pur_amt) + overseasPurchaseAmount;
    const totalEvalAmount = toNumber(data.tot_evlt_amt) + overseasEvalAmount;
    const totalEvalProfit = toNumber(data.tot_evlt_pl) + overseasEvalProfit;

    return res.status(200).json({
      totalPurchaseAmount,
      totalEvalAmount,
      totalEvalProfit,
      // 국내/해외를 합친 총수익률은 각 TR이 따로 주는 값을 쓸 수 없어(통화 기준이 달라) 직접 계산한다.
      totalProfitRate: totalPurchaseAmount ? (totalEvalProfit / totalPurchaseAmount) * 100 : 0,
      estimatedAssetAmount: toNumber(data.prsm_dpst_aset_amt), // 국내 예수금 기준(해외 현금은 미포함)
      holdings: [...holdings, ...overseasHoldings],
    });
  } catch (err) {
    return res.status(500).json({ error: '계좌 잔고를 조회하는 중 오류가 발생했습니다.', detail: String(err) });
  }
}
