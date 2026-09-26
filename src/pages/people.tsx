import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BadgeCheck, Baby, BookOpen, CalendarCheck2, CreditCard, FileBarChart2, History, Inbox, KeyRound, Layers, Lock,
  FileText as Notebook, Pencil, Plus, Search, ShieldCheck, Trash2, User as UserIcon, Users, Wallet, Eye, GraduationCap, X,
} from "lucide-react";
import type { DB, Enrollment, FeeItem, Role, Student, User, UserStatus } from "../types";
import {
  assessmentCalc, attendanceStats, canSeeStudent, childrenOf, describeSyncErrors, feeStats, fmtDate, fullName, getClass, getSection,
  getSubject, gradeFor, guardianOfStudent, homePathFor, ordinal, pendingRequestFor, sectionLabel, sectionShort, shortName,
  studentAverage, studentOf, studentResults, structureRanks, teacherPairs, teacherStudentIds, teachersOfStudent,
  todayISO, uid, useApp, useLazyGroups,
} from "../store";
import {
  Avatar, Btn, Chip, EmptyState, Field, Modal, PageHead, Panel, Ring, RoleBadge, Select, Skel, SkeletonPanel, SkeletonRows,
  Stat, Tabs, TextInput, UserAvatar, UsernameConflictModal, tdCls, thCls, useConfirm,
} from "../ui";
import { getDownloadUrl, isStorageConfigured, uploadFile } from "../lib/storage";
import { AccessDenied } from "./Auth";
import { defaultRoleIdFor, hasPermission, pushAudit } from "../rbac";
import { changeUserPassword, updateMyProfile, useAttendanceSummaryPage, useStudents, useUsers } from "../lib/api";
import { deleteStudentRecord, deleteUserAccount } from "../lib/backend";
import { IDCardModal, RegistrationWizard } from "./registration";

