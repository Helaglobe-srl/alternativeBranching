'use client'

import { Suspense, useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') ?? '/'

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPwd,     setShowPwd]     = useState(false)
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [checking,    setChecking]    = useState(true)
  const [forgotMode,  setForgotMode]  = useState(false)
  const [forgotSent,  setForgotSent]  = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')

  const supabase = createClient()

  useEffect(() => {
    // Intercetta token recovery nell'hash (Supabase fallback)
    const hash = window.location.hash.substring(1)
    if (hash) {
      const params = new URLSearchParams(hash)
      if (params.get('type') === 'recovery' && params.get('access_token')) {
        const accessToken  = params.get('access_token')!
        const refreshToken = params.get('refresh_token') ?? ''
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            if (!error) router.replace('/auth/reset-password')
            else setChecking(false)
          })
        return
      }
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(next)
      else setChecking(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendReset = async () => {
    if (!forgotEmail.trim()) { setError('Inserisci la tua email.'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)
    if (err) setError("Email non trovata o errore nell'invio.")
    else setForgotSent(true)
  }

  const handleSubmit = async () => {
    if (!email.trim() || !password) { setError('Inserisci email e password.'); return }
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (err) {
      setError('Credenziali non valide. Verifica email e password.')
      setLoading(false)
      return
    }
    if (data.user?.email) {
      sessionStorage.setItem('mg_username', data.user.email)
    }
    router.replace(next)
  }

  const bc = (hasError: boolean) => hasError ? '#dc2626' : '#c4e0e9'

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f0eb' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(14,136,165,0.18)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.4)', animation: 'fadeUp .35s cubic-bezier(0.22,1,0.36,1)' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0e88a5,#0c6d82)', padding: '32px 32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Image src="/images/LOGO.webp" alt="Logo" width={110} height={30} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.95 }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Helaglobe Learning Lab</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Accesso riservato agli amministratori</div>
        </div>
      </div>

      {/* Form */}
      <div style={{ padding: '28px 28px 24px' }}>

        {/* Email */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#4C7D93', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Email</label>
          <input
            type="email" autoFocus autoComplete="email" value={email}
            placeholder="nome@ospedale.it"
            onChange={e => { setEmail(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{ width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 14, border: `1.5px solid ${bc(!!error)}`, outline: 'none', color: '#0c2a38', fontFamily: 'inherit', transition: 'border-color .15s' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
            onBlur={e => { e.currentTarget.style.borderColor = bc(!!error) }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: error ? 12 : 20 }}>
          <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#4C7D93', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'} autoComplete="current-password" value={password}
              placeholder="••••••••"
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%', padding: '11px 42px 11px 13px', borderRadius: 10, fontSize: 14, border: `1.5px solid ${bc(!!error)}`, outline: 'none', color: '#0c2a38', fontFamily: 'inherit', transition: 'border-color .15s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
              onBlur={e => { e.currentTarget.style.borderColor = bc(!!error) }}
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              title={showPwd ? 'Nascondi password' : 'Mostra password'}
              style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9cb8c4', display: 'flex', alignItems: 'center', transition: 'color .15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0e88a5' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9cb8c4' }}>
              {showPwd ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Password dimenticata */}
        {!forgotMode && (
          <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 16 }}>
            <button onClick={() => { setForgotMode(true); setForgotEmail(email); setError('') }}
              style={{ background: 'none', border: 'none', color: '#0e88a5', fontSize: 12, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
              Password dimenticata?
            </button>
          </div>
        )}

        {/* Form recupero password */}
        {forgotMode && (
          <div style={{ marginBottom: 16 }}>
            {forgotSent ? (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, color: '#15803d', lineHeight: 1.6 }}>
                ✓ Email inviata a <strong>{forgotEmail}</strong>.<br />
                Clicca il link nella mail per reimpostare la password.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#4C7D93', marginBottom: 10, lineHeight: 1.5 }}>
                  Inserisci la tua email. Ti mandiamo un link per reimpostare la password.
                </div>
                <input type="email" value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setError('') }}
                  placeholder="nome@esempio.it"
                  onKeyDown={async e => { if (e.key === 'Enter') await sendReset() }}
                  style={{ width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 14, border: '1.5px solid #c4e0e9', outline: 'none', color: '#0c2a38', fontFamily: 'inherit', marginBottom: 10 }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#c4e0e9' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setForgotMode(false); setError('') }}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#f0f4f6', color: '#4C7D93', border: 'none' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#dde8ed' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f0f4f6' }}>
                    Annulla
                  </button>
                  <button onClick={sendReset} disabled={loading}
                    style={{ flex: 2, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer', background: loading ? '#9cb8c4' : '#0e88a5', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0c6d82' }}
                    onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#0e88a5' }}>
                    {loading && <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />}
                    {loading ? 'Invio…' : 'Invia link →'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16, padding: '9px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12.5, color: '#dc2626', lineHeight: 1.4 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        {!forgotMode && (
          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', padding: '12px 0', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer', background: loading ? '#9cb8c4' : '#0e88a5', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .15s' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0c6d82' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#0e88a5' }}>
            {loading
              ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Accesso in corso…</>
              : 'Accedi →'}
          </button>
        )}

        {!forgotMode && (
          <p style={{ marginTop: 18, fontSize: 12, color: '#9cb8c4', textAlign: 'center', lineHeight: 1.5 }}>
            Accesso riservato agli amministratori.<br />
            Per richiedere l&apos;accesso contatta l&apos;amministratore.
          </p>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <>
      <style>{`
        html,body{margin:0;padding:0}
        *{box-sizing:border-box}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#1a2e2e,#0c1a1a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <Suspense fallback={
          <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        }>
          <LoginForm />
        </Suspense>
      </div>
    </>
  )
}

// ULTIMA VERSIONE