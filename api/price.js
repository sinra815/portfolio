// /api/price?symbol=AAPL 또는 /api/price?symbol=005930.KS
// 서버(Vercel Functions)에서 대신 야후 파이낸스를 호출하기 때문에
// 브라우저 CORS 제한 없이 안정적으로 시세를 가져올 수 있습니다.

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol || typeof symbol !== "string") {
    return res.status(400).json({ error: "symbol 파라미터가 필요합니다." });
  }

  try {
    // 1. 입력값을 티커로 바로 시도
    let resolvedSymbol = symbol;
    let price = await getChartPrice(resolvedSymbol);

    // 2. 실패하면 검색 API로 종목명 -> 티커 변환 후 재시도
    if (price == null) {
      const found = await searchSymbol(symbol);
      if (found) {
        resolvedSymbol = found;
        price = await getChartPrice(resolvedSymbol);
      }
    }

    if (price == null) {
      return res.status(404).json({ error: "시세를 찾을 수 없습니다.", query: symbol });
    }

    return res.status(200).json({ query: symbol, symbol: resolvedSymbol, price });
  } catch (err) {
    return res.status(500).json({ error: "조회 중 오류가 발생했습니다.", detail: String(err) });
  }
}

async function getChartPrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioApp/1.0)" },
  });
  if (!r.ok) return null;
  const data = await r.json();
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === "number" ? price : null;
}

async function searchSymbol(query) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PortfolioApp/1.0)" },
  });
  if (!r.ok) return null;
  const data = await r.json();
  const symbol = data?.quotes?.[0]?.symbol;
  return typeof symbol === "string" ? symbol : null;
}
