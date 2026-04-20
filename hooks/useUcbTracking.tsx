// hooks/useUcbTracking.ts

import { useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StartSessionParams {
  username: string
  storySlug: string
}

interface TrackSceneParams {
  sceneId: string
  sceneType: string
  choiceText?: string
}

export function useUcbTracking() {
  const sessionIdRef    = useRef<string | null>(null)
  const currentEventRef = useRef<string | null>(null)
  const sceneEnteredAt  = useRef<number | null>(null)
  const supabase        = createClient()

  const startSession = useCallback(async ({ username, storySlug }: StartSessionParams) => {
    // Recupera user_id corrente
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('ucb_sessions')
      .insert({ 
        username, 
        story_slug: storySlug,
        user_id: user?.id ?? null,  // ← aggiunto
      })
      .select('id')
      .single()

    if (error) { console.error('[UCB] startSession error:', error); return }
    sessionIdRef.current = data.id
  }, [supabase])

  const trackScene = useCallback(async ({ sceneId, sceneType, choiceText }: TrackSceneParams) => {
    if (!sessionIdRef.current) return
    const now = Date.now()

    if (currentEventRef.current && sceneEnteredAt.current) {
      const timeOnScene = now - sceneEnteredAt.current
      await supabase.from('ucb_events')
        .update({ time_on_scene: timeOnScene })
        .eq('id', currentEventRef.current)
    }

    const { data, error } = await supabase.from('ucb_events')
      .insert({
        session_id:  sessionIdRef.current,
        scene_id:    sceneId,
        scene_type:  sceneType,
        choice_text: choiceText ?? null,
        entered_at:  new Date(now).toISOString(),
      })
      .select('id')
      .single()

    if (error) { console.error('[UCB] trackScene error:', error); return }
    currentEventRef.current = data.id
    sceneEnteredAt.current  = now
  }, [supabase])

  const endSession = useCallback(async (completed: boolean) => {
    if (!sessionIdRef.current) return

    if (currentEventRef.current && sceneEnteredAt.current) {
      const timeOnScene = Date.now() - sceneEnteredAt.current
      await supabase.from('ucb_events')
        .update({ time_on_scene: timeOnScene })
        .eq('id', currentEventRef.current)
    }

    await supabase.from('ucb_sessions')
      .update({ ended_at: new Date().toISOString(), completed })
      .eq('id', sessionIdRef.current)

    sessionIdRef.current    = null
    currentEventRef.current = null
    sceneEnteredAt.current  = null
  }, [supabase])

  return { startSession, trackScene, endSession }
}