from pathlib import Path

root = Path('/mnt/data/notifwork')

# 1) Sort notification selectors newest-first.
p = root / 'src/rbac.ts'
s = p.read_text()
old = '''export const userNotifications = (db: DB, user: User | null) =>
  user ? db.notifications.filter((n) => n.userId === user.id) : [];
'''
new = '''export const userNotifications = (db: DB, user: User | null) =>
  user
    ? db.notifications
        .filter((n) => n.userId === user.id)
        .sort((a, b) => b.at.localeCompare(a.at))
    : [];
'''
assert old in s, 'userNotifications block not found'
p.write_text(s.replace(old, new))

# 2) Backend sync handles optimistic deletions for messages and notifications.
p = root / 'src/lib/backend.ts'
s = p.read_text()
old_msg = '''async function syncMessages(oldDB: DB, newDB: DB, errors: string[]) {
  // Brand-new messages → send_message(). Pass the optimistic UUID through
  // so the browser copy and persisted server row are the exact same message.
  // The RPC is idempotent for retries of that UUID.
  for (const m of newDB.messages) {
    if (oldDB.messages.some((x) => x.id === m.id)) continue;
    const { error } = await sb()!.rpc("send_message", {
      p_conversation_id: m.conversationId,
      p_body: m.body,
      p_id: m.id,
    });
    if (error) errors.push(`message: ${error.message}`);
  }

  // Read receipts (an existing message's read_by grew) → mark_message_read(),
  // once per conversation rather than once per message.
  const conversationsWithNewReads = new Set<string>();
  for (const m of newDB.messages) {
    const before = oldDB.messages.find((x) => x.id === m.id);
    if (before && before.readBy.length !== m.readBy.length) conversationsWithNewReads.add(m.conversationId);
  }
  for (const cid of conversationsWithNewReads) {
    const { error } = await sb()!.rpc("mark_message_read", { p_conversation_id: cid });
    if (error) errors.push(`marking messages read: ${error.message}`);
  }
}
'''
new_msg = '''async function syncMessages(oldDB: DB, newDB: DB, errors: string[]) {
  const { del } = diff(oldDB.messages, newDB.messages);

  // Deletes are server-authorized: delete_message() only permits a user to
  // delete a message they originally sent and belong to its conversation.
  // Keep the optimistic UI immediately responsive; the following refresh
  // reconciles against the server result.
  for (const m of del) {
    const { error } = await sb()!.rpc("delete_message", { p_message_id: m.id });
    if (error) errors.push(`deleting message: ${error.message}`);
  }

  // Brand-new messages → send_message(). Pass the optimistic UUID through
  // so the browser copy and persisted server row are the exact same message.
  // The RPC is idempotent for retries of that UUID.
  for (const m of newDB.messages) {
    if (oldDB.messages.some((x) => x.id === m.id)) continue;
    const { error } = await sb()!.rpc("send_message", {
      p_conversation_id: m.conversationId,
      p_body: m.body,
      p_id: m.id,
    });
    if (error) errors.push(`message: ${error.message}`);
  }

  // Read receipts (an existing message's read_by grew) → mark_message_read(),
  // once per conversation rather than once per message.
  const conversationsWithNewReads = new Set<string>();
  for (const m of newDB.messages) {
    const before = oldDB.messages.find((x) => x.id === m.id);
    if (before && before.readBy.length !== m.readBy.length) conversationsWithNewReads.add(m.conversationId);
  }
  for (const cid of conversationsWithNewReads) {
    const { error } = await sb()!.rpc("mark_message_read", { p_conversation_id: cid });
    if (error) errors.push(`marking messages read: ${error.message}`);
  }
}
'''
assert old_msg in s, 'syncMessages block not found'
s = s.replace(old_msg, new_msg)

