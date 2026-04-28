// hooks/useLiveSession.ts

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Choice { id?: string; text: string; next: string; tag?: string }

interface LiveSession {
  id: string
  name: string
  story_slug: string
  scene_id: string | null
  voting_open: boolean
  revealed: boolean
  current_round: number
  reset_at: string | null
}

interface VoteCount {
  cid: string
  text: string
  tag?: string
  count: number
  pct: number
  color: string
}

const COLORS = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e', '#7c3aed', '#b45309']

export function useLiveSession(sessionId: string | null) {
  const supabase = createClient()

  const [session,    setSession]    = useState<LiveSession | null>(null)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [votes,      setVotes]      = useState<VoteCount[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Check admin ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('user_profiles').select('is_admin').eq('id', user.id).single()
        .then(({ data }) => setIsAdmin(!!data?.is_admin))
    })
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load session + contatore voti iniziale ─────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    supabase.from('live_sessions').select('*').eq('id', sessionId).single()
      .then(({ data }) => {
        if (!data) return
        setSession(data)
        if (data.scene_id) {
          let query = supabase.from('live_votes')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('scene_id', data.scene_id)
            .eq('round', data.current_round ?? 1)
          if (data.reset_at) query = query.gte('voted_at', data.reset_at)
          query.then(({ count }) => setTotalVotes(count ?? 0))
        }
      })
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime (niente polling) ──────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return

    const ch = supabase.channel(`live-game-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'live_votes',
        filter: `session_id=eq.${sessionId}`
      }, () => setTotalVotes(v => v + 1))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_sessions',
        filter: `id=eq.${sessionId}`
      }, payload => {
        const newSession = payload.new as LiveSession
        setSession(prev => {
          if (prev?.reset_at !== newSession.reset_at) {
            setVotes([])
            setTotalVotes(0)
          }
          return newSession
        })
      })
      .subscribe()

    subRef.current = ch
    return () => { ch.unsubscribe() }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calcola vote counts ────────────────────────────────────────────────────
  const refreshVotes = useCallback(async (choices: Choice[], sceneId: string, round?: number) => {
    if (!sessionId || !choices.length || !sceneId) return
    const currentRound = round ?? session?.current_round ?? 1
    const resetAt = session?.reset_at ?? null

    let query = supabase.from('live_votes')
      .select('choice_id')
      .eq('session_id', sessionId)
      .eq('scene_id', sceneId)
      .eq('round', currentRound)
    if (resetAt) query = query.gte('voted_at', resetAt)

    const { data } = await query
    if (!data) return
    const total = data.length
    setTotalVotes(total)
    setVotes(choices.map((c, i) => {
      const cid   = c.id ?? String(i)
      const count = data.filter(v => v.choice_id === cid).length
      return {
        cid, text: c.text, tag: c.tag, count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        color: COLORS[i % COLORS.length],
      }
    }))
  }, [sessionId, session?.current_round, session?.reset_at]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Admin actions ──────────────────────────────────────────────────────────

  const setSceneId = useCallback(async (sceneId: string) => {
    if (!sessionId) return
    await supabase.from('live_sessions').update({
      scene_id: sceneId,
      voting_open: false,
      revealed: false,
      current_round: 1,
      reset_at: null,
    }).eq('id', sessionId)
    setVotes([])
    setTotalVotes(0)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openVoting = useCallback(async () => {
    if (!sessionId) return
    await supabase.from('live_sessions').update({ voting_open: true, revealed: false }).eq('id', sessionId)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeVoting = useCallback(async () => {
    if (!sessionId) return
    await supabase.from('live_sessions').update({ voting_open: false }).eq('id', sessionId)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = useCallback(async () => {
    if (!sessionId) return
    await supabase.from('live_sessions').update({ voting_open: false, revealed: true }).eq('id', sessionId)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetVotes = useCallback(async () => {
    if (!sessionId) return
    await supabase.from('live_sessions').update({
      voting_open: false,
      revealed: false,
      reset_at: new Date().toISOString(),
    }).eq('id', sessionId)
    setVotes([])
    setTotalVotes(0)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    session, isAdmin, votes, totalVotes,
    refreshVotes, setSceneId, openVoting, closeVoting, reveal, resetVotes,
  }
}