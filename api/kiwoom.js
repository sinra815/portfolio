// ==== 키움증권 REST API 연동: 현재가 조회(GET) + 계좌 잔고 조회(POST) ====
// Vercel Hobby 플랜은 배포당 서버리스 함수 개수가 제한돼 있어(12개), 국내/해외 현재가 조회와
// 계좌 잔고 조회를 파일 하나로 합쳐서 함수 슬롯을 아낀다. 이미 12개를 다 쓰고 있던 상태라
// api/kiwoom-price.js · api/kiwoom-price-overseas.js · api/kiwoom-balance.js 세 파일로
// 나눴을 때 배포가 바로 실패했다.
import { Redis } from '@upstash/redis';
import { callKiwoom, getKiwoomAccounts } from '../lib/kiwoom.js';
import { callNh, getNhAccounts, getNhLiveAccounts } from '../lib/nh.js';

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
  // 다만 실패 자체는 cashError로 남겨서, 계좌에 실제 예수금이 있는데도 0으로 보이는 원인을
  // 화면(일부 계좌 조회 실패 안내)에서 바로 알 수 있게 한다.
  let cashBalance = 0;
  let cashNote = null; // 화면(일부 계좌 조회 실패 안내)에 그대로 노출할 완성된 문구
  try {
    const cash = await callKiwoom(redis, account, 'kt00001', '/api/dostk/acnt', { qry_tp: '2' });
    cashBalance = toNumber(cash.entr);
  } catch (e) {
    cashBalance = 0;
    cashNote = `[${account.label}] 예수금 조회 실패: ${e.message}`;
  }

  // IRP(개인형퇴직연금) 등 결제 체계가 다른 계좌는 kt00001의 즉시결제 예수금(entr)이 항상
  // 0으로 나온다 — 실제 잔고는 D+2 결제 기준인 계좌평가현황요청(kt00004)의 d2_entra(D+2
  // 추정예수금)에 찍힌다. kt00001이 0일 때만 이 TR을 한 번 더 불러 그 값을 예수금으로 쓴다.
  if (cashBalance === 0) {
    try {
      const eval4 = await callKiwoom(redis, account, 'kt00004', '/api/dostk/acnt', { qry_tp: '0', dmst_stex_tp: 'KRX' });
      cashBalance = toNumber(eval4.entr) || toNumber(eval4.d2_entra);
    } catch (e) {
      // 이 보조 조회가 실패해도 kt00001 결과(0)를 그대로 쓴다.
    }
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

  // 예수금도 "종목"처럼 국내 보유 목록에 한 줄로 끼워 넣는다 — 화면에서 표를 계좌/유형별로
  // 나눌 때 다른 종목과 같은 방식으로 자연스럽게 그 계좌의 국내 표에 들어가게 하기 위함.
  // 보유수량은 개념이 없어 null(화면에서 "-")로 두고, 현재가는 평가금액과 같은 값(예수금
  // 자체가 금액이라 "가격" 개념이 곧 그 금액), 평가손익/수익률은 손익이 없으니 0으로 둔다.
  const cashHolding = {
    broker: '키움증권',
    account: account.label,
    accountType: '국내',
    code: 'CASH',
    name: '예수금',
    qty: null,
    currentPrice: cashBalance,
    purchasePrice: cashBalance,
    evalAmount: cashBalance,
    evalProfit: 0,
    profitRate: 0,
    isCash: true,
  };

  return {
    purchaseAmount: toNumber(data.tot_pur_amt) + (overseas ? toNumber(overseas.tot_prch_amt_krw) : 0),
    evalAmount: toNumber(data.tot_evlt_amt) + (overseas ? toNumber(overseas.tot_evlt_amt_krw) : 0),
    evalProfit: toNumber(data.tot_evlt_pl) + (overseas ? toNumber(overseas.tot_pl_amt_krw) : 0),
    cashBalance,
    holdings: [...holdings, cashHolding, ...overseasHoldings],
    cashError: cashNote,
  };
}

// 해외주식은 국가+통화 조합별로 따로 조회해야 하는 스펙이라(공식 문서 기준) 나라별로 호출을
// 나눠야 하는데, 미국 외 시장은 거래하지 않아 미국만 조회해 NH 호출 건수를 아낀다.
const NH_OVERSEAS_MARKETS = [
  { code: '200', currency: 'USD' }, // 미국
];

