# 투자 포트폴리오 관리 (개인용)

증권사/계좌별 종목의 목표 비중과 분할매수 단계 대비 현재 평가금액을 비교해
리밸런싱 방향(확대/축소)을 보여주는 개인용 계산기입니다.

화면 진입 시 ID/비밀번호 로그인이 필요한 개인용 앱입니다. 저장 데이터는 로그인한 ID별로 분리됩니다.
화면은 프레임워크·빌드 도구 없는 순수 HTML/CSS/JS이고, 로그인·서버 저장·현재가 조회 기능만
Vercel 서버리스 함수(`api/`)를 사용합니다.

## 파일 구성 (박스별로 분리)

유지보수하기 쉽도록 화면의 박스 단위로 파일을 나눴습니다.

- `index.html` — 전체 뼈대(HTML)만 포함
- `style.css` — 전체 디자인
- `js/core.js` — 상태 관리 · 계산 로직 · 현재가 조회 공통 함수 (모든 박스가 공유)
- `js/numpad.js` — 숫자 입력 팝업 (공통 UI)
- `js/auth-box.js` — 로그인 / ID 생성 게이트 (화면 진입 시 표시되는 오버레이)
- `js/settings-box.js` — "⚙️ 설정" 박스: 평가금액 합계 / 저장·불러오기 / File 내보내기·가져오기 / 초기화
- `js/stock-summary-box.js` — "📋 종목별 평가금액 요약" 박스: 파이 차트 + 종목별 합산 표
- `js/main-table-box.js` — "📊 계좌별 리밸런싱 현황" 박스: 메인 테이블
- `js/price-table-box.js` — "📌 종목 마스터" 박스: 마스터 종목 테이블 (종목명 자동완성 · 현재가 일괄 조회)
- `js/stage-summary-box.js` — "📈 단계별 미달성 금액" 박스
- `js/app.js` — 부트스트랩 (복원값 반영 후 최초 렌더)

`js/` 파일은 `index.html`에서 위 순서대로 `<script>`로 불러오며, 전역 변수(`master`, `groups`)를
공유합니다. 번들러를 쓰지 않으므로 새 파일을 추가할 때는 `index.html`의 스크립트 순서도 함께 맞춰야 합니다.

## 서버 API (`api/`)

Vercel 서버리스 함수입니다. 정적 파일만 올리면 로그인, "저장/불러오기", "금액 불러오기" 버튼이 동작하지 않습니다.

- `api/register.js` (`POST /api/register`) — ID(영문/숫자/밑줄 2~20자)·비밀번호(4자 이상)로 계정 생성
- `api/login.js` (`POST /api/login`) — ID/비밀번호 확인. 5회 연속 오입력 시 해당 ID 10분 잠금
- `api/save.js` (`POST /api/save`) — 로그인한 ID의 현재 상태를 Upstash Redis에 저장
- `api/load.js` (`POST /api/load`) — 로그인한 ID로 저장된 상태를 반환
- `api/price.js` (`GET /api/price?query=`) — 티커/종목명으로 현재가 조회 (네이버 금융 프록시, 해외 종목용).
  원화가 아닌 종목은 네이버 환율 API로 원화 환산까지 처리합니다.
- `api/search.js` (`GET /api/search?q=`) — 종목명 자동완성 (네이버 금융 프록시, 이름 + 티커 최대 10건)
- `api/kiwoom-price.js` (`GET /api/kiwoom-price?code=`) — 6자리 국내 종목코드로 현재가 조회
  (키움증권 REST API, `ka10001`).
- `api/kiwoom-price-overseas.js` (`GET /api/kiwoom-price-overseas?code=`) — 미국 상장 종목코드로
  현재가 조회 (키움증권 REST API, `usa10098`로 거래소 확인 후 `usa20100`으로 시세 조회). 원화
  환산은 응답에 포함된 환율(`base_exrt`)로 서버에서 처리합니다.
  `js/core.js`의 `fetchPriceForTicker()`가 6자리 숫자 티커는 국내로, 알파벳 티커는 미국으로,
  그 외(일본·홍콩 등)는 `api/price.js`(네이버)로 자동 라우팅하며, 알파벳 티커가 키움에 없으면
  (미국 외 시장일 수 있으므로) 네이버로 한 번 더 시도합니다.
