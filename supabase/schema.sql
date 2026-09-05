-- =====================================================================
-- ALL-IN ONE 홀덤펍 매니저 — Supabase 스키마 v1
--
-- 실행: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다(idempotent). 기존 데모 테이블(app_state)은 건드리지 않습니다.
--
-- 구조 요약
--   stores / staff(직원·콘솔 로그인) / members(회원·앱 로그인)
--   wallets(잔액 캐시) + ledger(append-only 원장) — 모든 재화 이동은 _move() 한 곳에서만
--   game_sets / games / game_entries / buyin_events — 게임 운영, 셀프 바인 RPC
--   console_state — 콘솔 전용 상태(이용권·시즌·RP 로그·대기자) jsonb
--   events — 이벤트&공지 (전광판 공개)
-- 권한
--   직원: 콘솔 전체. 회원: 본인 데이터 + 셀프 바인. 익명: 전광판·공개 랭킹·게임 조회.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null default '내 매장',
  tables jsonb not null default '[{"no":1,"seats":9},{"no":2,"seats":9},{"no":3,"seats":9}]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.console_state (
  store_id uuid primary key references public.stores(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  writer text,
  updated_at timestamptz not null default now()
);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  name text not null,
  role text not null default 'manager' check (role in ('owner', 'manager', 'dealer')),
  created_at timestamptz not null default now(),
  unique (store_id, email)
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  no text not null,
  nickname text not null,
  emoji text not null default '🙂',
  color text not null default '#57B6F2',
  real_name text,
  phone text,
  rp bigint not null default 0 check (rp >= 0),
  status text not null default 'active' check (status in ('active', 'left')),
  memo text,
  joined_at timestamptz not null default now(),
  unique (store_id, no)
);

-- 잔액은 원장의 파생값(캐시). RPC(_move) 외에는 갱신하지 않음. 음수 불가.
create table if not exists public.wallets (
  store_id uuid not null references public.stores(id) on delete cascade,
  owner text not null,            -- 'store' | 회원 id(uuid 문자열)
  currency text not null check (currency in ('P', 'S', 'V')),
  balance bigint not null default 0 check (balance >= 0),
  primary key (store_id, owner, currency)
);

-- 원장: append-only. 수정·삭제는 트리거로 차단, 정정은 역거래 행 추가로만.
create table if not exists public.ledger (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  seq bigserial,
  ts timestamptz not null default now(),
  currency text not null check (currency in ('P', 'S', 'V')),
  amount bigint not null check (amount > 0),
  from_owner text not null,       -- 'hq' | 'store' | 회원 id
  to_owner text not null,
  reason text,
  operator text,
  game_id uuid,
  store_balance_after bigint not null,
  request_id text unique          -- 멱등 키: 같은 요청은 1회만 처리
);
create index if not exists ledger_store_seq on public.ledger (store_id, seq desc);

create table if not exists public.game_sets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  data jsonb not null,            -- levels, regCloseLevelIndex, buyinRules, earlyBird, prizes, rpByRank
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  game_set_name text not null,
  snapshot jsonb not null,        -- 시작 시점 게임 셋 사본(id·name 포함)
  status text not null default 'running' check (status in ('running', 'paused', 'ended')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  paused_total_ms bigint not null default 0,
  reg_closed_manual boolean not null default false,
  tables int[] not null default '{}',
  ended_at timestamptz,
  notice text,
  cancelled boolean not null default false,
  chip_correction bigint not null default 0,
  correction_count int not null default 0,
  addon_chips bigint not null default 0,
  addon_count int not null default 0,
  -- 전광판 QR에 실리는 불투명 코드. 게임 id 대신 노출.
  join_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  created_at timestamptz not null default now()
);
create index if not exists games_store_created on public.games (store_id, created_at desc);

create table if not exists public.game_entries (
  game_id uuid not null references public.games(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  table_no int not null,
  seat int not null,
  status text not null default 'playing' check (status in ('playing', 'eliminated')),
  rank int,
  out_at timestamptz,
  primary key (game_id, member_id)
);

create table if not exists public.buyin_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  ts timestamptz not null default now(),
  member_id uuid not null references public.members(id) on delete cascade,
  type text not null check (type in ('BUYIN', 'RE_BUYIN', 'RE_ENTRY')),
  round int not null default 1,
  currency text not null,
  cost bigint not null,
  chips bigint not null,
  early_bird_chips bigint,
  ledger_id uuid references public.ledger(id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

-- ── v2: 이용권·시즌·RP 로그·대기자·감사 로그 (console_state jsonb → 정규 테이블) ──
alter table public.stores add column if not exists biz_reset_at timestamptz not null default now();

create table if not exists public.pass_types (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  valid_days int not null default 30 check (valid_days between 1 and 3650),
  color text not null default '#57B6F2',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type_id uuid not null references public.pass_types(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'unused' check (status in ('unused', 'used', 'revoked')),
  used_at timestamptz
);
create index if not exists passes_store_issued on public.passes (store_id, issued_at desc);

create table if not exists public.pass_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  ts timestamptz not null default now(),
  action text not null,
  type_name text,
  member_id uuid,
  detail text,
  operator text
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  started_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed', 'settled')),
  closed_at timestamptz,
  results jsonb
);

create table if not exists public.rp_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  ts timestamptz not null default now(),
  member_id uuid not null,
  delta bigint not null,
  reason text not null,
  operator text
);

-- 대기자 명단 · 좌석 체크인 (F-26). source: qr = 손님 셀프, staff = 직원 등록
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  guest_name text,
  status text not null default 'waiting' check (status in ('waiting', 'called', 'seated', 'noshow', 'cancelled', 'left')),
  source text not null default 'staff' check (source in ('qr', 'staff')),
  arrived_at timestamptz not null default now(),
  called_at timestamptz,
  seated_at timestamptz,
  ended_at timestamptz,
  table_no int,
  seat int,
  note text
);
create index if not exists waitlist_store_active on public.waitlist (store_id, arrived_at) where status in ('waiting', 'called', 'seated');

-- 감사 로그: 직원 행위 전부. 재화 이동은 ledger가 원본이므로 여기엔 설정·회원·게임·직원 변경을 남긴다.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  ts timestamptz not null default now(),
  actor_id uuid,
  actor text,
  action text not null,        -- 예: members.update, staff.insert, games.cancel
  target_type text not null,
  target_id text,
  detail jsonb
);
create index if not exists audit_log_store_ts on public.audit_log (store_id, ts desc);

-- ---------------------------------------------------------------------
-- 2. 권한 헬퍼 (RLS 정책과 RPC가 공용)
-- ---------------------------------------------------------------------
-- 플랫폼 관리자(개발자) — 테이블은 아래 스코프 함수들이 참조하므로 여기서 먼저 생성 (RPC는 10b 섹션)
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;        -- 정책 없음: RPC(security definer)로만 접근
-- 개발자가 "보고 있는" 매장: 선택해 두면 그 매장의 대표(owner)처럼 취급됨
create table if not exists public.platform_admin_scope (
  user_id uuid primary key references public.platform_admins(user_id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  selected_at timestamptz not null default now()
);
alter table public.platform_admin_scope enable row level security;

-- 현재 계정의 소속 매장 / 역할: 직원 행이 우선, 없으면 개발자가 선택한 매장(대표 권한)
create or replace function public.staff_store_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select store_id from public.staff where user_id = auth.uid() limit 1),
    (select store_id from public.platform_admin_scope where user_id = auth.uid()))
$$;

create or replace function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.staff where user_id = auth.uid() limit 1),
    (select 'owner' from public.platform_admin_scope where user_id = auth.uid()))
$$;

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() limit 1
$$;

create or replace function public._require_staff(p_roles text[] default array['owner', 'manager', 'dealer'])
returns public.staff
language plpgsql stable security definer set search_path = public as $$
declare s public.staff; v_scope uuid;
begin
  select * into s from public.staff where user_id = auth.uid();
  if s.id is null then
    -- 개발자(플랫폼 관리자)가 매장을 선택해 둔 경우: 그 매장의 대표처럼 동작하는 가상 직원 레코드
    select store_id into v_scope from public.platform_admin_scope where user_id = auth.uid();
    if v_scope is null then raise exception '직원 계정으로 로그인해야 합니다.'; end if;
    s.id := '00000000-0000-0000-0000-000000000000'; s.store_id := v_scope; s.user_id := auth.uid();
    s.email := coalesce((select email from public.platform_admins where user_id = auth.uid()), '');
    s.name := '개발자'; s.role := 'owner'; s.created_at := now();
  end if;
  if not (s.role = any (p_roles)) then raise exception '이 작업을 수행할 권한이 없습니다. (현재 역할: %)', s.role; end if;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- 3. 트리거: 원장 불변 · 지갑 자동 생성 · 회원번호 · 가입 연결
-- ---------------------------------------------------------------------
create or replace function public._deny_ledger_change() returns trigger
language plpgsql as $$
begin
  if current_setting('allinone.reset', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception '원장(ledger)은 수정·삭제할 수 없습니다. 정정은 역거래로 처리하세요.';
end $$;
drop trigger if exists ledger_immutable on public.ledger;
create trigger ledger_immutable before update or delete on public.ledger
  for each row execute function public._deny_ledger_change();

create or replace function public._init_store() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.console_state (store_id) values (new.id) on conflict do nothing;
  insert into public.wallets (store_id, owner, currency)
  values (new.id, 'store', 'P'), (new.id, 'store', 'S'), (new.id, 'store', 'V')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists stores_init on public.stores;
create trigger stores_init after insert on public.stores for each row execute function public._init_store();

create or replace function public._init_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallets (store_id, owner, currency)
  values (new.store_id, new.id::text, 'P'), (new.store_id, new.id::text, 'S'), (new.store_id, new.id::text, 'V')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists members_init on public.members;
create trigger members_init after insert on public.members for each row execute function public._init_member();

-- 지점 스코프 순차 4자리 회원번호
create or replace function public.next_member_no(p_store uuid) returns text
language plpgsql as $$
declare n int;
begin
  select coalesce(max(no::int), 0) + 1 into n
  from public.members where store_id = p_store and no ~ '^[0-9]+$';
  return lpad(n::text, 4, '0');
end $$;

-- 앱 가입(auth.users 생성) 시:
--   1) 초대된 직원 이메일이면 staff 행에 연결
--   2) 회원 가입이면: 직원이 미리 등록한 회원(전화번호 일치·미연결)에 연결, 없으면 신규 회원 생성
--      가입 폼의 이름(real_name)·휴대폰(phone)·닉네임을 저장 — 휴대폰은 알림(카카오톡) 발송 기준
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_kind text := coalesce(nullif(meta->>'kind', ''), 'member');
  v_store uuid;
  v_phone text := nullif(regexp_replace(coalesce(meta->>'phone', ''), '\D', '', 'g'), '');
  v_name text := nullif(trim(coalesce(meta->>'real_name', '')), '');
  v_id uuid;
