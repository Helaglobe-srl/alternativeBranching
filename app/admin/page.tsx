'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Story { slug: string; title: string; subtitle: string }
interface Session {
  id: string; name: string; story_slug: string
  scene_id: string | null; voting_open: boolean
  revealed: boolean; created_at: string
}
interface Vote {
  scene_id: string; choice_id: string; choice_text: string; voted_at: string
}
interface UcbEvent {
  scene_id: string; scene_type: string; choice_text: string | null
  entered_at: string; time_on_scene: number | null
}
interface SessionDetail {
  votes: Vote[]
  events: UcbEvent[]
  scenario: { scenes: { id: string; title: string; type: string; image?: string | null; choices: { id?: string; text: string }[] }[] } | null
}

const COLORS = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e', '#7c3aed', '#b45309']

function SessionReport({ session, stories }: { session: Session; stories: Story[] }) {
  const supabase = createClient()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (detail) return // già caricato
    setLoading(true)

    // 1. Voti della sessione live
    const { data: votes } = await supabase
      .from('live_votes')
      .select('scene_id, choice_id, choice_text, voted_at')
      .eq('session_id', session.id)
      .order('voted_at', { ascending: true })

    // 2. Percorso del moderatore — via ucb_events + ucb_sessions
    //    join: ucb_sessions.user_id = live_sessions.created_by (non disponibile qui)
    //    usiamo RPC o query separata
    const { data: ucbSessions } = await supabase
      .from('ucb_sessions')
      .select('id')
      .eq('story_slug', session.story_slug)
      // Filtriamo per created_by — leggiamo live_session per avere created_by
    
    // Recupera created_by dalla sessione live
    const { data: liveSession } = await supabase
      .from('live_sessions')
      .select('created_by, created_at')
      .eq('id', session.id)
      .single()

    let events: UcbEvent[] = []
    if (liveSession?.created_by) {
      // Trova ucb_session del moderatore per questo slug in corrispondenza temporale
      const { data: modSession } = await supabase
        .from('ucb_sessions')
        .select('id')
        .eq('story_slug', session.story_slug)
        .eq('user_id', liveSession.created_by)
        .gte('started_at', new Date(new Date(liveSession.created_at).getTime() - 60000).toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      if (modSession) {
        const { data: evs } = await supabase
          .from('ucb_events')
          .select('scene_id, scene_type, choice_text, entered_at, time_on_scene')
          .eq('session_id', modSession.id)
          .order('entered_at', { ascending: true })
        events = evs ?? []
      }
    }

    // 3. Scenario JSON
    let scenario = null
    try {
      const r = await fetch(`/stories/${session.story_slug}/scenario.json`)
      scenario = await r.json()
    } catch {}

    setDetail({ votes: votes ?? [], events, scenario })
    setLoading(false)
  }, [session.id, session.story_slug, detail]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <div style={{ width: 20, height: 20, border: '2px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto' }} />
    </div>
  )

  if (!detail) return null

  const { votes, events, scenario } = detail

  // Raggruppa voti per scene_id
  const sceneIds = [...new Set(votes.map(v => v.scene_id))]
  const votesByScene = sceneIds.map(sceneId => {
    const sceneVotes = votes.filter(v => v.scene_id === sceneId)
    const scene = scenario?.scenes.find(s => s.id === sceneId)
    const total = sceneVotes.length
    const choices = (scene?.choices ?? []).map((c, i) => {
      const cid = c.id ?? String(i)
      const count = sceneVotes.filter(v => v.choice_id === cid).length
      return { text: c.text, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, color: COLORS[i % COLORS.length] }
    })
    return { sceneId, title: scene?.title ?? sceneId, total, choices }
  })

  return (
    <div style={{ padding: '0 20px 20px' }}>

      {/* Percorso moderatore */}
      {events.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9cb8c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Percorso presentazione
          </div>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            {/* Linea verticale */}
            <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'linear-gradient(to bottom, #0e88a5, #c4e0e9)', borderRadius: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map((e, i) => {
                const isDecision = e.scene_type === 'decision'
                const isEndpoint = e.scene_type === 'endpoint'
                const sceneTitle = scenario?.scenes.find(s => s.id === e.scene_id)?.title ?? e.scene_id
                const seconds = e.time_on_scene ? Math.round(e.time_on_scene / 1000) : null
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Dot */}
                    <div style={{ flexShrink: 0, width: 14, height: 14, borderRadius: '50%', marginTop: 3, background: isDecision ? '#0e88a5' : isEndpoint ? '#16803d' : '#e8f4f8', border: `2px solid ${isDecision ? '#0e88a5' : isEndpoint ? '#16803d' : '#c4e0e9'}`, zIndex: 1 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: isDecision ? 700 : 400, color: isDecision ? '#0c2a38' : '#4C7D93' }}>{sceneTitle}</span>
                        {isDecision && <span style={{ fontSize: 10, fontWeight: 700, color: '#0e88a5', background: '#e8f4f8', padding: '1px 7px', borderRadius: 20 }}>Decisione</span>}
                        {isEndpoint && <span style={{ fontSize: 10, fontWeight: 700, color: '#16803d', background: '#f0fdf4', padding: '1px 7px', borderRadius: 20 }}>Fine</span>}
                        {seconds !== null && <span style={{ fontSize: 10, color: '#9cb8c4' }}>{seconds}s</span>}
                      </div>
                      {e.choice_text && (
                        <div style={{ fontSize: 11, color: '#6b9aaa', marginTop: 2, fontStyle: 'italic' }}>→ {e.choice_text}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#f8f9fa', border: '1px solid #e8e8e8', fontSize: 12, color: '#9cb8c4' }}>
          Percorso moderatore non disponibile — assicurati che <code>user_id</code> sia stato aggiunto a <code>ucb_sessions</code>
        </div>
      )}

      {/* Voti per domanda */}
      {votesByScene.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9cb8c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Risultati votazioni
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {votesByScene.map((vs, i) => (
              <div key={i} style={{ background: '#f8fbfc', borderRadius: 12, padding: '14px 16px', border: '1px solid #e0eaee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0c2a38' }}>{vs.title}</span>
                  <span style={{ fontSize: 12, color: '#9cb8c4' }}>{vs.total} vot{vs.total === 1 ? 'o' : 'i'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {vs.choices.map((c, j) => (
                    <div key={j}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#4C7D93' }}>{c.text}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.pct}%</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: '#e0eaee', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: c.color, width: `${c.pct}%`, transition: 'width .6s cubic-bezier(0.22,1,0.36,1)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {votesByScene.length === 0 && events.length === 0 && (
        <div style={{ fontSize: 13, color: '#9cb8c4', textAlign: 'center', padding: '12px 0' }}>
          Nessun dato disponibile per questa sessione.
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [isAdmin,   setIsAdmin]   = useState(false)
  const [checking,  setChecking]  = useState(true)
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [stories,   setStories]   = useState<Story[]>([])
  const [showForm,  setShowForm]  = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newSlug,   setNewSlug]   = useState('')
  const [creating,  setCreating]  = useState(false)
  const [expanded,  setExpanded]  = useState<string | null>(null)

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('user_profiles').select('is_admin').eq('id', user.id).single()
      if (!data?.is_admin) { router.replace('/'); return }
      setIsAdmin(true)
      setChecking(false)
    }
    check()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('live_sessions').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setSessions(data ?? []))
    fetch('/stories.json').then(r => r.json()).then(setStories)
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const createSession = useCallback(async () => {
    if (!newName.trim() || !newSlug) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('live_sessions').insert({
      name: newName.trim(), story_slug: newSlug, created_by: user?.id
    }).select().single()
    setCreating(false)
    if (!error && data) router.push(`/admin/${data.id}`)
  }, [newName, newSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSession = useCallback(async (id: string) => {
    await supabase.from('live_sessions').delete().eq('id', id)
    setSessions(s => s.filter(x => x.id !== id))
    if (expanded === id) setExpanded(null)
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0eb' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <style>{`html,body{margin:0;padding:0}*{box-sizing:border-box}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ minHeight: '100vh', background: '#f5f0eb', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>

        <nav style={{ height: 56, background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(14,136,165,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/images/LOGO.webp" alt="Logo" width={90} height={26} style={{ objectFit: 'contain', height: 26, width: 'auto' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0e88a5', background: '#e8f4f8', padding: '3px 10px', borderRadius: 20 }}>Admin</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => router.push('/')} style={{ fontSize: 12, color: '#9cb8c4', background: 'none', border: 'none', cursor: 'pointer' }}>← App</button>
            <button onClick={logout} style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>Esci</button>
          </div>
        </nav>

        <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#0c2a38', letterSpacing: '-0.02em' }}>Sessioni live</h1>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b9aaa' }}>Crea e gestisci le sessioni di voto in tempo reale</p>
            </div>
            <button onClick={() => setShowForm(v => !v)}
              style={{ padding: '10px 20px', borderRadius: 10, background: '#0e88a5', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              + Nuova sessione
            </button>
          </div>

          {showForm && (
            <div style={{ background: 'white', borderRadius: 16, padding: '24px', marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', animation: 'fadeUp .2s ease', border: '1.5px solid #c4e0e9' }}>
              <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800, color: '#0c2a38' }}>Nuova sessione</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4C7D93', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Nome sessione</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="es. Congresso Neurologia Milano 2025"
                    onKeyDown={e => e.key === 'Enter' && createSession()}
                    style={{ width: '100%', padding: '10px 13px', borderRadius: 9, fontSize: 14, border: '1.5px solid #c4e0e9', outline: 'none', fontFamily: 'inherit', color: '#0c2a38' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#c4e0e9' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4C7D93', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Caso clinico</label>
                  <select value={newSlug} onChange={e => setNewSlug(e.target.value)}
                    style={{ width: '100%', padding: '10px 13px', borderRadius: 9, fontSize: 14, border: '1.5px solid #c4e0e9', outline: 'none', fontFamily: 'inherit', color: '#0c2a38', background: 'white' }}>
                    <option value="">Seleziona caso clinico…</option>
                    {stories.map(s => <option key={s.slug} value={s.slug}>{s.title}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={() => setShowForm(false)}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: '#f0f4f6', color: '#4C7D93', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Annulla
                  </button>
                  <button onClick={createSession} disabled={creating || !newName.trim() || !newSlug}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 9, background: creating || !newName.trim() || !newSlug ? '#9cb8c4' : '#0e88a5', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: creating ? 'default' : 'pointer' }}>
                    {creating ? 'Creazione…' : 'Crea e apri →'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9cb8c4', fontSize: 14 }}>
              Nessuna sessione ancora. Creane una!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sessions.map(s => {
                const isOpen = expanded === s.id
                return (
                  <div key={s.id} style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden', border: isOpen ? '1.5px solid #c4e0e9' : '1.5px solid transparent', transition: 'border-color .2s' }}>

                    {/* Header sessione */}
                    <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#0c2a38' }}>{s.name}</span>
                          {s.voting_open && <span style={{ fontSize: 10, fontWeight: 700, color: '#16803d', background: '#f0fdf4', padding: '2px 8px', borderRadius: 20, border: '1px solid #bbf7d0' }}>VOTO APERTO</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#9cb8c4' }}>
                          {s.story_slug} · {new Date(s.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {/* Toggle riepilogo */}
                        <button
                          onClick={() => {
                            const opening = expanded !== s.id
                            setExpanded(opening ? s.id : null)
                          }}
                          style={{ padding: '7px 14px', borderRadius: 8, background: isOpen ? '#e8f4f8' : '#f0f4f6', color: isOpen ? '#0e88a5' : '#4C7D93', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="8" width="3" height="5" rx="1" fill="currentColor"/>
                            <rect x="6.5" y="5" width="3" height="8" rx="1" fill="currentColor"/>
                            <rect x="11" y="2" width="3" height="11" rx="1" fill="currentColor"/>
                          </svg>
                          {isOpen ? 'Chiudi' : 'Riepilogo'}
                        </button>
                        <button onClick={() => router.push(`/admin/${s.id}`)}
                          style={{ padding: '8px 16px', borderRadius: 8, background: '#0e88a5', color: 'white', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Apri →
                        </button>
                        <button onClick={() => deleteSession(s.id)}
                          style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 12, cursor: 'pointer' }}>
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Riepilogo espandibile */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid #f0f4f6', animation: 'fadeUp .2s ease' }}>
                        <SessionReportLoader sessionId={s.id} storySlug={s.story_slug} stories={stories} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Wrapper che carica i dati al mount
function SessionReportLoader({ sessionId, storySlug, stories }: { sessionId: string; storySlug: string; stories: Story[] }) {
  const supabase = createClient()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      // 1. Voti
      const { data: votes } = await supabase
        .from('live_votes')
        .select('scene_id, choice_id, choice_text, voted_at')
        .eq('session_id', sessionId)
        .order('voted_at', { ascending: true })

      // 2. created_by della sessione live
      const { data: liveSession } = await supabase
        .from('live_sessions')
        .select('created_by, created_at')
        .eq('id', sessionId)
        .single()

      let events: UcbEvent[] = []
      if (liveSession?.created_by) {
        const { data: modSession } = await supabase
          .from('ucb_sessions')
          .select('id')
          .eq('story_slug', storySlug)
          .eq('user_id', liveSession.created_by)
          .gte('started_at', new Date(new Date(liveSession.created_at).getTime() - 60000).toISOString())
          .order('started_at', { ascending: false })
          .limit(1)
          .single()

        if (modSession) {
          const { data: evs } = await supabase
            .from('ucb_events')
            .select('scene_id, scene_type, choice_text, entered_at, time_on_scene')
            .eq('session_id', modSession.id)
            .order('entered_at', { ascending: true })
          events = evs ?? []
        }
      }

      // 3. Scenario
      let scenario = null
      try {
        const r = await fetch(`/stories/${storySlug}/scenario.json`)
        scenario = await r.json()
      } catch {}

      setDetail({ votes: votes ?? [], events, scenario })
      setLoading(false)
    }
    load()
  }, [sessionId, storySlug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <div style={{ width: 20, height: 20, border: '2px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto' }} />
    </div>
  )

  if (!detail) return null

  const { votes, events, scenario } = detail
  const sceneIds = [...new Set(votes.map(v => v.scene_id))]
  const votesByScene = sceneIds.map(sceneId => {
    const sceneVotes = votes.filter(v => v.scene_id === sceneId)
    const scene = scenario?.scenes.find((s: { id: string }) => s.id === sceneId)
    const total = sceneVotes.length
    const choices = (scene?.choices ?? []).map((c: { id?: string; text: string }, i: number) => {
      const cid = c.id ?? String(i)
      const count = sceneVotes.filter(v => v.choice_id === cid).length
      return { text: c.text, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, color: COLORS[i % COLORS.length] }
    })
    return { sceneId, title: scene?.title ?? sceneId, total, choices }
  })

  // Costruisci percorso unificato:
  // Per ogni evento, se è una scena decisionale cerca anche i voti corrispondenti
  const unifiedPath = events.map(e => {
    const sceneData = scenario?.scenes.find((s: { id: string; title: string; image?: string | null; choices?: { id?: string; text: string }[] }) => s.id === e.scene_id)
    const sceneVotes = votes.filter(v => v.scene_id === e.scene_id)
    const total = sceneVotes.length
    const choices = (sceneData?.choices ?? []).map((c: { id?: string; text: string }, i: number) => {
      const cid = c.id ?? String(i)
      const count = sceneVotes.filter(v => v.choice_id === cid).length
      return { text: c.text, cid, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, color: COLORS[i % COLORS.length] }
    })
    // Scelta del moderatore — matcha choice_text con le choices
    const modChoiceIdx = choices.findIndex(c => c.text === e.choice_text)
    return { event: e, sceneData, choices, total, modChoiceIdx }
  })

  // Scene con voti ma senza evento (moderatore non tracciato)
  const orphanVoteScenes = votesByScene.filter(vs => !events.find(e => e.scene_id === vs.sceneId))

  return (
    <div style={{ padding: '20px' }}>

      {events.length === 0 && votesByScene.length === 0 && (
        <div style={{ fontSize: 13, color: '#9cb8c4', textAlign: 'center', padding: '12px 0' }}>Nessun dato disponibile per questa sessione.</div>
      )}

      {events.length === 0 && votesByScene.length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: '#f8f9fa', border: '1px solid #e8e8e8', fontSize: 12, color: '#9cb8c4' }}>
          Percorso moderatore non disponibile — aggiorna <code>useUcbTracking</code> con <code>user_id</code> per le prossime sessioni.
        </div>
      )}

      {/* Percorso unificato */}
      {unifiedPath.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {unifiedPath.map(({ event: e, sceneData, choices, total, modChoiceIdx }, i) => {
            const isDecision = e.scene_type === 'decision'
            const isEndpoint = e.scene_type === 'endpoint'
            const sceneImage = sceneData?.image ?? null
            const sceneTitle = sceneData?.title ?? e.scene_id
            const seconds = e.time_on_scene ? Math.round(e.time_on_scene / 1000) : null
            const hasVotes = total > 0

            return (
              <div key={i} style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${isDecision ? '#0e88a5' : isEndpoint ? '#16803d' : '#e0eaee'}`, background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

                {/* Immagine + header */}
                {sceneImage ? (
                  <div style={{ position: 'relative', width: '100%', height: 160, background: '#1e2e2e', overflow: 'hidden' }}>
                    <img src={sceneImage} alt={sceneTitle} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)' }} />
                    <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        {isDecision && <span style={{ fontSize: 9, fontWeight: 700, color: 'white', background: '#0e88a5', padding: '2px 7px', borderRadius: 20 }}>Decisione</span>}
                        {isEndpoint && <span style={{ fontSize: 9, fontWeight: 700, color: 'white', background: '#16803d', padding: '2px 7px', borderRadius: 20 }}>Fine</span>}
                        {!isDecision && !isEndpoint && <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.3)', padding: '2px 7px', borderRadius: 20 }}>Info</span>}
                        {seconds !== null && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{seconds}s</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>#{i + 1}</span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{sceneTitle}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '14px 16px', background: isDecision ? '#f0f8fb' : '#fafafa', borderBottom: '1px solid #f0f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 48, height: 32, borderRadius: 6, background: '#1e2e2e', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                        <svg width="14" height="14" viewBox="0 0 64 64" fill="none"><rect x="24" y="8" width="16" height="48" rx="4" fill="#0e88a5"/><rect x="8" y="24" width="48" height="16" rx="4" fill="#0e88a5"/></svg>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: isDecision ? '#0c2a38' : '#4C7D93' }}>{sceneTitle}</span>
                      {isDecision && <span style={{ fontSize: 9, fontWeight: 700, color: '#0e88a5', background: '#e8f4f8', padding: '2px 7px', borderRadius: 20 }}>Decisione</span>}
                      {isEndpoint && <span style={{ fontSize: 9, fontWeight: 700, color: '#16803d', background: '#f0fdf4', padding: '2px 7px', borderRadius: 20 }}>Fine</span>}
                    </div>
                    <span style={{ fontSize: 10, color: '#9cb8c4' }}>#{i + 1}{seconds !== null ? ` · ${seconds}s` : ''}</span>
                  </div>
                )}

                {/* Corpo — solo per scene decisionali */}
                {isDecision && (
                  <div style={{ padding: '14px 16px' }}>

                    {/* Scelta moderatore */}
                    {e.choice_text && (
                      <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: '#0e88a5', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2"/><path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>Moderatore: {e.choice_text}</span>
                      </div>
                    )}

                    {/* Voti partecipanti */}
                    {hasVotes ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#9cb8c4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Voti partecipanti</span>
                          <span style={{ fontSize: 11, color: '#9cb8c4' }}>{total} vot{total === 1 ? 'o' : 'i'}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {choices.map((c, j) => {
                            const isModChoice = j === modChoiceIdx
                            return (
                              <div key={j} style={{ padding: '8px 10px', borderRadius: 8, background: isModChoice ? 'rgba(14,136,165,0.06)' : 'transparent', border: `1px solid ${isModChoice ? 'rgba(14,136,165,0.2)' : 'transparent'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {isModChoice && <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#0e88a5" strokeWidth="2"/><path d="M8 12l3 3 5-5" stroke="#0e88a5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                    <span style={{ fontSize: 12, color: isModChoice ? '#0c2a38' : '#4C7D93', fontWeight: isModChoice ? 700 : 400 }}>{c.text}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: '#9cb8c4' }}>{c.count}</span>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: c.color, minWidth: 36, textAlign: 'right' }}>{c.pct}%</span>
                                  </div>
                                </div>
                                <div style={{ height: 6, borderRadius: 4, background: '#e0eaee', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', borderRadius: 4, background: c.color, width: `${c.pct}%`, transition: 'width .6s cubic-bezier(0.22,1,0.36,1)' }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#9cb8c4', fontStyle: 'italic' }}>Nessun voto registrato per questa domanda.</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Scene con voti ma senza percorso moderatore */}
      {orphanVoteScenes.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9cb8c4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Risultati votazioni (percorso non disponibile)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orphanVoteScenes.map((vs, i) => (
              <div key={i} style={{ background: '#f8fbfc', borderRadius: 12, padding: '14px 16px', border: '1px solid #e0eaee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0c2a38' }}>{vs.title}</span>
                  <span style={{ fontSize: 12, color: '#9cb8c4' }}>{vs.total} vot{vs.total === 1 ? 'o' : 'i'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {vs.choices.map((c, j) => (
                    <div key={j}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: '#4C7D93' }}>{c.text}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.pct}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 4, background: '#e0eaee', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: c.color, width: `${c.pct}%`, transition: 'width .6s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}