// 계좌 하나(앱키 하나)의 국내/해외 잔고 + 예수금을 모두 조회해서 한 묶음으로 돌려준다.
// NH는 계좌번호를 미리 모르므로(/n2/acctinfo로 조회) 앱키당 계좌번호부터 확인하는데, 앱키 하나에
// 운영 계좌가 여러 개 연결된 경우(예: 일반증권계좌 + 연금저축/IRP)가 있어 각 계좌를 모두 조회해
// 합친다 — 계좌가 여러 개면 화면에서 구분할 수 있도록 계좌번호 뒷자리를 이름에 덧붙인다.
// 계좌별로 개별 try/catch를 둬서, 계좌 하나가 실패해도(예: 연금계좌 쪽 조회 오류) 나머지 계좌는
// 계속 보여준다 — Promise.all은 하나만 실패해도 전체가 실패해버려서 이 앱키 전체가 통째로
// 사라지는 문제가 있었다.
async function getNhAccountBalance(account) {
  const actNos = await getNhLiveAccounts(redis, account);
  const settled = await Promise.allSettled(
    actNos.map((actNo) => getNhSingleAccountBalance(
      account,
      actNo,
      actNos.length > 1 ? `${account.label} (${actNo.slice(-4)})` : account.label,
    ))
  );
  const results = [];
  const failedSubAccounts = [];
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') {
      results.push(s.value);
      if (s.value.note) failedSubAccounts.push(s.value.note);
    } else {
      failedSubAccounts.push(`${account.label}(${actNos[i].slice(-4)}): ${(s.reason && s.reason.message) || s.reason}`);
    }
  });
  if (results.length === 0) {
    throw new Error(failedSubAccounts.join(' / ') || `[${account.label}] 계좌 조회에 실패했습니다.`);
  }
  return {
    purchaseAmount: results.reduce((s, r) => s + r.purchaseAmount, 0),
    evalAmount: results.reduce((s, r) => s + r.evalAmount, 0),
    evalProfit: results.reduce((s, r) => s + r.evalProfit, 0),
    cashBalance: results.reduce((s, r) => s + r.cashBalance, 0),
    holdings: results.flatMap((r) => r.holdings),
    failedSubAccounts,
  };
}

