-- ===========================================================================
-- 0028_fee_item_crud.sql — creating and removing a fee item, as named ops
--
-- 0026_write_api.sql gave `record_fee_payment` a real home but never covered
-- the other two fee_items writes the Fees page performs: billing a student
-- for a new item ("Add fee") and removing one that was added in error.
-- Both went through the generic upsert()/remove(), which 0026 disabled for
-- every table — so, same as students/marks/attendance/messages before this
-- round, they currently fail with "no longer go through snapshot syncing."
--
-- `apply_fee_template()` (0025) already covers billing a whole class at
-- once; `create_fee_item` is the one-student equivalent for a one-off charge
-- outside any template.
-- ===========================================================================

create or replace function public.create_fee_item(
  p_student_id text, p_label text, p_amount numeric, p_due_date date default null,
  p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  fid text := 'fee-' || replace(gen_random_uuid()::text, '-', '');
  yr text := coalesce(p_year_id, public.current_year_id());
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.can_view_student(p_student_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'a label is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if not public.year_is_open(yr) then
    raise exception 'academic year % is closed', yr using errcode = '42501';
  end if;

  insert into public.fee_items (id, student_id, label, amount, paid, due_date, year_id, payments)
  values (fid, p_student_id, btrim(p_label), p_amount, 0, p_due_date, yr, '[]'::jsonb);

  perform public.log_action('fees.create', fid, format('%s — %s', btrim(p_label), p_amount));
  return jsonb_build_object('feeItemId', fid);
end $$;
grant execute on function public.create_fee_item(text,text,numeric,date,text) to authenticated;

-- ===========================================================================
-- mark_message_read — the other half of 0026's send_message.
--
-- send_message() covers sending; nothing covered a message's read_by flip
-- (sent → read), so it went through the same disabled generic upsert as
-- everything else in this file. Realtime (0013) streams the change once
-- it happens — this is what makes it happen.
-- ===========================================================================

create or replace function public.mark_message_read(p_conversation_id text)
returns integer language plpgsql security definer as $$
declare n int;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.messages
     set read_by = read_by || array[auth.uid()]
   where conversation_id = p_conversation_id
     and sender_id <> auth.uid()
     and not (auth.uid() = any(read_by));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_message_read(text) to authenticated;

-- ===========================================================================
-- delete_role — RolesPage has always offered to delete a custom (non-system)
-- role. 0026's save_role covers create/update; nothing covered delete, so it
-- fell through to the same disabled generic remove() as everything else.
-- ===========================================================================

create or replace function public.delete_role(p_role_id text)
returns jsonb language plpgsql security definer as $$
declare r public.role_defs;
begin
  if not public.has_perm('roles.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into r from public.role_defs where id = p_role_id;
  if r.id is null then return jsonb_build_object('deleted', 0); end if;
  if r.is_system then raise exception 'system roles cannot be deleted'; end if;
  if exists (select 1 from public.profiles where role_def_id = r.id) then
    raise exception 'cannot delete a role that is still assigned to a user';
  end if;

  delete from public.role_defs where id = r.id; -- role_permissions cascades
  perform public.log_action('role.delete', p_role_id, r.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_role(text) to authenticated;

create or replace function public.delete_fee_item(p_fee_item_id text)
returns jsonb language plpgsql security definer as $$
declare f public.fee_items;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into f from public.fee_items where id = p_fee_item_id;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;
  if f.paid > 0 then
    raise exception 'cannot delete a fee item that already has payments recorded against it';
  end if;

  delete from public.fee_items where id = f.id;
  perform public.log_action('fees.delete', p_fee_item_id, f.label);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_fee_item(text) to authenticated;