old_notif = '''async function syncNotifications(oldDB: DB, newDB: DB, errors: string[]) {
  // notifications has no direct insert policy by design — it's written only
  // via notify_users(), a SECURITY DEFINER RPC that enforces who's allowed
  // to notify whom (admins can notify anyone; everyone else only people
  // they're actually allowed to message).
  //
  // diff() doesn't distinguish "brand new row" from "existing row that
  // changed" — both come back in `up`. Marking a notification read (the
  // *only* way an existing notification ever changes here — see markAll()
  // and the per-row "Mark read" button in communication.tsx) was being
  // treated exactly like creating a new one: notify_users() got called
  // again with the same title/body, which just inserts a duplicate
  // notification. The "read" flag itself was never actually sent to the
  // server at all, on top of that. Split by whether an old copy existed.
  const { up } = diff(oldDB.notifications, newDB.notifications);
  const created = up.filter((n) => !oldDB.notifications.some((o) => o.id === n.id));
  const nowRead = up.filter((n) => {
    const o = oldDB.notifications.find((x) => x.id === n.id);
    return o && !o.read && n.read;
  });

  for (const n of created) {
    const { error } = await sb()!.rpc("notify_users", { p_ids: [n.userId], p_type: n.type, p_title: n.title, p_body: n.body });
    if (error) errors.push(`notifications: ${error.message}`);
  }
  if (nowRead.length) {
    const { error } = await sb()!.rpc("mark_notifications_read", { p_ids: nowRead.map((n) => n.id) });
    if (error) errors.push(`marking notifications read: ${error.message}`);
  }
}
'''
new_notif = '''async function syncNotifications(oldDB: DB, newDB: DB, errors: string[]) {
  // notifications has no direct insert policy by design — it's written only
  // via notify_users(), a SECURITY DEFINER RPC that enforces who's allowed
  // to notify whom (admins can notify anyone; everyone else only people
  // they're actually allowed to message).
  //
  // Keep creation, read-state changes, and deletion separate. A deletion is
  // a real server-side change now handled by delete_notification()/clear_notifications(),
  // while mark_notifications_read() handles the existing read transition.
  const { up, del } = diff(oldDB.notifications, newDB.notifications);
  const created = up.filter((n) => !oldDB.notifications.some((o) => o.id === n.id));
  const nowRead = up.filter((n) => {
    const o = oldDB.notifications.find((x) => x.id === n.id);
    return o && !o.read && n.read;
  });

  for (const n of created) {
    const { error } = await sb()!.rpc("notify_users", { p_ids: [n.userId], p_type: n.type, p_title: n.title, p_body: n.body });
    if (error) errors.push(`notifications: ${error.message}`);
  }
  if (nowRead.length) {
    const { error } = await sb()!.rpc("mark_notifications_read", { p_ids: nowRead.map((n) => n.id) });
    if (error) errors.push(`marking notifications read: ${error.message}`);
  }
  for (const n of del) {
    const { error } = await sb()!.rpc("delete_notification", { p_notification_id: n.id });
    if (error) errors.push(`deleting notification: ${error.message}`);
  }
}
'''
assert old_notif in s, 'syncNotifications block not found'
s = s.replace(old_notif, new_notif)

# Make the notification mapper deterministic even before rbac selector sorting.
old_map = '''function mapNotifications(notifications: any[]): AppNotification[] {
  return notifications.map((n: any) => ({
    id: n.id, userId: n.profile_id, type: n.type, title: n.title, body: n.body, at: n.created_at, read: n.is_read,
  })) as AppNotification[];
}
'''
new_map = '''function mapNotifications(notifications: any[]): AppNotification[] {
  return [...notifications]
    .sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .map((n: any) => ({
      id: n.id, userId: n.profile_id, type: n.type, title: n.title, body: n.body, at: n.created_at, read: n.is_read,
    })) as AppNotification[];
}
'''
assert old_map in s, 'mapNotifications block not found'
s = s.replace(old_map, new_map)
p.write_text(s)

# 3) Communication UI: clear/delete notifications and delete own messages.
p = root / 'src/pages/communication.tsx'
s = p.read_text()

