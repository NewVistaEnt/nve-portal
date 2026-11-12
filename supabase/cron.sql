-- Check Aspire for newly Won jobs every 15 minutes.
-- Run once in Supabase SQL Editor AFTER replacing the two values in <angle brackets>.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'aspire-won-check',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://ylyrsqmriwqlrsrnqres.supabase.co/functions/v1/aspire-sync',
    headers := jsonb_build_object('x-sync-secret', '<SYNC_SECRET>', 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- To stop it later:  select cron.unschedule('aspire-won-check');
