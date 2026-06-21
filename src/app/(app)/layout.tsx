export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppNav from '@/components/AppNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name,role')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen bg-[#0b0e16]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <AppNav userName={profile?.name ?? user.email ?? ''} role={profile?.role ?? 'team'} />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
