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
  ('What is the capital of France?', 'Paris', 'Berlin', 'Madrid', 'Rome', 'A', 20, 1),
  ('Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'B', 20, 2),
  ('What is the largest ocean on Earth?', 'Atlantic', 'Indian', 'Arctic', 'Pacific', 'D', 20, 3),
  ('Who wrote "Romeo and Juliet"?', 'Charles Dickens', 'William Shakespeare', 'Mark Twain', 'Jane Austen', 'B', 20, 4),
  ('What is the chemical symbol for gold?', 'Ag', 'Fe', 'Au', 'Pb', 'C', 20, 5);
