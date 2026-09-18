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

// NH 공식 문서 기준 REST 호출 유량은 "초당 5회 수준" — 초과 시 재시도하지 말고 간격을
// 늘리라고 명시한다(토큰 문제가 아니므로 재발급 금지). 계좌 하나당 국내1건+해외5건, 게다가
// 앱키 하나에 운영 계좌가 여러 개면(연금계좌 등) 동시에 조회하다 순간적으로 유량을 넘길 수
// 있어, 모듈 전역으로 마지막 호출 시각을 기억해두고 다음 호출 전에 최소 간격(호출 하나당
// 250ms, 초당 4회 수준)을 확보한다 — 계좌가 몇 개든, 병렬로 조회를 걸든 실제 네트워크 호출은
// 이 간격만큼 순서대로 벌어져 나간다.
const MIN_CALL_INTERVAL_MS = 250;
let lastNhCallAt = 0;
async function throttleNhCall(){
  const wait = lastNhCallAt + MIN_CALL_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNhCallAt = Date.now();
}

// NH REST 엔드포인트 하나를 호출한다. 토큰이 만료되면 401이 오므로(키움의 return_code 8005와
// 대응), 그 경우 한 번 재발급해서 재시도한다. 429(유량 초과)는 위 쓰로틀로 최대한 막지만,
// 그래도 발생하면 재시도하지 않고 그대로 던진다 — 문서가 429 재시도 시 기존 토큰을 그대로
// 쓰라고 명시하지만, 우리는 사용자가 새로고침 버튼을 눌렀을 때만 호출하는 낮은 빈도라 자동
// 재시도 없이 실패를 보여주는 편이 안전하다.
export async function callNh(redis, account, path, body, _retried){
  await throttleNhCall();
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

// 계좌 목록은 자주 바뀌지 않으므로(새 계좌를 트는 경우가 아니면 고정) 매 새로고침마다
// 다시 조회하지 않고 이 시간만큼 캐시한다 — NH 호출 건수를 아끼기 위함.
const ACCOUNT_LIST_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12시간
const ACCOUNT_LIST_CACHE_PREFIX = 'nh:liveAccounts';

// 이 앱키에 연결된 운영(라이브) 계좌를 모두 찾는다 — acct_type 01(일반)·02(주문대리인)만
// 대상으로 하고, 모의투자(03) 계좌는 제외한다(모의투자 도메인은 별도라 지금은 지원하지 않음).
// 앱키 하나에 계좌가 여러 개 연결된 경우(예: 일반증권계좌 + 연금저축/IRP)가 있어 배열로 반환한다
// — 예전에는 find()로 첫 계좌만 가져와서 연금계좌 등 나머지 계좌가 조회되지 않는 문제가 있었다.
export async function getNhLiveAccounts(redis, account){
  const cacheKey = `${ACCOUNT_LIST_CACHE_PREFIX}:${account.id}`;
  const cached = await redis.get(cacheKey);
  if (cached && Array.isArray(cached.actNos) && cached.cachedAt > Date.now() - ACCOUNT_LIST_CACHE_TTL_MS) {
    return cached.actNos;
  }

  const data = await callNh(redis, account, '/n2/acctinfo', { Input_0: {} });
  const list = data.Output_0;
  if (!Array.isArray(list)) {
    // rsp_msg가 비어 있는 실패 응답이 있어(NH 쪽 공백 메시지), 원인 파악을 위해 원본 응답을
    // 그대로 같이 던진다 — 다음 실패 때 화면에서 바로 rsp_cd 등 실제 원인을 볼 수 있게.
    const raw = JSON.stringify(data).slice(0, 300);
    throw new Error(`${extractNhMessage(data) || `[${account.label}] 계좌 목록을 가져오지 못했습니다.`} (원본: ${raw})`);
  }
  const live = list.filter((a) => a.acct_type === '01' || a.acct_type === '02');
  if (live.length === 0) {
    throw new Error(`[${account.label}] 운영 계좌(acct_type 01/02)를 찾지 못했습니다.`);
  }
  const actNos = live.map((a) => a.acct_no);
  await redis.set(cacheKey, { actNos, cachedAt: Date.now() });
  return actNos;
}

// 진단용: 캐시를 거치지 않고 이 앱키의 /n2/acctinfo 원본 목록을 그대로 가져온다(01/02
// 필터링 없이 전부). 특정 계좌(예: 연금계좌)가 목록에 아예 없는지 확인할 때 쓴다.
export async function getNhRawAccountList(redis, account){
  const data = await callNh(redis, account, '/n2/acctinfo', { Input_0: {} });
  const list = data.Output_0;
  if (!Array.isArray(list)) {
    const raw = JSON.stringify(data).slice(0, 300);
    throw new Error(`[${account.label}] 계좌 목록을 가져오지 못했습니다. (원본: ${raw})`);
  }
  return list.map((a) => `${a.acct_no}(type=${a.acct_type})`);
}
