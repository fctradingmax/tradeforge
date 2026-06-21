'use client'

import dynamic from 'next/dynamic'

const EquityChart   = dynamic(() => import('./DashboardCharts').then(m => ({ default: m.EquityChart })),   { ssr: false })
const SymbolChart   = dynamic(() => import('./DashboardCharts').then(m => ({ default: m.SymbolChart })),   { ssr: false })
const SessionSplit  = dynamic(() => import('./DashboardCharts').then(m => ({ default: m.SessionSplit })),  { ssr: false })
const PlComposition = dynamic(() => import('./DashboardCharts').then(m => ({ default: m.PlComposition })), { ssr: false })

interface EquityPoint { label: string; cum: number; net: number }
interface SymPoint { symbol: string; gross: number; fees: number; net: number }
interface SessionRow { name: string; count: number; wr: number; net: number; best: number; worst: number }
interface PlComp { sumWin: number; sumLoss: number; fees: number; net: number }

interface Props {
  equityCurve: EquityPoint[]
  bySymbol: SymPoint[]
  sessionRows: SessionRow[]
  plComp: PlComp
}

export default function DashboardClient({ equityCurve, bySymbol, sessionRows, plComp }: Props) {
  return (
    <>
      {/* Equity + Symbol charts */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-4 mb-4">
        <div className="rounded-[10px] bg-[#11151f] border border-[#232a3a] p-5">
          <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#a4abbe] mb-3">Equity Curve</div>
          <EquityChart data={equityCurve} />
        </div>
        <div className="rounded-[10px] bg-[#11151f] border border-[#232a3a] p-5">
          <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#a4abbe] mb-3">P&L por Símbolo</div>
          <SymbolChart data={bySymbol} />
        </div>
      </div>

      {/* Session Split + P&L Composition */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-[10px] bg-[#11151f] border border-[#232a3a] p-5">
          <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#a4abbe] mb-4">Sesión: Pre-Market vs Regular</div>
          <SessionSplit rows={sessionRows} />
        </div>
        <div className="rounded-[10px] bg-[#11151f] border border-[#232a3a] p-5">
          <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#a4abbe] mb-4">Composición del P&L</div>
          <PlComposition data={plComp} />
        </div>
      </div>
    </>
  )
}
