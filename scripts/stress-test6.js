// stress-test-v6.js
// Comando 1: create  — crea 40 utenti (una tantum, 4s pausa)
// Comando 2: login   — fa login di tutti con 1s pausa e retry su 429
// Comando 3: test    — carica token e lancia SOLO voti in parallelo
//
// Usage:
//   node stress-test-v6.js create <URL> <ANON_KEY>
//   node stress-test-v6.js login  <URL> <ANON_KEY>
//   node stress-test-v6.js test   <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>

const [,, COMMAND, ...args] = process.argv
const N_USERS      = 120
const TEST_PWD     = 'StressTest2025!'
const USERS_FILE   = './stress-users.json'
const TOKENS_FILE  = './stress-tokens.json'
const CHOICES      = ['0', '1']
const fs           = require('fs')

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
    console.error('Usage: node stress-test-v6.js create <URL> <ANON_KEY>')
    process.exit(1)
  }

  let users = []
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
    console.log(`\n📂 ${users.length} utenti già esistenti in ${USERS_FILE}`)
  }

  const existingEmails = new Set(users.map(u => u.email))
  const toCreate = []
  for (let i = 0; i < N_USERS; i++) {
    const email = `stress_${String(i).padStart(2,'0')}@helaglobe-test.com`
    if (!existingEmails.has(email)) toCreate.push({ i, email })
  }

  if (toCreate.length === 0) {
    console.log(`✅ Tutti i ${N_USERS} utenti esistono già.`)
    console.log(`\nProssimo passo: node stress-test-v6.js login <URL> <ANON_KEY>\n`)
    return
  }

  console.log(`\n📝 Creazione ${toCreate.length} utenti mancanti (~${toCreate.length * 4}s)\n`)

  for (const { i, email } of toCreate) {
    let done = false
    while (!done) {
      const r = await authPost(SUPABASE_URL, '/signup', { email, password: TEST_PWD }, ANON_KEY)
      if (r.status === 200 || r.status === 201) {
        console.log(`[${String(i).padStart(2,'0')}] ✓ ${email}`)
        users.push({ email, password: TEST_PWD })
        done = true
      } else if (r.data?.msg?.includes('already') || r.data?.code === 'user_already_exists') {
        console.log(`[${String(i).padStart(2,'0')}] ↩ già esiste: ${email}`)
        users.push({ email, password: TEST_PWD })
        done = true
      } else if (r.status === 429) {
        console.log(`[${String(i).padStart(2,'0')}] ⚠ Rate limit — aspetto 30s...`)
        await sleep(30000)
      } else {
        console.log(`[${String(i).padStart(2,'0')}] ❌ ${r.status}: ${JSON.stringify(r.data)}`)
        done = true
      }
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
    await sleep(4000)
  }

  console.log(`\n✅ ${users.length} utenti salvati in ${USERS_FILE}`)
  console.log(`\nProssimo passo: node stress-test-v6.js login <URL> <ANON_KEY>\n`)
}

// ── LOGIN ──────────────────────────────────────────────────────────────────

async function cmdLogin() {
  const [SUPABASE_URL, ANON_KEY] = args
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error('Usage: node stress-test-v6.js login <URL> <ANON_KEY>')
    process.exit(1)
  }

  if (!fs.existsSync(USERS_FILE)) {
    console.error(`❌ ${USERS_FILE} non trovato. Esegui prima: create`)
    process.exit(1)
  }

  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'))
  console.log(`\n🔐 Login di ${users.length} utenti (1s pausa, retry automatico se 429)...\n`)

  const start  = Date.now()
  const tokens = []

  for (let idx = 0; idx < users.length; idx++) {
    const user = users[idx]
    let done = false

    while (!done) {
      const r = await authPost(SUPABASE_URL, '/token?grant_type=password', {
        email: user.email, password: user.password
      }, ANON_KEY)

      if (r.status === 200 && r.data?.access_token) {
        process.stdout.write('.')
        tokens.push({ idx, email: user.email, token: r.data.access_token, userId: r.data.user?.id })
        done = true
      } else if (r.status === 429) {
        console.log(`\n[${String(idx).padStart(2,'0')}] ⚠ Rate limit — aspetto 15s...`)
        await sleep(15000)
        // riprova
      } else {
        process.stdout.write('x')
        console.log(`\n[${String(idx).padStart(2,'0')}] ❌ ${r.data?.error_description ?? r.data?.msg ?? JSON.stringify(r.data)}`)
        tokens.push({ idx, email: user.email, token: null, error: r.data?.error_description ?? r.data?.msg })
        done = true
      }
    }

    // Salva progressivamente — se si interrompe conserva i token già ottenuti
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2))

    if (idx < users.length - 1) await sleep(1000)
  }

  const elapsed = Date.now() - start
  const ok      = tokens.filter(t => t.token)
  const fail    = tokens.filter(t => !t.token)

  console.log(`\n\n✓ Login completato in ${(elapsed/1000).toFixed(1)}s`)
  console.log(`  Loggati: ${ok.length}/${users.length}`)
  if (fail.length > 0) fail.forEach(t => console.log(`  ❌ User ${t.idx} (${t.email}): ${t.error}`))

  console.log(`\n✅ Token salvati in ${TOKENS_FILE}`)
  console.log(`\nProssimo passo: node stress-test-v6.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>\n`)
}

