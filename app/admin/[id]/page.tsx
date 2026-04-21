'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Choice { id?: string; text: string; next: string; tag?: string }
interface Scene { id: string; type: string; title: string; text: string; image?: string | null; choices: Choice[] }
interface ScenarioData { title: string; scenes: Scene[] }
interface Session {
  id: string; name: string; story_slug: string; scene_id: string | null
  voting_open: boolean; revealed: boolean
  current_round: number; reset_at: string | null; created_by: string | null
  created_at: string
}
interface Vote { choice_id: string; choice_text: string; participant_name: string; scene_id: string; round?: number; voted_at?: string }
interface UcbEvent { scene_id: string; scene_type: string; choice_text: string | null; entered_at: string; time_on_scene: number | null }

const COLORS = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e', '#7c3aed', '#b45309']
const TAG_BG = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e']

export default function AdminSessionPage() {
  const router = useRouter()
  const params = useParams()
  const sid = params?.id as string
  const supabase = createClient()

  const [session, setSession] = useState<Session | null>(null)
  const [scenario, setScenario] = useState<ScenarioData | null>(null)
  const [votes, setVotes] = useState<Vote[]>([])
  const [events, setEvents] = useState<UcbEvent[]>([])
  const [checking, setChecking] = useState(true)
  const [imgError, setImgError] = useState(false)
  const [selectedSlide, setSelectedSlide] = useState(0)
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase.from('user_profiles').select('is_admin').eq('id', user.id).single()
      if (!data?.is_admin) { router.replace('/'); return }
      setChecking(false)
    }
    check()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (checking || !sid) return
    supabase.from('live_sessions').select('*').eq('id', sid).single()
      .then(({ data }) => { if (data) setSession(data) })
  }, [checking, sid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) return
    fetch(`/stories/${session.story_slug}/scenario.json`).then(r => r.json()).then(setScenario)
  }, [session?.story_slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sid) return
    supabase.from('live_votes').select('*').eq('session_id', sid)
      .then(({ data }) => setVotes(data ?? []))
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session?.created_by || !session?.story_slug || !session?.created_at) return
    const loadEvents = async () => {
      const { data: modSession } = await supabase
        .from('ucb_sessions').select('id')
        .eq('story_slug', session.story_slug)
        .eq('user_id', session.created_by!)
        .gte('started_at', new Date(new Date(session.created_at).getTime() - 60000).toISOString())
        .order('started_at', { ascending: false })
        .limit(1).single()
      if (modSession) {
        const { data: evs } = await supabase.from('ucb_events')
          .select('scene_id, scene_type, choice_text, entered_at, time_on_scene')
          .eq('session_id', modSession.id)
          .order('entered_at', { ascending: true })
        setEvents(evs ?? [])
      }
    }
    loadEvents()
  }, [session?.created_by, session?.story_slug, session?.created_at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sid) return
    const ch = supabase.channel(`admin-${sid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_votes', filter: `session_id=eq.${sid}` },
        payload => setVotes(v => [...v, payload.new as Vote]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sid}` },
        payload => {
          const s = payload.new as Session
          if (session && s.reset_at !== session.reset_at) setVotes([])
          setSession(s)
        })
      .subscribe()
    subRef.current = ch
    return () => { ch.unsubscribe() }
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setImgError(false) }, [session?.scene_id])

  if (checking || !session) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0eb' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const currentVotes = votes.filter(v =>
    session.reset_at ? (v.voted_at ?? '') >= session.reset_at : (v.round ?? 1) === (session.current_round ?? 1)
  )
  const totalVotes = currentVotes.length

  const decisionScenes = scenario?.scenes.filter(s => s.type === 'decision') ?? []

  const recapSlides = events.length > 0
    ? events.map(e => {
      const sceneData = scenario?.scenes.find(s => s.id === e.scene_id)
      const sceneVotes = votes.filter(v => v.scene_id === e.scene_id)
      const total = sceneVotes.length
      const choices = (sceneData?.choices ?? []).map((c, i) => {
        const cid = c.id ?? String(i)
        const count = sceneVotes.filter(v => v.choice_id === cid).length
        return { text: c.text, tag: c.tag, cid, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, color: COLORS[i % COLORS.length] }
      })
      return { event: e, sceneData, choices, total }
    })
    : decisionScenes.map(s => {
      const sceneVotes = votes.filter(v => v.scene_id === s.id)
      const total = sceneVotes.length
      const choices = (s.choices ?? []).map((c, i) => {
        const cid = c.id ?? String(i)
        const count = sceneVotes.filter(v => v.choice_id === cid).length
        return { text: c.text, tag: c.tag, cid, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, color: COLORS[i % COLORS.length] }
      })
      return { event: null, sceneData: s, choices, total }
    })

  const currentSlide = recapSlides[selectedSlide]

  return (
    <>
      <style>{`
        html,body{margin:0;padding:0;height:100%;overflow:hidden}
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(14,136,165,0.3);border-radius:4px}
      `}</style>

      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#eae5de', fontFamily: "'Segoe UI',system-ui,sans-serif", overflow: 'hidden' }}>

        {/* Navbar */}
        <nav style={{ flexShrink: 0, height: 48, background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(14,136,165,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 50, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/admin')} style={{ color: '#9cb8c4', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>← Admin</button>
            <span style={{ color: '#0c2a38', fontSize: 14, fontWeight: 700 }}>{session.name}</span>
            {session.voting_open && <span style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(74,222,128,0.3)' }}>VOTO APERTO</span>}
            {session.revealed && <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(251,191,36,0.3)' }}>RIVELATO</span>}
          </div>
          <span style={{ fontSize: 12, color: '#9cb8c4' }}>{totalVotes} vot{totalVotes === 1 ? 'o' : 'i'}</span>
        </nav>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>

          {/* SIDEBAR — miniature */}
          <div style={{ width: 240, flexShrink: 0, background: 'white', borderRight: '1px solid rgba(14,136,165,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '14px 12px', gap: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9cb8c4', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              {recapSlides.length} scene
            </div>
            {recapSlides.map((slide, i) => {
              const isDecision = (slide.event?.scene_type ?? slide.sceneData?.type) === 'decision'
              const isEndpoint = (slide.event?.scene_type ?? slide.sceneData?.type) === 'endpoint'
              const img = slide.sceneData?.image ?? null
              const title = slide.sceneData?.title ?? slide.event?.scene_id ?? `Scena ${i + 1}`
              const isSelected = selectedSlide === i
              return (
                <button key={i} onClick={() => setSelectedSlide(i)}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${isSelected ? '#0e88a5' : 'transparent'}`, background: isSelected ? '#e8f4f8' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                  <div style={{ flexShrink: 0, width: 52, height: 34, borderRadius: 5, overflow: 'hidden', background: '#1e2e2e', position: 'relative' }}>
                    {img
                      ? <img src={img} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
                        <svg width="12" height="12" viewBox="0 0 64 64" fill="none"><rect x="24" y="8" width="16" height="48" rx="4" fill="#0e88a5" /><rect x="8" y="24" width="48" height="16" rx="4" fill="#0e88a5" /></svg>
                      </div>
                    }
                    <div style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 7, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{i + 1}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: isSelected ? 700 : 400, color: isSelected ? '#0c2a38' : '#6b9aaa', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                      {isDecision && <span style={{ fontSize: 8, color: '#0e88a5', background: 'rgba(14,136,165,0.2)', padding: '1px 4px', borderRadius: 4 }}>Decisione</span>}
                      {isEndpoint && <span style={{ fontSize: 8, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '1px 4px', borderRadius: 4 }}>Fine</span>}
                      {slide.total > 0 && <span style={{ fontSize: 8, color: '#9cb8c4' }}>{slide.total} voti</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* MAIN */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {recapSlides.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9cb8c4', fontSize: 14 }}>
                Nessun dato disponibile — avvia una sessione per vedere il riepilogo.
              </div>
            ) : !currentSlide ? null : (() => {
              const slide = currentSlide
              const sceneType = slide.event?.scene_type ?? slide.sceneData?.type ?? 'info'
              const isDecision = sceneType === 'decision'
              const isEndpoint = sceneType === 'endpoint'
              const img = slide.sceneData?.image ?? null
              const title = slide.sceneData?.title ?? `Scena ${selectedSlide + 1}`
              const text = slide.sceneData?.text ?? ''
              // choice_text è nella scena SUCCESSIVA — è la scelta fatta per uscire dalla scena corrente
              const slideIdx = selectedSlide
              const nextEvent = recapSlides[slideIdx + 1]?.event ?? null
              const modChoice = nextEvent?.choice_text ?? slide.event?.choice_text ?? null
              const seconds = slide.event?.time_on_scene ? Math.round(slide.event.time_on_scene / 1000) : null
              const modChoiceIdx = slide.choices.findIndex(c => c.text === modChoice)

              return (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeUp .2s ease' }}>

                  {/* Slide principale */}
                  <div style={{ flex: isDecision ? '0 0 auto' : 1, display: 'flex', minHeight: 0, maxHeight: isDecision ? '55%' : '100%' }}>
                    {/* Immagine */}
                    {img && (
                      <div style={{ width: '55%', flexShrink: 0, position: 'relative', background: '#1e2e2e', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,0.25) 100%)', zIndex: 1 }} />
                        <img src={img} alt={title} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }} />
                        <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 2, display: 'flex', gap: 6 }}>
                          <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', fontSize: 9.5, fontWeight: 700, color: isDecision ? '#0e88a5' : isEndpoint ? '#16803d' : '#4C7D93', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {isDecision ? 'Decisione' : isEndpoint ? 'Fine' : 'Info'}
                          </span>
                          {seconds !== null && <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', fontSize: 9.5, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{seconds}s</span>}
                        </div>
                        <div style={{ position: 'absolute', bottom: 12, left: 16, right: 16, zIndex: 2 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.6)', lineHeight: 1.2 }}>{title}</div>
                        </div>
                      </div>
                    )}
                    {/* Testo */}
                    <div style={{ flex: 1, background: 'white', borderLeft: img ? '3px solid #0e88a5' : 'none', overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {!img && (
                        <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 5, background: isDecision ? '#e8f4f8' : '#f0f4f6', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isDecision ? '#0e88a5' : '#6b9aaa' }}>
                          {isDecision ? 'Decisione' : isEndpoint ? 'Fine' : 'Info'}
                        </span>
                      )}
                      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0c2a38', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</h2>
                      <div style={{ height: 1, background: 'linear-gradient(to right,rgba(14,136,165,0.2),transparent)' }} />
                      <p style={{ margin: 0, fontSize: 13, color: '#4C7D93', lineHeight: 1.7, flex: 1 }}>{text}</p>
                      {modChoice && (
                        <div style={{ padding: '9px 12px', borderRadius: 8, background: '#0e88a5', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" /><path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>Moderatore: {modChoice}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Voti */}
                  {isDecision && slide.choices.length > 0 && (
                    <div style={{ background: '#f8fbfc', borderTop: '1px solid #e0eaee', overflowY: 'auto', padding: '14px 24px', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9cb8c4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Voti partecipanti</span>
                        <span style={{ fontSize: 11, color: '#9cb8c4' }}>{slide.total} vot{slide.total === 1 ? 'o' : 'i'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {slide.choices.map((c, j) => {
                          const isModChoice = j === modChoiceIdx
                          return (
                            <div key={j} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 12px', borderRadius: 8, background: isModChoice ? 'rgba(14,136,165,0.08)' : 'white', border: `1px solid ${isModChoice ? 'rgba(14,136,165,0.25)' : '#e8eaee'}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                                {isModChoice && <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#0e88a5" strokeWidth="2" /><path d="M8 12l3 3 5-5" stroke="#0e88a5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                {c.tag && <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 5, background: TAG_BG[j % TAG_BG.length], color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.tag}</span>}
                                <span style={{ fontSize: 12.5, color: isModChoice ? '#0c2a38' : '#4C7D93', fontWeight: isModChoice ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.text}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 160 }}>
                                <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#e0eaee', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', borderRadius: 4, background: c.color, width: `${c.pct}%`, transition: 'width .6s cubic-bezier(0.22,1,0.36,1)' }} />
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 800, color: c.color, minWidth: 36, textAlign: 'right' }}>{c.pct}%</span>
                                <span style={{ fontSize: 11, color: '#9cb8c4', minWidth: 20 }}>{c.count}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Navigazione */}
                  <div style={{ flexShrink: 0, height: 44, background: 'white', borderTop: '1px solid rgba(14,136,165,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                    <button onClick={() => setSelectedSlide(i => Math.max(0, i - 1))} disabled={selectedSlide === 0}
                      style={{ width: 32, height: 32, borderRadius: 8, background: selectedSlide === 0 ? '#f0f4f6' : '#e8f4f8', border: '1px solid #c4e0e9', color: selectedSlide === 0 ? '#ccc' : '#0e88a5', cursor: selectedSlide === 0 ? 'default' : 'pointer', fontSize: 16 }}>‹</button>
                    <span style={{ fontSize: 12, color: '#9cb8c4', minWidth: 60, textAlign: 'center' }}>{selectedSlide + 1} / {recapSlides.length}</span>
                    <button onClick={() => setSelectedSlide(i => Math.min(recapSlides.length - 1, i + 1))} disabled={selectedSlide === recapSlides.length - 1}
                      style={{ width: 32, height: 32, borderRadius: 8, background: selectedSlide === recapSlides.length - 1 ? '#f0f4f6' : '#e8f4f8', border: '1px solid #c4e0e9', color: selectedSlide === recapSlides.length - 1 ? '#ccc' : '#0e88a5', cursor: selectedSlide === recapSlides.length - 1 ? 'default' : 'pointer', fontSize: 16 }}>›</button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </>
  )
}