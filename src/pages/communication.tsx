import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Bell, CalendarDays, Check, CheckCheck, CheckCircle2, Flag, Inbox, Lock, Megaphone, Paperclip, Search, Send, ShieldAlert, Users, Eye, Trash2, Wallet,
} from "lucide-react";
import { useApp, useLazyGroups, audienceLabel, audienceSize, describeSyncErrors, fmtShort, sectionShort, timeAgo, uid } from "../store";
import { getMessageReportContext, markAnnouncementRead, startConversation } from "../lib/backend";
import {
  canCreateAnnouncement, canManageAnnouncement, canSeeAnnouncement, canSendMessage, canTargetAudience,
  canViewConversation, contactContext, contactGroups, conversationsFor, effectiveAnnouncementStatus,
  findDirectConversation, hasPermission, pushAudit, pushNotifications, totalUnreadMessages,
  unreadInConversation, unreadNotifications, userNotifications, visibleAnnouncements, audienceUserIds,
} from "../rbac";
import type { Announcement, Audience, Conversation, User } from "../types";
import { Btn, Chip, EmptyState, Field, Modal, PageHead, Panel, RoleBadge, Select, SkeletonPanel, SkeletonRows, Tabs, TextArea, TextInput, UserAvatar, tdCls, thCls, useConfirm } from "../ui";
import { AccessDenied } from "./Auth";

/* ================= shared bits ================= */
const CAT_META: Record<string, { bg: string; dot: string }> = {
  Urgent: { bg: "bg-rust-100 text-rust-700 border-rust-200", dot: "bg-rust-500" },
  Academic: { bg: "bg-pine-100 text-pine-800 border-pine-200", dot: "bg-pine-500" },
  Exams: { bg: "bg-steel-100 text-steel-700 border-steel-100", dot: "bg-steel-500" },
  Event: { bg: "bg-gold-100 text-gold-700 border-gold-200", dot: "bg-gold-500" },
  General: { bg: "bg-paper text-soft border-mist", dot: "bg-soft" },
};

function AudiencePicker({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const { db } = useApp();
  const isSection = value.kind === "section-students" || value.kind === "section-guardians";
  const [classId, setClassId] = useState(isSection ? (value as { classId: string }).classId : db.classes[0]?.id ?? "");
  const [sectionId, setSectionId] = useState(isSection ? (value as { sectionId: string }).sectionId : "");
  const cls = db.classes.find((c) => c.id === classId);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Audience" required>
        <Select
          value={value.kind}
          onChange={(e) => {
            const k = e.target.value as Audience["kind"];
            if (k === "section-students" || k === "section-guardians")
              onChange({ kind: k, classId, sectionId: cls?.sections[0]?.id ?? "" });
            else onChange({ kind: k } as Audience);
          }}
        >
          <option value="everyone">Entire school</option>
          <option value="teachers">All teachers</option>
          <option value="students">All students</option>
          <option value="guardians">All families</option>
          <option value="section-students">Class / section — students</option>
          <option value="section-guardians">Class / section — families</option>
        </Select>
      </Field>
      {isSection && (
        <>
          <Field label="Class" required>
            <Select value={classId} onChange={(e) => { setClassId(e.target.value); const c = db.classes.find((x) => x.id === e.target.value); const sid = c?.sections[0]?.id ?? ""; setSectionId(sid); onChange({ kind: value.kind, classId: e.target.value, sectionId: sid } as Audience); }}>
              {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Section" required>
            <Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); onChange({ kind: value.kind, classId, sectionId: e.target.value } as Audience); }}>
              {cls?.sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </Select>
          </Field>
        </>
      )}
      <div className="sm:col-span-3 flex items-center gap-2 text-[12px] text-soft">
        <Users className="h-3.5 w-3.5 text-pine-600" />
        Reaches <strong className="text-ink">{audienceSize(db, value)}</strong> people — {audienceLabel(db, value)}
      </div>
    </div>
  );
}

