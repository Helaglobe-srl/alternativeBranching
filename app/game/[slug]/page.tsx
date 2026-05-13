'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import Image from 'next/image'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useUcbTracking } from '@/hooks/useUcbTracking'
import { useLiveSession } from '@/hooks/useLiveSession'
import { createClient } from '@/lib/supabase/client'
import QRCode from 'qrcode'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Choice { id?: string; text: string; next?: string; tag?: string }
interface Stat { label: string; value: string; color: 'warning' | 'danger' | 'success' | 'info' }
interface Video { title: string; src: string }
interface Table { headers: string[]; rows: string[][]; footer?: string }
interface Scene {
  id: string; type: 'intro' | 'info' | 'decision' | 'outcome' | 'endpoint' | 'summary'
  mode?: string; next?: string; max_chars?: number
  title: string; image?: string | null; imageAlt?: string; context?: string
  badge?: string; badgeColor?: 'success' | 'warning' | 'danger' | 'info'
  stats?: Stat[]; videos?: Video[]; table?: Table; text: string; choices: Choice[]
  cloud_words?: Record<string, string[] | null>
  multi?: boolean
}
interface ScenarioData { title: string; subtitle: string; scenes: Scene[] }

// ── Text parser ───────────────────────────────────────────────────────────────

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

// ── Config ────────────────────────────────────────────────────────────────────

const CFG = {
  decision: { accent: '#0e88a5', light: '#e8f4f8', label: 'Affermazione' },
  endpoint: { accent: '#0e88a5', light: '#f0fdf4', label: 'Conclusione' },
  outcome: { accent: '#0e88a5', light: '#fffbeb', label: 'Esito scenario' },
  intro: { accent: '#0e88a5', light: '#e8f4f8', label: 'Caso clinico' },
  info:    { accent: '#0e88a5', light: '#e8f4f8', label: ' ' },
  summary: { accent: '#0e88a5', light: '#e8f4f8', label: 'Riepilogo' },
} as const

const BADGE_COLORS = {
  success: { bg: '#f0fdf4', color: '#0e88a5', border: '1px solid #bbf7d0' },
  warning: { bg: '#fffbeb', color: '#0e88a5', border: '1px solid #fde68a' },
  danger:  { bg: '#fef2f2', color: '#0e88a5', border: '1px solid #fecaca' },
  info:    { bg: '#eff6ff', color: '#0e88a5', border: '1px solid #bfdbfe' },
}

const STAT_COLORS = {
  warning: { c: '#0e88a5', bg: 'rgba(14,136,165,0.07)' },
  danger:  { c: '#0e88a5', bg: 'rgba(14,136,165,0.07)' },
  success: { c: '#0e88a5', bg: 'rgba(14,136,165,0.07)' },
  info:    { c: '#0e88a5', bg: 'rgba(14,136,165,0.07)' },
}

const TAG_BG = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e']
const CHOICE_COLORS = ['#0e88a5', '#2d6a7f', '#c2410c', '#0f766e', '#7c3aed', '#b45309']
const BP = 960
const VOTE_PANEL_W = 160

const T_OUT = 120
const T_PRE = 20
const T_IN  = 260
const T_IMG_FALLBACK = 1000
const IMG_WIDTH = '70%'

// ── Delphi helpers ────────────────────────────────────────────────────────────

const likertColor = (n: number, i: number): string => {
  const stops = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']
  if (n <= 1) return stops[4]
  const t = i / (n - 1)
  return stops[Math.min(Math.floor(t * (stops.length - 1)), stops.length - 2)]
}

function delphiStats(votes: { cid: string; count: number; pct: number; color: string; tag?: string; text: string }[]) {
  const allVals: number[] = votes.flatMap(v => Array(v.count).fill(Number(v.tag ?? v.cid)))
  const total = allVals.length
  const mean = total ? allVals.reduce((a, b) => a + b, 0) / total : 0
  const sorted = [...allVals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length === 0 ? 0 : sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const n = votes.length
  const lo = Math.ceil(n / 3), hi = n - Math.floor(n / 3)
  const loPct = total ? votes.filter(v => Number(v.tag ?? v.cid) <= lo).reduce((s, v) => s + v.count, 0) / total : 0
  const miPct = total ? votes.filter(v => { const nv = Number(v.tag ?? v.cid); return nv > lo && nv < hi }).reduce((s, v) => s + v.count, 0) / total : 0
  const hiPct = total ? votes.filter(v => Number(v.tag ?? v.cid) >= hi).reduce((s, v) => s + v.count, 0) / total : 0
  const consensus = loPct >= 0.75 ? { label: 'Consenso: Disaccordo', color: '#ef4444', pct: Math.round(loPct * 100), ok: true }
    : miPct >= 0.75 ? { label: 'Consenso: Neutro', color: '#eab308', pct: Math.round(miPct * 100), ok: true }
    : hiPct >= 0.75 ? { label: 'Consenso: Accordo', color: '#22c55e', pct: Math.round(hiPct * 100), ok: true }
    : { label: 'Nessun consenso (< 75%)', color: '#f97316', pct: 0, ok: false }
  return { mean, median, consensus, total }
}

// ── Charts SVG ────────────────────────────────────────────────────────────────

function PieChart({ votes }: { votes: { color: string; pct: number; count: number; text: string }[] }) {
  const total = votes.reduce((s, v) => s + v.count, 0)
  if (!total) return null
  const cx = 80, cy = 80, r = 68
  const nonZero = votes.filter(v => v.count > 0)
  if (nonZero.length === 1) {
    return (
      <svg viewBox="0 0 160 160" width="140" height="140">
        <circle cx={cx} cy={cy} r={r} fill={nonZero[0].color} opacity={0.85} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="14" fontWeight="900">100%</text>
      </svg>
    )
  }
  let angle = -Math.PI / 2
  const slices = nonZero.map(v => {
    const sweep = (v.count / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    const mid = angle - sweep / 2
    return { ...v, x1, y1, x2, y2, large, mid, pctLabel: Math.round(v.count / total * 100) }
  })
  return (
    <svg viewBox="0 0 160 160" width="140" height="140">
      {slices.map((s, i) => (
        <path key={i} d={`M${cx},${cy} L${s.x1},${s.y1} A${r},${r} 0 ${s.large},1 ${s.x2},${s.y2} Z`}
          fill={s.color} opacity={0.85} stroke="#0c1a2a" strokeWidth="1.5">
          <title>{s.text}: {s.pctLabel}%</title>
        </path>
      ))}
      {slices.map((s, i) => {
        if (s.pctLabel < 8) return null
        return (
          <text key={i} x={cx + r * 0.65 * Math.cos(s.mid)} y={cy + r * 0.65 * Math.sin(s.mid)}
            textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="900">
            {s.pctLabel}%
          </text>
        )
      })}
    </svg>
  )
}

function BarChart({ votes }: { votes: { color: string; count: number; text: string; tag?: string; cid: string }[] }) {
  const maxCount = Math.max(...votes.map(v => v.count), 1)
  const w = 220, h = 90, pad = 16
  const barW = Math.floor((w - pad * 2) / votes.length) - 4
  return (
    <svg viewBox={`0 0 ${w} ${h + 22}`} width={w} height={h + 22}>
      {votes.map((v, i) => {
        const barH = Math.max((v.count / maxCount) * h, v.count > 0 ? 3 : 1)
        const x = pad + i * (barW + 4)
        const y = h - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={v.color} opacity={v.count ? 0.85 : 0.15} rx="3">
              <title>{v.text}: {v.count} voti</title>
            </rect>
            {v.count > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fill={v.color} fontSize="10" fontWeight="800">{v.count}</text>
            )}
            <text x={x + barW / 2} y={h + 15} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10" fontWeight="700">{v.tag ?? v.cid}</text>
          </g>
        )
      })}
      <line x1={pad - 2} y1={h} x2={w - pad + 2} y2={h} stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
    </svg>
  )
}

