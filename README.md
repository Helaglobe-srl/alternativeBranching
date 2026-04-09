# UCB Red Flags — Clinical Scenarios

Piattaforma interattiva di casi clinici per la formazione medica, con sistema di voto live per presentazioni e congressi.

## Stack

- **Frontend**: Next.js 16 (App Router, Turbopack)
- **Database & Auth**: Supabase (PostgreSQL + Auth + Realtime)
- **Deploy**: Vercel
- **Linguaggio**: TypeScript

## Funzionalità

- Casi clinici interattivi a scelte multiple con scenari ramificati
- Sistema di tracking navigazione utente (scene visitate, scelte, tempo)
- **Sessioni live di voto** per presentazioni e congressi:
  - QR code per registrazione/login partecipanti
  - Voto in tempo reale con aggiornamenti live (WebSocket)
  - Risultati rivelabili con animazione
  - Reset voti con storico preservato
  - Pannello admin integrato nella presentazione
- Autenticazione email + password (no email di conferma)
- Profili utente con flag admin

## Prerequisiti

- Node.js 18+
- Account Supabase
- Account Vercel (per deploy)

## Setup locale

### 1. Clona il repository

```bash
git clone <repo-url>
cd ucb-red-flags
npm install
```

### 2. Configura le variabili d'ambiente

Crea `.env.local` nella root del progetto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Entrambe le chiavi si trovano in **Supabase Dashboard → Project Settings → API**.

### 3. Configura il database

Nel **SQL Editor** di Supabase, esegui il file `docs/migration.sql` per creare tutte le tabelle, policy RLS, trigger e abilitare il Realtime.

```bash
# Oppure copia il contenuto di docs/migration.sql nell'SQL Editor Supabase
```

### 4. Configura gli admin

Dopo aver creato il primo utente tramite la pagina di login, flaggalo come admin:

```sql
update user_profiles 
set is_admin = true 
where id = (select id from auth.users where email = 'tua@email.com');
```

### 5. Avvia il server di sviluppo

```bash
npm run dev
```

L'app è disponibile su [localhost:3000](http://localhost:3000).

## Struttura file

```
app/
├── page.tsx              # Homepage con lista casi clinici
├── login/page.tsx        # Login / registrazione
├── game/[slug]/page.tsx  # Engine del caso clinico + pannello voto live
├── vote/[id]/page.tsx    # Pagina voto partecipanti (via QR)
├── join/[id]/page.tsx    # Registrazione/login partecipanti via QR
└── admin/
    ├── page.tsx          # Lista sessioni live (solo admin)
    └── [id]/page.tsx     # Controllo sessione live

hooks/
├── useLiveSession.ts     # Gestione sessione voto live (realtime + polling)
└── useUcbTracking.ts     # Tracking navigazione su Supabase

public/
├── stories.json          # Lista casi clinici
└── stories/[slug]/
    ├── scenario.json     # Scenario del caso clinico
    └── cover.png         # Immagine di copertina

docs/
├── migration.sql         # Migration completa del database
└── db-documentation.md  # Documentazione tabelle e flussi
```

## Flusso sessione live

```
Admin clicca storia → popup sessione
  → sceglie "Nuova sessione" o "Continua sessione recente"
  → inserisce nome sessione
  → mostra QR da far scansionare ai partecipanti
  → avvia la presentazione

Partecipante scansiona QR → /join/[sessionId]
  → registrazione o login con email + password
  → redirect a /vote/[sessionId]
  → aspetta che l'admin apra il voto

Admin naviga al caso → su scene "Decisione" si apre automaticamente il pannello laterale
  → mostra QR + contatore voti in tempo reale
  → controlli: Apri voto / Chiudi voto / Rivela risultati / Reset

Partecipante vota → risultati in tempo reale sull'admin
Admin rivela → partecipanti vedono le percentuali animate
```

## Aggiungere un caso clinico

1. Crea la cartella `public/stories/[slug]/`
2. Aggiungi `scenario.json` con la struttura delle scene (vedi `docs/db-documentation.md`)
3. Aggiungi `cover.png` (1280×720px)
4. Aggiungi la voce in `public/stories.json`

## Deploy su Vercel

```bash
vercel --prod
```

Aggiungi le variabili d'ambiente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` nel progetto Vercel.

## Note

- Il piano free Supabase supporta fino a **200 connessioni realtime concorrenti** — sufficiente per sessioni fino a ~150 partecipanti
- I voti non vengono mai cancellati dal DB: il reset usa un timestamp (`reset_at`) per distinguere i cicli, preservando lo storico completo
- I file `scenario.json` sono protetti da autenticazione nel middleware; le immagini sono pubbliche