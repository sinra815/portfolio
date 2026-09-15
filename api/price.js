// ==== 티커/종목명으로 현재가를 조회하는 API (네이버 금융 공개 API 프록시) ====

export default async function handler(req, res) {
  const query = (req.query.query || '').toString().trim();
  if (!query) return res.status(400).json({ error: '티커 또는 종목명을 입력해주세요.' });

  try {
    const searchRes = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock,itemAll`);
    if (!searchRes.ok) throw new Error('search request failed');
    const searchJson = await searchRes.json();
    const item = searchJson.items && searchJson.items[0];
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

    const price = Number(String(priceStr).replace(/,/g, ''));
    if (!isFinite(price)) return res.status(404).json({ error: `"${item.name}"의 현재가 형식을 확인할 수 없습니다.` });

    return res.status(200).json({ price, name: item.name, code, nationCode: item.nationCode });
  } catch (err) {
    return res.status(500).json({ error: '현재가를 불러오는 중 오류가 발생했습니다.', detail: String(err) });
  }
}
