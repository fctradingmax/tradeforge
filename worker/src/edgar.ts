/**
 * EDGAR filing scanner.
 *
 * Fetches the SEC company_tickers.json map once per run (cached in memory),
 * then for each watched symbol pulls the submissions endpoint and diffs
 * against accession numbers already in the DB. New filings are inserted
 * and alerts raised for every user watching that symbol.
 *
 * SEC fair-use policy requires a descriptive User-Agent on every request.
 */

import {
  getWatchedSymbols,
  getKnownAccessions,
  getUsersForSymbol,
  insertFilings,
  raiseAlerts,
  type NewFiling,
} from './db.js'

const SEC_WWW = 'https://www.sec.gov'
const SEC_DATA = 'https://data.sec.gov'
const USER_AGENT = process.env.SEC_USER_AGENT ?? 'TradeForge felimax2010@gmail.com'

const HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json',
}

// In-memory CIK map — refreshed once per scan run
let cikMap: Map<string, string> | null = null

async function loadCikMap(): Promise<Map<string, string>> {
  if (cikMap) return cikMap

  const res = await fetch(`${SEC_WWW}/files/company_tickers.json`, { headers: HEADERS })
  if (!res.ok) throw new Error(`EDGAR ticker map ${res.status}: ${res.statusText}`)

  const json = await res.json() as Record<string, { ticker: string; cik_str: number }>
  cikMap = new Map(
    Object.values(json).map((v) => [v.ticker.toUpperCase(), String(v.cik_str).padStart(10, '0')]),
  )
  return cikMap
}

interface EdgarSubmission {
  filings: {
    recent: {
      form: string[]
      filingDate: string[]
      accessionNumber: string[]
      primaryDocument: string[]
      primaryDocDescription: string[]
    }
  }
}

async function fetchSubmissions(cik: string): Promise<EdgarSubmission> {
  const res = await fetch(`${SEC_DATA}/submissions/CIK${cik}.json`, { headers: HEADERS })
  if (!res.ok) throw new Error(`EDGAR submissions ${res.status}: ${res.statusText}`)
  return res.json() as Promise<EdgarSubmission>
}

function buildDocUrl(cik: string, accession: string, doc: string): string {
  const acc = accession.replace(/-/g, '')
  return `${SEC_WWW}/Archives/edgar/data/${parseInt(cik, 10)}/${acc}/${doc}`
}

/** Scan a single symbol. Returns number of new filings found. */
async function scanSymbol(symbol: string, cik: string): Promise<number> {
  const [known, submission] = await Promise.all([
    getKnownAccessions(symbol),
    fetchSubmissions(cik),
  ])

  const { form, filingDate, accessionNumber, primaryDocument, primaryDocDescription } =
    submission.filings.recent

  const newFilings: NewFiling[] = []
  for (let i = 0; i < accessionNumber.length; i++) {
    const acc = accessionNumber[i]
    if (known.has(acc)) continue

    newFilings.push({
      symbol,
      cik,
      accession_number: acc,
      form_type: form[i] ?? '',
      filing_date: filingDate[i] ?? '',
      document_url: buildDocUrl(cik, acc, primaryDocument[i] ?? ''),
      description: primaryDocDescription[i] ?? '',
    })
  }

  if (!newFilings.length) return 0

  await insertFilings(newFilings)

  const userIds = await getUsersForSymbol(symbol)
  if (userIds.length) {
    await raiseAlerts(
      userIds,
      symbol,
      newFilings.length,
      newFilings.map((f) => f.form_type),
    )
  }

  return newFilings.length
}

/** Polite delay between EDGAR requests (ms). */
const EDGAR_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Run a full EDGAR scan pass across all watched symbols. */
export async function runEdgarScan(): Promise<void> {
  console.log('[edgar] Starting scan...')

  let ciks: Map<string, string>
  try {
    ciks = await loadCikMap()
  } catch (err) {
    console.error('[edgar] Failed to load CIK map:', err)
    return
  }

  const symbols = await getWatchedSymbols()
  console.log(`[edgar] ${symbols.length} symbols to scan`)

  let totalNew = 0
  let errors = 0

  for (const symbol of symbols) {
    const cik = ciks.get(symbol)
    if (!cik) {
      console.warn(`[edgar] No CIK for ${symbol} — skipping`)
      continue
    }

    try {
      const n = await scanSymbol(symbol, cik)
      if (n > 0) console.log(`[edgar] ${symbol}: ${n} new filing(s)`)
      totalNew += n
    } catch (err) {
      errors++
      console.error(`[edgar] ${symbol} error:`, err instanceof Error ? err.message : err)
    }

    await sleep(EDGAR_DELAY_MS)
  }

  console.log(`[edgar] Done — ${totalNew} new filings, ${errors} errors`)
}
