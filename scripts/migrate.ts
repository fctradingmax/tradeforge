/**
 * One-time migration: TradeForge localStorage JSON export → Supabase
 *
 * Usage:
 *   1. In the old TradeForge HTML, open DevTools → Console and run:
 *        copy(localStorage.getItem('tradeforge_v2'))
 *      then paste into a file, e.g. export.json
 *
 *   2. Set env vars (or create a .env.local):
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *        SUPABASE_SERVICE_ROLE_KEY=...
 *        MIGRATE_USER_ID=<your Supabase auth user UUID>
 *        MIGRATE_FILE=./export.json
 *
 *   3. npx tsx scripts/migrate.ts
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const USER_ID = process.env.MIGRATE_USER_ID ?? ''
const EXPORT_FILE = process.env.MIGRATE_FILE ?? './export.json'

if (!SUPABASE_URL || !SERVICE_KEY || !USER_ID) {
  console.error(
    'Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MIGRATE_USER_ID',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Types (subset of TradeForge localStorage format) ─────────────────────────

interface TFTrade {
  symbol: string
  date?: string
  open_time?: string
  close_time?: string
  open_side?: 'B' | 'S'
  avg_buy?: number
  avg_sell?: number
  buy_qty?: number
  sell_qty?: number
  max_size?: number
  n_fills?: number
  holding_sec?: number
  gross?: number
  fees?: number
  net?: number
  mae?: number
  mfe?: number
  // session metadata injected during processing
  _session_file?: string
  _imported_at?: string
}

interface TFJournalEntry {
  setup?: string
  quality?: string
  emotion?: string
  tags?: string[]
  notes?: string
  lessons?: string
  updatedAt?: string
}

interface TFWatchlistEntry {
  symbol: string
  addedAt?: string
  catalyst?: string
  notes?: string          // plain text notes (older format)
  notes_html?: string     // rich-text notes (newer format)
  roicManual?: number
  data?: {
    roic?: number
    float?: number
    shortInterest?: number
    institutionalOwnership?: number
    operatingCashFlow?: number
    source?: string
    lastFetched?: string
  }
}

interface TFExport {
  allTrades?: TFTrade[]
  trades?: TFTrade[]       // backup export uses "trades" instead of "allTrades"
  sessions?: Array<{ date?: string; fileName?: string; importedAt?: string }>
  journal?: Record<string, TFJournalEntry>
  setups?: string[]
  watchlist?: TFWatchlistEntry[]
  savedAt?: string
  exportedAt?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tradeKey(t: TFTrade): string {
  return `${t.date ?? 'na'}__${t.symbol}__${t.open_time ?? ''}`
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = path.resolve(EXPORT_FILE)
  if (!fs.existsSync(filePath)) {
    console.error(`Export file not found: ${filePath}`)
    process.exit(1)
  }

  const raw: TFExport = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  console.log(`Loaded export: ${raw.allTrades?.length ?? 0} trades, ${raw.watchlist?.length ?? 0} watchlist entries`)

  // ── 1. Setups ──────────────────────────────────────────────────────────────
  if (raw.setups?.length) {
    console.log(`\nMigrating ${raw.setups.length} setups...`)
    const setupRows = raw.setups.map((name) => ({ user_id: USER_ID, name }))
    const { error } = await supabase.from('setups').upsert(setupRows, { onConflict: 'user_id,name' })
    if (error) console.error('  setups error:', error.message)
    else console.log('  ✓ setups done')
  }

  // ── 2. Trades (with journal entries merged in) ─────────────────────────────
  const trades = raw.allTrades ?? raw.trades ?? []
  const journal = raw.journal ?? {}

  if (trades.length) {
    console.log(`\nMigrating ${trades.length} trades...`)

    // Build session lookup: date → {fileName, importedAt}
    const sessionMap: Record<string, { file: string; importedAt: string }> = {}
    for (const s of raw.sessions ?? []) {
      if (s.date) sessionMap[s.date] = { file: s.fileName ?? '', importedAt: s.importedAt ?? '' }
    }

    const rows = trades.map((t) => {
      const key = tradeKey(t)
      const j: TFJournalEntry = journal[key] ?? {}
      const sess = t.date ? sessionMap[t.date] : undefined

      return {
        user_id: USER_ID,
        symbol: t.symbol,
        date: t.date ?? null,
        open_time: t.open_time ?? null,
        close_time: t.close_time ?? null,
        open_side: t.open_side ?? null,
        avg_buy: t.avg_buy ?? null,
        avg_sell: t.avg_sell ?? null,
        buy_qty: t.buy_qty ?? null,
        sell_qty: t.sell_qty ?? null,
        max_size: t.max_size ?? null,
        n_fills: t.n_fills ?? null,
        holding_sec: t.holding_sec ?? null,
        gross: t.gross ?? 0,
        fees: t.fees ?? 0,
        net_pnl: t.net ?? 0,
        mae: t.mae ?? null,
        mfe: t.mfe ?? null,
        // journal
        setup: j.setup ?? null,
        quality: j.quality ?? null,
        emotion: j.emotion ?? null,
        tags: j.tags ?? null,
        notes: j.notes ?? null,
        lessons: j.lessons ?? null,
        journal_updated_at: j.updatedAt ?? null,
        // session
        session_file: sess?.file ?? null,
        imported_at: sess?.importedAt ?? null,
      }
    })

    let inserted = 0
    for (const batch of chunk(rows, 100)) {
      const { error } = await supabase.from('trades').insert(batch)
      if (error) {
        console.error('  trades batch error:', error.message)
      } else {
        inserted += batch.length
        process.stdout.write(`  ✓ ${inserted}/${rows.length}\r`)
      }
    }
    console.log(`\n  ✓ trades done (${inserted} inserted)`)
  }

  // ── 3. Watchlist ───────────────────────────────────────────────────────────
  const watchlist = raw.watchlist ?? []
  if (watchlist.length) {
    console.log(`\nMigrating ${watchlist.length} watchlist entries...`)

    const rows = watchlist.map((w) => ({
      user_id: USER_ID,
      symbol: w.symbol.toUpperCase(),
      estrategia: w.catalyst ?? null,
      notes_html: w.notes_html ?? (w.notes ? `<p>${w.notes}</p>` : null),
      roic: w.roicManual ?? w.data?.roic ?? null,
      float_shares: w.data?.float ?? null,
      short_interest: w.data?.shortInterest ?? null,
      institutional_ownership: w.data?.institutionalOwnership ?? null,
      operating_cash_flow: w.data?.operatingCashFlow ?? null,
      data_source: w.data?.source ?? null,
      last_refreshed: w.data?.lastFetched ?? null,
      added_at: w.addedAt ?? new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('watchlist')
      .upsert(rows, { onConflict: 'user_id,symbol' })

    if (error) console.error('  watchlist error:', error.message)
    else console.log('  ✓ watchlist done')
  }

  console.log('\nMigration complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
