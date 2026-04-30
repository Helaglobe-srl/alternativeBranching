// stress-test-v2.js
// Fase 1: Crea 40 utenti test (uno alla volta, evita rate limit)
// Fase 2: Aspetta che tutti facciano login
// Fase 3: Lancia voto simultaneo
//
// Usage:
//   node stress-test-v2.js create <SUPABASE_URL> <ANON_KEY> <SERVICE_KEY>
//   node stress-test-v2.js test   <SUPABASE_URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>
//   node stress-test-v2.js cleanup <SUPABASE_URL> <SERVICE_KEY>

const [,, COMMAND, ...args] = process.argv
const N_USERS   = 40
const TEST_PWD  = 'StressTest2025!'
const USERS_FILE = './stress-users.json'
const fs = require('fs')

// ── Auth helpers ───────────────────────────────────────────────────────────

async function authPost(baseUrl, path, body, key) {
  const res = await fetch(`${baseUrl}/auth/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

async function restRequest(baseUrl, path, method, body, token, key) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${token ?? key}`,
  }
  if (method !== 'GET') headers['Prefer'] = 'return=minimal'
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  return { status: res.status, data, ok: res.ok }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── COMMAND: create ────────────────────────────────────────────────────────

async function cmdCreate() {
  const [SUPABASE_URL, ANON_KEY, SERVICE_KEY] = args
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error('Usage: node stress-test-v2.js create <URL> <ANON_KEY> <SERVICE_KEY>')
    process.exit(1)
  }

  console.log(`\n📝 Creazione ${N_USERS} utenti test (uno ogni 2s per evitare rate limit)\n`)
  
  const users = []
  
  for (let i = 0; i < N_USERS; i++) {
    const email = `stress_${String(i).padStart(2,'0')}@helaglobe-test.com`
    
    // Prova signup
    const r = await authPost(SUPABASE_URL, '/signup', { email, password: TEST_PWD }, ANON_KEY)
    
    if (r.status === 200 || r.status === 201) {
      console.log(`[${String(i).padStart(2,'0')}] ✓ Creato: ${email}`)
      users.push({ email, password: TEST_PWD })
    } else if (r.data?.code === 'user_already_exists' || r.data?.msg?.includes('already')) {
      console.log(`[${String(i).padStart(2,'0')}] ↩ Già esiste: ${email}`)
      users.push({ email, password: TEST_PWD })
    } else {
      console.log(`[${String(i).padStart(2,'0')}] ❌ Errore: ${JSON.stringify(r.data)}`)
    }
    
    // Aspetta 2s tra ogni signup per non triggerare rate limit
    if (i < N_USERS - 1) await sleep(2000)
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
  console.log(`\n✅ Salvati ${users.length} utenti in ${USERS_FILE}`)
  console.log(`\nOra esegui il test:`)
  console.log(`  node stress-test-v2.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>\n`)
}

// ── COMMAND: test ──────────────────────────────────────────────────────────

async function cmdTest() {
  const [SUPABASE_URL, ANON_KEY, SESSION_ID, SCENE_ID] = args
  if (!SUPABASE_URL || !ANON_KEY || !SESSION_ID || !SCENE_ID) {
    console.error('Usage: node stress-test-v2.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>')
    process.exit(1)
  }

  if (!fs.existsSync(USERS_FILE)) {
    console.error(`❌ File ${USERS_FILE} non trovato. Esegui prima: node stress-test-v2.js create ...`)
    process.exit(1)
  }

  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
  console.log(`\n🚀 Stress test con ${users.length} utenti esistenti`)
  console.log(`   Session: ${SESSION_ID}`)
  console.log(`   Scene:   ${SCENE_ID}\n`)

  const CHOICES = ['0', '1', '2', '3']

  // Fase 1: tutti fanno login in parallelo
  console.log('⏳ Fase 1: Login simultaneo di tutti gli utenti...')
  const loginStart = Date.now()

  const sessions = await Promise.all(users.map(async (user, idx) => {
    const r = await authPost(SUPABASE_URL, '/token?grant_type=password', {
      email: user.email, password: user.password
    }, ANON_KEY)

    if (r.status === 200 && r.data?.access_token) {
      process.stdout.write('.')
      return { idx, token: r.data.access_token, userId: r.data.user?.id, email: user.email }
    } else {
      process.stdout.write('x')
      return { idx, token: null, error: r.data?.error ?? 'login failed', email: user.email }
    }
  }))

  console.log(`\n✓ Login completato in ${Date.now() - loginStart}ms`)
  const loggedIn = sessions.filter(s => s.token)
  const loginFailed = sessions.filter(s => !s.token)
  console.log(`  Loggati: ${loggedIn.length}/${users.length}`)
  if (loginFailed.length > 0) {
    loginFailed.forEach(s => console.log(`  ❌ ${s.email}: ${s.error}`))
  }

  if (loggedIn.length === 0) {
    console.error('\n❌ Nessun utente loggato, impossibile procedere')
    process.exit(1)
  }

  // Fase 2: aspetta 1s poi lancia voti simultanei
  console.log('\n⏳ Fase 2: Voto simultaneo tra 1 secondo...')
  await sleep(1000)

  const voteStart = Date.now()
  console.log(`🗳  GO! (${new Date().toISOString()})\n`)

  const results = await Promise.all(loggedIn.map(async (sess, i) => {
    const { idx, token, userId, email } = sess
    const choiceId = CHOICES[idx % CHOICES.length]
    const start = Date.now()

    try {
      // Load session
      const sessRes = await restRequest(
        SUPABASE_URL,
        `/rest/v1/live_sessions?select=current_round,reset_at&id=eq.${SESSION_ID}`,
        'GET', null, token, ANON_KEY
      )
      if (!sessRes.ok || !sessRes.data?.[0]) {
        return { idx, success: false, error: `session ${sessRes.status}`, ms: Date.now() - start }
      }
      const { current_round, reset_at } = sessRes.data[0]

      // Voto
      const voteRes = await restRequest(
        SUPABASE_URL, '/rest/v1/live_votes', 'POST',
        {
          session_id:       SESSION_ID,
          scene_id:         SCENE_ID,
          user_id:          userId,
          participant_name: `StressUser${idx}`,
          choice_id:        choiceId,
          choice_text:      `Scelta test ${choiceId}`,
          round:            current_round ?? 1,
          reset_key:        reset_at ?? 'initial',
        },
        token, ANON_KEY
      )

      const ms = Date.now() - start
      if (voteRes.status === 201 || voteRes.status === 204) {
        process.stdout.write('✓')
        return { idx, success: true, ms }
      } else if (voteRes.status === 409) {
        process.stdout.write('~')
        return { idx, success: true, skipped: true, ms, note: 'già votato' }
      } else {
        process.stdout.write('✗')
        return { idx, success: false, error: `vote ${voteRes.status}: ${JSON.stringify(voteRes.data)}`, ms }
      }
    } catch (err) {
      process.stdout.write('E')
      return { idx, success: false, error: err.message, ms: Date.now() - start }
    }
  }))

  console.log(`\n\n${'─'.repeat(50)}`)
  console.log(`📊 RISULTATI VOTO`)
  console.log('─'.repeat(50))

  const succeeded = results.filter(r => r.success)
  const failed    = results.filter(r => !r.success)
  const times     = results.map(r => r.ms)
  const avgMs     = Math.round(times.reduce((a,b) => a+b, 0) / times.length)
  const maxMs     = Math.max(...times)
  const minMs     = Math.min(...times)

  console.log(`✅ Successi:      ${succeeded.length}/${loggedIn.length}`)
  console.log(`❌ Fallimenti:    ${failed.length}`)
  console.log(`⏱  Tempo totale:  ${Date.now() - voteStart}ms`)
  console.log(`⏱  Min/utente:    ${minMs}ms`)
  console.log(`⏱  Media/utente:  ${avgMs}ms`)
  console.log(`⏱  Max/utente:    ${maxMs}ms`)

  if (failed.length > 0) {
    console.log('\n❌ Dettaglio fallimenti:')
    failed.forEach(r => console.log(`   User ${r.idx}: ${r.error}`))
  }

  console.log('\n💡 Per pulire i voti test:')
  console.log(`   node stress-test-v2.js cleanup-votes <URL> <ANON_KEY> ${SESSION_ID} ${SCENE_ID}\n`)
}

// ── COMMAND: cleanup ───────────────────────────────────────────────────────

async function cmdCleanup() {
  const [SUPABASE_URL, SERVICE_KEY] = args
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Usage: node stress-test-v2.js cleanup <URL> <SERVICE_KEY>')
    process.exit(1)
  }

  console.log('\n🧹 Eliminazione utenti test da Supabase Auth...')
  
  if (!fs.existsSync(USERS_FILE)) {
    console.error(`❌ File ${USERS_FILE} non trovato`)
    process.exit(1)
  }

  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
  
  // Recupera lista utenti da auth
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
  })
  const listData = await listRes.json()
  const allUsers = listData.users ?? []
  
  const testEmails = new Set(users.map(u => u.email))
  const toDelete = allUsers.filter(u => testEmails.has(u.email))
  
  console.log(`   Trovati ${toDelete.length} utenti test da eliminare`)
  
  for (const u of toDelete) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
      method: 'DELETE',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    })
    console.log(`   ${r.ok ? '✓' : '❌'} Deleted ${u.email}`)
    await sleep(100)
  }

  fs.unlinkSync(USERS_FILE)
  console.log(`\n✅ Cleanup completato, ${USERS_FILE} rimosso\n`)
}