# Insert message deletion handler just after send().
needle = '''  const send = async () => {
    if (!active || !currentUser || !draft.trim()) return;
    const other = active.participants.find((p) => p !== currentUser.id);
    const target = db.users.find((u) => u.id === other);
    const gate = canSendMessage(db, currentUser, target ?? null);
    if (!gate.ok) { toast(gate.reason ?? "Not permitted.", "warn"); return; }
    const body = draft.trim();
    setDraft("");
    const errors = await update((d) => {
      d.messages.push({ id: uid(), conversationId: active.id, senderId: currentUser.id, body, createdAt: new Date().toISOString(), readBy: [currentUser.id], status: "sent" });
      const c = d.conversations.find((x) => x.id === active.id);
      if (c) c.updatedAt = new Date().toISOString();
      // In live mode the database send_message() is the single source of truth
      // for message notifications. Do not also create a local notification here,
      // otherwise the same message appears once from the optimistic client and
      // once again when the server notification arrives.
    });
    if (errors.length) { toast(describeSyncErrors(errors), "warn"); setDraft(body); }
  };

'''
insert = needle + '''  const deleteMessage = async (messageId: string) => {
    if (!currentUser) return;
    const message = db.messages.find((m) => m.id === messageId);
    if (!message || message.senderId !== currentUser.id) return;
    if (!window.confirm("Delete this message?")) return;
    const errors = await update((d) => {
      const idx = d.messages.findIndex((m) => m.id === messageId && m.senderId === currentUser.id);
      if (idx >= 0) d.messages.splice(idx, 1);
    });
    if (errors.length) toast(describeSyncErrors(errors), "warn");
  };

'''
assert needle in s, 'send handler block not found'
s = s.replace(needle, insert)

# Add delete button to own message bubble after message body/time block.
old_bubble_tail = '''                  <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] tnum ${mine ? "text-pine-300" : "text-soft"}`}>
                    {fmtClock(m.createdAt)}
                    {mine && (m.status === "read" ? <CheckCheck className="h-3.5 w-3.5 text-gold-300" /> : <Check className="h-3.5 w-3.5 opacity-80" />)}
                  </p>
                </div>
                {!mine && (
'''
new_bubble_tail = '''                  <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] tnum ${mine ? "text-pine-300" : "text-soft"}`}>
                    {fmtClock(m.createdAt)}
                    {mine && (m.status === "read" ? <CheckCheck className="h-3.5 w-3.5 text-gold-300" /> : <Check className="h-3.5 w-3.5 opacity-80" />)}
                  </p>
                </div>
                {mine && (
                  <button
                    onClick={() => deleteMessage(m.id)}
                    title="Delete message"
                    aria-label="Delete message"
                    className="ml-1.5 self-center rounded-full p-1.5 text-soft transition-colors hover:bg-rust-100 hover:text-rust-600 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {!mine && (
'''
assert old_bubble_tail in s, 'message bubble tail not found'
s = s.replace(old_bubble_tail, new_bubble_tail)

