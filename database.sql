-- ============================================================
-- UCB Red Flags — Migration completa
-- Generata da schema Supabase esistente
-- Data: 2026-04-08
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 1. USER PROFILES ──────────────────────────────────────────────────────────
-- Profili utente con flag admin, collegati a auth.users

create table if not exists user_profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean default false
);

alter table user_profiles enable row level security;

create policy "utente legge proprio profilo"
  on user_profiles for select to authenticated
  using (id = auth.uid());

create policy "insert libero per trigger"
  on user_profiles for insert
  with check (true);

-- Trigger: crea profilo automaticamente alla registrazione
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, is_admin)
  values (new.id, false)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── 2. UCB SESSIONS ───────────────────────────────────────────────────────────
-- Sessioni di navigazione individuale dei casi clinici

create table if not exists ucb_sessions (
  id         uuid primary key default gen_random_uuid(),
  username   text not null,
  story_slug text not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  completed  boolean not null default false
);

alter table ucb_sessions enable row level security;

create policy "authenticated può gestire proprie sessioni ucb"
  on ucb_sessions for all to authenticated
  using (true) with check (true);

-- ── 3. UCB EVENTS ─────────────────────────────────────────────────────────────
-- Eventi di navigazione per ogni scena visitata

create table if not exists ucb_events (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references ucb_sessions(id) on delete cascade,
  scene_id     text not null,
  scene_type   text,
  choice_text  text,
  entered_at   timestamptz not null default now(),
  time_on_scene integer
);

alter table ucb_events enable row level security;

create policy "authenticated può gestire propri eventi ucb"
  on ucb_events for all to authenticated
  using (true) with check (true);

-- ── 4. LIVE SESSIONS ──────────────────────────────────────────────────────────
-- Sessioni live di voto gestite dagli admin durante presentazioni

create table if not exists live_sessions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  story_slug    text not null,
  scene_id      text,                        -- scena decisionale corrente
  voting_open   boolean default false,       -- voto aperto/chiuso
  revealed      boolean default false,       -- risultati rivelati
  created_at    timestamptz default now(),
  created_by    uuid references auth.users(id),
  current_round integer default 1,          -- round corrente (per storico)
  reset_at      timestamptz                 -- timestamp dell'ultimo reset voti
);

alter table live_sessions enable row level security;

create policy "admin gestisce sessioni live"
  on live_sessions for all to authenticated
  using (exists (
    select 1 from user_profiles
    where id = auth.uid() and is_admin = true
  ))
  with check (exists (
    select 1 from user_profiles
    where id = auth.uid() and is_admin = true
  ));

create policy "tutti leggono sessioni live"
  on live_sessions for select to anon, authenticated
  using (true);

-- Abilita realtime
alter publication supabase_realtime add table live_sessions;

-- ── 5. LIVE VOTES ─────────────────────────────────────────────────────────────
-- Voti dei partecipanti per ogni domanda della sessione live
-- I voti NON vengono mai cancellati — il reset usa reset_key per distinguere i cicli

create table if not exists live_votes (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid references live_sessions(id) on delete cascade,
  scene_id         text,                    -- scena/domanda votata
  user_id          uuid references auth.users(id),
  participant_name text not null,
  choice_id        text not null,
  choice_text      text not null,
  voted_at         timestamptz default now(),
  round            integer default 1,       -- round (cambia quando cambia scena)
  reset_key        text,                    -- reset_at ISO string o 'initial' — garantisce unicità per ciclo

  -- Un voto per utente per scena per ciclo di voto
  constraint live_votes_session_scene_user_resetkey_unique
    unique (session_id, scene_id, user_id, reset_key)
);

alter table live_votes enable row level security;

create policy "autenticati inseriscono voto"
  on live_votes for insert to authenticated
  with check (true);

create policy "autenticati leggono voti"
  on live_votes for select to authenticated
  using (true);

create policy "admin cancella voti"
  on live_votes for delete to authenticated
  using (exists (
    select 1 from user_profiles
    where id = auth.uid() and is_admin = true
  ));

-- Abilita realtime
alter publication supabase_realtime add table live_votes;

-- ── 6. FORM SUBMISSIONS ───────────────────────────────────────────────────────
-- Form di contatto/registrazione generici

create table if not exists form_submissions (
  id        uuid primary key default gen_random_uuid(),
  form_name text not null,
  page      text not null,
  data      jsonb,
  created_at timestamptz default now()
);

-- ── 7. PAGE VIEWS ─────────────────────────────────────────────────────────────
-- Tracking visite pagine

create table if not exists page_views (
  id         uuid primary key default gen_random_uuid(),
  page       text not null,
  created_at timestamptz default now(),
  user_agent text,
  referrer   text
);

-- ── Popolamento profili utenti esistenti ──────────────────────────────────────
-- Da eseguire una sola volta dopo la migration per utenti già presenti
insert into user_profiles (id, is_admin)
select id, false from auth.users
on conflict (id) do nothing;

-- ── Flag admin (personalizzare con le email reali) ────────────────────────────
-- update user_profiles set is_admin = true
-- where id = (select id from auth.users where email = 'admin@esempio.it');