'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [ready, setReady]       = useState(false)
  const [tokenError, setTokenError] = useState(false)

 useEffect(() => {
    // Con PKCE flow Supabase gestisce tutto tramite onAuthStateChange
    // Non bisogna fare nulla manualmente — aspettiamo PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
        subscription.unsubscribe()
      }
      // Se c'è un errore nell'hash/query
      const hash = window.location.hash.substring(1)
      const query = window.location.search.substring(1)
      const combined = [hash, query].filter(Boolean).join('&')
      const params = new URLSearchParams(combined)
      if (params.get('error')) {
        setTokenError(true)
        subscription.unsubscribe()
      }
    })
    const t = setTimeout(() => {
      setTokenError(true)
    }, 6000)
    return () => { clearTimeout(t); subscription.unsubscribe() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('La password deve essere di almeno 8 caratteri.'); return }
    if (password !== confirm) { setError('Le password non coincidono.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else { setSuccess(true); setTimeout(() => router.push('/'), 3000) }
  }

  return (
    <>
      <style>{`html,body{margin:0;padding:0}*{box-sizing:border-box}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0c1a2a,#0e2a3a)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
        <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp .3s ease' }}>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <Image src="/images/LOGO.webp" alt="Logo" width={100} height={28} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '32px 28px', border: '1px solid rgba(255,255,255,0.08)' }}>

            {success ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,128,61,0.2)', border: '2px solid rgba(74,222,128,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'white' }}>Password aggiornata!</h2>
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Reindirizzamento in corso…</p>
              </div>

            ) : tokenError ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'white' }}>Link non valido</h2>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Il link è scaduto o già usato. Richiedine uno nuovo.</p>
                <button onClick={() => router.push('/')}
                  style={{ padding: '10px 24px', borderRadius: 10, background: '#0e88a5', color: 'white', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Torna alla home
                </button>
              </div>

            ) : !ready ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 36, height: 36, border: '3px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 14px' }} />
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Verifica del link…</p>
              </div>

            ) : (
              <>
                <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: 'white' }}>Nuova password</h2>
                <p style={{ margin: '0 0 24px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Almeno 8 caratteri.</p>
                <form onSubmit={handleSubmit}>
                  {(['Nuova password', 'Conferma password'] as const).map((label, idx) => (
                    <div key={label} style={{ marginBottom: idx === 0 ? 14 : 20 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
                      <input type="password" value={idx === 0 ? password : confirm}
                        onChange={e => idx === 0 ? setPassword(e.target.value) : setConfirm(e.target.value)}
                        placeholder="••••••••" required
                        style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 15, outline: 'none' }}
                        onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }} />
                    </div>
                  ))}
                  {error && (
                    <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', fontSize: 13, color: '#fca5a5' }}>{error}</div>
                  )}
                  <button type="submit" disabled={loading}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, background: loading ? 'rgba(14,136,165,0.5)' : '#0e88a5', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0c6d82' }}
                    onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#0e88a5' }}>
                    {loading && <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin .6s linear infinite' }} />}
                    {loading ? 'Salvataggio…' : 'Aggiorna password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}