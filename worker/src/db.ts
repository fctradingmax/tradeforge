import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

export const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)

/** All distinct symbols currently on any user's watchlist. */
export async function getWatchedSymbols(): Promise<string[]> {
  const { data, error } = await db
    .from('watchlist')
    .select('symbol')

  if (error) throw new Error(`getWatchedSymbols: ${error.message}`)
  return [...new Set((data ?? []).map((r) => r.symbol as string))]
}

/** User IDs that have a given symbol on their watchlist. */
export async function getUsersForSymbol(symbol: string): Promise<string[]> {
  const { data, error } = await db
    .from('watchlist')
    .select('user_id')
    .eq('symbol', symbol)

  if (error) throw new Error(`getUsersForSymbol(${symbol}): ${error.message}`)
  return (data ?? []).map((r) => r.user_id as string)
}

/** Accession numbers already stored for a symbol. */
export async function getKnownAccessions(symbol: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('filings')
    .select('accession_number')
    .eq('symbol', symbol)

  if (error) throw new Error(`getKnownAccessions(${symbol}): ${error.message}`)
  return new Set((data ?? []).map((r) => r.accession_number as string))
}

export interface NewFiling {
  symbol: string
  cik: string
  accession_number: string
  form_type: string
  filing_date: string
  document_url: string
  description: string
}

/** Insert new filing rows; returns the number inserted. */
export async function insertFilings(filings: NewFiling[]): Promise<number> {
  if (!filings.length) return 0
  const { error } = await db
    .from('filings')
    .upsert(filings, { onConflict: 'accession_number', ignoreDuplicates: true })

  if (error) throw new Error(`insertFilings: ${error.message}`)
  return filings.length
}

/** Create alert rows for each affected user. */
export async function raiseAlerts(
  userIds: string[],
  symbol: string,
  count: number,
  sampleForms: string[],
): Promise<void> {
  const forms = sampleForms.slice(0, 3).join(', ')
  const message = `${count} new filing${count > 1 ? 's' : ''} for ${symbol}: ${forms}`

  const rows = userIds.map((uid) => ({
    user_id: uid,
    type: 'new_filing',
    symbol,
    message,
  }))

  const { error } = await db.from('alerts').insert(rows)
  if (error) console.error(`[alerts] ${error.message}`)
}

/** Upsert fundamentals cache row. */
export async function upsertFundamentals(
  symbol: string,
  source: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await db
    .from('fundamentals_cache')
    .upsert(
      { symbol, source, payload, fetched_at: new Date().toISOString() },
      { onConflict: 'symbol,source' },
    )

  if (error) throw new Error(`upsertFundamentals(${symbol}, ${source}): ${error.message}`)
}
