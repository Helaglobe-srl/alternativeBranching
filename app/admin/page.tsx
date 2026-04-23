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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data } = await supabase
        .from('user_profiles').select('is_admin, is_super_admin').eq('id', user.id).single()
      if (!data?.is_admin) { router.replace('/'); return }
      setIsAdmin(true)
      setIsSuperAdmin(!!data?.is_super_admin)
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
                return (
                  <div key={s.id} style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1.5px solid transparent' }}>

                    {/* Header sessione */}
                    <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#0c2a38' }}>{s.name}</span>
                          {s.voting_open && <span style={{ fontSize: 10, fontWeight: 700, color: '#16803d', background: '#f0fdf4', padding: '2px 8px', borderRadius: 20, border: '1px solid #bbf7d0' }}>VOTO APERTO</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#9cb8c4' }}>
                          {stories.find(st => st.slug === s.story_slug)?.title ?? s.story_slug} · {new Date(s.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => router.push(`/admin/${s.id}`)}
                          style={{ padding: '8px 16px', borderRadius: 8, background: '#0e88a5', color: 'white', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Apri →
                        </button>
                        {isSuperAdmin && (
                          <button onClick={() => deleteSession(s.id)}
                            style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 12, cursor: 'pointer' }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
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