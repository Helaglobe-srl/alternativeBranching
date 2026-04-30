'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Choice { id?: string; text: string; next?: string; tag?: string }
interface Scene  { id: string; type: string; title: string; text: string; choices: Choice[]; mode?: string; next?: string }
interface Session {
  id: string; name: string; story_slug: string; scene_id: string | null
  voting_open: boolean; revealed: boolean
  current_round: number
  reset_at: string | null
}
interface VoteCount { cid: string; text: string; tag?: string; count: number; pct: number; color: string; numVal: number }

const COLORS = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e', '#7c3aed', '#b45309']
type Phase = 'waiting' | 'voting' | 'voted' | 'revealed'

// ── Delphi helpers ─────────────────────────────────────────────────────────

const LIKERT_COLORS = (n: number, i: number): string => {
  const stops = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']
  if (n <= 1) return stops[4]
  const t = i / (n - 1)
  return stops[Math.min(Math.floor(t * (stops.length - 1)), stops.length - 2)]
}

function calcMean(votes: VoteCount[]): number {
  const total = votes.reduce((s, v) => s + v.count, 0)
  if (!total) return 0
  return votes.reduce((s, v) => s + v.numVal * v.count, 0) / total
}

function calcMedian(votes: VoteCount[]): number {
  const all: number[] = []
  votes.forEach(v => { for (let i = 0; i < v.count; i++) all.push(v.numVal) })
  if (!all.length) return 0
  all.sort((a, b) => a - b)
  const mid = Math.floor(all.length / 2)
  return all.length % 2 !== 0 ? all[mid] : (all[mid - 1] + all[mid]) / 2
}

function calcConsensus(votes: VoteCount[], n: number): { reached: boolean; label: string; color: string; pct: number } {
  const total = votes.reduce((s, v) => s + v.count, 0)
  if (!total) return { reached: false, label: 'Nessun voto', color: '#9cb8c4', pct: 0 }
  const low  = Math.ceil(n / 3)
  const high = n - Math.floor(n / 3)
  const lowPct  = votes.filter(v => v.numVal <= low).reduce((s, v) => s + v.count, 0) / total
  const midPct  = votes.filter(v => v.numVal > low && v.numVal < high).reduce((s, v) => s + v.count, 0) / total
  const highPct = votes.filter(v => v.numVal >= high).reduce((s, v) => s + v.count, 0) / total
  if (lowPct  >= 0.75) return { reached: true,  label: 'Consenso: Disaccordo', color: '#ef4444', pct: Math.round(lowPct * 100) }
  if (midPct  >= 0.75) return { reached: true,  label: 'Consenso: Neutro',     color: '#eab308', pct: Math.round(midPct * 100) }
  if (highPct >= 0.75) return { reached: true,  label: 'Consenso: Accordo',    color: '#22c55e', pct: Math.round(highPct * 100) }
  return { reached: false, label: 'Nessun consenso (< 75%)', color: '#f97316', pct: 0 }
}

