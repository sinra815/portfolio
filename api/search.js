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
        // 해외 종목은 reutersCode 에 거래소 접미사가 붙어 있다(예: 애플 "AAPL.O").
        // 이 값을 그대로 저장하면 나중에 그 문자열로 다시 검색했을 때(현재가 조회) 네이버
        // 자동완성이 찾지 못한다 - code 는 접미사 없는 원래 티커라 그대로 재검색할 수 있다.
        // 국내 종목은 code 와 reutersCode 가 어차피 같다(둘 다 숫자 코드, 접미사 없음).
        ticker: item.code || item.reutersCode || '',
        nationCode: item.nationCode || '',
      }));
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: '종목 검색 중 오류가 발생했습니다.', detail: String(err) });
  }
}
