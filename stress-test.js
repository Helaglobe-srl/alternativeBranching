// stress-test.js
// Simula 40 partecipanti che si registrano, fanno login e votano simultaneamente
// Usage: node stress-test.js <SUPABASE_URL> <SUPABASE_ANON_KEY> <SESSION_ID> <SCENE_ID>

const [,, SUPABASE_URL, SUPABASE_KEY, SESSION_ID, SCENE_ID] = process.argv

if (!SUPABASE_URL || !SUPABASE_KEY || !SESSION_ID || !SCENE_ID) {
  console.error(`
Usage: node stress-test.js <SUPABASE_URL> <ANON_KEY> <SESSION_ID> <SCENE_ID>

Example:
  node stress-test.js https://xxx.supabase.co eyJxxx... 3e1f4a46-... intro
  `)
  process.exit(1)
}

const N_USERS    = 40
const TEST_EMAIL = (i) => `stress_test_user_${i}_${Date.now()}@helaglobe-test.com`
const TEST_PWD   = 'StressTest123!'
const CHOICES    = ['0', '1', '2', '3'] // choice_id da assegnare a rotazione

// ── Helpers ────────────────────────────────────────────────────────────────

async function supabaseRequest(path, method = 'GET', body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token ?? SUPABASE_KEY}`,
  }
  if (method !== 'GET') headers['Prefer'] = 'return=minimal'

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, data: json, ok: res.ok }
}

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return { status: res.status, data: json, ok: res.ok }
}

// ── Simulate single user ───────────────────────────────────────────────────

async function simulateUser(idx) {
  const email    = TEST_EMAIL(idx)
  const start    = Date.now()
  const choiceId = CHOICES[idx % CHOICES.length]
  const log      = (msg) => console.log(`[User ${String(idx).padStart(2,'0')}] ${msg}`)

  try {
    // 1. Signup
    const signup = await authRequest('/signup', { email, password: TEST_PWD })
    if (!signup.ok && signup.data?.code !== 'user_already_exists') {
      log(`❌ Signup failed: ${JSON.stringify(signup.data)}`)
      return { idx, success: false, error: 'signup', ms: Date.now() - start }
    }
    log(`✓ Signup (${Date.now() - start}ms)`)

    // 2. Login
    const login = await authRequest('/token?grant_type=password', { email, password: TEST_PWD })
    if (!login.ok || !login.data?.access_token) {
      log(`❌ Login failed: ${JSON.stringify(login.data)}`)
      return { idx, success: false, error: 'login', ms: Date.now() - start }
    }
    const token  = login.data.access_token
    const userId = login.data.user?.id
    log(`✓ Login (${Date.now() - start}ms)`)

    // 3. Load session
    const sess = await supabaseRequest(
      `/rest/v1/live_sessions?select=*&id=eq.${SESSION_ID}`,
      'GET', null, token
    )
    if (!sess.ok || !sess.data?.[0]) {
      log(`❌ Session load failed: ${JSON.stringify(sess.data)}`)
      return { idx, success: false, error: 'session', ms: Date.now() - start }
    }
    const session = sess.data[0]
    log(`✓ Session loaded (${Date.now() - start}ms)`)

    // 4. Check già votato
    const check = await supabaseRequest(
      `/rest/v1/live_votes?select=choice_id&session_id=eq.${SESSION_ID}&scene_id=eq.${SCENE_ID}&user_id=eq.${userId}&round=eq.${session.current_round ?? 1}`,
      'GET', null, token
    )
    if (check.data?.length > 0) {
      log(`⚠ Already voted, skipping`)
      return { idx, success: true, skipped: true, ms: Date.now() - start }
    }

    // 5. Voto
    const vote = await supabaseRequest('/rest/v1/live_votes', 'POST', {
      session_id:       SESSION_ID,
      scene_id:         SCENE_ID,
      user_id:          userId,
      participant_name: `TestUser${idx}`,
      choice_id:        choiceId,
      choice_text:      `Test choice ${choiceId}`,
      round:            session.current_round ?? 1,
      reset_key:        session.reset_at ?? 'initial',
    }, token)

    if (vote.status === 201 || vote.status === 204) {
      log(`✓ Voted choice ${choiceId} (${Date.now() - start}ms total)`)
      return { idx, success: true, ms: Date.now() - start }
    } else {
      log(`❌ Vote failed ${vote.status}: ${JSON.stringify(vote.data)}`)
      return { idx, success: false, error: 'vote', ms: Date.now() - start }
    }

  } catch (err) {
    log(`❌ Exception: ${err.message}`)
    return { idx, success: false, error: err.message, ms: Date.now() - start }
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n🧹 Cleaning up test votes...')
  // Rimuove i voti inseriti con participant_name che inizia per TestUser
  const r = await supabaseRequest(
    `/rest/v1/live_votes?session_id=eq.${SESSION_ID}&scene_id=eq.${SCENE_ID}&participant_name=like.TestUser*`,
    'DELETE', null, null
  )
  console.log(`   Deleted test votes: ${r.status}`)
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Stress test — ${N_USERS} utenti simultanei`)
  console.log(`   Session: ${SESSION_ID}`)
  console.log(`   Scene:   ${SCENE_ID}`)
  console.log(`   URL:     ${SUPABASE_URL}\n`)

  const globalStart = Date.now()

  // Lancia tutti gli utenti in parallelo (burst simultaneo)
  const results = await Promise.all(
    Array.from({ length: N_USERS }, (_, i) => simulateUser(i))
  )

  const elapsed   = Date.now() - globalStart
  const succeeded = results.filter(r => r.success).length
  const failed    = results.filter(r => !r.success)
  const avgMs     = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length)
  const maxMs     = Math.max(...results.map(r => r.ms))

  console.log('\n' + '─'.repeat(50))
  console.log(`📊 RISULTATI`)
  console.log('─'.repeat(50))
  console.log(`✅ Successi:     ${succeeded}/${N_USERS}`)
  console.log(`❌ Fallimenti:   ${failed.length}`)
  console.log(`⏱  Tempo totale: ${elapsed}ms`)
  console.log(`⏱  Media/utente: ${avgMs}ms`)
  console.log(`⏱  Max/utente:   ${maxMs}ms`)

  if (failed.length > 0) {
    console.log('\n❌ Utenti falliti:')
    failed.forEach(r => console.log(`   User ${r.idx}: ${r.error}`))
  }

  // Cleanup opzionale
  const args = process.argv.slice(6)
  if (args.includes('--cleanup')) {
    await cleanup()
  } else {
    console.log('\n💡 Aggiungi --cleanup per rimuovere i voti test')
  }

  console.log('')
}

main().catch(console.error)