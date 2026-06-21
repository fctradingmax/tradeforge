import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance()

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: entry } = await supabase
    .from('watchlist')
    .select('symbol')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const symbol = entry.symbol as string

  try {
    const result = await yf.quoteSummary(symbol, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData'],
    })

    const sd = (result.summaryDetail ?? {}) as Record<string, unknown>
    const ks = (result.defaultKeyStatistics ?? {}) as Record<string, unknown>
    const fd = (result.financialData ?? {}) as Record<string, unknown>

    const payload = {
      roic:                    (ks.returnOnEquity   as number | null) ?? null,
      float_shares:            (ks.floatShares      as number | null) ?? null,
      short_interest:          (sd.shortPercentOfFloat as number | null) ?? null,
      institutional_ownership: (ks.heldPercentInstitutions as number | null) ?? null,
      operating_cash_flow:     (fd.operatingCashflow as number | null) ?? null,
      data_source:             'yahoo',
      last_refreshed:          new Date().toISOString(),
    }

    const { data: updated, error } = await supabase
      .from('watchlist')
      .update(payload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(updated)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Yahoo Finance: ${msg}` }, { status: 502 })
  }
}
