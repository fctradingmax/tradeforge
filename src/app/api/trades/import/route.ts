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

// Normalise to HH:MM (drop seconds) so "09:32:00" == "09:32".
// Include net_pnl in cents to tell apart two trades on same symbol/time.
function dedupeKey(symbol: string, date: string, open_time: string | null | undefined, net_pnl: number) {
  const t = (open_time ?? '').slice(0, 5) // HH:MM
  const p = Math.round((net_pnl ?? 0) * 100)
  return `${symbol}|${date}|${t}|${p}`
}

export async function POST(request: NextRequest) {
  const checkOnly = request.nextUrl.searchParams.get('check') === 'true'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const incoming: TradeRow[] = Array.isArray(body.trades) ? body.trades : []

  if (!incoming.length)
    return NextResponse.json({ error: 'No trades provided' }, { status: 400 })

  // Fetch existing trades for deduplication
  const { data: existing } = await supabase
    .from('trades')
    .select('symbol, date, open_time, net_pnl')
    .eq('user_id', user.id)

  const existingSet = new Set(
    (existing ?? []).map(t => dedupeKey(t.symbol, t.date, t.open_time, t.net_pnl))
  )

  const toInsert: (TradeRow & { user_id: string })[] = []
  let skipped = 0

  for (const t of incoming) {
    if (!t.symbol || !t.date) continue
    const key = dedupeKey(t.symbol, t.date, t.open_time, t.net_pnl)
    if (existingSet.has(key)) { skipped++; continue }
    toInsert.push({ ...t, user_id: user.id })
  }

  // Check-only mode: return counts without inserting
  if (checkOnly) {
    return NextResponse.json({ new: toInsert.length, duplicates: skipped, total: incoming.length })
  }

  if (!toInsert.length)
    return NextResponse.json({ imported: 0, skipped, errors: [] })

  const { error } = await supabase.from('trades').insert(toInsert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: toInsert.length, skipped, errors: [] })
}
