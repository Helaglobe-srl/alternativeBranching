'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Choice { id?: string; text: string; next: string; tag?: string }
interface Scene  { id: string; type: string; title: string; text: string; choices: Choice[] }
interface Session {
  id: string; name: string; story_slug: string; scene_id: string | null
  voting_open: boolean; revealed: boolean
  current_round: number
  reset_at: string | null  // ← aggiunto
}
interface VoteCount { cid: string; text: string; tag?: string; count: number; pct: number; color: string }

const COLORS = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e', '#7c3aed', '#b45309']
type Phase = 'waiting' | 'voting' | 'voted' | 'revealed'

export default function VotePage() {
  const params   = useParams()
  const router   = useRouter()
  const sid      = params?.id as string
  const supabase = createClient()

  const [session,    setSession]    = useState<Session | null>(null)
  const [scene,      setScene]      = useState<Scene | null>(null)
  const [userId,     setUserId]     = useState<string | null>(null)
  const [userName,   setUserName]   = useState('')
  const [phase,      setPhase]      = useState<Phase>('waiting')
  const [voted,      setVoted]      = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [voteCounts, setVoteCounts] = useState<VoteCount[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [notFound,   setNotFound]   = useState(false)
  const [checking,   setChecking]   = useState(true)

  const sessionRef = useRef<Session | null>(null)

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace(`/join/${sid}`); return }
      setUserId(user.id)
      setUserName(user.user_metadata?.full_name || user.email || '')
      setChecking(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load session ───────────────────────────────────────────────────────────
  // ── Load session ───────────────────────────────────────────────────────────
useEffect(() => {
  if (!sid) return
  // Delay random 0-2s per distribuire il carico al login simultaneo
  const delay = Math.floor(Math.random() * 2000)
  const t = setTimeout(() => {
    supabase.from('live_sessions').select('*').eq('id', sid).single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return }
        sessionRef.current = data
        setSession(data)
      })
  }, delay)
  return () => clearTimeout(t)
}, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime + polling silenzioso ──────────────────────────────────────────
  useEffect(() => {
    if (!sid) return
    const ch = supabase.channel(`vote-${sid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'live_votes',
        filter: `session_id=eq.${sid}`
      }, () => setTotalVotes(v => v + 1))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_sessions',
        filter: `id=eq.${sid}`
      }, payload => {
        const s = payload.new as Session
        const prev = sessionRef.current
        // Se reset_at è cambiato, permetti di rivotare
        if (prev?.reset_at !== s.reset_at) {
          setVoted(null)
          setVoteCounts([])
          setTotalVotes(0)
        }
        sessionRef.current = s
        setSession(s)
      })
      .subscribe()

    // Polling silenzioso — aggiorna solo se cambiano campi rilevanti
return () => { ch.unsubscribe() }      
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load scene quando scene_id o reset_at cambia ──────────────────────────
  useEffect(() => {
    if (!session?.story_slug || !session?.scene_id) return
    setVoted(null)
    setVoteCounts([])
    setTotalVotes(0)
    fetch(`/stories/${session.story_slug}/scenario.json`)
      .then(r => r.json())
      .then(d => {
        const s = d.scenes.find((x: Scene) => x.id === session.scene_id)
        setScene(s ?? null)
      })
  }, [session?.scene_id, session?.current_round, session?.reset_at]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check se ha già votato (dopo reset_at) ────────────────────────────────
  useEffect(() => {
  if (!sid) return
  const delay = Math.floor(Math.random() * 2000)
  const t = setTimeout(async () => {
    const { data, error } = await supabase
      .from('live_sessions').select('*').eq('id', sid).single()
    if (error || !data) { setNotFound(true); return }
    sessionRef.current = data
    setSession(data)

    // Check "già votato" inline — evita un useEffect separato
    if (data.scene_id && userId) {
      let q = supabase.from('live_votes')
        .select('choice_id')
        .eq('session_id', sid)
        .eq('scene_id', data.scene_id)
        .eq('user_id', userId)
        .eq('round', data.current_round ?? 1)
      if (data.reset_at) q = q.gte('voted_at', data.reset_at)
      q.single().then(({ data: v }) => { if (v) setVoted(v.choice_id) })
    }
  }, delay)
  return () => clearTimeout(t)
}, [sid, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync phase ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return
    if (session.revealed)                   setPhase('revealed')
    else if (session.voting_open && !voted) setPhase('voting')
    else if (session.voting_open && voted)  setPhase('voted')
    else                                    setPhase('waiting')
  }, [session?.voting_open, session?.revealed, session?.scene_id, session?.reset_at, voted])

  // ── Vote counts ────────────────────────────────────────────────────────────
  const loadVoteCounts = useCallback(async () => {
    if (!sid || !scene || !session?.scene_id) return
    let query = supabase.from('live_votes')
      .select('choice_id')
      .eq('session_id', sid)
      .eq('scene_id', session.scene_id)
      .eq('round', session.current_round ?? 1)
    if (session.reset_at) query = query.gte('voted_at', session.reset_at)
    const { data } = await query
    if (!data) return
    const total = data.length
    setTotalVotes(total)
    setVoteCounts(scene.choices.map((c, i) => {
      const cid   = c.id ?? String(i)
      const count = data.filter(v => v.choice_id === cid).length
      return { cid, text: c.text, tag: c.tag, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, color: COLORS[i % COLORS.length] }
    }))
  }, [sid, scene, session?.scene_id, session?.current_round, session?.reset_at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadVoteCounts() }, [loadVoteCounts])
  useEffect(() => { if (totalVotes > 0) loadVoteCounts() }, [totalVotes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit voto ────────────────────────────────────────────────────────────
  const submitVote = useCallback(async (choice: Choice, idx: number) => {
    if (submitting || voted || !userId || !session?.scene_id) return
    setSubmitting(true)
    const cid = choice.id ?? String(idx)
    const { error } = await supabase.from('live_votes').insert({
      session_id:       sid,
      scene_id:         session.scene_id,
      user_id:          userId,
      participant_name: userName,
      choice_id:        cid,
      choice_text:      choice.text,
      round:            session.current_round ?? 1,
      reset_key:        session.reset_at ?? 'initial',  // ← chiave unica per ciclo
    })
    setSubmitting(false)
    if (!error) { setVoted(cid); setPhase('voted') }
  }, [submitting, voted, userId, userName, sid, session?.scene_id, session?.current_round]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────────────────
  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c1a2a' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const baseLayout = (children: React.ReactNode) => (
    <>
      <style>{`html,body{margin:0;padding:0}*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0c1a2a,#0e2a3a)', fontFamily: "'Segoe UI',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <Image src="/images/LOGO.webp" alt="Logo" width={80} height={22} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.7 }} />
          {session && <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{session.name}</div>}
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
          <div style={{ width: '100%', maxWidth: 480 }}>{children}</div>
        </div>
      </div>
    </>
  )

  if (notFound) return baseLayout(
    <div style={{ textAlign: 'center', color: '#9cb8c4' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>404</div>
      <div>Sessione non trovata</div>
    </div>
  )

  if (!session || !session.scene_id) return baseLayout(
    <div style={{ textAlign: 'center', color: 'white' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid rgba(14,136,165,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse 2s infinite' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#0e88a5" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="#0e88a5" strokeWidth="2" strokeLinecap="round"/></svg>
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>In attesa della sessione</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>Il moderatore sta preparando il caso clinico…</div>
      {userName && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Connesso come <strong style={{ color: 'rgba(255,255,255,0.55)' }}>{userName}</strong></div>}
    </div>
  )

  return baseLayout(
    <>
      {userName && (
        <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
          Connesso come <strong style={{ color: 'rgba(255,255,255,0.55)' }}>{userName}</strong>
        </div>
      )}

      {/* WAITING */}
      {phase === 'waiting' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(14,136,165,0.2)', border: '2px solid rgba(14,136,165,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse 2s infinite' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#0e88a5" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="#0e88a5" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>In attesa del voto</h2>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Il moderatore aprirà il voto a breve…</p>
          {session?.reset_at && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#fbbf24' }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 1 1 2.5 8a5.5 5.5 0 0 1 11 0z" stroke="#fbbf24" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Questa domanda ha già avuto una votazione precedente
            </div>
          )}
        </div>
      )}

      {/* VOTING */}
      {phase === 'voting' && scene && (
        <div style={{ animation: 'fadeUp .25s ease' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Vota ora</div>
            {session?.reset_at && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '4px 12px', marginBottom: 10, fontSize: 12, color: '#fbbf24' }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 1 1 2.5 8a5.5 5.5 0 0 1 11 0z" stroke="#fbbf24" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Votazione ripetuta — una risposta precedente era già stata raccolta
              </div>
            )}
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{scene.title}</h2>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{scene.text}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {scene.choices.map((c, i) => (
              <button key={i} onClick={() => submitVote(c, i)} disabled={submitting}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', cursor: submitting ? 'default' : 'pointer', textAlign: 'left', transition: 'all .15s', color: 'white' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,136,165,0.2)'; e.currentTarget.style.borderColor = '#0e88a5' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}>
                {c.tag && <span style={{ width: 28, height: 28, borderRadius: 8, background: COLORS[i % COLORS.length], color: 'white', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.tag}</span>}
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{c.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* VOTED */}
      {phase === 'voted' && (
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,128,61,0.2)', border: '2px solid rgba(16,128,61,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>Voto inviato!</h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
            Hai votato: <strong style={{ color: 'white' }}>{scene?.choices.find((c, i) => (c.id ?? String(i)) === voted)?.text}</strong>
          </p>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', animation: 'pulse 2s infinite' }}>In attesa dei risultati…</div>
        </div>
      )}

      {/* REVEALED */}
      {phase === 'revealed' && scene && (
        <div style={{ animation: 'fadeUp .3s ease' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: 'white', textAlign: 'center' }}>Risultati</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {voteCounts.map((c, i) => (
              <div key={i} style={{ background: voted === c.cid ? 'rgba(14,136,165,0.15)' : 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px', border: `1.5px solid ${voted === c.cid ? '#0e88a5' : 'rgba(255,255,255,0.08)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.tag && <span style={{ width: 24, height: 24, borderRadius: 6, background: c.color, color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.tag}</span>}
                    <span style={{ fontSize: 13, color: 'white', fontWeight: voted === c.cid ? 700 : 400 }}>{c.text}</span>
                    {voted === c.cid && <span style={{ fontSize: 10, color: '#0e88a5', fontWeight: 700 }}>← il tuo voto</span>}
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 900, color: c.color }}>{c.pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: c.color, width: `${c.pct}%`, transition: 'width 1s cubic-bezier(0.22,1,0.36,1)' }} />
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>{c.count} vot{c.count === 1 ? 'o' : 'i'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{totalVotes} partecipant{totalVotes === 1 ? 'e' : 'i'} totali</div>
        </div>
      )}
    </>
  )
}