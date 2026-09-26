// Vercel proxy for market news — browser hits this, not the RSS directly.
// Keeps CORS clean and caches at the edge.
import type { VercelRequest, VercelResponse } from '@vercel/node'

const FEEDS: Record<string, string> = {
  forexlive: 'https://www.forexlive.com/feed/',
  investing: 'https://www.investing.com/rss/news_25.rss',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  const want = String(req.query.feed ?? 'forexlive').toLowerCase()
  const url = FEEDS[want] ?? FEEDS.forexlive
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'DadaFX/3.2 (news-proxy)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`feed ${r.status}`)
    const text = await r.text()
    if (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<item')) throw new Error('empty feed')
    res.status(200).json({ ok: true, xml: text, source: want === 'forexlive' ? 'ForexLive' : 'Investing.com' })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e as Error)?.message ?? e) })
  }
}
