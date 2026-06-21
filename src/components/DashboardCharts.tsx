'use client'

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Legend,
} from 'recharts'

interface EquityPoint { label: string; cum: number; net: number }
interface SymPoint { symbol: string; gross: number; fees: number; net: number }
interface SessionRow { name: string; count: number; wr: number; net: number; best: number; worst: number }
interface PlComp { sumWin: number; sumLoss: number; fees: number; net: number }

function m(v: number) { return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2) }
function pct(v: number) { return (v * 100).toFixed(1) + '%' }
function cls(v: number) { return v >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]' }

export function EquityChart({ data }: { data: EquityPoint[] }) {
  const peak = Math.max(0, ...data.map(d => d.cum))
  const trough = Math.min(0, ...data.map(d => d.cum))
  return (
    <div className="card-body">
      <div className="text-[10px] text-[#6d7589] mb-3 font-mono">
        Pico <span className="text-[#22c55e]">{m(peak)}</span> · Fondo <span className="text-[#ef4444]">{m(trough)}</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232a3a" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v.toFixed(0)} width={60} />
          <Tooltip
            contentStyle={{ background: '#11151f', border: '1px solid #232a3a', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
            labelStyle={{ color: '#a4abbe', marginBottom: 4 }}
            formatter={(v: number) => [m(v), 'Acum.']}
          />
          <ReferenceLine y={0} stroke="#232a3a" />
          <Area type="monotone" dataKey="cum" stroke="#f59e0b" strokeWidth={2} fill="url(#eq-grad)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SymbolChart({ data }: { data: SymPoint[] }) {
  return (
    <div className="card-body">
      <div className="text-[10px] text-[#6d7589] mb-3">{data.length} símbolos</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#232a3a" vertical={false} />
          <XAxis dataKey="symbol" tick={{ fill: '#a4abbe', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#6d7589', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickLine={false} axisLine={false} tickFormatter={v => '$' + v.toFixed(0)} width={60} />
          <Tooltip
            contentStyle={{ background: '#11151f', border: '1px solid #232a3a', borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
            formatter={(v: number) => m(v)}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#a4abbe' }} />
          <Bar dataKey="gross" name="Bruto" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          <Bar dataKey="fees" name="Fees" fill="#ef4444" radius={[2, 2, 0, 0]} />
          <Bar dataKey="net" name="Neto" fill="#22c55e" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SessionSplit({ rows }: { rows: SessionRow[] }) {
  return (
    <table className="w-full text-xs font-mono">
      <thead>
        <tr className="border-b border-[#232a3a] text-[#6d7589] text-[10px] uppercase tracking-wide">
          <th className="pb-2 text-left font-semibold">Sesión</th>
          <th className="pb-2 text-center font-semibold">Trades</th>
          <th className="pb-2 text-center font-semibold">WR</th>
          <th className="pb-2 text-right font-semibold">Net</th>
          <th className="pb-2 text-right font-semibold">Mejor</th>
          <th className="pb-2 text-right font-semibold">Peor</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.name} className="border-b border-[#1a1f2e] last:border-0">
            <td className="py-2.5 text-[#a4abbe]">{r.name}</td>
            <td className="py-2.5 text-center text-[#e8ecf2]">{r.count}</td>
            <td className="py-2.5 text-center text-[#e8ecf2]">{pct(r.wr)}</td>
            <td className={`py-2.5 text-right font-semibold ${cls(r.net)}`}>{m(r.net)}</td>
            <td className="py-2.5 text-right text-[#22c55e]">{m(r.best)}</td>
            <td className={`py-2.5 text-right ${cls(r.worst)}`}>{m(r.worst)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PlComposition({ data }: { data: PlComp }) {
  const { sumWin, sumLoss, fees, net } = data
  const base = sumWin || 1
  return (
    <div className="space-y-4">
      {[
        { label: 'Suma ganadores', value: sumWin, bar: 100, color: 'bg-[#22c55e]', textColor: 'text-[#22c55e]', sign: '+' },
        { label: 'Suma perdedores', value: sumLoss, bar: Math.min(sumLoss / base * 100, 100), color: 'bg-[#ef4444]', textColor: 'text-[#ef4444]', sign: '-' },
        { label: 'Comisiones', value: fees, bar: Math.min(fees / base * 100, 100), color: 'bg-[#f59e0b]', textColor: 'text-[#ef4444]', sign: '-' },
      ].map(({ label, value, bar, color, textColor, sign }) => (
        <div key={label}>
          <div className="flex justify-between text-xs font-mono mb-1.5">
            <span className="text-[#a4abbe]">{label}</span>
            <span className={textColor}>{sign}${value.toFixed(2)}</span>
          </div>
          <div className="h-5 bg-[#161b28] border border-[#232a3a] rounded overflow-hidden">
            <div className={`h-full ${color} opacity-80`} style={{ width: `${bar}%` }} />
          </div>
        </div>
      ))}
      <div className="border-t border-[#232a3a] pt-3 flex justify-between font-mono text-[15px] font-semibold">
        <span className="text-[#e8ecf2]">NET P&L</span>
        <span className={cls(net)}>{m(net)}</span>
      </div>
    </div>
  )
}
