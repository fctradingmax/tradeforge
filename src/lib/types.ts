export type Role = 'owner' | 'team' | 'client'

export interface Profile {
  id: string
  email: string
  name: string | null
  role: Role
  created_at: string
}

export interface Setup {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Trade {
  id: string
  user_id: string
  symbol: string
  date: string | null          // ISO date 'YYYY-MM-DD'
  open_time: string | null     // 'HH:MM:SS'
  close_time: string | null
  open_side: 'B' | 'S' | null
  avg_buy: number | null
  avg_sell: number | null
  buy_qty: number | null
  sell_qty: number | null
  max_size: number | null
  n_fills: number | null
  holding_sec: number | null
  gross: number
  fees: number
  net_pnl: number
  mae: number | null
  mfe: number | null
  // journal fields
  setup: string | null
  quality: string | null
  emotion: string | null
  tags: string[] | null
  notes: string | null
  lessons: string | null
  journal_updated_at: string | null
  // meta
  session_file: string | null
  imported_at: string | null
  created_at: string
}

export interface WatchlistEntry {
  id: string
  user_id: string
  symbol: string
  estrategia: string | null
  notes_html: string | null
  roic: number | null
  float_shares: number | null
  short_interest: number | null
  institutional_ownership: number | null
  operating_cash_flow: number | null
  data_source: string | null
  last_refreshed: string | null
  added_at: string
}

export interface Filing {
  id: string
  symbol: string
  cik: string | null
  accession_number: string
  form_type: string | null
  filing_date: string | null
  document_url: string | null
  description: string | null
  discovered_at: string
  is_new: boolean
}

export interface FundamentalsCache {
  id: string
  symbol: string
  source: string
  payload: Record<string, unknown>
  fetched_at: string
}

export interface Alert {
  id: string
  user_id: string
  type: string
  symbol: string | null
  message: string
  is_read: boolean
  created_at: string
}

export interface AgentConversation {
  id: string
  user_id: string
  title: string | null
  created_at: string
}

export interface AgentMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls: unknown | null
  created_at: string
}

// ── Stats computed server-side ──────────────────────────────────────

export interface TradeStats {
  total_trades: number
  wins: number
  losses: number
  breakeven: number
  win_rate: number
  gross_pnl: number
  total_fees: number
  net_pnl: number
  avg_win: number
  avg_loss: number
  profit_factor: number
  avg_holding_sec: number
  best_trade: number
  worst_trade: number
}
