// ==== 키움증권 REST API 연동: 현재가 조회(GET) + 계좌 잔고 조회(POST) ====
// Vercel Hobby 플랜은 배포당 서버리스 함수 개수가 제한돼 있어(12개), 국내/해외 현재가 조회와
// 계좌 잔고 조회를 파일 하나로 합쳐서 함수 슬롯을 아낀다. 이미 12개를 다 쓰고 있던 상태라
// api/kiwoom-price.js · api/kiwoom-price-overseas.js · api/kiwoom-balance.js 세 파일로
// 나눴을 때 배포가 바로 실패했다.
import { Redis } from '@upstash/redis';
import { callKiwoom, getKiwoomAccounts } from '../lib/kiwoom.js';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 키움 앱키/시크릿은 sinra815 개인 계좌에 연결된 것이라, 다른 계정은 이 잔고를 조회할 수 없게
// 고정한다. 관리자 권한(admin)과는 별개의 제약이라 lib/admin.js 의 ADMIN_ID 를 재사용하지
// 않는다 — 관리자 권한은 다른 계정에 넘기거나 뺏을 수 있지만, 이 계좌의 소유자는 바뀌지 않는다.
const KIWOOM_OWNER_ID = 'sinra815';

const toNumber = (v) => Number(String(v ?? '0').trim()) || 0;

async function getDomesticPrice(code) {
  if (!/^\d{6}$/.test(code)) {
    return { status: 400, body: { error: '6자리 국내 종목코드를 입력해주세요.' } };
  }
  // 시세 조회는 계좌와 무관한 공개 시장 데이터라, 등록된 계좌 중 아무 앱키로나 호출하면 된다.
  const account = getKiwoomAccounts()[0];
  const data = await callKiwoom(redis, account, 'ka10001', '/api/dostk/stkinfo', { stk_cd: code });
  if (!data.cur_prc) {
    return { status: 404, body: { error: `"${code}"의 현재가를 가져오지 못했습니다.` } };
  }
  // 현재가(cur_prc)는 스펙상 부호가 붙어 올 수 있으나(과거 HTS 관행) 가격 자체는 항상 절대값.
  // 등락률(flu_rt)은 이미 부호를 포함한 숫자 문자열로 내려온다(예: "-1.23").
  const price = Math.abs(Number(data.cur_prc) || 0);
  const changePercent = Number(data.flu_rt) || 0;
  return { status: 200, body: { price, name: data.stk_nm || '', changePercent } };
}

async function getOverseasPrice(code) {
  if (!/^[A-Z]{1,6}$/.test(code)) {
    return { status: 400, body: { error: '미국 상장 종목코드(알파벳)를 입력해주세요.' } };
  }
  // usa20100(현재가)은 거래소구분(stex_tp)이 필수라, 먼저 usa10098로 어느 거래소(나스닥/
  // NYSE/AMEX) 상장인지 조회한 다음에야 현재가를 물어볼 수 있다.
  const account = getKiwoomAccounts()[0];
  const exInfo = await callKiwoom(redis, account, 'usa10098', '/api/us/stkinfo', { stk_cd: code });
  const stexTp = exInfo.list && exInfo.list[0] && exInfo.list[0].stex_tp;
  if (!stexTp) {
    return { status: 404, body: { error: `"${code}"에 해당하는 미국 상장 종목을 찾지 못했습니다.` } };
  }
  const data = await callKiwoom(redis, account, 'usa20100', '/api/us/mrkcond', { stex_tp: stexTp, stk_cd: code });
  const rawPrice = Math.abs(Number(data.cur_prc) || 0);
  const exchangeRate = Number(data.base_exrt) || 0;
  if (!rawPrice || !exchangeRate) {
    return { status: 404, body: { error: `"${code}"의 현재가를 가져오지 못했습니다.` } };
  }
  // 화면 전체가 원화 기준이라, 여기서도 환율(base_exrt)로 환산한 원화 가격을 돌려준다.
  const price = Math.round(rawPrice * exchangeRate);
  const changePercent = Number(data.flu_rt) || 0;
  return { status: 200, body: { price, name: data.stk_nm || '', changePercent, currency: 'USD', rawPrice, exchangeRate } };
}