// ── Word Cloud ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['il','lo','la','i','gli','le','un','uno','una','di','a','da','in','con','su','per','tra','fra','e','o','ma','se','che','non','è','sono','ho','ha','mi','ti','si','ci','vi','del','della','dei','degli','delle','al','alla','ai','agli','alle','dal','dalla','dai','dagli','dalle','nel','nella','nei','negli','nelle','sul','sulla','sui','sugli','sulle','col','coi','questo','questa','questi','queste','quello','quella','quelli','quelle','mio','mia','miei','mie','tuo','tua','tuoi','tue','suo','sua','suoi','sue','come','quando','dove','perché','anche','più','molto','poco','tutti','tutto','già','ancora','sempre','mai','qui','lì','io','tu','lui','lei','noi','voi','loro','me','te','lui','lei','noi','voi'])

function buildWordCloud(
  answers: { answer: string }[],
  votedWords?: { words: string[]; count: number }[]
): { word: string; count: number; size: number; color: string }[] {
  const freq: Record<string, number> = {}
  // Parole dalle scelte votate (dal JSON cloud_words, pesate per voti)
  votedWords?.forEach(v => {
    v.words.forEach(w => {
      const key = w.toLowerCase().trim()
      if (key.length > 1) freq[key] = (freq[key] ?? 0) + v.count
    })
  })
  // Parole dalle risposte libere "Altro"
  answers.forEach(a => {
    a.answer.toLowerCase()
      .replace(/[^a-zàèéìòùa-z\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
      .forEach(w => { freq[w] = (freq[w] ?? 0) + 1 })
  })
  const max = Math.max(...Object.values(freq), 1)
  const palette = ['#22d3ee', '#4ade80', '#fbbf24', '#f97316', '#c084fc', '#34d399', '#f472b6', '#fb7185', '#a3e635', '#38bdf8', '#facc15', '#e879f9']
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([word, count], i) => ({
      word, count,
      size: Math.round(11 + (count / max) * 26),
      color: palette[i % palette.length],
    }))
}

function WordCloudView({ answers, votedWords }: { answers: { answer: string }[]; votedWords?: { words: string[]; count: number }[] }) {
  const words = buildWordCloud(answers, votedWords)
  if (!words.length) return (
    <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '40px 0' }}>
      Nessuna risposta ricevuta
    </div>
  )
  const shuffled = [...words].sort(() => Math.random() - 0.5)
  return (
    <div style={{ position: 'relative', minHeight: 200, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '6px 10px', padding: '12px 8px' }}>
      {shuffled.map((w, i) => {
        const rotate = w.count > 3 ? 0 : (i % 3 === 1 ? -12 : i % 3 === 2 ? 10 : 0)
        const opacity = 0.75 + (w.count / Math.max(...words.map(x => x.count))) * 0.25
        return (
          <span key={i}
            title={`${w.word}: ${w.count} ${w.count === 1 ? 'occorrenza' : 'occorrenze'}`}
            style={{ fontSize: w.size, fontWeight: w.size > 24 ? 900 : w.size > 18 ? 800 : 700, color: w.color, lineHeight: 1.1, cursor: 'default', display: 'inline-block', transform: `rotate(${rotate}deg)`, opacity, transition: 'all .2s', textShadow: w.size > 22 ? `0 0 20px ${w.color}44` : 'none', letterSpacing: w.size > 22 ? '-0.02em' : '0', padding: '2px 3px' }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = `rotate(${rotate}deg) scale(1.12)`; e.currentTarget.style.textShadow = `0 0 24px ${w.color}88` }}
            onMouseLeave={e => { e.currentTarget.style.opacity = String(opacity); e.currentTarget.style.transform = `rotate(${rotate}deg) scale(1)`; e.currentTarget.style.textShadow = w.size > 22 ? `0 0 20px ${w.color}44` : 'none' }}>
            {w.word}
          </span>
        )
      })}
    </div>
  )
}

// ── Open Answers Overlay ──────────────────────────────────────────────────────