/* ================= students directory (role-scoped) ================= */
export function StudentsPage({ scoped }: { scoped?: boolean }) {
  const { db, currentUser, yearId, toast, reconnect } = useApp();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [sec, setSec] = useState("");
  const [page, setPage] = useState(0);
  const [regOpen, setRegOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");

  const isAdmin = currentUser?.role === "admin";
  const canRegister = hasPermission(db, currentUser, "students.create");
  const canDeleteStudent = isAdmin && hasPermission(db, currentUser, "students.delete");
  const role = currentUser?.role ?? "admin";

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);
  useEffect(() => setPage(0), [debouncedQ, cls, sec]);

  const studentsQuery = useStudents({ classId: cls || undefined, sectionId: sec || undefined, status: "active", search: debouncedQ || undefined, sort: "reg", page, pageSize: 50 });
  const attendanceQuery = useAttendanceSummaryPage({ classId: cls || undefined, sectionId: sec || undefined, search: debouncedQ || undefined, page, pageSize: 50 });
  const attendanceByStudent = useMemo(() => new Map(attendanceQuery.rows.map((r) => [r.student_id, r])), [attendanceQuery.rows]);

  const profilePath = (id: string) => role === "admin" ? `/admin/students/${id}` : role === "teacher" ? `/teacher/students/${id}` : `/guardian/children/${id}`;

  const removeStudent = async (student: typeof studentsQuery.rows[number]) => {
    if (!canDeleteStudent) { toast("You don't have permission to delete students.", "warn"); return; }
    const ok = await confirm({
      title: `Delete ${student.full_name}?`,
      body: "This permanently removes the student record and its linked school data. This cannot be undone.",
      confirmLabel: "Delete student", cancelLabel: "Keep student", variant: "danger",
    });
    if (!ok) return;
    const result = await deleteStudentRecord(student.student_id);
    if (result.error) { toast(result.error, "warn"); return; }
    toast(`${student.full_name} was permanently deleted.`);
    await reconnect();
  };

  const viewPerm = role === "admin" ? "students.view" : role === "teacher" ? "students.view_assigned" : role === "guardian" ? "students.view_children" : "students.view_self";
  if (!hasPermission(db, currentUser, viewPerm)) {
    return <AccessDenied required={viewPerm} reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }

  const rows = studentsQuery.rows;
  const total = studentsQuery.total;
  const head = scoped
    ? role === "teacher"
      ? { kicker: "Teaching", title: "My students", sub: "Only students in your assigned class sections appear here — the server filters the rest of the school." }
      : { kicker: "Family", title: "My children", sub: "Your registered children, exactly as linked by the front office." }
    : { kicker: "People", title: "Students", sub: `${total} enrolled in AY ${db.years.find((y) => y.id === yearId)?.name}. One record per student — reused by attendance, marks, fees and reports.` };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead {...head}>
        {canRegister && <Btn variant="gold" onClick={() => setRegOpen(true)}><Plus className="h-4 w-4" /> Register student</Btn>}
      </PageHead>

      <Panel className="anim-rise overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-mist px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soft" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or student ID…" className="!pl-9" />
          </div>
          <Select value={cls} onChange={(e) => { setCls(e.target.value); setSec(""); }} className="!w-40"><option value="">All grades</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select value={sec} onChange={(e) => setSec(e.target.value)} className="!w-36" disabled={!cls}><option value="">All sections</option>{getClass(db, cls)?.sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}</Select>
        </div>

        {studentsQuery.isPending ? <div className="p-4"><SkeletonRows rows={8} /></div> : rows.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No students match" body={scoped ? "No students are linked to your account yet." : "Adjust the filters or register a new student."} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-mist bg-paper/60"><tr>
                  <th className={thCls()}>Student</th><th className={thCls()}>Placement</th><th className={`${thCls()} hidden md:table-cell`}>Guardian</th><th className={`${thCls()} hidden sm:table-cell`}>Roll</th><th className={thCls()}>Attendance</th><th className={thCls()}></th>
                </tr></thead>
                <tbody className="divide-y divide-mist/70">
                  {rows.map((s) => {
                    const att = attendanceByStudent.get(s.student_id);
                    const avatarStudent = {
                      id: s.student_id, regId: s.reg_no, firstName: s.first_name, middleName: s.middle_name ?? "", lastName: s.last_name,
                      gender: s.gender, dob: s.dob, phone: "", email: "", address: "", photo: s.photo_path ?? undefined,
                      guardian: { father: "", relation: "Father", phone: s.guardian_phone ?? "", address: "" }, admission: { number: "", date: "" },
                      enrollment: { yearId, classId: s.class_id, sectionId: s.section_id, rollNumber: s.roll_number ?? undefined, status: "active", enrolledOn: "" }, history: [], documents: [], status: "active",
                    } as Student;
                    return <tr key={s.student_id} onClick={() => nav(profilePath(s.student_id))} className="cursor-pointer transition-colors hover:bg-pine-50/70">
                      <td className={tdCls()}><span className="flex items-center gap-3"><Avatar student={avatarStudent} size={34} /><span className="min-w-0"><span className="block truncate font-bold text-ink">{s.full_name}</span><span className="font-mono text-[11px] text-soft">{s.reg_no}</span></span></span></td>
                      <td className={tdCls()}><Chip tone="pine">{sectionShort(db, s.class_id, s.section_id)}</Chip></td>
                      <td className={`${tdCls()} hidden text-soft md:table-cell`}>{s.guardian_phone || "—"}</td>
                      <td className={`${tdCls()} hidden text-soft sm:table-cell`}>{s.roll_number ?? "—"}</td>
                      <td className={tdCls()}>{att ? <Ring pct={att.pct} size={34} stroke={4} label={`${Math.round(att.pct)}`} color={att.pct >= 90 ? "var(--color-pine-600)" : att.pct >= 75 ? "var(--color-gold-500)" : "var(--color-rust-500)"} /> : <Skel className="h-[34px] w-[34px] rounded-full" />}</td>
                      <td className={`${tdCls()} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}><span className="inline-flex items-center gap-1"><Chip tone="gray">View <Eye className="h-3 w-3" /></Chip>{canDeleteStudent && <button type="button" onClick={() => removeStudent(s)} className="cursor-pointer rounded p-1.5 text-soft transition hover:bg-rust-100 hover:text-rust-600" title={`Delete ${s.full_name}`} aria-label={`Delete ${s.full_name}`}><Trash2 className="h-3.5 w-3.5" /></button>}</span></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mist px-4 py-3">
              <p className="text-[12px] text-soft">Showing {total ? page * studentsQuery.pageSize + 1 : 0}–{Math.min((page + 1) * studentsQuery.pageSize, total)} of {total}</p>
              <div className="flex items-center gap-2"><Btn variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Btn><span className="text-[12px] font-semibold text-soft">Page {page + 1} / {studentsQuery.pageCount}</span><Btn variant="outline" size="sm" disabled={page + 1 >= studentsQuery.pageCount} onClick={() => setPage((p) => p + 1)}>Next</Btn></div>
            </div>
          </>
        )}
      </Panel>

      {regOpen && <RegistrationWizard onClose={() => setRegOpen(false)} onSaved={() => reconnect()} />}
    </div>
  );
}

/* ================= reusable: searchable, filterable student picker =================
   Used anywhere a login needs linking to a student record — guardian children,
   the standalone "New user" form — so it's one consistent, filterable list
   instead of a plain <select> that's unusable once a school has a few hundred
   students. */
function StudentPicker({
  db, selectedIds, onToggle, placeholder = "Search name or student ID…",
}: {
  db: DB;
  selectedIds: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [sec, setSec] = useState("");
  const [page, setPage] = useState(0);
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);
  useEffect(() => setPage(0), [debouncedQ, cls, sec]);

  const query = useStudents({
    search: debouncedQ || undefined,
    classId: cls || undefined,
    sectionId: sec || undefined,
    status: "active",
    sort: "name",
    page,
    pageSize: 50,
  });

  const rows = query.rows;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-soft" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="!py-1.5 !pl-8 text-[12.5px]" />
        </div>
        <Select value={cls} onChange={(e) => { setCls(e.target.value); setSec(""); }} className="!w-36 !py-1.5 text-[12.5px]">
          <option value="">All grades</option>
          {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={sec} onChange={(e) => setSec(e.target.value)} className="!w-32 !py-1.5 text-[12.5px]" disabled={!cls}>
          <option value="">All sections</option>
          {getClass(db, cls)?.sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
        </Select>
        {(q || cls || sec) && (
          <button type="button" onClick={() => { setQ(""); setCls(""); setSec(""); }} className="cursor-pointer text-[11px] font-semibold text-soft hover:text-pine-700">Clear</button>
        )}
      </div>
      <div className="rounded-lg border border-mist p-2">
        {query.isLoading ? <SkeletonRows n={6} /> : (
          <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {rows.map((s) => {
              const on = selectedIds.includes(s.student_id);
              return (
                <button key={s.student_id} type="button" onClick={() => onToggle(s.student_id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all ${on ? "border-gold-400 bg-gold-100/60" : "border-mist bg-card hover:border-pine-300"}`}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pine-100 text-[10px] font-extrabold text-pine-800">{(s.full_name?.[0] ?? "?").toUpperCase()}</div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold text-ink">{s.full_name}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[9.5px] text-soft">{s.reg_no}</span>
                      <span className="text-[10px] text-soft">· {getClass(db, s.class_id)?.name ?? s.class_id} {getSection(db, s.class_id, s.section_id)?.name ? `· ${getSection(db, s.class_id, s.section_id)?.name}` : ""}</span>
                    </span>
                  </span>
                  {on && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-gold-600" />}
                </button>
              );
            })}
            {!rows.length && <p className="col-span-full rounded-lg bg-paper/60 px-3 py-6 text-center text-[11.5px] text-soft">No students match those filters.</p>}
          </div>
        )}
      </div>
      {query.pageCount > 1 && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10.5px] text-soft">{query.total} students</span>
          <div className="flex items-center gap-1.5">
            <Btn size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Btn>
            <span className="text-[10.5px] font-semibold text-soft">{page + 1}/{query.pageCount}</span>
            <Btn size="sm" variant="ghost" disabled={page + 1 >= query.pageCount} onClick={() => setPage((p) => p + 1)}>Next</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= families (admin) ================= */
