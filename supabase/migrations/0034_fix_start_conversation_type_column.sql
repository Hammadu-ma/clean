/* ---------------------------------------------------------------------
   0034 — fix start_conversation: conversations has no "type" column

   public.conversations was never given a `type` column (0001_schema.sql
   — id, related_student_id/class_id/section_id/subject_id, status,
   created_at, updated_at). The table has only ever held direct
   one-to-one conversations, so the read side (mapConversations() in
   src/lib/backend.ts) has always just hardcoded `type: "direct"` on the
   way out rather than reading it from a column.

   start_conversation() (0030_write_api_structure.sql) was written as if
   that column existed: it filtered on `c.type = 'direct'` and inserted
   a `type` value. Every call has therefore failed outright with
   "column "type" of relation "conversations" does not exist" — a
   Postgres error code failFromPostgres() (api/_lib/http.ts) doesn't
   recognize, so it fell through to the generic
   "The request could not be completed. Reference: xxxxxx" message
   instead of anything actionable. This has made it impossible to start
   any new conversation since 0030 shipped.

   Fix: drop the `type` references — the WHERE clause's dedup lookup
   doesn't need it (every row already is a direct conversation) and the
   INSERT just stops naming a column that was never there.
   --------------------------------------------------------------------- */

create or replace function public.start_conversation(
  p_other_profile_id uuid, p_related_student_id text default null,
  p_related_class_id text default null, p_related_section_id text default null,
  p_related_subject_id text default null)
returns jsonb language plpgsql security definer as $$
declare cid text; existing text;
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    raise exception 'a conversation needs a real other participant';
  end if;

  -- Reuse an existing direct conversation between exactly these two people
  -- rather than spawning a duplicate every time "message" is clicked.
  select c.id into existing
  from public.conversations c
  where exists (select 1 from public.conversation_participants p1 where p1.conversation_id = c.id and p1.profile_id = auth.uid())
    and exists (select 1 from public.conversation_participants p2 where p2.conversation_id = c.id and p2.profile_id = p_other_profile_id)
    and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if existing is not null then
    return jsonb_build_object('conversationId', existing, 'created', false);
  end if;

  cid := 'conv-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.conversations (id, related_student_id, related_class_id, related_section_id, related_subject_id, status)
  values (cid, p_related_student_id, p_related_class_id, p_related_section_id, p_related_subject_id, 'active');
  insert into public.conversation_participants (conversation_id, profile_id) values (cid, auth.uid()), (cid, p_other_profile_id);

  perform public.log_action('conversation.start', cid, null);
  return jsonb_build_object('conversationId', cid, 'created', true);
end $$;
grant execute on function public.start_conversation(uuid,text,text,text,text) to authenticated;
