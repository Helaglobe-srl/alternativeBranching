import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

export function createClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll()     { return request.cookies.getAll() },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )
}