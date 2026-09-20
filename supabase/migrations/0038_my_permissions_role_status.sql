/* ---------------------------------------------------------------------
   0038 — my_permissions() ignored a disabled role_def

   Found while fixing the "granting a permission doesn't reach anyone
   already using the app" problem (see the frontend change in
   src/store.tsx for the main fix). While wiring that up against
   my_permissions() (0023), it turned out that function only checks
   profiles.status = 'active' — never role_defs.status — so disabling a
   whole role (RolesPage's "Deactivate" toggle, which its own UI copy
   claims cuts off access "immediately") would leave my_permissions()
   still returning that role's full permission list. The client's own
   hasPermission() has always independently checked role.status too, so
   this only mattered once something started actually polling
   my_permissions() to sync live — which is exactly what's being added
   now. Fixed to match hasPermission()'s two-part check (profile active
   AND role active) exactly.
   --------------------------------------------------------------------- */

create or replace function public.my_permissions()
returns text[] language sql security definer stable as $$
  select case
    when r.all_permissions then array(select id from public.permissions)
    else coalesce(array(
      select rp.permission_id from public.role_permissions rp
      where rp.role_def_id = r.id
    ), '{}')
  end
  from public.profiles p
  join public.role_defs r on r.id = p.role_def_id
  where p.id = auth.uid() and p.status = 'active' and r.status = 'active';
$$;
grant execute on function public.my_permissions() to authenticated;