/* ================= Announcements ================= */
export function AnnouncementsPage() {
  const { db, currentUser, update, toast, refreshGroup } = useApp();
  const groupsLoaded = useLazyGroups("announcements");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);
  const [filter, setFilter] = useState("all");
  const canCreate = canCreateAnnouncement(db, currentUser);
  const canManage = !!currentUser && (currentUser.role === "admin" || hasPermission(db, currentUser, "communication.manage_announcement"));

  const closeModal = () => { setOpen(false); setEditing(null); };

  const visible = visibleAnnouncements(db, currentUser);
  const categoryFilters = useMemo(() => {
    const seen = new Set<string>();
    for (const a of visible) seen.add(a.category);
    return ["all", ...["Urgent", "Academic", "Exams", "Event", "General"].filter((x) => seen.has(x))];
  }, [visible]);

  const list = visible
    .filter((a) => {
      if (canManage) return filter === "all" || (filter === "mine" ? a.senderId === currentUser?.id : effectiveAnnouncementStatus(a) === filter);
      return filter === "all" || a.category === filter;
    })
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt.localeCompare(a.createdAt));

  const saveAnnouncement = (a: Announcement) => {
    update((d) => {
      const i = d.announcements.findIndex((x) => x.id === a.id);
      if (i >= 0) d.announcements[i] = a;
      else d.announcements.unshift(a);
      if (a.status === "published") {
        pushAudit(d, currentUser, "announcement.publish", a.title, audienceLabel(db, a.audience));
        const targets = audienceUserIds(d, a.audience).filter((id) => id !== currentUser?.id);
        pushNotifications(d, targets, "announcement", a.title, a.body.slice(0, 110));
      } else {
        pushAudit(d, currentUser, a.status === "scheduled" ? "announcement.schedule" : "announcement.draft", a.title);
      }
    });
    toast(a.status === "published" ? "Announcement published." : a.status === "scheduled" ? "Announcement scheduled." : "Draft saved.");
    closeModal();
  };

  const archiveAnnouncement = (a: Announcement) => {
    update((d) => {
      const i = d.announcements.findIndex((x) => x.id === a.id);
      if (i >= 0) d.announcements[i] = { ...a, status: "archived" };
      pushAudit(d, currentUser, "announcement.archive", a.title);
    });
    toast("Announcement archived.");
  };

  const restoreAnnouncement = (a: Announcement) => {
    update((d) => {
      const i = d.announcements.findIndex((x) => x.id === a.id);
      if (i >= 0) d.announcements[i] = { ...a, status: "draft" };
      pushAudit(d, currentUser, "announcement.restore", a.title);
    });
    toast("Announcement restored to drafts.");
  };

  const deleteAnnouncement = (a: Announcement) => {
    update((d) => {
      d.announcements = d.announcements.filter((x) => x.id !== a.id);
      pushAudit(d, currentUser, "announcement.delete", a.title);
    });
    toast("Announcement deleted.");
    setConfirmDelete(null);
  };

  const readAnnouncement = useCallback(async (id: string) => {
    if (!currentUser) return;
    const a = db.announcements.find((x) => x.id === id);
    if (!a || effectiveAnnouncementStatus(a) !== "published" || a.readBy?.includes(currentUser.id)) return;
    const result = await markAnnouncementRead(id);
    if ("error" in result) return;
    await refreshGroup("announcements");
  }, [currentUser, db.announcements, refreshGroup]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="Communication" title="Announcements" sub="Official school notices, presented clearly for every audience.">
        {canCreate && <Btn variant="gold" onClick={() => { setEditing(null); setOpen(true); }}><Megaphone className="h-4 w-4" /> New announcement</Btn>}
      </PageHead>

      <div className="mb-5 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          {canManage ? (
            [["all", "All"], ["published", "Published"], ["scheduled", "Scheduled"], ["draft", "Drafts"], ["archived", "Archived"], ["mine", "Mine"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all ${filter === k ? "border-pine-700 bg-pine-800 text-pine-50 shadow-sm" : "border-mist bg-card text-soft hover:border-pine-300 hover:text-ink"}`}>{l}</button>
            ))
          ) : (
            categoryFilters.map((k) => {
              const label = k === "all" ? "All" : k;
              const cm = CAT_META[k] ?? CAT_META.General;
              return <button key={k} onClick={() => setFilter(k)} className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all ${filter === k ? `${cm.bg} shadow-sm` : "border-mist bg-card text-soft hover:border-pine-300 hover:text-ink"}`}>{label}</button>;
            })
          )}
        </div>
      </div>

      <div className="space-y-4">
        {!groupsLoaded ? (
          <SkeletonPanel rows={4} />
        ) : (
        <>
        {list.map((a) => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            db={db}
            currentUser={currentUser}
            canManage={canManageAnnouncement(db, currentUser, a)}
            canTrackRead={!!currentUser && effectiveAnnouncementStatus(a) === "published"}
            onRead={readAnnouncement}
            onEdit={() => { setEditing(a); setOpen(true); }}
            onPublish={() => saveAnnouncement({ ...a, status: "published", publishedAt: new Date().toISOString(), scheduledFor: undefined })}
            onArchive={() => archiveAnnouncement(a)}
            onRestore={() => restoreAnnouncement(a)}
            onDelete={() => setConfirmDelete(a)}
          />
        ))}
        {list.length === 0 && (
          <Panel className="border-dashed"><EmptyState icon={<Megaphone className="h-5 w-5" />} title="No announcements here" body="Announcements for your audience will appear on this board." /></Panel>
        )}
        </>
        )}
      </div>

      {open && <AnnouncementModal announcement={editing} onClose={closeModal} onSave={saveAnnouncement} />}
      {confirmDelete && (
        <Modal title="Delete this announcement?" kicker={confirmDelete.title} onClose={() => setConfirmDelete(null)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn><Btn variant="danger" onClick={() => deleteAnnouncement(confirmDelete)}><Trash2 className="h-4 w-4" /> Delete</Btn></>}>
          <p className="text-[13px] text-soft">This removes it permanently, including its read receipts. This can't be undone — archive it instead if you just want it off the active list.</p>
        </Modal>
      )}
    </div>
  );
}

