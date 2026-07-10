-- Phase 1: Core schema for the real-time quiz app
-- Run this in the Supabase SQL Editor (or via `supabase db push` / migrations).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- questions: fixed default question bank
-- ---------------------------------------------------------------------------
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option char(1) not null check (correct_option in ('A', 'B', 'C', 'D')),
  time_limit_seconds integer not null default 30 check (time_limit_seconds > 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- game_sessions: one row per hosted game (a "run" of the quiz)
-- ---------------------------------------------------------------------------
create table if not exists game_sessions (
  id uuid primary key default gen_random_uuid(),
  game_code varchar(4) not null,
  status varchar(20) not null default 'waiting'
    check (status in ('waiting', 'active', 'completed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_sessions_game_code on game_sessions (game_code);

-- ---------------------------------------------------------------------------
-- player_responses: every answer a player submits, logged for analytics
-- ---------------------------------------------------------------------------
create table if not exists player_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references game_sessions (id) on delete cascade,
  nickname varchar(30) not null,
  question_id uuid not null references questions (id),
  selected_option char(1) check (selected_option in ('A', 'B', 'C', 'D')),
  is_correct boolean not null default false,
  response_time_ms integer not null,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_player_responses_session_id on player_responses (session_id);
create index if not exists idx_player_responses_question_id on player_responses (question_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: locked down by default. The Node backend connects with
-- the SERVICE ROLE key, which bypasses RLS entirely, so no public policies
-- are defined here. Do not expose the service role key to any frontend client.
-- ---------------------------------------------------------------------------
alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table player_responses enable row level security;

-- ---------------------------------------------------------------------------
-- Seed data: 5 default fixed questions
-- ---------------------------------------------------------------------------
insert into questions
  (question_text, option_a, option_b, option_c, option_d, correct_option, time_limit_seconds, display_order)
values
  (
    'An AI Intern keeps getting return policy exceptions wrong. What is most likely missing?',
    'A better system prompt with a friendlier tone',
    'It should be single-purpose, not multi-purpose',
    'The exceptions document is not in its knowledge base, so it guesses',
    'It needs to move from Chat to Co-work',
    'C', 30, 1
  ),
  (
    'Your HR team will screen resumes with the same rubric every day. Where should you build the assistant?',
    'A normal chat, since Claude remembers recent messages',
    'A Project, with persistent instructions and knowledge files',
    'A new chat every morning, pasting the SOP manually',
    'One shared chat link everyone reuses forever',
    'B', 30, 2
  ),
  (
    'You have 15 minutes to get Claude to build an elite, customized 5-year growth strategy. What works best?',
    'Paste a 50-page industry report and ask it to adapt it',
    'Write a 3-page company backstory and ask for a plan',
    'Use a CRAFT prompt with your role, goals, and format',
    'Ask it to act as a McKinsey partner and interview you one question at a time, then build the strategy',
    'D', 30, 3
  ),
  (
    'You paste a sensitive vendor agreement into a free AI chat, then delete the chat 10 seconds later. What happens to the data?',
    'It is instantly wiped from the backend servers',
    'It is encrypted and only readable by government request',
    'It stays in backend logs up to 30 days and may train future models unless you opted out',
    'The AI flags it as a contract and self-destructs the data',
    'C', 30, 4
  ),
  (
    'A company used AI to map supply chain risks five layers deep and predicted a factory shutdown before its supplier even reported it. How?',
    'It analyzed the supplier''s historical shipping data for patterns',
    'It made all sub-suppliers fill out risk compliance forms',
    'It scanned millions of public data points like local news, weather alerts, and customs filings',
    'It plugged into the supplier''s inventory software in real time',
    'C', 30, 5
  );
