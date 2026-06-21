/**
 * TradeForge background worker
 *
 * Schedule:
 *   - Market hours (Mon–Fri 09:00–16:00 ET): EDGAR + fundamentals every 30 min
 *   - After hours / weekends: fundamentals once daily at 06:00 ET
 *
 * Override via env vars:
 *   SCAN_CRON_MARKET      default "0,30 9-16 * * 1-5"
 *   SCAN_CRON_AFTERHOURS  default "0 6 * * *"
 */

import cron from 'node-cron'
import { runEdgarScan } from './edgar.js'
import { runFundamentalsRefresh } from './fundamentals.js'

const MARKET_CRON = process.env.SCAN_CRON_MARKET ?? '0,30 9-16 * * 1-5'
const AFTERHOURS_CRON = process.env.SCAN_CRON_AFTERHOURS ?? '0 6 * * *'

async function runFullScan(): Promise<void> {
  const start = Date.now()
  console.log(`\n[worker] === Scan started at ${new Date().toISOString()} ===`)

  // Run sequentially so Finnhub rate-limit windows don't overlap with EDGAR
  await runEdgarScan()
  await runFundamentalsRefresh()

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`[worker] === Scan complete in ${elapsed}s ===\n`)
}

async function runFundamentalsOnly(): Promise<void> {
  console.log(`\n[worker] === After-hours fundamentals refresh at ${new Date().toISOString()} ===`)
  await runFundamentalsRefresh()
  console.log('[worker] === Done ===\n')
}

// ── Startup ────────────────────────────────────────────────────────────────────

console.log('[worker] TradeForge scanner starting up')
console.log(`[worker] Market-hours schedule: ${MARKET_CRON}`)
console.log(`[worker] After-hours schedule:  ${AFTERHOURS_CRON}`)

// Run once immediately on startup so we don't wait for first cron tick
runFullScan().catch((err) => console.error('[worker] Startup scan failed:', err))

// Market-hours: EDGAR + fundamentals
cron.schedule(MARKET_CRON, () => {
  runFullScan().catch((err) => console.error('[worker] Market scan failed:', err))
}, { timezone: 'America/New_York' })

// After-hours: fundamentals only (no point hitting EDGAR if market is closed)
cron.schedule(AFTERHOURS_CRON, () => {
  runFundamentalsOnly().catch((err) => console.error('[worker] After-hours refresh failed:', err))
}, { timezone: 'America/New_York' })

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('[worker] SIGTERM received, shutting down gracefully')
  process.exit(0)
})
