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
  // Strip BOM that Excel adds to UTF-8 CSVs
  const clean = text.replace(/^﻿/, '')
  const normalized = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const lines = normalized.split('\n')

  // Auto-detect delimiter: tab or comma
  const firstLine = lines[0]
  const tabCount   = (firstLine.match(/\t/g) ?? []).length
  const commaCount = (firstLine.match(/,/g) ?? []).length
  const isTab = tabCount > commaCount

  const parseLine = isTab
    ? (line: string) => line.split('\t').map(s => s.trim())
    : parseCsvLine

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseLine(line)
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
  symbol:     ['symbol', 'sym', 'ticker', 'stock', 'instrumento', 'instrument', 'security'],
  date:       ['date', 'trade date', 'fecha', 'entry date', 'open date', 'transaction date', 'trade_date', 'tradedate', 'day'],
  open_time:  ['open', 'entry', 'entry time', 'open time', 'time in', 'apertura', 'open_time', 'entrytime', 'time', 'hora entrada', 'entry_time'],
  close_time: ['close', 'exit', 'exit time', 'close time', 'time out', 'cierre', 'close_time', 'exittime', 'hora salida', 'exit_time'],
  max_size:   ['size', 'max size', 'shares', 'qty', 'quantity', 'tam', 'tam.', 'position size', 'max_size', 'maxsize', 'pos size', 'contracts', 'volume'],
  n_fills:    ['fills', 'n fills', 'executions', 'n_fills', 'trades', 'num trades', 'number of trades'],
  avg_buy:    ['avg buy', 'buy', 'buy price', 'entry price', 'avg entry', 'avg_buy', 'avgbuy', 'open price', 'precio entrada', 'avg open', 'purchase price'],
  avg_sell:   ['avg sell', 'sell', 'sell price', 'exit price', 'avg exit', 'avg_sell', 'avgsell', 'close price', 'precio salida', 'avg close', 'sale price'],
  gross:      ['gross', 'gross pnl', 'gross p&l', 'bruto', 'gross_pnl', 'gross profit', 'gross profit/loss'],
  fees:       ['fees', 'fee', 'commission', 'comm', 'comisión', 'commissions', 'comm/fee', 'brokerage'],
  net_pnl:    ['net', 'neto', 'net pnl', 'net p&l', 'p&l', 'pnl', 'net_pnl', 'realized p/l', 'realized pnl', 'net profit', 'net profit/loss', 'total p/l', 'p/l', 'profit/loss', 'profit', 'net amount', 'gain/loss'],
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

// ── CMEG brokerage fills report ────────────────────────────────────────────────
// Format: hierarchical XLS — date row, then repeating "SYMBOL - Name" blocks,
// each containing fill rows + a Bought/Sold summary section.

type DirectTrade = {
  symbol: string | null; date: string | null; open_time: string | null
  close_time: string | null; open_side: 'B' | 'S' | null
  avg_buy: number | null; avg_sell: number | null
  buy_qty: number | null; sell_qty: number | null
  max_size: number | null; n_fills: number | null; holding_sec: number | null
  gross: number | null; fees: number | null; net_pnl: number
  mae: null; mfe: null
}

function isCMEGXls(raw: unknown[][]): boolean {
  if (raw.length < 3) return false
  const r1 = String(raw[1]?.[0] ?? '').trim()
  const r2 = raw[2]
  return /^[A-Z]+\s*-\s*/.test(r1)
    && String(r2?.[0] ?? '') === 'Time'
    && String(r2?.[5] ?? '') === 'B/S'
}

