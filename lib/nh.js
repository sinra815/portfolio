// ==== NH투자증권 PLUG(나무) REST API 공통 로직: 토큰 발급/캐싱 + 계좌 조회 + 호출 헬퍼 ====
// 앱키/시크릿은 Vercel 환경변수(NH_APP_KEY, NH_APP_SECRET)로만 저장되고, 이 파일은
// 서버(api/kiwoom.js)에서만 임포트된다 — 브라우저로는 절대 전달되지 않는다.
//
// 키움과 달리 IP 등록 요구사항이 공식 문서에 없어(2026-09 기준), 고정 IP 중계 서버 없이
// Vercel에서 직접 호출한다. 문제가 생기면 lib/kiwoom.js의 KIWOOM_RELAY_URL과 같은 방식으로
// 우회하면 된다.

const BASE_URL = 'https://api.nhplug.com:8443'; // 접근토큰 발급은 운영 전용(모의투자 미제공)
const TOKEN_CACHE_PREFIX = 'nh:accessToken';
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// 키움과 마찬가지로 앱키 1개당 계좌(고객)가 다를 수 있어 여러 계좌를 지원한다. 기본 계좌는
// NH_APP_KEY/NH_APP_SECRET, 추가 계좌는 NH_APP_KEY_2/NH_APP_SECRET_2, _3 ... 라벨은
// NH_APP_KEY_2_LABEL 처럼 선택 지정, 없으면 "NH계좌N".
export function getNhAccounts(){
  const accounts = [];
  if (process.env.NH_APP_KEY && process.env.NH_APP_SECRET) {
    accounts.push({
      id: '1',
      appkey: process.env.NH_APP_KEY,
      secretkey: process.env.NH_APP_SECRET,
      label: process.env.NH_APP_KEY_LABEL || 'NH계좌1',
    });
  }
  for (let n = 2; ; n++) {
    const appkey = process.env[`NH_APP_KEY_${n}`];
    const secretkey = process.env[`NH_APP_SECRET_${n}`];
    if (!appkey || !secretkey) break;
    accounts.push({
      id: String(n),
      appkey,
      secretkey,
      label: process.env[`NH_APP_KEY_${n}_LABEL`] || `NH계좌${n}`,
    });
  }
  return accounts;
}

// 응답에 성공/실패를 하나의 rsp_cd 값으로만 판정하지 말라고 공식 문서가 명시한다(API마다
// 정상 코드가 다름) — 기대한 블록(Output_0 등)이 있는지로 판단하고, 실패 메시지는 최상위
// rsp_msg 또는 message.msg 중 있는 쪽을 쓴다.
export function extractNhMessage(data){
  return data.rsp_msg || (data.message && data.message.msg) || '알 수 없는 오류';
}

async function issueNhToken(account){
  const params = new URLSearchParams({
    appkey: account.appkey,
    appsecretkey: account.secretkey,
    grant_type: 'client_credentials',
    scope: 'oob',
  });
  const res = await fetch(`${BASE_URL}/oauth2/token?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(extractNhMessage(data) || `[${account.label}] NH 접근토큰 발급에 실패했습니다.`);
  }
  // expires_in(초, 보통 86400=24시간) 그대로 신뢰 — 실제 만료시각은 여유(버퍼)를 두고 계산.
  const expiresAt = Date.now() + (Number(data.expires_in) || 86400) * 1000;
  return { token: data.access_token, expiresAt };
}

async function getNhAccessToken(redis, account, { forceRefresh } = {}){
  const cacheKey = `${TOKEN_CACHE_PREFIX}:${account.id}`;
  if (!forceRefresh) {
    const cached = await redis.get(cacheKey);
    if (cached && cached.token && cached.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
      return cached.token;
    }
  }
  const { token, expiresAt } = await issueNhToken(account);
  await redis.set(cacheKey, { token, expiresAt });
  return token;
}

// NH REST 엔드포인트 하나를 호출한다. 토큰이 만료되면 401이 오므로(키움의 return_code 8005와
// 대응), 그 경우 한 번 재발급해서 재시도한다. 429(유량 초과)는 재시도하지 않고 그대로 던진다
// — 문서가 429 재시도 시 기존 토큰을 그대로 쓰라고 명시하지만, 우리는 사용자가 새로고침
// 버튼을 눌렀을 때만 호출하는 낮은 빈도라 자동 재시도 없이 실패를 보여주는 편이 안전하다.
export async function callNh(redis, account, path, body, _retried){
  const token = await getNhAccessToken(redis, account, { forceRefresh: !!_retried });
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !_retried) {
    return callNh(redis, account, path, body, true);
  }
  if (!res.ok) {
    throw new Error(extractNhMessage(data) || `[${account.label}] NH API 호출에 실패했습니다. (${path})`);
  }
  return data;
}

// 이 앱키에 연결된 계좌 중 운영(라이브) 계좌 하나를 찾는다 — acct_type 01(일반)·02(주문대리인)만
// 대상으로 하고, 모의투자(03) 계좌는 제외한다(모의투자 도메인은 별도라 지금은 지원하지 않음).
export async function getNhLiveAccountNumber(redis, account){
  const data = await callNh(redis, account, '/n2/acctinfo', { Input_0: {} });
  const list = data.Output_0;
  if (!Array.isArray(list)) {
    throw new Error(extractNhMessage(data) || `[${account.label}] 계좌 목록을 가져오지 못했습니다.`);
  }
  const live = list.find((a) => a.acct_type === '01' || a.acct_type === '02');
  if (!live) {
    throw new Error(`[${account.label}] 운영 계좌(acct_type 01/02)를 찾지 못했습니다.`);
  }
  return live.acct_no;
}
