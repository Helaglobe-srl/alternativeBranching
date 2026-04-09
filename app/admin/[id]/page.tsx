'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'

interface Choice { id?: string; text: string; next: string; tag?: string }
interface Scene  { id: string; type: string; title: string; text: string; image?: string | null; choices: Choice[] }
interface ScenarioData { title: string; scenes: Scene[] }
interface Session {
  id: string; name: string; story_slug: string; scene_id: string | null
  voting_open: boolean; revealed: boolean
}
interface Vote { choice_id: string; choice_text: string; participant_name: string }

const COLORS = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e', '#7c3aed', '#b45309']

export default function AdminSessionPage() {
  const router   = useRouter()
  const params   = useParams()
  const sid      = params?.id as string
  const supabase = createClient()

  const [session,  setSession]  = useState<Session | null>(null)
  const [scenario, setScenario] = useState<ScenarioData | null>(null)
  const [votes,    setVotes]    = useState<Vote[]>([])
  const [qrUrl,    setQrUrl]    = useState('')
  const [checking, setChecking] = useState(true)
  const [copied,   setCopied]   = useState(false)
  const subRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const voteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${sid}`
    : ''

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('user_profiles').select('is_admin').eq('id', user.id).single()
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
    fetch(`/stories/${session.story_slug}/scenario.json`)
      .then(r => r.json()).then(setScenario)
  }, [session?.story_slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sid) return
    supabase.from('live_votes').select('*').eq('session_id', sid)
      .then(({ data }) => setVotes(data ?? []))
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sid) return
    const ch = supabase.channel(`admin-${sid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_votes', filter: `session_id=eq.${sid}` },
        payload => setVotes(v => [...v, payload.new as Vote])
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sid}` },
        payload => setSession(payload.new as Session)
      )
      .subscribe()
    subRef.current = ch
    return () => { ch.unsubscribe() }
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!voteUrl) return
    QRCode.toDataURL(voteUrl, { width: 300, margin: 2, color: { dark: '#0c2a38', light: '#ffffff' } })
      .then(setQrUrl)
  }, [voteUrl])

  const setSceneId = useCallback(async (sceneId: string) => {
    await supabase.from('live_sessions').update({
      scene_id: sceneId, voting_open: false, revealed: false
    }).eq('id', sid)
    setVotes([])
    await supabase.from('live_votes').delete().eq('session_id', sid)
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const openVoting = useCallback(async () => {
    await supabase.from('live_sessions').update({ voting_open: true, revealed: false }).eq('id', sid)
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeVoting = useCallback(async () => {
    await supabase.from('live_sessions').update({ voting_open: false }).eq('id', sid)
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = useCallback(async () => {
    await supabase.from('live_sessions').update({ revealed: true, voting_open: false }).eq('id', sid)
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetVotes = useCallback(async () => {
    await supabase.from('live_votes').delete().eq('session_id', sid)
    await supabase.from('live_sessions').update({ voting_open: false, revealed: false }).eq('id', sid)
    setVotes([])
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyLink = () => {
    navigator.clipboard.writeText(voteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (checking || !session) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0eb' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const currentScene = scenario?.scenes.find(s => s.id === session.scene_id)
  const decisionScenes = scenario?.scenes.filter(s => s.type === 'decision') ?? []
  const totalVotes = votes.length

  const voteCounts = (currentScene?.choices ?? []).map((c, i) => {
    const cid = c.id ?? String(i)
    const count = votes.filter(v => v.choice_id === cid).length
    const pct   = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
    return { ...c, cid, count, pct, color: COLORS[i % COLORS.length] }
  })

  return (
    <>
      <style>{`
        html,body{margin:0;padding:0}*{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ minHeight: '100vh', background: '#f5f0eb', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>

        <nav style={{ height: 52, background: '#0c2a38', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/admin')} style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>← Admin</button>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{session.name}</span>
            {session.voting_open && <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(74,222,128,0.3)' }}>VOTO APERTO</span>}
            {session.revealed && <span style={{ fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(251,191,36,0.3)' }}>RISULTATI RIVELATI</span>}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{totalVotes} vot{totalVotes === 1 ? 'o' : 'i'}</div>
        </nav>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, height: 'calc(100vh - 52px)' }}>

          {/* SIDEBAR */}
          <div style={{ background: '#0e1a2a', overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: 'white', borderRadius: 14, padding: '16px', textAlign: 'center' }}>
              {qrUrl && <img src={qrUrl} alt="QR" style={{ width: '100%', borderRadius: 8 }} />}
              <div style={{ fontSize: 10, color: '#9cb8c4', marginTop: 8, wordBreak: 'break-all', lineHeight: 1.4 }}>{voteUrl}</div>
              <button onClick={copyLink} style={{ marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 8, background: copied ? '#f0fdf4' : '#e8f4f8', color: copied ? '#16803d' : '#0e88a5', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {copied ? '✓ Copiato!' : 'Copia link'}
              </button>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Scene decisionali</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {decisionScenes.map(s => (
                  <button key={s.id} onClick={() => setSceneId(s.id)}
                    style={{ padding: '9px 12px', borderRadius: 8, background: session.scene_id === s.id ? '#0e88a5' : 'rgba(255,255,255,0.06)', color: session.scene_id === s.id ? 'white' : 'rgba(255,255,255,0.65)', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: session.scene_id === s.id ? 700 : 400, transition: 'all .15s' }}>
                    {s.title}
                  </button>
                ))}
              </div>
            </div>

            {session.scene_id && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Controlli voto</div>
                {!session.voting_open && !session.revealed && (
                  <button onClick={openVoting} style={{ padding: '10px', borderRadius: 8, background: '#16803d', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>▶ Apri voto</button>
                )}
                {session.voting_open && (
                  <button onClick={closeVoting} style={{ padding: '10px', borderRadius: 8, background: '#b45309', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>■ Chiudi voto</button>
                )}
                {!session.voting_open && !session.revealed && totalVotes > 0 && (
                  <button onClick={reveal} style={{ padding: '10px', borderRadius: 8, background: '#0e88a5', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>★ Rivela risultati</button>
                )}
                {totalVotes > 0 && (
                  <button onClick={resetVotes} style={{ padding: '8px', borderRadius: 8, background: 'rgba(220,38,38,0.15)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.3)', fontSize: 12, cursor: 'pointer' }}>Reset voti</button>
                )}
              </div>
            )}
          </div>

          {/* MAIN */}
          <div style={{ overflowY: 'auto', padding: '32px' }}>
            {!session.scene_id ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16, color: '#9cb8c4' }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="8" y="14" width="32" height="24" rx="4" stroke="#9cb8c4" strokeWidth="2"/><path d="M16 14V12a2 2 0 012-2h12a2 2 0 012 2v2" stroke="#9cb8c4" strokeWidth="2"/></svg>
                <span style={{ fontSize: 15 }}>Seleziona una scena decisionale dalla sidebar</span>
              </div>
            ) : !currentScene ? (
              <div style={{ color: '#9cb8c4', fontSize: 14 }}>Scena non trovata</div>
            ) : (
              <div style={{ maxWidth: 680, margin: '0 auto', animation: 'fadeUp .3s ease' }}>

                {/* Scene header */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Scena decisionale</div>
                  <h2 style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 900, color: '#0c2a38', letterSpacing: '-0.02em' }}>{currentScene.title}</h2>

                  {/* IMMAGINE SCENA — nuova */}
                  {currentScene.image && (
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', marginBottom: 12, background: 'linear-gradient(135deg,#1e2e2e,#243535)' }}>
                      <Image
                        src={currentScene.image}
                        alt={currentScene.title}
                        fill
                        sizes="680px"
                        style={{ objectFit: 'contain', objectPosition: 'center' }}
                      />
                    </div>
                  )}

                  <div style={{ padding: '12px 16px', background: 'white', borderRadius: 10, fontSize: 13, color: '#4C7D93', lineHeight: 1.6, borderLeft: '3px solid #0e88a5' }}>
                    {currentScene.text}
                  </div>
                </div>

                {/* Vote stats */}
                <div style={{ background: 'white', borderRadius: 16, padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0c2a38' }}>Risultati</span>
                    {/* SOLO CONTATORE — rimosso elenco nomi */}
                    <span style={{ fontSize: 13, color: '#9cb8c4' }}>{totalVotes} partecipant{totalVotes === 1 ? 'e' : 'i'}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {voteCounts.map((c, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {c.tag && <span style={{ width: 22, height: 22, borderRadius: 6, background: c.color, color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.tag}</span>}
                            <span style={{ fontSize: 13, color: '#1e4a5c', fontWeight: 500 }}>{c.text}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {session.revealed && <span style={{ fontSize: 14, fontWeight: 900, color: c.color }}>{c.pct}%</span>}
                            <span style={{ fontSize: 12, color: '#9cb8c4' }}>{c.count} vot{c.count === 1 ? 'o' : 'i'}</span>
                          </div>
                        </div>
                        <div style={{ height: 10, borderRadius: 6, background: '#f0f4f6', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 6, background: session.revealed ? c.color : '#c4e0e9', width: totalVotes > 0 ? `${c.pct}%` : '0%', transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)', opacity: session.revealed ? 1 : 0.5 }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Solo contatore, nessun nome */}
                  {totalVotes > 0 && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="#9cb8c4" strokeWidth="1.5"/><path d="M2 13c0-3 2.5-5 6-5s6 2 6 5" stroke="#9cb8c4" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      <span style={{ fontSize: 12, color: '#9cb8c4' }}>{totalVotes} partecipant{totalVotes === 1 ? 'e ha' : 'i hanno'} votato</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}