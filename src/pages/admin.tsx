import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronUp, History, KeyRound, Plus, Search, Settings2, ShieldCheck, Trash2, Download, Users as UsersIcon, X, Eye, SlidersHorizontal, ImagePlus, Star, UploadCloud } from "lucide-react";
import { useApp, useLazyGroups, fmtDate, timeAgo, uid } from "../store";
import {
  PERMISSION_CATALOG, PERMISSION_CATEGORIES, getRoleProfile, hasPermission, pushAudit,
} from "../rbac";
import type { Role, RoleDef, Settings } from "../types";
import { Btn, Chip, EmptyState, Field, Modal, PageHead, Panel, RoleBadge, Select, SkeletonRows, TextArea, TextInput, tdCls, thCls, useConfirm } from "../ui";
import { AccessDenied } from "./Auth";
import { deleteFile, isStorageConfigured, uploadFile, useSignedUrl } from "../lib/storage";
import { clearAuditLog } from "../lib/backend";

const BASE_ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Administrator" },
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
  { value: "guardian", label: "Guardian" },
];

/* ================= Role & permission management ================= */
export function RolesPage() {
  const { db, currentUser, update, toast } = useApp();
  const [edit, setEdit] = useState<RoleDef | "new" | null>(null);

  if (!hasPermission(db, currentUser, "roles.manage")) {
    return <AccessDenied required="roles.manage" reason="Only the Super Admin can manage roles and permission sets." />;
  }

  const isSuper = (getRoleProfile(db, currentUser)?.permissions ?? []).includes("*");
  const userCount = (roleId: string) => db.users.filter((u) => u.roleId === roleId).length;

  const blank: RoleDef = { id: "", name: "", description: "", permissions: [], status: "active", system: false, appliesTo: ["teacher"] };
  const draft = edit === "new" ? blank : edit;

  /** System roles: only a super-admin may touch their permission set; they can't be deleted. */
  const canEditPerms = (r: RoleDef) => !r.system || isSuper;

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast("Give the role a name.", "warn"); return; }
    if (draft.permissions.length === 0 && !draft.permissions.includes("*")) { toast("Select at least one permission.", "warn"); return; }
    update((d) => {
      if (draft.id) {
        const i = d.roles.findIndex((r) => r.id === draft.id);
        if (i >= 0) d.roles[i] = { ...draft, name: draft.name.trim() };
        pushAudit(d, currentUser, "role.update", draft.name, `${draft.permissions.length === 1 && draft.permissions[0] === "*" ? "full access" : draft.permissions.length + " permissions"}`);
      } else {
        d.roles.push({ ...draft, id: uid(), name: draft.name.trim(), system: false });
        pushAudit(d, currentUser, "role.create", draft.name);
      }
    });
    toast(draft.id ? "Role updated — permissions apply immediately." : "Role created.");
    setEdit(null);
  };

  const removeRole = (r: RoleDef) => {
    if (r.system) { toast("System roles can't be deleted.", "warn"); return; }
    if (userCount(r.id) > 0) { toast(`Reassign the ${userCount(r.id)} user(s) using this role first.`, "warn"); return; }
    update((d) => { d.roles = d.roles.filter((x) => x.id !== r.id); pushAudit(d, currentUser, "role.delete", r.name); });
    toast("Role deleted.");
  };

  const toggleStatus = (r: RoleDef) => {
    if (r.system && !isSuper) { toast("Only the Super Admin can change a system role.", "warn"); return; }
    update((d) => {
      const x = d.roles.find((y) => y.id === r.id)!;
      x.status = x.status === "active" ? "disabled" : "active";
      pushAudit(d, currentUser, x.status === "active" ? "role.enable" : "role.disable", r.name);
    });
    toast(r.status === "active" ? `${r.name} disabled — its users lose access immediately.` : `${r.name} re-activated.`);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead kicker="System" title="Roles & permissions" sub="A role is a named collection of permissions. Assign profiles to users; access updates the moment a set changes.">
        <Btn variant="gold" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> New role</Btn>
      </PageHead>

      <Panel className="anim-rise overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-mist bg-paper/60">
              <tr><th className={thCls()}>Role</th><th className={thCls()}>Users</th><th className={thCls()}>Permissions</th><th className={thCls()}>Status</th><th className={thCls()}></th></tr>
            </thead>
            <tbody className="divide-y divide-mist/70">
              {db.roles.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-pine-50/50">
                  <td className={tdCls()}>
                    <span className="flex items-center gap-2.5">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.permissions.includes("*") ? "bg-gold-100 text-gold-600" : "bg-pine-100 text-pine-700"}`}><KeyRound className="h-4 w-4" /></span>
                      <span>
                        <span className="block font-bold text-ink">{r.name}{r.system && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-soft">system</span>}</span>
                        <span className="block max-w-[320px] truncate text-[11px] text-soft">{r.description}</span>
                      </span>
                    </span>
                  </td>
                  <td className={tdCls()}><Chip tone="gray"><UsersIcon className="h-3 w-3" /> {userCount(r.id)}</Chip></td>
                  <td className={tdCls()}>
                    {r.permissions.includes("*") ? <Chip tone="gold">Full access (*)</Chip> : <Chip tone="pine">{r.permissions.length} permissions</Chip>}
                  </td>
                  <td className={tdCls()}>
                    <button onClick={() => toggleStatus(r)} className="cursor-pointer" title="Toggle status">
                      <Chip tone={r.status === "active" ? "pine" : "rust"}>
                        <span className={`h-1.5 w-1.5 rounded-full ${r.status === "active" ? "bg-pine-500 live-dot" : "bg-rust-500"}`} /> {r.status}
                      </Chip>
                    </button>
                  </td>
                  <td className={`${tdCls()} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-1">
                      <button onClick={() => setEdit({ ...r })} className="cursor-pointer rounded p-1.5 text-soft hover:bg-pine-100 hover:text-pine-700" title="Edit role"><Eye className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeRole(r)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600 disabled:opacity-30" disabled={r.system} title={r.system ? "System roles can't be deleted" : "Delete role"}><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {draft && (
        <RoleModal draft={draft} canEditPerms={canEditPerms(draft)} onClose={() => setEdit(null)} onSave={save} setDraft={(p) => setEdit(p)} />
      )}
    </div>
  );
}

