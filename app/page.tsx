'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

interface Story {
  slug: string
  title: string
  subtitle: string
  description: string
  cover?: string
  sponsor?: string
  tag?: string
  duration?: string
  scenes?: number
}

// ── Cover image with fallback ─────────────────────────────────────────────────

function CoverImage({ src, alt, fill, sizes, style }: {
  src?: string; alt: string; fill?: boolean
  sizes?: string; style?: React.CSSProperties
}) {
  const [error, setError] = useState(false)
  if (!src || error) return null
  return <Image src={src} alt={alt} fill={fill} sizes={sizes} style={style} onError={() => setError(true)} />
}

// ── Username Modal ────────────────────────────────────────────────────────────

function UsernameModal({ story, onConfirm, onCancel }: {
  story: Story; onConfirm: (u: string) => void; onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem('mg_username')
    if (saved) setName(saved)
  }, [])

  const submit = () => {
    const t = name.trim()
    if (!t) { setError(true); return }
    sessionStorage.setItem('mg_username', t)
    onConfirm(t)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') submit()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,30,0.55)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 22, maxWidth: 400, width: '100%', overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.22)', animation: 'popIn .22s cubic-bezier(0.22,1,0.36,1)' }}>

        {/* Header — cover or solid bg */}
        <div style={{ position: 'relative', width: '100%', height: 120, background: 'linear-gradient(135deg,#1e2e2e,#243535)', overflow: 'hidden', flexShrink: 0 }}>
          <CoverImage src={story.cover} alt={story.title} fill sizes="400px" style={{ objectFit: 'cover', objectPosition: 'center', opacity: 0.65 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.7),transparent)' }} />
          <div style={{ position: 'absolute', bottom: 14, left: 18, right: 18 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{story.subtitle}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{story.title}</div>
          </div>
        </div>

        <div style={{ padding: '22px 22px 20px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: '#0c2a38' }}>Come ti chiami?</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b9aaa', lineHeight: 1.5 }}>
            Il tuo nome sarà usato per salvare le tue statistiche. Nessun account richiesto.
          </p>
          <input
            autoFocus value={name}
            onChange={e => { setName(e.target.value); setError(false) }}
            placeholder="Es. Mario Rossi"
            style={{ width: '100%', padding: '10px 13px', borderRadius: 10, fontSize: 14, border: `1.5px solid ${error ? '#dc2626' : '#c4e0e9'}`, outline: 'none', color: '#0c2a38', marginBottom: error ? 5 : 16, fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
            onBlur={e => { e.currentTarget.style.borderColor = error ? '#dc2626' : '#c4e0e9' }}
          />
          {error && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#dc2626' }}>Inserisci il tuo nome per continuare.</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: '#f0f4f6', color: '#4C7D93', border: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#dde8ed' }} onMouseLeave={e => { e.currentTarget.style.background = '#f0f4f6' }}>
              Annulla
            </button>
            <button onClick={submit} style={{ flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: '#0e88a5', color: 'white', border: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0c6d82' }} onMouseLeave={e => { e.currentTarget.style.background = '#0e88a5' }}>
              Inizia →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Story Card ────────────────────────────────────────────────────────────────

function StoryCard({ story, onClick }: { story: Story; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 16, border: `1.5px solid ${hovered ? '#0e88a5' : '#e0eaee'}`, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', boxShadow: hovered ? '0 8px 32px rgba(14,136,165,0.15)' : '0 2px 12px rgba(0,0,0,0.06)', transform: hovered ? 'translateY(-3px)' : 'translateY(0)', transition: 'all .2s cubic-bezier(0.22,1,0.36,1)', width: '100%' }}>

      {/* Cover */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg,#1e2e2e,#243535)', overflow: 'hidden', flexShrink: 0 }}>
        <CoverImage
          src={story.cover} alt={story.title} fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          style={{ objectFit: 'cover', objectPosition: 'center top', transition: 'transform .3s ease', transform: hovered ? 'scale(1.04)' : 'scale(1)' }}
        />
        {/* Placeholder cross when no cover */}
        {!story.cover && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="36" height="36" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.2 }}>
              <rect x="24" y="8" width="16" height="48" rx="4" fill="#0e88a5"/>
              <rect x="8" y="24" width="48" height="16" rx="4" fill="#0e88a5"/>
            </svg>
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.45) 0%,transparent 55%)' }} />
        {story.tag && (
          <div style={{ position: 'absolute', top: 10, left: 10, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0e88a5' }}>{story.tag}</div>
        )}
        {story.sponsor && (
          <div style={{ position: 'absolute', top: 10, right: 10, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', fontSize: 9.5, fontWeight: 600, color: '#4C7D93' }}>{story.sponsor}</div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{story.subtitle}</div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0c2a38', lineHeight: 1.25, letterSpacing: '-0.01em' }}>{story.title}</h3>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#6b9aaa', lineHeight: 1.55, flex: 1 }}>{story.description}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {story.duration && (
              <span style={{ fontSize: 11.5, color: '#9cb8c4', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#9cb8c4" strokeWidth="1.5"/><path d="M8 5v3.5l2 2" stroke="#9cb8c4" strokeWidth="1.5" strokeLinecap="round"/></svg>
                {story.duration}
              </span>
            )}
            {story.scenes && (
              <span style={{ fontSize: 11.5, color: '#9cb8c4', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="1.5" stroke="#9cb8c4" strokeWidth="1.5"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="#9cb8c4" strokeWidth="1.5"/></svg>
                {story.scenes} scene
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: hovered ? 'white' : '#0e88a5', background: hovered ? '#0e88a5' : '#e8f4f8', padding: '4px 13px', borderRadius: 20, transition: 'all .2s' }}>
            Inizia →
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Homepage ──────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter()
  const [stories, setStories]   = useState<Story[] | null>(null)  // null = loading
  const [fetchError, setFetchError] = useState(false)
  const [selected, setSelected] = useState<Story | null>(null)

  useEffect(() => {
    fetch('/stories.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setStories)
      .catch(() => {
        setFetchError(true)
        setStories([])  // stop loading spinner
      })
  }, [])

  const handleCardClick = (story: Story) => {
    const saved = sessionStorage.getItem('mg_username')
    if (saved) { router.push(`/game/${story.slug}`); return }
    setSelected(story)
  }

  const handleConfirm = (_u: string) => {
    if (!selected) return
    router.push(`/game/${selected.slug}`)
  }

  return (
    <>
      <style>{`
        html,body{margin:0;padding:0}
        *{box-sizing:border-box}
        @keyframes popIn{from{opacity:0;transform:scale(0.93) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {selected && <UsernameModal story={selected} onConfirm={handleConfirm} onCancel={() => setSelected(null)} />}

      <div style={{ minHeight: '100vh', background: '#f5f0eb', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>

        {/* Navbar */}
        <nav style={{ height: 56, background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(14,136,165,0.14)', display: 'flex', alignItems: 'center', padding: '0 32px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 50 }}>
          <Image src="/images/LOGO.webp" alt="Logo" width={100} height={28} style={{ objectFit: 'contain', height: 28, width: 'auto' }} />
          <span style={{ marginLeft: 12, fontSize: 14, fontWeight: 600, color: '#0e88a5' }}>Clinical Scenarios</span>
        </nav>

        <div style={{ padding: '48px 32px 32px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: 40 }}>
            <h1 style={{ margin: '0 0 10px', fontSize: 32, fontWeight: 900, color: '#0c2a38', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Scenari clinici interattivi
            </h1>
            <p style={{ margin: 0, fontSize: 16, color: '#6b9aaa', lineHeight: 1.6, maxWidth: 760 }}>
              Esplora casi clinici reali, prendi decisioni terapeutiche e ricevi feedback immediato basato sulle linee guida.
            </p>
          </div>

          {/* Loading */}
          {stories === null && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
              <div style={{ width: 24, height: 24, border: '2.5px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              <span style={{ fontSize: 14, color: '#9cb8c4' }}>Caricamento storie...</span>
            </div>
          )}

          {/* Error */}
          {fetchError && (
            <div style={{ padding: '24px', borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 14, lineHeight: 1.6 }}>
              <strong>Impossibile caricare le storie.</strong><br/>
              Assicurati che il file <code>public/stories.json</code> esista e sia un JSON valido.
            </div>
          )}

          {/* Empty */}
          {stories !== null && !fetchError && stories.length === 0 && (
            <div style={{ padding: '24px', borderRadius: 14, background: '#f0f8fb', border: '1px solid #c4e0e9', color: '#4C7D93', fontSize: 14 }}>
              Nessuna storia trovata in <code>public/stories.json</code>.
            </div>
          )}

          {/* Grid */}
          {stories && stories.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {stories.map(story => (
                <StoryCard key={story.slug} story={story} onClick={() => handleCardClick(story)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '32px', textAlign: 'center', color: '#9cb8c4', fontSize: 12, marginTop: 40 }}>
          Contenuti a scopo educativo · Helaglobe S.r.l.
        </div>
      </div>
    </>
  )
}