function DelphiResults({ voteCounts, totalVotes, voted, n }: {
  voteCounts: VoteCount[], totalVotes: number, voted: string | null, n: number
}) {
  const mean      = calcMean(voteCounts)
  const median    = calcMedian(voteCounts)
  const consensus = calcConsensus(voteCounts, n)
  const maxPct    = Math.max(...voteCounts.map(v => v.pct), 1)
  return (
    <div style={{ animation: 'fadeUp .3s ease' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: 'white', textAlign: 'center' }}>Risultati</h2>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>{totalVotes} vot{totalVotes === 1 ? 'o' : 'i'}</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 20, background: `${consensus.color}22`, border: `1.5px solid ${consensus.color}66`, fontSize: 13, fontWeight: 700, color: consensus.color }}>
          <span style={{ fontSize: 16 }}>{consensus.reached ? '✓' : '○'}</span>
          {consensus.label}
          {consensus.reached && <span style={{ fontSize: 11, opacity: 0.8 }}>({consensus.pct}%)</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[{ label: 'Media', value: mean.toFixed(2) }, { label: 'Mediana', value: median % 1 === 0 ? String(median) : median.toFixed(1) }].map(s => (
          <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0e88a5', fontFamily: 'Georgia,serif' }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>su {n}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Distribuzione</div>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 20 }}>
          {voteCounts.map(v => (
            <div key={v.cid} style={{ flex: v.pct || 1, background: v.color, opacity: v.count ? 0.9 : 0.15, transition: 'flex 0.8s cubic-bezier(0.22,1,0.36,1)', minWidth: v.count ? 2 : 0 }} title={`${v.text}: ${v.pct}%`} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
          <span>{voteCounts[0]?.text}</span><span>{voteCounts[voteCounts.length - 1]?.text}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {voteCounts.map(v => {
          const isMyVote = voted === v.cid
          const barW = maxPct > 0 ? (v.pct / maxPct) * 100 : 0
          return (
            <div key={v.cid} style={{ background: isMyVote ? `${v.color}18` : 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '9px 12px', border: `1.5px solid ${isMyVote ? v.color : 'rgba(255,255,255,0.07)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: v.color, color: 'white', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{v.tag ?? v.cid}</span>
                <span style={{ flex: 1, fontSize: 12, color: isMyVote ? 'white' : 'rgba(255,255,255,0.55)', fontWeight: isMyVote ? 700 : 400 }}>{v.text}</span>
                {isMyVote && <span style={{ fontSize: 9, color: v.color, fontWeight: 700 }}>← il tuo</span>}
                <span style={{ fontSize: 15, fontWeight: 900, color: v.color }}>{v.pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: v.color, width: `${barW}%`, transition: 'width 1s cubic-bezier(0.22,1,0.36,1)' }} />
              </div>
              <div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{v.count} vot{v.count === 1 ? 'o' : 'i'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

  const isDelphi = scene?.mode === 'delphi'

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
  useEffect(() => {
    if (!sid) return
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

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sid) return
    const ch = supabase.channel(`vote-${sid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_votes', filter: `session_id=eq.${sid}` },
        () => setTotalVotes(v => v + 1))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sid}` },
        payload => {
          const s = payload.new as Session
          const prev = sessionRef.current
          if (prev?.reset_at !== s.reset_at) {
            setVoted(null)
            setVoteCounts([])
            setTotalVotes(0)
          }
          sessionRef.current = s
          setSession(s)
        })
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load scene ─────────────────────────────────────────────────────────────
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

  // ── Check già votato ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!sid) return
    const delay = Math.floor(Math.random() * 2000)
    const t = setTimeout(async () => {
      const { data, error } = await supabase.from('live_sessions').select('*').eq('id', sid).single()
      if (error || !data) { setNotFound(true); return }
      sessionRef.current = data
      setSession(data)
      if (data.scene_id && userId) {
        let q = supabase.from('live_votes').select('choice_id')
          .eq('session_id', sid).eq('scene_id', data.scene_id)
          .eq('user_id', userId).eq('round', data.current_round ?? 1)
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
    let query = supabase.from('live_votes').select('choice_id')
      .eq('session_id', sid).eq('scene_id', session.scene_id).eq('round', session.current_round ?? 1)
    if (session.reset_at) query = query.gte('voted_at', session.reset_at)
    const { data } = await query
    if (!data) return
    const total = data.length
    setTotalVotes(total)
    setVoteCounts(scene.choices.map((c, i) => {
      const cid    = c.id ?? String(i)
      const count  = data.filter(v => v.choice_id === cid).length
      const color  = scene.mode === 'delphi' ? LIKERT_COLORS(scene.choices.length, i) : COLORS[i % COLORS.length]
      const numVal = Number(c.tag ?? i + 1)
      return { cid, text: c.text, tag: c.tag, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, color, numVal }
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
      session_id: sid, scene_id: session.scene_id, user_id: userId,
      participant_name: userName, choice_id: cid, choice_text: choice.text,
      round: session.current_round ?? 1, reset_key: session.reset_at ?? 'initial',
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

  if (notFound) return baseLayout(<div style={{ textAlign: 'center', color: '#9cb8c4' }}><div style={{ fontSize: 48, marginBottom: 12 }}>404</div><div>Sessione non trovata</div></div>)

  if (!session || !session.scene_id) return baseLayout(
    <div style={{ textAlign: 'center', color: 'white' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid rgba(14,136,165,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse 2s infinite' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#0e88a5" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="#0e88a5" strokeWidth="2" strokeLinecap="round"/></svg>
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>In attesa della sessione</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>Il moderatore sta preparando…</div>
      {userName && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Connesso come <strong style={{ color: 'rgba(255,255,255,0.55)' }}>{userName}</strong></div>}
    </div>
  )

  const votedChoice = scene?.choices.find((c, i) => (c.id ?? String(i)) === voted)

  return baseLayout(
    <>
      {userName && <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Connesso come <strong style={{ color: 'rgba(255,255,255,0.55)' }}>{userName}</strong></div>}

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

      {/* VOTING — normale */}
      {phase === 'voting' && scene && !isDelphi && (
        <div style={{ animation: 'fadeUp .25s ease' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Vota ora</div>
            {session?.reset_at && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '4px 12px', marginBottom: 10, fontSize: 12, color: '#fbbf24' }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 1 1 2.5 8a5.5 5.5 0 0 1 11 0z" stroke="#fbbf24" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Votazione ripetuta
            </div>}
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

      {/* VOTING — Delphi */}
      {phase === 'voting' && scene && isDelphi && (
        <div style={{ animation: 'fadeUp .25s ease' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Esprimi il tuo accordo</div>
            {session?.reset_at && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '4px 12px', marginBottom: 10, fontSize: 12, color: '#fbbf24' }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 1 1 2.5 8a5.5 5.5 0 0 1 11 0z" stroke="#fbbf24" strokeWidth="1.5"/><path d="M8 5v3l2 2" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Votazione ripetuta
            </div>}
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: 'white', lineHeight: 1.3 }}>{scene.title}</h2>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, borderLeft: '3px solid rgba(14,136,165,0.5)' }}>{scene.text}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8, padding: '0 2px' }}>
            <span>← {scene.choices[0]?.text}</span>
            <span>{scene.choices[scene.choices.length - 1]?.text} →</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {scene.choices.map((c, i) => {
              const color = LIKERT_COLORS(scene.choices.length, i)
              return (
                <button key={i} onClick={() => submitVote(c, i)} disabled={submitting}
                  style={{ flex: 1, padding: '18px 4px 14px', borderRadius: 12, border: `2px solid ${color}44`, background: `${color}11`, cursor: submitting ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${color}33`; e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${color}11`; e.currentTarget.style.borderColor = `${color}44`; e.currentTarget.style.transform = 'translateY(0)' }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{c.tag ?? String(i + 1)}</span>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.2 }}>{c.text}</span>
                </button>
              )
            })}
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
          {isDelphi && votedChoice ? (
            <div style={{ marginBottom: 20 }}>
              {(() => {
                const idx = scene!.choices.findIndex((c, i) => (c.id ?? String(i)) === voted)
                const color = LIKERT_COLORS(scene!.choices.length, idx)
                return (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '14px 24px', background: `${color}18`, borderRadius: 14, border: `1.5px solid ${color}44` }}>
                    <span style={{ fontSize: 36, fontWeight: 900, color }}>{votedChoice.tag ?? voted}</span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{votedChoice.text}</span>
                  </div>
                )
              })()}
            </div>
          ) : (
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              Hai votato: <strong style={{ color: 'white' }}>{votedChoice?.text}</strong>
            </p>
          )}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', animation: 'pulse 2s infinite' }}>In attesa dei risultati…</div>
        </div>
      )}

      {/* REVEALED — normale */}
      {phase === 'revealed' && scene && !isDelphi && (
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

      {/* REVEALED — Delphi */}
      {phase === 'revealed' && scene && isDelphi && (
        <DelphiResults voteCounts={voteCounts} totalVotes={totalVotes} voted={voted} n={scene.choices.length} />
      )}
    </>
  )
}

// ULTIMA VERSIONE DELPHI RESULTS