function RoleModal({ draft, canEditPerms, onClose, onSave, setDraft }: {
  draft: RoleDef;
  canEditPerms: boolean;
  onClose: () => void;
  onSave: () => void;
  setDraft: (p: RoleDef) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, typeof PERMISSION_CATALOG>();
    for (const c of PERMISSION_CATEGORIES) m.set(c, PERMISSION_CATALOG.filter((p) => p.category === c));
    return m;
  }, []);
  const isFull = draft.permissions.includes("*");

  const togglePerm = (id: string) => {
    if (!canEditPerms) return;
    setDraft({ ...draft, permissions: draft.permissions.includes(id) ? draft.permissions.filter((p) => p !== id) : [...draft.permissions, id] });
  };
  const toggleAll = (cat: string) => {
    if (!canEditPerms) return;
    const ids = PERMISSION_CATALOG.filter((p) => p.category === cat).map((p) => p.id);
    const allOn = ids.every((id) => draft.permissions.includes(id));
    setDraft({ ...draft, permissions: allOn ? draft.permissions.filter((p) => !ids.includes(p)) : [...new Set([...draft.permissions, ...ids])] });
  };

  return (
    <Modal title={draft.id ? `Edit role — ${draft.name}` : "New role"} kicker="Permission collection" onClose={onClose} wide
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={onSave}><ShieldCheck className="h-4 w-4" /> Save role</Btn>
      </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role name" required><TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Academic Coordinator" /></Field>
        <Field label="Applies to" required>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {BASE_ROLES.map((br) => {
              const on = draft.appliesTo.includes(br.value);
              return (
                <button key={br.value} onClick={() => setDraft({ ...draft, appliesTo: on ? draft.appliesTo.filter((x) => x !== br.value) : [...draft.appliesTo, br.value] })}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-all ${on ? "border-pine-700 bg-pine-800 text-pine-50" : "border-mist bg-card text-soft hover:border-pine-400"}`}>
                  {br.label}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Description"><TextArea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="!min-h-[56px]" /></Field>
      </div>

      {!canEditPerms && (
        <p className="mt-3 rounded-lg border border-gold-200 bg-gold-100/60 px-3 py-2 text-[11.5px] font-semibold text-gold-700">
          This is a system role — only the Super Admin may change its permission set.
        </p>
      )}

      <div className="mt-4">
        <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-soft">Permissions — {draft.permissions.length} selected</p>
        <div className="max-h-[42vh] space-y-3 overflow-y-auto rounded-lg border border-mist p-3">
          {[...grouped.entries()].map(([cat, perms]) => {
            const allOn = perms.every((p) => draft.permissions.includes(p.id));
            return (
              <div key={cat}>
                <button onClick={() => toggleAll(cat)} className="mb-1.5 flex w-full cursor-pointer items-center justify-between rounded-md bg-paper px-2 py-1 text-left transition-colors hover:bg-pine-50">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-pine-800">{cat}</span>
                  <span className="text-[10.5px] font-semibold text-soft">{perms.filter((p) => draft.permissions.includes(p.id)).length}/{perms.length}</span>
                </button>
                <div className="grid gap-1 sm:grid-cols-2">
                  {perms.map((p) => {
                    const on = draft.permissions.includes(p.id);
                    return (
                      <button key={p.id} onClick={() => togglePerm(p.id)} disabled={!canEditPerms}
                        className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-all disabled:cursor-not-allowed ${on ? "border-pine-600 bg-pine-50" : "border-mist bg-card hover:border-pine-300"}`}>
                        <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${on ? "border-pine-700 bg-pine-700 text-white" : "border-mist bg-card"}`}>
                          {on && <X className="hidden" />}<span className={`text-[9px] font-bold ${on ? "" : "text-transparent"}`}>✓</span>
                        </span>
                        <span>
                          <span className="block text-[11.5px] font-semibold leading-tight text-ink">{p.name}</span>
                          <span className="block text-[10px] leading-snug text-soft">{p.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-soft">{isFull ? "This role has full access to every module." : "Grant only what the role needs — least privilege is enforced everywhere."}</p>
      </div>
    </Modal>
  );
}

/* ================= Audit log ================= */

const AUDIT_ACTIVITY: Record<string, { label: string; past: string; tone: "pine" | "gold" | "rust" | "steel" | "gray" }> = {
  "role.update": { label: "updated a role", past: "Role updated", tone: "gold" },
  "role.create": { label: "created a role", past: "Role created", tone: "pine" },
  "role.delete": { label: "deleted a role", past: "Role deleted", tone: "rust" },
  "role.enable": { label: "enabled a role", past: "Role enabled", tone: "pine" },
  "role.disable": { label: "disabled a role", past: "Role disabled", tone: "rust" },
  "announcement.publish": { label: "published an announcement", past: "Announcement published", tone: "pine" },
  "announcement.schedule": { label: "scheduled an announcement", past: "Announcement scheduled", tone: "steel" },
  "announcement.draft": { label: "saved an announcement as a draft", past: "Announcement drafted", tone: "gray" },
  "announcement.create": { label: "created an announcement", past: "Announcement created", tone: "pine" },
  "announcement.update": { label: "updated an announcement", past: "Announcement updated", tone: "steel" },
  "announcement.delete": { label: "deleted an announcement", past: "Announcement deleted", tone: "rust" },
  "announcement.archive": { label: "archived an announcement", past: "Announcement archived", tone: "gray" },
  "announcement.restore": { label: "restored an announcement", past: "Announcement restored", tone: "pine" },
  "user.create": { label: "created a user account", past: "User account created", tone: "pine" },
  "user.update": { label: "updated a user account", past: "User account updated", tone: "steel" },
  "user.replace": { label: "replaced a user account", past: "User account replaced", tone: "steel" },
  "user.deactivate": { label: "deactivated a user account", past: "User account deactivated", tone: "rust" },
  "user.delete": { label: "deleted a user account", past: "User account deleted", tone: "rust" },
  "user.password_change": { label: "changed a user's password", past: "Password changed", tone: "gold" },
  "student.delete": { label: "deleted a student record", past: "Student record deleted", tone: "rust" },
  "profile.identity_update": { label: "updated a profile identity", past: "Profile identity updated", tone: "steel" },
  "profile.password_and_identity_update": { label: "updated profile and password information", past: "Profile and password updated", tone: "gold" },
  "conversation.open": { label: "opened a conversation", past: "Conversation opened", tone: "steel" },
  "conversation.start": { label: "started a conversation", past: "Conversation started", tone: "steel" },
  "conversation.hide": { label: "hid a conversation", past: "Conversation hidden", tone: "rust" },
  "message.delete": { label: "deleted a message", past: "Message deleted", tone: "rust" },
  "message.report": { label: "reported a message", past: "Message reported", tone: "rust" },
  "report.file": { label: "filed a message report", past: "Message report filed", tone: "rust" },
  "report.resolved": { label: "resolved a message report", past: "Message report resolved", tone: "pine" },
  "report.dismissed": { label: "dismissed a message report", past: "Message report dismissed", tone: "gray" },
  "event.create": { label: "created a school event", past: "Event created", tone: "steel" },
  "event.save": { label: "updated a school event", past: "Event updated", tone: "steel" },
  "event.delete": { label: "deleted a school event", past: "Event deleted", tone: "rust" },
  "fees.bill": { label: "created a fee bill", past: "Fee bill created", tone: "gold" },
  "fees.create": { label: "created a fee item", past: "Fee item created", tone: "gold" },
  "fees.delete": { label: "deleted a fee item", past: "Fee item deleted", tone: "rust" },
  "fees.manage": { label: "managed fee information", past: "Fee information updated", tone: "gold" },
  "fees.pay": { label: "recorded a fee payment", past: "Fee payment recorded", tone: "pine" },
  "fees.payment": { label: "submitted a fee payment", past: "Fee payment submitted", tone: "steel" },
  "fees.payment.approve": { label: "approved a fee payment", past: "Fee payment approved", tone: "pine" },
  "fees.payment.reject": { label: "rejected a fee payment", past: "Fee payment rejected", tone: "rust" },
  "fees.payment_request": { label: "submitted a fee payment request", past: "Fee payment request submitted", tone: "steel" },
  "fees.receipt.clear": { label: "removed a fee receipt", past: "Fee receipt removed", tone: "rust" },
  "file.upload": { label: "uploaded a file", past: "File uploaded", tone: "steel" },
  "file.delete": { label: "deleted a file", past: "File deleted", tone: "rust" },
};

function auditActivity(a: { action: string; target: string; detail?: string; userName: string }) {
  const meta = AUDIT_ACTIVITY[a.action];
  const action = meta?.label ?? a.action.replace(/[._-]+/g, " ");
  const target = a.target?.trim();
  return {
    meta: meta ?? { label: action, past: action, tone: "gray" as const },
    sentence: target ? `${a.userName} ${action}: ${target}` : `${a.userName} ${action}`,
    targetLabel: target || "—",
    detail: a.detail?.trim() || "",
  };
}

function csvCell(value: string) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function AuditPage() {
  const { db, currentUser, update, toast } = useApp();
  const confirm = useConfirm();
  const groupsLoaded = useLazyGroups("audit");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<"when" | "user" | "action" | "target">("when");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const ACTION_TONE: Record<string, "pine" | "gold" | "rust" | "steel" | "gray"> = {
    "role.update": "gold", "role.create": "gold", "role.delete": "rust", "role.enable": "pine", "role.disable": "rust",
    "announcement.publish": "pine", "announcement.schedule": "steel", "announcement.draft": "gray",
    "user.deactivate": "rust", "user.create": "pine", "student.delete": "rust", "conversation.open": "steel", "message.report": "rust",
    "message.delete": "rust", "report.resolved": "pine", "report.dismissed": "gray", "conversation.hide": "rust",
    "event.create": "steel", "fees.payment.approve": "pine", "fees.payment.reject": "rust", "fees.receipt.clear": "rust",
    "file.upload": "steel", "file.delete": "rust",
  };
  const actionOptions = useMemo(() => [...new Set(db.audit.map((a) => a.action))].sort((a, b) => a.localeCompare(b)), [db.audit]);
  const actorOptions = useMemo(() => [...new Set(db.audit.map((a) => a.userName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [db.audit]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = db.audit.filter((a) => {
      const activity = auditActivity(a);
      const matchesAction = actionFilter === "all" || a.action === actionFilter;
      const matchesActor = actorFilter === "all" || a.userName === actorFilter;
      const date = a.at.slice(0, 10);
      const matchesFrom = !fromDate || date >= fromDate;
      const matchesTo = !toDate || date <= toDate;
      const haystack = `${a.userName} ${activity.sentence} ${activity.targetLabel} ${activity.detail} ${a.action}`.toLowerCase();
      return matchesAction && matchesActor && matchesFrom && matchesTo && (!q || haystack.includes(q));
    });
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "when") cmp = a.at.localeCompare(b.at);
      if (sortBy === "user") cmp = a.userName.localeCompare(b.userName, undefined, { sensitivity: "base" });
      if (sortBy === "action") cmp = auditActivity(a).meta.label.localeCompare(auditActivity(b).meta.label, undefined, { sensitivity: "base" });
      if (sortBy === "target") cmp = a.target.localeCompare(b.target, undefined, { sensitivity: "base" });
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [db.audit, query, actionFilter, actorFilter, fromDate, toDate, sortBy, sortDirection]);

  if (!hasPermission(db, currentUser, "audit.view")) {
    return <AccessDenied required="audit.view" reason="You don't have permission to view the audit trail." />;
  }

  const hasFilters = query.trim() || actionFilter !== "all" || actorFilter !== "all" || fromDate || toDate;

  const exportAudit = () => {
    if (!rows.length) {
      toast("There are no audit entries to export.", "warn");
      return;
    }
    const lines = [
      ["Date", "Time", "User", "Activity", "Target", "Details"].map(csvCell).join(","),
      ...rows.map((a) => {
        const activity = auditActivity(a);
        const when = new Date(a.at);
        return [
          when.toLocaleDateString(),
          when.toLocaleTimeString(),
          a.userName,
          activity.meta.label,
          activity.targetLabel,
          activity.detail,
        ].map(csvCell).join(",");
      }),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(`${rows.length} audit ${rows.length === 1 ? "entry" : "entries"} exported.`);
  };

  const clearAudit = async () => {
    if (!db.audit.length) {
      toast("The audit log is already empty.", "warn");
      return;
    }
    if (!isSuperAdmin(db, currentUser)) {
      toast("Only the Super Admin can clear the audit log.", "warn");
      return;
    }
    const confirmed = await confirm({
      title: "Clear the audit log?",
      body: <>This will permanently remove <strong>{db.audit.length} audit entries</strong> from the school system. Export the log first if you need to keep a record. This cannot be undone.</>,
      confirmLabel: "Clear audit log",
      cancelLabel: "Keep log",
      variant: "danger",
    });
    if (!confirmed) return;
    const result = await clearAuditLog();
    if (result.error) {
      toast(`Could not clear the audit log: ${result.error}`, "warn");
      return;
    }
    update((d) => { d.audit = []; });
    toast("Audit log cleared.");
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="System" title="Activity & audit log" sub="A plain-language record of important changes made in the school system.">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Btn variant="soft" onClick={exportAudit} disabled={!groupsLoaded || !rows.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Btn>
          {isSuperAdmin(db, currentUser) && (
            <Btn variant="dangerSoft" onClick={clearAudit} disabled={!groupsLoaded || !db.audit.length}>
              <Trash2 className="h-4 w-4" /> Clear log
            </Btn>
          )}
        </div>
      </PageHead>
      <Panel className="mb-4 anim-rise overflow-hidden">
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soft" />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by person, activity, target or details…" className="!pl-9" />
            </div>
            <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filter by action">
              <option value="all">All activities</option>
              {actionOptions.map((action) => <option key={action} value={action}>{AUDIT_ACTIVITY[action]?.past ?? action.replace(/[._-]+/g, " ")}</option>)}
            </Select>
            <Select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} aria-label="Filter by user"><option value="all">All users</option>{actorOptions.map((name) => <option key={name} value={name}>{name}</option>)}</Select>
            <TextInput type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
            <TextInput type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-soft"><SlidersHorizontal className="h-3.5 w-3.5" /> Sort</span>
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="w-auto min-w-[130px]">
              <option value="when">When</option><option value="user">User</option><option value="action">Activity</option><option value="target">Target</option>
            </Select>
            <Btn size="sm" variant="soft" onClick={() => setSortDirection((d) => d === "desc" ? "asc" : "desc")} title={sortDirection === "desc" ? "Descending" : "Ascending"}>
              {sortDirection === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
              {sortBy === "when" ? (sortDirection === "desc" ? "Newest" : "Oldest") : (sortDirection === "desc" ? "Z–A" : "A–Z")}
            </Btn>
            <span className="ml-auto text-[11px] text-soft">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
            {hasFilters && <Btn size="sm" variant="ghost" onClick={() => { setQuery(""); setActionFilter("all"); setActorFilter("all"); setFromDate(""); setToDate(""); }}>Clear filters</Btn>}
          </div>
        </div>
      </Panel>
      <Panel className="anim-rise overflow-hidden">
        <div className="audit-table-wrap overflow-x-auto">
        <table className="audit-table w-full min-w-[920px]">
          <thead className="border-b border-mist bg-paper/60">
            <tr><th className={thCls()}>When</th><th className={thCls()}>User</th><th className={thCls()}>Activity</th><th className={thCls()}>Details</th></tr>
          </thead>
          <tbody className="divide-y divide-mist/70">
            {!groupsLoaded ? (
              <SkeletonRows rows={6} cols={4} />
            ) : (
            <>
            {rows.map((a) => {
              const activity = auditActivity(a);
              return (
                <tr key={a.id} className="transition-colors hover:bg-pine-50/40">
                  <td className={`${tdCls()} whitespace-nowrap text-soft`}>
                    <span className="block text-[12px] font-semibold text-ink">{fmtDate(a.at.slice(0, 10))}</span>
                    <span className="text-[10.5px]">{timeAgo(a.at)}</span>
                  </td>
                  <td className={`${tdCls()} whitespace-nowrap font-semibold text-ink`}>{a.userName}</td>
                  <td className={`${tdCls()} min-w-[300px]`}>
                    <div className="flex items-start gap-2">
                      <Chip tone={activity.meta.tone}><History className="h-3 w-3" /> {activity.meta.past}</Chip>
                    </div>
                    <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-ink">{activity.sentence}</p>
                  </td>
                  <td className={`${tdCls()} min-w-[280px]`}>
                    <span className="font-semibold text-ink">{activity.targetLabel}</span>
                    {activity.detail && <span className="mt-0.5 block text-[11px] leading-relaxed text-soft">{activity.detail}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={4}><EmptyState icon={<History className="h-5 w-5" />} title="No matching entries" body="Important changes will appear here in plain language." /></td></tr>}
            </>
            )}
          </tbody>
        </table>
        </div>
      </Panel>
    </div>
  );
}


function SchoolLogoSettingCard({ logo, active, onActivate, onDelete }: { logo: { key: string; name: string }; active: boolean; onActivate: () => void; onDelete: () => void }) {
  const url = useSignedUrl("school_logo", "school-1", logo.key);
  return (
    <div className={`overflow-hidden rounded-xl border ${active ? "border-gold-400 ring-2 ring-gold-400/20" : "border-mist"} bg-card`}>
      <div className="flex h-32 items-center justify-center bg-paper/60 p-4">
        {url ? <img src={url} alt={logo.name} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-8 w-8 text-soft/50" />}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-mist px-3 py-2.5">
        <div className="min-w-0"><p className="truncate text-[12.5px] font-bold text-ink">{logo.name}</p>{active && <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-gold-700"><Star className="h-3 w-3 fill-current" /> Active logo</p>}</div>
        <div className="flex shrink-0 items-center gap-1">
          {!active && <Btn size="sm" variant="soft" onClick={onActivate}><Star className="h-3.5 w-3.5" /> Use</Btn>}
          <Btn size="sm" variant="dangerSoft" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Btn>
        </div>
      </div>
    </div>
  );
}

/* ================= School settings ================= */
export function SchoolSettingsPage() {
  const { db, currentUser, update, toast } = useApp();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Settings>(() => ({
    ...db.settings,
    bankAccounts: [...(db.settings.bankAccounts ?? [])],
    workingDays: [...(db.settings.workingDays ?? [])],
    periods: [...(db.settings.periods ?? [])],
    logos: [...(db.settings.logos ?? [])],
    activeLogoKey: db.settings.activeLogoKey,
  }));

  if (!hasPermission(db, currentUser, "settings.manage")) {
    return <AccessDenied required="settings.manage" reason="You don't have permission to change school settings." />;
  }

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const save = async () => {
    const name = draft.schoolName.trim();
    if (!name) {
      toast("School name is required.", "warn");
      return;
    }
    if (!draft.workingDays.length) {
      toast("Keep at least one working day.", "warn");
      return;
    }
    if (!draft.periods.length) {
      toast("Keep at least one timetable period.", "warn");
      return;
    }
    const errors = await update((d) => {
      d.settings = {
        ...draft,
        schoolName: name,
        motto: draft.motto.trim(),
        bankAccounts: [...(draft.bankAccounts ?? [])],
        workingDays: [...draft.workingDays].sort((a, b) => a - b),
        periods: [...draft.periods],
      };
    });
    if (errors.length) {
      toast("Could not save school settings. " + errors[0], "warn");
      return;
    }
    setDraft((current) => ({
      ...current,
      schoolName: name,
      motto: current.motto.trim(),
    }));
    toast("School settings saved.");
  };

  const toggleDay = (day: number) => {
    const next = draft.workingDays.includes(day)
      ? draft.workingDays.filter((d) => d !== day)
      : [...draft.workingDays, day].sort((a, b) => a - b);
    if (!next.length) {
      toast("Keep at least one working day.", "warn");
      return;
    }
    setDraft((current) => ({ ...current, workingDays: next }));
  };

  const updatePeriod = (index: number, patch: Partial<{ period: number; time: string }>) => {
    setDraft((current) => {
      const periods = [...current.periods];
      periods[index] = { ...periods[index], ...patch };
      return { ...current, periods };
    });
  };

  const addPeriod = () => {
    setDraft((current) => {
      const nextNo = current.periods.length ? Math.max(...current.periods.map((p) => p.period)) + 1 : 1;
      return { ...current, periods: [...current.periods, { period: nextNo, time: "08:00" }] };
    });
  };

  const removePeriod = (index: number) => {
    if (draft.periods.length <= 1) {
      toast("Keep at least one timetable period.", "warn");
      return;
    }
    setDraft((current) => ({ ...current, periods: current.periods.filter((_, i) => i !== index) }));
  };

  const movePeriod = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.periods.length) return;
    setDraft((current) => {
      const periods = [...current.periods];
      [periods[index], periods[target]] = [periods[target], periods[index]];
      return { ...current, periods };
    });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead kicker="Administration" title="School settings" sub="Change the school's identity and operating schedule without editing the application code.">
        <Btn onClick={save}><Settings2 className="h-4 w-4" /> Save settings</Btn>
      </PageHead>

      <div className="grid gap-4">
        <Panel className="anim-rise p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine-100 text-pine-700"><Settings2 className="h-5 w-5" /></span>
            <div><h3 className="font-display text-[15px] font-bold text-ink">School identity</h3><p className="text-[12px] text-soft">These values drive the sidebar, login screen, reports and registration documents.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School name" required><TextInput value={draft.schoolName} onChange={(e) => setDraft((current) => ({ ...current, schoolName: e.target.value }))} placeholder="Your school name" /></Field>
            <Field label="Motto"><TextInput value={draft.motto} onChange={(e) => setDraft((current) => ({ ...current, motto: e.target.value }))} placeholder="Your school motto" /></Field>
          </div>
          <div className="mt-3 rounded-lg border border-pine-100 bg-pine-50/60 px-3 py-2.5 text-[11.5px] text-soft">The value is applied throughout the app after you save. No code change or redeployment is required.</div>
        </Panel>

        <Panel className="anim-rise overflow-hidden p-0">
          <div className="border-b border-mist bg-paper/50 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine-100 text-pine-700"><ImagePlus className="h-5 w-5" /></span>
              <div>
                <h3 className="font-display text-[15px] font-bold text-ink">School logos</h3>
                <p className="text-[12px] text-soft">Upload multiple logos and switch the active one whenever your school identity changes.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-4 sm:p-5">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-mist bg-paper/40 px-4 py-6 text-center transition hover:border-pine-300 hover:bg-pine-50/50">
              <input
                type="file"
                accept="image/svg+xml,image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                disabled={!isStorageConfigured}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const files = Array.from(input.files ?? []);
                  if (!files.length) return;
                  try {
                    const schoolId = "school-1";
                    const uploaded: { key: string; name: string }[] = [];
                    for (const file of files) {
                      const result = await uploadFile({ file, ownerType: "school_logo", ownerId: schoolId, kind: "logo" });
                      uploaded.push({ key: result.key, name: file.name });
                    }
                    const nextLogos = [...draft.logos, ...uploaded];
                    const nextActive = draft.activeLogoKey || uploaded[0]?.key;
                    const errors = await update((d) => {
                      d.settings.logos = nextLogos;
                      d.settings.activeLogoKey = nextActive;
                    });
                    if (errors.length) {
                      toast("Logo uploaded but could not update school identity. " + errors[0], "warn");
                    } else {
                      setDraft((current) => ({ ...current, logos: nextLogos, activeLogoKey: nextActive }));
                      toast(`${uploaded.length} logo${uploaded.length === 1 ? "" : "s"} uploaded and saved.`);
                    }
                  } catch (err) {
                    toast((err as Error).message || "Logo upload failed.", "warn");
                  } finally {
                    input.value = "";
                  }
                }}
              />
              <UploadCloud className="h-5 w-5 text-pine-600" />
              <span><span className="block text-[13px] font-bold text-ink">Upload logo files</span><span className="block text-[11px] text-soft">PNG, JPG, WEBP or SVG · up to 5 MB each</span></span>
            </label>
            {!isStorageConfigured && <p className="text-[11px] text-rust-700">File storage is not configured, so logo uploads are currently unavailable.</p>}
            {draft.logos.length === 0 ? (
              <EmptyState icon={<ImagePlus className="h-5 w-5" />} title="No logos uploaded" body="Upload one or more school logos to start using a custom identity." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {draft.logos.map((logo) => <SchoolLogoSettingCard key={logo.key} logo={logo} active={draft.activeLogoKey === logo.key} onActivate={async () => {
                  const errors = await update((d) => { d.settings.activeLogoKey = logo.key; });
                  if (errors.length) { toast("Could not switch the active logo. " + errors[0], "warn"); return; }
                  setDraft((current) => ({ ...current, activeLogoKey: logo.key }));
                  toast("Active logo updated.");
                }} onDelete={async () => {
                  if (draft.logos.length <= 1) { toast("Keep at least one logo before deleting the last one.", "warn"); return; }
                  const ok = await confirm({ title: "Remove this logo?", body: <>This will permanently remove <strong>{logo.name}</strong> from the school logo library.</>, confirmLabel: "Remove logo" });
                  if (!ok) return;
                  try {
                    await deleteFile("school_logo", "school-1", logo.key);
                    const logos = draft.logos.filter((x) => x.key !== logo.key);
                    const activeLogoKey = draft.activeLogoKey === logo.key ? logos[0]?.key : draft.activeLogoKey;
                    const errors = await update((d) => { d.settings.logos = logos; d.settings.activeLogoKey = activeLogoKey; });
                    if (errors.length) { toast("Logo file removed, but school identity could not be saved. " + errors[0], "warn"); return; }
                    setDraft((current) => ({ ...current, logos, activeLogoKey }));
                    toast("Logo removed.");
                  } catch (err) { toast((err as Error).message || "Could not remove logo.", "warn"); }
                }} />)}
              </div>
            )}
          </div>
        </Panel>

        <Panel className="anim-rise p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-700"><CalendarDays className="h-5 w-5" /></span>
            <div><h3 className="font-display text-[15px] font-bold text-ink">Working days</h3><p className="text-[12px] text-soft">Choose which weekdays are used by attendance and the school timetable.</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {days.map((day, index) => {
              const on = draft.workingDays.includes(index);
              return <button key={day} type="button" onClick={() => toggleDay(index)} className={`cursor-pointer rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold transition-colors ${on ? "border-pine-300 bg-pine-50 text-pine-800" : "border-mist bg-card text-soft hover:border-pine-200"}`}><span className="block text-[10px] uppercase tracking-[0.12em] opacity-70">Day {index}</span>{day}</button>;
            })}
          </div>
        </Panel>

        <Panel className="anim-rise overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-mist bg-paper/50 px-4 py-3.5">
            <div><h3 className="font-display text-[15px] font-bold text-ink">Timetable periods</h3><p className="text-[12px] text-soft">Add, remove, reorder and retime periods for the school day.</p></div>
            <Btn size="sm" variant="soft" onClick={addPeriod}><Plus className="h-3.5 w-3.5" /> Add period</Btn>
          </div>
          <div className="divide-y divide-mist/70">
            {draft.periods.map((period, index) => (
              <div key={`${period.period}-${index}`} className="flex flex-wrap items-end gap-3 px-4 py-3">
                <Field label="Period" className="w-full sm:w-[140px]"><TextInput type="number" min={1} value={period.period} onChange={(e) => updatePeriod(index, { period: Math.max(1, Number(e.target.value) || 1) })} /></Field>
                <Field label="Start time" className="w-full sm:w-[160px]"><TextInput type="time" value={period.time} onChange={(e) => updatePeriod(index, { time: e.target.value })} /></Field>
                <div className="ml-auto flex items-center gap-1">
                  <Btn size="sm" variant="ghost" disabled={index === 0} onClick={() => movePeriod(index, -1)} aria-label="Move period up"><ChevronUp className="h-4 w-4" /></Btn>
                  <Btn size="sm" variant="ghost" disabled={index === draft.periods.length - 1} onClick={() => movePeriod(index, 1)} aria-label="Move period down"><ChevronDown className="h-4 w-4" /></Btn>
                  <Btn size="sm" variant="dangerSoft" disabled={draft.periods.length <= 1} onClick={() => removePeriod(index)}><Trash2 className="h-3.5 w-3.5" /> Remove</Btn>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
