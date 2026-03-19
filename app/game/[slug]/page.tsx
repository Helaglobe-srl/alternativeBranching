'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Choice { id?: string; text: string; next: string; tag?: string }

interface Stat {
  label: string
  value: string
  color: 'warning' | 'danger' | 'success' | 'info'
}

interface Scene {
  id: string
  type: 'intro' | 'info' | 'decision' | 'outcome' | 'endpoint'
  title: string
  image?: string | null
  imageAlt?: string
  context?: string
  badge?: string
  badgeColor?: 'success' | 'warning' | 'danger' | 'info'
  stats?: Stat[]          // ← configurabile dal JSON
  text: string
  choices: Choice[]
}

interface ScenarioData { title: string; subtitle: string; scenes: Scene[] }

// ── Text parser ──────────────────────────────────────────────────────────────

function parseText(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('•')) {
      const content = line.replace(/^•\s*/, '')
      const parts = content.split(/\*\*(.*?)\*\*/g).map((p, j) =>
        j % 2 === 1 ? <strong key={j} style={{ color: '#1a4a5c', fontWeight: 700 }}>{p}</strong> : p
      )
      return (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, margin: '3px 0' }}>
          <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: '#0e88a5', marginTop: 7, display: 'block' }} />
          <span style={{ lineHeight: 1.6 }}>{parts}</span>
        </div>
      )
    }
    if (!line.trim()) return <div key={i} style={{ height: 5 }} />
    const parts = line.split(/\*\*(.*?)\*\*/g).map((p, j) =>
      j % 2 === 1 ? <strong key={j} style={{ color: '#1a4a5c', fontWeight: 700 }}>{p}</strong> : p
    )
    return <p key={i} style={{ margin: 0, lineHeight: 1.6 }}>{parts}</p>
  })
}

// ── Config ───────────────────────────────────────────────────────────────────

const CFG = {
  decision: { accent: '#0e88a5', light: '#e8f4f8', label: 'Scelta clinica' },
  endpoint: { accent: '#16803d', light: '#f0fdf4', label: 'Conclusione'    },
  outcome:  { accent: '#b45309', light: '#fffbeb', label: 'Esito scenario' },
  intro:    { accent: '#0e88a5', light: '#e8f4f8', label: 'Caso clinico'   },
  info:     { accent: '#0e88a5', light: '#e8f4f8', label: 'Prima visita'   },
} as const

