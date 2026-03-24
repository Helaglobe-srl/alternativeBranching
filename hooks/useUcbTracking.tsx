// hooks/useUcbTracking.ts
// Gestisce la creazione della sessione e il logging degli eventi su Supabase.
// Usato da GamePage — non ha dipendenze esterne oltre a @supabase/supabase-js.

import { useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface StartSessionParams {
  username: string
  storySlug: string
}

interface TrackSceneParams {
  sceneId: string
  sceneType: string
  choiceText?: string  // testo del bottone cliccato per arrivare a questa scena
}

export function useUcbTracking() {
  const sessionIdRef    = useRef<string | null>(null)
  const currentEventRef = useRef<string | null>(null)   // id dell'evento corrente (per aggiornare time_on_scene)
  const sceneEnteredAt  = useRef<number | null>(null)   // Date.now() quando si è entrati nella scena corrente
  const supabase        = createClient()

  // ── Avvia una nuova sessione ─────────────────────────────────────────────
  const startSession = useCallback(async ({ username, storySlug }: StartSessionParams) => {
    const { data, error } = await supabase
      .from('ucb_sessions')
      .insert({ username, story_slug: storySlug })
      .select('id')
      .single()

    if (error) {
      console.error('[UCB] startSession error:', error)
      return
    }

    sessionIdRef.current = data.id
    console.log('[UCB] session started:', data.id)
  }, [supabase])

  // ── Traccia l'ingresso in una scena ─────────────────────────────────────
  // Chiamato ogni volta che si naviga a una nuova scena.
  // Prima aggiorna il time_on_scene della scena precedente, poi inserisce la nuova.
  const trackScene = useCallback(async ({ sceneId, sceneType, choiceText }: TrackSceneParams) => {
    if (!sessionIdRef.current) return

    const now = Date.now()

    // 1. Chiudi la scena precedente: scrivi il tempo trascorso
    if (currentEventRef.current && sceneEnteredAt.current) {
      const timeOnScene = now - sceneEnteredAt.current
      await supabase
        .from('ucb_events')
        .update({ time_on_scene: timeOnScene })
        .eq('id', currentEventRef.current)
    }

    // 2. Inserisci la nuova scena
    const { data, error } = await supabase
      .from('ucb_events')
      .insert({
        session_id:  sessionIdRef.current,
        scene_id:    sceneId,
        scene_type:  sceneType,
        choice_text: choiceText ?? null,
        entered_at:  new Date(now).toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.error('[UCB] trackScene error:', error)
      return
    }

    currentEventRef.current = data.id
    sceneEnteredAt.current  = now
  }, [supabase])

  // ── Chiudi la sessione ───────────────────────────────────────────────────
  // Chiamato quando l'utente raggiunge un endpoint o lascia la pagina.
  const endSession = useCallback(async (completed: boolean) => {
    if (!sessionIdRef.current) return

    // Chiudi l'ultimo evento
    if (currentEventRef.current && sceneEnteredAt.current) {
      const timeOnScene = Date.now() - sceneEnteredAt.current
      await supabase
        .from('ucb_events')
        .update({ time_on_scene: timeOnScene })
        .eq('id', currentEventRef.current)
    }

    // Chiudi la sessione
    await supabase
      .from('ucb_sessions')
      .update({ ended_at: new Date().toISOString(), completed })
      .eq('id', sessionIdRef.current)

    console.log('[UCB] session ended, completed:', completed)

    // Reset refs
    sessionIdRef.current    = null
    currentEventRef.current = null
    sceneEnteredAt.current  = null
  }, [supabase])

  return { startSession, trackScene, endSession }
}