"use client"

import { usePageTracking } from '@/hooks/useTracking'
import { Suspense } from 'react'

function Tracker() {
  usePageTracking()
  return null
}

export default function PageTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  )
}
