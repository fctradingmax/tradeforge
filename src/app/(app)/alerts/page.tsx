'use client'

import { useState, useEffect, useCallback } from 'react'

interface Alert {
  id: string
  type: string
  symbol: string | null
  message: string
  is_read: boolean
  created_at: string
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/alerts')
    if (res.ok) setAlerts(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markAllRead() {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })))
  }

  async function markRead(id: string) {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_read: true } : a))
  }

  const unread = alerts.filter((a) => !a.is_read).length

  return (
    <div className="p-8 text-[#e8ecf2]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          {unread > 0 && <p className="text-sm text-[#6d7589] mt-0.5">{unread} unread</p>}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs text-[#a4abbe] hover:text-[#e8ecf2] border border-[#232a3a] rounded px-3 py-1.5 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading && <p className="text-[#6d7589] text-sm">Loading…</p>}

      {!loading && alerts.length === 0 && (
        <div className="rounded-lg bg-[#11151f] border border-[#232a3a] p-8 text-center text-[#6d7589] text-sm">
          No alerts yet. They appear here when the scanner finds new SEC filings for your watchlist.
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`rounded-lg border px-4 py-3 flex items-start gap-4 transition-colors ${
              a.is_read
                ? 'bg-[#11151f] border-[#232a3a]'
                : 'bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.2)]'
            }`}
          >
            <div className="flex-1 min-w-0">
              {a.symbol && (
                <span className="text-xs font-mono font-semibold text-[#f59e0b] mr-2">{a.symbol}</span>
              )}
              <span className="text-sm text-[#e8ecf2]">{a.message}</span>
              <p className="text-xs text-[#4a5266] mt-0.5">{new Date(a.created_at).toLocaleString('en-US')}</p>
            </div>
            {!a.is_read && (
              <button
                onClick={() => markRead(a.id)}
                className="shrink-0 text-xs text-[#6d7589] hover:text-[#a4abbe] transition-colors mt-0.5"
              >
                Dismiss
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
