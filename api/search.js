// ==== 종목명 자동완성 검색 API (네이버 금융 공개 자동완성 API 프록시) ====

export default async function handler(req, res) {
  const query = (req.query.q || '').toString().trim();
  if (!query) return res.status(200).json({ items: [] });

  try {
    const searchRes = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock,itemAll`);
    if (!searchRes.ok) throw new Error('search request failed');
    const searchJson = await searchRes.json();
    const items = (searchJson.items || [])
      .filter(item => item.name)
      .slice(0, 10)
      .map(item => ({
        name: item.name,
        ticker: item.reutersCode || item.code || '',
        nationCode: item.nationCode || '',
      }));
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: '종목 검색 중 오류가 발생했습니다.', detail: String(err) });
  }
}