old_notif_page = '''export function NotificationsPage() {
  const { db, currentUser, update } = useApp();
  const groupsLoaded = useLazyGroups("notifications");
  const list = userNotifications(db, currentUser);
  const ICON: Record<string, typeof Bell> = { announcement: Megaphone, message: Inbox, homework: Send, result: ShieldAlert, attendance: CalendarDays, event: CalendarDays, fee: Wallet, fee_payment_request: Wallet, fee_payment_approved: CheckCircle2, fee_payment_rejected: AlertTriangle, fee_payment: Wallet, system: Bell };
  const markAll = () => update((d) => { d.notifications.forEach((n) => { if (n.userId === currentUser?.id) n.read = true; }); });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead kicker="Communication" title="Notifications" sub={`${unreadNotifications(db, currentUser)} unread — system-generated updates about homework, results, attendance and announcements.`}>
        <Btn variant="soft" onClick={markAll}>Mark all read</Btn>
      </PageHead>
      <Panel className="anim-rise overflow-hidden">
        <ul className="divide-y divide-mist/70">
          {!groupsLoaded ? (
            <li className="p-3"><SkeletonPanel rows={4} /></li>
          ) : (
          <>
          {list.map((n) => {
            const I = ICON[n.type] ?? Bell;
            return (
              <li key={n.id} className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${n.read ? "" : "bg-pine-50/60"}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-paper text-soft" : "bg-pine-800 text-pine-50"}`}><I className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] ${n.read ? "font-semibold text-soft" : "font-bold text-ink"}`}>{n.title}</span>
                    <span className="shrink-0 text-[10.5px] text-soft">{timeAgo(n.at)}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-soft">{n.body}</span>
                </span>
                {!n.read && (
                  <button onClick={() => update((d) => { const x = d.notifications.find((y) => y.id === n.id); if (x) x.read = true; })} className="mt-1 shrink-0 cursor-pointer text-[11px] font-bold text-pine-700 hover:underline">Mark read</button>
                )}
              </li>
            );
          })}
          {list.length === 0 && <li><EmptyState icon={<Bell className="h-5 w-5" />} title="All caught up" body="You have no notifications right now." /></li>}
          </>
          )}
        </ul>
      </Panel>
    </div>
  );
}
'''
new_notif_page = '''export function NotificationsPage() {
  const { db, currentUser, update } = useApp();
  const groupsLoaded = useLazyGroups("notifications");
  const list = userNotifications(db, currentUser);
  const ICON: Record<string, typeof Bell> = { announcement: Megaphone, message: Inbox, homework: Send, result: ShieldAlert, attendance: CalendarDays, event: CalendarDays, fee: Wallet, fee_payment_request: Wallet, fee_payment_approved: CheckCircle2, fee_payment_rejected: AlertTriangle, fee_payment: Wallet, system: Bell };
  const markAll = () => update((d) => { d.notifications.forEach((n) => { if (n.userId === currentUser?.id) n.read = true; }); });
  const deleteOne = async (notificationId: string) => {
    if (!window.confirm("Delete this notification?")) return;
    const errors = await update((d) => {
      const idx = d.notifications.findIndex((n) => n.id === notificationId && n.userId === currentUser?.id);
      if (idx >= 0) d.notifications.splice(idx, 1);
    });
    if (errors.length) update(() => {}).then(() => undefined);
  };
  const clearAll = async () => {
    if (!list.length) return;
    if (!window.confirm("Clear all notifications? This removes every notification from your notification center.")) return;
    const errors = await update((d) => {
      d.notifications = d.notifications.filter((n) => n.userId !== currentUser?.id);
    });
    if (errors.length) console.warn("[notifications] clear failed:", errors);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead kicker="Communication" title="Notifications" sub={`${unreadNotifications(db, currentUser)} unread — system-generated updates about homework, results, attendance and announcements.`}>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Btn variant="ghost" onClick={markAll} disabled={!list.some((n) => !n.read)}><CheckCheck className="h-4 w-4" /> Mark all read</Btn>
          <Btn variant="soft" onClick={clearAll} disabled={!list.length}><Trash2 className="h-4 w-4" /> Clear all</Btn>
        </div>
      </PageHead>
      <Panel className="anim-rise overflow-hidden">
        <ul className="divide-y divide-mist/70">
          {!groupsLoaded ? (
            <li className="p-3"><SkeletonPanel rows={4} /></li>
          ) : (
          <>
          {list.map((n) => {
            const I = ICON[n.type] ?? Bell;
            return (
              <li key={n.id} className={`group flex items-start gap-3 px-4 py-3.5 transition-colors ${n.read ? "" : "bg-pine-50/60"}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-paper text-soft" : "bg-pine-800 text-pine-50"}`}><I className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`min-w-0 text-[13px] ${n.read ? "font-semibold text-soft" : "font-bold text-ink"}`}>{n.title}</span>
                    <span className="shrink-0 text-[10.5px] text-soft">{timeAgo(n.at)}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-soft">{n.body}</span>
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-1">
                  {!n.read && (
                    <button onClick={() => update((d) => { const x = d.notifications.find((y) => y.id === n.id); if (x) x.read = true; })} className="cursor-pointer rounded px-1.5 py-1 text-[11px] font-bold text-pine-700 hover:bg-pine-100 hover:underline">Mark read</button>
                  )}
                  <button
                    onClick={() => deleteOne(n.id)}
                    title="Delete notification"
                    aria-label="Delete notification"
                    className="cursor-pointer rounded-full p-1.5 text-soft transition-colors hover:bg-rust-100 hover:text-rust-600 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
          {list.length === 0 && <li><EmptyState icon={<Bell className="h-5 w-5" />} title="All caught up" body="You have no notifications right now." /></li>}
          </>
          )}
        </ul>
      </Panel>
    </div>
  );
}
'''
assert old_notif_page in s, 'NotificationsPage block not found'
s = s.replace(old_notif_page, new_notif_page)
p.write_text(s)

