'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── CSV parser ─────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { field += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      fields.push(field.trim()); field = ''
    } else {
      field += ch
    }
  }
  fields.push(field.trim())
  return fields
}

function parseCsv(text: string) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  const headers = parseCsvLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCsvLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim() })
    return obj
  })
  return { headers, rows }
}

// ── Field mapping ──────────────────────────────────────────────────────────────
const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'symbol',     label: 'Symbol',     required: true },
  { key: 'date',       label: 'Date',       required: true },
  { key: 'net_pnl',   label: 'Net P&L',    required: true },
  { key: 'open_time',  label: 'Open Time' },
  { key: 'close_time', label: 'Close Time' },
  { key: 'avg_buy',    label: 'Avg Buy' },
  { key: 'avg_sell',   label: 'Avg Sell' },
  { key: 'max_size',   label: 'Size (shares)' },
  { key: 'n_fills',    label: 'Fills' },
  { key: 'gross',      label: 'Gross P&L' },
  { key: 'fees',       label: 'Fees' },
  { key: 'mae',        label: 'MAE' },
  { key: 'mfe',        label: 'MFE' },
]

const ALIASES: Record<string, string[]> = {
  symbol:     ['symbol', 'sym', 'ticker', 'stock'],
  date:       ['date', 'trade date', 'fecha'],
  open_time:  ['open', 'entry', 'entry time', 'open time', 'time in', 'apertura'],
  close_time: ['close', 'exit', 'exit time', 'close time', 'time out', 'cierre'],
  max_size:   ['size', 'max size', 'shares', 'qty', 'quantity', 'tam', 'tam.'],
  n_fills:    ['fills', 'n fills', 'executions'],
  avg_buy:    ['avg buy', 'buy', 'buy price', 'entry price', 'avg entry'],
  avg_sell:   ['avg sell', 'sell', 'sell price', 'exit price', 'avg exit'],
  gross:      ['gross', 'gross pnl', 'gross p&l', 'bruto'],
  fees:       ['fees', 'fee', 'commission', 'comm', 'comisión'],
  net_pnl:    ['net', 'neto', 'net pnl', 'net p&l', 'p&l', 'pnl'],
  mae:        ['mae', 'max adverse', 'max adverse excursion'],
  mfe:        ['mfe', 'max favorable', 'max favorable excursion'],
}

// TradeForge own export format (from Trades page CSV export)
const TF_REQUIRED = ['symbol', 'date', 'open', 'close', 'size', 'avg buy', 'avg sell', 'gross', 'fees', 'net']

function autoMap(headers: string[]): Record<string, string> {
  const lower = headers.map(h => h.toLowerCase())
  const result: Record<string, string> = {}
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const idx = lower.findIndex(h => h === alias)
      if (idx >= 0) { result[field] = headers[idx]; break }
    }
    if (!result[field]) {
      // fuzzy: header contains the alias
      for (const alias of aliases) {
        const idx = lower.findIndex(h => h.includes(alias))
        if (idx >= 0) { result[field] = headers[idx]; break }
      }
    }
  }
  return result
}

function isTradeForgeFormat(headers: string[]): boolean {
  const lower = headers.map(h => h.toLowerCase())
  return TF_REQUIRED.every(req => lower.some(h => h === req || h.includes(req)))
}

// ── Value parsing ──────────────────────────────────────────────────────────────
function parseNum(s: string): number | null {
  if (!s || s === '—' || s === '-' || s === '') return null
  const v = parseFloat(s.replace(/[+$, ]/g, ''))
  return isNaN(v) ? null : v
}

function parseTime(s: string): string | null {
  if (!s) return null
  // HH:MM or HH:MM:SS
  const m = s.match(/^\d{1,2}:\d{2}(:\d{2})?$/)
  if (m) return m[1] ? s : s + ':00'
  return null
}

