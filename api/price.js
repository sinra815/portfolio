// ==== 티커/종목명으로 현재가를 조회하는 API (네이버 금융 공개 API 프록시) ====
// 원화가 아닌 종목은 네이버 금융 환율 API로 원화 환산까지 처리한다.

const CURRENCY_UNIT_SIZE = { JPY: 100 }; // 네이버 환율 API는 엔화를 100엔 기준으로 제공

async function getExchangeRateToKrw(currencyCode){
  if (!currencyCode || currencyCode === 'KRW') return 1;
  const unitSize = CURRENCY_UNIT_SIZE[currencyCode] || 1;
  const res = await fetch(`https://m.stock.naver.com/front-api/marketIndex/prices?category=exchange&reutersCode=FX_${currencyCode}KRW`);
  if (!res.ok) throw new Error('exchange rate request failed');
  const json = await res.json();
  const row = json.result && json.result[0];
  const rateStr = row && row.closePrice;
  if (!rateStr) throw new Error(`exchange rate not found for ${currencyCode}`);
  const rate = Number(String(rateStr).replace(/,/g, ''));
  if (!isFinite(rate)) throw new Error(`invalid exchange rate for ${currencyCode}`);
  return rate / unitSize;
}

async function searchStock(query){
  const searchRes = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock,itemAll`);
  if (!searchRes.ok) throw new Error('search request failed');
  const searchJson = await searchRes.json();
  return searchJson.items && searchJson.items[0];
}

export default async function handler(req, res) {
  const query = (req.query.query || '').toString().trim();
  if (!query) return res.status(400).json({ error: '티커 또는 종목명을 입력해주세요.' });

  try {
    let item = await searchStock(query);
    // 예전에 저장된 해외 종목 티커는 거래소 접미사가 붙어 있을 수 있다(예: 애플 "AAPL.O").
    // 네이버 자동완성은 이 접미사가 붙은 문자열로는 검색이 안 되므로, 접미사를 뗀 값으로 한 번
    // 더 시도한다. (api/search.js 는 이제 접미사 없는 값을 저장하므로 새로 등록한 종목은
    // 여기까지 오지 않는다.)
    if (!item) {
      const withoutSuffix = query.replace(/\.[A-Za-z]{1,3}$/, '');
      if (withoutSuffix !== query) item = await searchStock(withoutSuffix);
    }
    if (!item) return res.status(404).json({ error: `"${query}"에 해당하는 종목을 찾지 못했습니다.` });

    const code = item.reutersCode || item.code;
    const isDomestic = item.nationCode === 'KOR';
    const basicUrl = isDomestic
      ? `https://m.stock.naver.com/api/stock/${code}/basic`
      : `https://api.stock.naver.com/stock/${code}/basic`;
    const basicRes = await fetch(basicUrl);
    if (!basicRes.ok) throw new Error('basic request failed');
    const basicJson = await basicRes.json();
    const priceStr = basicJson.closePrice;
    if (!priceStr) return res.status(404).json({ error: `"${item.name}"의 현재가를 가져오지 못했습니다.` });

    const rawPrice = Number(String(priceStr).replace(/,/g, ''));
    if (!isFinite(rawPrice)) return res.status(404).json({ error: `"${item.name}"의 현재가 형식을 확인할 수 없습니다.` });

    const currencyCode = basicJson.currencyType && basicJson.currencyType.code;
    let price = rawPrice;
    if (currencyCode && currencyCode !== 'KRW') {
      const rate = await getExchangeRateToKrw(currencyCode);
      price = Math.round(rawPrice * rate);
    }

    // 전일대비 등락률(부호 있는 %). 네이버는 절대값(fluctuationsRatio)과 방향
    // (compareToPreviousPrice.code: 1=상한 2=상승 3=보합 4=하한 5=하락)을 따로 준다.
    // 통화 환산 없이 그대로 쓸 수 있다 — 원화로 환산해도 등락 "비율"은 원래 통화와 같다.
    const dirCode = basicJson.compareToPreviousPrice && basicJson.compareToPreviousPrice.code;
    const sign = (dirCode === '1' || dirCode === '2') ? 1 : (dirCode === '4' || dirCode === '5') ? -1 : 0;
    const changePercent = sign * Math.abs(Number(basicJson.fluctuationsRatio) || 0);

    return res.status(200).json({ price, name: item.name, code, nationCode: item.nationCode, currency: currencyCode || 'KRW', rawPrice, changePercent });
  } catch (err) {
    return res.status(500).json({ error: '현재가를 불러오는 중 오류가 발생했습니다.', detail: String(err) });
  }
}
