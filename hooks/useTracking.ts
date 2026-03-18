"use client"

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function usePageTracking() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // rispetta la scelta dell'utente
    const consent = localStorage.getItem('cookie_consent')
    if (consent !== 'accepted') return

    const supabase = createClient()
    const url = searchParams.toString() ? `${pathname}?${searchParams}` : pathname

    supabase.from('page_views').insert({
      page: url,
      user_agent: null,
      referrer: null,
    }).then(({ error }) => {
      if (error) console.error('❌ Supabase error:', error)
    })
  }, [pathname, searchParams])
}