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
  time_limit_seconds integer not null default 20 check (time_limit_seconds > 0),
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
    'An AI Intern keeps giving wrong answers about return policy exceptions. What''s most likely missing?',
    'It needs a better system prompt with a friendlier tone',
    'It needs to be single-purpose instead of multi-purpose',
    'Its knowledge base doesn''t actually contain the exceptions document — it''s guessing',
    'It needs to be moved from Chat to Co-work',
    'C', 20, 1
  ),
  (
    'You''re building an AI assistant for your HR team that will screen resumes using the same rubric every day. Where should you build it?',
    'A normal chat, because Claude remembers your last few messages anyway.',
    'A Project, because it needs persistent instructions, knowledge files, and repeated use.',
    'Start a new chat every morning and paste the SOP manually.',
    'One shared chat link that everyone continues using forever.',
    'B', 20, 2
  ),
  (
    'You want to use Claude to build a highly disruptive 5-year growth strategy for your specific business. You have 15 minutes. What is statistically the most effective thing to get a hyper-customized, elite output?',
    'Paste a 50-page generic industry report and ask it to adapt it to your company.',
    'Write a 3-page detailed backstory of your company''s history and ask for a plan.',
    'Use CRAFT prompt detailing your role, goals, and target format.',
    '"Act as an elite McKinsey partner. Interview me one question at a time to extract the context in my head, then build the strategy."',
    'D', 20, 3
  ),
  (
    'You accidentally paste a sensitive, unredacted vendor agreement into a free Claude or ChatGPT window to summarize it. Realizing your mistake, you immediately click "Delete Chat" 10 seconds later. What actually happens to that company data?',
    'It is instantly wiped from the AI company''s backend servers permanently.',
    'It is encrypted and locked, readable only if a government agency requests it.',
    'It remains stored in their backend logs for up to 30 days and can be used to train future models unless you explicitly toggled off data sharing in your settings first.',
    'The AI system automatically flags it as a contract and self-destructs the data block.',
    'C', 20, 4
  ),
  (
    'In the opening case studies, Interos used AI to map supply chain risks "five layers deep," predicting an upstream factory shutdown days before the primary supplier even reported it. How did the AI actually figure this out without any direct access to those sub-vendors?',
    'It analyzed the primary supplier''s historical shipping data to spot seasonal patterns in past delivery delays.',
    'It required all sub-suppliers to fill out automated risk-compliance forms to update their operational status.',
    'It continuously scanned millions of messy public data points—like local foreign news, weather alerts, and customs filings—to connect the dots between hidden vendors.',
    'It integrated directly into the supplier''s internal inventory software to monitor raw material levels in real-time.',
    'C', 20, 5
  );
