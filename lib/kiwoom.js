// ==== 키움증권 REST API 공통 로직: 접근토큰 발급/캐싱 + TR 호출 헬퍼 ====
// 앱키/시크릿은 Vercel 환경변수(KIWOOM_APP_KEY, KIWOOM_APP_SECRET)로만 저장되고, 이 파일은
// 서버(api/kiwoom-*.js)에서만 임포트된다 — 브라우저로는 절대 전달되지 않는다.

const TOKEN_CACHE_KEY = 'kiwoom:accessToken';
// 실제 만료 시각보다 여유를 두고 미리 재발급한다 — 요청 처리 도중 토큰이 만료되는 걸 방지.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// 키움 REST API는 앱키 발급 시 등록한 IP에서만 호출을 허용하는데, Vercel 서버리스 함수는
// 호출마다 아웃바운드 IP가 바뀌어서 등록이 불가능하다(실제로 이 문제로 "8050: IP가
// 등록되지 않았습니다" 인증 오류가 났다). KIWOOM_RELAY_URL이 설정돼 있으면 키움을 직접
// 부르는 대신, 고정 IP를 제공하는 중계 서버(kiwoom-relay, Render 등에 배포)를 거친다.
function getBaseUrl(){
  if (process.env.KIWOOM_RELAY_URL) return process.env.KIWOOM_RELAY_URL;
  // 실전투자: https://api.kiwoom.com, 모의투자: https://mockapi.kiwoom.com
  return process.env.KIWOOM_MODE === 'demo' ? 'https://mockapi.kiwoom.com' : 'https://api.kiwoom.com';
}

// 중계 서버를 거칠 때만 필요한 인증 헤더 — 이 값이 없으면 누구나 중계 서버를 통해 키움 API를
// 두드리는 공개 프록시로 악용할 수 있다.
function relayHeaders(){
  return process.env.KIWOOM_RELAY_URL && process.env.KIWOOM_RELAY_SECRET
    ? { 'x-relay-secret': process.env.KIWOOM_RELAY_SECRET }
    : {};
}

// 키움이 내려주는 만료시각(KST, "YYYYMMDDHHMMSS")을 UTC epoch(ms)로 변환한다.
function parseKstExpiry(expiresDt){
  const s = String(expiresDt);
  const y = +s.slice(0, 4), mo = +s.slice(4, 6), d = +s.slice(6, 8);
  const h = +s.slice(8, 10), mi = +s.slice(10, 12), sec = +s.slice(12, 14);
  return Date.UTC(y, mo - 1, d, h - 9, mi, sec); // KST = UTC+9
}

async function issueAccessToken(){
  const appkey = process.env.KIWOOM_APP_KEY;
  const secretkey = process.env.KIWOOM_APP_SECRET;
  if (!appkey || !secretkey) {
    throw new Error('KIWOOM_APP_KEY/KIWOOM_APP_SECRET 환경변수가 설정되지 않았습니다.');
  }
  const res = await fetch(`${getBaseUrl()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8', ...relayHeaders() },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey, secretkey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.return_code && data.return_code !== 0) || !data.token) {
    throw new Error(data.return_msg || '키움 접근토큰 발급에 실패했습니다.');
  }
  return { token: data.token, expiresAt: parseKstExpiry(data.expires_dt) };
}

async function getAccessToken(redis, { forceRefresh } = {}){
  if (!forceRefresh) {
    const cached = await redis.get(TOKEN_CACHE_KEY);
    if (cached && cached.token && cached.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
      return cached.token;
    }
  }
  const { token, expiresAt } = await issueAccessToken();
  await redis.set(TOKEN_CACHE_KEY, { token, expiresAt });
  return token;
}

// TR(api-id) 하나를 호출한다. 키움은 토큰이 만료돼도 HTTP 200 + return_code 로만 실패를
// 알리는 경우가 있어(만료/무효 토큰: return_code 8005), 그 경우 토큰을 한 번 재발급해서
// 자동으로 재시도한다.
export async function callKiwoom(redis, apiId, path, body, _retried){
  const token = await getAccessToken(redis, { forceRefresh: !!_retried });
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'api-id': apiId,
      authorization: `Bearer ${token}`,
      ...relayHeaders(),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  const isAuthError = res.status === 401 || data.return_code === 8005;
  if (isAuthError && !_retried) {
    return callKiwoom(redis, apiId, path, body, true);
  }
  if (!res.ok || (data.return_code && data.return_code !== 0)) {
    throw new Error(data.return_msg || `키움 API 호출에 실패했습니다. (${apiId})`);
  }
  return data;
}