// ── TEST ───────────────────────────────────────────────────────────────────

async function cmdTest() {
  const [SUPABASE_URL, ANON_KEY, SESSION_ID, SCENE_ID] = args
  if (!SUPABASE_URL || !ANON_KEY || !SESSION_ID || !SCENE_ID) {
    console.error('Usage: node stress-test-v6.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>')
    process.exit(1)
  }

  if (!fs.existsSync(TOKENS_FILE)) {
    console.error(`❌ ${TOKENS_FILE} non trovato. Esegui prima: login`)
    process.exit(1)
  }

  const allTokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'))
  const loggedIn  = allTokens.filter(t => t.token)

  if (loggedIn.length === 0) {
    console.error('❌ Nessun token valido nel file. Riesegui: login')
    process.exit(1)
  }

  console.log(`\n🚀 Stress test — ${loggedIn.length} utenti loggati`)
  console.log(`   Session: ${SESSION_ID}`)
  console.log(`   Scene:   ${SCENE_ID}`)
  console.log(`\n🗳  Voto simultaneo — GO!\n`)

  const voteStart = Date.now()

  const results = await Promise.all(loggedIn.map(async (sess) => {
    const { idx, token, userId } = sess
    const choiceId   = CHOICES[idx % CHOICES.length]
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

      // Misura solo INSERT voto
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

  const voteMs    = Date.now() - voteStart
  const succeeded = results.filter(r => r.success)
  const failed    = results.filter(r => !r.success)

  const totalTimes = results.map(r => r.ms)
  const avgTotal   = Math.round(totalTimes.reduce((a,b) => a+b,0) / totalTimes.length)
  const maxTotal   = Math.max(...totalTimes)
  const minTotal   = Math.min(...totalTimes)

  const voteTimes = results.filter(r => r.voteMs !== null).map(r => r.voteMs)
  const avgVote   = Math.round(voteTimes.reduce((a,b) => a+b,0) / voteTimes.length)
  const maxVote   = Math.max(...voteTimes)
  const minVote   = Math.min(...voteTimes)

  console.log(`\n\n${'─'.repeat(55)}`)
  console.log(`📊 RISULTATI`)
  console.log('─'.repeat(55))
  console.log(`✅ Successi:             ${succeeded.length}/${loggedIn.length}`)
  console.log(`❌ Fallimenti:           ${failed.length}`)
  console.log(`⏱  Tutti i voti in:      ${voteMs}ms`)
  console.log(``)
  console.log(`📌 Tempo per utente (session load + voto):`)
  console.log(`   Min:    ${minTotal}ms`)
  console.log(`   Media:  ${avgTotal}ms`)
  console.log(`   Max:    ${maxTotal}ms`)
  console.log(``)
  console.log(`📌 Tempo solo INSERT voto:`)
  console.log(`   Min:    ${minVote}ms`)
  console.log(`   Media:  ${avgVote}ms`)
  console.log(`   Max:    ${maxVote}ms`)

  if (failed.length > 0) {
    console.log('\n❌ Dettaglio fallimenti:')
    failed.forEach(r => console.log(`   User ${r.idx}: ${r.error}`))
  }

  console.log(`\nLeggenda: ✓=ok  ~=già votato  ✗=errore  S=session error  E=eccezione\n`)
}

// ── Router ─────────────────────────────────────────────────────────────────

switch (COMMAND) {
  case 'create': cmdCreate().catch(console.error); break
  case 'login':  cmdLogin().catch(console.error);  break
  case 'test':   cmdTest().catch(console.error);   break
  default:
    console.log(`
Stress Test v6

Passi:
  1. Crea utenti (una tantum, ~3 minuti):
     node stress-test-v6.js create <URL> <ANON_KEY>

  2. Login e salva token (1s pausa, retry automatico):
     node stress-test-v6.js login <URL> <ANON_KEY>

  3. Test voto simultaneo (ripetibile):
     node stress-test-v6.js test <URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>

Note:
  - I token scadono dopo ~1 ora — riesegui login se necessario
  - Il login salva progressivamente — se si interrompe, riprende da dove era
    `)
}
