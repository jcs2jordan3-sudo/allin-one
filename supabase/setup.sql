-- ALL-IN ONE 데모용 Supabase 스키마
-- Supabase 대시보드 → SQL Editor에서 이 파일 전체를 실행하세요.
--
-- 구조: 앱 상태 스냅샷을 jsonb 한 행으로 저장하고 Realtime으로 기기 간 동기화.
-- (실서비스 전환 시에는 기획서의 정규화 스키마 + RPC 원장으로 대체)

create table if not exists public.app_state (
  store_key text primary key,
  state jsonb not null,
  writer text,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- ⚠ 데모 정책: anon 키만 있으면 읽기/쓰기 가능.
--   실사용 전에는 Supabase Auth 로그인 + 사용자별 정책으로 교체할 것.
drop policy if exists "demo anon select" on public.app_state;
drop policy if exists "demo anon insert" on public.app_state;
drop policy if exists "demo anon update" on public.app_state;

create policy "demo anon select" on public.app_state
  for select to anon using (true);
create policy "demo anon insert" on public.app_state
  for insert to anon with check (true);
create policy "demo anon update" on public.app_state
  for update to anon using (true);

-- Realtime 활성화 (이미 추가돼 있으면 오류가 나므로 무시해도 됨)
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null;
end $$;