function OpenAnswersOverlay({ answers, onClose }: {
  answers: { id: string; participant_name: string | null; answer: string; submitted_at: string }[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<'cloud' | 'list'>('cloud')
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,25,0.75)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0c1a2a', borderRadius: 20, padding: '24px 24px 20px', maxWidth: 560, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', border: '1px solid rgba(14,136,165,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Risposte aperte</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{answers.length} risposta{answers.length !== 1 ? 'e' : ''}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexShrink: 0 }}>
          {(['cloud', 'list'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '8px', borderRadius: 8, background: tab === t ? '#0e88a5' : 'rgba(255,255,255,0.06)', color: tab === t ? 'white' : 'rgba(255,255,255,0.5)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {t === 'cloud' ? '☁ Word Cloud' : '☰ Risposte'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {tab === 'cloud' ? (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '16px', minHeight: 160 }}>
              <WordCloudView answers={answers} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {answers.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: '20px 0' }}>Nessuna risposta</div>
              ) : answers.map((a, i) => (
                <div key={a.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5' }}>Risposta {i + 1}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{new Date(a.submitted_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{a.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Delphi Overlay ────────────────────────────────────────────────────────────

function DelphiOverlay({ votes, onClose }: {
  votes: { cid: string; count: number; pct: number; color: string; tag?: string; text: string }[]
  onClose: () => void
}) {
  const { mean, median, consensus, total } = delphiStats(votes)
  const maxPct = Math.max(...votes.map(v => v.pct), 1)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,25,0.75)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0c1a2a', borderRadius: 20, padding: '28px 28px 24px', maxWidth: 520, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', border: '1px solid rgba(14,136,165,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Analisi votazione</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{total} vot{total === 1 ? 'o' : 'i'}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 20, background: `${consensus.color}22`, border: `1.5px solid ${consensus.color}66`, fontSize: 13, fontWeight: 700, color: consensus.color }}>
            <span style={{ fontSize: 16 }}>{consensus.ok ? '✓' : '○'}</span>
            {consensus.label}
            {consensus.ok && <span style={{ fontSize: 11, opacity: 0.8 }}>({consensus.pct}%)</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {[{ label: 'Media', value: mean.toFixed(2) }, { label: 'Mediana', value: median % 1 === 0 ? String(median) : median.toFixed(1) }].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#0e88a5', fontFamily: 'Georgia,serif' }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px 8px', border: '1px solid rgba(255,255,255,0.07)' }}>
          <PieChart votes={votes} />
          <BarChart votes={votes} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 16 }}>
            {votes.map((v, i) => (
              <div key={i} style={{ flex: v.pct || 1, background: v.color, opacity: v.count ? 0.9 : 0.15, minWidth: v.count ? 2 : 0, transition: 'flex 0.8s' }} title={`${v.text}: ${v.pct}%`} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
            <span>← {votes[0]?.text}</span><span>{votes[votes.length - 1]?.text} →</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {votes.map((v, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: v.color, color: 'white', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{v.tag ?? v.cid}</span>
              <span style={{ width: 110, fontSize: 11.5, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.text}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: v.color, width: `${maxPct > 0 ? (v.pct / maxPct) * 100 : 0}%`, transition: 'width 1s cubic-bezier(0.22,1,0.36,1)' }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 900, color: v.color, minWidth: 38, textAlign: 'right' }}>{v.pct}%</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', minWidth: 20, textAlign: 'right' }}>{v.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Hybrid Overlay ────────────────────────────────────────────────────────────
// Tab "Analisi voti" (barre standard) + "Word Cloud" (commenti liberi)

function HybridOverlay({ votes, openAnswers, cloudWords, onClose }: {
  votes: { cid: string; count: number; pct: number; color: string; tag?: string; text: string }[]
  openAnswers: { id: string; participant_name: string | null; answer: string; submitted_at: string }[]
  cloudWords?: Record<string, string[] | null>
  onClose: () => void
}) {
  const [tab, setTab] = useState<'votes' | 'cloud'>('votes')
  const votedWords = votes
    .filter(v => v.count > 0 && v.cid !== 'altro' && cloudWords?.[v.cid])
    .map(v => ({ words: cloudWords![v.cid]!, count: v.count }))
  const totalVotes = votes.reduce((s, v) => s + v.count, 0)
  const maxPct = Math.max(...votes.map(v => v.pct), 1)
  // Statistiche descrittive (come Delphi ma per hybrid)
  const topChoice = votes.reduce((best, v) => v.count > best.count ? v : best, votes[0] ?? { count: 0, text: '', pct: 0, color: '#0e88a5', cid: '', tag: undefined })
  const secondChoice = [...votes].sort((a, b) => b.count - a.count)[1]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,25,0.75)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0c1a2a', borderRadius: 20, padding: '24px 24px 20px', maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.6)', border: '1px solid rgba(14,136,165,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>Analisi votazione</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              {totalVotes} vot{totalVotes !== 1 ? 'i' : 'o'} · {openAnswers.length} comment{openAnswers.length !== 1 ? 'i' : 'o'}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexShrink: 0 }}>
          <button onClick={() => setTab('votes')}
            style={{ flex: 1, padding: '8px', borderRadius: 8, background: tab === 'votes' ? '#0e88a5' : 'rgba(255,255,255,0.06)', color: tab === 'votes' ? 'white' : 'rgba(255,255,255,0.5)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            ◎ Analisi voti
          </button>
          <button onClick={() => setTab('cloud')}
            style={{ flex: 1, padding: '8px', borderRadius: 8, background: tab === 'cloud' ? '#0e88a5' : 'rgba(255,255,255,0.06)', color: tab === 'cloud' ? 'white' : 'rgba(255,255,255,0.5)', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            ☁ Word Cloud
            {(openAnswers.length > 0 || votedWords.length > 0) && <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{openAnswers.length + votedWords.length}</span>}
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {tab === 'votes' ? (
            <div>
              {totalVotes === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '40px 0' }}>Nessun voto ancora</div>
              ) : (
                <>
                  {/* Top choice badge */}
                  {topChoice && topChoice.count > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 20, background: `${topChoice.color}22`, border: `1.5px solid ${topChoice.color}66`, fontSize: 13, fontWeight: 700, color: topChoice.color }}>
                        <span style={{ fontSize: 15 }}>★</span>
                        <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topChoice.text}</span>
                        <span style={{ fontSize: 11, opacity: 0.8 }}>({topChoice.pct}%)</span>
                      </div>
                    </div>
                  )}
                  {/* Pie + Bar charts */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px 8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <PieChart votes={votes} />
                    <BarChart votes={votes} />
                  </div>
                  {/* Stacked bar */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 14 }}>
                      {votes.map((v, i) => (
                        <div key={i} style={{ flex: v.pct || 1, background: v.color, opacity: v.count ? 0.9 : 0.15, minWidth: v.count ? 2 : 0, transition: 'flex 0.8s' }} title={`${v.text}: ${v.pct}%`} />
                      ))}
                    </div>
                  </div>
                  {/* Dettaglio righe */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {votes.map((v, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 6, background: v.color, color: 'white', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{v.tag ?? String(i + 1)}</span>
                        <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.text}</span>
                        <div style={{ width: 70, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ height: '100%', borderRadius: 4, background: v.color, width: `${maxPct > 0 ? (v.pct / maxPct) * 100 : 0}%`, transition: 'width 1s cubic-bezier(0.22,1,0.36,1)' }} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: v.color, minWidth: 36, textAlign: 'right' }}>{v.pct}%</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', minWidth: 18, textAlign: 'right' }}>{v.count}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{totalVotes} vot{totalVotes !== 1 ? 'i' : 'o'} totali</div>
                </>
              )}
            </div>
          ) : (
            /* Word Cloud tab */
            (openAnswers.length === 0 && votedWords.length === 0) ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '40px 0' }}>Nessun dato disponibile</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '16px', minHeight: 160 }}>
                  <WordCloudView answers={openAnswers} votedWords={votedWords} />
                </div>
                {/* Lista commenti sotto la cloud */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {openAnswers.map((a, i) => (
                    <div key={a.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#0e88a5' }}>Commento {i + 1}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{new Date(a.submitted_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>{a.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ── StatBox ───────────────────────────────────────────────────────────────────

function StatBox({ stats }: { stats: Stat[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(14,136,165,0.12)' }}>
      {stats.map((s, i) => {
        const col = STAT_COLORS[s.color] ?? STAT_COLORS.info
        return (
          <div key={i} style={{ flex: 1, borderRadius: 8, padding: '8px 4px', textAlign: 'center', background: col.bg }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: col.c, opacity: 0.7, letterSpacing: '0.04em' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: col.c, fontFamily: 'Georgia,serif', lineHeight: 1, marginTop: 2 }}>{s.value}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── TableBox ──────────────────────────────────────────────────────────────────

function TableBox({ table }: { table: Table }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(14,136,165,0.12)', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(14,136,165,0.15)', WebkitOverflowScrolling: 'touch', maxWidth: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'auto' }}>
          <thead>
            <tr style={{ background: 'rgba(14,136,165,0.07)' }}>
              {table.headers.map((h, i) => (
                <th key={i} style={{ padding: '6px 10px', textAlign: i < 2 ? 'left' : 'center', fontWeight: 700, color: '#0e88a5', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid rgba(14,136,165,0.15)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : 'rgba(14,136,165,0.02)' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '7px 10px', textAlign: ci < 2 ? 'left' : 'center', color: cell ? '#1e4a5c' : '#ccc', fontWeight: ci === 0 ? 600 : 400, fontFamily: ci >= 2 ? 'Georgia,serif' : 'inherit', fontSize: ci >= 2 ? 13 : 11.5, borderBottom: ri < table.rows.length - 1 ? '1px solid rgba(14,136,165,0.07)' : 'none', whiteSpace: 'nowrap' }}>{cell || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.footer && <div style={{ marginTop: 8, fontSize: 11.5, color: '#4C7D93', fontStyle: 'italic', paddingLeft: 2 }}>{table.footer}</div>}
    </div>
  )
}

// ── VideoBox ──────────────────────────────────────────────────────────────────

function VideoBox({ videos, onOpen }: { videos: Video[]; onOpen: (v: Video) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(14,136,165,0.12)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b9aaa', marginBottom: 2 }}>Video allegati</div>
      {videos.map((v, i) => (
        <button key={i} onClick={() => onOpen(v)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: '1.5px solid #c4e0e9', background: 'white', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', width: '100%' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#0e88a5'; e.currentTarget.style.background = '#e8f4f8' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#c4e0e9'; e.currentTarget.style.background = 'white' }}>
          <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: '#0e88a5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none"><path d="M1 1.5L10 6.5L1 11.5V1.5Z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round" /></svg>
          </span>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#1e4a5c', lineHeight: 1.3 }}>{v.title}</span>
          <span style={{ fontSize: 11, color: '#9cb8c4', flexShrink: 0 }}>▶</span>
        </button>
      ))}
    </div>
  )
}

// ── Video Modal ───────────────────────────────────────────────────────────────

function VideoModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  const handleClose = () => { videoRef.current?.pause(); onClose() }
  return (
    <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(5,15,20,0.85)', backdropFilter: 'blur(8px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0c1a1a', borderRadius: 20, overflow: 'hidden', maxWidth: 860, width: '100%', boxShadow: '0 40px 100px rgba(0,0,0,0.6)', animation: 'popIn .22s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: '#0e88a5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="11" height="13" viewBox="0 0 11 13" fill="none"><path d="M1 1.5L10 6.5L1 11.5V1.5Z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round" /></svg>
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'white' }}>{video.title}</span>
          </div>
          <button onClick={handleClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = 'white' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <video ref={videoRef} src={video.src} controls autoPlay playsInline style={{ width: '100%', display: 'block', maxHeight: '70vh', background: '#000', outline: 'none' }} />
      </div>
    </div>
  )
}

// ── Confirm Popup ─────────────────────────────────────────────────────────────

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
            <path d="M3 10.5L12 3L21 10.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z" stroke="#0e88a5" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M9 21V13h6v8" stroke="#0e88a5" strokeWidth="1.8" strokeLinejoin="round" />
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

// ── Vote Panel ────────────────────────────────────────────────────────────────

function VotePanel({
  sessionId, scene, isAdmin, isDelphi, isOpen, isHybrid, onClose,
}: {
  sessionId: string
  scene: Scene
  isAdmin: boolean
  isDelphi: boolean
  isOpen: boolean
  isHybrid: boolean
  onClose: () => void
}) {
  const { session, votes, totalVotes, openAnswers, refreshVotes, refreshOpenAnswers, openVoting, closeVoting, reveal, resetVotes } = useLiveSession(sessionId)
  const [qrUrl, setQrUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [showDelphiOverlay, setShowDelphiOverlay] = useState(false)
  const [showOpenOverlay, setShowOpenOverlay] = useState(false)
  const [showHybridOverlay, setShowHybridOverlay] = useState(false)

  // Per hybrid: colori custom (non Likert)
  const displayVotes = isDelphi
    ? votes.map((v, i) => ({ ...v, color: likertColor(votes.length, i) }))
    : isHybrid
      ? votes.map((v, i) => ({ ...v, color: CHOICE_COLORS[i % CHOICE_COLORS.length] }))
      : votes

  const voteUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${sessionId}` : ''

  useEffect(() => {
    refreshVotes(scene.choices, scene.id, session?.current_round)
  }, [scene.id, totalVotes, session?.current_round]) // eslint-disable-line react-hooks/exhaustive-deps

  // Delphi: apri overlay al reveal
  useEffect(() => {
    if (isDelphi && session?.revealed) setShowDelphiOverlay(true)
    else if (!session?.revealed) setShowDelphiOverlay(false)
  }, [isDelphi, session?.revealed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open: carica risposte quando cambia scena/round/reset
  useEffect(() => {
    if ((!isOpen && !isHybrid) || !session) return
    const t = setTimeout(() => {
      refreshOpenAnswers(scene.id, session.current_round)
    }, 100)
    return () => clearTimeout(t)
  }, [scene.id, session?.current_round, session?.reset_at, isOpen, isHybrid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hybrid: apri overlay al reveal
  useEffect(() => {
    if (isHybrid && session?.revealed) setShowHybridOverlay(true)
    else if (!session?.revealed) setShowHybridOverlay(false)
  }, [isHybrid, session?.revealed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!voteUrl) return
    QRCode.toDataURL(voteUrl, { width: 220, margin: 1, color: { dark: '#0c2a38', light: '#ffffff' } }).then(setQrUrl)
  }, [voteUrl])

  const copyLink = () => {
    navigator.clipboard.writeText(voteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {showDelphiOverlay && isDelphi && (
        <DelphiOverlay votes={displayVotes} onClose={() => setShowDelphiOverlay(false)} />
      )}
      {showOpenOverlay && isOpen && (
        <OpenAnswersOverlay answers={openAnswers} onClose={() => setShowOpenOverlay(false)} />
      )}
      {showHybridOverlay && isHybrid && (
        <HybridOverlay votes={displayVotes} openAnswers={openAnswers} cloudWords={scene.cloud_words} onClose={() => setShowHybridOverlay(false)} />
      )}

      <div style={{ width: VOTE_PANEL_W, flexShrink: 0, background: '#0c1a2a', display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(14,136,165,0.2)', overflowY: 'auto' }}>

        {/* Panel header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0e88a5', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isHybrid ? 'Voto + commenti' : 'Voto live'}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{totalVotes} vot{totalVotes === 1 ? 'o' : 'i'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {session?.voting_open && <span style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.15)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(74,222,128,0.3)' }}>APERTO</span>}
            {session?.revealed && <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.3)' }}>RIVELATO</span>}
            <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        {/* QR code */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {qrUrl && (
            <div style={{ background: 'white', borderRadius: 10, padding: 8, marginBottom: 8 }}>
              <img src={qrUrl} alt="QR" style={{ width: '100%', display: 'block', borderRadius: 6 }} />
            </div>
          )}
          <button onClick={copyLink} style={{ width: '100%', padding: '7px 0', borderRadius: 8, background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(14,136,165,0.2)', color: copied ? '#4ade80' : '#0e88a5', border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(14,136,165,0.3)'}`, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {copied ? '✓ Link copiato' : 'Copia link'}
          </button>
        </div>

        {/* Contatore / barre */}
        <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* OPEN: solo contatore risposte */}
          {isOpen && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ fontSize: 52, fontWeight: 900, color: session?.voting_open ? '#4ade80' : 'rgba(255,255,255,0.3)', fontFamily: 'Georgia,serif', lineHeight: 1, transition: 'color .3s' }}>
                {openAnswers.length}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {openAnswers.length === 1 ? 'risposta ricevuta' : 'risposte ricevute'}
              </div>
              {openAnswers.length > 0 && (
                <button onClick={() => setShowOpenOverlay(true)}
                  style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: 'rgba(14,136,165,0.2)', color: '#0e88a5', border: '1px solid rgba(14,136,165,0.4)', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,136,165,0.35)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(14,136,165,0.2)' }}>
                  ☁ Vedi risposte
                </button>
              )}
            </div>
          )}

          {/* HYBRID: doppio contatore voti + commenti */}
          {isHybrid && !session?.revealed && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              {/* Voti */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: session?.voting_open ? '#4ade80' : 'rgba(255,255,255,0.3)', fontFamily: 'Georgia,serif', lineHeight: 1, transition: 'color .3s' }}>
                  {totalVotes}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  vot{totalVotes === 1 ? 'o' : 'i'}
                </div>
              </div>
              {/* Separator */}
              <div style={{ width: '60%', height: 1, background: 'rgba(255,255,255,0.08)' }} />
              {/* Commenti */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: openAnswers.length > 0 ? '#c084fc' : 'rgba(255,255,255,0.2)', fontFamily: 'Georgia,serif', lineHeight: 1, transition: 'color .3s' }}>
                  {openAnswers.length}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  comment{openAnswers.length === 1 ? 'o' : 'i'}
                </div>
              </div>
              {session?.reset_at && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '3px 10px', fontSize: 10, color: '#fbbf24' }}>
                  Votazione precedente già raccolta
                </div>
              )}
            </div>
          )}

          {/* HYBRID rivelato: barre + bottone overlay */}
          {isHybrid && session?.revealed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {displayVotes.map((v, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 5, background: v.color, color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{v.tag ?? String(i + 1)}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: v.color }}>{v.pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: v.color, width: `${v.pct}%`, transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
                  </div>
                </div>
              ))}
              {/* Badge commenti */}
              {openAnswers.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 8, background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.25)', fontSize: 11, color: '#c084fc' }}>
                  <span style={{ fontSize: 14 }}>💬</span>
                  {openAnswers.length} commento{openAnswers.length !== 1 ? 'i' : ''}
                </div>
              )}
              <button onClick={() => setShowHybridOverlay(true)}
                style={{ marginTop: 4, width: '100%', padding: '8px 0', borderRadius: 8, background: 'rgba(14,136,165,0.2)', color: '#0e88a5', border: '1px solid rgba(14,136,165,0.4)', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,136,165,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(14,136,165,0.2)' }}>
                ◎ Analisi votazione
              </button>
            </div>
          )}

          {/* NORMALE / DELPHI: logica esistente */}
          {!isOpen && !isHybrid && (
            session?.revealed ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                {displayVotes.map((v, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ width: 20, height: 20, borderRadius: 5, background: v.color, color: 'white', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{isDelphi ? v.cid : i + 1}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: v.color }}>{v.pct}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: v.color, width: `${v.pct}%`, transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)' }} />
                    </div>
                  </div>
                ))}
                {isDelphi && (
                  <button onClick={() => setShowDelphiOverlay(true)}
                    style={{ marginTop: 4, width: '100%', padding: '8px 0', borderRadius: 8, background: 'rgba(14,136,165,0.2)', color: '#0e88a5', border: '1px solid rgba(14,136,165,0.4)', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,136,165,0.35)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(14,136,165,0.2)' }}>
                    ◎ Analisi dettagliata
                  </button>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 8 }}>
                <div style={{ fontSize: 58, fontWeight: 900, color: session?.voting_open ? '#4ade80' : 'rgba(255,255,255,0.3)', fontFamily: 'Georgia,serif', lineHeight: 1, transition: 'color .3s' }}>
                  {totalVotes}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {totalVotes === 1 ? 'voto ricevuto' : 'voti ricevuti'}
                </div>
                {session?.reset_at && (
                  <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 20, padding: '3px 10px', fontSize: 10, color: '#fbbf24' }}>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M13.5 8A5.5 5.5 0 1 1 2.5 8a5.5 5.5 0 0 1 11 0z" stroke="#fbbf24" strokeWidth="1.5" /><path d="M8 5v3l2 2" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    Votazione precedente già raccolta
                  </div>
                )}
                {session?.voting_open && totalVotes > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
            {!session?.voting_open && !session?.revealed && (
              <button onClick={openVoting} style={{ padding: '9px', borderRadius: 8, background: '#16803d', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ▶ Apri voto
              </button>
            )}
            {session?.voting_open && (
              <button onClick={closeVoting} style={{ padding: '9px', borderRadius: 8, background: '#b45309', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ■ Chiudi voto
              </button>
            )}
            {!session?.voting_open && !session?.revealed && totalVotes > 0 && (
              <button onClick={reveal} style={{ padding: '9px', borderRadius: 8, background: '#0e88a5', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ★ Rivela risultati
              </button>
            )}
            {(totalVotes > 0 || isOpen || isHybrid) && (
              <button onClick={resetVotes} style={{ padding: '7px', borderRadius: 8, background: 'rgba(220,38,38,0.12)', color: '#fca5a5', border: '1px solid rgba(220,38,38,0.25)', fontSize: 11, cursor: 'pointer' }}>
                Reset voti
              </button>
            )}
            {/* Bottone riapertura overlay hybrid post-reveal */}
            {isHybrid && session?.revealed && (
              <button onClick={() => setShowHybridOverlay(true)}
                style={{ padding: '7px', borderRadius: 8, background: 'rgba(14,136,165,0.15)', color: '#0e88a5', border: '1px solid rgba(14,136,165,0.3)', fontSize: 11, cursor: 'pointer' }}>
                ◎ Analisi votazione
              </button>
            )}
            {/* Pulsante navigazione */}
            {(isDelphi || isOpen || isHybrid) && (
              <div style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 2, fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
                Usa "Avanti →" per procedere
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── Summary View ──────────────────────────────────────────────────────────────
// Mostra stato consenso per tutte le scene Delphi della sessione

interface DelphiSummaryItem {
  sceneId: string
  title: string
  consensusOk: boolean
  consensusLabel: string
  consensusPct: number
  totalVotes: number
  color: string
}

function SummaryView({ scenes, sessionId }: {
  scenes: Scene[]
  sessionId: string | null
}) {
  const supabase = createClient()
  const [items, setItems] = useState<DelphiSummaryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) { setLoading(false); return }
    const delphiScenes = scenes.filter(s => s.mode === 'delphi')
    if (!delphiScenes.length) { setLoading(false); return }
    Promise.all(delphiScenes.map(async s => {
      const { data } = await supabase.from('live_votes').select('choice_id').eq('session_id', sessionId).eq('scene_id', s.id)
      if (!data || !data.length) return null
      const total = data.length
      const n = s.choices.length
      const lo = Math.ceil(n / 3), hi = n - Math.floor(n / 3)
      const counts: Record<string, number> = {}
      data.forEach(v => { counts[v.choice_id] = (counts[v.choice_id] ?? 0) + 1 })
      const loPct = s.choices.filter(c => Number(c.tag ?? s.choices.indexOf(c) + 1) <= lo).reduce((sum, c) => sum + (counts[c.id ?? ''] ?? 0), 0) / total
      const miPct = s.choices.filter(c => { const t = Number(c.tag ?? s.choices.indexOf(c) + 1); return t > lo && t < hi }).reduce((sum, c) => sum + (counts[c.id ?? ''] ?? 0), 0) / total
      const hiPct = s.choices.filter(c => Number(c.tag ?? s.choices.indexOf(c) + 1) >= hi).reduce((sum, c) => sum + (counts[c.id ?? ''] ?? 0), 0) / total
      let consensusOk = false, consensusLabel = 'Nessun consenso', consensusPct = 0, color = '#f97316'
      if (loPct >= 0.75)      { consensusOk = true; consensusLabel = 'Consenso: Disaccordo'; consensusPct = Math.round(loPct * 100); color = '#ef4444' }
      else if (miPct >= 0.75) { consensusOk = true; consensusLabel = 'Consenso: Neutro';     consensusPct = Math.round(miPct * 100); color = '#eab308' }
      else if (hiPct >= 0.75) { consensusOk = true; consensusLabel = 'Consenso: Accordo';    consensusPct = Math.round(hiPct * 100); color = '#22c55e' }
      return { sceneId: s.id, title: s.title, consensusOk, consensusLabel, consensusPct, totalVotes: total, color } as DelphiSummaryItem
    })).then(results => { setItems(results.filter(Boolean) as DelphiSummaryItem[]); setLoading(false) })
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div style={{ width: 24, height: 24, border: '3px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /></div>
  if (!items.length) return <div style={{ textAlign: 'center', color: '#9cb8c4', fontSize: 14, padding: 40 }}>Nessun dato disponibile.</div>

  const reached    = items.filter(i => i.consensusOk).length
  const total      = items.length
  const accordo    = items.filter(i => i.consensusLabel === 'Consenso: Accordo').length
  const disaccordo = items.filter(i => i.consensusLabel === 'Consenso: Disaccordo').length
  const neutro     = items.filter(i => i.consensusLabel === 'Consenso: Neutro').length
  const noConsensus = total - reached

  const getLabelInfo = (item: DelphiSummaryItem) => {
    if (!item.consensusOk) return { text: 'No consenso', color: '#f97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.28)', icon: '○' }
    if (item.consensusLabel === 'Consenso: Accordo')    return { text: 'Accordo',    color: '#0e88a5', bg: 'rgba(14,136,165,0.10)',  border: 'rgba(14,136,165,0.28)',  icon: '↑' }
    if (item.consensusLabel === 'Consenso: Disaccordo') return { text: 'Disaccordo', color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.28)',   icon: '↓' }
    if (item.consensusLabel === 'Consenso: Neutro')     return { text: 'Neutro',     color: '#eab308', bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.28)',   icon: '~' }
    return { text: item.consensusLabel, color: item.color, bg: `${item.color}18`, border: `${item.color}38`, icon: '✓' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>

      {/* Stat row */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {[
          { value: reached,     label: 'Consenso',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.22)',  icon: '✓' },
          { value: noConsensus, label: 'No consenso', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.22)', icon: '○' },
          { value: accordo,     label: 'Accordo',     color: '#0e88a5', bg: 'rgba(14,136,165,0.08)', border: 'rgba(14,136,165,0.22)', icon: '↑' },
          { value: disaccordo,  label: 'Disaccordo',  color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.22)',  icon: '↓' },
          { value: neutro,      label: 'Neutro',      color: '#eab308', bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.22)',  icon: '~' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 12, padding: '10px 4px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: s.color, fontWeight: 800, opacity: 0.6, marginBottom: 1 }}>{s.icon}</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: s.color, fontFamily: 'Georgia,serif', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 8 }}>
          <div style={{ flex: accordo,     background: '#0e88a5', opacity: 0.85 }} />
          <div style={{ flex: neutro,      background: '#eab308', opacity: 0.85 }} />
          <div style={{ flex: disaccordo,  background: '#ef4444', opacity: 0.85 }} />
          <div style={{ flex: noConsensus, background: '#f97316', opacity: 0.45 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, fontWeight: 600 }}>
          <span style={{ color: '#0e88a5' }}>↑ Accordo ({accordo})</span>
          {neutro > 0 && <span style={{ color: '#eab308' }}>~ Neutro ({neutro})</span>}
          <span style={{ color: '#ef4444' }}>↓ Disaccordo ({disaccordo})</span>
        </div>
      </div>

      {/* Grid 2 colonne */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, minHeight: 0 }}>
        {items.map((item, i) => {
          const lbl = getLabelInfo(item)
          return (
            <div key={item.sceneId} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, background: `${lbl.color}07`, border: `1.5px solid ${lbl.border}`, minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: `${lbl.color}18`, color: lbl.color, fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <span style={{ fontSize: 14, color: '#1e4a5c', lineHeight: 1.4, fontWeight: 500 }}>{item.title}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: lbl.bg, color: lbl.color, border: `1px solid ${lbl.border}` }}>
                  {lbl.icon} {lbl.text}{item.consensusOk ? ` · ${item.consensusPct}%` : ''}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', fontWeight: 500 }}>{item.totalVotes} voti</span>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}


// ── Main ──────────────────────────────────────────────────────────────────────

type Phase = 'visible' | 'fading-out' | 'hidden' | 'fading-in'

function GamePageInner() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params?.slug as string
  const sessionId = searchParams.get('session')

  const [data, setData] = useState<ScenarioData | null>(null)
  const [currentId, setCurrentId] = useState('intro')
  const [history, setHistory] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('visible')
  const [imgError, setImgError] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [username, setUsername] = useState('')
  const [activeVideo, setActiveVideo] = useState<Video | null>(null)
  const [showVotePanel, setShowVotePanel] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const supabase = createClient()

  const prevSceneIdRef = useRef<string | null>(null)
  const setLiveSceneId = useCallback(async (sceneId: string) => {
    if (!sessionId) return
    await supabase.from('live_sessions').update({
      scene_id: sceneId, voting_open: false, revealed: false, current_round: 1,
    }).eq('id', sessionId)
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendingImageRef = useRef<string | null>(null)
  const imgLoadedRef = useRef<boolean>(false)
  const { startSession, trackScene, endSession } = useUcbTracking()
  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startFadeIn = useCallback(() => {
    if (fallbackRef.current) { clearTimeout(fallbackRef.current); fallbackRef.current = null }
    setPhase('fading-in')
    timerRef.current = setTimeout(() => setPhase('visible'), T_IN)
  }, [])

  useEffect(() => {
    if (!sessionId) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('user_profiles').select('is_admin').eq('id', user.id).single()
        .then(({ data }) => setIsAdmin(!!data?.is_admin))
    })
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slug) return
    fetch(`/stories/${slug}/scenario.json`).then(r => r.json()).then(d => {
      setData(d)
      const introScene = d.scenes.find((s: { id: string; type: string }) => s.id === 'intro')
      if (introScene) trackScene({ sceneId: 'intro', sceneType: introScene.type })
    })
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!slug) return
    const init = async () => {
      let uname = sessionStorage.getItem('mg_username')
      if (!uname) {
        const { data: { user } } = await supabase.auth.getUser()
        uname = user?.email ?? null
        if (uname) sessionStorage.setItem('mg_username', uname)
      }
      if (uname) { setUsername(uname); startSession({ username: uname, storySlug: slug }) }
    }
    init()
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= BP)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const scene = data?.scenes.find(s => s.id === currentId)

  const go = useCallback((nextId: string, back = false, choiceText?: string) => {
    if (phase !== 'visible') return
    if (timerRef.current) clearTimeout(timerRef.current)
    if (fallbackRef.current) clearTimeout(fallbackRef.current)
    setPhase('fading-out')
    timerRef.current = setTimeout(() => {
      if (back) {
        setHistory(h => h.slice(0, -1))
        setCurrentId(nextId)
      } else {
        setHistory(h => [...h, currentId])
        setCurrentId(nextId)
        const nextScene = data?.scenes.find(s => s.id === nextId)
        if (nextScene) trackScene({ sceneId: nextId, sceneType: nextScene.type, choiceText })
        if (sessionId && nextScene?.type === 'decision') setLiveSceneId(nextId)
      }
      setImgError(false)
      setPhase('hidden')
      scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
      const nextScene = data?.scenes.find(s => s.id === nextId)
      const nextImgSrc = nextScene?.image ?? null
      if (!nextImgSrc) {
        pendingImageRef.current = null
        timerRef.current = setTimeout(startFadeIn, T_PRE)
        return
      }
      pendingImageRef.current = nextImgSrc
      imgLoadedRef.current = false
      fallbackRef.current = setTimeout(() => {
        if (pendingImageRef.current === nextImgSrc && !imgLoadedRef.current) startFadeIn()
      }, T_IMG_FALLBACK)
    }, T_OUT)
  }, [phase, currentId, data, startFadeIn, sessionId, setLiveSceneId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleImgLoad = useCallback((src: string) => {
    if (pendingImageRef.current === src && phase === 'hidden') {
      imgLoadedRef.current = true
      if (fallbackRef.current) { clearTimeout(fallbackRef.current); fallbackRef.current = null }
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      startFadeIn()
    }
  }, [phase, startFadeIn])

  const goBack = useCallback(() => {
    if (history.length && phase === 'visible') go(history[history.length - 1], true)
  }, [history, phase, go])

  useEffect(() => {
    if (!scene) return
    if (scene.type === 'endpoint') endSession(true)
    if (sessionId && scene.type === 'decision' && prevSceneIdRef.current !== null && prevSceneIdRef.current !== scene.id) {
      setLiveSceneId(scene.id)
    }
    prevSceneIdRef.current = scene.id
  }, [scene?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionId && scene?.type === 'decision') {
      setShowVotePanel(true)
    } else {
      setShowVotePanel(false)
    }
  }, [scene?.id, sessionId])

  useEffect(() => {
    const handler = () => endSession(false)
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogoClick = useCallback(() => setShowConfirm(true), [])

  const handleConfirmRestart = useCallback(() => {
    setShowConfirm(false)
    endSession(false).then(() => {
      if (slug && username) startSession({ username, storySlug: slug })
      const introScene = data?.scenes.find(s => s.id === 'intro')
      if (introScene) trackScene({ sceneId: 'intro', sceneType: introScene.type })
    })
    setHistory([])
    setCurrentId('intro')
    setImgError(false)
    pendingImageRef.current = null
    setPhase('fading-out')
    timerRef.current = setTimeout(() => {
      setPhase('hidden')
      timerRef.current = setTimeout(() => {
        setPhase('fading-in')
        timerRef.current = setTimeout(() => setPhase('visible'), T_IN)
      }, T_PRE)
    }, T_OUT)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !scene) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0eb' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const cfg = CFG[scene.type] ?? CFG.info
  const isInfo = scene.type === 'info'
  const isDecision = scene.type === 'decision'
  const isEndpoint = scene.type === 'endpoint'
  const isDelphi  = scene.mode === 'delphi'
  const isOpen    = scene.mode === 'open'
  const isHybrid  = scene.mode === 'hybrid'
  const isSummary = scene.type === 'summary'
  const badgeColors = scene.badgeColor ? BADGE_COLORS[scene.badgeColor] : BADGE_COLORS.info
  const accentLine = isDecision ? cfg.accent : isEndpoint ? '#16803d' : scene.type === 'outcome' ? '#b45309' : '#c4e0e9'

  const isOut = phase === 'fading-out' || phase === 'hidden'
  const sharedOpacity = isOut ? 0 : 1
  const sharedTransition = phase === 'fading-out' ? `opacity ${T_OUT}ms ease-out` : phase === 'fading-in' ? `opacity ${T_IN}ms cubic-bezier(0.4,0,0.2,1)` : 'none'

  const imgStyle: React.CSSProperties = { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sharedOpacity, transition: sharedTransition }
  const textStyle: React.CSSProperties = {
    height: '100%', display: 'flex', flexDirection: 'column', padding: '22px 26px 20px',
    opacity: sharedOpacity,
    transform: isOut ? 'translateX(8px)' : phase === 'fading-in' ? 'translateX(-3px)' : 'translateX(0)',
    transition: phase === 'fading-out' ? `opacity ${T_OUT}ms ease-out, transform ${T_OUT}ms ease-out` : phase === 'fading-in' ? `opacity ${T_IN}ms cubic-bezier(0.4,0,0.2,1), transform ${T_IN}ms cubic-bezier(0.22,1,0.36,1)` : 'none',
  }
  const mobileTextStyle: React.CSSProperties = { opacity: sharedOpacity, transition: sharedTransition }

  const imgLayer = (
    <div style={imgStyle}>
      {scene.image && !imgError ? (
        <Image key={scene.image} src={scene.image} alt={scene.imageAlt ?? scene.title} fill sizes={isDesktop ? '65vw' : '100vw'} quality={95} priority
          style={{ objectFit: 'cover', objectPosition: 'center' }}
          onLoad={() => handleImgLoad(scene.image!)}
          onError={() => { setImgError(true); if (pendingImageRef.current === scene.image) startFadeIn() }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <svg width="52" height="52" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.22 }}>
            <rect x="24" y="8" width="16" height="48" rx="4" fill={cfg.accent} />
            <rect x="8" y="24" width="48" height="16" rx="4" fill={cfg.accent} />
          </svg>
          <div style={{ fontSize: 12, fontWeight: 600, color: cfg.accent, opacity: 0.4 }}>Nessuna immagine</div>
        </div>
      )}
    </div>
  )

  const imgOverlays = (
    <>
      <div style={{ position: 'absolute', top: 12, left: 14, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', border: `1px solid ${cfg.accent}28`, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: cfg.accent, zIndex: 2, opacity: isInfo ? 0 : 1, pointerEvents: 'none' }}>{cfg.label}</div>
      {scene.badge && <div style={{ position: 'absolute', top: 12, right: 14, padding: '3px 10px', borderRadius: 20, backdropFilter: 'blur(8px)', fontSize: 9.5, fontWeight: 600, background: badgeColors.bg, color: badgeColors.color, border: badgeColors.border, zIndex: 2 }}>{scene.badge}</div>}
      <div style={{ position: 'absolute', bottom: 10, left: 14, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(4px)', fontSize: 8.5, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', zIndex: 2 }}>{scene.id}</div>
    </>
  )

  // ── Bottoni scelta ────────────────────────────────────────────────────────
  const choicesBtns = isDelphi ? (
    // Delphi: visualizzazione scale Likert (non cliccabile dal moderatore)
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9cb8c4', marginBottom: 8 }}>
        <span>← {scene.choices[0]?.text}</span>
        <span>{scene.choices[scene.choices.length - 1]?.text} →</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {scene.choices.map((c, i) => {
          const color = likertColor(scene.choices.length, i)
          return (
            <div key={i} style={{ flex: 1, padding: '14px 4px 10px', borderRadius: 10, border: `2px solid ${color}44`, background: `${color}0d`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{c.tag ?? String(i + 1)}</span>
              <span style={{ fontSize: 8, color: 'rgba(0,0,0,0.4)', textAlign: 'center', lineHeight: 1.2 }}>{c.text}</span>
            </div>
          )
        })}
      </div>
      {scene.next && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={() => go(scene.next!, false)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, background: cfg.accent, color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0c6d82' }}
            onMouseLeave={e => { e.currentTarget.style.background = cfg.accent }}>
            Avanti <span style={{ fontSize: 16 }}>→</span>
          </button>
        </div>
      )}
    </div>
  ) : isOpen ? (
    // Open: solo pulsante Avanti
    <div>
      {scene.next && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={() => go(scene.next!, false)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, background: cfg.accent, color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0c6d82' }}
            onMouseLeave={e => { e.currentTarget.style.background = cfg.accent }}>
            Avanti <span style={{ fontSize: 16 }}>→</span>
          </button>
        </div>
      )}
    </div>
  ) : isHybrid ? (
    // Hybrid: scelte preview (non cliccabili) + campo testo indicato + bottone Avanti
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, opacity: 0.7, pointerEvents: 'none' }}>
        {scene.choices.map((c, i) => {
          const color = CHOICE_COLORS[i % CHOICE_COLORS.length]
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${color}33`, background: `${color}08` }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${color}55`, flexShrink: 0 }} />
              {c.tag && <span style={{ width: 22, height: 22, borderRadius: 6, background: color, color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.tag}</span>}
            <span style={{ fontSize: 13, color: '#0c2a38', fontWeight: 600 }}>{c.text}</span>
            </div>
          )
        })}
        <div style={{ marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1.5px dashed rgba(14,136,165,0.3)', background: 'rgba(14,136,165,0.04)', fontSize: 12, color: '#4a7a8a', fontStyle: 'italic', fontWeight: 600 }}>
          + Commento libero (opzionale)
        </div>
      </div>
      {scene.next && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => go(scene.next!, false)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, background: cfg.accent, color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0c6d82' }}
            onMouseLeave={e => { e.currentTarget.style.background = cfg.accent }}>
            Avanti <span style={{ fontSize: 16 }}>→</span>
          </button>
        </div>
      )}
    </div>
  ) : (
    // Normale: scelte cliccabili
    <div style={{ display: 'flex', flexDirection: isDecision ? 'column' : 'row', flexWrap: isDecision ? 'nowrap' : 'wrap', gap: 7, justifyContent: isSummary ? 'flex-end' : 'flex-start' }}>
      {scene.choices.map((choice, i) => {
        if (isDecision) return (
          <button key={i} onClick={() => go(choice.next!, false, choice.text)}
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
          <button key={i} onClick={() => go(choice.next!, false, choice.text)}
            style={{ padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s', background: neutral ? 'white' : isEndpoint ? '#f0fdf4' : cfg.accent, color: neutral ? '#4C7D93' : isEndpoint ? '#15803d' : 'white', border: neutral ? '1.5px solid #c4e0e9' : isEndpoint ? '1.5px solid #bbf7d0' : 'none' }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.93)' }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}>
            {choice.text}
          </button>
        )
      })}
    </div>
  )

  const textContent = (compact = false) => (
    <>
      <div style={{ marginBottom: compact ? 10 : 14, flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 5, background: cfg.light, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: cfg.accent, marginBottom: compact ? 7 : 9, opacity: isInfo ? 0 : 1, pointerEvents: 'none' }}>{cfg.label}</div>
        <h2 style={{ margin: 0, fontSize: compact ? 17 : 19, fontWeight: 800, color: '#0c2a38', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{scene.title}</h2>
        {scene.context && <p style={{ margin: '4px 0 0', fontSize: compact ? 11 : 11.5, fontStyle: 'italic', color: '#6b9aaa' }}>{scene.context}</p>}
      </div>
      <div style={{ height: 1, background: `linear-gradient(to right,${cfg.accent}25,transparent)`, marginBottom: compact ? 12 : 14, flexShrink: 0 }} />
      <div style={{ flex: compact ? undefined : 1, fontSize: 13.5, color: '#1e4a5c', lineHeight: 1.65, overflowY: compact ? undefined : 'auto', minHeight: 0, marginBottom: compact ? 16 : 0 }}>
        {parseText(scene.text)}
        {scene.stats && scene.stats.length > 0 && <StatBox stats={scene.stats} />}
        {scene.table && <TableBox table={scene.table} />}
        {scene.videos && scene.videos.length > 0 && <VideoBox videos={scene.videos} onOpen={setActiveVideo} />}
      </div>
      <div style={{ marginTop: compact ? 0 : 16, flexShrink: 0 }}>
        {isDecision && !isDelphi && !isOpen && !isHybrid && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b9aaa', marginBottom: 8 }}>Seleziona la tua scelta</div>}
        {isHybrid && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b9aaa', marginBottom: 8 }}>Voto + commento libero</div>}
        {isSummary && data && (
          <SummaryView scenes={data.scenes} sessionId={sessionId} />
        )}
        {!isSummary && choicesBtns}
        {isSummary && choicesBtns}
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
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
      `}</style>

      {showConfirm && <ConfirmPopup onConfirm={handleConfirmRestart} onCancel={() => setShowConfirm(false)} />}
      {activeVideo && <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />}

      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#eae5de', fontFamily: "'Segoe UI',system-ui,sans-serif", overflow: 'hidden' }}>

        {/* Navbar */}
        <nav style={{ flexShrink: 0, height: 42, background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(14,136,165,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.push('/')} title="Home"
              style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e8f4f8', border: '1px solid #c4e0e9', cursor: 'pointer', transition: 'all .15s', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#c4e0e9' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#e8f4f8' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M3 10.5L12 3L21 10.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z" stroke="#0e88a5" strokeWidth="2" strokeLinejoin="round" />
                <path d="M9 21V13h6v8" stroke="#0e88a5" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </button>
            <button onClick={goBack} disabled={history.length === 0} title="Torna indietro"
              style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: history.length > 0 ? cfg.light : 'transparent', border: `1px solid ${history.length > 0 ? cfg.accent + '33' : 'rgba(0,0,0,0.08)'}`, cursor: history.length > 0 ? 'pointer' : 'default', transition: 'all .15s' }}
              onMouseEnter={e => { if (history.length > 0) e.currentTarget.style.background = '#c4e0e9' }}
              onMouseLeave={e => { e.currentTarget.style.background = history.length > 0 ? cfg.light : 'transparent' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke={history.length > 0 ? cfg.accent : '#ccc'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button onClick={handleLogoClick} title="Ricomincia" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'opacity .15s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }} onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
              <Image src="/images/LOGO.webp" alt="Logo" width={84} height={24} style={{ objectFit: 'contain', height: 24, width: 'auto' }} />
              {isDesktop && <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0e88a5' }}>{data.title}</span>}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {username && <div style={{ fontSize: 11, color: '#4C7D93', background: '#f0f4f6', padding: '3px 10px', borderRadius: 20, fontWeight: 500 }}>👤 {username}</div>}
            {sessionId && isDecision && (
              <button onClick={() => setShowVotePanel(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, background: showVotePanel ? '#0e88a5' : '#e8f4f8', color: showVotePanel ? 'white' : '#0e88a5', border: `1px solid ${showVotePanel ? '#0e88a5' : '#c4e0e9'}`, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="8" width="3" height="6" rx="1" fill="currentColor" /><rect x="6.5" y="5" width="3" height="9" rx="1" fill="currentColor" /><rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor" /></svg>
                {showVotePanel ? 'Chiudi voto' : 'Voto live'}
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 11px', borderRadius: 20, background: cfg.light, border: `1px solid ${cfg.accent}22` }}>
              <span style={{ fontSize: 10.5, color: cfg.accent, fontWeight: 700, fontFamily: 'monospace' }}>{String(history.length + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 9.5, color: cfg.accent, opacity: 0.55 }}>/ step</span>
            </div>
          </div>
        </nav>

        {/* Content area */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isDesktop ? '16px 28px' : '12px 16px', transition: 'padding .3s ease' }}>
            {isDesktop ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 48px rgba(0,0,0,0.16)' }}>
                {!isSummary && (
                  <div style={{ width: IMG_WIDTH, flexShrink: 0, position: 'relative', background: 'linear-gradient(160deg,#1e2e2e 0%,#243535 60%,#1a2828 100%)', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,0.3) 100%)', pointerEvents: 'none', zIndex: 1 }} />
                    {imgLayer}
                    {imgOverlays}
                  </div>
                )}
                <div ref={scrollRef} style={{ flex: 1, background: 'white', borderLeft: `3px solid ${accentLine}`, overflowY: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={textStyle}>{textContent()}</div>
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: 520, maxHeight: '100%', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', flexShrink: 0, background: 'linear-gradient(160deg,#1e2e2e,#243535)', overflow: 'hidden' }}>
                  {imgLayer}
                  {imgOverlays}
                </div>
                <div ref={scrollRef} style={{ flex: 1, background: 'white', borderLeft: `3px solid ${accentLine}`, overflowY: 'auto', padding: '16px 18px' }}>
                  <div style={mobileTextStyle}>{textContent(true)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Vote Panel */}
          {sessionId && showVotePanel && scene && (
            <VotePanel
              sessionId={sessionId}
              scene={scene}
              isAdmin={isAdmin}
              isDelphi={isDelphi}
              isOpen={isOpen}
              isHybrid={isHybrid}
              onClose={() => setShowVotePanel(false)}
            />
          )}
        </div>
      </div>
    </>
  )
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0eb' }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <GamePageInner />
    </Suspense>
  )
}

// ULTIMA VERSIONE