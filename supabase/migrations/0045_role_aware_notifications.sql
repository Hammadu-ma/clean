/* ---------------------------------------------------------------------
   0045 — never deliver another role's notification

   A notification carries a target_route inside one role's area
   (/teacher/..., /admin/..., /student/..., /guardian/...). Some of the
   functions that create notifications don't check the recipient's role, so
   e.g. a teacher's "/teacher/marks" notification reached an admin, whose
   click ended on "Access denied — Required access: Teacher".

   This BEFORE INSERT trigger drops any notification whose route is in a
   role area that differs from the recipient's own role, no matter which
   function or trigger created it. Rows with no route, or a shared route
   (/messages, /events, /announcements, /notifications), are unaffected.
   Because the row is never inserted, the push-dispatch trigger never fires
   for it either. Safe to re-run.
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
  if area is null then
    return new;
  end if;

  select pr.role::text into recipient from public.profiles pr where pr.id = new.profile_id;
  if recipient is not null and recipient <> area then
    return null;  -- skip: this notification belongs to another role
  end if;

  return new;
end $$;

drop trigger if exists notifications_role_guard on public.notifications;
create trigger notifications_role_guard
  before insert on public.notifications
  for each row execute function public.trg_notifications_role_guard();

/* Optional one-off cleanup of rows already delivered to the wrong role.
   The app already hides them; uncomment to delete them for good.

delete from public.notifications n
using public.profiles pr
where pr.id = n.profile_id
  and to_jsonb(n)->>'target_route' ~ '^/(admin|teacher|student|guardian)/'
  and substring(btrim(to_jsonb(n)->>'target_route') from '^/(admin|teacher|student|guardian)/') <> pr.role::text;
*/

notify pgrst, 'reload schema';
