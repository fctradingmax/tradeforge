import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface TradeRow {
  symbol: string
  date: string
  open_time?: string | null
  close_time?: string | null
  open_side?: 'B' | 'S' | null
  avg_buy?: number | null
  avg_sell?: number | null
  buy_qty?: number | null
  sell_qty?: number | null
  max_size?: number | null
  n_fills?: number | null
  holding_sec?: number | null
  gross?: number | null
  fees?: number | null
  net_pnl: number
  mae?: number | null
  mfe?: number | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const incoming: TradeRow[] = Array.isArray(body.trades) ? body.trades : []

  if (!incoming.length)
    return NextResponse.json({ error: 'No trades provided' }, { status: 400 })

  // Fetch existing keys to detect duplicates
  const { data: existing } = await supabase
    .from('trades')
    .select('symbol, date, open_time')
    .eq('user_id', user.id)

  const existingSet = new Set(
    (existing ?? []).map(t => `${t.symbol}|${t.date}|${t.open_time ?? ''}`)
  )

  const toInsert: (TradeRow & { user_id: string })[] = []
  let skipped = 0

  for (const t of incoming) {
    if (!t.symbol || !t.date) continue
    const key = `${t.symbol}|${t.date}|${t.open_time ?? ''}`
    if (existingSet.has(key)) { skipped++; continue }
    toInsert.push({ ...t, user_id: user.id })
  }

  if (!toInsert.length)
    return NextResponse.json({ imported: 0, skipped, errors: [] })

  const { error } = await supabase.from('trades').insert(toInsert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: toInsert.length, skipped, errors: [] })
}