- `api/kiwoom-balance.js` (`POST /api/kiwoom-balance`) — 실제 계좌 잔고 조회. 국내(`kt00018`)와
  미국 해외주식(`ust21070`) 잔고를 함께 조회해 하나의 목록으로 합쳐 돌려줍니다(해외 거래 계좌가
  없으면 해외 조회만 조용히 건너뜁니다). 키움 앱키가 특정 계좌 하나에 연결되는 구조라, 요청
  본문의 `id`가 `sinra815`가 아니면 거부합니다(다른 로그인 계정은 이 계좌를 조회할 수 없음).

`api/price.js`·`api/search.js`는 네이버 금융의 공개 엔드포인트를 그대로 호출합니다.
인증 키는 필요 없지만 공식 문서가 있는 API가 아니므로, 네이버 쪽 응답 형식이 바뀌면 조회가 실패할 수 있습니다.

`api/kiwoom-*.js`는 `lib/kiwoom.js`를 통해 키움증권 공식 REST API(`https://api.kiwoom.com`)를
호출합니다. 접근토큰은 Upstash Redis에 캐싱되어 만료 직전에만 자동 재발급됩니다.

## 데이터 저장 방식

세 가지가 각각 독립적으로 동작합니다.

- **자동저장**: 값을 바꿀 때마다 브라우저 localStorage에 저장되어, 새로고침해도 마지막 작업 내용이
  그대로 복원됩니다 (기기·브라우저별로 별도 저장).
- **저장 / 불러오기 버튼**: 서버(Upstash Redis)에 저장·복원합니다. 로그인한 ID별로 저장 위치가
  분리되어 있어, 같은 ID로 로그인하면 다른 기기에서도 같은 데이터를 볼 수 있습니다. 저장할 때마다
  그 ID의 이전 내용을 덮어씁니다.
- **File Export / File Import**: JSON 파일로 수동 백업·복원합니다. Chrome·Edge에서는 "폴더 지정"으로
  작업 폴더를 한 번 지정해두면 이후 그 폴더에서 바로 파일을 고를 수 있고(File System Access API),
  지원하지 않는 브라우저에서는 일반 다운로드/파일 선택으로 동작합니다.

## 배포 방법

Vercel에 배포하는 것을 전제로 합니다. 저장소를 Vercel 프로젝트에 연결하면 별도 빌드 설정 없이
정적 파일 + `api/` 함수가 함께 배포됩니다.

필요한 환경변수 (Upstash Redis / Vercel KV):

| 환경변수 | 대체 이름 |
| --- | --- |
| `KV_REST_API_URL` | `UPSTASH_REDIS_REST_URL` |
| `KV_REST_API_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` |

Vercel 마켓플레이스에서 Upstash Redis를 연결하면 `KV_REST_API_*`가 자동으로 주입됩니다.

환경변수를 설정하지 않거나 GitHub Pages·Netlify 같은 순수 정적 호스팅에 올린 경우에도 화면과 계산은
정상 동작하며, "저장/불러오기"와 "금액 불러오기"만 실패합니다. 이때는 File Export/Import로 백업하고
현재가는 직접 입력하면 됩니다.

## 보안 주의

화면 진입 시 ID/비밀번호 로그인이 필요하고, `/api/save`·`/api/load`는 로그인한 ID로만 그 ID의
데이터에 접근합니다. 비밀번호는 해시로 저장되며, 5회 연속 오입력 시 해당 ID는 10분간 로그인이
제한됩니다. 다만 ID·비밀번호 확인 외의 별도 세션/토큰 검증은 없으므로, 더 강한 보호가 필요하면
Vercel Deployment Protection을 함께 켜는 것을 권장합니다.

## 참고

데이터 구조가 처음에는 비어 있습니다. "종목 마스터" 표에서 종목을 먼저 등록한 뒤, "계좌별 리밸런싱 현황" 표 아래에서 증권사/계좌를 추가하고 종목을 불러와 사용하세요.
