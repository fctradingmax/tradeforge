/**
 * Agent tool implementations.
 * Each function is called when Claude invokes the corresponding tool.
 * All queries are scoped to the authenticated user's data.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { mcSimulate } from '@/lib/montecarlo'
import type { Trade } from '@/lib/types'

// ── Tool definitions (passed to Claude API) ───────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'get_recent_trades',
    description:
      'Retrieve the user\'s recent trades from the journal. Use this to answer questions about specific trades, P&L by symbol or date, trade patterns, or to get raw data for analysis.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Filter by ticker symbol (e.g. "AAPL")' },
        limit: { type: 'number', description: 'Max number of trades to return (default 50, max 200)' },
        date_from: { type: 'string', description: 'Start date filter YYYY-MM-DD' },
        date_to: { type: 'string', description: 'End date filter YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'get_trade_stats',
    description:
      'Compute aggregate trading statistics — win rate, profit factor, net P&L, avg win/loss, drawdown, and breakdowns by symbol, hour-of-day, and session (pre-market / regular / after-hours). Use this before making performance observations.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD' },
        symbol: { type: 'string', description: 'Restrict to a single symbol' },
      },
    },
  },
  {
    name: 'get_watchlist',
    description:
      'Return the user\'s watchlist entries including fundamentals (ROIC, float, short interest, institutional ownership) and estrategia tags.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Filter to a single symbol' },
      },
    },
  },
  {
    name: 'get_recent_filings',
    description:
      'Retrieve SEC EDGAR filings for symbols on the watchlist. Use this when the user asks about regulatory filings, ATM offerings, S-1/S-3 registrations, 8-Ks, or prospectuses.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Filter to a single symbol' },
        since: { type: 'string', description: 'Only filings on or after this date YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max results (default 30)' },
      },
    },
  },
  {
    name: 'get_fundamentals',
    description:
      'Return the latest cached fundamentals (from Finnhub or Yahoo Finance) for a symbol. Includes market cap, float, short interest, ROIC, operating cash flow.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol', },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'run_monte_carlo',
    description:
      'Run a Monte Carlo simulation bootstrapping from the user\'s actual trade P&L distribution. Returns median/P5/P1 outcomes, probability of loss, and max drawdown estimates. Use this when the user asks about risk, expectancy, or forward-looking scenario analysis.',
    input_schema: {
      type: 'object',
      properties: {
        sims: { type: 'number', description: 'Number of simulations (default 5000, max 20000)' },
        n_trades: { type: 'number', description: 'Trades per simulation path (default = actual trade count)' },
        mode: { type: 'string', enum: ['bootstrap', 'parametric'], description: 'bootstrap resamples actual trades; parametric uses avg win/loss rate' },
        date_from: { type: 'string', description: 'Use only trades from this date onward YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Use only trades up to this date YYYY-MM-DD' },
        symbol: { type: 'string', description: 'Restrict population to a single symbol' },
      },
    },
  },
] as const

// ── Implementations ───────────────────────────────────────────────────────────

export async function getRecentTrades(
  db: SupabaseClient,
  userId: string,
  input: { symbol?: string; limit?: number; date_from?: string; date_to?: string },
) {
  const limit = Math.min(input.limit ?? 50, 200)
  let q = db
    .from('trades')
    .select('symbol,date,open_time,close_time,open_side,net_pnl,gross,fees,max_size,holding_sec,setup,quality,emotion,tags,notes,mae,mfe')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('close_time', { ascending: false })
    .limit(limit)

  if (input.symbol) q = q.eq('symbol', input.symbol.toUpperCase())
  if (input.date_from) q = q.gte('date', input.date_from)
  if (input.date_to) q = q.lte('date', input.date_to)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

export async function getTradeStats(
  db: SupabaseClient,
  userId: string,
  input: { date_from?: string; date_to?: string; symbol?: string },
) {
  let q = db
    .from('trades')
    .select('net_pnl,gross,fees,open_time,open_side,symbol,holding_sec')
    .eq('user_id', userId)

  if (input.date_from) q = q.gte('date', input.date_from)
  if (input.date_to) q = q.lte('date', input.date_to)
  if (input.symbol) q = q.eq('symbol', input.symbol.toUpperCase())

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const trades = (data ?? []) as Pick<Trade, 'net_pnl' | 'gross' | 'fees' | 'open_time' | 'symbol' | 'holding_sec'>[]
  if (!trades.length) return { total_trades: 0 }

  const wins = trades.filter((t) => t.net_pnl > 0.001)
  const losses = trades.filter((t) => t.net_pnl < -0.001)
  const net_pnl = trades.reduce((s, t) => s + t.net_pnl, 0)
  const gross_pnl = trades.reduce((s, t) => s + t.gross, 0)
  const total_fees = trades.reduce((s, t) => s + t.fees, 0)
  const sumWin = wins.reduce((s, t) => s + t.net_pnl, 0)
  const sumLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0))

  // Hour-of-day breakdown
  const byHour: Record<number, { trades: number; net: number }> = {}
  for (const t of trades) {
    const h = t.open_time ? parseInt(t.open_time.slice(0, 2), 10) : -1
    if (h < 0) continue
    if (!byHour[h]) byHour[h] = { trades: 0, net: 0 }
    byHour[h].trades++
    byHour[h].net += t.net_pnl
  }

  // Session breakdown
  const pre = trades.filter((t) => t.open_time && t.open_time < '09:30')
  const regular = trades.filter((t) => t.open_time && t.open_time >= '09:30' && t.open_time < '16:00')
  const after = trades.filter((t) => t.open_time && t.open_time >= '16:00')
  const sessionPnl = (ts: typeof trades) => ts.reduce((s, t) => s + t.net_pnl, 0)

  // Per-symbol breakdown
  const bySymbol: Record<string, { trades: number; net: number; wins: number }> = {}
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, net: 0, wins: 0 }
    bySymbol[t.symbol].trades++
    bySymbol[t.symbol].net += t.net_pnl
    if (t.net_pnl > 0.001) bySymbol[t.symbol].wins++
  }

  return {
    total_trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    win_rate: +(wins.length / trades.length).toFixed(4),
    net_pnl: +net_pnl.toFixed(2),
    gross_pnl: +gross_pnl.toFixed(2),
    total_fees: +total_fees.toFixed(2),
    avg_win: wins.length ? +(sumWin / wins.length).toFixed(2) : 0,
    avg_loss: losses.length ? +(losses.reduce((s, t) => s + t.net_pnl, 0) / losses.length).toFixed(2) : 0,
    profit_factor: sumLoss > 0 ? +(sumWin / sumLoss).toFixed(3) : null,
    avg_holding_sec: trades.filter((t) => t.holding_sec).length
      ? Math.round(trades.reduce((s, t) => s + (t.holding_sec ?? 0), 0) / trades.length)
      : null,
    by_hour: byHour,
    by_session: {
      pre_market: { trades: pre.length, net_pnl: +sessionPnl(pre).toFixed(2) },
      regular: { trades: regular.length, net_pnl: +sessionPnl(regular).toFixed(2) },
      after_hours: { trades: after.length, net_pnl: +sessionPnl(after).toFixed(2) },
    },
    by_symbol: bySymbol,
  }
}

export async function getWatchlist(
  db: SupabaseClient,
  userId: string,
  input: { symbol?: string },
) {
  let q = db
    .from('watchlist')
    .select('symbol,estrategia,notes_html,roic,float_shares,short_interest,institutional_ownership,operating_cash_flow,data_source,last_refreshed')
    .eq('user_id', userId)
    .order('added_at', { ascending: false })

  if (input.symbol) q = q.eq('symbol', input.symbol.toUpperCase())

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

export async function getRecentFilings(
  db: SupabaseClient,
  userId: string,
  input: { symbol?: string; since?: string; limit?: number },
) {
  const { data: watchlist } = await db
    .from('watchlist')
    .select('symbol')
    .eq('user_id', userId)

  const watched = (watchlist ?? []).map((w: { symbol: string }) => w.symbol)
  if (!watched.length) return []

  const symbols = input.symbol ? [input.symbol.toUpperCase()] : watched
  const limit = Math.min(input.limit ?? 30, 100)

  let q = db
    .from('filings')
    .select('symbol,form_type,filing_date,description,document_url,is_new,discovered_at')
    .in('symbol', symbols)
    .order('filing_date', { ascending: false })
    .limit(limit)

  if (input.since) q = q.gte('filing_date', input.since)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

export async function getFundamentals(
  db: SupabaseClient,
  userId: string,
  input: { symbol: string },
) {
  // Ensure symbol is on this user's watchlist (scoped access)
  const { data: wl } = await db
    .from('watchlist')
    .select('symbol')
    .eq('user_id', userId)
    .eq('symbol', input.symbol.toUpperCase())
    .maybeSingle()

  if (!wl) return { error: `${input.symbol} is not on your watchlist` }

  const { data, error } = await db
    .from('fundamentals_cache')
    .select('source,payload,fetched_at')
    .eq('symbol', input.symbol.toUpperCase())
    .order('fetched_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function runMonteCarlo(
  db: SupabaseClient,
  userId: string,
  input: {
    sims?: number
    n_trades?: number
    mode?: 'bootstrap' | 'parametric'
    date_from?: string
    date_to?: string
    symbol?: string
  },
) {
  let q = db
    .from('trades')
    .select('net_pnl')
    .eq('user_id', userId)

  if (input.date_from) q = q.gte('date', input.date_from)
  if (input.date_to) q = q.lte('date', input.date_to)
  if (input.symbol) q = q.eq('symbol', input.symbol.toUpperCase())

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const population = (data ?? []).map((r: { net_pnl: number }) => r.net_pnl)
  if (population.length < 5) return { error: 'Not enough trades for simulation (need at least 5)' }

  const result = mcSimulate(population, {
    sims: input.sims,
    nTrades: input.n_trades ?? population.length,
    mode: input.mode,
  })

  // Return a summary (strip histogram bins to keep token count manageable)
  return {
    sims: result.sims,
    n_trades: result.nTrades,
    mode: result.mode,
    population_size: population.length,
    mean_final_pnl: +result.mean.toFixed(2),
    median_final_pnl: +result.median.toFixed(2),
    p5_final_pnl: +result.p5.toFixed(2),
    p1_final_pnl: +result.p1.toFixed(2),
    prob_loss: +result.probNeg.toFixed(4),
    median_max_drawdown: +result.medDD.toFixed(2),
    worst_drawdown_p95: +result.worstDD5.toFixed(2),
    worst_drawdown_p99: +result.worstDD1.toFixed(2),
    params: {
      win_rate: +result.params.winRate.toFixed(4),
      avg_win: +result.params.avgWin.toFixed(2),
      avg_loss: +result.params.avgLoss.toFixed(2),
    },
  }
}
