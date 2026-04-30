// stress-test-v4.js
// Fase 1: Crea 40 utenti test (uno alla volta, 4s pausa per evitare rate limit)
// Fase 2: Login simultaneo
// Fase 3: Pausa 3s
// Fase 4: Voto simultaneo con misura del voto singolo
//
// Usage:
//   node stress-test-v4.js create <URL> <ANON_KEY>
//   node stress-test-v4.js test   <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>

const [,, COMMAND, ...args] = process.argv
const N_USERS    = 40
const TEST_PWD   = 'StressTest2025!'
const USERS_FILE = './stress-users.json'
const CHOICES    = ['0', '1', '2', '3']
const fs         = require('fs')

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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

// ── CREATE ─────────────────────────────────────────────────────────────────

async function cmdCreate() {
  const [SUPABASE_URL, ANON_KEY] = args
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error('Usage: node stress-test-v4.js create <URL> <ANON_KEY>')
    process.exit(1)
  }

  // Carica utenti già creati se il file esiste
  let existing = []
  if (fs.existsSync(USERS_FILE)) {
    existing = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
    console.log(`\n📂 Trovati ${existing.length} utenti già creati in ${USERS_FILE}`)
  }

  const existingEmails = new Set(existing.map(u => u.email))
  const toCreate = []
  for (let i = 0; i < N_USERS; i++) {
    const email = `stress_${String(i).padStart(2,'0')}@helaglobe-test.com`
    if (!existingEmails.has(email)) toCreate.push({ i, email })
  }

  if (toCreate.length === 0) {
    console.log(`✅ Tutti i ${N_USERS} utenti esistono già. Puoi eseguire il test.\n`)
    return
  }

  const totalTime = toCreate.length * 4
  console.log(`\n📝 Creazione ${toCreate.length} utenti mancanti (~${totalTime}s)\n`)

  const users = [...existing]

  for (const { i, email } of toCreate) {
    const r = await authPost(SUPABASE_URL, '/signup', { email, password: TEST_PWD }, ANON_KEY)

    if (r.status === 200 || r.status === 201) {
      console.log(`[${String(i).padStart(2,'0')}] ✓ Creato: ${email}`)
      users.push({ email, password: TEST_PWD })
    } else if (r.data?.msg?.includes('already') || r.data?.code === 'user_already_exists') {
      console.log(`[${String(i).padStart(2,'0')}] ↩ Già esiste: ${email}`)
      users.push({ email, password: TEST_PWD })
    } else if (r.status === 429) {
      console.log(`[${String(i).padStart(2,'0')}] ⚠ Rate limit — aspetto 30s...`)
      await sleep(60000)
      // Riprova
      const r2 = await authPost(SUPABASE_URL, '/signup', { email, password: TEST_PWD }, ANON_KEY)
      if (r2.status === 200 || r2.status === 201) {
        console.log(`[${String(i).padStart(2,'0')}] ✓ Creato (retry): ${email}`)
        users.push({ email, password: TEST_PWD })
      } else {
        console.log(`[${String(i).padStart(2,'0')}] ❌ Fallito anche al retry: ${JSON.stringify(r2.data)}`)
      }
    } else {
      console.log(`[${String(i).padStart(2,'0')}] ❌ ${JSON.stringify(r.data)}`)
    }

    // Salva progressivamente
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))

    if (toCreate.indexOf({ i, email }) < toCreate.length - 1) await sleep(4000)
  }

  console.log(`\n✅ ${users.length} utenti salvati in ${USERS_FILE}`)
  console.log(`\nOra esegui il test:`)
  console.log(`  node stress-test-v4.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>\n`)
}

// ── TEST ───────────────────────────────────────────────────────────────────