export function FamiliesPage() {
  const { db, currentUser, update, toast, reconnect } = useApp();
  const [edit, setEdit] = useState<{ id?: string; name: string; username: string; password: string; phone: string; email: string; childrenIds: string[] } | null>(null);
  const guardians = db.users.filter((u) => u.role === "guardian");

  if (!hasPermission(db, currentUser, "families.view")) {
    return <AccessDenied required="families.view" reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }
  // The database only allows creating/editing guardian accounts with users.manage —
  // mirror that here so the buttons don't appear only to fail on save.
  const canManageGuardians = hasPermission(db, currentUser, "users.manage");

  const toggleChild = (id: string) =>
    setEdit((p) => p && { ...p, childrenIds: p.childrenIds.includes(id) ? p.childrenIds.filter((x) => x !== id) : [...p.childrenIds, id] });

  const [conflict, setConflict] = useState<User | null>(null);

  const finalizeSave = async (loginUsername: string, loginPassword: string, replaceId?: string) => {
    if (!edit) return;
    const isNew = !edit.id;
    const passwordToSet = loginPassword.trim();
    const errors = await update((d) => {
      if (replaceId) {
        const ridx = d.users.findIndex((u) => u.id === replaceId);
        if (ridx >= 0) d.users.splice(ridx, 1);
      }
      if (edit.id) {
        const u = d.users.find((x) => x.id === edit.id)!;
        u.name = edit.name.trim(); u.username = loginUsername; u.password = "";
        u.phone = edit.phone.trim(); u.email = edit.email.trim(); u.childrenIds = edit.childrenIds;
      } else {
        d.users.push({ id: uid(), name: edit.name.trim(), username: loginUsername, password: passwordToSet, role: "guardian", roleId: "guardian", status: "active", phone: edit.phone.trim(), email: edit.email.trim(), childrenIds: edit.childrenIds, createdAt: todayISO() });
      }
    });
    if (errors.length) {
      toast(describeSyncErrors(errors), "warn");
      return;
    }
    if (!isNew && passwordToSet) {
      try {
        await changeUserPassword(edit.id!, passwordToSet);
      } catch (e) {
        toast(`Guardian saved, but password was not changed: ${(e as Error).message}`, "warn");
        setEdit(null);
        return;
      }
    }
    toast(edit.id ? (passwordToSet ? "Guardian updated and password changed." : "Guardian updated.") : "Guardian account created.");
    if (isNew) await reconnect();
    setEdit(null);
  };

  const save = async () => {
    if (!edit || !edit.name.trim() || !edit.username.trim()) { toast("Name and username are required.", "warn"); return; }
    if (!edit.id && !edit.password.trim()) { toast("A password is required for a new guardian.", "warn"); return; }
    if (edit.password.trim() && edit.password.trim().length < 6) { toast("Password must be at least 6 characters.", "warn"); return; }
    const loginUsername = edit.username.trim().toLowerCase();
    const existing = db.users.find((u) => u.username.toLowerCase() === loginUsername && u.id !== edit.id);
    if (existing) { setConflict(existing); return; }
    await finalizeSave(loginUsername, edit.password.trim());
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHead kicker="People" title="Families" sub="Guardian accounts and the children connected to them. A guardian sees exactly these children — nothing more.">
        {canManageGuardians && <Btn variant="gold" onClick={() => setEdit({ name: "", username: "", password: "", phone: "", email: "", childrenIds: [] })}><Plus className="h-4 w-4" /> Add guardian</Btn>}
      </PageHead>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guardians.map((g, i) => {
          const kids = childrenOf(db, g);
          return (
            <Panel key={g.id} className="anim-rise group overflow-hidden">
              <div className="flex items-center gap-3 border-b border-mist px-5 py-4">
                <UserAvatar name={g.name} role="guardian" size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-ink">{g.name}</p>
                  <p className="font-mono text-[11px] text-soft">@{g.username} · {g.status}</p>
                </div>
                {canManageGuardians && (
                  <button onClick={() => setEdit({ id: g.id, name: g.name, username: g.username, password: "", phone: g.phone ?? "", email: g.email ?? "", childrenIds: g.childrenIds ?? [] })}
                    className="cursor-pointer rounded p-1.5 text-soft opacity-0 transition-all hover:bg-pine-100 hover:text-pine-700 group-hover:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>
                )}
              </div>
              <div className="space-y-2 p-4">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-soft">{kids.length} registered child{kids.length === 1 ? "" : "ren"}</p>
                {kids.map((k) => (
                  <div key={k.id} className="flex items-center gap-2.5 rounded-lg border border-mist bg-paper/60 px-3 py-2">
                    <Avatar student={k} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-ink">{shortName(k)}</p>
                      <p className="text-[10.5px] text-soft">{sectionShort(db, k.enrollment?.classId, k.enrollment?.sectionId)}</p>
                    </div>
                  </div>
                ))}
                {kids.length === 0 && <p className="rounded-lg bg-gold-100/60 px-3 py-2 text-[11.5px] font-semibold text-gold-700">No children linked yet.</p>}
              </div>
            </Panel>
          );
        })}
        {guardians.length === 0 && <Panel className="md:col-span-2 xl:col-span-3"><EmptyState icon={<Baby className="h-5 w-5" />} title="No guardian accounts" body="Create a guardian account and connect one or more children." /></Panel>}
      </div>

      {edit && canManageGuardians && (
        <Modal title={edit.id ? "Edit guardian" : "New guardian"} kicker="Families" onClose={() => setEdit(null)} wide
          footer={<><Btn variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn><Btn onClick={save}><Baby className="h-4 w-4" /> Save guardian</Btn></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required><TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Phone"><TextInput value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Username" required hint={edit.id ? "Change your own username from My profile" : undefined}><TextInput value={edit.username} readOnly={Boolean(edit.id)} onChange={(e) => setEdit({ ...edit, username: e.target.value })} className="font-mono" autoComplete="username" /></Field>
            <Field label={edit.id ? "New password (optional)" : "Password"} required={!edit.id}><TextInput type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} className="font-mono" autoComplete={edit.id ? "new-password" : "new-password"} /></Field>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.08em] text-soft">Connected children — {edit.childrenIds.length} selected</p>
            <StudentPicker db={db} selectedIds={edit.childrenIds} onToggle={toggleChild} placeholder="Search a child by name or student ID…" />
          </div>
        </Modal>
      )}
      {conflict && edit && (
        <UsernameConflictModal
          existing={conflict}
          username={edit.username.trim().toLowerCase()}
          password={edit.password.trim()}
          onCancel={() => setConflict(null)}
          onReplace={async () => { const c = conflict; setConflict(null); await finalizeSave(edit.username.trim().toLowerCase(), edit.password.trim(), c!.id); }}
          onUseNew={async (u, p) => {
            const other = db.users.find((x) => x.username.toLowerCase() === u && x.id !== edit.id);
            if (other) { setConflict(other); return; }
            setConflict(null);
            await finalizeSave(u, p);
          }}
        />
      )}
    </div>
  );
}

