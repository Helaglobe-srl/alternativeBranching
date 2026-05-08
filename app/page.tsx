'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Story {
  slug: string; title: string; subtitle: string; description: string
  cover?: string; sponsor?: string; tag?: string; duration?: string; scenes?: number
}

function CoverImage({ src, alt, fill, sizes, style }: {
  src?: string; alt: string; fill?: boolean; sizes?: string; style?: React.CSSProperties
}) {
  const [error, setError] = useState(false)
  if (!src || error) return null
  return <Image src={src} alt={alt} fill={fill} sizes={sizes} style={style} onError={() => setError(true)} />
}

function SessionModal({ story, onStart, onCancel }: {
  story: Story
  onStart: (sessionId: string | null) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const [step,          setStep]          = useState<'choose' | 'name' | 'qr'>('choose')
  const [sessionName,   setSessionName]   = useState('')
  const [creating,      setCreating]      = useState(false)
  const [recentSession, setRecentSession] = useState<{id: string; name: string; created_at: string} | null>(null)
  const [createdId,     setCreatedId]     = useState<string | null>(null)
  const [qrUrl,         setQrUrl]         = useState('')

  useEffect(() => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    supabase.from('live_sessions')
      .select('id, name, created_at').eq('story_slug', story.slug)
      .gte('created_at', yesterday).order('created_at', { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data) setRecentSession(data) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!createdId) return
    const url = `${window.location.origin}/join/${createdId}`
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#0c2a38', light: '#ffffff' } }).then(setQrUrl)
    })
  }, [createdId])

  const createAndShowQr = async (name: string, existingId?: string) => {
    if (existingId) { setCreatedId(existingId); setStep('qr'); return }
    if (!name.trim()) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('live_sessions').insert({
      name: name.trim(), story_slug: story.slug, created_by: user?.id,
    }).select().single()
    setCreating(false)
    if (data) { setCreatedId(data.id); setStep('qr') }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && step === 'name' && sessionName.trim()) createAndShowQr(sessionName)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [step, sessionName]) // eslint-disable-line react-hooks/exhaustive-deps

  const joinUrl = createdId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${createdId}` : ''

  return (
    <div onClick={step === 'qr' ? undefined : onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,30,0.55)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 22, maxWidth: 440, width: '100%', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.22)', animation: 'popIn .22s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ position: 'relative', width: '100%', height: 100, background: 'linear-gradient(135deg,#1e2e2e,#243535)', overflow: 'hidden' }}>
          <CoverImage src={story.cover} alt={story.title} fill sizes="440px" style={{ objectFit: 'cover', objectPosition: 'center', opacity: 0.6 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.7),transparent)' }} />
          <div style={{ position: 'absolute', bottom: 12, left: 18, right: 18 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{story.subtitle}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>{story.title}</div>
          </div>
        </div>
        <div style={{ padding: '22px 22px 20px' }}>
          {step === 'choose' && (
            <>
              <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0c2a38' }}>Avvia sessione</h3>
              {recentSession && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#6b9aaa', marginBottom: 8 }}>Sessione recente trovata:</div>
                  <button onClick={() => createAndShowQr('', recentSession.id)}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #c4e0e9', background: '#f0f8fb', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#c4e0e9' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0c2a38' }}>{recentSession.name}</div>
                      <div style={{ fontSize: 11, color: '#9cb8c4', marginTop: 2 }}>
                        {new Date(recentSession.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#0e88a5', fontWeight: 700 }}>Continua →</span>
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => setStep('name')}
                  style={{ padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#0e88a5', color: 'white', border: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0c6d82' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#0e88a5' }}>
                  + Nuova sessione
                </button>
                <button onClick={() => onStart(null)}
                  style={{ padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#f0f4f6', color: '#4C7D93', border: 'none' }}>
                  Avvia senza sessione live
                </button>
              </div>
            </>
          )}
          {step === 'name' && (
            <>
              <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#0c2a38' }}>Nome della sessione</h3>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b9aaa' }}>Es. "Congresso Neurologia Milano 2025"</p>
              <input autoFocus value={sessionName} onChange={e => setSessionName(e.target.value)}
                placeholder="Nome sessione…"
                style={{ width: '100%', padding: '10px 13px', borderRadius: 10, fontSize: 14, border: '1.5px solid #c4e0e9', outline: 'none', color: '#0c2a38', fontFamily: 'inherit', marginBottom: 14 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#c4e0e9' }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('choose')}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#f0f4f6', color: '#4C7D93', border: 'none' }}>
                  ← Indietro
                </button>
                <button onClick={() => createAndShowQr(sessionName)} disabled={creating || !sessionName.trim()}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: creating || !sessionName.trim() ? 'default' : 'pointer', background: creating || !sessionName.trim() ? '#9cb8c4' : '#0e88a5', color: 'white', border: 'none' }}>
                  {creating ? 'Creazione…' : 'Crea sessione →'}
                </button>
              </div>
            </>
          )}
          {step === 'qr' && (
            <>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#0c2a38', textAlign: 'center' }}>Fai scansionare il QR</h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b9aaa', textAlign: 'center' }}>I partecipanti si registrano e potranno votare durante la presentazione</p>
              {qrUrl ? (
                <div style={{ background: '#f0f8fb', borderRadius: 14, padding: 14, marginBottom: 14, textAlign: 'center' }}>
                  <img src={qrUrl} alt="QR" style={{ width: '100%', maxWidth: 220, borderRadius: 8, display: 'block', margin: '0 auto' }} />
                  <div style={{ marginTop: 8, fontSize: 11, color: '#9cb8c4', wordBreak: 'break-all' }}>{joinUrl}</div>
                </div>
              ) : (
                <div style={{ height: 220, background: '#f0f8fb', borderRadius: 14, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 24, height: 24, border: '2.5px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { if (joinUrl) navigator.clipboard.writeText(joinUrl) }}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#e8f4f8', color: '#0e88a5', border: '1px solid #c4e0e9' }}>
                  Copia link
                </button>
                <button onClick={() => createdId && onStart(createdId)}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#0e88a5', color: 'white', border: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#0c6d82' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#0e88a5' }}>
                  Inizia presentazione →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StoryCard({ story, onClick }: { story: Story; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 16, border: `1.5px solid ${hovered ? '#0e88a5' : '#e0eaee'}`, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', boxShadow: hovered ? '0 8px 32px rgba(14,136,165,0.15)' : '0 2px 12px rgba(0,0,0,0.06)', transform: hovered ? 'translateY(-3px)' : 'translateY(0)', transition: 'all .2s cubic-bezier(0.22,1,0.36,1)', width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg,#1e2e2e,#243535)', overflow: 'hidden', flexShrink: 0 }}>
        <CoverImage src={story.cover} alt={story.title} fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          style={{ objectFit: 'cover', objectPosition: 'center top', transition: 'transform .3s ease', transform: hovered ? 'scale(1.04)' : 'scale(1)' }} />
        {!story.cover && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.2 }}>
              <rect x="24" y="8" width="16" height="48" rx="4" fill="#0e88a5"/>
              <rect x="8" y="24" width="48" height="16" rx="4" fill="#0e88a5"/>
            </svg>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.45) 0%,transparent 55%)' }} />
        {story.tag && <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0e88a5' }}>{story.tag}</div>}
        {story.sponsor && <div style={{ position: 'absolute', top: 10, right: 10, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', fontSize: 9.5, fontWeight: 600, color: '#4C7D93' }}>{story.sponsor}</div>}
      </div>
      <div style={{ flex: 1, padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{story.subtitle}</div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0c2a38', lineHeight: 1.25, letterSpacing: '-0.01em' }}>{story.title}</h3>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#6b9aaa', lineHeight: 1.55, flex: 1 }}>{story.description}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {story.duration && <span style={{ fontSize: 11.5, color: '#9cb8c4', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#9cb8c4" strokeWidth="1.5"/><path d="M8 5v3.5l2 2" stroke="#9cb8c4" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {story.duration}
            </span>}
            {story.scenes && <span style={{ fontSize: 11.5, color: '#9cb8c4', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5" stroke="#9cb8c4" strokeWidth="1.5"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="#9cb8c4" strokeWidth="1.5"/></svg>
              {story.scenes} scene
            </span>}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: hovered ? 'white' : '#0e88a5', background: hovered ? '#0e88a5' : '#e8f4f8', padding: '4px 13px', borderRadius: 20, transition: 'all .2s' }}>
            Inizia →
          </div>
        </div>
      </div>
    </button>
  )
}

export default function Home() {
  const router   = useRouter()
  const supabase = createClient()

  const [stories,    setStories]    = useState<Story[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selected,   setSelected]   = useState<Story | null>(null)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [checking,   setChecking]   = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      supabase.from('user_profiles').select('is_admin').eq('id', user.id).single()
        .then(({ data }) => {
          const admin = !!data?.is_admin
          setIsAdmin(admin)
          setChecking(false)
          // Utenti non admin: redirect alla pagina di attesa
          if (!admin) { router.replace('/waiting'); return }
          // Solo admin caricano le storie
          fetch('/stories.json')
            .then(r => { if (!r.ok) throw new Error(); return r.json() })
            .then(setStories)
            .catch(() => { setFetchError(true); setStories([]) })
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = (sessionId: string | null) => {
    if (!selected) return
    router.push(sessionId ? `/game/${selected.slug}?session=${sessionId}` : `/game/${selected.slug}`)
  }

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
      <style>{`html,body{margin:0;padding:0}*{box-sizing:border-box}@keyframes popIn{from{opacity:0;transform:scale(0.93) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {selected && <SessionModal story={selected} onStart={handleStart} onCancel={() => setSelected(null)} />}

      <div style={{ minHeight: '100vh', background: '#f5f0eb', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <nav style={{ height: 56, background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(14,136,165,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Image src="/images/logo2.png" alt="Logo" width={100} height={28} style={{ objectFit: 'contain', height: 28, width: 'auto' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0e88a5' }}>Clinical Scenarios</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', background: '#e8f4f8', padding: '2px 10px', borderRadius: 20, border: '1px solid #c4e0e9' }}>Admin</span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => router.push('/admin')}
              style={{ fontSize: 12, color: '#4C7D93', background: '#f0f4f6', border: 'none', padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Sessioni →
            </button>
            <button onClick={logout}
              style={{ fontSize: 12, color: '#9cb8c4', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9cb8c4' }}>
              Esci
            </button>
          </div>
        </nav>

        <div style={{ padding: '48px 32px 32px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 40 }}>
            <h1 style={{ margin: '0 0 10px', fontSize: 32, fontWeight: 900, color: '#0c2a38', letterSpacing: '-0.03em', lineHeight: 1.1 }}>Scenari clinici interattivi</h1>
            <p style={{ margin: 0, fontSize: 16, color: '#6b9aaa', lineHeight: 1.6, maxWidth: 760 }}>
              Esplora casi clinici reali, prendi decisioni terapeutiche e ricevi feedback immediato basato sulle linee guida.
            </p>
          </div>

          {stories === null && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
              <div style={{ width: 24, height: 24, border: '2.5px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              <span style={{ fontSize: 14, color: '#9cb8c4' }}>Caricamento storie...</span>
            </div>
          )}

          {fetchError && (
            <div style={{ padding: '24px', borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 14 }}>
              <strong>Impossibile caricare le storie.</strong>
            </div>
          )}

          {stories && stories.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {stories.map(story => (
                <StoryCard key={story.slug} story={story} onClick={() => setSelected(story)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '32px', textAlign: 'center', color: '#9cb8c4', fontSize: 12, marginTop: 40 }}>
          Contenuti a scopo educativo · Helaglobe S.r.l. ·{' '}
          <a href="/privacy" style={{ color: '#9cb8c4', textDecoration: 'underline' }}>Privacy Policy</a>
        </div>
      </div>
    </>
  )
}