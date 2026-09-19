/* ---------------------------------------------------------------------
   0033 — delete_announcement

   save_announcement (0030) covers create/update, but nothing ever gave
   announcements a real delete path once the client stopped being able to
   `.delete()` the table directly. The client's Delete button (added
   alongside Archive/Restore) was writing the removal into local state
   only — syncAnnouncements() in backend.ts had no delete branch to call,
   so the row survived in Postgres and came back on the next read,
   making deletes look like they silently undid themselves.

   RLS already had a delete policy for this (ann_del, from
   0002_rls_functions.sql, gated on communication.delete) that's been
   dormant ever since raw table writes were removed — this just gives it
   a callable RPC. Permission mirrors save_announcement's update case
   (sender OR communication.manage_announcement) rather than requiring
   the separate communication.delete grant, so it matches what the
   client's canManageAnnouncement() already uses to show the button.
   --------------------------------------------------------------------- */

create or replace function public.delete_announcement(p_announcement_id text)
returns jsonb language plpgsql security definer as $$
declare target public.announcements;
begin
  select * into target from public.announcements where id = p_announcement_id;
  if target.id is null then
    return jsonb_build_object('deleted', 0);
  end if;

  if target.sender_id <> auth.uid() and not public.has_perm('communication.manage_announcement') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- announcement_reads references announcements with ON DELETE CASCADE,
  -- so its rows go automatically.
  delete from public.announcements where id = p_announcement_id;

  perform public.log_action('announcement.delete', p_announcement_id, target.title);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_announcement(text) to authenticated;