function AnnouncementCard({
  announcement: a, db, currentUser, canManage, canTrackRead, onRead, onEdit, onPublish, onArchive, onRestore, onDelete,
}: {
  announcement: Announcement;
  db: import("../types").DB;
  currentUser: User | null;
  canManage: boolean;
  canTrackRead: boolean;
  onRead: (id: string) => void | Promise<void>;
  onEdit: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const st = effectiveAnnouncementStatus(a);
  const cm = CAT_META[a.category] ?? CAT_META.General;
  const sender = db.users.find((u) => u.id === a.senderId);
  const readCount = a.readBy?.length ?? 0;
  const reach = audienceSize(db, a.audience);
  const alreadyRead = !!currentUser && !!a.readBy?.includes(currentUser.id);

  useEffect(() => {
    if (!canTrackRead || alreadyRead || !ref.current || typeof IntersectionObserver === "undefined") return;
    const node = ref.current;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting) setVisible(true);
    }, { threshold: 0.6 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [a.id, alreadyRead, canTrackRead]);

  useEffect(() => {
    if (!visible || alreadyRead || !canTrackRead) return;
    const timer = window.setTimeout(() => { void onRead(a.id); }, 650);
    return () => window.clearTimeout(timer);
  }, [visible, alreadyRead, canTrackRead, a.id, onRead]);

  return (
    <div ref={ref} className="group relative overflow-hidden rounded-2xl border border-mist bg-card shadow-[0_8px_30px_rgba(30,30,47,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(30,30,47,0.10)]">
      <div className={`h-1 w-full ${cm.dot}`} />
      <div className="p-5 sm:p-6">
        <div className="flex gap-4">
          <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${cm.bg} shadow-sm`}>
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-[17px] font-extrabold tracking-tight text-ink">{a.title}</h3>
                  {a.pinned && <Chip tone="gold">Pinned</Chip>}
                  {canManage && <Chip tone={st === "published" ? "pine" : st === "scheduled" ? "steel" : st === "draft" ? "gray" : "rust"}>{st}</Chip>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-soft">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cm.bg}`}>{a.category}</span>
                  <span>{sender?.name ?? "School administration"}</span>
                  <span>•</span>
                  <span>{st === "scheduled" && a.scheduledFor ? `scheduled ${fmtShort(a.scheduledFor)}` : timeAgo(a.createdAt)}</span>
                </div>
              </div>
              {st === "published" && currentUser && !alreadyRead && !canManage && (
                <span className="rounded-full bg-pine-50 px-2.5 py-1 text-[10.5px] font-bold text-pine-700">New</span>
              )}
            </div>

            <p className="mt-4 whitespace-pre-line text-[13.5px] leading-7 text-soft">{a.body}</p>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-mist/70 pt-3 text-[11px] text-soft">
              <span>For {audienceLabel(db, a.audience)}</span>
              {a.editedAt && <span>Edited {timeAgo(a.editedAt)}</span>}
              {st === "published" && canManage && (
                <span className="flex items-center gap-1 font-semibold text-ink"><Eye className="h-3.5 w-3.5" /> {readCount} / {reach} read</span>
              )}
              {st === "published" && currentUser && !canManage && (
                <span className={alreadyRead ? "font-semibold text-pine-700" : "font-semibold text-soft"}>{alreadyRead ? "Read" : "Unread"}</span>
              )}
            </div>
          </div>

          {canManage && (
            <div className="flex shrink-0 flex-col gap-1.5 opacity-90 transition-opacity group-hover:opacity-100">
              {st !== "archived" && <Btn size="sm" variant="soft" onClick={onEdit} data-edit={a.id}>Edit</Btn>}
              {st !== "published" && st !== "archived" && <Btn size="sm" onClick={onPublish}>Publish</Btn>}
              {st !== "archived" && <Btn size="sm" variant="ghost" onClick={onArchive}>Archive</Btn>}
              {st === "archived" && <Btn size="sm" variant="soft" onClick={onRestore}>Restore</Btn>}
              <Btn size="sm" variant="dangerSoft" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> Delete</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnnouncementModal({ announcement, onClose, onSave }: { announcement?: Announcement | null; onClose: () => void; onSave: (a: Announcement) => void }) {
  const { db, currentUser, toast } = useApp();
  const isEdit = !!announcement;
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [category, setCategory] = useState<string>(announcement?.category ?? "General");
  const [audience, setAudience] = useState<Audience>(announcement?.audience ?? { kind: "everyone" });
  const [mode, setMode] = useState<"publish" | "schedule" | "draft">(
    announcement?.status === "scheduled" ? "schedule" : announcement?.status === "draft" ? "draft" : "publish"
  );
  const [when, setWhen] = useState(announcement?.scheduledFor ?? "");

  const submit = () => {
    if (!title.trim() || !body.trim()) { toast("Add a title and a message.", "warn"); return; }
    const gate = canTargetAudience(db, currentUser, audience);
    if (!gate.ok) { toast(gate.reason ?? "Not permitted for that audience.", "warn"); return; }
    const now = new Date().toISOString();
    const status: Announcement["status"] = mode === "publish" ? "published" : mode === "schedule" ? "scheduled" : "draft";
    const prevEditedAt = announcement ? announcement.editedAt : undefined;
    const prevPublishedAt = announcement ? announcement.publishedAt : undefined;
    const base: Announcement = {
      id: announcement?.id ?? uid(),
      senderId: announcement?.senderId ?? currentUser?.id ?? "",
      createdAt: announcement?.createdAt ?? now,
      readBy: announcement?.readBy ?? [],
      pinned: announcement?.pinned,
      title: title.trim(), body: body.trim(), category: category as Announcement["category"],
      audience, status,
      publishedAt: mode === "publish" ? (prevPublishedAt ?? now) : prevPublishedAt,
      scheduledFor: mode === "schedule" ? when || undefined : undefined,
      editedAt: isEdit ? now : prevEditedAt,
    };
    if (mode === "schedule" && !base.scheduledFor) { toast("Pick a date and time to schedule.", "warn"); return; }
    onSave(base);
  };

  return (
    <Modal title={isEdit ? "Edit announcement" : "New announcement"} kicker="One-to-many" onClose={onClose} wide
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>{isEdit ? "Save changes" : mode === "publish" ? "Publish now" : mode === "schedule" ? "Schedule" : "Save draft"}</Btn></>}>
      <div className="grid gap-4">
        <Field label="Title" required><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. School closed tomorrow" /></Field>
        <Field label="Message" required><TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the announcement…" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {["General", "Urgent", "Academic", "Exams", "Event"].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Send as">
            <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="publish">Publish now</option>
              <option value="schedule">Schedule for later</option>
              <option value="draft">Save as draft</option>
            </Select>
          </Field>
        </div>
        {mode === "schedule" && (
          <Field label="Publish at" required><TextInput type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        )}
        <AudiencePicker value={audience} onChange={setAudience} />
      </div>
    </Modal>
  );
}

/* ================= Messages (inbox + thread) ================= */
/** "Today" / "Yesterday" / "14 March 2026" — Telegram-style date divider label. */
function dateDividerLabel(day: string): string {
  const d = new Date(day + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yest.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}
const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function MessagesPage() {
  const { db, currentUser, update, toast, onlineUserIds } = useApp();
  const groupsLoaded = useLazyGroups("messaging");
  const { id } = useParams();
  const nav = useNavigate();
  const [composeWith, setComposeWith] = useState<User | null>(null);
  const [reportMsg, setReportMsg] = useState<{ conv: Conversation; messageId: string } | null>(null);
  const [pressedMessageId, setPressedMessageId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState("");
  const [inboxQuery, setInboxQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const beginLongPress = (messageId: string, isMine: boolean) => {
    cancelLongPress();
    if (isMine) return;
    longPressTimer.current = setTimeout(() => {
      setPressedMessageId(messageId);
      longPressTimer.current = null;
    }, 550);
  };
  useEffect(() => () => cancelLongPress(), []);

  const convs = conversationsFor(db, currentUser);
  const active = id ? db.conversations.find((c) => c.id === id) : undefined;

  const messages = active ? db.messages.filter((m) => m.conversationId === active.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];

  // Mark incoming messages read when the conversation is opened (also fires
  // live as new messages stream in via realtime while it's already open).
  useEffect(() => {
    if (!active || !currentUser) return;
    const unread = db.messages.some((m) => m.conversationId === active.id && m.senderId !== currentUser.id && !m.readBy.includes(currentUser.id));
    if (unread) {
      update((d) => {
        d.messages.forEach((m) => {
          if (m.conversationId === active.id && m.senderId !== currentUser.id && !m.readBy.includes(currentUser.id)) {
            m.readBy.push(currentUser.id);
            m.status = "read";
          }
        });
      });
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, messages.length]);

  // On phones, the open thread takes over the whole screen (see below) —
  // lock the page underneath so it can't be scrolled behind it, Telegram-style.
  useEffect(() => {
    if (!active || !window.matchMedia("(max-width: 1023px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active?.id]);

  // Deep-link protection: verify membership + permission before rendering a conversation.
  // Keep this return AFTER all hooks so React sees the same hook order on every render.
  if (id && (!active || !canViewConversation(db, currentUser, id))) {
    return <AccessDenied required="Conversation access" reason="You don't have permission to access this conversation. It may involve people you aren't connected to." />;
  }

  const openDirect = async (target: User) => {
    if (!currentUser) return;
    const gate = canSendMessage(db, currentUser, target);
    if (!gate.ok) { toast(gate.reason ?? "Not permitted.", "warn"); return; }
    const existing = findDirectConversation(db, currentUser.id, target.id);
    if (existing) { nav(`/messages/${existing.id}`); return; }

    // Ask the server to actually create (or find) this conversation and
    // wait for the real id back, rather than inventing a local one and
    // navigating there optimistically — see startConversation()'s comment
    // in lib/backend.ts for why that silently broke.
    const result = await startConversation(target.id);
    if ("error" in result) { toast(result.error || "Couldn't start that conversation.", "warn"); return; }
    const cid = result.conversationId;
    await update((d) => {
      if (!d.conversations.some((c) => c.id === cid)) {
        d.conversations.unshift({ id: cid, type: "direct", participants: [currentUser.id, target.id], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "active" });
      }
      pushAudit(d, currentUser, "conversation.open", target.name);
    });
    nav(`/messages/${cid}`);
  };

  const send = async () => {
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

  const deleteMessage = async (messageId: string) => {
    if (!currentUser) return;
    const message = db.messages.find((m) => m.id === messageId);
    if (!message || message.senderId !== currentUser.id) return;
    const confirmed = await confirm({
      title: "Delete this message?",
      body: "This message will be removed from the conversation. This action cannot be undone.",
      confirmLabel: "Delete message",
      variant: "danger",
    });
    if (!confirmed) return;
    const errors = await update((d) => {
      const idx = d.messages.findIndex((m) => m.id === messageId && m.senderId === currentUser.id);
      if (idx >= 0) d.messages.splice(idx, 1);
    });
    if (errors.length) toast(describeSyncErrors(errors), "warn");
  };

  const other = active ? db.users.find((u) => u.id === active.participants.find((p) => p !== currentUser?.id)) : undefined;
  const relatedStudent = active?.relatedStudentId ? db.students.find((s) => s.id === active.relatedStudentId) : undefined;
  const otherOnline = other ? onlineUserIds.has(other.id) : false;

  const filteredConvs = convs.filter((c) => {
    if (!inboxQuery.trim()) return true;
    const peer = db.users.find((u) => u.id === c.participants.find((p) => p !== currentUser?.id));
    return (peer?.name ?? "").toLowerCase().includes(inboxQuery.trim().toLowerCase());
  });

  // Rows for the thread: date dividers inserted between days, and
  // consecutive same-sender messages "grouped" (tighter spacing, name/avatar
  // shown once) the way Telegram groups a quick back-to-back burst.
  const threadRows: Array<{ kind: "date"; key: string; label: string } | { kind: "msg"; key: string; m: (typeof messages)[number]; grouped: boolean }> = [];
  {
    let lastDay = "";
    let lastSender = "";
    for (const m of messages) {
      const day = m.createdAt.slice(0, 10);
      if (day !== lastDay) {
        threadRows.push({ kind: "date", key: `d-${day}`, label: dateDividerLabel(day) });
        lastDay = day;
        lastSender = "";
      }
      threadRows.push({ kind: "msg", key: m.id, m, grouped: m.senderId === lastSender });
      lastSender = m.senderId;
    }
  }

  const threadHeader = active && (
    <div className="flex shrink-0 items-center gap-3 border-b border-mist bg-card/95 px-4 py-3 backdrop-blur-sm">
      <button onClick={() => nav("/messages")} className="cursor-pointer rounded-full p-1.5 text-soft transition-colors hover:bg-paper lg:hidden" aria-label="Back to inbox">
        <ArrowLeft className="h-4.5 w-4.5" />
      </button>
      <div className="relative shrink-0">
        <UserAvatar name={other?.name ?? "?"} role={other?.role ?? "admin"} size={40} />
        {otherOnline && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-pine-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold leading-tight text-ink">{other?.name}</p>
        <p className={`truncate text-[11.5px] leading-tight ${otherOnline ? "font-semibold text-pine-600" : "text-soft"}`}>
          {otherOnline ? "online" : (other && contactContext(db, currentUser, other))}
          {relatedStudent && ` · about ${relatedStudent.firstName} ${relatedStudent.lastName}`}
        </p>
      </div>
      {other && <RoleBadge role={other.role} full />}
    </div>
  );

  const threadBody = (
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-paper/50 px-3 py-4 sm:px-4">
      {threadRows.map((row) =>
        row.kind === "date" ? (
          <div key={row.key} className="my-3 flex items-center justify-center first:mt-0">
            <span className="rounded-full border border-mist bg-card/90 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-soft shadow-sm">{row.label}</span>
          </div>
        ) : (
          (() => {
            const m = row.m;
            const mine = m.senderId === currentUser?.id;
            const sender = db.users.find((u) => u.id === m.senderId);
            return (
              <div key={row.key} className={`group flex ${mine ? "justify-end" : "justify-start"} ${row.grouped ? "mt-0.5" : "mt-3"}`}>
                <div
                  onPointerDown={() => beginLongPress(m.id, mine)}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`anim-bubble max-w-[82%] rounded-2xl border px-3.5 py-2 shadow-sm sm:max-w-[72%] select-text ${
                    mine ? `chat-tail-mine border-pine-800 bg-pine-800 text-pine-50 ${row.grouped ? "rounded-br-2xl" : ""}` : `chat-tail-theirs border-mist bg-card text-ink ${row.grouped ? "rounded-bl-2xl" : ""}`
                  } ${pressedMessageId === m.id ? "ring-2 ring-rust-300 ring-offset-1" : ""}`}
                >
                  {!mine && !row.grouped && <p className="mb-0.5 text-[10.5px] font-bold text-pine-700">{sender?.name}</p>}
                  <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{m.body}</p>
                  <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] tnum ${mine ? "text-pine-300" : "text-soft"}`}>
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
                  <button
                    onClick={() => { cancelLongPress(); setPressedMessageId(null); if (active) setReportMsg({ conv: active, messageId: m.id }); }}
                    title="Report message"
                    aria-label="Report message"
                    className={`ml-1.5 self-center rounded p-1 text-soft transition-all hover:bg-rust-100 hover:text-rust-600 ${pressedMessageId === m.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })()
        )
      )}
      {messages.length === 0 && <p className="pt-16 text-center text-[12.5px] text-soft">Say hello — messages stay private to this conversation.</p>}
    </div>
  );

  const threadInput = active && (
    <div className="shrink-0 border-t border-mist bg-card px-3 py-3 sm:px-4" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      {canSendMessage(db, currentUser, other ?? null).ok ? (
        <div className="flex items-end gap-2">
          <button className="mb-1 hidden shrink-0 cursor-pointer rounded-full p-2 text-soft transition-colors hover:bg-paper hover:text-pine-700 sm:flex" title="Attach (coming soon)" disabled>
            <Paperclip className="h-4.5 w-4.5" />
          </button>
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message…"
            className="!min-h-[42px] flex-1 !rounded-2xl !py-2.5"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Btn onClick={send} disabled={!draft.trim()} className="!rounded-full !p-0" size="md" style={{ width: 40, height: 40 }}>
            <Send className="h-4 w-4" />
          </Btn>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[12.5px] text-soft"><Lock className="h-4 w-4 text-rust-500" /> {canSendMessage(db, currentUser, other ?? null).reason ?? "You can't message this person."}</p>
      )}
    </div>
  );

  const threadEmpty = !groupsLoaded ? (
    <SkeletonPanel rows={5} />
  ) : (
    <EmptyState icon={<Inbox className="h-5 w-5" />} title="Select a conversation" body="Pick a conversation from the inbox, or start a new one with someone you're connected to." />
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead kicker="Communication" title="Messages" sub={`Direct conversations, limited to people you're actually connected to. ${totalUnreadMessages(db, currentUser)} unread.`}>
        <Btn variant="gold" onClick={() => setComposeWith(currentUser ?? null)}><Send className="h-4 w-4" /> New message</Btn>
      </PageHead>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* conversation list — hidden on phones once a chat is open full-screen */}
        <Panel className={`anim-rise h-fit overflow-hidden ${active ? "hidden lg:block" : ""}`}>
          <div className="border-b border-mist bg-paper/60 px-4 py-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-soft">Inbox</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-soft" />
              <input
                value={inboxQuery}
                onChange={(e) => setInboxQuery(e.target.value)}
                placeholder="Search chats…"
                className="w-full rounded-full border border-mist bg-card py-1.5 pl-8 pr-3 text-[12.5px] text-ink outline-none transition-shadow placeholder:text-soft/60 focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20"
              />
            </div>
          </div>
          <ul className="max-h-[600px] divide-y divide-mist/70 overflow-y-auto">
            {!groupsLoaded ? (
              <li className="p-3"><SkeletonPanel rows={4} /></li>
            ) : (
            <>
            {filteredConvs.map((c) => {
              const peer = db.users.find((u) => u.id === c.participants.find((p) => p !== currentUser?.id));
              const last = [...db.messages.filter((m) => m.conversationId === c.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              const un = unreadInConversation(db, currentUser, c);
              const peerOnline = peer ? onlineUserIds.has(peer.id) : false;
              return (
                <li key={c.id}>
                  <button onClick={() => nav(`/messages/${c.id}`)} className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-pine-50/60 ${active?.id === c.id ? "bg-pine-50" : ""}`}>
                    <span className="relative shrink-0">
                      <UserAvatar name={peer?.name ?? "?"} role={peer?.role ?? "admin"} size={40} />
                      {peerOnline && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-pine-500" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between">
                        <span className={`truncate text-[13.5px] ${un ? "font-bold text-ink" : "font-semibold text-ink"}`}>{peer?.name ?? "—"}</span>
                        {last && <span className="ml-2 shrink-0 tnum text-[10.5px] text-soft">{timeAgo(last.createdAt)}</span>}
                      </span>
                      <span className={`block truncate text-[11.5px] ${un ? "font-semibold text-pine-800" : "text-soft"}`}>{last ? last.body : "No messages yet"}</span>
                    </span>
                    {un > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-pine-700 px-1.5 font-mono text-[10px] font-bold text-white">{un}</span>}
                  </button>
                </li>
              );
            })}
            {filteredConvs.length === 0 && (
              <li className="px-4 py-10 text-center text-[12.5px] text-soft">{convs.length === 0 ? "No conversations yet." : "No chats match your search."}</li>
            )}
            </>
            )}
          </ul>
        </Panel>

        {/* thread — a normal panel on desktop; on phones it becomes its own
           full-screen view (fixed, above everything) the instant a chat is
           opened, exactly like Telegram, instead of stacking under the inbox. */}
        <div
          className={
            active
              ? "anim-chat-screen fixed inset-0 z-[60] flex flex-col bg-card lg:static lg:z-auto lg:flex lg:min-h-[600px] lg:animate-none lg:overflow-hidden lg:rounded-xl lg:border lg:border-mist lg:shadow-[0_1px_2px_rgba(13,33,26,0.05)]"
              : "hidden lg:flex lg:min-h-[600px] lg:flex-col lg:overflow-hidden lg:rounded-xl lg:border lg:border-mist lg:bg-card lg:shadow-[0_1px_2px_rgba(13,33,26,0.05)]"
          }
        >
          {!active ? threadEmpty : (
            <>
              {threadHeader}
              {threadBody}
              {threadInput}
            </>
          )}
        </div>
      </div>

      {composeWith && <ContactPicker onClose={() => setComposeWith(null)} onPick={(u) => { setComposeWith(null); openDirect(u); }} />}
      {reportMsg && <ReportModal onClose={() => setReportMsg(null)} conv={reportMsg.conv} messageId={reportMsg.messageId} />}
    </div>
  );
}

function ContactPicker({ onClose, onPick }: { onClose: () => void; onPick: (u: User) => void }) {
  const { db, currentUser } = useApp();
  const [q, setQ] = useState("");
  const groups = useMemo(() => contactGroups(db, currentUser), [db, currentUser]);
  return (
    <Modal title="Start a conversation" kicker="Only people you're connected to" onClose={onClose}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soft" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search authorized contacts…" className="!pl-9" />
      </div>
      <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
        {groups.map((g) => {
          const users = g.users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
          if (!users.length) return null;
          return (
            <div key={g.label}>
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-soft">{g.label}</p>
              <ul className="space-y-1">
                {users.map((u) => (
                  <li key={u.id}>
                    <button onClick={() => onPick(u)} className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-mist bg-card px-3 py-2 text-left transition-all hover:border-pine-400 hover:bg-pine-50">
                      <UserAvatar name={u.name} role={u.role} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink">{u.name}</span>
                        <span className="block truncate text-[11px] text-soft">{contactContext(db, currentUser, u)}</span>
                      </span>
                      <RoleBadge role={u.role} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {groups.every((g) => !g.users.some((u) => u.name.toLowerCase().includes(q.toLowerCase()))) && (
          <p className="py-8 text-center text-[12.5px] text-soft">No matching authorized users found.</p>
        )}
      </div>
    </Modal>
  );
}

function ReportModal({ onClose, conv, messageId }: { onClose: () => void; conv: Conversation; messageId: string }) {
  const { db, currentUser, update, toast } = useApp();
  const [reason, setReason] = useState("Inappropriate content");
  const [detail, setDetail] = useState("");
  const reportedUser = db.users.find((u) => u.id === db.messages.find((m) => m.id === messageId)?.senderId);
  const submit = async () => {
    const errors = await update((d) => {
      const reportedUserId = db.messages.find((m) => m.id === messageId)?.senderId;
      d.reports.unshift({ id: uid(), messageId, conversationId: conv.id, reporterId: currentUser?.id ?? "", reportedUserId, reason, detail: detail.trim() || undefined, at: new Date().toISOString(), status: "open" });
      pushAudit(d, currentUser, "message.report", reason);
    });
    if (errors.length) { toast(describeSyncErrors(errors), "warn"); return; }
    toast("Report submitted to moderators.");
    onClose();
  };
  return (
    <Modal title="Report message" kicker="Goes to authorized moderators" onClose={onClose} zClass="z-[90]"
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={submit}><Flag className="h-4 w-4" /> Submit report</Btn></>}>
      <div className="mb-3 rounded-xl border border-rust-200 bg-rust-50 px-3 py-2.5 text-[12px]">
        <span className="font-semibold text-rust-800">Reporting:</span>{" "}
        <span className="font-bold text-ink">{reportedUser?.name ?? "Unknown user"}</span>
      </div>
      <Field label="Reason" required>
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {["Inappropriate content", "Harassment", "Spam", "Other"].map((r) => <option key={r}>{r}</option>)}
        </Select>
      </Field>
      <div className="mt-3">
        <Field label="Details"><TextArea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Optional context…" /></Field>
      </div>
    </Modal>
  );
}

/* ================= Notifications ================= */
export function NotificationsPage() {
  const { db, currentUser, update, toast, isGroupLoaded } = useApp();
  const confirm = useConfirm();
  const nav = useNavigate();
  const groupsLoaded = isGroupLoaded("notifications");
  const list = userNotifications(db, currentUser);
  const notificationDestination = (n: import("../types").AppNotification) => {
    if (n.targetRoute) return n.targetRoute;
    const role = currentUser?.role;
    if (n.type === "message") {
      if (n.targetId) return `/messages/${n.targetId}`;
      const title = n.title.toLowerCase();
      const senderName = title.endsWith(" sent you a message") ? title.slice(0, -" sent you a message".length) : "";
      const peer = db.users.find((u) => u.id !== currentUser?.id && u.name.toLowerCase() === senderName);
      const conv = peer ? db.conversations.find((c) => c.participants.includes(currentUser?.id ?? "") && c.participants.includes(peer.id)) : undefined;
      return conv ? `/messages/${conv.id}` : "/messages";
    }
    if (n.type === "announcement") return "/announcements";
    if (n.type === "event") return "/events";
    if (n.type === "homework") return role === "admin" ? "/admin/homework" : role === "teacher" ? "/teacher/homework" : role === "guardian" ? "/guardian/homework" : "/student/homework";
    if (n.type === "attendance") return role === "admin" || role === "teacher" ? "/admin/attendance" : role === "guardian" ? "/guardian/attendance" : "/student/attendance";
    if (n.type === "result") return role === "admin" || role === "teacher" ? "/admin/reports" : role === "guardian" ? "/guardian/grades" : "/student/grades";
    if (["fee", "fee_payment", "fee_payment_request", "fee_payment_approved", "fee_payment_rejected"].includes(n.type)) return role === "admin" ? "/admin/fees" : "/guardian/fees";
    return null;
  };
  const openNotification = (n: import("../types").AppNotification) => {
    if (!n.read) void update((d) => { const x = d.notifications.find((y) => y.id === n.id); if (x) x.read = true; });
    const destination = notificationDestination(n);
    if (destination) nav(destination);
  };
  const ICON: Record<string, typeof Bell> = { announcement: Megaphone, message: Inbox, homework: Send, result: ShieldAlert, attendance: CalendarDays, event: CalendarDays, fee: Wallet, fee_payment_request: Wallet, fee_payment_approved: CheckCircle2, fee_payment_rejected: AlertTriangle, fee_payment: Wallet, system: Bell };
  const markAll = () => update((d) => { d.notifications.forEach((n) => { if (n.userId === currentUser?.id) n.read = true; }); });
  const deleteOne = async (notificationId: string) => {
    const confirmed = await confirm({
      title: "Delete this notification?",
      body: "This notification will be removed from your notification center.",
      confirmLabel: "Delete notification",
      variant: "danger",
    });
    if (!confirmed) return;
    const errors = await update((d) => {
      const idx = d.notifications.findIndex((n) => n.id === notificationId && n.userId === currentUser?.id);
      if (idx >= 0) d.notifications.splice(idx, 1);
    });
    if (errors.length) toast(describeSyncErrors(errors), "warn");
  };
  const clearAll = async () => {
    if (!list.length) return;
    const confirmed = await confirm({
      title: "Clear all notifications?",
      body: "Every notification in your notification center will be removed. This action cannot be undone.",
      confirmLabel: "Clear all",
      variant: "danger",
    });
    if (!confirmed) return;
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
                <button onClick={() => openNotification(n)} className="min-w-0 flex-1 cursor-pointer text-left">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`min-w-0 text-[13px] ${n.read ? "font-semibold text-soft" : "font-bold text-ink"}`}>{n.title}</span>
                    <span className="shrink-0 text-[10.5px] text-soft">{timeAgo(n.at)}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-soft">{n.body}</span>
                </button>
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

/* ================= Events ================= */
export function EventsPage() {
  const { db, currentUser, update, toast } = useApp();
  const groupsLoaded = useLazyGroups("events");
  const [open, setOpen] = useState(false);
  const canManage = hasPermission(db, currentUser, "events.manage");
  const visible = db.events
    .filter((e) => audienceSize(db, e.audience) >= 0 && (canManage || e.audience.kind === "everyone" || true))
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead kicker="Communication" title="School calendar" sub="Upcoming events and key dates.">
        {canManage && <Btn variant="gold" onClick={() => setOpen(true)}><CalendarDays className="h-4 w-4" /> Add event</Btn>}
      </PageHead>
      <Panel className="anim-rise overflow-hidden">
        <ul className="divide-y divide-mist/70">
          {!groupsLoaded ? (
            <li className="p-3"><SkeletonPanel rows={4} /></li>
          ) : (
          <>
          {visible.map((e) => {
            const cm = CAT_META[e.category] ?? CAT_META.General;
            const d = new Date(e.date + "T00:00:00");
            return (
              <li key={e.id} className="flex items-center gap-4 px-4 py-3.5">
                <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-mist bg-paper">
                  <span className="font-display text-[16px] font-extrabold leading-none text-ink">{d.getDate()}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-soft">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-bold text-ink">{e.title}</span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cm.bg}`}>{e.category}</span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-soft">{e.time ? `${e.time} · ` : ""}{e.location ? `${e.location} · ` : ""}{audienceLabel(db, e.audience)}</span>
                </span>
              </li>
            );
          })}
          {visible.length === 0 && <li><EmptyState icon={<CalendarDays className="h-5 w-5" />} title="No events scheduled" body="The calendar is clear." /></li>}
          </>
          )}
        </ul>
      </Panel>
      {open && <EventModal onClose={() => setOpen(false)} onSave={(ev) => { update((d) => { d.events.push(ev); pushAudit(d, currentUser, "event.create", ev.title); }); toast("Event added."); setOpen(false); }} />}
    </div>
  );
}

function EventModal({ onClose, onSave }: { onClose: () => void; onSave: (e: import("../types").SchoolEvent) => void }) {
  const { db, currentUser, toast } = useApp();
  const [f, setF] = useState({ title: "", date: "", time: "", location: "", category: "Event", description: "" });
  const [audience, setAudience] = useState<Audience>({ kind: "everyone" });
  return (
    <Modal title="Add event" kicker="School calendar" onClose={onClose} wide
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={() => {
        if (!f.title.trim() || !f.date) { toast("Title and date are required.", "warn"); return; }
        onSave({ id: uid(), title: f.title.trim(), date: f.date, time: f.time || undefined, location: f.location || undefined, category: f.category as import("../types").NoticeCategory, audience, createdBy: currentUser?.id ?? "", description: f.description || undefined });
      }}>Save event</Btn></>}>
      <div className="grid gap-4">
        <Field label="Title" required><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" required><TextInput type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Time"><TextInput type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          <Field label="Location"><TextInput value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["Event", "Exams", "Academic", "General", "Urgent"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Description"><TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <AudiencePicker value={audience} onChange={setAudience} />
      </div>
    </Modal>
  );
}

/* ================= Moderation (for communication.moderate) ================= */
function ModerationConversationModal({
  onClose,
  report,
}: {
  onClose: () => void;
  report: import("../types").MessageReport;
}) {
  const { db, toast } = useApp();
  const [context, setContext] = useState<Awaited<ReturnType<typeof getMessageReportContext>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getMessageReportContext(report.id).then((result) => {
      if (cancelled) return;
      setContext(result);
      if (result && "error" in result) toast(result.error, "warn");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [report.id, toast]);

  const fallbackReported = db.users.find((u) => u.id === (report.reportedUserId ?? db.messages.find((m) => m.id === report.messageId)?.senderId));
  const reportedUser = context && !("error" in context) ? context.reportedUser : fallbackReported ? { id: fallbackReported.id, name: fallbackReported.name, role: fallbackReported.role } : null;
  const reporter = context && !("error" in context) ? context.reporter : db.users.find((u) => u.id === report.reporterId) ?? null;
  const messages = context && !("error" in context) ? context.messages : db.messages
    .filter((m) => m.conversationId === report.conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ id: m.id, senderId: m.senderId, senderName: db.users.find((u) => u.id === m.senderId)?.name, senderRole: db.users.find((u) => u.id === m.senderId)?.role, body: m.body, createdAt: m.createdAt, readBy: m.readBy, isReported: m.id === report.messageId }));

  return (
    <Modal
      title="Reported conversation"
      kicker={reportedUser ? `Reported user · ${reportedUser.name}` : "Reported conversation"}
      onClose={onClose}
      wide
      footer={<Btn variant="ghost" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Close</Btn>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-mist bg-paper/60 px-3 py-2 text-[12px]">
        <span className="font-semibold text-ink">Reported by:</span>
        <span className="text-soft">{reporter?.name ?? "Unknown user"}</span>
        <span className="h-1 w-1 rounded-full bg-soft" />
        <span className="font-semibold text-ink">Reported:</span>
        <span className="text-soft">{reportedUser?.name ?? "Unknown user"}</span>
        {context && !("error" in context) && context.conversation?.status === "hidden" && <Chip tone="rust">Conversation hidden</Chip>}
      </div>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-xl border border-mist bg-paper/40 p-3">
        {loading ? <SkeletonPanel rows={7} /> : (
          <>
            {messages.map((m) => (
              <div key={m.id} className={`rounded-xl border px-3 py-2.5 ${m.isReported ? "border-rust-300 bg-rust-50" : "border-mist bg-card"}`}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-ink">{m.senderName ?? "Unknown user"}</span>
                  <span className="text-[10px] text-soft">{timeAgo(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink">{m.body}</p>
                {m.isReported && <div className="mt-2"><Chip tone="rust"><Flag className="h-3 w-3" /> Reported message</Chip></div>}
              </div>
            ))}
            {messages.length === 0 && <div className="py-8 text-center text-[12px] text-soft">No messages are available for this conversation.</div>}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ModerationPage() {
  const { db, currentUser, update, toast } = useApp();
  const groupsLoaded = useLazyGroups("reports");
  const [openReport, setOpenReport] = useState<import("../types").MessageReport | null>(null);
  if (!hasPermission(db, currentUser, "communication.moderate")) {
    return <AccessDenied required="communication.moderate" reason="Only authorized moderators can review reported communication." />;
  }
  const reports = [...db.reports].sort((a, b) => b.at.localeCompare(a.at));
  const resolve = async (id: string, status: "resolved" | "dismissed") => {
    const errors = await update((d) => {
      const r = d.reports.find((x) => x.id === id);
      if (r) r.status = status;
      pushAudit(d, currentUser, `report.${status}`, id);
    });
    if (errors.length) {
      toast(describeSyncErrors(errors), "warn");
      return;
    }
    toast(status === "resolved" ? "Report resolved." : "Report dismissed.");
  };
  const hideConversation = async (convId: string) => {
    const errors = await update((d) => {
      const c = d.conversations.find((x) => x.id === convId);
      if (c) c.status = "hidden";
      pushAudit(d, currentUser, "conversation.hide", convId);
    });
    if (errors.length) toast(describeSyncErrors(errors), "warn");
    else toast("Conversation hidden from participants.");
  };
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <PageHead kicker="Communication" title="Moderation" sub="Review reported messages, see who was reported, and inspect the full conversation." />
        <Panel className="anim-rise overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-mist bg-paper/60">
                <tr>
                  <th className={thCls()}>Reported user</th>
                  <th className={thCls()}>Reported message</th>
                  <th className={thCls()}>Reason</th>
                  <th className={thCls()}>Reported by</th>
                  <th className={thCls()}>Status</th>
                  <th className={thCls()}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist/70">
                {!groupsLoaded ? (
                  <SkeletonRows rows={4} cols={6} />
                ) : (
                <>
                  {reports.map((r) => {
                    const msg = db.messages.find((m) => m.id === r.messageId);
                    const reporter = db.users.find((u) => u.id === r.reporterId);
                    const reportedUser = db.users.find((u) => u.id === (r.reportedUserId ?? msg?.senderId));
                    return (
                      <tr key={r.id} className="align-top">
                        <td className={`${tdCls()} min-w-[160px]`}>
                          <div className="flex items-center gap-2">
                            <UserAvatar name={reportedUser?.name ?? "Unknown user"} role={reportedUser?.role ?? "student"} size={30} />
                            <div className="min-w-0">
                              <div className="truncate font-bold text-ink">{reportedUser?.name ?? "Unknown user"}</div>
                              <div className="text-[10.5px] text-soft">{reportedUser?.role ?? "User"}</div>
                            </div>
                          </div>
                        </td>
                        <td className={`${tdCls()} max-w-[260px]`}>
                          <button onClick={() => setOpenReport(r)} className="cursor-pointer text-left hover:underline" title="View full conversation">
                            <span className="block line-clamp-2 text-[12px] font-semibold text-ink">{msg?.body ?? "(removed)"}</span>
                            <span className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-bold text-steel-700">View conversation <Eye className="h-3 w-3" /></span>
                          </button>
                        </td>
                        <td className={tdCls()}><Chip tone={r.status === "open" ? "rust" : "gray"}>{r.reason}</Chip>{r.detail && <div className="mt-1 max-w-[180px] text-[10.5px] text-soft">{r.detail}</div>}</td>
                        <td className={`${tdCls()} text-soft`}>
                          {reporter?.name ?? "—"}<span className="block text-[10.5px]">{timeAgo(r.at)}</span>
                        </td>
                        <td className={tdCls()}><Chip tone={r.status === "open" ? "gold" : r.status === "resolved" ? "pine" : "gray"}>{r.status}</Chip></td>
                        <td className={`${tdCls()} whitespace-nowrap text-right`}>
                          <span className="flex justify-end gap-1.5">
                            <Btn size="sm" variant="soft" onClick={() => setOpenReport(r)}><Eye className="h-3.5 w-3.5" /> View</Btn>
                            {r.status === "open" && <>
                              <Btn size="sm" variant="soft" onClick={() => resolve(r.id, "resolved")}>Resolve</Btn>
                              <Btn size="sm" variant="ghost" onClick={() => resolve(r.id, "dismissed")}>Dismiss</Btn>
                              <Btn size="sm" variant="dangerSoft" onClick={() => hideConversation(r.conversationId)}>Hide</Btn>
                            </>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {reports.length === 0 && <tr><td colSpan={6}><EmptyState icon={<ShieldAlert className="h-5 w-5" />} title="Nothing to review" body="No messages have been reported." /></td></tr>}
                </>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      {openReport && <ModerationConversationModal report={openReport} onClose={() => setOpenReport(null)} />}
    </>
  );
}
