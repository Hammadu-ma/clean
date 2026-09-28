/* ---------------------------------------------------------------------
   0045 — never deliver a teacher-area notification to an admin

   A notification carries a target_route inside one role's area. Some of the
   functions that create notifications don't check the recipient's role, so
   a teacher's "/teacher/marks" notification reached an admin, whose click
   ended on "Access denied — Required access: Teacher".

   This BEFORE INSERT trigger is deliberately narrow and NEVER blocks any
   other notification:
     - recipient is an admin and the route is a /teacher/... route
         -> the notification is skipped (never inserted, so no push either);
     - any other role-area mismatch (e.g. a /student/... route sent to a
       guardian) -> the row is still delivered, with its route cleared so a
       click falls back to the app's per-role destination;
     - no route, a shared route, or a matching route -> untouched.
   /admin/... routes are open to every base role by design, so they are
   never treated as a mismatch.

   Safe to re-run (CREATE OR REPLACE). If notifications ever stop arriving,
   this is the first thing to disable:
     drop trigger if exists notifications_role_guard on public.notifications;
   --------------------------------------------------------------------- */

create or replace function public.trg_notifications_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  route     text := to_jsonb(new)->>'target_route';  -- tolerant if the column is absent
  area      text;
  recipient text;
begin
  if route is null then
    return new;
  end if;

  area := substring(btrim(route) from '^/(admin|teacher|student|guardian)/');
  if area is null or area = 'admin' then
    return new;
  end if;

  select pr.role::text into recipient from public.profiles pr where pr.id = new.profile_id;
  if recipient is null or recipient = area then
    return new;
  end if;

  if recipient = 'admin' and area = 'teacher' then
    return null;                 -- a teacher's notification must not reach an admin
  end if;

  new.target_route := null;      -- deliver anyway; the app picks a valid destination
  return new;
end $$;

drop trigger if exists notifications_role_guard on public.notifications;
create trigger notifications_role_guard
  before insert on public.notifications
  for each row execute function public.trg_notifications_role_guard();

notify pgrst, 'reload schema';
