-- 가상 데이터 시드: 직원 3명(매니저 1·딜러 2, 초대 대기 상태) + 회원 30명(지갑 잔액·RP 기록·이용권 일부)
--   실행: Supabase SQL Editor 또는 Management API로 그대로 실행 (첫 번째 매장에 넣음)
--   재실행: 이미 넣은 매장이면 아무것도 하지 않음 (memo = '가상 데이터' 로 판별)
--   삭제: supabase/seed/demo-staff-members-remove.sql
do $$
declare
  v_store uuid;
  v_op text := '가상 데이터';
  i int; k int; mid uuid; v_no text;
  v_rp bigint; v_remain bigint; v_delta bigint; v_p bigint; v_s bigint; v_v int; v_cnt int;
  pt record;
  names text[] := array[
    '김민준','이서연','박지훈','최수아','정도윤','강하은','조현우','윤지민','장서준','임채원',
    '한예준','오유진','서지호','신다은','권시우','황수빈','안준서','송하린','류건우','홍지아',
    '문시현','배은우','백서윤','노태양','남주원','심하율','유도현','진소율','곽민서','엄지우'];
  nicks text[] := array[
    '에이스','리버킹','블러프','칩리더','포카리','올인맨','딜러킬러','플랍퀸','턴마스터','콜스테이션',
    '나이트호크','슬로우플레이','럭키세븐','포켓킹','하이롤러','체크레이즈','스택몬스터','카드샤크','텐텐','아이스맨',
    '바운티헌터','에이스하이','플러쉬맨','스트레이트','풀하우스','쿼드','로얄','세미블러프','팟오즈','마지막판'];
  emojis text[] := array['😎','🦈','🎭','🐯','🐳','🔥','🃏','🎩','👑','🍀','⚡','🌙'];
  colors text[] := array['#E9BB56','#57B6F2','#A98BF5','#F2A65A','#4FD1C5','#F26D76','#7BC96F','#D48FD4'];
begin
  select id into v_store from public.stores order by created_at limit 1;
  if v_store is null then raise exception '매장이 없습니다. 먼저 매장을 개설하세요.'; end if;
  if exists (select 1 from public.members where store_id = v_store and memo = v_op) then
    raise notice '이미 가상 데이터가 있어 건너뜁니다.';
    return;
  end if;

  -- 행 단위 감사 로그(actor 없음)가 33건 쌓이지 않도록 잠시 끄고, 마지막에 한 줄만 남김
  perform set_config('allinone.reset', 'on', true);

  -- 직원: 초대 상태(user_id null). 이 이메일로 콘솔 가입하면 자동 연결됨
  insert into public.staff (store_id, email, name, role) values
    (v_store, 'demo-manager@example.com', '박준혁', 'manager'),
    (v_store, 'demo-dealer1@example.com', '이수진', 'dealer'),
    (v_store, 'demo-dealer2@example.com', '정우성', 'dealer')
  on conflict (store_id, email) do nothing;

  perform public._ensure_store_defaults(v_store);

  -- 매장 지갑이 부족하면 본사 발행
  if (select balance from public.wallets where store_id = v_store and owner = 'store' and currency = 'P') < 50000000 then
    perform public._move(v_store, 'hq', 'store', 'P', 100000000, '가상 데이터용 포인트 발행', v_op, null, null);
  end if;
  if (select balance from public.wallets where store_id = v_store and owner = 'store' and currency = 'S') < 10000000 then
    perform public._move(v_store, 'hq', 'store', 'S', 100000000, '가상 데이터용 시드 발행', v_op, null, null);
  end if;
  if (select balance from public.wallets where store_id = v_store and owner = 'store' and currency = 'V') < 200 then
    perform public._move(v_store, 'hq', 'store', 'V', 1000, '가상 데이터용 음료권 발행', v_op, null, null);
  end if;

  for i in 1..30 loop
    v_no := public.next_member_no(v_store);
    -- RP: 앞 번호일수록 높게, 약간의 무작위 → 랭킹이 자연스럽게 보이도록
    v_rp := greatest(0, 60 - i * 2 + (random() * 10)::int) * 5000;
    insert into public.members (store_id, no, nickname, emoji, color, real_name, phone, rp, memo, joined_at)
    values (
      v_store, v_no, nicks[i], emojis[1 + (i - 1) % 12], colors[1 + (i * 5) % 8], names[i],
      '010-0100-' || lpad(i::text, 4, '0'),   -- 010-0xxx 대역은 실제로 배정되지 않는 가상 번호
      v_rp, v_op,
      now() - ((130 - i * 4) || ' days')::interval - ((random() * 12)::int || ' hours')::interval
    )
    returning id into mid;

    -- RP 로그: 합계가 members.rp 와 같도록 최대 3건으로 분할
    v_remain := v_rp; k := 0;
    while v_remain > 0 loop
      k := k + 1;
      if k >= 3 then v_delta := v_remain; else v_delta := least(v_remain, (1 + (random() * 4)::int) * 20000); end if;
      insert into public.rp_log (store_id, ts, member_id, delta, reason, operator)
      values (v_store, now() - ((k * 9) || ' days')::interval, mid, v_delta,
              case k when 1 then '토너먼트 순위 보상' when 2 then '데일리 게임 참가' else '이벤트 보너스' end, v_op);
      v_remain := v_remain - v_delta;
    end loop;

    -- 지갑: P 10만~300만, S는 3명 중 1명, V 0~5장
    v_p := (1 + (random() * 29)::int) * 100000;
    perform public._move(v_store, 'store', mid::text, 'P', v_p, '가상 데이터 지급', v_op, null, null);
    if i % 3 = 0 then
      v_s := (1 + (random() * 9)::int) * 100000;
      perform public._move(v_store, 'store', mid::text, 'S', v_s, '가상 데이터 지급', v_op, null, null);
    end if;
    v_v := (random() * 5)::int;
    if v_v > 0 then
      perform public._move(v_store, 'store', mid::text, 'V', v_v, '가상 데이터 지급', v_op, null, null);
    end if;

    -- 이용권: 4명 중 1명꼴로 1~3장 (유형은 돌아가며)
    if i % 4 = 1 then
      select * into pt from public.pass_types where store_id = v_store and not archived
       order by sort, created_at limit 1 offset ((i / 4) % 3);
      if pt.id is not null then
        v_cnt := 1 + (i % 3);
        insert into public.passes (store_id, type_id, member_id, issued_at, expires_at)
        select v_store, pt.id, mid, now() - interval '3 days', now() - interval '3 days' + pt.valid_days * interval '1 day'
        from generate_series(1, v_cnt);
        insert into public.pass_log (store_id, action, type_name, member_id, detail, operator)
        values (v_store, '발급', pt.name, mid, pt.name || ' × ' || v_cnt, v_op);
      end if;
    end if;
  end loop;

  perform set_config('allinone.reset', 'off', true);
  insert into public.audit_log (store_id, actor, action, target_type, target_id, detail)
  values (v_store, v_op, 'seed.demo', 'store', v_store::text, jsonb_build_object('staff', 3, 'members', 30));
end $$;
