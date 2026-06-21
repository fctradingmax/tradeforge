/**
 * Fundamentals refresher.
 *
 * Finnhub is primary (60 req/min free tier — we throttle to 55/min to stay safe).
 * Yahoo Finance (unofficial JSON endpoint) is the fallback for tickers where
 * Finnhub returns empty/null data, particularly OTC/micro-caps.
 *
 * Failures are logged per-source so a Yahoo outage doesn't silently look
 * like "no fundamentals available."
 */

import { getWatchedSymbols, upsertFundamentals } from './db.js'

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? ''
const FINNHUB_BASE = 'https://finnhub.io/api/v1'

// 55 requests/min = ~1090ms between requests
const FINNHUB_INTERVAL_MS = Math.ceil(60_000 / 55)

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Finnhub ───────────────────────────────────────────────────────────────────

interface FinnhubMetric {
  metric?: {
    roic?: number
    '52WeekHigh'?: number
    '52WeekLow'?: number
    marketCapitalization?: number
    peNormalizedAnnual?: number
    operatingCashFlowAnnual?: number
    shortInterest?: number
    institutionalOwnershipPercentage?: number
  }
}

interface FinnhubFloat {
  float?: number
  outstandingShares?: number
}

async function fetchFinnhub(path: string): Promise<unknown> {
  const url = `${FINNHUB_BASE}${path}&token=${FINNHUB_KEY}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Finnhub ${res.status} ${path}`)
  return res.json()
}

async function getFinnhubFundamentals(symbol: string): Promise<Record<string, unknown> | null> {
  if (!FINNHUB_KEY) return null

  try {
    const [metric, floatData] = await Promise.all([
      fetchFinnhub(`/stock/metric?symbol=${symbol}&metric=all`) as Promise<FinnhubMetric>,
      fetchFinnhub(`/stock/float?symbol=${symbol}`) as Promise<FinnhubFloat>,
    ])

    const m = metric.metric ?? {}
    if (!Object.keys(m).length) return null   // Finnhub returned empty — fall through to Yahoo

    return {
      roic: m.roic ?? null,
      float: floatData.float ?? null,
      outstandingShares: floatData.outstandingShares ?? null,
      shortInterest: m.shortInterest ?? null,
      institutionalOwnership: m.institutionalOwnershipPercentage ?? null,
      operatingCashFlow: m.operatingCashFlowAnnual ?? null,
      marketCap: m.marketCapitalization ?? null,
      peRatio: m.peNormalizedAnnual ?? null,
      week52High: m['52WeekHigh'] ?? null,
      week52Low: m['52WeekLow'] ?? null,
    }
  } catch (err) {
    throw new Error(`finnhub(${symbol}): ${err instanceof Error ? err.message : err}`)
  }
}

// ── Yahoo Finance ─────────────────────────────────────────────────────────────
// Uses the unofficial quoteSummary endpoint via a CORS-safe server-side fetch.
// Treat as fallback only — can break without notice.

interface YahooSummaryDetail {
  marketCap?: { raw?: number }
  trailingPE?: { raw?: number }
  fiftyTwoWeekHigh?: { raw?: number }
  fiftyTwoWeekLow?: { raw?: number }
  shortPercentOfFloat?: { raw?: number }
}

interface YahooDefaultKeyStats {
  floatShares?: { raw?: number }
  sharesOutstanding?: { raw?: number }
  institutionsPercentHeld?: { raw?: number }
  operatingCashflow?: { raw?: number }
  returnOnEquity?: { raw?: number }
}

interface YahooResponse {
  quoteSummary?: {
    result?: Array<{
      summaryDetail?: YahooSummaryDetail
      defaultKeyStatistics?: YahooDefaultKeyStats
    }>
    error?: { description: string }
  }
}