function parseCMEGXls(raw: unknown[][]): DirectTrade[] {
  // Date is in row 0, col 0 — could be Date object or ISO string
  const dateCell = raw[0]?.[0]
  let tradeDate = ''
  if (dateCell instanceof Date) {
    const y = dateCell.getUTCFullYear()
    const mo = String(dateCell.getUTCMonth() + 1).padStart(2, '0')
    const d  = String(dateCell.getUTCDate()).padStart(2, '0')
    tradeDate = `${y}-${mo}-${d}`
  } else {
    const m = String(dateCell ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) tradeDate = m[1]
  }

  const results: DirectTrade[] = []
  let i = 1

  const toSec = (t: string) => {
    const [h, m, s] = t.split(':').map(Number)
    return h * 3600 + m * 60 + (s || 0)
  }

  while (i < raw.length) {
    const cell0 = String(raw[i]?.[0] ?? '').trim()

    // Symbol block header: "TICKER - Company Name"
    if (/^[A-Z]+\s*-\s*/.test(cell0)) {
      const symbol = cell0.split(/\s*-\s*/)[0].trim()
      i += 2 // skip symbol row + column header row

      // Collect individual fills until the "Orders/Fills" summary row
      type Fill = { time: string; side: 'B'|'S'; qty: number; price: number; position: number; gross: number; net: number }
      const fills: Fill[] = []

      while (i < raw.length) {
        const r = raw[i]
        const t = String(r?.[0] ?? '').trim()
        if (!t && String(r?.[1] ?? '').trim() === 'Orders') break // summary sentinel
        if (/^\d{1,2}:\d{2}:\d{2}/.test(t)) {
          fills.push({
            time: t.slice(0, 8),
            side: String(r[5] ?? '') as 'B' | 'S',
            qty: Number(r[6]) || 0,
            price: Number(r[7]) || 0,
            position: Number(r[8]) || 0,
            gross: Number(r[9]) || 0,
            net: Number(r[21]) || 0,
          })
        }
        i++
      }

      // Skip past summary section (Bought / Sold / totals) until blank separator
      while (i < raw.length) {
        const c0 = String(raw[i]?.[0] ?? '').trim()
        const c1 = String(raw[i]?.[1] ?? '').trim()
        i++
        if (!c0 && !c1) break // blank separator between symbol blocks
      }

      if (!fills.length) continue

      // Split fills into round-trip trades: each time position hits 0 = closed trade
      let start = 0
      for (let j = 0; j < fills.length; j++) {
        if (fills[j].position === 0 || j === fills.length - 1) {
          const tf = fills.slice(start, j + 1)
          if (!tf.length) { start = j + 1; continue }

          const buys  = tf.filter(f => f.side === 'B')
          const sells = tf.filter(f => f.side === 'S')
          const buyQty   = buys.reduce((s, f) => s + f.qty, 0)
          const sellQty  = sells.reduce((s, f) => s + f.qty, 0)
          const avgBuy   = buyQty  ? buys.reduce((s, f)  => s + f.price * f.qty, 0) / buyQty  : null
          const avgSell  = sellQty ? sells.reduce((s, f) => s + f.price * f.qty, 0) / sellQty : null
          const maxPos   = Math.max(...tf.map(f => Math.abs(f.position)), 0)
          const gross    = tf.reduce((s, f) => s + f.gross, 0)
          const netPnl   = tf.reduce((s, f) => s + f.net,   0)
          const fees     = gross - netPnl // always positive (fees reduce net vs gross)
          const openTime  = tf[0].time
          const closeTime = tf[tf.length - 1].time

          results.push({
            symbol,
            date: tradeDate,
            open_time: openTime,
            close_time: closeTime,
            open_side: tf[0].side,
            avg_buy:  avgBuy  != null ? Math.round(avgBuy  * 10000) / 10000 : null,
            avg_sell: avgSell != null ? Math.round(avgSell * 10000) / 10000 : null,
            buy_qty:  buyQty  || null,
            sell_qty: sellQty || null,
            max_size: maxPos  || null,
            n_fills:  tf.length,
            holding_sec: Math.max(0, toSec(closeTime) - toSec(openTime)),
            gross:   Math.round(gross  * 100) / 100,
            fees:    Math.round(Math.abs(fees) * 100) / 100,
            net_pnl: Math.round(netPnl * 100) / 100,
            mae: null,
            mfe: null,
          })

          start = j + 1
        }
      }
      continue
    }
    i++
  }

  return results
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
  isCMEG: boolean
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
  const [err, setErr]         = useState('')
  const [directTrades, setDirectTrades] = useState<DirectTrade[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('idle'); setFile(null); setMapping({}); setResult(null); setCheck(null); setErr(''); setDirectTrades(null)
  }

  function close() { setOpen(false); reset() }

  function applyParsed(headers: string[], rows: Record<string, string>[]) {
    const isTF      = isTradeForgeFormat(headers)
    const detected  = autoMap(headers)
    setFile({ headers, rows, isTF, isCMEG: false })
    setMapping(detected)
    setCheck(null)
    setStep('mapping')
    setErr('')
    if (isTF) {
      const parsed = rows
        .map(r => rowToTrade(r, detected))
        .filter(t => t.symbol && t.date && t.net_pnl !== undefined)
      setTimeout(() => runCheck(parsed), 0)
    }
  }

  function isExcel(f: File) {
    return f.name.endsWith('.xlsx') || f.name.endsWith('.xls') ||
      f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      f.type === 'application/vnd.ms-excel'
  }

  function loadFile(f: File) {
    const isCsv = f.name.endsWith('.csv') || f.name.endsWith('.txt') || f.name.endsWith('.tsv') ||
      f.type.includes('csv') || f.type.includes('text/plain') || f.type.includes('text/tab')
    if (!isCsv && !isExcel(f)) {
      setErr('Por favor selecciona un archivo CSV, TSV, TXT o Excel (.xls, .xlsx).'); return
    }

    if (isExcel(f)) {
      const reader = new FileReader()
      reader.onload = async e => {
        try {
          const buffer = e.target?.result as ArrayBuffer
          const XLSX   = await import('xlsx')
          const wb     = XLSX.read(buffer, { type: 'array', cellDates: true })
          const ws     = wb.Sheets[wb.SheetNames[0]]
          const raw    = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
          if (!raw.length) { setErr('La hoja está vacía.'); return }

          // CMEG fills report — parse directly, skip column-mapping step
          if (isCMEGXls(raw as unknown[][])) {
            const parsed = parseCMEGXls(raw as unknown[][])
            if (!parsed.length) { setErr('No se encontraron trades en el archivo CMEG.'); return }
            setDirectTrades(parsed)
            setFile({ headers: [], rows: [], isTF: false, isCMEG: true })
            setCheck(null)
            setStep('mapping')
            setErr('')
            setTimeout(() => runCheck(parsed as typeof trades), 0)
            return
          }

          // Generic XLS — convert to column-keyed rows for mapping step
          const headers = (raw[0] as unknown[]).map(h => String(h ?? '').trim()).filter(Boolean)
          const rows    = (raw.slice(1) as unknown[][])
            .filter(r => r.some(v => v !== '' && v != null))
            .map(r => {
              const obj: Record<string, string> = {}
              headers.forEach((h, i) => {
                const v = r[i]
                if (v instanceof Date) {
                  const mm = String(v.getUTCMonth() + 1).padStart(2, '0')
                  const dd = String(v.getUTCDate()).padStart(2, '0')
                  obj[h] = `${v.getUTCFullYear()}-${mm}-${dd}`
                } else {
                  obj[h] = String(v ?? '').trim()
                }
              })
              return obj
            })
          applyParsed(headers, rows)
        } catch {
          setErr('No se pudo leer el archivo Excel.')
        }
      }
      reader.readAsArrayBuffer(f)
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const text            = e.target?.result as string
          const { headers, rows } = parseCsv(text)
          applyParsed(headers, rows)
        } catch {
          setErr('No se pudo leer el archivo CSV.')
        }
      }
      reader.readAsText(f)
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) loadFile(f)
  }, [])

  const trades = (file?.isCMEG && directTrades)
    ? directTrades as ReturnType<typeof rowToTrade>[]
    : (file ? file.rows.map(r => rowToTrade(r, mapping)).filter(t => t.symbol && t.date && t.net_pnl !== undefined) : [])

  const previewRows = trades.slice(0, 5)

  const mappedRequired = file?.isCMEG ? true : FIELDS.filter(f => f.required).every(f => mapping[f.key])

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
                    <p className="text-[13px] text-[#a4abbe] font-medium">Arrastra tu archivo aquí o haz clic para buscar</p>
                    <p className="text-[11px] text-[#4a5266] mt-1">CSV · TSV · TXT · Excel XLS/XLSX</p>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
                  />
                  <div className="bg-[#0d1117] border border-[#1a1f2e] rounded-lg p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4a5266] mb-2">Formatos soportados</p>
                    <ul className="space-y-1 text-[11px] text-[#6d7589]">
                      <li>• <span className="text-[#a4abbe]">TradeForge CSV</span> — exportado desde la página de Trades (auto-detectado)</li>
                      <li>• <span className="text-[#a4abbe]">Excel XLS / XLSX</span> — primera hoja del libro, fechas convertidas automáticamente</li>
                      <li>• <span className="text-[#a4abbe]">CSV genérico</span> — cualquier CSV con columnas mapeables</li>
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
                      file.isCMEG
                        ? 'bg-[rgba(59,130,246,0.1)] text-[#3b82f6] border border-[rgba(59,130,246,0.2)]'
                        : file.isTF
                          ? 'bg-[rgba(34,197,94,0.1)] text-[#22c55e] border border-[rgba(34,197,94,0.2)]'
                          : 'bg-[rgba(245,158,11,0.1)] text-[#f59e0b] border border-[rgba(245,158,11,0.2)]'
                    }`}>
                      {file.isCMEG
                        ? '✓ CMEG Detailed Report detectado'
                        : file.isTF
                          ? '✓ TradeForge CSV detectado'
                          : 'CSV genérico — verifica el mapeo'}
                    </span>
                    <span className="text-[11px] text-[#4a5266] font-mono">
                      {file.isCMEG ? `${trades.length} trades extraídos` : `${file.rows.length} filas en archivo`}
                    </span>
                  </div>

                  {/* Column mapping — hidden for CMEG (already parsed directly) */}
                  {!file.isCMEG && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-[#a4abbe]">Mapeo de columnas</p>
                      <span className="text-[10px] text-[#4a5266]">* obligatorio — selecciona la columna correcta si aparece «sin mapear»</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {FIELDS.map(f => {
                        const missing = f.required && !mapping[f.key]
                        return (
                          <div key={f.key} className="flex items-center gap-2">
                            <span className={`text-[10px] w-24 shrink-0 ${missing ? 'text-[#ef4444] font-semibold' : 'text-[#6d7589]'}`}>
                              {f.label}{f.required && <span className="text-[#ef4444]"> *</span>}
                            </span>
                            <select
                              value={mapping[f.key] ?? ''}
                              onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                              className={`flex-1 bg-[#161b28] border rounded px-2 py-1 text-[10px] font-mono focus:outline-none focus:border-[#f59e0b] ${
                                missing ? 'border-[#ef4444] text-[#ef4444]' : 'border-[#232a3a] text-[#e8ecf2]'
                              }`}
                            >
                              <option value="">— sin mapear —</option>
                              {file.headers.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  )} {/* end !file.isCMEG column mapping */}

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

                  {!file.isCMEG && !mappedRequired && (
                    <div className="rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] px-3 py-2">
                      <p className="text-[11px] text-[#ef4444] font-medium">
                        ⚠ Asigna las columnas marcadas en rojo (Symbol, Date, Net P&L) usando los desplegables de arriba.
                      </p>
                    </div>
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