begin
  select id into v_id from public.staff
   where user_id is null and lower(email) = lower(coalesce(new.email, '')) limit 1;
  if v_id is not null then
    update public.staff set user_id = new.id where id = v_id;
    return new;
  end if;

  if v_kind <> 'member' then return new; end if;

  v_store := nullif(meta->>'store_id', '')::uuid;
  if v_store is null then select id into v_store from public.stores order by created_at limit 1; end if;
  if v_store is null then return new; end if;

  if v_phone is not null then
    select id into v_id from public.members
     where store_id = v_store and user_id is null and status = 'active'
       and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone
     order by joined_at desc limit 1;
    if v_id is not null then
      update public.members set user_id = new.id,
        nickname = coalesce(nullif(meta->>'nickname', ''), nickname),
        real_name = coalesce(v_name, real_name)
      where id = v_id;
      return new;
    end if;
  end if;

  insert into public.members (store_id, user_id, no, nickname, emoji, color, phone, real_name)
  values (
    v_store, new.id, public.next_member_no(v_store),
    coalesce(nullif(meta->>'nickname', ''), '회원'),
    coalesce(nullif(meta->>'emoji', ''), '🙂'),
    coalesce(nullif(meta->>'color', ''), '#57B6F2'),
    nullif(trim(coalesce(meta->>'phone', '')), ''),
    v_name
  );
  return new;
exception when others then
  -- 회원 행 생성 실패가 가입 자체를 막지 않도록 경고만 남김 (앱에서 "회원 정보 없음" 안내)
  raise warning 'handle_new_user 실패: %', sqlerrm;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. 시간·레벨 계산 (클라이언트 lib/time.ts와 동일 규칙)
-- ---------------------------------------------------------------------
create or replace function public._level_start_ms(p_levels jsonb, p_idx int) returns bigint
language plpgsql immutable as $$
declare acc bigint := 0; i int := 0; lv jsonb;
begin
  for lv in select value from jsonb_array_elements(p_levels) loop
    exit when i >= p_idx;
    acc := acc + coalesce((lv->>'durationMin')::bigint, 0) * 60000;
    i := i + 1;
  end loop;
  return acc;
end $$;

create or replace function public._level_idx(p_levels jsonb, p_elapsed bigint) returns int
language plpgsql immutable as $$
declare acc bigint := 0; i int := 0; lv jsonb; dur bigint; n int := coalesce(jsonb_array_length(p_levels), 0);
begin
  for lv in select value from jsonb_array_elements(p_levels) loop
    dur := coalesce((lv->>'durationMin')::bigint, 0) * 60000;
    if dur = 0 then return i; end if;                 -- 무제한 레벨
    if p_elapsed < acc + dur then return i; end if;
    acc := acc + dur;
    i := i + 1;
  end loop;
  return greatest(n - 1, 0);
end $$;

create or replace function public._game_elapsed_ms(g public.games) returns bigint
language plpgsql stable as $$
declare ref_ts timestamptz;
begin
  ref_ts := case
    when g.status = 'ended' and g.ended_at is not null then g.ended_at
    when g.status = 'paused' and g.paused_at is not null then g.paused_at
    else now() end;
  return greatest(0::bigint, (extract(epoch from (ref_ts - g.started_at)) * 1000)::bigint - g.paused_total_ms);
end $$;

create or replace function public._reg_closed(g public.games) returns boolean
language plpgsql stable as $$
begin
  if g.reg_closed_manual then return true; end if;
  return public._level_idx(g.snapshot->'levels', public._game_elapsed_ms(g))
         >= coalesce((g.snapshot->>'regCloseLevelIndex')::int, 999999);
end $$;

