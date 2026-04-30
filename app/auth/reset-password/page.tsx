'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const [ready, setReady]           = useState(false)

  // Supabase legge il token dall'hash dell'URL automaticamente
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La password deve essere di almeno 8 caratteri.')
      return
    }
    if (password !== confirm) {
      setError('Le password non coincidono.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/'), 3000)
    }
  }

  return (
    <>
      <style>{`
        html,body{margin:0;padding:0}
        *{box-sizing:border-box}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0c1a2a,#0e2a3a)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>

        <div style={{ width: '100%', maxWidth: 420, animation: 'fadeUp .3s ease' }}>

          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <Image src="/images/LOGO.webp" alt="Logo" width={100} height={28} style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '32px 28px', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)' }}>

            {success ? (
              /* Successo */
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,128,61,0.2)', border: '2px solid rgba(74,222,128,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'white' }}>Password aggiornata!</h2>
                <p style={{ margin: '0 0 4px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Verrai reindirizzato alla home tra pochi secondi…</p>
              </div>

            ) : !ready ? (
              /* In attesa del token */
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, border: '3px solid rgba(14,136,165,0.2)', borderTopColor: '#0e88a5', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Verifica del link in corso…</p>
              </div>

            ) : (
              /* Form */
              <>
                <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: 'white' }}>Nuova password</h2>
                <p style={{ margin: '0 0 24px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Scegli una password di almeno 8 caratteri.</p>

                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Nuova password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 15, outline: 'none', transition: 'border-color .15s' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                    />
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Conferma password
                    </label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 15, outline: 'none', transition: 'border-color .15s' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#0e88a5' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                    />
                  </div>

                  {error && (
                    <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', fontSize: 13, color: '#fca5a5' }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, background: loading ? 'rgba(14,136,165,0.5)' : '#0e88a5', color: 'white', border: 'none', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
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