// 계좌 하나(앱키 하나)의 국내/해외 잔고 + 예수금을 모두 조회해서 한 묶음으로 돌려준다.
async function getAccountBalance(account) {
  const data = await callKiwoom(redis, account, 'kt00018', '/api/dostk/acnt', {
    qry_tp: '1',
    dmst_stex_tp: 'KRX',
  });

  // 해외주식(미국) 잔고는 별도 TR. 해외 거래 계좌가 없거나 조회에 실패해도 국내 잔고는
  // 정상 표시해야 하므로, 이 호출만 실패를 삼키고 국내 결과만으로 계속 진행한다.
  let overseas = null;
  try {
    overseas = await callKiwoom(redis, account, 'ust21070', '/api/us/acnt', { stex_tp: '', stk_cd: '' });
  } catch (e) {
    overseas = null;
  }

  // 예수금(국내 원화 현금)은 kt00018/보유종목과 별도 TR. 여기서도 실패해도 나머지 잔고는
  // 정상 표시되도록 실패를 삼킨다. (해외 계좌의 외화 예수금은 통화별 환산이 더 필요해 범위 밖.)
  let cashBalance = 0;
  try {
    const cash = await callKiwoom(redis, account, 'kt00001', '/api/dostk/acnt', { qry_tp: '2' });
    cashBalance = toNumber(cash.entr);
  } catch (e) {
    cashBalance = 0;
  }

  const holdings = (data.acnt_evlt_remn_indv_tot || []).map((row) => ({
    broker: '키움증권',
    account: account.label,
    accountType: '국내',
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
    broker: '키움증권',
    account: account.label,
    accountType: '해외',
    code: row.stk_cd || '',
    name: row.frgn_stk_nm || '',
    qty: toNumber(row.poss_qty),
    currentPrice: toNumber(row.now_pric_krw),
    purchasePrice: toNumber(row.frgn_stk_book_uv_krw),
    evalAmount: toNumber(row.evlt_amt_krw),
    evalProfit: toNumber(row.pl_amt_krw),
    profitRate: toNumber(row.pl_rt),
  }));

  return {
    purchaseAmount: toNumber(data.tot_pur_amt) + (overseas ? toNumber(overseas.tot_prch_amt_krw) : 0),
    evalAmount: toNumber(data.tot_evlt_amt) + (overseas ? toNumber(overseas.tot_evlt_amt_krw) : 0),
    evalProfit: toNumber(data.tot_evlt_pl) + (overseas ? toNumber(overseas.tot_pl_amt_krw) : 0),
    cashBalance,
    holdings: [...holdings, ...overseasHoldings],
  };
}

async function getBalance(id) {
  if (id !== KIWOOM_OWNER_ID) {
    return { status: 403, body: { error: '이 계좌 정보는 조회할 수 없습니다.' } };
  }

  const accounts = getKiwoomAccounts();
  if (accounts.length === 0) {
    return { status: 500, body: { error: '키움 앱키가 설정되지 않았습니다.' } };
  }

  let totalPurchaseAmount = 0, totalEvalAmount = 0, totalEvalProfit = 0, cashBalance = 0;
  const holdings = [];
  const failed = [];

  for (const account of accounts) {
    try {
      const result = await getAccountBalance(account);
      totalPurchaseAmount += result.purchaseAmount;
      totalEvalAmount += result.evalAmount;
      totalEvalProfit += result.evalProfit;
      cashBalance += result.cashBalance;
      holdings.push(...result.holdings);
    } catch (e) {
      // 계좌 하나가 막혀도(예: IP 미등록, 토큰 문제) 나머지 계좌는 계속 보여준다.
      failed.push(`${account.label}: ${e.message}`);
    }
  }

  if (holdings.length === 0 && failed.length === accounts.length) {
    return { status: 500, body: { error: '계좌 잔고를 조회하는 중 오류가 발생했습니다.', detail: failed.join(' / ') } };
  }

  return {
    status: 200,
    body: {
      totalPurchaseAmount,
      totalEvalAmount,
      totalEvalProfit,
      // 계좌들을 합친 총수익률은 각 TR이 따로 주는 값을 쓸 수 없어(통화 기준이 달라) 직접 계산한다.
      totalProfitRate: totalPurchaseAmount ? (totalEvalProfit / totalPurchaseAmount) * 100 : 0,
      cashBalance, // 국내 원화 예수금(현금) 합계. 해외 계좌의 외화 예수금은 포함하지 않음
      holdings,
      failedAccounts: failed, // 일부 계좌 조회가 실패했을 때 화면에서 알릴 수 있도록
    },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const code = (req.query.code || '').toString().trim().toUpperCase();
      if (!code) return res.status(400).json({ error: '종목코드를 입력해주세요.' });
      const result = /^\d{6}$/.test(code) ? await getDomesticPrice(code) : await getOverseasPrice(code);
      return res.status(result.status).json(result.body);
    }
    if (req.method === 'POST') {
      const { id } = req.body || {};
      const result = await getBalance(id);
      return res.status(result.status).json(result.body);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET 또는 POST 요청만 지원합니다.' });
  } catch (err) {
    return res.status(500).json({ error: '키움 API 조회 중 오류가 발생했습니다.', detail: String(err) });
  }
}
