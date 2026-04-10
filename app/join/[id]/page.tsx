'use client'

import { Suspense, useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Session { id: string; name: string; story_slug: string }

function JoinForm() {
  const router   = useRouter()
  const params   = useParams()
  const sid      = params?.id as string
  const supabase = createClient()

  const [session,       setSession]       = useState<Session | null>(null)
  const [notFound,      setNotFound]      = useState(false)
  const [mode,          setMode]          = useState<'login' | 'register'>('register')
  const [firstName,     setFirstName]     = useState('')
  const [lastName,      setLastName]      = useState('')
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [showPwd,       setShowPwd]       = useState(false)
  const [privacyOk,     setPrivacyOk]     = useState(false)
  const [marketingOk,   setMarketingOk]   = useState(false)
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [checking,      setChecking]      = useState(true)

  // Se già loggato, vai direttamente alla vote page
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(`/vote/${sid}`)
      else setChecking(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sid) return
    supabase.from('live_sessions').select('id,name,story_slug').eq('id', sid).single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return }
        setSession(data)
      })
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    setError('')
    if (!email.trim() || !password) { setError('Inserisci email e password.'); return }

    if (mode === 'register') {
      if (!firstName.trim()) { setError('Inserisci il tuo nome.'); return }
      if (!lastName.trim())  { setError('Inserisci il tuo cognome.'); return }
      if (!privacyOk)        { setError('Devi accettare la Privacy Policy per continuare.'); return }
      setLoading(true)
      const fullName = `${firstName.trim()} ${lastName.trim()}`
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: {
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            marketing_consent: marketingOk,
            marketing_consent_at: marketingOk ? new Date().toISOString() : null,
          } }
      })
      if (err) {
        setError(err.message === 'User already registered'
          ? 'Email già registrata. Accedi invece.'
          : 'Errore nella registrazione. Riprova.')
        setLoading(false)
        return
      }
    } else {
      setLoading(true)
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) { setError('Credenziali non valide.'); setLoading(false); return }
      if (data.user?.email) sessionStorage.setItem('mg_username', data.user.user_metadata?.full_name || data.user.email)
    }
    router.replace(`/vote/${sid}`)
  }

  const bc = (hasError: boolean) => hasError ? '#dc2626' : 'rgba(255,255,255,0.15)'

  if (checking || (!session && !notFound)) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#0c1a2a,#0e2a3a)' }}>
      {notFound
        ? <div style={{ textAlign: 'center', color: '#9cb8c4' }}><div style={{ fontSize: 40, marginBottom: 8 }}>404</div><div>Sessione non trovata</div></div>
        : <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.3)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      }
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.5)', animation: 'fadeUp .3s cubic-bezier(0.22,1,0.36,1)' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0c1a2a,#0e2a3a)', padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Image src="/images/LOGO.webp" alt="Logo" width={100} height={28} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Sessione live</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{session?.name}</div>
        </div>
        {/* Mode tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 3, gap: 3, marginTop: 4 }}>
          {(['register', 'login'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }}
              style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all .15s', background: mode === m ? 'white' : 'transparent', color: mode === m ? '#0c2a38' : 'rgba(255,255,255,0.55)' }}>
              {m === 'register' ? 'Registrati' : 'Accedi'}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Nome e Cognome solo in registrazione */}
        {mode === 'register' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4C7D93', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Nome</label>
              <input type="text" autoFocus value={firstName} onChange={e => { setFirstName(e.target.value); setError('') }}
                placeholder="Mario"
                style={{ width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 14, border: '1.5px solid #c4e0e9', outline: 'none', color: '#0c2a38', fontFamily: 'inherit' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#c4e0e9' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4C7D93', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Cognome</label>
              <input type="text" value={lastName} onChange={e => { setLastName(e.target.value); setError('') }}
                placeholder="Rossi"
                style={{ width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 14, border: '1.5px solid #c4e0e9', outline: 'none', color: '#0c2a38', fontFamily: 'inherit' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#c4e0e9' }}
              />
            </div>
          </div>
        )}

        {/* Email */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4C7D93', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Email</label>
          <input type="email" autoFocus={mode === 'login'} value={email} onChange={e => { setEmail(e.target.value); setError('') }}
            autoComplete="email" placeholder="nome@esempio.it"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{ width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 14, border: `1.5px solid ${bc(!!error)}`, outline: 'none', color: '#0c2a38', fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
            onBlur={e => { e.currentTarget.style.borderColor = bc(!!error) }}
          />
        </div>

        {/* Password */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4C7D93', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError('') }}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%', padding: '11px 42px 11px 13px', borderRadius: 10, fontSize: 14, border: `1.5px solid ${bc(!!error)}`, outline: 'none', color: '#0c2a38', fontFamily: 'inherit' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
              onBlur={e => { e.currentTarget.style.borderColor = bc(!!error) }}
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9cb8c4', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0e88a5' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9cb8c4' }}>
              {showPwd
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
          {mode === 'register' && <div style={{ fontSize: 11, color: '#9cb8c4', marginTop: 4 }}>Minimo 6 caratteri</div>}
        </div>

        {/* Privacy checkbox — solo in registrazione */}
        {mode === 'register' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 10, background: privacyOk ? '#f0f8fb' : '#fafafa', border: `1.5px solid ${privacyOk ? '#c4e0e9' : '#e8e8e8'}`, transition: 'all .15s' }}>
            <input type="checkbox" checked={privacyOk} onChange={e => { setPrivacyOk(e.target.checked); setError('') }}
              style={{ marginTop: 2, flexShrink: 0, accentColor: '#0e88a5', width: 16, height: 16 }} />
            <span style={{ fontSize: 12, color: '#4C7D93', lineHeight: 1.5 }}>
              Ho letto e accetto la{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer"
                style={{ color: '#0e88a5', fontWeight: 700, textDecoration: 'underline' }}
                onClick={e => e.stopPropagation()}>
                Privacy Policy
              </a>
              {' '}e acconsento al trattamento dei miei dati personali per la partecipazione a questa sessione formativa.
            </span>
          </label>
        )}

        {/* Marketing consent — solo in registrazione, facoltativo */}
        {mode === 'register' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 10, background: marketingOk ? '#f0f8fb' : '#fafafa', border: `1.5px solid ${marketingOk ? '#c4e0e9' : '#e8e8e8'}`, transition: 'all .15s' }}>
            <input type="checkbox" checked={marketingOk} onChange={e => setMarketingOk(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0, accentColor: '#0e88a5', width: 16, height: 16 }} />
            <span style={{ fontSize: 12, color: '#4C7D93', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: '#0c2a38' }}>Facoltativo</span> — Acconsento a ricevere comunicazioni via email da Helaglobe S.r.l. su eventi, prodotti e iniziative formative in ambito medico-scientifico. Il consenso è revocabile in qualsiasi momento.
            </span>
          </label>
        )}

        {/* Errore */}
        {error && (
          <div style={{ padding: '9px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12.5, color: '#dc2626' }}>
            {error}
            {error.includes('già registrata') && (
              <button onClick={() => { setMode('login'); setError('') }}
                style={{ marginLeft: 8, background: 'none', border: 'none', color: '#0e88a5', fontSize: 12.5, cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                Accedi →
              </button>
            )}
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading}
          style={{ padding: '12px 0', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer', background: loading ? '#9cb8c4' : '#0e88a5', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0c6d82' }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#0e88a5' }}>
          {loading
            ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />{mode === 'login' ? 'Accesso…' : 'Registrazione…'}</>
            : mode === 'login' ? 'Accedi →' : 'Registrati →'
          }
        </button>

        <p style={{ margin: 0, fontSize: 11.5, color: '#9cb8c4', textAlign: 'center', lineHeight: 1.5 }}>
          {mode === 'register' ? 'Hai già un account?' : 'Prima volta?'}{' '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            style={{ background: 'none', border: 'none', color: '#0e88a5', fontSize: 11.5, cursor: 'pointer', fontWeight: 700, padding: 0 }}>
            {mode === 'register' ? 'Accedi' : 'Registrati'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <>
      <style>{`html,body{margin:0;padding:0}*{box-sizing:border-box}@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0c1a2a,#0e2a3a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <Suspense fallback={<div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.3)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />}>
          <JoinForm />
        </Suspense>
      </div>
    </>
  )
}