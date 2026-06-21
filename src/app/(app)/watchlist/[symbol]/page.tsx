'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

interface ChartPoint { d: string; c: number; v: number }

interface DetailData {
  entry: {
    id: string; symbol: string; estrategia: string | null
    notes_html: string | null; last_refreshed: string | null
  }
  summary: {
    price?: {
      regularMarketPrice?: number | null
      regularMarketChange?: number | null
      regularMarketChangePercent?: number | null
      regularMarketVolume?: number | null
      averageVolume?: number | null
      marketCap?: number | null
      shortName?: string | null
      longName?: string | null
      currency?: string | null
    }
    summaryProfile?: {
      sector?: string | null
      industry?: string | null
      longBusinessSummary?: string | null
      fullTimeEmployees?: number | null
      website?: string | null
      country?: string | null
    }
    summaryDetail?: {
      trailingPE?: number | null
      forwardPE?: number | null
      beta?: number | null
      fiftyTwoWeekHigh?: number | null
      fiftyTwoWeekLow?: number | null
      fiftyDayAverage?: number | null
      twoHundredDayAverage?: number | null
      dividendYield?: number | null
      dividendRate?: number | null
      averageVolume?: number | null
    }
    defaultKeyStatistics?: {
      enterpriseValue?: number | null
      priceToBook?: number | null
      enterpriseToRevenue?: number | null
      enterpriseToEbitda?: number | null
      trailingEps?: number | null
      forwardEps?: number | null
      floatShares?: number | null
      sharesOutstanding?: number | null
      heldPercentInsiders?: number | null
      heldPercentInstitutions?: number | null
      shortPercentOfFloat?: number | null
      returnOnEquity?: number | null
      returnOnAssets?: number | null
    }
    financialData?: {
      totalRevenue?: number | null
      grossMargins?: number | null
      operatingMargins?: number | null
      profitMargins?: number | null
      freeCashflow?: number | null
      operatingCashflow?: number | null
      totalCash?: number | null
      totalDebt?: number | null
      debtToEquity?: number | null
      currentRatio?: number | null
      revenueGrowth?: number | null
      earningsGrowth?: number | null
    }
  }
  chart: ChartPoint[]
}

function fmtN(n: number | null | undefined, dec = 2) {
  if (n == null) return '—'
  return n.toFixed(dec)
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return (n * 100).toFixed(2) + '%'
}
function fmtM(n: number | null | undefined) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6)  return (n / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3)  return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString('en-US')
}
function fmtVol(n: number | null | undefined) {
  if (n == null) return '—'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}

const TT_STYLE = {
  contentStyle: {
    background: '#11151f', border: '1px solid #232a3a',
    borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
  },
  labelStyle: { color: '#a4abbe', marginBottom: 2 },
  itemStyle:  { color: '#e8ecf2' },
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1a1f2e] last:border-0">
      <span className="text-[11px] text-[#6d7589]">{label}</span>
      <span className={`text-[12px] font-mono font-semibold ${highlight ?? 'text-[#e8ecf2]'}`}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">{title}</div>
      {children}
    </div>
  )
}

