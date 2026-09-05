-- 가상 데이터 제거: demo-staff-members.sql 로 넣은 직원·회원과 그 파생 데이터(지갑·원장·RP 로그·이용권·대기열)
--   원장(ledger)은 평소 수정·삭제가 막혀 있어 reset 플래그를 켠 뒤 지움. 실제 회원 데이터는 건드리지 않음.
do $$
declare v_store uuid; v_op text := '가상 데이터';
begin
  select id into v_store from public.stores order by created_at limit 1;
  perform set_config('allinone.reset', 'on', true);
  delete from public.passes where member_id in (select id from public.members where store_id = v_store and memo = v_op);
  delete from public.pass_log where store_id = v_store and operator = v_op;
  delete from public.rp_log where member_id in (select id from public.members where store_id = v_store and memo = v_op);
  delete from public.waitlist where member_id in (select id from public.members where store_id = v_store and memo = v_op);
  delete from public.ledger where store_id = v_store and operator = v_op;
  delete from public.wallets where store_id = v_store and owner in (select id::text from public.members where store_id = v_store and memo = v_op);
  delete from public.members where store_id = v_store and memo = v_op;
  delete from public.staff where store_id = v_store and user_id is null and email in ('demo-manager@example.com', 'demo-dealer1@example.com', 'demo-dealer2@example.com');
  perform set_config('allinone.reset', 'off', true);
end $$;