async function cmdTest() {
  const [SUPABASE_URL, ANON_KEY, SESSION_ID, SCENE_ID] = args
  if (!SUPABASE_URL || !ANON_KEY || !SESSION_ID || !SCENE_ID) {
    console.error('Usage: node stress-test-v4.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>')
    process.exit(1)
  }

  if (!fs.existsSync(USERS_FILE)) {
    console.error(`❌ File ${USERS_FILE} non trovato. Esegui prima: node stress-test-v4.js create ...`)
    process.exit(1)
  }

  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
  console.log(`\n🚀 Stress test — ${users.length} utenti`)
  console.log(`   Session: ${SESSION_ID}`)
  console.log(`   Scene:   ${SCENE_ID}\n`)

  // ── Fase 1: Login simultaneo ──────────────────────────────────────────────
  console.log('⏳ Fase 1: Login simultaneo...')
  const loginStart = Date.now()

  const sessions = await Promise.all(users.map(async (user, idx) => {
    const r = await authPost(SUPABASE_URL, '/token?grant_type=password', {
      email: user.email, password: user.password
    }, ANON_KEY)

    if (r.status === 200 && r.data?.access_token) {
      process.stdout.write('.')
      return { idx, token: r.data.access_token, userId: r.data.user?.id }
    } else {
      process.stdout.write('x')
      return { idx, token: null, error: r.data?.error_description ?? r.data?.msg ?? 'login failed' }
    }
  }))

  const loginMs  = Date.now() - loginStart
  const loggedIn = sessions.filter(s => s.token)
  const loginFail = sessions.filter(s => !s.token)

  console.log(`\n✓ Login in ${loginMs}ms — ${loggedIn.length}/${users.length} loggati`)
  if (loginFail.length > 0) loginFail.forEach(s => console.log(`  ❌ User ${s.idx}: ${s.error}`))

  // ── Fase 2: Pausa 3s ──────────────────────────────────────────────────────
  console.log('\n⏳ Fase 2: Pausa 3 secondi...')
  await sleep(3000)

  // ── Fase 3: Voto simultaneo ───────────────────────────────────────────────
  console.log('🗳  Fase 3: Voto simultaneo — GO!\n')
  const voteStart = Date.now()

  const results = await Promise.all(loggedIn.map(async (sess) => {
    const { idx, token, userId } = sess
    const choiceId = CHOICES[idx % CHOICES.length]
    const totalStart = Date.now()

    try {
      // Carica sessione
      const sessRes = await restRequest(
        SUPABASE_URL,
        `/rest/v1/live_sessions?select=current_round,reset_at&id=eq.${SESSION_ID}`,
        'GET', null, token, ANON_KEY
      )
      if (!sessRes.ok || !sessRes.data?.[0]) {
        process.stdout.write('S')
        return { idx, success: false, error: `session ${sessRes.status}`, ms: Date.now() - totalStart, voteMs: null }
      }
      const { current_round, reset_at } = sessRes.data[0]

      // ── Misura solo il voto ──
      const voteOnlyStart = Date.now()
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
      const voteOnlyMs = Date.now() - voteOnlyStart
      const totalMs    = Date.now() - totalStart

      if (voteRes.status === 201 || voteRes.status === 204) {
        process.stdout.write('✓')
        return { idx, success: true, ms: totalMs, voteMs: voteOnlyMs }
      } else if (voteRes.status === 409) {
        process.stdout.write('~')
        return { idx, success: true, skipped: true, ms: totalMs, voteMs: voteOnlyMs, note: 'già votato' }
      } else {
        process.stdout.write('✗')
        return { idx, success: false, error: `${voteRes.status}: ${JSON.stringify(voteRes.data)}`, ms: totalMs, voteMs: voteOnlyMs }
      }
    } catch (err) {
      process.stdout.write('E')
      return { idx, success: false, error: err.message, ms: Date.now() - totalStart, voteMs: null }
    }
  }))

  // ── Statistiche ───────────────────────────────────────────────────────────
  const voteMs    = Date.now() - voteStart
  const succeeded = results.filter(r => r.success)
  const failed    = results.filter(r => !r.success)

  // Tempo totale per utente (session load + voto)
  const totalTimes = results.map(r => r.ms)
  const avgTotal   = Math.round(totalTimes.reduce((a,b) => a+b,0) / totalTimes.length)
  const maxTotal   = Math.max(...totalTimes)
  const minTotal   = Math.min(...totalTimes)

  // Tempo solo INSERT voto
  const voteTimes = results.filter(r => r.voteMs !== null).map(r => r.voteMs)
  const avgVote   = Math.round(voteTimes.reduce((a,b) => a+b,0) / voteTimes.length)
  const maxVote   = Math.max(...voteTimes)
  const minVote   = Math.min(...voteTimes)

  console.log(`\n\n${'─'.repeat(50)}`)
  console.log(`📊 RISULTATI`)
  console.log('─'.repeat(50))
  console.log(`✅ Successi:           ${succeeded.length}/${loggedIn.length}`)
  console.log(`❌ Fallimenti:         ${failed.length}`)
  console.log(``)
  console.log(`⏱  Login simultaneo:   ${loginMs}ms`)
  console.log(`⏱  Tutti i voti in:    ${voteMs}ms`)
  console.log(``)
  console.log(`📌 Tempo per utente (session + voto):`)
  console.log(`   Min:   ${minTotal}ms`)
  console.log(`   Media: ${avgTotal}ms`)
  console.log(`   Max:   ${maxTotal}ms`)
  console.log(``)
  console.log(`📌 Tempo solo INSERT voto:`)
  console.log(`   Min:   ${minVote}ms`)
  console.log(`   Media: ${avgVote}ms`)
  console.log(`   Max:   ${maxVote}ms`)

  if (failed.length > 0) {
    console.log('\n❌ Dettaglio fallimenti:')
    failed.forEach(r => console.log(`   User ${r.idx}: ${r.error}`))
  }
  console.log('')
}

// ── Router ─────────────────────────────────────────────────────────────────

switch (COMMAND) {
  case 'create': cmdCreate().catch(console.error); break
  case 'test':   cmdTest().catch(console.error); break
  default:
    console.log(`
Uso:
  1. Crea utenti (una volta sola, ~3 minuti):
     node stress-test-v4.js create <SUPABASE_URL> <ANON_KEY>

  2. Esegui test (ripetibile):
     node stress-test-v4.js test <SUPABASE_URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>
    `)
}