export default function WatchlistDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const router = useRouter()
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // First find the watchlist entry by symbol
    fetch('/api/watchlist')
      .then(r => r.json())
      .then(async (entries: { id: string; symbol: string }[]) => {
        const entry = entries.find(e => e.symbol === symbol.toUpperCase())
        if (!entry) { setError('Symbol not in watchlist'); setLoading(false); return }
        const res = await fetch(`/api/watchlist/${entry.id}/detail`)
        const d = await res.json()
        if (!res.ok) setError(d.error ?? 'Failed to load')
        else setData(d)
        setLoading(false)
      })
      .catch(() => { setError('Network error'); setLoading(false) })
  }, [symbol])

  if (loading) return <div className="p-8 text-center text-[#4a5266] text-sm">Cargando…</div>
  if (error)   return (
    <div className="p-8 text-center">
      <p className="text-[#ef4444] text-sm mb-3">{error}</p>
      <button onClick={() => router.back()} className="text-xs text-[#6d7589] hover:text-[#a4abbe]">← Volver</button>
    </div>
  )
  if (!data) return null

  const { summary, chart } = data
  const pr = summary.price ?? {}
  const sp = summary.summaryProfile ?? {}
  const sd = summary.summaryDetail ?? {}
  const ks = summary.defaultKeyStatistics ?? {}
  const fd = summary.financialData ?? {}

  const price   = pr.regularMarketPrice ?? 0
  const change  = pr.regularMarketChange ?? 0
  const changePct = pr.regularMarketChangePercent ?? 0
  const isUp    = change >= 0

  // 52-week range position (0–100%)
  const lo52 = sd.fiftyTwoWeekLow ?? 0
  const hi52 = sd.fiftyTwoWeekHigh ?? 0
  const rangePct = hi52 > lo52 ? ((price - lo52) / (hi52 - lo52)) * 100 : 50

  const priceColor = isUp ? '#22c55e' : '#ef4444'

  return (
    <div className="p-6 text-[#e8ecf2]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Back + header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <button
            onClick={() => router.back()}
            className="text-[11px] text-[#4a5266] hover:text-[#6d7589] mb-2 inline-flex items-center gap-1 transition-colors"
          >
            ← Watchlist
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-bold tracking-tight">{symbol.toUpperCase()}</h1>
            {pr.shortName && <span className="text-[13px] text-[#6d7589]">{pr.shortName}</span>}
          </div>
          {sp.sector && (
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#1e2434] text-[#a4abbe] border border-[#2f384c]">{sp.sector}</span>
              {sp.industry && <span className="text-[10px] px-2 py-0.5 rounded bg-[#1e2434] text-[#6d7589] border border-[#1e2434]">{sp.industry}</span>}
            </div>
          )}
        </div>

        {/* Live price */}
        <div className="text-right">
          <div className="text-[32px] font-bold font-mono" style={{ color: priceColor }}>
            ${price.toFixed(2)}
          </div>
          <div className="text-[14px] font-mono" style={{ color: priceColor }}>
            {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
          </div>
          <div className="text-[10px] text-[#4a5266] mt-1">
            Vol: {fmtVol(pr.regularMarketVolume)} · Mkt Cap: {fmtM(pr.marketCap)}
          </div>
        </div>
      </div>

      {/* 52-week range */}
      <div className="bg-[#11151f] border border-[#232a3a] rounded-xl px-5 py-4 mb-4">
        <div className="flex justify-between text-[10px] text-[#6d7589] mb-1.5">
          <span>52-week Low: <span className="text-[#ef4444] font-mono">${fmtN(lo52)}</span></span>
          <span className="text-[11px] font-mono text-[#a4abbe]">{rangePct.toFixed(0)}% del rango</span>
          <span>52-week High: <span className="text-[#22c55e] font-mono">${fmtN(hi52)}</span></span>
        </div>
        <div className="h-2 bg-[#1a1f2e] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#f59e0b]"
            style={{ width: `${Math.max(2, Math.min(98, rangePct))}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-[#4a5266] font-mono">
          <span>MA50: ${fmtN(sd.fiftyDayAverage)}</span>
          <span>MA200: ${fmtN(sd.twoHundredDayAverage)}</span>
          <span>Beta: {fmtN(sd.beta)}</span>
          {sd.dividendYield && <span>Div Yield: {fmtPct(sd.dividendYield)}</span>}
        </div>
      </div>

      {/* Price chart */}
      {chart.length > 0 && (
        <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5 mb-4">
          <div className="text-[11px] font-semibold text-[#a4abbe] mb-3">Precio — 90 días</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={priceColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={priceColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2434" vertical={false} />
              <XAxis
                dataKey="d"
                tick={{ fill: '#6d7589', fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => v.slice(5)}
                interval={Math.floor(chart.length / 6)}
              />
              <YAxis
                tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => '$' + v}
                width={55}
                domain={['auto', 'auto']}
              />
              <Tooltip
                {...TT_STYLE}
                formatter={(v: unknown) => [`$${(v as number).toFixed(2)}`, 'Precio']}
                labelFormatter={v => String(v)}
              />
              <Area type="monotone" dataKey="c" stroke={priceColor} strokeWidth={2} fill="url(#detailGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          {/* Volume bar */}
          <ResponsiveContainer width="100%" height={50}>
            <BarChart data={chart} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="d" hide />
              <YAxis hide />
              <Bar dataKey="v" fill="#2f384c" radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Fundamentals grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        <Section title="Valoración">
          <Row label="P/E (TTM)"      value={fmtN(sd.trailingPE)} />
          <Row label="P/E (Forward)"  value={fmtN(sd.forwardPE)} />
          <Row label="P/Book"         value={fmtN(ks.priceToBook)} />
          <Row label="EV/Revenue"     value={fmtN(ks.enterpriseToRevenue)} />
          <Row label="EV/EBITDA"      value={fmtN(ks.enterpriseToEbitda)} />
          <Row label="EPS (TTM)"      value={ks.trailingEps != null ? `$${fmtN(ks.trailingEps)}` : '—'} />
          <Row label="EPS (Forward)"  value={ks.forwardEps  != null ? `$${fmtN(ks.forwardEps)}`  : '—'} />
          <Row label="Enterprise Val" value={fmtM(ks.enterpriseValue)} />
        </Section>

        <Section title="Financieros (TTM)">
          <Row label="Revenue"           value={fmtM(fd.totalRevenue)} />
          <Row label="Rev. Growth (YoY)" value={fmtPct(fd.revenueGrowth)}
            highlight={(fd.revenueGrowth ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'} />
          <Row label="Gross Margin"      value={fmtPct(fd.grossMargins)} />
          <Row label="Op. Margin"        value={fmtPct(fd.operatingMargins)}
            highlight={(fd.operatingMargins ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'} />
          <Row label="Net Margin"        value={fmtPct(fd.profitMargins)}
            highlight={(fd.profitMargins ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'} />
          <Row label="Op. Cash Flow"     value={fmtM(fd.operatingCashflow)} />
          <Row label="Free Cash Flow"    value={fmtM(fd.freeCashflow)}
            highlight={(fd.freeCashflow ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'} />
          <Row label="EPS Growth (YoY)"  value={fmtPct(fd.earningsGrowth)}
            highlight={(fd.earningsGrowth ?? 0) >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'} />
        </Section>

        <Section title="Balance Sheet">
          <Row label="Total Cash"    value={fmtM(fd.totalCash)} />
          <Row label="Total Debt"    value={fmtM(fd.totalDebt)} />
          <Row label="Debt/Equity"   value={fmtN(fd.debtToEquity)}
            highlight={(fd.debtToEquity ?? 0) > 2 ? 'text-[#ef4444]' : 'text-[#22c55e]'} />
          <Row label="Current Ratio" value={fmtN(fd.currentRatio)}
            highlight={(fd.currentRatio ?? 0) >= 1.5 ? 'text-[#22c55e]' : (fd.currentRatio ?? 0) < 1 ? 'text-[#ef4444]' : 'text-[#f59e0b]'} />
          <Row label="ROE"           value={fmtPct(ks.returnOnEquity)}
            highlight={(ks.returnOnEquity ?? 0) >= 0.15 ? 'text-[#22c55e]' : 'text-[#e8ecf2]'} />
          <Row label="ROA"           value={fmtPct(ks.returnOnAssets)}
            highlight={(ks.returnOnAssets ?? 0) >= 0.05 ? 'text-[#22c55e]' : 'text-[#e8ecf2]'} />
        </Section>

        <Section title="Market & Volume">
          <Row label="Market Cap"       value={fmtM(pr.marketCap)} />
          <Row label="Vol (Hoy)"        value={fmtVol(pr.regularMarketVolume)} />
          <Row label="Vol Promedio"      value={fmtVol(sd.averageVolume)} />
          <Row label="Shares Outstanding" value={fmtM(ks.sharesOutstanding)} />
          <Row label="Float"            value={fmtM(ks.floatShares)} />
        </Section>

        <Section title="Ownership">
          <Row label="Insiders"      value={fmtPct(ks.heldPercentInsiders)} />
          <Row label="Institucional" value={fmtPct(ks.heldPercentInstitutions)} />
          <Row label="Short % Float" value={fmtPct(ks.shortPercentOfFloat)}
            highlight={(ks.shortPercentOfFloat ?? 0) > 0.20 ? 'text-[#f59e0b]' : 'text-[#e8ecf2]'} />
        </Section>

        <Section title="Empresa">
          <Row label="País"        value={sp.country       ?? '—'} />
          <Row label="Empleados"   value={sp.fullTimeEmployees != null ? sp.fullTimeEmployees.toLocaleString('en-US') : '—'} />
          {sp.website && (
            <div className="pt-2">
              <a href={sp.website} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-[#3b82f6] hover:underline truncate block">
                {sp.website}
              </a>
            </div>
          )}
        </Section>
      </div>

      {/* Business description */}
      {sp.longBusinessSummary && (
        <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5 mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Descripción</div>
          <p className="text-[12px] text-[#a4abbe] leading-relaxed">{sp.longBusinessSummary}</p>
        </div>
      )}

      {/* User notes */}
      {data.entry.notes_html && (
        <div className="bg-[#11151f] border border-[#232a3a] rounded-xl p-5 mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d7589] mb-3">Mis notas</div>
          <div
            className="text-[12px] text-[#a4abbe] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: data.entry.notes_html }}
          />
        </div>
      )}
    </div>
  )
}
