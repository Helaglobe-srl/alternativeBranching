import Link from 'next/link'
import Image from 'next/image'

export default function PrivacyPage() {
  return (
    <>
      <style>{`html,body{margin:0;padding:0}*{box-sizing:border-box}`}</style>
      <div style={{ minHeight: '100vh', background: '#f5f0eb', fontFamily: "'Segoe UI',system-ui,sans-serif" }}>

        {/* Navbar */}
        <nav style={{ height: 56, background: 'rgba(255,255,255,0.97)', borderBottom: '1px solid rgba(14,136,165,0.14)', display: 'flex', alignItems: 'center', padding: '0 32px', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <Image src="/images/logo2.png" alt="Logo" width={90} height={26} style={{ objectFit: 'contain', height: 26, width: 'auto' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0e88a5' }}>Clinical Scenarios</span>
          </Link>
        </nav>

        <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 32px 80px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0c2a38', marginBottom: 6, letterSpacing: '-0.02em' }}>Privacy Policy</h1>
          <p style={{ fontSize: 13, color: '#9cb8c4', marginBottom: 40 }}>Ultimo aggiornamento: aprile 2025</p>

          {[
            {
              title: '1. Titolare del trattamento',
              body: `Helaglobe S.r.l., con sede in Italia, è il titolare del trattamento dei dati personali raccolti tramite questa applicazione ("Learning labs — Clinical Scenarios").\n\nPer qualsiasi richiesta relativa alla privacy scrivere a: privacy@helaglobe.com`
            },
            {
              title: '2. Dati raccolti',
              body: `Durante l'utilizzo dell'applicazione raccogliamo i seguenti dati personali:\n\n• **Dati di registrazione**: nome, cognome, indirizzo email, password (conservata in forma crittografata).\n• **Dati di partecipazione**: risposte alle domande cliniche nelle sessioni live, timestamp di voto.\n• **Dati di navigazione**: scene visitate, scelte effettuate, tempo trascorso su ciascuna scena.\n\nNon raccogliamo dati di localizzazione, dati sensibili in senso stretto, né dati di profilazione commerciale.`
            },
            {
              title: '3. Finalità e base giuridica',
              body: `I dati sono trattati per le seguenti finalità:\n\n• **Autenticazione e accesso**: gestione dell'account utente (base giuridica: esecuzione del contratto).\n• **Partecipazione alle sessioni formative**: raccolta dei voti e visualizzazione dei risultati aggregati durante i congressi (base giuridica: consenso espresso al momento della registrazione).\n• **Analisi educativa**: miglioramento dei contenuti didattici attraverso l'analisi aggregata e anonimizzata dei percorsi di navigazione (base giuridica: legittimo interesse del titolare).`
            },
            {
              title: '4. Sub-responsabili del trattamento',
              body: `Per erogare il servizio ci avvaliamo dei seguenti fornitori terzi, con i quali sono stati stipulati accordi di trattamento dei dati conformi al GDPR:\n\n• **Supabase Inc.** (USA) — database, autenticazione e comunicazioni in tempo reale. I dati sono conservati in data center situati nell'Unione Europea. [LINK:https://supabase.com/privacy:Privacy Policy Supabase]\n• **Vercel Inc.** (USA) — hosting e distribuzione dell'applicazione web. I dati in transito sono cifrati con TLS. [LINK:https://vercel.com/legal/privacy-policy:Privacy Policy Vercel]`
            },
            {
              title: '5. Cookie e tecnologie di tracciamento',
              body: `L'applicazione utilizza esclusivamente cookie tecnici necessari al funzionamento del servizio (gestione della sessione di autenticazione). Non utilizziamo cookie di profilazione, cookie di terze parti a scopo pubblicitario, né strumenti di analisi comportamentale (es. Google Analytics).\n\nNon è necessario il consenso per i cookie tecnici ai sensi dell'art. 122 del Codice Privacy e delle Linee Guida del Garante.`
            },
            {
              title: '6. Conservazione dei dati',
              body: `I dati di registrazione sono conservati per tutta la durata dell'account e cancellati entro 30 giorni dalla richiesta di cancellazione.\n\nI dati di partecipazione alle sessioni (voti) sono conservati in forma pseudonimizzata per finalità di analisi educativa per un massimo di 24 mesi.\n\nI log di navigazione sono conservati per un massimo di 12 mesi.`
            },
            {
              title: '7. Diritti degli interessati',
              body: `In qualità di interessato hai il diritto di:\n\n• **Accesso**: ottenere conferma del trattamento e copia dei dati.\n• **Rettifica**: correggere dati inesatti o incompleti.\n• **Cancellazione**: richiedere la cancellazione dei dati (salvo obblighi di legge).\n• **Limitazione**: limitare il trattamento in determinati casi.\n• **Portabilità**: ricevere i dati in formato strutturato e leggibile da macchina.\n• **Opposizione**: opporsi al trattamento basato sul legittimo interesse.\n• **Revoca del consenso**: in qualsiasi momento, senza pregiudicare la liceità del trattamento precedente.\n\nPer esercitare i tuoi diritti scrivi a privacy@helaglobe.com. Hai inoltre il diritto di proporre reclamo al Garante per la Protezione dei Dati Personali (gpdp.it).`
            },
            {
              title: '8. Sicurezza',
              body: `Adottiamo misure tecniche e organizzative adeguate a proteggere i dati da accessi non autorizzati, perdita o distruzione. Le password sono conservate esclusivamente in forma hash (bcrypt). Tutte le comunicazioni avvengono tramite protocollo HTTPS/TLS.`
            },
            {
              title: '9. Modifiche alla Privacy Policy',
              body: `Ci riserviamo il diritto di aggiornare questa Privacy Policy. Le modifiche sostanziali saranno comunicate via email agli utenti registrati. La versione aggiornata sarà sempre disponibile su questa pagina con la data di ultimo aggiornamento.`
            },
          ].map((section, i) => (
            <div key={i} style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0c2a38', margin: '0 0 12px', letterSpacing: '-0.01em' }}>{section.title}</h2>
              <div style={{ fontSize: 14, color: '#3a5a6a', lineHeight: 1.8 }}>
                {section.body.split('\n').map((line, j) => {
                  if (!line.trim()) return <div key={j} style={{ height: 6 }} />

                  // Parsa bold + link [LINK:url:testo]
                  const parseLine = (text: string) => {
                    const tokens = text.split(/\[LINK:(https?:\/\/[^:]+):([^\]]+)\]/g)
                    const result: React.ReactNode[] = []
                    for (let i = 0; i < tokens.length; i++) {
                      if (i % 3 === 0) {
                        // testo normale con bold
                        tokens[i].split(/\*\*(.*?)\*\*/g).forEach((p, k) => {
                          result.push(k % 2 === 1 ? <strong key={`b-${i}-${k}`}>{p}</strong> : p)
                        })
                      } else if (i % 3 === 1) {
                        // url (skip, usato nel prossimo token)
                      } else {
                        // testo del link
                        result.push(
                          <a key={`l-${i}`} href={tokens[i-1]} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#0e88a5', fontWeight: 600, textDecoration: 'underline' }}>
                            {tokens[i]}
                          </a>
                        )
                      }
                    }
                    return result
                  }

                  if (line.startsWith('•')) {
                    const lineContent = line.replace(/^•\s*/, '')
                    return (
                      <div key={j} style={{ display: 'flex', gap: 8, margin: '4px 0' }}>
                        <span style={{ flexShrink: 0, marginTop: 8, width: 5, height: 5, borderRadius: '50%', background: '#0e88a5', display: 'block' }} />
                        <span>{parseLine(lineContent)}</span>
                      </div>
                    )
                  }
                  return <p key={j} style={{ margin: 0 }}>{parseLine(line)}</p>
                })}
              </div>
            </div>
          ))}

          <div style={{ marginTop: 48, padding: '20px 24px', borderRadius: 12, background: 'white', border: '1px solid #e0eaee', fontSize: 13, color: '#6b9aaa', lineHeight: 1.6 }}>
            Per qualsiasi domanda o richiesta relativa al trattamento dei dati personali contattare:<br />
            <strong style={{ color: '#0c2a38' }}>Helaglobe S.r.l.</strong> — <a href="mailto:privacy@helaglobe.com" style={{ color: '#0e88a5' }}>privacy@helaglobe.com</a>
          </div>
        </div>
      </div>
    </>
  )
}