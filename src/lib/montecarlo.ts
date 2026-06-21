export interface MCParams {
  sims?: number      // default 5000
  nTrades?: number   // default = population length
  mode?: 'bootstrap' | 'parametric'
}

export interface MCResult {
  sims: number
  nTrades: number
  mode: 'bootstrap' | 'parametric'
  mean: number
  median: number
  p5: number
  p1: number
  probNeg: number
  medDD: number
  worstDD5: number
  worstDD1: number
  hist: { labels: number[]; counts: number[]; binW: number }
  fan: {
    steps: number[]
    p5: number[]
    p25: number[]
    p50: number[]
    p75: number[]
    p95: number[]
  }
  params: { winRate: number; avgWin: number; avgLoss: number }
}

function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length
  if (!n) return 0
  if (p <= 0) return sorted[0]
  if (p >= 100) return sorted[n - 1]
  const idx = (p / 100) * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const w = idx - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}

/**
 * Bootstrap or parametric Monte Carlo simulation over a population
 * of net P&L values (one per trade).
 */
export function mcSimulate(population: number[], opts: MCParams = {}): MCResult {
  const pop = population
  const popLen = pop.length
  if (popLen === 0) throw new Error('mcSimulate: population is empty')

  const sims = Math.max(100, Math.min((opts.sims ?? 5000) | 0, 50_000))
  const nTrades = Math.max(1, Math.min((opts.nTrades ?? popLen) | 0, 20_000))
  const mode = opts.mode ?? 'bootstrap'

  const wins = pop.filter((x) => x > 0.001)
  const losses = pop.filter((x) => x < -0.001)
  const winRate = wins.length / popLen
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

  const finals = new Float64Array(sims)
  const dds = new Float64Array(sims)

  const nCk = Math.min(nTrades, 60)
  const ckIdx: number[] = []
  for (let c = 0; c < nCk; c++) {
    ckIdx.push(Math.round(((c + 1) / nCk) * nTrades) - 1)
  }
  const eqAt = ckIdx.map(() => new Float64Array(sims))

  for (let s = 0; s < sims; s++) {
    let eq = 0, peak = 0, maxDD = 0, ck = 0
    for (let i = 0; i < nTrades; i++) {
      const r =
        mode === 'parametric'
          ? Math.random() < winRate ? avgWin : avgLoss
          : pop[(Math.random() * popLen) | 0]
      eq += r
      if (eq > peak) peak = eq
      const dd = peak - eq
      if (dd > maxDD) maxDD = dd
      if (ck < ckIdx.length && i === ckIdx[ck]) {
        eqAt[ck][s] = eq
        ck++
      }
    }
    finals[s] = eq
    dds[s] = maxDD
  }

  const fSorted = Float64Array.from(finals).sort()
  const dSorted = Float64Array.from(dds).sort()
  let negCount = 0
  for (let i = 0; i < sims; i++) if (finals[i] < 0) negCount++

  const nBins = 40
  const lo = fSorted[0]
  const hi = fSorted[sims - 1]
  const span = (hi - lo) || 1
  const binW = span / nBins
  const bins = new Array<number>(nBins).fill(0)
  const binLabels: number[] = []
  for (let b = 0; b < nBins; b++) binLabels.push(lo + (b + 0.5) * binW)
  for (let i = 0; i < sims; i++) {
    let b = Math.floor((finals[i] - lo) / binW)
    if (b < 0) b = 0
    if (b >= nBins) b = nBins - 1
    bins[b]++
  }

  const fan = {
    steps: ckIdx.map((i) => i + 1),
    p5: [] as number[], p25: [] as number[], p50: [] as number[],
    p75: [] as number[], p95: [] as number[],
  }
  for (let c = 0; c < eqAt.length; c++) {
    const col = Float64Array.from(eqAt[c]).sort()
    fan.p5.push(percentile(col, 5))
    fan.p25.push(percentile(col, 25))
    fan.p50.push(percentile(col, 50))
    fan.p75.push(percentile(col, 75))
    fan.p95.push(percentile(col, 95))
  }

  return {
    sims, nTrades, mode,
    mean: Array.from(finals).reduce((a, b) => a + b, 0) / sims,
    median: percentile(fSorted, 50),
    p5: percentile(fSorted, 5),
    p1: percentile(fSorted, 1),
    probNeg: negCount / sims,
    medDD: percentile(dSorted, 50),
    worstDD5: percentile(dSorted, 95),
    worstDD1: percentile(dSorted, 99),
    hist: { labels: binLabels, counts: bins, binW },
    fan,
    params: { winRate, avgWin, avgLoss },
  }
}
