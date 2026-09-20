/* ---------------------------------------------------------------------
   0040 — message_reports had no RPC at all; both filing and
   resolving a report have always failed

   Found while verifying messaging/notifications are correctly tied to
   accounts. syncReports() (backend.ts) is the ONLY remaining caller of
   the deprecated raw upsert() helper — every other table moved onto a
   real RPC back in 0026-0032, but this one was left behind (flagged and
   deliberately left out of scope earlier in this project; fixing it now
   since it's squarely inside "is messaging correct end to end").
   upsert() unconditionally throws "no longer go through snapshot
   syncing" for any table, so both of communication.tsx's write paths
   here have never actually worked:
     - reporting a message (ModerationPage's report flow, line ~636)
     - resolving/dismissing a report (ModerationPage, line ~865)

   Same "new vs modified" split as the notifications fix in this same
   session: filing a report and reviewing one are different operations
   with different permission requirements (reporter files their own;
   only a moderator reviews), so they get two RPCs, not one upsert.
   --------------------------------------------------------------------- */

create or replace function public.file_message_report(
  p_message_id text, p_conversation_id text, p_reason text, p_detail text default null)
returns jsonb language plpgsql security definer as $$
declare new_id uuid;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not exists (select 1 from public.messages where id = p_message_id::uuid and conversation_id = p_conversation_id) then
    raise exception 'that message is not in this conversation';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'a reason is required';
  end if;

  insert into public.message_reports (message_id, conversation_id, reporter_id, reason, detail)
  values (p_message_id::uuid, p_conversation_id, auth.uid(), btrim(p_reason), nullif(btrim(coalesce(p_detail, '')), ''))
  returning id into new_id;

  perform public.log_action('report.file', new_id::text, p_reason);
  return jsonb_build_object('id', new_id);
end $$;
grant execute on function public.file_message_report(text,text,text,text) to authenticated;

create or replace function public.review_message_report(p_report_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('communication.moderate') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'unknown status %', p_status;
  end if;
  update public.message_reports set status = p_status where id = p_report_id::uuid;
  if not found then raise exception 'unknown report %', p_report_id; end if;

  perform public.log_action('report.' || p_status, p_report_id, null);
  return jsonb_build_object('id', p_report_id, 'status', p_status);
end $$;
grant execute on function public.review_message_report(text,text) to authenticated;
