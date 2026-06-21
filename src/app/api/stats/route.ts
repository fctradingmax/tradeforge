import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Trade, TradeStats } from '@/lib/types'

function computeStats(trades: Trade[]): TradeStats {
  const wins = trades.filter((t) => t.net_pnl > 0.001)
  const losses = trades.filter((t) => t.net_pnl < -0.001)
  const be = trades.filter((t) => Math.abs(t.net_pnl) <= 0.001)

  const gross_pnl = trades.reduce((s, t) => s + t.gross, 0)
  const total_fees = trades.reduce((s, t) => s + t.fees, 0)
  const net_pnl = trades.reduce((s, t) => s + t.net_pnl, 0)

  const avg_win = wins.length ? wins.reduce((s, t) => s + t.net_pnl, 0) / wins.length : 0
  const avg_loss = losses.length ? losses.reduce((s, t) => s + t.net_pnl, 0) / losses.length : 0
  const sum_win = wins.reduce((s, t) => s + t.net_pnl, 0)
  const sum_loss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0))
  const profit_factor = sum_loss > 0 ? sum_win / sum_loss : sum_win > 0 ? Infinity : 0

  const withHolding = trades.filter((t) => t.holding_sec != null)
  const avg_holding_sec = withHolding.length
    ? withHolding.reduce((s, t) => s + (t.holding_sec ?? 0), 0) / withHolding.length
    : 0

  const nets = trades.map((t) => t.net_pnl)

  return {
    total_trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: be.length,
    win_rate: trades.length ? wins.length / trades.length : 0,
    gross_pnl,
    total_fees,
    net_pnl,
    avg_win,
    avg_loss,
    profit_factor,
    avg_holding_sec,
    best_trade: nets.length ? Math.max(...nets) : 0,
    worst_trade: nets.length ? Math.min(...nets) : 0,
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date_from = searchParams.get('date_from')
  const date_to = searchParams.get('date_to')
  const symbol = searchParams.get('symbol')

  let query = supabase
    .from('trades')
    .select('*')
    .eq('user_id', user.id)

  if (date_from) query = query.gte('date', date_from)
  if (date_to) query = query.lte('date', date_to)
  if (symbol) query = query.eq('symbol', symbol.toUpperCase())

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(computeStats(data as Trade[]))
}
