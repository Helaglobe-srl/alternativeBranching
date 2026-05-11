# Helaglobe Learning Lab — Live Voting Platform

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

### Modalità di voto

| Modalità | Campo `mode` | Note |
|----------|-------------|------|
| **Normale** | assente | Scelte cliccabili, risultati con barre |
| **Delphi** | `"delphi"` | Scala Likert, overlay con media/mediana/consenso/torta/istogramma |
| **Open** | `"open"` | Risposta libera testuale, word cloud nel pannello moderatore |
| **Hybrid** | `"hybrid"` | Scelte predefinite + campo "Altro" libero, word cloud combinata |
| **Hybrid Multi** | `"hybrid"` + `"multi": true` | Come Hybrid ma con checkbox a selezione multipla (una riga per scelta nel DB) |

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
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

Entrambe le chiavi si trovano in **Supabase Dashboard → Project Settings → API**.

> ⚠️ La variabile si chiama `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, non `ANON_KEY`.

### 3. Configura il database

Nel **SQL Editor** di Supabase, esegui il file `docs/migration.sql` per creare tutte le tabelle, policy RLS, trigger e abilitare il Realtime.

### 4. Constraint unique su live_votes

Il constraint di unicità su `live_votes` deve includere `choice_id` per supportare la selezione multipla:

```sql
ALTER TABLE public.live_votes 
DROP CONSTRAINT live_votes_session_scene_user_resetkey_unique;

CREATE UNIQUE INDEX live_votes_session_scene_user_resetkey_unique 
ON public.live_votes (session_id, scene_id, user_id, reset_key, choice_id);
```

### 5. Configura gli admin

Dopo aver creato il primo utente tramite la pagina di login, flaggalo come admin:

```sql
update user_profiles 
set is_admin = true 
where id = (select id from auth.users where email = 'tua@email.com');
```

### 6. Avvia il server di sviluppo

```bash
npm run dev
```

L'app è disponibile su [localhost:3000](http://localhost:3000).

## Struttura file

```
app/
├── page.tsx              # Homepage con lista casi clinici
├── login/page.tsx        # Login / registrazione
├── auth/reset-password/  # Reset password (PKCE flow)
├── game/[slug]/page.tsx  # Engine del caso clinico + pannello voto live
├── vote/[id]/page.tsx    # Pagina voto partecipanti (via QR)
└── join/[id]/page.tsx    # Registrazione/login partecipanti via QR

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

## Struttura scenario.json

```json
{
  "title": "Titolo storia",
  "subtitle": "Sottotitolo",
  "scenes": [
    {
      "id": "intro",
      "type": "info",
      "title": "...",
      "text": "...",
      "choices": [{ "text": "Avanti →", "next": "scene1" }]
    },
    {
      "id": "scene1",
      "type": "decision",
      "mode": "delphi",
      "title": "...",
      "text": "Quanto sei d'accordo?",
      "next": "scene2",
      "choices": [
        { "id": "c1", "text": "Totale disaccordo", "tag": "1" },
        { "id": "c2", "text": "Disaccordo",        "tag": "2" },
        { "id": "c3", "text": "Accordo",            "tag": "3" },
        { "id": "c4", "text": "Totale accordo",     "tag": "4" }
      ]
    },
    {
      "id": "scene2",
      "type": "decision",
      "mode": "hybrid",
      "multi": true,
      "title": "...",
      "text": "Scegli uno o più argomenti",
      "next": "end",
      "max_chars": 300,
      "cloud_words": {
        "c1": ["parola1", "parola2"],
        "c2": ["parola3"],
        "altro": null
      },
      "choices": [
        { "id": "c1", "text": "Opzione A" },
        { "id": "c2", "text": "Opzione B" },
        { "id": "altro", "text": "✎ Altro" }
      ]
    }
  ]
}
```

### Campi speciali per scene hybrid

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `multi` | `boolean` | Se `true`, abilita checkbox a selezione multipla |
| `max_chars` | `number` | Limite caratteri per il campo "Altro" (default 300) |
| `cloud_words` | `Record<string, string[] \| null>` | Parole chiave per la word cloud: ogni `choice_id` mappa a un array di parole da pesare per i voti ricevuti; `"altro": null` include i testi liberi parola per parola |

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

Admin naviga al caso → su scene "Decisione" si apre il pannello laterale
  → mostra QR + contatore voti in tempo reale
  → controlli: Apri voto / Chiudi voto / Rivela risultati / Reset

Partecipante vota → risultati in tempo reale sull'admin
Admin rivela → partecipanti vedono le percentuali animate
```

## Schema DB (tabelle principali)

```sql
live_sessions (id, name, story_slug, scene_id, voting_open, revealed, current_round, reset_at, created_by, created_at)
live_votes    (id, session_id, scene_id, user_id, participant_name, choice_id, choice_text, voted_at, round, reset_key)
live_open_answers (id, session_id, scene_id, user_id, participant_name, answer, submitted_at, round)
user_profiles (id, is_admin, is_super_admin)
```

> **Nota sul multi-select**: in modalità `hybrid + multi`, ogni scelta selezionata genera una riga separata in `live_votes` con lo stesso `user_id` ma `choice_id` diverso. Il constraint unique è su `(session_id, scene_id, user_id, reset_key, choice_id)`.

## Reset password

Il flow usa PKCE. Supabase invia un link a `/login` con hash `#access_token=...&type=recovery`. La login page intercetta l'hash, chiama `setSession()` e redirige a `/auth/reset-password`.

In **Supabase Dashboard → Auth → Email Templates → Reset Password**, il template deve usare `{{ .ConfirmationURL }}` e il Site URL deve essere impostato a `https://learninglab.helaglobe.com`.

## Deploy su Vercel

```bash
vercel --prod
```

Aggiungi le variabili d'ambiente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nel progetto Vercel.

## Note

- Il piano free Supabase supporta fino a **200 connessioni realtime concorrenti** — sufficiente per sessioni fino a ~150 partecipanti
- I voti non vengono mai cancellati dal DB: il reset usa un timestamp (`reset_at`) per distinguere i cicli, preservando lo storico completo
- I file `scenario.json` sono protetti da autenticazione nel middleware; le immagini sono pubbliche