async function cmdCleanupVotes() {
  const [SUPABASE_URL, ANON_KEY, SESSION_ID, SCENE_ID] = args
  const r = await restRequest(
    SUPABASE_URL,
    `/rest/v1/live_votes?session_id=eq.${SESSION_ID}&scene_id=eq.${SCENE_ID}&participant_name=like.StressUser*`,
    'DELETE', null, null, ANON_KEY
  )
  console.log(`🧹 Voti test eliminati: ${r.status}`)
}

// ── Router ─────────────────────────────────────────────────────────────────

switch (COMMAND) {
  case 'create':        cmdCreate().catch(console.error); break
  case 'test':          cmdTest().catch(console.error); break
  case 'cleanup':       cmdCleanup().catch(console.error); break
  case 'cleanup-votes': cmdCleanupVotes().catch(console.error); break
  default:
    console.log(`
Stress Test v2 — Utenti pre-esistenti

Comandi:
  1. Crea utenti (una tantum, ~80s):
     node stress-test-v2.js create <URL> <ANON_KEY> <SERVICE_KEY>

  2. Esegui test:
     node stress-test-v2.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>

  3. Pulisci voti test:
     node stress-test-v2.js cleanup-votes <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>

  4. Elimina utenti test da Supabase:
     node stress-test-v2.js cleanup <URL> <SERVICE_KEY>

Note:
  - SERVICE_KEY = service_role key (Supabase Dashboard → Settings → API)
  - ANON_KEY    = anon public key
  - Il create crea gli utenti uno alla volta (2s di pausa) per evitare rate limit
  - Il test fa login + voto in parallelo simultaneo
    `)
}