/* ================= user management (admin, req 16) ================= */
export function UsersPage() {
  const { db, currentUser, toast, reconnect } = useApp();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const [conflict, setConflict] = useState<User | null>(null);
  const [tab, setTab] = useState<"all" | "teacher" | "student" | "guardian" | "admin">("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [cls, setCls] = useState("");
  const [sec, setSec] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);
  useEffect(() => setPage(0), [debouncedQ, tab, cls, sec]);

  const showClassFilter = tab === "student" || tab === "guardian";
  const userQuery = useUsers({
    role: tab === "all" ? undefined : tab,
    search: debouncedQ || undefined,
    classId: showClassFilter && cls ? cls : undefined,
    sectionId: showClassFilter && sec ? sec : undefined,
    page,
    pageSize: 50,
  });
  const allCount = useUsers({ role: undefined, page: 0, pageSize: 1 });
  const teacherCount = useUsers({ role: "teacher", page: 0, pageSize: 1 });
  const studentCount = useUsers({ role: "student", page: 0, pageSize: 1 });
  const guardianCount = useUsers({ role: "guardian", page: 0, pageSize: 1 });
  const adminCount = useUsers({ role: "admin", page: 0, pageSize: 1 });

  const rowToUser = (r: ReturnType<typeof useUsers>["rows"][number]): User => ({
    id: r.id,
    name: r.full_name,
    username: r.username,
    password: "",
    role: r.role as Role,
    roleId: r.role_def_id,
    status: r.status as UserStatus,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    teacherId: r.teacher_id ?? undefined,
    studentId: r.student_id ?? undefined,
    childrenIds: r.children_ids,
    createdAt: r.created_at,
  });

  const relLabel = (r: ReturnType<typeof useUsers>["rows"][number]) => {
    if (r.role === "admin") return "Administrative account";
    if (r.role === "teacher") return r.linked_name ? `Staff · ${r.linked_name}` : "Staff record not linked";
    if (r.role === "student") return r.linked_name ? `Student · ${getClass(db, r.linked_class_id ?? "")?.name ?? r.linked_class_id ?? ""}${r.linked_section_id ? ` · ${getSection(db, r.linked_class_id ?? "", r.linked_section_id)?.name ?? r.linked_section_id}` : ""}` : "Student record not linked";
    const count = r.children_ids?.length ?? 0;
    return count === 1 ? "Guardian · 1 child" : `Guardian · ${count} children`;
  };

  if (!hasPermission(db, currentUser, "users.manage")) {
    return <AccessDenied required="users.manage" reason="Your role doesn't include account administration. Ask an administrator to make changes here." />;
  }

  const blank: User = { id: "", name: "", username: "", password: "", role: "student", roleId: "student", status: "active", createdAt: todayISO() };
  const draft = edit === "new" ? blank : edit;
  const set = (patch: Partial<User>) => setEdit((p) => (p && p !== "new" ? { ...p, ...patch } : p === "new" ? { ...blank, ...patch } : p));

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.username.trim()) { toast("Name and username are required.", "warn"); return; }
    if (!draft.id && !draft.password.trim()) { toast("A password is required for a new user.", "warn"); return; }
    if (draft.password.trim() && draft.password.trim().length < 6) { toast("Password must be at least 6 characters.", "warn"); return; }
    if (draft.role === "teacher" && !draft.teacherId) { toast("Pick a staff record to link — a teacher account needs one.", "warn"); return; }
    if (draft.role === "student" && !draft.studentId) { toast("Pick a student record to link — a student account needs one.", "warn"); return; }

    const loginUsername = draft.username.trim().toLowerCase();
    try {
      if (!draft.id) {
        const newId = await createUserAccount({
          username: loginUsername,
          password: draft.password.trim(),
          fullName: draft.name.trim(),
          role: draft.role,
          roleDefId: draft.roleId,
          teacherId: draft.teacherId ?? null,
          studentId: draft.studentId ?? null,
          email: draft.email?.trim() || null,
          phone: draft.phone?.trim() || null,
        });
        if (draft.role === "guardian" && draft.childrenIds?.length) {
          await updateUserAccount({ id: newId, children: draft.childrenIds });
        }
        toast(`User created with role "${draft.role}".`);
      } else {
        const user = rowToUser(userQuery.rows.find((r) => r.id === draft.id) ?? {
          id: draft.id, full_name: draft.name, username: loginUsername, role: draft.role, role_def_id: draft.roleId,
          status: draft.status, email: draft.email ?? null, phone: draft.phone ?? null, teacher_id: draft.teacherId ?? null,
          student_id: draft.studentId ?? null, created_at: draft.createdAt, children_ids: draft.childrenIds ?? [], linked_name: null,
          linked_class_id: null, linked_section_id: null, total_count: 1,
        });
        await updateUserAccount({
          id: user.id,
          full_name: draft.name.trim(),
          email: draft.email?.trim() || null,
          phone: draft.phone?.trim() || null,
          role_def_id: draft.roleId,
          status: draft.status,
          ...(draft.role === "guardian" ? { children: draft.childrenIds ?? [] } : {}),
        });
        if (draft.password.trim()) await changeUserPassword(draft.id, draft.password.trim());
        toast(draft.password.trim() ? "User updated and password changed." : "User updated.");
      }
      setEdit(null);
      setConflict(null);
      await reconnect();
      await userQuery.refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(msg.includes("already taken") ? "That username is already taken. Choose another username." : msg, "warn");
    }
  };

  const toggleStatus = async (u: User) => {
    if (u.id === currentUser?.id) { toast("You can't disable your own account.", "warn"); return; }
    try {
      await updateUserAccount({ id: u.id, status: u.status === "active" ? "disabled" : "active" });
      toast(`${u.name} is now ${u.status === "active" ? "disabled" : "active"}.`);
      await userQuery.refetch();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "warn");
    }
  };

  const removeUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast("You can't delete your own account.", "warn");
      return;
    }
    const ok = await confirm({
      title: `Delete ${user.name}?`,
      body: `This permanently removes the ${user.role} account and prevents future sign-in. Accounts with important school history may need to be disabled instead so their records remain intact.`,
      confirmLabel: "Delete user",
      cancelLabel: "Keep user",
      variant: "danger",
    });
    if (!ok) return;
    const result = await deleteUserAccount(user.id);
    if (result.error) { toast(result.error, "warn"); return; }
    toast(`${user.name}'s account was permanently deleted.`);
    await userQuery.refetch();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead kicker="Administration" title="Users & roles" sub="Manage accounts, roles and access. Passwords are changed directly in authentication and are never stored in profile records.">
        <Btn variant="gold" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> New user</Btn>
      </PageHead>

      <div className="mb-4">
        <Tabs
          tabs={[
            { id: "all", label: `All · ${allCount.total}` },
            { id: "teacher", label: `Teachers · ${teacherCount.total}` },
            { id: "student", label: `Students · ${studentCount.total}` },
            { id: "guardian", label: `Families · ${guardianCount.total}` },
            { id: "admin", label: `Admins · ${adminCount.total}` },
          ]}
          active={tab}
          onChange={(id) => { setTab(id as typeof tab); setCls(""); setSec(""); }}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soft" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or username…" className="!pl-9" />
        </div>
        {showClassFilter && (
          <>
            <Select value={cls} onChange={(e) => { setCls(e.target.value); setSec(""); }} className="!w-40">
              <option value="">All grades</option>
              {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={sec} onChange={(e) => setSec(e.target.value)} className="!w-36" disabled={!cls}>
              <option value="">All sections</option>
              {getClass(db, cls)?.sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </Select>
          </>
        )}
      </div>

      <Panel className="anim-rise overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-mist bg-paper/60">
              <tr><th className={thCls()}>User</th><th className={thCls()}>Role</th><th className={`${thCls()} hidden md:table-cell`}>Relationship</th><th className={thCls()}>Status</th><th className={thCls()}></th></tr>
            </thead>
            <tbody className="divide-y divide-mist/70">
              {userQuery.isLoading && <SkeletonRows n={8} />}
              {!userQuery.isLoading && userQuery.rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[12.5px] text-soft">No users match these filters.</td></tr>
              )}
              {userQuery.rows.map((r) => {
                const u = rowToUser(r);
                return (
                  <tr key={u.id} className="transition-colors hover:bg-pine-50/50">
                    <td className={tdCls()}>
                      <span className="flex items-center gap-3"><UserAvatar name={u.name} role={u.role} size={34} /><span><span className="block font-bold text-ink">{u.name}{u.id === currentUser?.id && <span className="ml-1.5 text-[10.5px] font-semibold text-gold-600">(you)</span>}</span><span className="font-mono text-[11px] text-soft">@{u.username}</span></span></span>
                    </td>
                    <td className={tdCls()}><RoleBadge role={u.role} full /></td>
                    <td className={`${tdCls()} hidden text-soft md:table-cell`}>{relLabel(r)}</td>
                    <td className={tdCls()}><button onClick={() => toggleStatus(u)} className="cursor-pointer" title="Toggle status"><Chip tone={u.status === "active" ? "pine" : "rust"}><span className={`h-1.5 w-1.5 rounded-full ${u.status === "active" ? "bg-pine-500 live-dot" : "bg-rust-500"}`} /> {u.status}</Chip></button></td>
                    <td className={`${tdCls()} text-right whitespace-nowrap`}><span className="inline-flex gap-1"><button type="button" onClick={() => setEdit({ ...u, password: "" })} className="cursor-pointer rounded p-1.5 text-soft hover:bg-pine-100 hover:text-pine-700" aria-label={`Edit ${u.name}`}><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removeUser(u)} disabled={u.id === currentUser?.id} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600 disabled:cursor-not-allowed disabled:opacity-30" title={u.id === currentUser?.id ? "You can't delete your own account" : `Delete ${u.name}`} aria-label={u.id === currentUser?.id ? "You can't delete your own account" : `Delete ${u.name}`}><Trash2 className="h-3.5 w-3.5" /></button></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mist px-4 py-3">
          <p className="text-[12px] text-soft">Showing {userQuery.total ? page * userQuery.pageSize + 1 : 0}–{Math.min((page + 1) * userQuery.pageSize, userQuery.total)} of {userQuery.total}</p>
          <div className="flex items-center gap-2"><Btn variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Btn><span className="text-[12px] font-semibold text-soft">Page {page + 1} / {userQuery.pageCount}</span><Btn variant="outline" size="sm" disabled={page + 1 >= userQuery.pageCount} onClick={() => setPage((p) => p + 1)}>Next</Btn></div>
        </div>
      </Panel>

      {draft && (
        <Modal title={draft.id ? `Edit ${draft.name}` : "New user"} kicker="Authentication & access" onClose={() => setEdit(null)} wide
          footer={<><Btn variant="ghost" onClick={() => setEdit(null)}>Cancel</Btn><Btn onClick={save}><ShieldCheck className="h-4 w-4" /> Save user</Btn></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required><TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Email"><TextInput value={draft.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Username" required hint={draft.id ? "Existing login usernames are fixed; contact support for a credential migration." : undefined}><TextInput value={draft.username} readOnly={Boolean(draft.id)} onChange={(e) => set({ username: e.target.value })} className="font-mono" /></Field>
            <Field label={draft.id ? "New password (optional)" : "Password"} required={!draft.id}><TextInput type="password" value={draft.password} onChange={(e) => set({ password: e.target.value })} className="font-mono" /></Field>
            <Field label="Base role" required hint={draft.id ? "Base role is fixed after account creation; change the permission profile instead." : "drives relationships"}>
              <Select value={draft.role} disabled={Boolean(draft.id)} onChange={(e) => { const r = e.target.value as Role; set({ role: r, roleId: defaultRoleIdFor(r), teacherId: undefined, studentId: undefined, childrenIds: r === "guardian" ? [] : undefined }); }}>
                <option value="admin">Administrator</option><option value="teacher">Teacher</option><option value="student">Student</option><option value="guardian">Guardian</option>
              </Select>
            </Field>
            <Field label="Permission profile" required hint="drives what they can do"><Select value={draft.roleId} onChange={(e) => set({ roleId: e.target.value })}>{db.roles.filter((r) => r.status === "active" && r.appliesTo.includes(draft.role)).map((r) => <option key={r.id} value={r.id}>{r.name}{r.system ? "" : " · custom"}</option>)}</Select></Field>
            <Field label="Status" required><Select value={draft.status} onChange={(e) => set({ status: e.target.value as UserStatus })}><option value="active">Active</option><option value="disabled">Disabled</option></Select></Field>
          </div>
          <div className="mt-4 rounded-lg border border-pine-200 bg-pine-50 p-3.5">
            <p className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.1em] text-pine-800">Relationship — what this account can reach</p>
            {draft.role === "teacher" && <Field label="Link to staff record" hint="class access follows their subject assignments"><Select value={draft.teacherId ?? ""} onChange={(e) => set({ teacherId: e.target.value || undefined })}><option value="">— none —</option>{db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
            {draft.role === "student" && <div><p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-soft">Link to student record{draft.studentId ? " — 1 selected" : ""}</p><StudentPicker db={db} selectedIds={draft.studentId ? [draft.studentId] : []} onToggle={(id) => set({ studentId: id === draft.studentId ? undefined : id })} placeholder="Search the student by name or ID…" /></div>}
            {draft.role === "guardian" && <div><p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-soft">Children — {(draft.childrenIds ?? []).length} selected</p><StudentPicker db={db} selectedIds={draft.childrenIds ?? []} onToggle={(id) => set({ childrenIds: (draft.childrenIds ?? []).includes(id) ? (draft.childrenIds ?? []).filter((x) => x !== id) : [...(draft.childrenIds ?? []), id] })} placeholder="Search a child by name or student ID…" /></div>}
            {draft.role === "admin" && <p className="text-[12px] text-pine-800">Administrators manage the whole school — users, records, settings and communication.</p>}
          </div>
        </Modal>
      )}
      {conflict && draft && <UsernameConflictModal existing={conflict} username={draft.username.trim().toLowerCase()} password={draft.password.trim()} onCancel={() => setConflict(null)} onReplace={() => { setConflict(null); void save(); }} onUseNew={(u) => { set({ username: u }); setConflict(null); }} />}
    </div>
  );
}

/* ================= profile (any role) ================= */
export function ProfilePage() {
  const { db, currentUser, toast, reconnect, logout } = useApp();
  useLazyGroups("academics");
  const nav = useNavigate();
  const [username, setUsername] = useState(currentUser?.username ?? "");
  const [fullName, setFullName] = useState(currentUser?.name ?? "");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  if (!currentUser) return null;
  const u = currentUser;

  const saveProfile = async () => {
    const nextUsername = username.trim().toLowerCase();
    if (!nextUsername) { toast("Username is required.", "warn"); return; }
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(nextUsername)) {
      toast("Username must be 3-64 characters using letters, numbers, dot, underscore or hyphen.", "warn");
      return;
    }
    if (pw.next && pw.next.length < 6) { toast("New password must be at least 6 characters.", "warn"); return; }
    if (pw.next && pw.next !== pw.confirm) { toast("New passwords don't match.", "warn"); return; }
    if (pw.next && !pw.current) { toast("Enter your current password to change your password.", "warn"); return; }
    setSaving(true);
    try {
      await updateMyProfile({ username: nextUsername, fullName: fullName.trim(), currentPassword: pw.current || undefined, newPassword: pw.next || undefined });
      setPw({ current: "", next: "", confirm: "" });
      setUsername(nextUsername);
      toast("Profile updated.");
      await reconnect();
    } catch (e) {
      toast((e as Error).message || "Could not update your profile.", "warn");
    } finally {
      setSaving(false);
    }
  };
  const pairs = teacherPairs(db, u);
  const me = studentOf(db, u);
  const kids = childrenOf(db, u);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead kicker="Account" title="My profile" sub="Your identity, role and the relationships that shape your access." />
      <div className="grid gap-4 md:grid-cols-5">
        <Panel className="anim-rise p-5 md:col-span-2">
          <div className="flex items-center gap-3">
            <UserAvatar name={u.name} role={u.role} size={54} />
            <div>
              <p className="font-display text-[17px] font-extrabold text-ink">{u.name}</p>
              <div className="mt-1 flex items-center gap-1.5"><RoleBadge role={u.role} full /> <Chip tone={u.status === "active" ? "pine" : "rust"}>{u.status}</Chip></div>
            </div>
          </div>
          <dl className="mt-4 space-y-2.5 text-[13px]">
            <div className="flex justify-between gap-3"><dt className="text-soft">Username</dt><dd className="font-mono font-semibold text-ink">@{u.username}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-soft">Email</dt><dd className="font-semibold text-ink">{u.email || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-soft">Phone</dt><dd className="font-semibold text-ink">{u.phone || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-soft">Member since</dt><dd className="font-semibold text-ink">{fmtDate(u.createdAt)}</dd></div>
          </dl>
          {u.role === "admin" && (
            <div className="mt-4 rounded-lg bg-paper p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-soft"><KeyRound className="h-3.5 w-3.5" /> Administrative access</p>
              <ul className="space-y-1 text-[12px] text-soft">
                <li>· Every record and setting in the school</li>
                <li>· User accounts, roles and statuses</li>
              </ul>
            </div>
          )}
        </Panel>

        <Panel className="anim-rise p-5 md:col-span-3">
          <form onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
            <h2 className="font-display text-[15px] font-bold">Account settings</h2>
            <p className="mt-0.5 text-[11.5px] text-soft">Update your username and password. Passwords are changed directly in the authentication system and are never stored in your profile.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Username" required><TextInput value={username} onChange={(e) => setUsername(e.target.value)} className="font-mono" autoComplete="username" /></Field>
              <Field label="Full name"><TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" /></Field>
              <Field label="Current password"><TextInput type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} className="font-mono" autoComplete="current-password" /></Field>
              <Field label="New password"><TextInput type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} className="font-mono" autoComplete="new-password" /></Field>
              <Field label="Confirm new password" className="sm:col-span-2"><TextInput type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} className="font-mono" autoComplete="new-password" /></Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn type="submit" disabled={saving}><Lock className="h-4 w-4" /> {saving ? "Saving…" : "Save account settings"}</Btn>
              <Btn type="button" variant="outline" onClick={() => { logout(); nav("/login", { replace: true }); }}><X className="h-4 w-4" /> Sign out</Btn>
            </div>
          </form>

          {u.role === "teacher" && (
            <div className="mt-6 border-t border-mist pt-4">
              <h3 className="mb-2 font-display text-[14px] font-bold">My classes</h3>
              <div className="flex flex-wrap gap-1.5">
                {pairs.map((p) => (
                  <Chip key={p.classId + p.sectionId} tone="pine" className="!text-[11.5px]">
                    <Layers className="h-3 w-3" /> {sectionShort(db, p.classId, p.sectionId)} · {p.subjectIds.map((s) => getSubject(db, s)?.code).join("/")}
                  </Chip>
                ))}
                {pairs.length === 0 && <Chip tone="gray">No assignments yet</Chip>}
              </div>
            </div>
          )}
          {u.role === "guardian" && (
            <div className="mt-6 border-t border-mist pt-4">
              <h3 className="mb-2 font-display text-[14px] font-bold">My children</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {kids.map((k) => (
                  <button key={k.id} onClick={() => nav(`/guardian/children/${k.id}`)} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-mist bg-paper/60 px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-md">
                    <Avatar student={k} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-ink">{shortName(k)}</span>
                      <span className="text-[10.5px] text-soft">{sectionShort(db, k.enrollment?.classId, k.enrollment?.sectionId)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {u.role === "student" && me && (
            <div className="mt-6 border-t border-mist pt-4">
              <h3 className="mb-2 font-display text-[14px] font-bold">My placement</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="pine" className="!text-[11.5px]"><BookOpen className="h-3 w-3" /> {sectionLabel(db, me.enrollment?.classId, me.enrollment?.sectionId)}</Chip>
                <Chip tone="gray" className="font-mono">{me.regId}</Chip>
                <Chip tone="gold">Avg {studentAverage(db, me) ?? "—"}%</Chip>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
