/* ---------------------------------------------------------------------
   0045 — notification deep-link columns

   supabase/functions/push-notification and api/realtime-notifications.ts
   both SELECT target_type / target_id / target_route from notifications,
   but no earlier migration created them. Where the columns are missing the
   push function's lookup fails ("column ... does not exist") and no push is
   delivered. Safe to re-run.
   --------------------------------------------------------------------- */

alter table public.notifications add column if not exists target_type  text;
alter table public.notifications add column if not exists target_id    text;
alter table public.notifications add column if not exists target_route text;

-- Return the new columns to the app (return type changes, so drop first).
drop function if exists public.list_notifications(timestamptz, integer, boolean);
create or replace function public.list_notifications(
  p_before timestamptz default null, p_limit integer default 30, p_unread_only boolean default false)
returns table (id uuid, type text, title text, body text, is_read boolean,
               year_id text, target_type text, target_id text, target_route text,
               created_at timestamptz)
language sql security invoker stable as $$
  select n.id, n.type, n.title, n.body, n.is_read, n.year_id,
         n.target_type, n.target_id, n.target_route, n.created_at
  from public.notifications n
  where n.profile_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
    and (not p_unread_only or not n.is_read)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
grant execute on function public.list_notifications(timestamptz, integer, boolean) to authenticated;
