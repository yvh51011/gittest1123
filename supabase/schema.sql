-- =========================================================
-- WordNest · Supabase Schema + RLS
-- 사용법: Supabase Dashboard → SQL Editor → New query → 실행
-- =========================================================

-- 기존 객체가 있으면 정리 후 재생성 (처음 실행이면 무시됨)
drop table if exists public.quiz_answers cascade;
drop table if exists public.quiz_sessions cascade;
drop table if exists public.words cascade;
drop table if exists public.user_stats cascade;
drop function if exists public.set_updated_at() cascade;

-- ---------- 공통: updated_at 자동 갱신 ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 1) words — 사용자별 단어장
--    현재 앱 필드: id, en, ko, pos, example, exampleKo, status
-- =========================================================
create table public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  en text not null,
  ko text not null,
  pos text,
  example text,
  example_ko text,
  status text not null default 'new'
    check (status in ('new', 'learning', 'known')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index words_user_id_idx on public.words (user_id);
create index words_user_status_idx on public.words (user_id, status);
create index words_user_en_idx on public.words (user_id, en);

create trigger words_set_updated_at
before update on public.words
for each row
execute function public.set_updated_at();

alter table public.words enable row level security;

-- 본인 단어만 조회
create policy "words_select_own"
on public.words
for select
to authenticated
using (auth.uid() = user_id);

-- 본인 명의로만 추가 (user_id 위조 방지)
create policy "words_insert_own"
on public.words
for insert
to authenticated
with check (auth.uid() = user_id);

-- 본인 단어만 수정
create policy "words_update_own"
on public.words
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 본인 단어만 삭제
create policy "words_delete_own"
on public.words
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 2) user_stats — 연속 정답(streak) 등 학습 요약
--    현재 앱 필드: streak
-- =========================================================
create table public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  streak integer not null default 0 check (streak >= 0),
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_stats_set_updated_at
before update on public.user_stats
for each row
execute function public.set_updated_at();

alter table public.user_stats enable row level security;

create policy "user_stats_select_own"
on public.user_stats
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_stats_insert_own"
on public.user_stats
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_stats_update_own"
on public.user_stats
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_stats_delete_own"
on public.user_stats
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 3) quiz_sessions — 퀴즈 결과 (확장용, 현재 앱 UI는 미연동)
-- =========================================================
create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  total integer not null default 0 check (total >= 0),
  played_at timestamptz not null default now()
);

create index quiz_sessions_user_id_idx on public.quiz_sessions (user_id);

alter table public.quiz_sessions enable row level security;

create policy "quiz_sessions_select_own"
on public.quiz_sessions
for select
to authenticated
using (auth.uid() = user_id);

create policy "quiz_sessions_insert_own"
on public.quiz_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "quiz_sessions_delete_own"
on public.quiz_sessions
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================================
-- 4) quiz_answers — 문항별 정오답 (확장용)
-- =========================================================
create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  word_id uuid references public.words (id) on delete set null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create index quiz_answers_session_id_idx on public.quiz_answers (session_id);

alter table public.quiz_answers enable row level security;

-- 세션 소유자만 답안 조회/추가/삭제
create policy "quiz_answers_select_own"
on public.quiz_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.quiz_sessions s
    where s.id = quiz_answers.session_id
      and s.user_id = auth.uid()
  )
);

create policy "quiz_answers_insert_own"
on public.quiz_answers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.quiz_sessions s
    where s.id = quiz_answers.session_id
      and s.user_id = auth.uid()
  )
);

create policy "quiz_answers_delete_own"
on public.quiz_answers
for delete
to authenticated
using (
  exists (
    select 1
    from public.quiz_sessions s
    where s.id = quiz_answers.session_id
      and s.user_id = auth.uid()
  )
);

-- =========================================================
-- 참고
-- - anon(비로그인)은 위 테이블에 접근 불가 (authenticated만 허용)
-- - 비밀번호는 auth.users에만 저장되며 이 SQL과 무관
-- - 앱에서는 insert 시 user_id에 auth.uid() 값을 넣어야 함
-- =========================================================
