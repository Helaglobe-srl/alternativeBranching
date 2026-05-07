'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/login')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// ULTIMA VERSIONE