-- ---------------------------------------------------------------------
-- 5. 원장 코어 — 모든 재화 이동의 단일 경로
-- ---------------------------------------------------------------------
create or replace function public._move(
  p_store uuid, p_from text, p_to text, p_currency text, p_amount bigint,
  p_reason text, p_operator text, p_game uuid, p_request text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_bal bigint; v_nick text;
begin
  if p_amount is null or p_amount <= 0 then raise exception '수량은 1 이상이어야 합니다.'; end if;
  if p_currency not in ('P', 'S', 'V') then raise exception '알 수 없는 재화입니다.'; end if;
  if p_from = p_to then raise exception '보내는 곳과 받는 곳이 같습니다.'; end if;

  if p_request is not null then
    select id into v_id from public.ledger where request_id = p_request;
    if v_id is not null then return v_id; end if;
  end if;

  if p_from <> 'hq' then
    update public.wallets set balance = balance - p_amount
     where store_id = p_store and owner = p_from and currency = p_currency and balance >= p_amount;
    if not found then
      if p_from = 'store' then raise exception '지점 보유량이 부족합니다.'; end if;
      select nickname into v_nick from public.members where id::text = p_from;
      raise exception '%님의 % 잔액이 부족합니다.', coalesce(v_nick, '회원'),
        case p_currency when 'P' then '포인트' when 'S' then '시드' else '음료권' end;
    end if;
  end if;

  if p_to <> 'hq' then
    insert into public.wallets (store_id, owner, currency, balance)
    values (p_store, p_to, p_currency, p_amount)
    on conflict (store_id, owner, currency) do update set balance = public.wallets.balance + excluded.balance;
  end if;

  select balance into v_bal from public.wallets
   where store_id = p_store and owner = 'store' and currency = p_currency;

  insert into public.ledger (store_id, currency, amount, from_owner, to_owner, reason, operator, game_id, store_balance_after, request_id)
  values (p_store, p_currency, p_amount, p_from, p_to, p_reason, p_operator, p_game, coalesce(v_bal, 0), p_request)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. RPC — 재화·회원
-- ---------------------------------------------------------------------
create or replace function public.transfer_to_member(
  p_member uuid, p_currency text, p_amount bigint,
  p_reason text default null, p_game uuid default null, p_request text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.staff; m public.members;
begin
  s := public._require_staff(); -- 대표·매니저·딜러 모두 허용 (직원 관리·초기화만 대표 전용)
  select * into m from public.members where id = p_member and store_id = s.store_id;
  if m.id is null then raise exception '회원을 찾을 수 없습니다.'; end if;
  return public._move(s.store_id, 'store', m.id::text, p_currency, p_amount, p_reason, s.name, p_game, p_request);
end $$;

create or replace function public.reclaim_from_member(
  p_member uuid, p_currency text, p_amount bigint, p_reason text, p_request text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.staff; m public.members;
begin
  s := public._require_staff(); -- 대표·매니저·딜러 모두 허용 (직원 관리·초기화만 대표 전용)
  if coalesce(trim(p_reason), '') = '' then raise exception '환수 사유를 입력해주세요.'; end if;
  select * into m from public.members where id = p_member and store_id = s.store_id;
  if m.id is null then raise exception '회원을 찾을 수 없습니다.'; end if;
  return public._move(s.store_id, m.id::text, 'store', p_currency, p_amount, trim(p_reason), s.name, null, p_request);
end $$;

-- 본사 발행분·현금 매입분 → 지점 지갑
create or replace function public.issue_to_store(p_currency text, p_amount bigint, p_reason text, p_request text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  s := public._require_staff(); -- 대표·매니저·딜러 모두 허용 (직원 관리·초기화만 대표 전용)
  if coalesce(trim(p_reason), '') = '' then raise exception '사유를 입력해주세요.'; end if;
  return public._move(s.store_id, 'hq', 'store', p_currency, p_amount, trim(p_reason), s.name, null, p_request);
end $$;

create or replace function public.create_member(
  p_nickname text, p_emoji text default '🙂', p_color text default '#57B6F2',
  p_phone text default null, p_real_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.staff; v_id uuid;
begin
  s := public._require_staff();
  if coalesce(trim(p_nickname), '') = '' then raise exception '닉네임을 입력해주세요.'; end if;
  insert into public.members (store_id, no, nickname, emoji, color, phone, real_name)
  values (s.store_id, public.next_member_no(s.store_id), trim(p_nickname),
          coalesce(nullif(p_emoji, ''), '🙂'), coalesce(nullif(p_color, ''), '#57B6F2'),
          nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_real_name, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- 탈퇴: 잔액 전액 지점 환수 → 개인정보 익명화 (원장 행은 익명 ID로 보존, 기획서 §6-9)
create or replace function public.leave_member(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; m public.members; w record;
begin
  s := public._require_staff();
  select * into m from public.members where id = p_member and store_id = s.store_id;
  if m.id is null then raise exception '회원을 찾을 수 없습니다.'; end if;
  if m.status = 'left' then return; end if;
  for w in select currency, balance from public.wallets where store_id = s.store_id and owner = m.id::text and balance > 0 loop
    perform public._move(s.store_id, m.id::text, 'store', w.currency, w.balance, '회원 탈퇴 잔액 환수', s.name, null, null);
  end loop;
  update public.waitlist set status = 'left', ended_at = now()
   where member_id = m.id and status in ('waiting', 'called', 'seated');
  update public.members set
    status = 'left',
    nickname = '탈퇴회원 ' || no,
    real_name = null, phone = null, memo = null, user_id = null,
    emoji = '👤', color = '#64707f'
  where id = m.id;
  insert into public.audit_log (store_id, actor_id, actor, action, target_type, target_id, detail)
  values (s.store_id, s.user_id, s.name, 'members.leave', 'member', m.id::text, jsonb_build_object('no', m.no, 'nickname', m.nickname));
end $$;

-- RP 수동 조정 — 사유 필수, rp_log에 기록
create or replace function public.adjust_rp(p_member uuid, p_delta bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; m public.members;
begin
  s := public._require_staff();
  if coalesce(p_delta, 0) = 0 then raise exception '수량을 입력해주세요.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '사유를 입력해주세요. (수동 RP 조정은 사유 필수)'; end if;
  select * into m from public.members where id = p_member and store_id = s.store_id;
  if m.id is null then raise exception '회원을 찾을 수 없습니다.'; end if;
  if m.rp + p_delta < 0 then raise exception '%님의 RP가 부족합니다.', m.nickname; end if;
  update public.members set rp = rp + p_delta where id = m.id;
  insert into public.rp_log (store_id, member_id, delta, reason, operator)
  values (s.store_id, m.id, p_delta, trim(p_reason), s.name);
end $$;

-- 회원 본인 프로필 수정 (이전 4인자 서명은 제거 — 남겨두면 RPC 호출이 모호해짐)
drop function if exists public.update_my_profile(text, text, text, text);
create or replace function public.update_my_profile(
  p_nickname text default null, p_emoji text default null, p_color text default null, p_phone text default null,
  p_real_name text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.my_member_id();
begin
  if v_id is null then raise exception '회원 계정으로 로그인해야 합니다.'; end if;
  update public.members set
    nickname = coalesce(nullif(trim(p_nickname), ''), nickname),
    emoji = coalesce(nullif(p_emoji, ''), emoji),
    color = coalesce(nullif(p_color, ''), color),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    real_name = coalesce(nullif(trim(p_real_name), ''), real_name)
  where id = v_id;
end $$;

-- ---------------------------------------------------------------------
-- 7. RPC — 게임 운영
-- ---------------------------------------------------------------------
create or replace function public.create_game(
  p_name text, p_game_set uuid, p_tables int[], p_start timestamptz default null, p_notice text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.staff; gs public.game_sets; v_id uuid; v_busy int[];
begin
  s := public._require_staff();
  if coalesce(trim(p_name), '') = '' then raise exception '게임 이름을 입력해주세요.'; end if;
  select * into gs from public.game_sets where id = p_game_set and store_id = s.store_id;
  if gs.id is null then raise exception '게임 셋을 선택해주세요.'; end if;
  if p_tables is null or array_length(p_tables, 1) is null then raise exception '테이블을 1개 이상 선택해주세요.'; end if;
  select array_agg(t) into v_busy from (
    select distinct unnest(g.tables) as t from public.games g
    where g.store_id = s.store_id and g.status <> 'ended'
  ) x where t = any (p_tables);
  if v_busy is not null then
    raise exception 'TABLE %은(는) 다른 게임에서 사용 중입니다.', array_to_string(v_busy, ', ');
  end if;
  if p_start is not null and p_start < now() - interval '1 minute' then raise exception '시작 시간이 이미 지났습니다.'; end if;
  insert into public.games (store_id, name, game_set_name, snapshot, started_at, tables, notice)
  values (s.store_id, trim(p_name), gs.name,
          gs.data || jsonb_build_object('id', gs.id, 'name', gs.name),
          coalesce(p_start, now()), p_tables, nullif(trim(coalesce(p_notice, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.pause_game(p_game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  s := public._require_staff();
  update public.games set status = 'paused', paused_at = now()
   where id = p_game and store_id = s.store_id and status = 'running';
end $$;

create or replace function public.resume_game(p_game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  s := public._require_staff();
  update public.games set
    status = 'running',
    paused_total_ms = paused_total_ms + (extract(epoch from (now() - paused_at)) * 1000)::bigint,
    paused_at = null
   where id = p_game and store_id = s.store_id and status = 'paused' and paused_at is not null;
end $$;

-- 레벨 수동 이동: 시작 시각을 되돌려 계산 (클라이언트 adjustToLevel과 동일)
create or replace function public.adjust_level(p_game uuid, p_level int) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; g public.games; v_target bigint; v_ref timestamptz;
begin
  s := public._require_staff();
  select * into g from public.games where id = p_game and store_id = s.store_id for update;
  if g.id is null then raise exception '게임을 찾을 수 없습니다.'; end if;
  v_target := public._level_start_ms(g.snapshot->'levels', greatest(0, p_level));
  v_ref := case when g.status = 'paused' and g.paused_at is not null then g.paused_at else now() end;
  update public.games set started_at = v_ref - ((g.paused_total_ms + v_target) * interval '1 millisecond')
   where id = g.id;
end $$;

create or replace function public.adjust_chips(p_game uuid, p_kind text, p_chips bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; g public.games; v_total bigint;
begin
  s := public._require_staff();
  select * into g from public.games where id = p_game and store_id = s.store_id for update;
  if g.id is null or g.status = 'ended' then raise exception '진행 중인 게임이 아닙니다.'; end if;
  if p_kind = 'addon' then
    if coalesce(p_chips, 0) <= 0 then raise exception '애드온 칩은 1 이상이어야 합니다.'; end if;
    update public.games set addon_chips = addon_chips + p_chips, addon_count = addon_count + 1 where id = g.id;
  elsif p_kind = 'correction' then
    select coalesce(sum(chips + coalesce(early_bird_chips, 0)), 0) into v_total from public.buyin_events where game_id = g.id;
    v_total := v_total + g.chip_correction + g.addon_chips;
    if v_total + p_chips < 0 then raise exception '보정 후 전체 칩이 음수가 될 수 없습니다.'; end if;
    update public.games set chip_correction = chip_correction + p_chips, correction_count = correction_count + 1 where id = g.id;
  else
    raise exception '알 수 없는 보정 종류입니다.';
  end if;
end $$;

create or replace function public.eliminate_entry(p_game uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; g public.games; v_playing int;
begin
  s := public._require_staff();
  select * into g from public.games where id = p_game and store_id = s.store_id for update;
  if g.id is null then raise exception '게임을 찾을 수 없습니다.'; end if;
  select count(*) into v_playing from public.game_entries where game_id = g.id and status = 'playing';
  update public.game_entries set status = 'eliminated', rank = v_playing, out_at = now()
   where game_id = g.id and member_id = p_member and status = 'playing';
end $$;

-- 바인 코어: 직원 등록·셀프 바인·데모 시드가 공용
create or replace function public._buyin(
  p_game uuid, p_member uuid, p_type text, p_currency text, p_operator text, p_request text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g public.games; m public.members; e public.game_entries;
  v_type text; v_round int; v_rule jsonb; v_cost bigint; v_chips bigint; v_eb bigint;
  v_idx int; v_ledger uuid; v_table int; v_seat int; v_seats int; v_label text; v_prev jsonb;
begin
  -- 멱등: 같은 요청이 이미 처리됐으면 그 결과를 돌려줌
  if p_request is not null then
    select jsonb_build_object('type', b.type, 'round', b.round, 'table', ge.table_no, 'seat', ge.seat,
                              'chips', b.chips, 'earlyBirdChips', b.early_bird_chips, 'cost', b.cost, 'currency', b.currency)
      into v_prev
      from public.ledger l join public.buyin_events b on b.ledger_id = l.id
      join public.game_entries ge on ge.game_id = b.game_id and ge.member_id = b.member_id
     where l.request_id = p_request;
    if v_prev is not null then return v_prev; end if;
  end if;

  select * into m from public.members where id = p_member for update;
  if m.id is null then raise exception '회원을 찾을 수 없습니다.'; end if;
  if m.status <> 'active' then raise exception '탈퇴한 회원입니다.'; end if;

  select * into g from public.games where id = p_game and store_id = m.store_id for update;
  if g.id is null then raise exception '게임을 찾을 수 없습니다.'; end if;
  if g.status = 'ended' then raise exception '종료된 게임입니다.'; end if;
  if public._reg_closed(g) then raise exception '레지스트레이션이 마감된 게임입니다.'; end if;

  select * into e from public.game_entries where game_id = g.id and member_id = m.id;
  v_type := p_type;
  if v_type is null then
    v_type := case when e.member_id is null then 'BUYIN' when e.status = 'playing' then 'RE_BUYIN' else 'RE_ENTRY' end;
  end if;
  if v_type = 'BUYIN' and e.member_id is not null then raise exception '이미 참가한 회원입니다. 리바인 또는 리엔트리를 사용하세요.'; end if;
  if v_type = 'RE_BUYIN' and (e.member_id is null or e.status <> 'playing') then raise exception '참여 중인 회원만 리바인할 수 있습니다.'; end if;
  if v_type = 'RE_ENTRY' and (e.member_id is null or e.status <> 'eliminated') then raise exception '탈락한 회원만 리엔트리할 수 있습니다.'; end if;
  if v_type not in ('BUYIN', 'RE_BUYIN', 'RE_ENTRY') then raise exception '알 수 없는 바인 유형입니다.'; end if;

  v_label := case v_type when 'BUYIN' then '바인' when 'RE_BUYIN' then '리바인' else '리엔트리' end;
  if v_type = 'BUYIN' then v_round := 1;
  else select count(*) + 1 into v_round from public.buyin_events where game_id = g.id and member_id = m.id and type = v_type;
  end if;

  select value into v_rule from jsonb_array_elements(g.snapshot->'buyinRules')
   where value->>'type' = v_type and (value->>'round')::int = v_round limit 1;
  if v_rule is null then raise exception '%회차 % 규칙이 없습니다 (한도 초과).', v_round, v_label; end if;
  if v_rule->'cost'->>p_currency is null then raise exception '이 게임에서 사용할 수 없는 재화입니다.'; end if;
  v_cost := (v_rule->'cost'->>p_currency)::bigint;
  v_chips := (v_rule->>'chips')::bigint;

  -- 참가비 결제 (회원 → 지점)
  v_ledger := public._move(m.store_id, m.id::text, 'store', p_currency, v_cost, g.name || ' ' || v_label, p_operator, g.id, p_request);

  -- 얼리버드: 현재 레벨 기준, 리바인 제외
  if v_type <> 'RE_BUYIN' then
    v_idx := public._level_idx(g.snapshot->'levels', public._game_elapsed_ms(g));
    select (value->>'chips')::bigint into v_eb from jsonb_array_elements(coalesce(g.snapshot->'earlyBird', '[]'::jsonb))
     where (value->>'levelIndex')::int = v_idx limit 1;
  end if;

  -- 좌석 배정: ① 좌석 QR로 체크인한 자리가 이 게임 테이블이고 비어 있으면 그대로 ② 아니면 인원 최소 테이블 → 빈 좌석 최소 번호
  if v_type in ('BUYIN', 'RE_ENTRY') then
    select w.table_no, w.seat into v_table, v_seat
      from public.waitlist w
     where w.store_id = g.store_id and w.member_id = m.id and w.status = 'seated'
       and w.table_no = any (g.tables) and w.seat is not null
       and not exists (select 1 from public.game_entries ge where ge.game_id = g.id and ge.table_no = w.table_no and ge.seat = w.seat and ge.status = 'playing')
     order by w.seated_at desc nulls last limit 1;
    if v_table is null then
      select t.tno into v_table
        from unnest(g.tables) as t(tno)
        left join public.game_entries ge on ge.game_id = g.id and ge.table_no = t.tno and ge.status = 'playing'
       group by t.tno order by count(ge.member_id) asc, t.tno asc limit 1;
      if v_table is null then raise exception '이 게임에 배정된 테이블이 없습니다.'; end if;
      select coalesce((tb.value->>'seats')::int, 9) into v_seats
        from public.stores st, jsonb_array_elements(st.tables) tb
       where st.id = g.store_id and (tb.value->>'no')::int = v_table limit 1;
      v_seats := coalesce(v_seats, 9);
      select min(sn) into v_seat from generate_series(1, v_seats + 1) sn
       where sn not in (select seat from public.game_entries where game_id = g.id and table_no = v_table and status = 'playing');
      v_seat := coalesce(v_seat, v_seats + 1);
    end if;
    -- 대기 중이던 손님은 게임 착석으로 전환
    update public.waitlist set status = 'seated', seated_at = coalesce(seated_at, now()), table_no = v_table, seat = v_seat
     where store_id = g.store_id and member_id = m.id and status in ('waiting', 'called');
    if v_type = 'BUYIN' then
      insert into public.game_entries (game_id, member_id, table_no, seat, status) values (g.id, m.id, v_table, v_seat, 'playing');
    else
      update public.game_entries set table_no = v_table, seat = v_seat, status = 'playing', rank = null, out_at = null
       where game_id = g.id and member_id = m.id;
    end if;
  else
    v_table := e.table_no; v_seat := e.seat;
  end if;

  insert into public.buyin_events (game_id, member_id, type, round, currency, cost, chips, early_bird_chips, ledger_id)
  values (g.id, m.id, v_type, v_round, p_currency, v_cost, v_chips, v_eb, v_ledger);

  return jsonb_build_object('type', v_type, 'round', v_round, 'table', v_table, 'seat', v_seat,
                            'chips', v_chips, 'earlyBirdChips', v_eb, 'cost', v_cost, 'currency', p_currency,
                            'gameName', g.name);
end $$;

-- 참가 등록: 직원(회원 지정) 또는 회원 본인(셀프 바인 — 전광판 QR)
create or replace function public.game_buyin(
  p_game uuid, p_member uuid default null, p_type text default null,
  p_currency text default 'P', p_request text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.staff; v_member uuid; v_operator text;
begin
  select * into s from public.staff where user_id = auth.uid();
  -- 개발자가 매장을 보는 중이면 직원(대표) 경로로 (가상 직원 레코드)
  if s.id is null and exists (select 1 from public.platform_admin_scope where user_id = auth.uid()) then
    s := public._require_staff();
  end if;
  if s.id is not null then
    if p_member is null then raise exception '회원을 선택해주세요.'; end if;
    v_member := p_member; v_operator := s.name;
  else
    v_member := public.my_member_id();
    if v_member is null then raise exception '로그인이 필요합니다.'; end if;
    if p_member is not null and p_member <> v_member then raise exception '본인만 바인할 수 있습니다.'; end if;
    v_operator := '셀프 바인';
  end if;
  return public._buyin(p_game, v_member, p_type, coalesce(p_currency, 'P'), v_operator, p_request);
end $$;

-- 게임 종료: 남은 참가자 순위 확정 → 프라이즈·RP 지급
create or replace function public.end_game(p_game uuid, p_ranking uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; g public.games; r record; i int; v_prize jsonb; v_rp bigint; v_now timestamptz := now();
begin
  s := public._require_staff();
  select * into g from public.games where id = p_game and store_id = s.store_id for update;
  if g.id is null or g.status = 'ended' then return; end if;

  if p_ranking is not null and array_length(p_ranking, 1) > 0 then
    for i in 1 .. array_length(p_ranking, 1) loop
      update public.game_entries set status = 'eliminated', rank = i, out_at = v_now
       where game_id = g.id and member_id = p_ranking[i] and status = 'playing';
    end loop;
  else
    i := 0;
    for r in select member_id from public.game_entries where game_id = g.id and status = 'playing' order by table_no, seat loop
      i := i + 1;
      update public.game_entries set status = 'eliminated', rank = i, out_at = v_now where game_id = g.id and member_id = r.member_id;
    end loop;
  end if;

  update public.games set status = 'ended', ended_at = v_now where id = g.id;

  for r in select member_id, rank from public.game_entries where game_id = g.id and rank is not null loop
    select value into v_prize from jsonb_array_elements(coalesce(g.snapshot->'prizes', '[]'::jsonb))
     where (value->>'rank')::int = r.rank limit 1;
    if v_prize is not null and coalesce((v_prize->>'amount')::bigint, 0) > 0 then
      begin
        perform public._move(g.store_id, 'store', r.member_id::text, v_prize->>'currency', (v_prize->>'amount')::bigint,
                             g.name || ' ' || r.rank || '위 프라이즈', s.name, g.id, null);
      exception when others then
        raise warning '프라이즈 지급 실패(%위): %', r.rank, sqlerrm;   -- 지점 잔액 부족 등: 게임 종료는 진행
      end;
    end if;
    v_rp := (g.snapshot->'rpByRank'->>(r.rank - 1))::bigint;
    if coalesce(v_rp, 0) > 0 then update public.members set rp = rp + v_rp where id = r.member_id; end if;
  end loop;
end $$;

-- 게임 취소(무효화): 참가비 환불 · 지급된 프라이즈/RP 역거래 · 기록은 '취소됨'으로 보존
create or replace function public.cancel_game(p_game uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; g public.games; b record; r record; v_prize jsonb; v_rp bigint;
begin
  s := public._require_staff(); -- 대표·매니저·딜러 모두 허용 (직원 관리·초기화만 대표 전용)
  select * into g from public.games where id = p_game and store_id = s.store_id for update;
  if g.id is null or g.cancelled then return; end if;

  for b in select member_id, currency, cost from public.buyin_events where game_id = g.id loop
    begin
      perform public._move(g.store_id, 'store', b.member_id::text, b.currency, b.cost, g.name || ' 취소 — 참가비 환불', s.name, g.id, null);
    exception when others then raise warning '환불 실패: %', sqlerrm; end;
  end loop;

  if g.status = 'ended' then
    for r in select member_id, rank from public.game_entries where game_id = g.id and rank is not null loop
      select value into v_prize from jsonb_array_elements(coalesce(g.snapshot->'prizes', '[]'::jsonb))
       where (value->>'rank')::int = r.rank limit 1;
      if v_prize is not null and coalesce((v_prize->>'amount')::bigint, 0) > 0 then
        begin
          perform public._move(g.store_id, r.member_id::text, 'store', v_prize->>'currency', (v_prize->>'amount')::bigint,
                               g.name || ' 취소 — 프라이즈 회수', s.name, g.id, null);
        exception when others then raise warning '프라이즈 회수 실패: %', sqlerrm; end;
      end if;
      v_rp := (g.snapshot->'rpByRank'->>(r.rank - 1))::bigint;
      if coalesce(v_rp, 0) > 0 then
        update public.members set rp = greatest(0, rp - v_rp) where id = r.member_id;
      end if;
    end loop;
  end if;

  update public.games set status = 'ended', ended_at = coalesce(ended_at, now()), cancelled = true where id = g.id;
end $$;

-- ── 시즌 ────────────────────────────────────────────────────────────────
create or replace function public.start_season(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.staff; v_id uuid;
begin
  s := public._require_staff();
  if exists (select 1 from public.seasons where store_id = s.store_id and status in ('open', 'closed')) then
    raise exception '진행 중이거나 정산 대기 중인 시즌이 있습니다.';
  end if;
  insert into public.seasons (store_id, name) values (s.store_id, coalesce(nullif(trim(p_name), ''), '새 시즌')) returning id into v_id;
  return v_id;
end $$;

-- 시즌 마감: 현재 RP 순위를 스냅샷으로 고정
create or replace function public.close_season() returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; v_id uuid; v_results jsonb;
begin
  s := public._require_staff();
  select id into v_id from public.seasons where store_id = s.store_id and status = 'open' limit 1;
  if v_id is null then raise exception '진행 중인 시즌이 없습니다.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'memberId', x.id, 'nickname', x.nickname, 'emoji', x.emoji, 'color', x.color, 'rp', x.rp, 'rank', x.rk)
           order by x.rk), '[]'::jsonb)
    into v_results
    from (select m.*, row_number() over (order by m.rp desc, m.joined_at) as rk
            from public.members m where m.store_id = s.store_id and m.status = 'active' and m.rp > 0) x;
  update public.seasons set status = 'closed', closed_at = now(), results = v_results where id = v_id;
end $$;

-- 시즌 정산: 마감된 시즌 결과에 순위별 보상(P) 지급 + 전 회원 RP 리셋 (전부 성공하거나 전부 취소)
-- p_rewards: [{"rank":1,"amount":100000}, ...]
create or replace function public.settle_season(p_rewards jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; sn public.seasons; r jsonb; v_amt bigint; v_results jsonb := '[]'::jsonb;
begin
  s := public._require_staff();
  select * into sn from public.seasons where store_id = s.store_id and status = 'closed' limit 1;
  if sn.id is null then raise exception '마감된 시즌이 없습니다. 먼저 시즌을 마감하세요.'; end if;
  for r in select value from jsonb_array_elements(coalesce(sn.results, '[]'::jsonb)) loop
    select (value->>'amount')::bigint into v_amt from jsonb_array_elements(coalesce(p_rewards, '[]'::jsonb))
     where (value->>'rank')::int = (r->>'rank')::int limit 1;
    v_amt := coalesce(v_amt, 0);
    if v_amt > 0 then
      perform public._move(s.store_id, 'store', r->>'memberId', 'P', v_amt,
                           sn.name || ' ' || (r->>'rank') || '위 시즌 보상', s.name, null, null);
    end if;
    v_results := v_results || (r || jsonb_build_object('paid', v_amt));
  end loop;
  update public.seasons set status = 'settled', results = v_results where id = sn.id;
  update public.members set rp = 0 where store_id = s.store_id;
end $$;

-- ---------------------------------------------------------------------
-- 8. RPC — 온보딩·계정
-- ---------------------------------------------------------------------
create or replace function public._default_game_set() returns jsonb
language sql immutable as $$
  select $j${
    "levels": [
      {"type":"level","label":"Level 1","durationMin":7,"sb":100,"bb":200,"ante":0},
      {"type":"level","label":"Level 2","durationMin":7,"sb":200,"bb":400,"ante":0},
      {"type":"level","label":"Level 3","durationMin":7,"sb":300,"bb":600,"ante":0},
      {"type":"level","label":"Level 4","durationMin":7,"sb":400,"bb":800,"ante":0},
      {"type":"level","label":"Level 5","durationMin":7,"sb":500,"bb":1000,"ante":0},
      {"type":"break","label":"BREAK 1","durationMin":10,"sb":0,"bb":0,"ante":0,"colorUp":500},
      {"type":"level","label":"Level 6","durationMin":7,"sb":1000,"bb":2000,"ante":2000},
      {"type":"level","label":"Level 7","durationMin":7,"sb":2000,"bb":4000,"ante":4000},
      {"type":"level","label":"Level 8","durationMin":7,"sb":3000,"bb":6000,"ante":6000},
      {"type":"level","label":"Level 9","durationMin":0,"sb":5000,"bb":10000,"ante":10000}
    ],
    "regCloseLevelIndex": 5,
    "buyinRules": [
      {"type":"BUYIN","round":1,"cost":{"P":1,"S":1,"V":1},"chips":20000},
      {"type":"RE_BUYIN","round":1,"cost":{"P":1,"S":1,"V":1},"chips":40000},
      {"type":"RE_BUYIN","round":2,"cost":{"P":1,"S":1,"V":1},"chips":40000},
      {"type":"RE_ENTRY","round":1,"cost":{"P":1,"S":1,"V":1},"chips":20000}
    ],
    "earlyBird": [{"levelIndex":0,"chips":10000},{"levelIndex":1,"chips":5000}],
    "prizes": [{"rank":1,"currency":"P","amount":10},{"rank":2,"currency":"P","amount":5},{"rank":3,"currency":"P","amount":2}],
    "rpByRank": [1000,700,500,300,200,100]
  }$j$::jsonb
$$;

-- 첫 직원이 매장을 개설 (매장이 하나도 없을 때만). 개설자는 owner.
create or replace function public.bootstrap_store(p_store_name text, p_owner_name text default '대표') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_store uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if exists (select 1 from public.stores) then
    raise exception '이미 개설된 매장이 있습니다. 대표에게 직원 초대를 요청하세요.';
  end if;
  select email into v_email from auth.users where id = v_uid;
  insert into public.stores (name) values (coalesce(nullif(trim(p_store_name), ''), '내 매장')) returning id into v_store;
  insert into public.staff (store_id, user_id, email, name, role)
  values (v_store, v_uid, coalesce(v_email, ''), coalesce(nullif(trim(p_owner_name), ''), '대표'), 'owner');
  insert into public.game_sets (store_id, name, data) values (v_store, '데일리 스탠다드', public._default_game_set());
  perform public._ensure_store_defaults(v_store);
  return v_store;
end $$;

-- 가입 후 초대된 직원 행을 연결 (가입이 초대보다 먼저였던 경우)
create or replace function public.claim_staff() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; v_id uuid;
begin
  if v_uid is null then return false; end if;
  if exists (select 1 from public.staff where user_id = v_uid) then return true; end if;
  select email into v_email from auth.users where id = v_uid;
  select id into v_id from public.staff where user_id is null and lower(email) = lower(coalesce(v_email, '')) limit 1;
  if v_id is null then return false; end if;
  update public.staff set user_id = v_uid where id = v_id;
  return true;
end $$;

-- 로그인 계정의 역할 조회 (앱 부팅 시 1회)
create or replace function public.my_role() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s public.staff; m public.members; v_scope uuid;
begin
  if v_uid is null then return jsonb_build_object('kind', 'none'); end if;
  select * into s from public.staff where user_id = v_uid;
  if s.id is not null then
    return jsonb_build_object('kind', 'staff', 'staffId', s.id, 'storeId', s.store_id, 'name', s.name, 'role', s.role, 'email', s.email);
  end if;
  -- 개발자가 매장을 선택해 둔 경우: 그 매장의 대표로 판정 (클라이언트는 devScope로 배너 표시)
  select store_id into v_scope from public.platform_admin_scope where user_id = v_uid;
  if v_scope is not null then
    return jsonb_build_object('kind', 'staff', 'staffId', '', 'storeId', v_scope, 'name', '개발자', 'role', 'owner',
      'email', coalesce((select email from public.platform_admins where user_id = v_uid), ''), 'devScope', true);
  end if;
  select * into m from public.members where user_id = v_uid;
  if m.id is not null then
    return jsonb_build_object('kind', 'member', 'memberId', m.id, 'storeId', m.store_id, 'nickname', m.nickname, 'no', m.no);
  end if;
  return jsonb_build_object('kind', 'none');
end $$;

-- 데이터 초기화 (owner): 'empty' = 구조만 남김, 'demo' = 데모 데이터 시드
create or replace function public.reset_store(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; v_store uuid; gs public.game_sets; m record; g1 uuid; g2 uuid;
begin
  s := public._require_staff(array['owner']);
  v_store := s.store_id;
  perform set_config('allinone.reset', 'on', true);
  delete from public.buyin_events where game_id in (select id from public.games where store_id = v_store);
  delete from public.game_entries where game_id in (select id from public.games where store_id = v_store);
  delete from public.games where store_id = v_store;
  delete from public.ledger where store_id = v_store;
  delete from public.waitlist where store_id = v_store;
  delete from public.passes where store_id = v_store;
  delete from public.pass_log where store_id = v_store;
  delete from public.rp_log where store_id = v_store;
  delete from public.seasons where store_id = v_store;
  delete from public.wallets where store_id = v_store and owner <> 'store';
  delete from public.members where store_id = v_store;
  update public.wallets set balance = 0 where store_id = v_store and owner = 'store';
  delete from public.events where store_id = v_store;
  update public.stores set biz_reset_at = now() where id = v_store;
  update public.console_state set state = '{}'::jsonb, updated_at = now() where store_id = v_store;
  perform public._ensure_store_defaults(v_store);
  perform set_config('allinone.reset', 'off', true);
  insert into public.audit_log (store_id, actor_id, actor, action, target_type, target_id, detail)
  values (v_store, s.user_id, s.name, 'store.reset', 'store', v_store::text, jsonb_build_object('mode', p_mode));
  if p_mode <> 'demo' then return; end if;

  select * into gs from public.game_sets where store_id = v_store order by created_at limit 1;
  if gs.id is null then
    insert into public.game_sets (store_id, name, data) values (v_store, '데일리 스탠다드', public._default_game_set()) returning * into gs;
  end if;

  insert into public.members (store_id, no, nickname, emoji, color, rp, joined_at) values
    (v_store, '0001', '에이스', '😎', '#E9BB56', 400000, now() - interval '90 days'),
    (v_store, '0002', '리버킹', '🦈', '#57B6F2', 200000, now() - interval '75 days'),
    (v_store, '0003', '블러프', '🎭', '#A98BF5', 60000, now() - interval '60 days'),
    (v_store, '0004', '칩리더', '🐯', '#F2A65A', 60000, now() - interval '45 days'),
    (v_store, '0005', '포카리', '🐳', '#4FD1C5', 20000, now() - interval '20 days'),
    (v_store, '0006', '올인맨', '🔥', '#F26D76', 10000, now() - interval '7 days');

  perform public._move(v_store, 'hq', 'store', 'P', 100000000, '초기 포인트 발행', s.name, null, null);
  perform public._move(v_store, 'hq', 'store', 'S', 100000000, '초기 시드 발행', s.name, null, null);
  perform public._move(v_store, 'hq', 'store', 'V', 1000, '음료권 발행', s.name, null, null);
  for m in select id from public.members where store_id = v_store loop
    perform public._move(v_store, 'store', m.id::text, 'P', 1000000, '데모 지급', s.name, null, null);
    perform public._move(v_store, 'store', m.id::text, 'S', 1000000, '데모 지급', s.name, null, null);
    perform public._move(v_store, 'store', m.id::text, 'V', 10, '데모 지급', s.name, null, null);
  end loop;

  insert into public.games (store_id, name, game_set_name, snapshot, status, started_at, tables)
  values (v_store, '데일리 게임', gs.name, gs.data || jsonb_build_object('id', gs.id, 'name', gs.name), 'running', now() - interval '5 minutes', array[1, 2, 3])
  returning id into g1;
  for m in select id from public.members where store_id = v_store and no in ('0001', '0002', '0004') order by no loop
    perform public._buyin(g1, m.id, 'BUYIN', 'P', s.name, null);
  end loop;

  insert into public.games (store_id, name, game_set_name, snapshot, status, started_at, ended_at, tables)
  values (v_store, '베이직', gs.name, gs.data || jsonb_build_object('id', gs.id, 'name', gs.name), 'ended',
          now() - interval '8 days', now() - interval '8 days' + interval '4 hours', array[1])
  returning id into g2;
  insert into public.game_entries (game_id, member_id, table_no, seat, status, rank, out_at)
  select g2, id, 1, row_number() over (order by no), 'eliminated', row_number() over (order by no), now() - interval '8 days' + interval '4 hours'
    from public.members where store_id = v_store and no in ('0001', '0003', '0005');

  insert into public.events (store_id, title, body, created_at)
  values (v_store, '안녕하세요, 올인원입니다. 업데이트 노트입니다.', '전광판의 QR을 스캔하면 포인트로 바로 바인할 수 있습니다.', now() - interval '20 days');
end $$;

-- ---------------------------------------------------------------------
-- 8b. RPC — 이용권 (구매형 참가권, F-37)
-- ---------------------------------------------------------------------
alter table public.pass_types add column if not exists archived boolean not null default false;

create or replace function public.issue_passes(p_type uuid, p_member uuid, p_count int) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; t public.pass_types; m public.members;
begin
  s := public._require_staff();
  select * into t from public.pass_types where id = p_type and store_id = s.store_id and not archived;
  select * into m from public.members where id = p_member and store_id = s.store_id and status = 'active';
  if t.id is null or m.id is null then raise exception '유형 또는 회원을 찾을 수 없습니다.'; end if;
  if coalesce(p_count, 0) < 1 or p_count > 100 then raise exception '발급 수량은 1~100 사이여야 합니다.'; end if;
  insert into public.passes (store_id, type_id, member_id, expires_at)
  select s.store_id, t.id, m.id, now() + t.valid_days * interval '1 day' from generate_series(1, p_count);
  insert into public.pass_log (store_id, action, type_name, member_id, detail, operator)
  values (s.store_id, '발급', t.name, m.id, t.name || ' × ' || p_count, s.name);
end $$;

create or replace function public.use_pass(p_pass uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; p public.passes; t public.pass_types;
begin
  s := public._require_staff();
  select * into p from public.passes where id = p_pass and store_id = s.store_id for update;
  if p.id is null then raise exception '이용권을 찾을 수 없습니다.'; end if;
  if p.status <> 'unused' then raise exception '이미 사용되었거나 회수된 이용권입니다.'; end if;
  if now() > p.expires_at then raise exception '만료된 이용권입니다. 연장 후 사용 처리하세요.'; end if;
  select * into t from public.pass_types where id = p.type_id;
  update public.passes set status = 'used', used_at = now() where id = p.id;
  insert into public.pass_log (store_id, action, type_name, member_id, detail, operator)
  values (s.store_id, '사용', t.name, p.member_id, '이용권 사용 처리', s.name);
end $$;

create or replace function public.extend_pass(p_pass uuid, p_days int) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; p public.passes; t public.pass_types;
begin
  s := public._require_staff();
  select * into p from public.passes where id = p_pass and store_id = s.store_id for update;
  if p.id is null then raise exception '이용권을 찾을 수 없습니다.'; end if;
  if p.status <> 'unused' then raise exception '미사용 상태의 이용권만 연장할 수 있습니다.'; end if;
  if coalesce(p_days, 0) < 1 or p_days > 365 then raise exception '연장 일수는 1~365 사이여야 합니다.'; end if;
  select * into t from public.pass_types where id = p.type_id;
  update public.passes set expires_at = greatest(now(), expires_at) + p_days * interval '1 day' where id = p.id;
  insert into public.pass_log (store_id, action, type_name, member_id, detail, operator)
  values (s.store_id, '연장', t.name, p.member_id, '+' || p_days || '일', s.name);
end $$;

create or replace function public.revoke_pass(p_pass uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; p public.passes; t public.pass_types;
begin
  s := public._require_staff();
  select * into p from public.passes where id = p_pass and store_id = s.store_id for update;
  if p.id is null then raise exception '이용권을 찾을 수 없습니다.'; end if;
  if p.status <> 'unused' then raise exception '미사용 상태의 이용권만 회수할 수 있습니다.'; end if;
  select * into t from public.pass_types where id = p.type_id;
  update public.passes set status = 'revoked' where id = p.id;
  insert into public.pass_log (store_id, action, type_name, member_id, detail, operator)
  values (s.store_id, '회수', t.name, p.member_id, null, s.name);
end $$;

-- 유형 삭제: 미사용권이 남아 있으면 거부, 사용 이력이 있으면 보관(archived), 없으면 삭제
create or replace function public.remove_pass_type(p_type uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  s := public._require_staff();
  if not exists (select 1 from public.pass_types where id = p_type and store_id = s.store_id) then raise exception '유형을 찾을 수 없습니다.'; end if;
  if exists (select 1 from public.passes where type_id = p_type and status = 'unused' and now() <= expires_at) then
    raise exception '미사용 이용권이 남아 있는 유형은 삭제할 수 없습니다.';
  end if;
  if exists (select 1 from public.passes where type_id = p_type) then
    update public.pass_types set archived = true where id = p_type;
  else
    delete from public.pass_types where id = p_type;
  end if;
end $$;

-- 영업일 집계 초기화 (새벽 영업 대응 수동 마감, F-30 연계)
create or replace function public.reset_biz_day() returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff;
begin
  s := public._require_staff();
  update public.stores set biz_reset_at = now() where id = s.store_id;
  insert into public.pass_log (store_id, action, operator) values (s.store_id, '집계 초기화', s.name);
end $$;

-- ---------------------------------------------------------------------
-- 8c. RPC — 대기자 명단 · 좌석 QR 체크인 (F-26)
-- ---------------------------------------------------------------------
create or replace function public._seat_count(p_store uuid, p_table int) returns int
language sql stable as $$
  select coalesce((select (tb.value->>'seats')::int from public.stores st, jsonb_array_elements(st.tables) tb
                    where st.id = p_store and (tb.value->>'no')::int = p_table limit 1), 0)
$$;

-- 손님 셀프 체크인. 좌석 QR(p_table·p_seat)이면 그 자리에 착석, 없으면 대기 등록.
create or replace function public.checkin_self(p_table int default null, p_seat int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m public.members; w public.waitlist; v_seats int; v_pos int;
begin
  select * into m from public.members where user_id = auth.uid() and status = 'active';
  if m.id is null then raise exception '회원 계정으로 로그인해야 합니다.'; end if;
  if p_table is not null then
    v_seats := public._seat_count(m.store_id, p_table);
    if v_seats = 0 then raise exception '존재하지 않는 테이블입니다. (TABLE %)', p_table; end if;
    if p_seat is null or p_seat < 1 or p_seat > v_seats then raise exception '좌석 번호가 올바르지 않습니다.'; end if;
    if exists (select 1 from public.waitlist x where x.store_id = m.store_id and x.status = 'seated'
                 and x.table_no = p_table and x.seat = p_seat and x.member_id <> m.id) then
      raise exception '이미 다른 손님이 체크인한 좌석입니다. 직원에게 문의해주세요.';
    end if;
  end if;
  select * into w from public.waitlist where store_id = m.store_id and member_id = m.id
   and status in ('waiting', 'called', 'seated') order by arrived_at desc limit 1 for update;
  if w.id is null then
    insert into public.waitlist (store_id, member_id, status, source, table_no, seat, seated_at)
    values (m.store_id, m.id, case when p_table is null then 'waiting' else 'seated' end, 'qr', p_table, p_seat,
            case when p_table is null then null else now() end)
    returning * into w;
  elsif p_table is not null then
    update public.waitlist set status = 'seated', table_no = p_table, seat = p_seat, seated_at = now()
     where id = w.id returning * into w;
  end if;
  select count(*) into v_pos from public.waitlist x
   where x.store_id = m.store_id and x.status in ('waiting', 'called') and x.arrived_at <= w.arrived_at;
  return jsonb_build_object('id', w.id, 'status', w.status, 'table', w.table_no, 'seat', w.seat,
                            'position', case when w.status in ('waiting', 'called') then v_pos else null end);
end $$;

create or replace function public.checkout_self() returns void
language plpgsql security definer set search_path = public as $$
declare v_member uuid := public.my_member_id();
begin
  if v_member is null then raise exception '회원 계정으로 로그인해야 합니다.'; end if;
  update public.waitlist set status = 'left', ended_at = now()
   where member_id = v_member and status in ('waiting', 'called', 'seated');
end $$;

-- 직원: 대기 추가 (회원 또는 비회원 이름)
create or replace function public.waitlist_add(p_member uuid default null, p_guest_name text default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s public.staff; v_id uuid;
begin
  s := public._require_staff();
  if p_member is null and coalesce(trim(p_guest_name), '') = '' then raise exception '회원을 선택하거나 이름을 입력해주세요.'; end if;
  if p_member is not null then
    if not exists (select 1 from public.members where id = p_member and store_id = s.store_id and status = 'active') then
      raise exception '회원을 찾을 수 없습니다.';
    end if;
    if exists (select 1 from public.waitlist where store_id = s.store_id and member_id = p_member and status in ('waiting', 'called', 'seated')) then
      raise exception '이미 대기 명단(또는 착석 중)에 있는 회원입니다.';
    end if;
  end if;
  insert into public.waitlist (store_id, member_id, guest_name, status, source, note)
  values (s.store_id, p_member, nullif(trim(coalesce(p_guest_name, '')), ''), 'waiting', 'staff', nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- 직원: 상태 변경 (호출·착석·노쇼·취소·퇴장)
create or replace function public.waitlist_update(p_id uuid, p_status text, p_table int default null, p_seat int default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.staff; w public.waitlist;
begin
  s := public._require_staff();
  select * into w from public.waitlist where id = p_id and store_id = s.store_id for update;
  if w.id is null then raise exception '대기 항목을 찾을 수 없습니다.'; end if;
  if p_status not in ('waiting', 'called', 'seated', 'noshow', 'cancelled', 'left') then raise exception '알 수 없는 상태입니다.'; end if;
  if p_status = 'seated' and p_table is not null and public._seat_count(s.store_id, p_table) = 0 then
    raise exception '존재하지 않는 테이블입니다.';
  end if;
  update public.waitlist set
    status = p_status,
    called_at = case when p_status = 'called' then now() else called_at end,
    seated_at = case when p_status = 'seated' then now() else seated_at end,
    ended_at = case when p_status in ('noshow', 'cancelled', 'left') then now() else null end,
    table_no = case when p_status = 'seated' then coalesce(p_table, table_no) else table_no end,
    seat = case when p_status = 'seated' then coalesce(p_seat, seat) else seat end
  where id = w.id;
end $$;

-- ---------------------------------------------------------------------
-- 8d. 감사 로그 트리거 — 직원의 설정·회원·게임·직원 변경 (재화 이동은 ledger가 원본)
-- ---------------------------------------------------------------------
create or replace function public._audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_store uuid; v_actor text; v_actor_id uuid := auth.uid(); v_detail jsonb; v_target text;
begin
  if current_setting('allinone.reset', true) = 'on' then return coalesce(new, old); end if;
  v_store := case when tg_table_name = 'stores' then coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid)
                  else coalesce((v_new->>'store_id')::uuid, (v_old->>'store_id')::uuid) end;
  if v_store is null then return coalesce(new, old); end if;
  select name into v_actor from public.staff where user_id = v_actor_id;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k.key,
             case when k.key in ('snapshot', 'data', 'tables', 'results') then jsonb_build_array(null, '(변경)')
                  else jsonb_build_array(v_old->k.key, v_new->k.key) end), '{}'::jsonb)
      into v_detail
      from jsonb_object_keys(v_new) as k(key)
     where v_old->k.key is distinct from v_new->k.key and k.key not in ('updated_at', 'paused_at', 'paused_total_ms', 'started_at');
    if v_detail = '{}'::jsonb then return new; end if;
  elsif tg_op = 'INSERT' then
    v_detail := v_new - 'snapshot' - 'data' - 'results';
  else
    v_detail := v_old - 'snapshot' - 'data' - 'results';
  end if;
  v_target := coalesce(v_new->>'id', v_old->>'id');
  insert into public.audit_log (store_id, actor_id, actor, action, target_type, target_id, detail)
  values (v_store, v_actor_id,
          coalesce(v_actor, (select '개발자' from public.platform_admins where user_id = v_actor_id),
                   case when v_actor_id is null then '시스템' else '회원' end),
          tg_table_name || '.' || lower(tg_op), tg_table_name, v_target, v_detail);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['members', 'staff', 'stores', 'game_sets', 'games', 'pass_types', 'passes', 'seasons', 'events', 'waitlist'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public._audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8e. 매장 기본값 · console_state(jsonb) → 테이블 마이그레이션
-- ---------------------------------------------------------------------
create or replace function public._ensure_store_defaults(p_store uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.pass_types where store_id = p_store) then
    insert into public.pass_types (store_id, name, valid_days, color, sort) values
      (p_store, '1,000P', 30, '#57B6F2', 0), (p_store, '10,000P', 30, '#E9BB56', 1), (p_store, '하이롤러', 60, '#A98BF5', 2);
  end if;
  if not exists (select 1 from public.seasons where store_id = p_store and status in ('open', 'closed')) then
    insert into public.seasons (store_id, name)
    values (p_store, '시즌 ' || ((select count(*) from public.seasons where store_id = p_store) + 1));
  end if;
end $$;

do $$
declare cs record; v jsonb; tmap jsonb; new_id uuid; mid uuid;
begin
  for cs in select store_id, state from public.console_state where state <> '{}'::jsonb loop
    perform set_config('allinone.reset', 'on', true);
    tmap := '{}'::jsonb;
    if not exists (select 1 from public.pass_types where store_id = cs.store_id) then
      for v in select value from jsonb_array_elements(coalesce(cs.state->'passTypes', '[]'::jsonb)) loop
        insert into public.pass_types (store_id, name, valid_days, color)
        values (cs.store_id, coalesce(v->>'name', '이용권'), coalesce((v->>'validDays')::int, 30), coalesce(v->>'color', '#57B6F2'))
        returning id into new_id;
        tmap := tmap || jsonb_build_object(coalesce(v->>'id', ''), new_id);
      end loop;
      for v in select value from jsonb_array_elements(coalesce(cs.state->'passes', '[]'::jsonb)) loop
        begin
          mid := (v->>'memberId')::uuid;
          if (tmap->>(v->>'typeId')) is not null and exists (select 1 from public.members where id = mid) then
            insert into public.passes (store_id, type_id, member_id, issued_at, expires_at, status, used_at)
            values (cs.store_id, (tmap->>(v->>'typeId'))::uuid, mid,
                    to_timestamp(((v->>'issuedAt')::bigint) / 1000.0), to_timestamp(((v->>'expiresAt')::bigint) / 1000.0),
                    coalesce(v->>'status', 'unused'),
                    case when v->>'usedAt' is not null then to_timestamp(((v->>'usedAt')::bigint) / 1000.0) end);
          end if;
        exception when others then null;
        end;
      end loop;
    end if;
    if not exists (select 1 from public.seasons where store_id = cs.store_id) then
      for v in select value from jsonb_array_elements(coalesce(cs.state->'seasons', '[]'::jsonb)) loop
        insert into public.seasons (store_id, name, started_at, status, closed_at, results)
        values (cs.store_id, coalesce(v->>'name', '시즌'),
                coalesce(to_timestamp(((v->>'startedAt')::bigint) / 1000.0), now()),
                coalesce(v->>'status', 'open'),
                case when v->>'closedAt' is not null then to_timestamp(((v->>'closedAt')::bigint) / 1000.0) end,
                v->'results');
      end loop;
    end if;
    for v in select value from jsonb_array_elements(coalesce(cs.state->'rpLog', '[]'::jsonb)) loop
      begin
        insert into public.rp_log (store_id, ts, member_id, delta, reason, operator)
        values (cs.store_id, to_timestamp(((v->>'ts')::bigint) / 1000.0), (v->>'memberId')::uuid, (v->>'delta')::bigint, coalesce(v->>'reason', ''), v->>'operator');
      exception when others then null;
      end;
    end loop;
    if cs.state->>'bizResetAt' is not null then
      update public.stores set biz_reset_at = to_timestamp(((cs.state->>'bizResetAt')::bigint) / 1000.0) where id = cs.store_id;
    end if;
    update public.console_state set state = '{}'::jsonb, updated_at = now() where store_id = cs.store_id;
    perform set_config('allinone.reset', 'off', true);
  end loop;
  perform public._ensure_store_defaults(id) from public.stores;
end $$;

-- ---------------------------------------------------------------------
-- 9. 공개 뷰 (익명 접근용 — 개인정보·잔액 제외)
-- ---------------------------------------------------------------------
create or replace view public.ranking_public as
  select id, store_id, nickname, emoji, color, rp
    from public.members where status = 'active' and rp > 0;

create or replace view public.seasons_public as
  select store_id,
         coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status,
                    'startedAt', (extract(epoch from started_at) * 1000)::bigint,
                    'closedAt', (extract(epoch from closed_at) * 1000)::bigint) order by started_at desc), '[]'::jsonb) as seasons
    from public.seasons group by store_id;

-- 같은 매장 회원끼리 보는 명단(닉네임·아바타·RP, 마스킹 없음) — 회원 페이지의 참가자 목록·매장 랭킹용.
--   직원은 자기 매장, 회원은 소속 매장만. 로그인하지 않으면 0건. 실명·전화번호는 포함하지 않음.
create or replace view public.members_public as
  select m.id, m.store_id, m.no, m.nickname, m.emoji, m.color, m.rp
    from public.members m
   where m.status = 'active'
     and m.store_id = coalesce(public.staff_store_id(),
                               (select store_id from public.members where user_id = auth.uid() limit 1));

-- ---------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.console_state enable row level security;
alter table public.staff enable row level security;
alter table public.members enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger enable row level security;
alter table public.game_sets enable row level security;
alter table public.games enable row level security;
alter table public.game_entries enable row level security;
alter table public.buyin_events enable row level security;
alter table public.events enable row level security;

drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores for select using (true);
drop policy if exists stores_update on public.stores;
create policy stores_update on public.stores for update
  using (id = public.staff_store_id())
  with check (id = public.staff_store_id());

drop policy if exists console_state_all on public.console_state;
create policy console_state_all on public.console_state for all
  using (store_id = public.staff_store_id()) with check (store_id = public.staff_store_id());

drop policy if exists staff_select on public.staff;
create policy staff_select on public.staff for select using (store_id = public.staff_store_id());
drop policy if exists staff_insert on public.staff;
create policy staff_insert on public.staff for insert
  with check (store_id = public.staff_store_id() and public.staff_role() = 'owner');
drop policy if exists staff_update on public.staff;
create policy staff_update on public.staff for update
  using (store_id = public.staff_store_id() and public.staff_role() = 'owner')
  with check (store_id = public.staff_store_id());
drop policy if exists staff_delete on public.staff;
create policy staff_delete on public.staff for delete
  using (store_id = public.staff_store_id() and public.staff_role() = 'owner' and user_id is distinct from auth.uid());

drop policy if exists members_select on public.members;
create policy members_select on public.members for select
  using (store_id = public.staff_store_id() or user_id = auth.uid());
drop policy if exists members_update on public.members;
create policy members_update on public.members for update
  using (store_id = public.staff_store_id())
  with check (store_id = public.staff_store_id());

drop policy if exists wallets_select on public.wallets;
create policy wallets_select on public.wallets for select
  using (store_id = public.staff_store_id() or owner = public.my_member_id()::text);

drop policy if exists ledger_select on public.ledger;
create policy ledger_select on public.ledger for select
  using (store_id = public.staff_store_id()
         or from_owner = public.my_member_id()::text or to_owner = public.my_member_id()::text);

drop policy if exists game_sets_all on public.game_sets;
create policy game_sets_all on public.game_sets for all
  using (store_id = public.staff_store_id()) with check (store_id = public.staff_store_id());

drop policy if exists games_select on public.games;
create policy games_select on public.games for select using (true);
drop policy if exists games_insert on public.games;
create policy games_insert on public.games for insert with check (store_id = public.staff_store_id());
drop policy if exists games_update on public.games;
create policy games_update on public.games for update
  using (store_id = public.staff_store_id()) with check (store_id = public.staff_store_id());

drop policy if exists game_entries_select on public.game_entries;
create policy game_entries_select on public.game_entries for select using (true);
drop policy if exists game_entries_update on public.game_entries;
create policy game_entries_update on public.game_entries for update
  using (exists (select 1 from public.games g where g.id = game_id and g.store_id = public.staff_store_id()));

drop policy if exists buyin_events_select on public.buyin_events;
create policy buyin_events_select on public.buyin_events for select using (true);

drop policy if exists events_select on public.events;
create policy events_select on public.events for select using (true);
drop policy if exists events_write on public.events;
create policy events_write on public.events for all
  using (store_id = public.staff_store_id()) with check (store_id = public.staff_store_id());

-- v2 테이블
alter table public.pass_types enable row level security;
alter table public.passes enable row level security;
alter table public.pass_log enable row level security;
alter table public.seasons enable row level security;
alter table public.rp_log enable row level security;
alter table public.waitlist enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists pass_types_all on public.pass_types;
create policy pass_types_all on public.pass_types for all
  using (store_id = public.staff_store_id()) with check (store_id = public.staff_store_id());
drop policy if exists pass_types_member_select on public.pass_types;
create policy pass_types_member_select on public.pass_types for select
  using (exists (select 1 from public.passes p where p.type_id = pass_types.id and p.member_id = public.my_member_id()));
drop policy if exists passes_select on public.passes;
create policy passes_select on public.passes for select
  using (store_id = public.staff_store_id() or member_id = public.my_member_id());
drop policy if exists pass_log_select on public.pass_log;
create policy pass_log_select on public.pass_log for select using (store_id = public.staff_store_id());
drop policy if exists seasons_select on public.seasons;
create policy seasons_select on public.seasons for select using (true);
drop policy if exists rp_log_select on public.rp_log;
create policy rp_log_select on public.rp_log for select
  using (store_id = public.staff_store_id() or member_id = public.my_member_id());
drop policy if exists waitlist_select on public.waitlist;
create policy waitlist_select on public.waitlist for select
  using (store_id = public.staff_store_id() or member_id = public.my_member_id());
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select using (store_id = public.staff_store_id());

-- ---------------------------------------------------------------------
-- 10b. 플랫폼 관리자(개발자) — 매장을 여러 개 개설하고 각 매장의 대표를 지정
--   platform_admins 에 등록된 계정만 admin_* RPC 사용 가능. 등록은 SQL로만(클라이언트 접근 불가).
--   흐름: 개발자 콘솔(/dev)에서 매장 개설 + 구매자 이메일 지정 → 구매자가 그 이메일로 콘솔 가입 → 자동으로 대표 연결
--   매장 보기: admin_select_store(매장) 후에는 staff_store_id()/staff_role()/_require_staff()/my_role() 이
--   그 매장의 대표로 판정하므로 관리자 콘솔 전체가 그대로 동작 (테이블은 3절 앞부분에서 생성)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function public._require_platform_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception '개발자(플랫폼 관리자) 계정만 사용할 수 있습니다.'; end if;
end $$;

-- 매장 목록: 대표(이름·이메일·계정 연결 여부)·직원 수·회원 수
create or replace function public.admin_list_stores() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'createdAt', s.created_at,
      'owner', (select jsonb_build_object('name', o.name, 'email', o.email, 'linked', o.user_id is not null)
                  from public.staff o where o.store_id = s.id and o.role = 'owner' order by o.created_at limit 1),
      'staffCount', (select count(*) from public.staff x where x.store_id = s.id),
      'memberCount', (select count(*) from public.members m where m.store_id = s.id and m.status = 'active'),
      'selected', s.id = (select store_id from public.platform_admin_scope where user_id = auth.uid())
    ) order by s.created_at)
    from public.stores s), '[]'::jsonb);
end $$;

-- 개발자가 볼 매장 선택 (null이면 해제). 선택 후 관리자 콘솔(/)을 열면 그 매장이 대표 권한으로 열림
create or replace function public.admin_select_store(p_store uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_platform_admin();
  if p_store is null then
    delete from public.platform_admin_scope where user_id = auth.uid();
    return;
  end if;
  if not exists (select 1 from public.stores where id = p_store) then raise exception '매장을 찾을 수 없습니다.'; end if;
  insert into public.platform_admin_scope (user_id, store_id) values (auth.uid(), p_store)
  on conflict (user_id) do update set store_id = excluded.store_id, selected_at = now();
end $$;

-- 대표 지정/변경: 이메일을 owner로 (초대 행이 없으면 생성, 이미 가입된 계정이면 즉시 연결). 기존 다른 대표는 manager로 내림
create or replace function public.admin_set_store_owner(p_store uuid, p_owner_email text, p_owner_name text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_owner_email, ''))); v_uid uuid; v_id uuid; v_other uuid;
begin
  perform public._require_platform_admin();
  if not exists (select 1 from public.stores where id = p_store) then raise exception '매장을 찾을 수 없습니다.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception '대표 이메일 형식이 올바르지 않습니다.'; end if;
  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is not null then
    select store_id into v_other from public.staff where user_id = v_uid and store_id <> p_store limit 1;
    if v_other is not null then
      raise exception '이 이메일 계정은 이미 다른 매장의 직원입니다. 한 계정은 한 매장에만 소속될 수 있습니다.';
    end if;
  end if;
  perform set_config('allinone.reset', 'on', true);   -- 행 단위 감사 로그(actor 없음) 대신 아래 한 줄로 기록
  update public.staff set role = 'manager' where store_id = p_store and role = 'owner' and lower(email) <> v_email;
  select id into v_id from public.staff where store_id = p_store and lower(email) = v_email limit 1;
  if v_id is null then
    insert into public.staff (store_id, user_id, email, name, role)
    values (p_store, v_uid, v_email, coalesce(nullif(trim(p_owner_name), ''), '대표'), 'owner');
  else
    update public.staff set role = 'owner', user_id = coalesce(user_id, v_uid),
           name = coalesce(nullif(trim(p_owner_name), ''), name)
     where id = v_id;
  end if;
  perform set_config('allinone.reset', 'off', true);
  insert into public.audit_log (store_id, actor_id, actor, action, target_type, target_id, detail)
  values (p_store, auth.uid(), '개발자', 'store.owner_set', 'staff', v_email,
          jsonb_build_object('email', v_email, 'linked', v_uid is not null));
end $$;

-- 매장 개설 + 대표 초대 (서비스 구매자). 실패 시 전체 롤백
create or replace function public.admin_create_store(p_store_name text, p_owner_email text, p_owner_name text default '대표') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  perform public._require_platform_admin();
  if coalesce(trim(p_store_name), '') = '' then raise exception '매장 이름을 입력해주세요.'; end if;
  perform set_config('allinone.reset', 'on', true);
  insert into public.stores (name) values (trim(p_store_name)) returning id into v_store;
  insert into public.game_sets (store_id, name, data) values (v_store, '데일리 스탠다드', public._default_game_set());
  perform public._ensure_store_defaults(v_store);
  perform set_config('allinone.reset', 'off', true);
  insert into public.audit_log (store_id, actor_id, actor, action, target_type, target_id, detail)
  values (v_store, auth.uid(), '개발자', 'store.create', 'store', v_store::text, jsonb_build_object('name', trim(p_store_name)));
  perform public.admin_set_store_owner(v_store, p_owner_email, p_owner_name);
  return v_store;
end $$;

-- ---------------------------------------------------------------------
-- 11. 실행 권한 — 내부 함수는 API에서 호출 불가
-- ---------------------------------------------------------------------
revoke all on function public._require_platform_admin() from public, anon, authenticated;
revoke all on function public._move(uuid, text, text, text, bigint, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public._buyin(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public._require_staff(text[]) from public, anon, authenticated;
revoke all on function public._default_game_set() from public, anon, authenticated;
revoke all on function public.next_member_no(uuid) from public, anon, authenticated;
revoke all on function public._ensure_store_defaults(uuid) from public, anon, authenticated;
revoke all on function public._seat_count(uuid, int) from public, anon, authenticated;
grant select on public.ranking_public to anon, authenticated;
grant select on public.seasons_public to anon, authenticated;
grant select on public.members_public to authenticated;

-- ---------------------------------------------------------------------
-- 12. Realtime
-- ---------------------------------------------------------------------
-- DELETE 이벤트도 store_id 필터에 걸리도록 전체 행을 복제 식별자로 사용
alter table public.staff replica identity full;
alter table public.members replica identity full;
alter table public.game_sets replica identity full;
alter table public.games replica identity full;
alter table public.game_entries replica identity full;
alter table public.buyin_events replica identity full;
alter table public.events replica identity full;
alter table public.wallets replica identity full;
alter table public.pass_types replica identity full;
alter table public.passes replica identity full;
alter table public.seasons replica identity full;
alter table public.waitlist replica identity full;

do $$
declare t text;
begin
  foreach t in array array['stores', 'console_state', 'staff', 'members', 'wallets', 'ledger',
                           'game_sets', 'games', 'game_entries', 'buyin_events', 'events',
                           'pass_types', 'passes', 'pass_log', 'seasons', 'rp_log', 'waitlist', 'audit_log'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when undefined_object then null;
    end;
  end loop;
end $$;