// 계좌번호(actNo) 하나의 국내/해외 잔고 + 예수금 조회. label은 화면에 표시할 계좌명.
async function getNhSingleAccountBalance(account, actNo, label) {
  const domestic = await callNh(redis, account, '/krstock/inquiry/v1/balance', {
    Input_0: {
      act_no: actNo,
      bnc_bse_cd: '5', // 주식잔고평가(현재가기준)
      ltg_aot_dit_cd: '1', // 상장종목
      aet_bse: '1', // 순자산
      qut_dit_cd: 'UNT', // 통합시세(KRX+NXT)
      aly_qut_cd: '1', // 정규장
    },
  });
  const d0 = domestic.Output_0 || {};
  const cashBalance = toNumber(d0.dca);
  // 예수금(dca)이 0인데 자산 자체는 있는 경우(키움 IRP와 유사하게 계좌 유형에 따라 즉시결제
  // 예수금 필드가 0으로 나올 수 있어) 원인 파악용으로 다른 자산 필드/계좌 상태/공통 응답
  // 메시지 봉투(message)를 함께 남긴다. callNh()는 HTTP 상태만 보고 성공/실패를 가르기
  // 때문에, TR이 HTTP 200이면서 message 안에 에러를 담아 보내는 경우 지금까지는 그냥
  // 조용히 빈 데이터로 넘어가고 있었을 수 있다.
  let note = null;
  if (cashBalance === 0) {
    const nas = toNumber(d0.nas_amt);
    const tot = toNumber(d0.tot_aet_amt);
    const status = d0.act_atv_tp_dtl_cd;
    const msg = domestic.message || {};
    if (nas || tot || (status && status !== '101') || msg.msg_lv_code || msg.usr_msg) {
      note = `[${label}] 예수금 0, 순자산=${nas} / 총자산=${tot} / 계좌상태=${status || '-'} / msg_lv=${msg.msg_lv_code || '-'} / usr_msg=${msg.usr_msg || '-'} / msg_code=${msg.msg_code || '-'}`;
    } else {
      note = `[${label}] 예수금 0, 원본 응답: ${JSON.stringify(domestic).slice(0, 300)}`;
    }
  }

  const holdings = (domestic.Output_1 || []).map((row) => ({
    broker: 'NH투자증권',
    account: label,
    accountType: '국내',
    code: row.iem_cd || '',
    name: row.iem_nm || '',
    qty: toNumber(row.itg_bnc_qty),
    currentPrice: toNumber(row.now_pr),
    purchasePrice: toNumber(row.phs_pr),
    evalAmount: toNumber(row.eal_amt),
    evalProfit: toNumber(row.eal_pls_amt),
    profitRate: toNumber(row.pft_rt),
  }));

  const cashHolding = {
    broker: 'NH투자증권',
    account: label,
    accountType: '국내',
    code: 'CASH',
    name: '예수금',
    qty: null,
    currentPrice: cashBalance,
    purchasePrice: cashBalance,
    evalAmount: cashBalance,
    evalProfit: 0,
    profitRate: 0,
    isCash: true,
  };

  let overseasEvalAmount = 0, overseasEvalProfit = 0;
  const overseasHoldings = [];
  for (const market of NH_OVERSEAS_MARKETS) {
    try {
      const gb = await callNh(redis, account, '/gbstock/inquiry/v1/balance', {
        Input_0: {
          act_no: actNo,
          qut_iqr_dit_cd: '1', // 정규장
          fc_sec_trd_nat_cd: market.code,
          cur_cd: market.currency,
        },
      });
      const g0 = gb.Output_0;
      if (g0) {
        overseasEvalAmount += toNumber(g0.eal_amt_sum);
        overseasEvalProfit += toNumber(g0.eal_pls_sum_amt);
      }
      (gb.Output_1 || []).forEach((row) => {
        overseasHoldings.push({
          broker: 'NH투자증권',
          account: label,
          accountType: '해외',
          code: row.iem_cd || '',
          name: row.iem_nm || row.oss_iem_eng_nm || '',
          qty: toNumber(row.cns_bse_bnc_qty),
          currentPrice: toNumber(row.end_pr),
          purchasePrice: toNumber(row.phs_uit_pr),
          evalAmount: toNumber(row.krw_eal_amt),
          evalProfit: toNumber(row.krw_eal_pls_amt),
          profitRate: toNumber(row.eal_pft_rt),
        });
      });
    } catch (e) {
      // 이 시장 조회 하나가 막혀도(예: 그 국가 미보유) 나머지 시장은 계속 조회한다.
    }
  }

  const evalAmount = toNumber(d0.tot_eal_amt) + overseasEvalAmount;
  const evalProfit = toNumber(d0.tot_eal_pls) + overseasEvalProfit;
  return {
    purchaseAmount: evalAmount - evalProfit, // 평가손익 = 평가금액 - 매입금액 관계를 거꾸로 이용
    evalAmount,
    evalProfit,
    cashBalance,
    holdings: [...holdings, cashHolding, ...overseasHoldings],
    note,
  };
}

async function getBalance(id) {
  if (id !== KIWOOM_OWNER_ID) {
    return { status: 403, body: { error: '이 계좌 정보는 조회할 수 없습니다.' } };
  }

  const kiwoomAccounts = getKiwoomAccounts();
  const nhAccounts = getNhAccounts();
  const accounts = [
    ...kiwoomAccounts.map((account) => ({ account, fetcher: getAccountBalance })),
    ...nhAccounts.map((account) => ({ account, fetcher: getNhAccountBalance })),
  ];
  if (accounts.length === 0) {
    return { status: 500, body: { error: '증권사 앱키가 설정되지 않았습니다.' } };
  }

  let totalPurchaseAmount = 0, totalEvalAmount = 0, totalEvalProfit = 0, cashBalance = 0;
  const holdings = [];
  // 증권사 하나가 앱키 자체가 없어서(NH_APP_KEY 등 환경변수 미설정) accounts 목록에 처음부터
  // 빠지면, 그 증권사는 실패조차 안 하고 조용히 생략돼 화면에 아무 안내 없이 사라져 버린다
  // — 이 경우를 구분해서 눈에 보이는 안내를 남긴다.
  const failed = [];
  if (kiwoomAccounts.length === 0) failed.push('키움증권: 앱키(KIWOOM_APP_KEY)가 설정되지 않았습니다.');
  if (nhAccounts.length === 0) failed.push('NH투자증권: 앱키(NH_APP_KEY)가 설정되지 않았습니다.');

  for (const { account, fetcher } of accounts) {
    try {
      const result = await fetcher(account);
      totalPurchaseAmount += result.purchaseAmount;
      totalEvalAmount += result.evalAmount;
      totalEvalProfit += result.evalProfit;
      cashBalance += result.cashBalance;
      holdings.push(...result.holdings);
      if (result.failedSubAccounts && result.failedSubAccounts.length) failed.push(...result.failedSubAccounts);
      if (result.cashError) failed.push(result.cashError);
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