async function getYahooFundamentals(symbol: string): Promise<Record<string, unknown> | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}` +
      `?modules=summaryDetail,defaultKeyStatistics`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = (await res.json()) as YahooResponse
    const result = json.quoteSummary?.result?.[0]
    if (!result) {
      const errMsg = json.quoteSummary?.error?.description ?? 'empty result'
      throw new Error(errMsg)
    }

    const sd = result.summaryDetail ?? {}
    const ks = result.defaultKeyStatistics ?? {}

    return {
      marketCap: sd.marketCap?.raw ?? null,
      peRatio: sd.trailingPE?.raw ?? null,
      week52High: sd.fiftyTwoWeekHigh?.raw ?? null,
      week52Low: sd.fiftyTwoWeekLow?.raw ?? null,
      shortInterest: sd.shortPercentOfFloat?.raw ?? null,
      float: ks.floatShares?.raw ?? null,
      outstandingShares: ks.sharesOutstanding?.raw ?? null,
      institutionalOwnership: ks.institutionsPercentHeld?.raw ?? null,
      operatingCashFlow: ks.operatingCashflow?.raw ?? null,
      roic: ks.returnOnEquity?.raw ?? null,   // ROE as proxy; Finnhub has real ROIC
    }
  } catch (err) {
    throw new Error(`yahoo(${symbol}): ${err instanceof Error ? err.message : err}`)
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

async function refreshSymbol(symbol: string): Promise<void> {
  let finnhubData: Record<string, unknown> | null = null
  let finnhubError: string | null = null

  try {
    finnhubData = await getFinnhubFundamentals(symbol)
  } catch (err) {
    finnhubError = err instanceof Error ? err.message : String(err)
    console.error(`[fundamentals] ${finnhubError}`)
  }

  if (finnhubData) {
    await upsertFundamentals(symbol, 'finnhub', finnhubData)
    return
  }

  // Finnhub failed or returned empty — try Yahoo
  if (finnhubError) {
    console.warn(`[fundamentals] ${symbol}: Finnhub failed (${finnhubError}), trying Yahoo...`)
  } else {
    console.log(`[fundamentals] ${symbol}: Finnhub empty, trying Yahoo...`)
  }

  try {
    const yahooData = await getYahooFundamentals(symbol)
    if (yahooData) {
      await upsertFundamentals(symbol, 'yahoo', yahooData)
    } else {
      console.warn(`[fundamentals] ${symbol}: Yahoo also returned empty`)
    }
  } catch (err) {
    // Both sources failed — log separately so it's clearly a dual failure
    const yahooError = err instanceof Error ? err.message : String(err)
    console.error(`[fundamentals] ${symbol}: Yahoo also failed — ${yahooError}`)
    console.error(`[fundamentals] ${symbol}: ⚠ Both Finnhub and Yahoo failed — no data updated`)
  }
}

/** Refresh fundamentals for all watched symbols with Finnhub rate-limiting. */
export async function runFundamentalsRefresh(): Promise<void> {
  console.log('[fundamentals] Starting refresh...')

  if (!FINNHUB_KEY) {
    console.warn('[fundamentals] FINNHUB_API_KEY not set — Yahoo-only mode')
  }

  const symbols = await getWatchedSymbols()
  console.log(`[fundamentals] ${symbols.length} symbols to refresh`)

  let ok = 0
  let errors = 0

  for (const symbol of symbols) {
    const start = Date.now()
    try {
      await refreshSymbol(symbol)
      ok++
    } catch (err) {
      errors++
      console.error(`[fundamentals] ${symbol} unexpected error:`, err)
    }

    // Throttle to stay under Finnhub's 60 req/min
    // (each symbol may make 2 Finnhub calls, so we pace per-symbol)
    const elapsed = Date.now() - start
    const wait = FINNHUB_INTERVAL_MS * 2 - elapsed
    if (wait > 0) await sleep(wait)
  }

  console.log(`[fundamentals] Done — ${ok} updated, ${errors} errors`)
}
