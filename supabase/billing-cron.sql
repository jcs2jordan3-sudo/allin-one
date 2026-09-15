-- 구독 갱신 결제 스케줄: 매일 10:00 KST(01:00 UTC)에 Edge Function toss-billing 의 renew 호출
-- 적용: 아래 본문의 ANON 키 자리표시자와 CRON 비밀값 자리표시자를 실제 값으로 모두 바꾼 사본을 실행한다.
--   (값이 담긴 사본은 git 에 올리지 않는다. 비밀값은 홀덤회원관리/tools/.cron-secret, Edge Function 비밀값 CRON_SECRET 과 같아야 함)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'allinone-renew-subscriptions';
select cron.schedule('allinone-renew-subscriptions', '0 1 * * *', $cron$
  select net.http_post(
    url := 'https://lhjyuvuitfqbbpgbesth.supabase.co/functions/v1/toss-billing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer __ANON_KEY__',
      'x-cron-secret', '__CRON_SECRET__'),
    body := '{"action":"renew"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);
