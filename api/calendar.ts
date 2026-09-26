// Vercel serverless proxy for the ForexFactory weekly calendar feed.
// The browser can be CORS-blocked or rate-limited hitting the FF mirror
// directly; from a Vercel edge this is fast and reliable.
import type { VercelRequest, VercelResponse } from '@vercel/node'

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800')
  try {
    const r = await fetch(FF_URL, { signal: AbortSignal.timeout(12000) })
    if (!r.ok) throw new Error(`ff ${r.status}`)
    const text = await r.text()
    if (!text.includes('<event') ) throw new Error('empty ff feed')
    res.status(200).json({ ok: true, xml: text })
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e as Error)?.message ?? e) })
  }
}