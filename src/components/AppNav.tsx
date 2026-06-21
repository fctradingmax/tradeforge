'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/trades',    label: 'Trades',    icon: '⇅' },
  { href: '/watchlist', label: 'Watchlist', icon: '◎' },
  { href: '/chat',      label: 'AI Agent',  icon: '✦' },
  { href: '/alerts',    label: 'Alerts',    icon: '🔔' },
]

interface Props {
  userName: string
  role: string
}

export default function AppNav({ userName, role }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [unreadAlerts, setUnreadAlerts] = useState(0)

  useEffect(() => {
    fetch('/api/alerts?unread=true')
      .then((r) => r.json())
      .then((d) => setUnreadAlerts(Array.isArray(d) ? d.length : 0))
      .catch(() => {})
  }, [pathname])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <aside className="w-[240px] shrink-0 bg-[#11151f] border-r border-[#232a3a] flex flex-col sticky top-0 h-screen">
      {/* Brand */}
      <div className="px-6 py-6 border-b border-[#232a3a]">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#22c55e)', boxShadow: '0 0 10px rgba(245,158,11,0.5)' }} />
          <span className="text-[17px] font-bold tracking-tight text-[#e8ecf2]">TradeForge</span>
        </div>
        <p className="text-[10px] text-[#4a5266] mt-1 tracking-widest uppercase">Trading Journal</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isAlerts = href === '/alerts'
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-[#1e2434] text-[#e8ecf2]'
                  : 'text-[#6d7589] hover:text-[#a4abbe] hover:bg-[#161b28]'
              }`}
            >
              <span className="text-base w-4 text-center">{icon}</span>
              <span>{label}</span>
              {isAlerts && unreadAlerts > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-[#ef4444] text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {unreadAlerts > 99 ? '99+' : unreadAlerts}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-[#232a3a]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-[#1e2434] flex items-center justify-center text-xs text-[#a4abbe] font-semibold shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[#e8ecf2] truncate">{userName}</p>
            <p className="text-[10px] text-[#4a5266] capitalize">{role}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full text-left text-xs text-[#4a5266] hover:text-[#6d7589] py-1 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
