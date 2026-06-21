import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance()

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: entry } = await supabase
    .from('watchlist')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const symbol = entry.symbol as string

  try {
    const [summary, chartResult] = await Promise.all([
      yf.quoteSummary(symbol, {
        modules: ['price', 'summaryProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData'],
      }),
      (async () => {
        const ago90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        const r = await yf.chart(symbol, {
          period1: ago90.toISOString().split('T')[0],
          interval: '1d',
        })
        return r.quotes
          .filter(q => q.close != null)
          .map(q => ({ d: new Date(q.date).toISOString().split('T')[0], c: +q.close!.toFixed(2), v: q.volume ?? 0 }))
      })(),
    ])

    return NextResponse.json({ entry, summary, chart: chartResult })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
