import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance()

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = request.nextUrl.searchParams.get('symbols') ?? ''
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  if (!symbols.length) return NextResponse.json({})

  try {
    const quotes = await yf.quote(symbols)
    const arr = Array.isArray(quotes) ? quotes : [quotes]
    const result: Record<string, unknown> = {}
    for (const q of arr) {
      result[q.symbol] = {
        price:         q.regularMarketPrice      ?? null,
        change:        q.regularMarketChange      ?? null,
        changePct:     q.regularMarketChangePercent ?? null,
        volume:        q.regularMarketVolume      ?? null,
        marketCap:     q.marketCap                ?? null,
        high52:        q.fiftyTwoWeekHigh         ?? null,
        low52:         q.fiftyTwoWeekLow          ?? null,
        prevClose:     q.regularMarketPreviousClose ?? null,
        shortName:     q.shortName                ?? null,
      }
    }
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