const BADGE_COLORS = {
  success: { bg: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' },
  warning: { bg: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' },
  danger:  { bg: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
  info:    { bg: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
}

// Stat color map
const STAT_COLORS = {
  warning: { c: '#b45309', bg: 'rgba(180,83,9,0.07)'  },
  danger:  { c: '#dc2626', bg: 'rgba(220,38,38,0.07)' },
  success: { c: '#16803d', bg: 'rgba(22,128,61,0.07)' },
  info:    { c: '#1d4ed8', bg: 'rgba(29,78,216,0.07)' },
}

const TAG_BG = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e']
const BP = 960

// ── StatBox — reads from JSON ─────────────────────────────────────────────────

function StatBox({ stats }: { stats: Stat[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(14,136,165,0.12)' }}>
      {stats.map(s => {
        const col = STAT_COLORS[s.color] ?? STAT_COLORS.info
        return (
          <div key={s.label} style={{ flex: 1, borderRadius: 8, padding: '8px 4px', textAlign: 'center', background: col.bg }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: col.c, fontFamily: 'Georgia,serif', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: col.c, opacity: 0.7, marginTop: 3, letterSpacing: '0.04em' }}>{s.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Confirm Popup ────────────────────────────────────────────────────────────

function ConfirmPopup({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,30,0.5)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, padding: '32px 28px 26px', maxWidth: 360, width: '90%', boxShadow: '0 32px 80px rgba(0,0,0,0.22)', textAlign: 'center', animation: 'popIn .22s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#e8f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M3 10.5L12 3L21 10.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z" stroke="#0e88a5" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M9 21V13h6v8" stroke="#0e88a5" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#0c2a38' }}>Ricominciare dall&apos;inizio?</h3>
        <p style={{ margin: '0 0 26px', fontSize: 13.5, color: '#6b9aaa', lineHeight: 1.55 }}>Il progresso andrà perso.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: '#f0f4f6', color: '#4C7D93', border: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#dde8ed' }} onMouseLeave={e => { e.currentTarget.style.background = '#f0f4f6' }}>Annulla</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: '#0e88a5', color: 'white', border: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0c6d82' }} onMouseLeave={e => { e.currentTarget.style.background = '#0e88a5' }}>Sì, ricomincia</button>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function GamePage() {
  const router  = useRouter()
  const params  = useParams()
  const slug    = params?.slug as string

  const [data, setData]               = useState<ScenarioData | null>(null)
  const [currentId, setCurrentId]     = useState('intro')
  const [history, setHistory]         = useState<string[]>([])
  const [phase, setPhase]             = useState<'visible' | 'exit' | 'enter'>('visible')
  const [imgError, setImgError]       = useState(false)
  const [imgVisible, setImgVisible]   = useState(true)
  const [isDesktop, setIsDesktop]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [username, setUsername]       = useState('')
  const scrollRef                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!slug) return
    fetch(`/stories/${slug}/scenario.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch(err => console.error('scenario load error:', err))
  }, [slug])

  useEffect(() => {
    const saved = sessionStorage.getItem('mg_username')
    if (!saved) { router.push('/'); return }
    setUsername(saved)
  }, [router])

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= BP)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const scene = data?.scenes.find(s => s.id === currentId)

  const trackEvent = useCallback((sceneId: string, choice?: string) => {
    console.log('[track]', { slug, username, sceneId, choice })
    // TODO: supabase.from('game_events').insert({ slug, username, scene_id: sceneId, choice })
  }, [slug, username])

  const go = useCallback((nextId: string, back = false, choiceText?: string) => {
    if (phase !== 'visible') return
    setPhase('exit'); setImgVisible(false)
    setTimeout(() => {
      if (back) { setHistory(h => h.slice(0, -1)); setCurrentId(nextId) }
      else      { setHistory(h => [...h, currentId]); setCurrentId(nextId); trackEvent(nextId, choiceText) }
      setImgError(false); setPhase('enter')
      scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
      setTimeout(() => { setImgVisible(true); setPhase('visible') }, 60)
    }, 300)
  }, [phase, currentId, trackEvent])

  const goBack = useCallback(() => {
    if (history.length && phase === 'visible') go(history[history.length - 1], true)
  }, [history, phase, go])

  const handleLogoClick = useCallback(() => setShowConfirm(true), [])

  const handleConfirmRestart = useCallback(() => {
    setShowConfirm(false); setPhase('exit'); setImgVisible(false)
    setTimeout(() => {
      setHistory([]); setCurrentId('intro'); setImgError(false); setPhase('enter')
      scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
      setTimeout(() => { setImgVisible(true); setPhase('visible') }, 60)
    }, 300)
  }, [])

  if (!data || !scene) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0eb' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const cfg         = CFG[scene.type] ?? CFG.info
  const isDecision  = scene.type === 'decision'
  const isEndpoint  = scene.type === 'endpoint'
  const badgeColors = scene.badgeColor ? BADGE_COLORS[scene.badgeColor] : BADGE_COLORS.info
  const accentLine  = isDecision ? cfg.accent : isEndpoint ? '#16803d' : scene.type === 'outcome' ? '#b45309' : '#c4e0e9'

  const imgWrapStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: imgVisible ? 1 : 0,
    transition: imgVisible ? 'opacity 500ms cubic-bezier(0.4,0,0.2,1)' : 'opacity 250ms ease-out',
  }

  const panelAnim: React.CSSProperties = {
    height: '100%', display: 'flex', flexDirection: 'column', padding: '22px 26px 20px',
    opacity: phase === 'exit' ? 0 : 1,
    transform: phase === 'exit' ? 'translateX(10px)' : phase === 'enter' ? 'translateX(-6px)' : 'translateX(0)',
    transition: phase === 'exit'
      ? 'opacity 280ms ease-out, transform 280ms ease-out'
      : 'opacity 400ms ease, transform 420ms cubic-bezier(0.22,1,0.36,1)',
  }

  const imgLayer = (
    <div style={imgWrapStyle}>
      {scene.image && !imgError ? (
        <Image src={scene.image} alt={scene.imageAlt ?? scene.title} fill sizes={isDesktop ? '65vw' : '100vw'} quality={95} priority style={{ objectFit: 'contain', objectPosition: 'center' }} onError={() => setImgError(true)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <svg width="52" height="52" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.22 }}>
            <rect x="24" y="8" width="16" height="48" rx="4" fill={cfg.accent}/>
            <rect x="8" y="24" width="48" height="16" rx="4" fill={cfg.accent}/>
          </svg>
          <div style={{ fontSize: 12, fontWeight: 600, color: cfg.accent, opacity: 0.4 }}>Nessuna immagine</div>
        </div>
      )}
    </div>
  )

  const imgOverlays = (
    <>
      <div style={{ position: 'absolute', top: 12, left: 14, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', border: `1px solid ${cfg.accent}28`, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: cfg.accent, zIndex: 2 }}>{cfg.label}</div>
      {scene.badge && <div style={{ position: 'absolute', top: 12, right: 14, padding: '3px 10px', borderRadius: 20, backdropFilter: 'blur(8px)', fontSize: 9.5, fontWeight: 600, background: badgeColors.bg, color: badgeColors.color, border: badgeColors.border, zIndex: 2 }}>{scene.badge}</div>}
      <div style={{ position: 'absolute', bottom: 10, left: 14, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(4px)', fontSize: 8.5, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', zIndex: 2 }}>{scene.id}</div>
    </>
  )

  const choicesBtns = (
    <div style={{ display: 'flex', flexDirection: isDecision ? 'column' : 'row', flexWrap: isDecision ? 'nowrap' : 'wrap', gap: 7 }}>
      {scene.choices.map((choice, i) => {
        if (isDecision) return (
          <button key={i} onClick={() => go(choice.next, false, choice.text)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, border: '1.5px solid #c4e0e9', background: 'white', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', width: '100%' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = cfg.accent; e.currentTarget.style.background = cfg.light; e.currentTarget.style.transform = 'translateX(2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#c4e0e9'; e.currentTarget.style.background = 'white'; e.currentTarget.style.transform = 'translateX(0)' }}>
            {choice.tag && <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white', background: TAG_BG[i % TAG_BG.length] }}>{choice.tag}</span>}
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1e4a5c', lineHeight: 1.3 }}>{choice.text}</span>
            <span style={{ color: '#c4e0e9', fontSize: 13, flexShrink: 0 }}>→</span>
          </button>
        )
        const neutral = choice.next === 'intro' || choice.text.startsWith('←')
        return (
          <button key={i} onClick={() => go(choice.next, false, choice.text)}
            style={{ padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', background: neutral ? 'white' : isEndpoint ? '#f0fdf4' : cfg.accent, color: neutral ? '#4C7D93' : isEndpoint ? '#15803d' : 'white', border: neutral ? '1.5px solid #c4e0e9' : isEndpoint ? '1.5px solid #bbf7d0' : 'none' }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.93)' }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}>
            {choice.text}
          </button>
        )
      })}
    </div>
  )

  // textContent — stats ora viene dal JSON (scene.stats)
  const textContent = (compact = false) => (
    <>
      <div style={{ marginBottom: compact ? 10 : 14, flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 5, background: cfg.light, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: cfg.accent, marginBottom: compact ? 7 : 9 }}>{cfg.label}</div>
        <h2 style={{ margin: 0, fontSize: compact ? 17 : 19, fontWeight: 800, color: '#0c2a38', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{scene.title}</h2>
        {scene.context && <p style={{ margin: '4px 0 0', fontSize: compact ? 11 : 11.5, fontStyle: 'italic', color: '#6b9aaa' }}>{scene.context}</p>}
      </div>
      <div style={{ height: 1, background: `linear-gradient(to right,${cfg.accent}25,transparent)`, marginBottom: compact ? 12 : 14, flexShrink: 0 }} />
      <div style={{ flex: compact ? undefined : 1, fontSize: 13.5, color: '#1e4a5c', lineHeight: 1.65, overflowY: compact ? undefined : 'auto', minHeight: 0, marginBottom: compact ? 16 : 0 }}>
        {parseText(scene.text)}
        {/* stats dal JSON — mostrate solo se presenti nella scena */}
        {scene.stats && scene.stats.length > 0 && <StatBox stats={scene.stats} />}
      </div>
      <div style={{ marginTop: compact ? 0 : 16, flexShrink: 0 }}>
        {isDecision && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b9aaa', marginBottom: 8 }}>Seleziona la tua scelta</div>}
        {choicesBtns}
      </div>
      {!compact && history.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(14,136,165,0.06)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, flexShrink: 0 }}>
          <span style={{ fontSize: 8, color: '#ccc', fontFamily: 'monospace' }}>percorso:</span>
          {history.slice(-4).map((id, idx) => <span key={idx} style={{ fontSize: 8, color: '#ccc', fontFamily: 'monospace' }}>{id} <span style={{ color: '#e0e0e0' }}>›</span> </span>)}
          <span style={{ fontSize: 8, color: cfg.accent, fontFamily: 'monospace', fontWeight: 600 }}>{currentId}</span>
        </div>
      )}
    </>
  )

  return (
    <>
      <style>{`
        html,body{margin:0;padding:0;height:100%;overflow:hidden}
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes popIn{from{opacity:0;transform:scale(0.92) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
      `}</style>

      {showConfirm && <ConfirmPopup onConfirm={handleConfirmRestart} onCancel={() => setShowConfirm(false)} />}

      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#eae5de', fontFamily: "'Segoe UI',system-ui,sans-serif", overflow: 'hidden' }}>

        <nav style={{ flexShrink: 0, height: 42, background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(14,136,165,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={goBack} disabled={history.length === 0} title="Torna indietro"
              style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: history.length > 0 ? cfg.light : 'transparent', border: `1px solid ${history.length > 0 ? cfg.accent + '33' : 'rgba(0,0,0,0.08)'}`, cursor: history.length > 0 ? 'pointer' : 'default', transition: 'all .15s' }}
              onMouseEnter={e => { if (history.length > 0) e.currentTarget.style.background = '#c4e0e9' }}
              onMouseLeave={e => { e.currentTarget.style.background = history.length > 0 ? cfg.light : 'transparent' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke={history.length > 0 ? cfg.accent : '#ccc'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button onClick={handleLogoClick} title="Ricomincia" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'opacity .15s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }} onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
              <Image src="/images/LOGO.webp" alt="Logo" width={84} height={24} style={{ objectFit: 'contain', height: 24, width: 'auto' }} />
              {isDesktop && <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0e88a5' }}>{data.title}</span>}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {username && <div style={{ fontSize: 11, color: '#4C7D93', background: '#f0f4f6', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>👤 {username}</div>}
            <button onClick={() => router.push('/')} style={{ fontSize: 11, color: '#9cb8c4', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 8px' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0e88a5' }} onMouseLeave={e => { e.currentTarget.style.color = '#9cb8c4' }}>← Home</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 11px', borderRadius: 20, background: cfg.light, border: `1px solid ${cfg.accent}22` }}>
              <span style={{ fontSize: 10.5, color: cfg.accent, fontWeight: 700, fontFamily: 'monospace' }}>{String(history.length + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 9.5, color: cfg.accent, opacity: 0.55 }}>/ step</span>
            </div>
          </div>
        </nav>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isDesktop ? '16px 28px' : '12px 16px' }}>
          {isDesktop ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 48px rgba(0,0,0,0.16)' }}>
              <div style={{ width: '65%', flexShrink: 0, position: 'relative', background: 'linear-gradient(160deg,#1e2e2e 0%,#243535 60%,#1a2828 100%)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,0.3) 100%)', pointerEvents: 'none', zIndex: 1 }} />
                {imgLayer}{imgOverlays}
              </div>
              <div ref={scrollRef} style={{ flex: 1, background: 'white', borderLeft: `3px solid ${accentLine}`, overflowY: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={panelAnim}>{textContent()}</div>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 520, maxHeight: '100%', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', flexShrink: 0, background: 'linear-gradient(160deg,#1e2e2e,#243535)', overflow: 'hidden' }}>
                {imgLayer}{imgOverlays}
              </div>
              <div ref={scrollRef} style={{ flex: 1, background: 'white', borderLeft: `3px solid ${accentLine}`, overflowY: 'auto', padding: '16px 18px' }}>
                <div style={{ opacity: phase === 'exit' ? 0 : 1, transform: phase === 'exit' ? 'translateY(6px)' : 'translateY(0)', transition: 'opacity 280ms, transform 280ms' }}>
                  {textContent(true)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}