function parseDate(s: string): string | null {
  if (!s) return null
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  // DD/MM/YYYY
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`
  return null
}

function rowToTrade(row: Record<string, string>, mapping: Record<string, string>) {
  const g = (f: string) => (mapping[f] ? row[mapping[f]] ?? '' : '')

  const open_time  = parseTime(g('open_time'))
  const close_time = parseTime(g('close_time'))

  let holding_sec: number | null = null
  if (open_time && close_time) {
    const toS = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0) }
    const diff = toS(close_time) - toS(open_time)
    if (diff >= 0) holding_sec = diff
  }

  const avg_buy  = parseNum(g('avg_buy'))
  const avg_sell = parseNum(g('avg_sell'))
  const max_size = parseNum(g('max_size'))
  const fees     = parseNum(g('fees'))

  // open_side heuristic
  let open_side: 'B' | 'S' | null = null
  if (avg_buy != null && avg_buy > 0 && (avg_sell == null || avg_sell === 0)) open_side = 'B'
  else if (avg_sell != null && avg_sell > 0 && (avg_buy == null || avg_buy === 0)) open_side = 'S'
  else if (avg_buy != null && avg_buy > 0) open_side = 'B'

  const net_pnl = parseNum(g('net_pnl')) ?? 0

  return {
    symbol:      g('symbol').toUpperCase() || null,
    date:        parseDate(g('date')),
    open_time,
    close_time,
    avg_buy,
    avg_sell,
    max_size:    max_size != null ? Math.round(max_size) : null,
    n_fills:     parseNum(g('n_fills')) != null ? Math.round(parseNum(g('n_fills'))!) : null,
    gross:       parseNum(g('gross')),
    fees:        fees != null ? Math.abs(fees) : null,
    net_pnl,
    mae:         parseNum(g('mae')),
    mfe:         parseNum(g('mfe')),
    holding_sec,
    open_side,
    buy_qty:     open_side === 'B' && max_size ? max_size : null,
    sell_qty:    max_size,
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
type Step = 'idle' | 'mapping' | 'importing' | 'done'

interface ParsedFile {
  headers: string[]
  rows: Record<string, string>[]
  isTF: boolean
}

export default function ImportButton() {
  const router = useRouter()
  const [open, setOpen]   = useState(false)
  const [step, setStep]   = useState<Step>('idle')
  const [dragging, setDragging] = useState(false)
  const [file, setFile]   = useState<ParsedFile | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [check, setCheck]  = useState<{ new: number; duplicates: number; total: number } | null>(null)
  const [checking, setChecking] = useState(false)
  const [err, setErr]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('idle'); setFile(null); setMapping({}); setResult(null); setCheck(null); setErr('')
  }

  function close() { setOpen(false); reset() }

  function loadFile(f: File) {
    if (!f.name.endsWith('.csv') && !f.type.includes('csv') && !f.type.includes('text')) {
      setErr('Por favor selecciona un archivo CSV.'); return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text = e.target?.result as string
        const { headers, rows } = parseCsv(text)
        const isTF = isTradeForgeFormat(headers)
        const detected = autoMap(headers)
        setFile({ headers, rows, isTF })
        setMapping(detected)
        setCheck(null)
        setStep('mapping')
        setErr('')
        // Auto-check when TradeForge format is fully auto-mapped
        if (isTF) {
          const parsed = rows
            .map(r => rowToTrade(r, detected))
            .filter(t => t.symbol && t.date && t.net_pnl !== undefined)
          setTimeout(() => runCheck(parsed), 0)
        }
      } catch {
        setErr('No se pudo leer el archivo CSV.')
      }
    }
    reader.readAsText(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) loadFile(f)
  }, [])

  const trades = file
    ? file.rows.map(r => rowToTrade(r, mapping)).filter(t => t.symbol && t.date && t.net_pnl !== undefined)
    : []

  const previewRows = trades.slice(0, 5)

  const mappedRequired = FIELDS.filter(f => f.required).every(f => mapping[f.key])

  async function runCheck(tradeList: typeof trades) {
    if (!tradeList.length) return
    setChecking(true)
    setCheck(null)
    try {
      const res = await fetch('/api/trades/import?check=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: tradeList }),
      })
      const d = await res.json()
      if (res.ok) setCheck(d)
    } catch { /* silent — check is informational */ }
    setChecking(false)
  }

  async function doImport() {
    setStep('importing')
    setErr('')
    try {
      const res = await fetch('/api/trades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Error al importar'); setStep('mapping'); return }
      setResult({ imported: data.imported, skipped: data.skipped })
      setStep('done')
      router.refresh()
    } catch {
      setErr('Error de red'); setStep('mapping')
    }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); reset() }}
        className="px-3 py-1.5 rounded-md bg-[#161b28] border border-[#232a3a] text-[#a4abbe] text-xs font-medium hover:border-[#f59e0b] hover:text-[#f59e0b] transition-colors flex items-center gap-1.5"
      >
        <span className="text-[11px]">↑</span> Importar CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: 'Inter, sans-serif' }}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70" onClick={close} />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-2xl bg-[#0b0e16] border border-[#232a3a] rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#232a3a]">
              <span className="text-[14px] font-semibold text-[#e8ecf2]">Importar Trades</span>
              <button onClick={close} className="text-[#4a5266] hover:text-[#a4abbe] text-lg leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* ── Step: idle ─────────────────────────────── */}
              {step === 'idle' && (
                <>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                      dragging ? 'border-[#f59e0b] bg-[rgba(245,158,11,0.05)]' : 'border-[#2f384c] hover:border-[#4a5266]'
                    }`}
                  >
                    <div className="text-[32px] mb-3 opacity-40">↑</div>
                    <p className="text-[13px] text-[#a4abbe] font-medium">Arrastra tu CSV aquí o haz clic para buscar</p>
                    <p className="text-[11px] text-[#4a5266] mt-1">Soporta el formato de exportación de TradeForge y CSVs genéricos</p>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
                  />
                  <div className="bg-[#0d1117] border border-[#1a1f2e] rounded-lg p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4a5266] mb-2">Formatos soportados</p>
                    <ul className="space-y-1 text-[11px] text-[#6d7589]">
                      <li>• <span className="text-[#a4abbe]">TradeForge CSV</span> — exportado desde la página de Trades (auto-detectado)</li>
                      <li>• <span className="text-[#a4abbe]">CSV genérico</span> — cualquier CSV con columnas mapeables (Symbol, Date, Net P&L requeridos)</li>
                    </ul>
                    <p className="text-[10px] text-[#2f384c] mt-3 font-mono">Columnas mínimas: Symbol, Date, Net P&L</p>
                  </div>
                </>
              )}

              {/* ── Step: mapping ──────────────────────────── */}
              {step === 'mapping' && file && (
                <>
                  {/* Format badge */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      file.isTF
                        ? 'bg-[rgba(34,197,94,0.1)] text-[#22c55e] border border-[rgba(34,197,94,0.2)]'
                        : 'bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)]'
                    }`}>
                      {file.isTF ? '✓ TradeForge CSV detectado' : 'CSV genérico — verifica el mapeo'}
                    </span>
                    <span className="text-[11px] text-[#4a5266] font-mono">{file.rows.length} filas en archivo</span>
                  </div>

                  {/* Column mapping */}
                  <div>
                    <p className="text-[11px] font-semibold text-[#a4abbe] mb-2">Mapeo de columnas</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {FIELDS.map(f => (
                        <div key={f.key} className="flex items-center gap-2">
                          <span className="text-[10px] text-[#6d7589] w-24 shrink-0">
                            {f.label}{f.required && <span className="text-[#ef4444]"> *</span>}
                          </span>
                          <select
                            value={mapping[f.key] ?? ''}
                            onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                            className="flex-1 bg-[#161b28] border border-[#232a3a] text-[#e8ecf2] rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-[#f59e0b]"
                          >
                            <option value="">— sin mapear —</option>
                            {file.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  {previewRows.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-[#a4abbe] mb-2">
                        Preview <span className="text-[#4a5266] font-normal">(primeras {previewRows.length} de {trades.length} trades)</span>
                      </p>
                      <div className="rounded-lg border border-[#1a1f2e] overflow-hidden">
                        <table className="w-full text-[10px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                          <thead>
                            <tr className="bg-[#161b28] text-[#6d7589]">
                              <th className="px-3 py-1.5 text-left">Sym</th>
                              <th className="px-3 py-1.5 text-left">Date</th>
                              <th className="px-3 py-1.5 text-left">Open</th>
                              <th className="px-3 py-1.5 text-right">Size</th>
                              <th className="px-3 py-1.5 text-right">Gross</th>
                              <th className="px-3 py-1.5 text-right">Fees</th>
                              <th className="px-3 py-1.5 text-right">Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((t, i) => (
                              <tr key={i} className="border-t border-[#1a1f2e]">
                                <td className="px-3 py-1.5 text-[#e8ecf2] font-semibold">{t.symbol}</td>
                                <td className="px-3 py-1.5 text-[#a4abbe]">{t.date}</td>
                                <td className="px-3 py-1.5 text-[#6d7589]">{t.open_time ?? '—'}</td>
                                <td className="px-3 py-1.5 text-right text-[#a4abbe]">{t.max_size ?? '—'}</td>
                                <td className={`px-3 py-1.5 text-right ${(t.gross ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>{t.gross != null ? (t.gross >= 0 ? '+' : '') + t.gross.toFixed(2) : '—'}</td>
                                <td className="px-3 py-1.5 text-right text-[#6d7589]">{t.fees?.toFixed(2) ?? '—'}</td>
                                <td className={`px-3 py-1.5 text-right font-semibold ${t.net_pnl >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                                  {t.net_pnl >= 0 ? '+' : ''}{t.net_pnl.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!mappedRequired && (
                    <p className="text-[11px] text-[#f59e0b]">⚠ Mapea Symbol, Date y Net P&L para continuar.</p>
                  )}

                  {/* Duplicate check banner */}
                  {mappedRequired && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => runCheck(trades)}
                        disabled={checking || trades.length === 0}
                        className="px-3 py-1.5 rounded-md bg-[#161b28] border border-[#232a3a] text-[#a4abbe] text-[11px] hover:border-[#2f384c] disabled:opacity-50 transition-colors"
                      >
                        {checking ? 'Verificando…' : '🔍 Verificar duplicados'}
                      </button>
                      {check && !checking && (
                        <div className="flex items-center gap-3 text-[11px] font-mono">
                          <span className="text-[#22c55e]">✓ {check.new} nuevos</span>
                          {check.duplicates > 0 && (
                            <span className="text-[#f59e0b]">⊘ {check.duplicates} duplicados</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Step: importing ────────────────────────── */}
              {step === 'importing' && (
                <div className="py-12 text-center">
                  <div className="text-2xl mb-3 opacity-50 animate-pulse">↑</div>
                  <p className="text-[13px] text-[#a4abbe]">Importando {trades.length} trades…</p>
                </div>
              )}

              {/* ── Step: done ─────────────────────────────── */}
              {step === 'done' && result && (
                <div className="py-8 text-center space-y-4">
                  <div className="text-[40px]">✓</div>
                  <div>
                    <p className="text-[18px] font-semibold text-[#22c55e]">{result.imported} trades importados</p>
                    {result.skipped > 0 && (
                      <p className="text-[12px] text-[#6d7589] mt-1">{result.skipped} duplicados omitidos</p>
                    )}
                  </div>
                  <p className="text-[11px] text-[#4a5266]">El dashboard se actualizará automáticamente.</p>
                </div>
              )}

              {err && (
                <p className="text-[11px] text-[#ef4444]">{err}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#232a3a]">
              {step === 'done' ? (
                <button
                  onClick={close}
                  className="ml-auto px-5 py-2 rounded-md bg-[#22c55e] text-[#0b0e16] text-sm font-semibold hover:bg-[#16a34a] transition-colors"
                >
                  Cerrar
                </button>
              ) : step === 'mapping' ? (
                <>
                  <button
                    onClick={reset}
                    className="text-sm text-[#6d7589] hover:text-[#a4abbe] transition-colors"
                  >
                    ← Otro archivo
                  </button>
                  <button
                    onClick={doImport}
                    disabled={!mappedRequired || trades.length === 0 || (check !== null && check.new === 0)}
                    className="px-5 py-2 rounded-md bg-[#f59e0b] text-[#0b0e16] text-sm font-semibold hover:bg-[#d97706] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {check
                      ? check.new === 0
                        ? 'Todo ya importado'
                        : `Importar ${check.new} nuevos`
                      : `Importar ${trades.length} trades`}
                  </button>
                </>
              ) : step === 'idle' ? (
                <button
                  onClick={close}
                  className="ml-auto text-sm text-[#6d7589] hover:text-[#a4abbe] transition-colors"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