# 4) Update server allowlist for the new RPCs.
p = root / 'api/_lib/allowlist.ts'
s = p.read_text()
needle = '''  mark_notifications_read: {
    read: false,
    args: { p_ids: { type: "string[]", optional: true } },
  },
  mark_message_read: {
'''
replacement = '''  mark_notifications_read: {
    read: false,
    args: { p_ids: { type: "string[]", optional: true } },
  },
  delete_notification: {
    read: false,
    rateLimit: 120,
    args: { p_notification_id: { type: "string", maxLength: 128 } },
  },
  clear_notifications: {
    read: false,
    rateLimit: 30,
    args: {},
  },
  delete_message: {
    read: false,
    rateLimit: 120,
    args: { p_message_id: { type: "string", maxLength: 128 } },
  },
  mark_message_read: {
'''
assert needle in s, 'allowlist notification/message block not found'
p.write_text(s.replace(needle, replacement))

# 5) Backend sync uses clear_notifications when the whole notification set is removed.
p = root / 'src/lib/backend.ts'
s = p.read_text()
old = '''  for (const n of del) {
    const { error } = await sb()!.rpc("delete_notification", { p_notification_id: n.id });
    if (error) errors.push(`deleting notification: ${error.message}`);
  }
}
'''
new = '''  // A full clear-all action can remove many rows at once. Use the dedicated
  // server-side bulk operation so the client never has to issue hundreds of
  // individual RPC calls.
  if (del.length && del.length === oldDB.notifications.filter((n) => n.userId === newDB.notifications[0]?.userId || n.userId === oldDB.notifications[0]?.userId).length) {
    const { error } = await sb()!.rpc("clear_notifications");
    if (error) errors.push(`clearing notifications: ${error.message}`);
  } else {
    for (const n of del) {
      const { error } = await sb()!.rpc("delete_notification", { p_notification_id: n.id });
      if (error) errors.push(`deleting notification: ${error.message}`);
    }
  }
}
'''
assert old in s, 'notification delete tail not found'
s = s.replace(old, new)
p.write_text(s)

# 6) Add local migration.
migration = '''-- Notification/message deletion controls.
-- Users can only delete their own notifications and their own sent messages.
-- The notification bulk clear is scoped to auth.uid(). Message deletion keeps
-- authorization server-side instead of exposing table DELETE access to clients.

create or replace function public.delete_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from public.notifications
   where id = p_notification_id
     and profile_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return jsonb_build_object('id', p_notification_id, 'deleted', deleted_count > 0);
end
$function$;

create or replace function public.clear_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from public.notifications
   where profile_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return jsonb_build_object('deleted', deleted_count);
end
$function$;

create or replace function public.delete_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target public.messages;
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select * into target
    from public.messages
   where id = p_message_id
     and sender_id = auth.uid()
     and public.is_conversation_member(conversation_id);

  if target.id is null then
    raise exception 'message not found or not owned by you';
  end if;

  delete from public.messages where id = target.id;
  get diagnostics deleted_count = row_count;

  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), coalesce(p.full_name, 'School user'), 'message.delete', target.id::text,
         left(target.body, 160)
    from public.profiles p
   where p.id = auth.uid();

  return jsonb_build_object('id', target.id, 'deleted', deleted_count > 0);
end
$function$;

revoke all on function public.delete_notification(uuid) from public, anon, authenticated;
revoke all on function public.clear_notifications() from public, anon, authenticated;
revoke all on function public.delete_message(uuid) from public, anon, authenticated;

grant execute on function public.delete_notification(uuid) to authenticated;
grant execute on function public.clear_notifications() to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
'''
(root / 'supabase/migrations/0053_notification_and_message_delete.sql').write_text(migration)
print('patched')
