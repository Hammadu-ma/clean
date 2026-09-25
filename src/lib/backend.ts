import { supabase, isSupabaseConfigured } from "./supabase";
import { apiSession } from "./http";
import { buildSeed } from "../data/seed";
import type {
  DB, User, Student, Enrollment, StudentDoc, AssessmentStructure, AssessmentItem, AttendanceRecord,
  Announcement, Conversation, Message, MessageReport, AppNotification, SchoolEvent, AuditEntry, RoleDef, Homework,
} from "../types";

/**
 * Backend adapter — the single place where the in-memory `DB` shape meets the
 * real Supabase/PostgreSQL schema.
 *
 *  - hydrate()  : loads every collection through the anon client. Row Level
 *                 Security on the server decides what THIS user may see; the
 *                 client never filters for security, only for shape.
 *  - sync()     : diffs an old DB snapshot against a new one and applies the
 *                 delta (upsert / delete) to PostgreSQL. This lets the whole
 *                 app keep calling `update((d) => …)` unchanged.
 *
 * Identity model after migration:
 *  - `User.id` is the profiles row UUID (== auth.users.id). Every user
 *    reference (senderId, participants, readBy, childrenIds guardian side) is
 *    a UUID and stays internally consistent because it all hydrates together.
 *  - Domain entities (teachers t1, students st1, classes c8, …) keep their
 *    short text ids — the schema uses text PKs for exactly this reason.
 */

const SCHOOL_ID = "school-1";
/** Falls back to these only if a school row genuinely has none set yet
 *  (e.g. these migrations haven't been applied). Once set, a school's own
 *  configured days/periods (however many, whichever ones) always win.
 *  Monday first (0-4) for days, matching the fixed weekday indexing in
 *  0039 — see that migration for why this isn't Sunday-first. */
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];
export const DEFAULT_PERIODS = [
  { period: 1, time: "08:00" }, { period: 2, time: "09:00" }, { period: 3, time: "10:30" },
  { period: 4, time: "11:30" }, { period: 5, time: "13:30" }, { period: 6, time: "14:30" },
];
const sb = () => supabase;

export type DbMode = "live" | "local" | "off";

/**
 * Probe the remote schema without writing anything. Distinguishes:
 *   live    — tables exist (data may be empty)
 *   missing — reachable project, migrations definitely not applied (PGRST205 / 42P01)
 *   off     — client not configured
 *   error   — probe itself failed (network blip, timeout, rate limit, transient
 *             5xx…) — NOT the same as "missing". Treating this the same as
 *             "missing" used to flip a live, already-signed-in session into
 *             fake local fallback data on nothing more than a dropped request —
 *             which looked like data loss / being logged out on refresh.
 */
export async function checkSchema(): Promise<DbMode | "missing" | "error"> {
  try {
    // ---------------------------------------------------------------------
    // THIS PROBE MUST NOT REQUIRE A SESSION.
    //
    // It previously called an allowlisted RPC, which the API answers with 401
    // when nobody is signed in. On a cold load that is always the case — so
    // the probe reported "error", hydrateCore() reported mode "off", and
    // store.tsx's login() refuses to run unless mode is "live". The result
    // was a deadlock: you could not sign in because the app believed it
    // wasn't connected, and it could not become connected because signing in
    // was blocked. That is the "never connects to Supabase" symptom.
    //
    // /api/health is unauthenticated by design and reports which link in the
    // chain is broken, so connectivity is established before, and
    // independently of, anyone signing in.
    // ---------------------------------------------------------------------
    const res = await fetch("/api/health", { credentials: "same-origin" });
    const health = (await res.json().catch(() => null)) as
      | { ok?: boolean; stage?: string; problem?: string; fix?: string }
      | null;

    if (!health) {
      console.warn("[backend] /api/health returned nothing — is the api/ directory deployed?");
      return "error";
    }
    if (health.ok) return "live";

    // Surfaced in full: this is the one message that tells an operator what
    // to actually change, and swallowing it is what made this hard to debug.
    console.error(
      `[backend] backend not ready (${health.stage}): ${health.problem}\n${health.fix ?? ""}`
    );

    if (health.stage === "migrations") return "missing";
    return "error";
  } catch (e) {
    console.warn("[backend] health probe threw:", e);
    return "error";
  }
}

/* Deliberately no applyMigrations()/Management-API helper here. That would
 * mean the app ships a code path whose entire purpose is accepting a
 * service_role (project-admin) key from a text input and sending it to
 * api.supabase.com from the browser — exactly the kind of secret this
 * project keeps out of client code. Schema changes are an operator action:
 * run supabase/migrations/*.sql via the Supabase CLI or the dashboard's SQL
 * Editor, from a trusted machine, never from this app. */

/* =========================================================================
   hydrate — Supabase → DB shape

   Boot no longer pulls every table up front. hydrateCore() loads only the
   small reference data (school structure, people, permissions) every role
   needs before anything can render — around a dozen tables instead of all
   33. Feature-specific data (messages, attendance, fees, homework, marks,
   announcements, notifications, events, audit) is loaded lazily by
   hydrateGroup() the first time a page that needs it actually mounts, via
   ensureGroup() in store.tsx. The full hydrate() below still exists for the
   rare full-resync path (recovering from a failed write) where correctness
   matters more than speed.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   LEGACY READ PATH — deliberately contained, and on its way out.

   `sel()` used to be `from(table).select('*')`, which needed the browser to
   hold a database credential and have PostgREST access to every table. Both
   are gone. Rather than reintroduce a generic table endpoint — which would
   hand back exactly the surface this refactor removed — this reads the
   allowlisted `get_app_snapshot()` once per session and serves table slices
   out of it.

   Be clear-eyed about what that is: a compatibility shim. It is the SAME
   whole-database read the app always did, just behind the API now, so it is
   no faster than before and it still grows with the school. It exists so
   that pages which haven't been migrated to src/lib/api.ts keep working
   today, not because it is a good way to read data.

   Every page moved onto the paged hooks in api.ts stops touching this. When
   the last one has, delete this function, delete `get_app_snapshot` from
   api/_lib/allowlist.ts, and the legacy path is gone for good.
   --------------------------------------------------------------------------- */

const snapshotPromises = new Map<string, Promise<Record<string, any[]> | null>>();

/**
 * `get_app_snapshot()` is used as a compatibility read path for legacy pages.
 * It is safe to deduplicate concurrent callers, but it must NEVER cache a
 * resolved snapshot: resolved caching made realtime/polling reads permanently
 * stale until a full page reload. The map therefore contains only in-flight
 * requests and is cleared in `finally()` when each request settles.
 */
function legacySnapshot(yearId?: string): Promise<Record<string, any[]> | null> {
  const key = yearId ?? "__active__";
  const cached = snapshotPromises.get(key);
  if (cached) return cached;

  const p = (async () => {
    const { data, error } = await sb()!.rpc<Record<string, any[]>>("get_app_snapshot", {
      p_year_id: yearId ?? null,
    });
    if (error) {
      if (/going a bit fast|rate.?limit|too many requests/i.test(error.message)) {
        console.debug("[backend] legacy snapshot temporarily rate-limited; live polling will retry at its next interval.");
      } else {
        console.warn("[backend] legacy snapshot failed:", error.message);
      }
      return null;
    }
    return data ?? null;
  })().finally(() => {
    if (snapshotPromises.get(key) === p) snapshotPromises.delete(key);
  });

  snapshotPromises.set(key, p);
  return p;
}

/** Clears only currently in-flight snapshot deduplication entries. Resolved
 * snapshots are never retained, so subsequent reads are always fresh. */
export function invalidateLegacySnapshot() {
  snapshotPromises.clear();
}

async function sel<T = any>(table: string, yearId?: string, _select = "*"): Promise<T[] | null> {
  const snap = await legacySnapshot(yearId);
  if (!snap) return null;
  const rows = snap[table];
  if (!Array.isArray(rows)) {
    console.warn(`[backend] "${table}" is not in the snapshot — migrate this read to src/lib/api.ts`);
    return [];
  }
  return rows as T[];
}

export type LazyGroup =
  | "academics" | "attendance" | "fees" | "homework" | "timetable"
  | "announcements" | "messaging" | "notifications" | "events" | "audit" | "reports";

export const ALL_LAZY_GROUPS: LazyGroup[] = [
  "academics", "attendance", "fees", "homework", "timetable",
  "announcements", "messaging", "notifications", "events", "audit", "reports",
];

/* =========================================================================
   dbCache — per-tab instant-repaint cache

   Not a source of truth; every value it returns is about to be (or was
   just) confirmed by a live fetch. On a full page reload the app used to
   sit on a blank spinner for the entire round trip to Supabase before
   painting anything. This shaves that down to ~0 for a returning session:
   the last confirmed snapshot for *this exact signed-in user*, on *this
   browser tab*, paints immediately, then the real hydrateCore()/hydrateGroup()
   call underneath it still runs and silently reconciles a moment later —
   so a reload never shows more than a beat of (at most seconds-old, and
   usually identical) data before it's re-confirmed live.

   sessionStorage (not localStorage) is deliberate: it clears itself when
   the tab closes, so there's no risk of a stale snapshot lingering for
   days, and it's already scoped per-tab so two tabs signed in as different
   people on a shared computer never collide.
   ========================================================================= */
const CACHE_VERSION = "v1";
const cachePrefix = (uid: string) => `sms_cache_${CACHE_VERSION}_${uid}_`;

function cacheKey(uid: string, part: "core" | LazyGroup): string {
  return `${cachePrefix(uid)}${part}`;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // private browsing, corrupted entry, etc. — just skip the cache
  }
}

function writeCache(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage unavailable — the cache is purely an
    // optimization, so failing to write it should never break the app.
  }
}

/** Wipes every cached snapshot for one user (called on logout) so nothing
 *  from their session could ever flash onto screen for whoever uses this
 *  tab next. */
function clearUserCache(uid: string) {
  try {
    const prefix = cachePrefix(uid);
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

export const dbCache = { cacheKey, readCache, writeCache, clearUserCache };

/* ---- field mappers, shared by hydrateCore/hydrateGroup so the Supabase
   row → DB shape logic lives in exactly one place each ---- */

function mapStructures(structures: any[], items: any[], db: DB): AssessmentStructure[] {
  return structures.map((st: any) => ({
    id: st.id, yearId: st.year_id, classId: st.class_id, subjectId: st.subject_id, period: termName(db, st.term_id),
    items: items.filter((i: any) => i.structure_id === st.id).sort((a: any, b: any) => a.sort - b.sort)
      .map((i: any) => ({ id: i.id, name: i.name, max: Number(i.max_mark), weight: Number(i.weight) })),
  })) as AssessmentStructure[];
}
function mapAssessmentMarks(marks: any[]): DB["assessmentMarks"] {
  const am: DB["assessmentMarks"] = {};
  for (const m of marks) {
    am[m.structure_id] = am[m.structure_id] ?? {};
    am[m.structure_id][m.student_id] = am[m.structure_id][m.student_id] ?? {};
    am[m.structure_id][m.student_id][m.item_id] = Number(m.raw_mark);
  }
  return am;
}
function mapSubmissions(submissions: any[]) {
  return submissions.map((s: any) => ({
    id: s.id, structureId: s.structure_id, status: s.status,
    submittedBy: s.submitted_by, submittedAt: s.submitted_at,
    approvedBy: s.approved_by, approvedAt: s.approved_at,
    returnedBy: s.returned_by, returnedAt: s.returned_at, returnReason: s.return_reason,
    publishedBy: s.published_by, publishedAt: s.published_at, reopenReason: s.reopen_reason,
    reopenRequestStatus: s.reopen_request_status ?? "none",
    reopenRequestedBy: s.reopen_requested_by ?? undefined,
    reopenRequestedAt: s.reopen_requested_at ?? undefined,
    reopenRequestReason: s.reopen_request_reason ?? undefined,
    reopenDecidedBy: s.reopen_decided_by ?? undefined,
    reopenDecidedAt: s.reopen_decided_at ?? undefined,
    reopenDecisionNote: s.reopen_decision_note ?? undefined,
  }));
}
function mapGrading(gradeBands: any[]) {
  return gradeBands.slice().sort((a: any, b: any) => a.sort - b.sort)
    .map((g: any) => ({ id: g.id, yearId: g.year_id, min: Number(g.min_pct), max: Number(g.max_pct), grade: g.grade, remark: g.remark ?? "" }));
}
function mapAttendance(registers: any[], entries: any[]): AttendanceRecord[] {
  return registers.map((r: any) => {
    const marks: AttendanceRecord["marks"] = {};
    for (const e of entries) if (e.register_id === r.id) marks[e.student_id] = e.status;
    return { date: r.day, classId: r.class_id, sectionId: r.section_id, marks } as AttendanceRecord;
  });
}
function mapFees(fees: any[]) {
  return fees.map((f: any) => ({ id: f.id, studentId: f.student_id, label: f.label, amount: Number(f.amount), paid: Number(f.paid), due: f.due_date, payments: f.payments ?? [] }));
}
function mapBankAccounts(accounts: any[]) {
  return accounts.map((a: any) => ({ id: a.id, bankName: a.bankName ?? a.bank_name, accountName: a.accountName ?? a.account_name, accountNumber: a.accountNumber ?? a.account_number, branch: a.branch, note: a.note }));
}
function mapPaymentRequests(reqs: any[]) {
  return reqs.map((r: any) => ({
    id: r.id, studentId: r.student_id, feeItemId: r.fee_item_id, amount: Number(r.amount),
    bankAccountId: r.bank_account_id, bankName: r.bank_name, reference: r.reference ?? undefined,
    receiptPath: r.receipt_path ?? undefined, receiptName: r.receipt_name ?? undefined,
    submittedBy: r.submitted_by, submittedByName: r.submitted_by_name ?? undefined, submittedAt: r.submitted_at,
    status: r.status, reviewedBy: r.reviewed_by ?? undefined, reviewedByName: r.reviewed_by_name ?? undefined,
    reviewedAt: r.reviewed_at ?? undefined, reviewNote: r.review_note ?? undefined,
  }));
}
function mapHomework(homework: any[]) {
  return homework.map((h: any) => ({ id: h.id, yearId: h.year_id, classId: h.class_id, sectionId: h.section_id, subjectId: h.subject_id, title: h.title, description: h.description, issued: h.issued, due: h.due, submitted: h.submitted_students ?? [] }));
}
function mapTimetable(timetable: any[]) {
  return timetable.map((t: any) => ({ id: t.id, classId: t.class_id, sectionId: t.section_id, day: t.day, period: t.period, subjectId: t.subject_id, room: t.room }));
}
function mapAnnouncements(announcements: any[], reads: any[]): Announcement[] {
  return announcements.map((a: any) => ({
    id: a.id, title: a.title, body: a.body, category: a.category, senderId: a.sender_id,
    audience: a.audience, status: a.status, createdAt: a.created_at, scheduledFor: a.scheduled_for,
    publishedAt: a.published_at, pinned: a.pinned,
    readBy: reads.filter((r: any) => r.announcement_id === a.id).map((r: any) => r.profile_id),
  })) as Announcement[];
}
export function mapConversations(conversations: any[], participants: any[]): Conversation[] {
  return conversations.map((c: any) => ({
    id: c.id, type: "direct" as const,
    participants: participants.filter((p: any) => p.conversation_id === c.id).map((p: any) => p.profile_id),
    relatedStudentId: c.related_student_id, relatedClassId: c.related_class_id,
    relatedSectionId: c.related_section_id, relatedSubjectId: c.related_subject_id,
    createdAt: c.created_at, updatedAt: c.updated_at, status: c.status,
  })) as Conversation[];
}
export function mapMessages(messages: any[]): Message[] {
  return messages.map((m: any) => ({
    id: m.id, conversationId: m.conversation_id, senderId: m.sender_id, body: m.body,
    createdAt: m.created_at, readBy: m.read_by ?? [], status: (m.read_by?.length ?? 0) > 1 ? "read" : "sent",
  })) as Message[];
}
function mapNotifications(notifications: any[]): AppNotification[] {
  return [...notifications]
    .sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .map((n: any) => ({
      id: n.id, userId: n.profile_id, type: n.type, title: n.title, body: n.body, at: n.created_at, read: n.is_read, targetType: n.target_type ?? undefined, targetId: n.target_id ?? undefined, targetRoute: n.target_route ?? undefined,
    })) as AppNotification[];
}
function mapEvents(events: any[]): SchoolEvent[] {
  return events.map((e: any) => ({
    id: e.id, title: e.title, description: e.description, date: e.day, time: e.time_of_day,
    location: e.location, category: e.category, audience: e.audience, createdBy: e.created_by,
  })) as SchoolEvent[];
}
function mapAudit(audit: any[]): AuditEntry[] {
  return audit.map((a: any) => ({
    id: a.id, userId: a.actor_id, userName: a.actor_name, action: a.action, target: a.target, detail: a.detail, at: a.at,
  })) as AuditEntry[];
}
function mapReports(reports: any[]): MessageReport[] {
  return reports.map((r: any) => ({
    id: r.id, messageId: r.message_id, conversationId: r.conversation_id, reporterId: r.reporter_id, reportedUserId: r.reported_user_id ?? undefined,
    reason: r.reason, detail: r.detail, at: r.created_at, status: r.status,
  })) as MessageReport[];
}

/**
 * Loads only the small, always-needed reference data — school structure,
 * people, permissions — every role needs before it can render a dashboard
 * at all (~14 tables). Feature data stays empty here; hydrateGroup() fills
 * it in on demand. This is the call on the critical path to first paint.
 *
 * Two data paths, same output shape:
 *  - Fast path: a single `get_app_bootstrap()` RPC (see migration
 *    0012_fast_bootstrap.sql) that returns every core table in one round
 *    trip instead of 14. This is tried first.
 *  - Fallback path: the original per-table `sel()` fan-out, used if the RPC
 *    errors (e.g. a project that hasn't run 0012 yet) or returns something
 *    that doesn't parse the way we expect. Correctness always wins over
 *    speed here — a failed fast path silently costs a moment, never data.
 */
type CoreRows = {
  schools: any[] | null; years: any[] | null; terms: any[] | null; classes: any[] | null; sections: any[] | null;
  subjects: any[] | null; teachers: any[] | null; assignments: any[] | null;
  students: any[] | null; enrollments: any[] | null; documents: any[] | null;
  roleDefs: any[] | null; rolePerms: any[] | null; profiles: any[] | null; guardianStudents: any[] | null;
};

/** Maps raw core rows (same shape regardless of which path fetched them)
 *  onto `seed`, in place, and returns whether we actually got live data. */
function applyCoreRows(seed: DB, rows: CoreRows, selectedYearId?: string): { db: DB; remote: boolean } {
  const { schools, years, terms, classes, sections, subjects, teachers, assignments, students, enrollments, documents, roleDefs, rolePerms, profiles, guardianStudents } = rows;
  const db: DB = seed;
  let remote = false;

  if (schools) {
    remote = true;
    const s = schools.find((x: any) => x.id === SCHOOL_ID);
    if (s) {
      const days = Array.isArray(s.working_days) && s.working_days.length ? s.working_days : DEFAULT_WORKING_DAYS;
      const periods = Array.isArray(s.periods) && s.periods.length ? s.periods : DEFAULT_PERIODS;
      const logos = Array.isArray(s.logo_keys) ? s.logo_keys : [];
      db.settings = {
        schoolName: s.name ?? "",
        motto: s.motto ?? "",
        logos: logos.map((x: any) => typeof x === "string" ? { key: x, name: x.split("/").pop() || "School logo" } : { key: String(x.key ?? ""), name: String(x.name ?? "School logo") }).filter((x: any) => x.key),
        activeLogoKey: s.active_logo_key ?? undefined,
        bankAccounts: mapBankAccounts(s.bank_accounts ?? []),
        workingDays: days,
        periods,
      };
    }
  }
  if (years) db.years = years.map((y: any) => ({ id: y.id, name: y.name, start: y.start_date, end: y.end_date, active: y.is_active, showGrade: y.show_grade !== false }));
  if (terms) db.terms = (terms as any[]).map((t) => ({ id: t.id, yearId: t.year_id, name: t.name, seq: t.seq }));
  if (classes && sections) {
    db.classes = classes.map((c: any) => ({
      id: c.id, name: c.name, level: c.level,
      sections: sections.filter((s: any) => s.class_id === c.id).map((s: any) => ({ id: s.id, name: s.name })),
    }));
  }
  if (subjects) db.subjects = subjects.map((s: any) => ({ id: s.id, name: s.name, code: s.code, color: s.color }));
  if (teachers) db.teachers = teachers.map((t: any) => ({ id: t.id, name: t.name, phone: t.phone, email: t.email, specialty: t.specialty }));
  if (assignments) db.assignments = assignments.map((a: any) => ({ id: a.id, yearId: a.year_id, classId: a.class_id, sectionId: a.section_id, subjectId: a.subject_id, teacherId: a.teacher_id }));

  if (students) {
    const enr = enrollments ?? [];
    const docs = documents ?? [];
    db.students = students.map((s: any) => {
      const hist: Enrollment[] = enr
        .filter((e: any) => e.student_id === s.id)
        .map((e: any) => ({ yearId: e.year_id, classId: e.class_id, sectionId: e.section_id, rollNumber: e.roll_number, status: e.status, enrolledOn: e.enrolled_on }));
      const targetYear = selectedYearId ?? years?.find((y: any) => y.is_active)?.id;
      // `enrollment` is the student's enrollment for the year currently being viewed.
      // `history` deliberately keeps every academic-year enrollment for the profile/history UI.
      const current = hist.find((h) => h.yearId === targetYear) ?? undefined;
      const sd: StudentDoc[] = docs.filter((d: any) => d.student_id === s.id)
        .map((d: any) => ({ id: d.id, name: d.name, kind: d.kind, size: d.size, date: d.doc_date, storagePath: d.storage_path || undefined }));
      return {
        id: s.id, regId: s.reg_no,
        firstName: s.first_name, middleName: s.middle_name, lastName: s.last_name,
        gender: s.gender, dob: s.dob, phone: s.phone, email: s.email, address: s.address,
        photo: s.photo_path || undefined,
        guardian: { father: s.guardian_name ?? "", mother: s.mother_name, relation: s.guardian_relation ?? "Father", phone: s.guardian_phone, address: s.guardian_address },
        admission: { number: s.admission_no ?? "", date: s.admission_date, previousSchool: s.previous_school, type: s.admission_type ?? "New Admission" },
        enrollment: current, history: hist, documents: sd,
      } as Student;
    });
  }

  if (roleDefs) {
    const perms = rolePerms ?? [];
    db.roles = (roleDefs as any[]).map((r) => ({
      id: r.id, name: r.name, description: r.description, system: r.is_system, appliesTo: r.applies_to ?? [], status: r.status,
      permissions: r.all_permissions ? ["*"] : (perms as any[]).filter((p) => p.role_def_id === r.id).map((p) => p.permission_id),
    })) as RoleDef[];
  }

  if (profiles) {
    const gs = guardianStudents ?? [];
    db.users = (profiles as any[]).map((p) => ({
      id: p.id, name: p.full_name, username: p.username, password: "",
      role: p.role, roleId: p.role_def_id, status: p.status,
      email: p.email, phone: p.phone, teacherId: p.teacher_id, studentId: p.student_id,
      childrenIds: p.role === "guardian" ? (gs as any[]).filter((g) => g.guardian_id === p.id).map((g) => g.student_id) : undefined,
      createdAt: p.created_at,
    })) as User[];
  }

  return { db, remote };
}

/** Fast path: one `get_app_bootstrap()` RPC (+ the one small table it
 *  doesn't carry, student_documents, fetched alongside it) instead of 14
 *  separate requests. `null` means "couldn't use it, fall back". */
async function hydrateCoreViaBootstrap(seed: DB, yearId?: string): Promise<{ db: DB; remote: boolean } | null> {
  try {
    const [{ data, error }, documents] = await Promise.all([
      sb()!.rpc("get_app_bootstrap", { p_year_id: yearId ?? null }) as unknown as Promise<{ data: any; error: any }>,
      sel<any>("student_documents", yearId),
    ]);
    if (error || !data || !Array.isArray(data.schools)) return null;
    return applyCoreRows(seed, {
      schools: data.schools, years: data.academic_years, terms: data.terms,
      classes: data.classes, sections: data.sections, subjects: data.subjects,
      teachers: data.teachers, assignments: data.teacher_assignments,
      students: data.students, enrollments: data.enrollments, documents: documents ?? [],
      roleDefs: data.role_defs, rolePerms: data.role_permissions,
      profiles: data.profiles, guardianStudents: data.guardian_students,
    }, yearId);
  } catch (e) {
    console.warn("[backend] get_app_bootstrap RPC unavailable, falling back to per-table fetch:", e);
    return null;
  }
}

/** Slow-but-proven path: one request per core table, run in parallel. */
async function hydrateCoreViaTables(seed: DB, selectedYearId?: string): Promise<{ db: DB; remote: boolean }> {
  const [
    schools, years, terms, classes, sections, subjects, teachers, assignments,
    students, enrollments, documents,
    roleDefs, rolePerms, profiles, guardianStudents,
  ] = await Promise.all([
    sel("schools"), sel("academic_years"), sel("terms"), sel("classes"), sel("sections"),
    sel("subjects"), sel("teachers"), sel("teacher_assignments"),
    sel("students"), sel("enrollments"), sel("student_documents"),
    sel("role_defs"), sel("role_permissions"), sel("profiles"), sel("guardian_students"),
  ]);
  return applyCoreRows(seed, { schools, years, terms, classes, sections, subjects, teachers, assignments, students, enrollments, documents, roleDefs, rolePerms, profiles, guardianStudents }, selectedYearId);
}

/** Once a hydrateCore() in this tab has genuinely confirmed the schema is
 *  live, skip re-probing it (`checkSchema()`) on every subsequent call —
 *  e.g. right after login, or a page-triggered reconnect. The probe is only
 *  there to tell "not configured" / "migrations not applied" / "live" apart
 *  on the very first load; once we know it's live this tab, asking again is
 *  a pure extra round trip on the critical path. If live data genuinely
 *  stops coming back, the fetch itself reports transientError and this
 *  flag is cleared so the next call re-probes properly. */
let knownLive = false;

/**
 * Lightweight poll for "did my own permission set change" — a few bytes
 * (a permission-id array) instead of a full core re-hydrate. Used to make
 * RolesPage's own claim true: it tells the admin granting a role
 * "permissions apply immediately" and a disabled role's users "lose
 * access immediately", but until this was wired in, that was only ever
 * true for the editing admin's own tab (via the normal optimistic
 * update()) — everyone else's already-open session kept whatever
 * role_defs it loaded at boot until they manually reloaded the page.
 * Returns null on any failure so callers can just skip that sync tick.
 */
export async function fetchMyPermissions(): Promise<string[] | null> {
  try {
    const { data, error } = await sb()!.rpc("my_permissions", {});
    if (error || !Array.isArray(data)) return null;
    return data as string[];
  } catch (e) {
    console.warn("[backend] fetchMyPermissions failed:", e);
    return null;
  }
}

export async function hydrateCore(yearId?: string): Promise<{ db: DB; mode: DbMode; schemaMissing: boolean; transientError: boolean }> {
  const seed = buildSeed();
  const probe = knownLive ? "live" : await checkSchema();
  if (probe === "off") { knownLive = false; return { db: seed, mode: "off", schemaMissing: false, transientError: false }; }
  if (probe === "missing") { knownLive = false; return { db: seed, mode: "local", schemaMissing: true, transientError: false }; }
  // Probe itself failed (network blip, timeout, transient 5xx) — this is not
  // "schema missing" or "not configured". Caller keeps whatever it already
  // had (cached live data, current session) instead of swapping in the fake
  // seed and dropping the user's session.
  if (probe === "error") return { db: seed, mode: "off", schemaMissing: false, transientError: true };

  // Connected, but nobody is signed in yet. That is the normal state of the
  // login screen, and it is NOT a failure — report "live" with an empty
  // database so the login form is enabled. Fetching data before there is a
  // session would only produce 401s.
  if (!(await apiSession())) {
    const empty = buildSeed();
    empty.students = []; empty.users = []; empty.teachers = []; empty.enrollments = [];
    empty.structures = []; empty.assessmentMarks = {}; empty.submissions = []; empty.grading = [];
    empty.attendance = []; empty.fees = []; empty.paymentRequests = []; empty.homework = [];
    empty.timetable = []; empty.announcements = []; empty.conversations = []; empty.messages = [];
    empty.notifications = []; empty.events = []; empty.audit = []; empty.reports = [];
    knownLive = true;
    return { db: empty, mode: "live", schemaMissing: false, transientError: false };
  }

  const boot = await hydrateCoreViaBootstrap(seed, yearId);
  const { db, remote } = boot ?? await hydrateCoreViaTables(seed, yearId);

  // In live mode, lazy-loaded fields start genuinely empty rather than the
  // local seed placeholder content, so a page can tell "not fetched yet"
  // apart from "no rows" and show a loading state instead of fake data
  // until hydrateGroup() fills the field in.
  if (remote) {
    db.structures = []; db.assessmentMarks = {}; db.submissions = []; db.grading = [];
    db.attendance = []; db.fees = []; db.paymentRequests = []; db.homework = []; db.timetable = [];
    db.announcements = []; db.conversations = []; db.messages = [];
    db.notifications = []; db.events = []; db.audit = []; db.reports = [];
  }

  // checkSchema() already confirmed the schema exists — if the `schools`
  // fetch here still came back null, that's a flaky individual request, not
  // "schema missing". Report it as transient rather than demoting to local.
  if (!remote) { knownLive = false; return { db: seed, mode: "off", schemaMissing: false, transientError: true }; }
  knownLive = true;
  return { db, mode: "live", schemaMissing: false, transientError: false };
}

/**
 * Loads one feature's tables on demand — called the first time a page that
 * needs them mounts (see ensureGroup() in store.tsx) — and returns just the
 * DB fields that group owns, to be merged into the in-memory db. `base`
 * supplies cross-references a mapper needs (e.g. db.terms for naming
 * assessment periods); pass the current db.
 */
export async function hydrateGroup(group: LazyGroup, base: DB, yearId?: string): Promise<Partial<DB>> {
  if (!isSupabaseConfigured) return {};
  switch (group) {
    case "academics": {
      const [structures, items, marks, submissions, gradeBands] = await Promise.all([
        sel("assessment_structures", yearId), sel("assessment_items", yearId), sel("assessment_marks", yearId),
        sel("mark_submissions", yearId), sel("grade_bands", yearId),
      ]);
      const out: Partial<DB> = {};
      if (structures && items) out.structures = mapStructures(structures, items, base);
      if (marks) out.assessmentMarks = mapAssessmentMarks(marks);
      if (submissions) out.submissions = mapSubmissions(submissions);
      if (gradeBands) out.grading = mapGrading(gradeBands);
      return out;
    }
    case "attendance": {
      const [registers, entries] = await Promise.all([sel("attendance_registers", yearId), sel("attendance_entries", yearId)]);
      return registers && entries ? { attendance: mapAttendance(registers, entries) } : {};
    }
    case "fees": {
      const [fees, paymentRequests] = await Promise.all([sel("fee_items", yearId), sel("fee_payment_requests", yearId)]);
      const out: Partial<DB> = {};
      if (fees) out.fees = mapFees(fees);
      if (paymentRequests) out.paymentRequests = mapPaymentRequests(paymentRequests);
      return out;
    }
    case "homework": {
      const homework = await sel("homework", yearId);
      return homework ? { homework: mapHomework(homework) } : {};
    }
    case "timetable": {
      const timetable = await sel("timetable_entries", yearId);
      return timetable ? { timetable: mapTimetable(timetable) } : {};
    }
    case "announcements": {
      // Not year-scoped server-side (see 0035) — same data regardless of
      // yearId, but still keyed per-year in the snapshot cache below since
      // it's cheap and keeps this call from forcing a shared cache entry.
      const [announcements, reads] = await Promise.all([sel("announcements", yearId), sel("announcement_reads", yearId)]);
      return announcements ? { announcements: mapAnnouncements(announcements, reads ?? []) } : {};
    }
    case "messaging": {
      const [conversations, participants, messages] = await Promise.all([
        sel("conversations", yearId), sel("conversation_participants", yearId), sel("messages", yearId),
      ]);
      const out: Partial<DB> = {};
      if (conversations && participants) out.conversations = mapConversations(conversations, participants);
      if (messages) out.messages = mapMessages(messages);
      return out;
    }
    case "notifications": {
      const notifications = await sel("notifications", yearId);
      return notifications ? { notifications: mapNotifications(notifications) } : {};
    }
    case "events": {
      const events = await sel("events", yearId);
      return events ? { events: mapEvents(events) } : {};
    }
    case "audit": {
      const audit = await sel("audit_log", yearId);
      return audit ? { audit: mapAudit(audit) } : {};
    }
    case "reports": {
      const reports = await sel("message_reports", yearId);
      return reports ? { reports: mapReports(reports) } : {};
    }
  }
}

/**
 * Full resync — core plus every lazy group. Used only for the rare
 * error-recovery path (a failed write re-pulls all state to stay correct),
 * where correctness matters more than speed. Normal boot and page
 * navigation use hydrateCore() + hydrateGroup() instead, which is what
 * actually fixes first-load latency.
 */
export async function hydrate(): Promise<{ db: DB; mode: DbMode; schemaMissing: boolean; transientError: boolean }> {
  const core = await hydrateCore();
  if (core.mode !== "live") return core;
  const groups = await Promise.all(ALL_LAZY_GROUPS.map((g) => hydrateGroup(g, core.db)));
  for (const partial of groups) Object.assign(core.db, partial);
  return core;
}

/* =========================================================================
   sync — DB-diff → PostgreSQL
   ========================================================================= */

/* ---------------------------------------------------------------------------
   LEGACY WRITE PATH — intentionally not shimmed.

   Reads above got a compatibility shim so nothing breaks while pages
   migrate. Writes do NOT, and the difference is deliberate.

   To keep `upsert(table, rows)` working I would have had to publish an
   endpoint that accepts an arbitrary table name and arbitrary row objects
   and writes them. That is the single most dangerous thing this API could
   offer: it would let any authenticated session attempt a write to any
   table with any columns, and the only thing standing in the way would be
   RLS — which is precisely the "one boundary, and it had better be perfect"
   situation the move to a server backend exists to end.

   So each write is a named operation instead, with its own permission
   check, in supabase/migrations/0026 through 0040. As of 0040, every
   table the app actually writes to has one — this file's upsert()/remove()
   below now have zero real callers and exist only as a defensive fallback
   (a loud, immediately-visible failure) should a future change accidentally
   introduce a raw write again, not as an expected code path:

       students, marks, attendance, fees, messages, roles, notifications,
       files, user accounts, academic years, classes, sections, subjects,
       teachers, teacher assignments, student documents, assessment
       structures/items, grade bands, fee payment requests, homework,
       timetable entries, announcements, events, settings/bank accounts,
       starting a conversation, message reports (filing and reviewing).
   --------------------------------------------------------------------------- */

/** Tables reaching this file's generic upsert()/remove() still have no named
 *  write op at all (see the STILL UNWIRED list above) — this only makes the
 *  resulting error say "there is no operation yet" instead of a bare 404.
 *  Tables with a real op (students, marks, attendance, fees, messages,
 *  roles, notifications, academic years, user accounts) are routed to it
 *  directly by sync{Students,Marks,Submissions,Attendance,Fees,Roles,Messages}
 *  / syncProfiles above and never reach upsert()/remove() at all. */
const WRITE_REPLACEMENTS: Record<string, string> = {};

function legacyWriteError(table: string): string {
  const replacement = WRITE_REPLACEMENTS[table];
  return (
    `Writes to "${table}" no longer go through snapshot syncing. ` +
    (replacement
      ? `Use ${replacement} via callWrite() from src/lib/http.ts.`
      : `Add a function to supabase/migrations and publish it in api/_lib/allowlist.ts.`) +
    ` See SECURITY_AND_BACKEND.md.`
  );
}

async function upsert(table: string, rows: any[], _onConflict?: string, errors?: string[]) {
  if (!rows.length) return;
  const msg = legacyWriteError(table);
  console.error(`[backend] ${msg}`);
  errors?.push(`${table}: ${msg}`);
}

async function remove(table: string, ids: string[], errors?: string[]) {
  if (!ids.length) return;
  const msg = legacyWriteError(table);
  console.error(`[backend] ${msg}`);
  errors?.push(`${table}: ${msg}`);
}

function diff<T extends { id: string }>(oldR: T[], newR: T[], key: (r: T) => string = (r) => r.id) {
  const om = new Map(oldR.map((r) => [key(r), r]));
  const nm = new Map(newR.map((r) => [key(r), r]));
  const up: T[] = [];
  for (const [k, r] of nm) {
    const o = om.get(k);
    if (!o || JSON.stringify(o) !== JSON.stringify(r)) up.push(r);
  }
  const del = [...om.keys()].filter((k) => !nm.has(k));
  return { up, del };
}

/** Serialize the full DB into flat row-sets keyed by table. */
function rowsOf(db: DB) {
  const R: Record<string, any[]> = {
    academic_years: db.years.map((y) => ({ id: y.id, school_id: SCHOOL_ID, name: y.name, start_date: y.start, end_date: y.end, is_active: y.active, show_grade: y.showGrade !== false })),
    terms: db.terms.map((t) => ({ id: t.id, year_id: t.yearId, name: t.name, seq: t.seq })),
    classes: db.classes.map((c) => ({ id: c.id, school_id: SCHOOL_ID, name: c.name, level: c.level })),
    sections: db.classes.flatMap((c) => c.sections.map((s) => ({ id: s.id, class_id: c.id, name: s.name }))),
    subjects: db.subjects.map((s) => ({ id: s.id, school_id: SCHOOL_ID, code: s.code, name: s.name, color: s.color })),
    teachers: db.teachers.map((t) => ({ id: t.id, school_id: SCHOOL_ID, name: t.name, phone: t.phone, email: t.email, specialty: t.specialty })),
    teacher_assignments: db.assignments.map((a) => ({ id: a.id, year_id: a.yearId, class_id: a.classId, section_id: a.sectionId, subject_id: a.subjectId, teacher_id: a.teacherId })),
    students: db.students.map((s) => ({
      id: s.id, school_id: SCHOOL_ID, reg_no: s.regId, admission_no: s.admission.number,
      first_name: s.firstName, middle_name: s.middleName, last_name: s.lastName, gender: s.gender,
      dob: s.dob, phone: s.phone, email: s.email, address: s.address, status: (s as any).status ?? "active",
      guardian_name: s.guardian.father, guardian_relation: s.guardian.relation, guardian_phone: s.guardian.phone,
      guardian_address: s.guardian.address, mother_name: s.guardian.mother,
      admission_date: s.admission.date, previous_school: s.admission.previousSchool, admission_type: s.admission.type,
      photo_path: s.photo ?? null,
    })),
    enrollments: db.students.flatMap((s) => s.history.map((h) => ({
      id: `${s.id}|${h.yearId}`, student_id: s.id, year_id: h.yearId, class_id: h.classId,
      section_id: h.sectionId, roll_number: h.rollNumber ?? null,
      status: h.status ?? (s.enrollment?.yearId === h.yearId ? "active" : "active"),
      enrolled_on: h.enrolledOn ?? null,
    }))),
    student_documents: db.students.flatMap((s) => s.documents.map((d) => ({
      id: d.id, student_id: s.id, name: d.name, kind: d.kind, size: d.size, doc_date: d.date,
      storage_path: d.storagePath ?? null,
    }))),
    assessment_structures: db.structures.map((st) => ({ id: st.id, year_id: st.yearId, class_id: st.classId, subject_id: st.subjectId, term_id: termId(db, st.yearId, st.period) })),
    assessment_items: db.structures.flatMap((st) => st.items.map((i, idx) => ({ id: i.id, structure_id: st.id, name: i.name, max_mark: i.max, weight: i.weight, sort: idx }))),
    mark_submissions: db.submissions.map((s) => ({
      id: s.id, structure_id: s.structureId, status: s.status,
      submitted_by: s.submittedBy, submitted_at: s.submittedAt,
      approved_by: s.approvedBy, approved_at: s.approvedAt,
      returned_by: s.returnedBy, returned_at: s.returnedAt, return_reason: s.returnReason,
      published_by: s.publishedBy, published_at: s.publishedAt, reopen_reason: s.reopenReason ?? null,
    })),
    grade_bands: db.grading.map((g, i) => ({ id: g.id ?? `gb-${activeYearId(db) ?? "year"}-${i + 1}`, school_id: SCHOOL_ID, min_pct: g.min, max_pct: g.max, grade: g.grade, remark: g.remark, sort: i, year_id: g.yearId ?? activeYearId(db) })),
    fee_items: db.fees.map((f) => ({ id: f.id, student_id: f.studentId, label: f.label, amount: f.amount, paid: f.paid, due_date: f.due, payments: f.payments ?? [] })),
    fee_payment_requests: db.paymentRequests.map((r) => ({
      id: r.id, student_id: r.studentId, fee_item_id: r.feeItemId, amount: r.amount,
      bank_account_id: r.bankAccountId, bank_name: r.bankName, reference: r.reference ?? null,
      receipt_path: r.receiptPath ?? null, receipt_name: r.receiptName ?? null,
      submitted_by: r.submittedBy, submitted_by_name: r.submittedByName ?? null, submitted_at: r.submittedAt,
      status: r.status, reviewed_by: r.reviewedBy ?? null, reviewed_by_name: r.reviewedByName ?? null,
      reviewed_at: r.reviewedAt ?? null, review_note: r.reviewNote ?? null,
    })),
    homework: db.homework.map((h) => ({ id: h.id, year_id: h.yearId, class_id: h.classId, section_id: h.sectionId, subject_id: h.subjectId, title: h.title, description: h.description, issued: h.issued, due: h.due, submitted_students: h.submitted })),
    timetable_entries: db.timetable.map((t) => ({ id: t.id, class_id: t.classId, section_id: t.sectionId, day: t.day, period: t.period, subject_id: t.subjectId, room: t.room })),
    role_defs: db.roles.map((r) => ({ id: r.id, name: r.name, description: r.description, is_system: r.system, all_permissions: r.permissions.includes("*"), applies_to: r.appliesTo, status: r.status })),
    announcements: db.announcements.map((a) => ({ id: a.id, title: a.title, body: a.body, category: a.category, sender_id: a.senderId, audience: a.audience, status: a.status, scheduled_for: a.scheduledFor, published_at: a.publishedAt, pinned: a.pinned ?? false })),
    conversations: db.conversations.map((c) => ({ id: c.id, related_student_id: c.relatedStudentId, related_class_id: c.relatedClassId, related_section_id: c.relatedSectionId, related_subject_id: c.relatedSubjectId, status: c.status })),
    events: db.events.map((e) => ({ id: e.id, title: e.title, description: e.description, day: e.date, time_of_day: e.time, location: e.location, category: e.category, audience: e.audience, created_by: e.createdBy })),
  };
  return R;
}

// Looks up the real term row instead of guessing from substrings in the id —
// the previous version checked for "s1"/"s2" in the id, but seeded/created
// term ids actually use "t1"/"t2" (e.g. "y26-t1"), so it always fell through
// to "Annual" for every real term.
function termName(db: DB, termId: string | null | undefined): string {
  if (!termId) return "Annual";
  return db.terms.find((t) => t.id === termId)?.name ?? "Annual";
}

// Resolves a structure's (yearId, period) back to the matching terms.id for
// the FK column. Previously hardcoded two ids for a single academic year
// ("y26-s1"/"y26-s2") that never matched any real row — every save of a
// Semester 1/2 structure violated assessment_structures_term_id_fkey.
function termId(db: DB, yearId: string, period: string): string | null {
  const p = period.trim().toLowerCase();
  if (p === "annual") return null; // term_id is nullable; "Annual" has no term row to link
  return db.terms.find((t) => t.yearId === yearId && t.name.trim().toLowerCase() === p)?.id ?? null;
}

let chain: Promise<void> = Promise.resolve();

/** Queue a diff-sync so rapid `update()` calls never interleave. */
/**
 * sync() queues onto a shared chain so writes apply in order, but each call
 * gets its OWN errors array — concurrent update()s never bleed their error
 * lists into each other. The returned promise resolves with exactly the
 * errors this call's writes produced (empty array = everything landed).
 */
export function sync(oldDB: DB, newDB: DB): Promise<string[]> {
  if (!isSupabaseConfigured) return Promise.resolve([]);
  const errors: string[] = [];
  const run = chain.then(() => doSync(oldDB, newDB, errors)).catch((e) => { console.warn("[backend] sync error", e); errors.push(String(e?.message ?? e)); });
  chain = run;
  return run.then(() => errors);
}

/** The single active year, if any — used wherever a write needs a year and
 *  the entity itself (an attendance register, a fee item) doesn't carry one
 *  in the in-memory shape. Falls back to the most recent year rather than
 *  leaving it null, so a write never fails purely for lack of a year id. */
function activeYearId(db: DB): string | undefined {
  return db.years.find((y) => y.active)?.id ?? db.years[db.years.length - 1]?.id;
}

async function doSync(oldDB: DB, newDB: DB, errors: string[]): Promise<void> {
  const o = rowsOf(oldDB);
  const n = rowsOf(newDB);

  // Tables with a real named write op below are handled by their own sync*
  // function instead of the generic upsert/remove, which 0026 disabled for
  // every table (see legacyWriteError). Two tables are left in the generic
  // path:
  //   - grade_bands: no page has ever offered to edit it, so there is
  //     nothing to wire — it's listed only so a future editor fails loudly
  //     instead of silently, same as everything else used to.
  //   - student_documents: no page ever writes it through update()/sync()
  //     either — uploads have always gone through register_file() directly
  //     (src/lib/storage.ts), bypassing this diff entirely. It's listed
  //     here only as a safety net. The real bug this table had — uploads
  //     landing in `file_objects` while reads came from this table, so a
  //     freshly uploaded document could be invisible until reload — was in
  //     register_file()/unregister_file() themselves, not here; see
  //     0032_reconcile_student_documents.sql.
  const ordered = ["student_documents"];
  for (const table of ordered) {
    const { up, del } = diff(o[table] ?? [], n[table] ?? []);
    if (up.length) await upsert(table, up, undefined, errors);
    if (del.length) await remove(table, del, errors);
  }

  await syncYears(oldDB, newDB, errors);
  await syncGrading(oldDB, newDB, errors);
  await syncTerms(oldDB, newDB, errors);
  await syncStudents(oldDB, newDB, errors);
  await syncMarks(oldDB, newDB, errors);
  await syncSubmissions(oldDB, newDB, errors);
  await syncAttendance(oldDB, newDB, errors);
  // Review payment requests before fee payment diffs. Approval materializes
  // its deterministic payment entry; syncFees then becomes an idempotent
  // reconciliation rather than a second credit.
  await syncPaymentRequests(oldDB, newDB, errors);
  await syncFees(oldDB, newDB, errors);
  await syncRoles(oldDB, newDB, errors);
  await syncClasses(oldDB, newDB, errors);
  await syncSubjects(oldDB, newDB, errors);
  await syncTeachers(oldDB, newDB, errors);
  await syncAssignments(oldDB, newDB, errors);
  await syncHomework(oldDB, newDB, errors);
  await syncHomeworkSubmissions(oldDB, newDB, errors);
  await syncTimetable(oldDB, newDB, errors);
  await syncAssessmentStructures(oldDB, newDB, errors);
  await syncAnnouncements(oldDB, newDB, errors);
  await syncEvents(oldDB, newDB, errors);
  await syncSettings(oldDB, newDB, errors);

  // communication child tables
  await syncReads("announcement_reads", oldDB.announcements, newDB.announcements, (a) => a.id, (a) => a.readBy ?? [], "announcement_id", errors);
  await syncConversations(oldDB, newDB, errors);
  await syncMessages(oldDB, newDB, errors);
  await syncNotifications(oldDB, newDB, errors);
  await syncReports(oldDB, newDB, errors);
  await syncProfiles(oldDB, newDB, errors);
}

/** Academic years: create_academic_year() for a new one (always with no
 *  default terms — TermModal adds them one at a time, so seeding three
 *  named "Term 1/2/3" here would just leave extras behind for a school
 *  that names its terms differently), update_academic_year() for
 *  name/date edits, set_active_year() for the one that just became active,
 *  delete_academic_year() for one removed. Deliberately does not call
 *  close_year()/rollover_year()/promote_students() — no page offers those
 *  actions yet, so there is nothing in a diff that could trigger them. */
async function syncYears(oldDB: DB, newDB: DB, errors: string[]) {
  for (const y of newDB.years) {
    const before = oldDB.years.find((x) => x.id === y.id);
    if (!before) {
      const { error } = await sb()!.rpc("create_academic_year", {
        p_id: y.id, p_name: y.name, p_start: y.start, p_end: y.end, p_terms: [],
      });
      if (error) { errors.push(`academic year "${y.name}": ${error.message}`); continue; }
      if (y.active) {
        const { error: activateErr } = await sb()!.rpc("set_active_year", { p_year_id: y.id });
        if (activateErr) errors.push(`activating "${y.name}": ${activateErr.message}`);
      }
      continue;
    }
    if (before.name !== y.name || before.start !== y.start || before.end !== y.end) {
      const { error } = await sb()!.rpc("update_academic_year", {
        p_year_id: y.id, p_name: y.name, p_start: y.start, p_end: y.end,
      });
      if (error) errors.push(`academic year "${y.name}": ${error.message}`);
    }
    if (before.showGrade !== y.showGrade) {
      const { error } = await sb()!.rpc("set_year_grade_visibility", { p_year_id: y.id, p_show_grade: y.showGrade !== false });
      if (error) errors.push(`grade visibility for "${y.name}": ${error.message}`);
    }
    if (!before.active && y.active) {
      const { error } = await sb()!.rpc("set_active_year", { p_year_id: y.id });
      if (error) errors.push(`activating "${y.name}": ${error.message}`);
    }
  }
  for (const before of oldDB.years) {
    if (newDB.years.some((y) => y.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_academic_year", { p_year_id: before.id });
    if (error) errors.push(`removing academic year "${before.name}": ${error.message}`);
  }
}

async function syncGrading(oldDB: DB, newDB: DB, errors: string[]) {
  const yearId = activeYearId(newDB);
  if (!yearId) return;
  const oldBands = oldDB.grading ?? [];
  const newBands = newDB.grading ?? [];
  for (let i = 0; i < newBands.length; i++) {
    const g = newBands[i];
    const before = oldBands.find((x) => x.id === g.id);
    if (before && JSON.stringify(before) === JSON.stringify(g)) continue;
    const { error } = await sb()!.rpc("save_grade_band", {
      p_payload: { id: g.id ?? null, year_id: g.yearId ?? yearId, min_pct: g.min, max_pct: g.max, grade: g.grade, remark: g.remark ?? null, sort: i },
    });
    if (error) errors.push(`grade ${g.grade}: ${error.message}`);
  }
  for (const before of oldBands) {
    if (before.id && newBands.some((g) => g.id === before.id)) continue;
    if (before.id) {
      const { error } = await sb()!.rpc("delete_grade_band", { p_grade_band_id: before.id });
      if (error) errors.push(`removing grade ${before.grade}: ${error.message}`);
    }
  }
}

async function syncTerms(oldDB: DB, newDB: DB, errors: string[]) {
  for (const t of newDB.terms) {
    const before = oldDB.terms.find((x) => x.id === t.id);
    if (before && before.name === t.name && before.seq === t.seq) continue;
    const { error } = await sb()!.rpc("save_term", {
      p_payload: { id: t.id, year_id: t.yearId, name: t.name, seq: t.seq },
    });
    if (error) errors.push(`term "${t.name}": ${error.message}`);
  }
  for (const before of oldDB.terms) {
    if (newDB.terms.some((t) => t.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_term", { p_term_id: before.id });
    if (error) errors.push(`removing term "${before.name}": ${error.message}`);
  }
}

/** Students — create/edit via save_student(), status-only transitions
 *  (transfer/withdraw/graduate/reactivate) via the narrower
 *  set_student_status(). There is no delete_student op because the app has
 *  never offered to hard-delete a student, only to change status. */
async function syncStudents(oldDB: DB, newDB: DB, errors: string[]) {
  const yr = activeYearId(newDB);
  for (const s of newDB.students) {
    const before = oldDB.students.find((x) => x.id === s.id);
    if (before && JSON.stringify(before) === JSON.stringify(s)) continue;

    if (before && before.status !== s.status && JSON.stringify({ ...before, status: s.status }) === JSON.stringify(s)) {
      const { error } = await sb()!.rpc("set_student_status", { p_student_id: s.id, p_status: s.status });
      if (error) errors.push(`${s.firstName} ${s.lastName} (status): ${error.message}`);
      continue;
    }

    const payload: Record<string, unknown> = {
      id: s.id,
      reg_no: s.regId || undefined,
      admission_no: s.admission.number,
      first_name: s.firstName, middle_name: s.middleName, last_name: s.lastName,
      gender: s.gender, dob: s.dob || null,
      phone: s.phone ?? null, email: s.email ?? null, address: s.address ?? null,
      guardian_name: s.guardian.father, guardian_relation: s.guardian.relation,
      guardian_phone: s.guardian.phone ?? null, guardian_address: s.guardian.address ?? null,
      mother_name: s.guardian.mother ?? null,
      admission_date: s.admission.date || null, previous_school: s.admission.previousSchool ?? null,
      admission_type: s.admission.type, photo_path: s.photo ?? null,
    };
    if (s.enrollment) {
      payload.class_id = s.enrollment.classId;
      payload.section_id = s.enrollment.sectionId;
      payload.roll_number = s.enrollment.rollNumber ?? null;
    }
    const { error } = await sb()!.rpc("save_student", {
      p_payload: payload, p_year_id: s.enrollment?.yearId ?? yr ?? null,
    });
    if (error) errors.push(`${s.firstName} ${s.lastName}: ${error.message}`);
  }
}

/** save_student_marks() replaces the FULL value set for one (structure,
 *  student) pair in a single call — so the unit of sync here is that pair,
 *  never an individual item. Diffing per item (as the old flattened-row
 *  upsert did) would send only the changed item and, on the server's own
 *  terms, silently clear every sibling item for that student. */
async function syncMarks(oldDB: DB, newDB: DB, errors: string[]) {
  const pairs = new Set<string>();
  for (const db of [oldDB, newDB])
    for (const [sid, byStudent] of Object.entries(db.assessmentMarks))
      for (const stid of Object.keys(byStudent)) pairs.add(`${sid}|${stid}`);

  for (const key of pairs) {
    const [sid, stid] = key.split("|");
    const before = oldDB.assessmentMarks[sid]?.[stid] ?? {};
    const now = newDB.assessmentMarks[sid]?.[stid] ?? {};
    if (JSON.stringify(before) === JSON.stringify(now)) continue;

    // An item present before but absent now must be sent as an explicit
    // null so the server clears it — an absent key isn't ambiguous with
    // "unchanged" locally, but save_student_marks() treats it as "clear".
    const values: Record<string, number | null> = { ...now };
    for (const iid of Object.keys(before)) if (!(iid in now)) values[iid] = null;

    const { error } = await sb()!.rpc("save_student_marks", {
      p_structure_id: sid, p_student_id: stid, p_values: values,
    });
    if (error) errors.push(`marks (${stid}): ${error.message}`);
  }
}

/** The submit → approve/return → publish (→ reopen) workflow, driven
 *  entirely through set_submission_status() so the transition rules the
 *  server enforces are the only ones that exist. */
export async function requestMarksReopen(structureId: string, reason: string): Promise<string | null> {
  if (!sb()) return "Backend is not configured.";
  const { error } = await sb()!.rpc("request_marks_reopen", {
    p_structure_id: structureId,
    p_reason: reason,
  });
  return error?.message ?? null;
}

export async function reviewMarksReopen(structureId: string, decision: "approved" | "rejected", note?: string): Promise<string | null> {
  if (!sb()) return "Backend is not configured.";
  const { error } = await sb()!.rpc("review_marks_reopen", {
    p_structure_id: structureId,
    p_decision: decision,
    p_note: note ?? null,
  });
  return error?.message ?? null;
}

async function syncSubmissions(oldDB: DB, newDB: DB, errors: string[]) {
  for (const s of newDB.submissions) {
    const before = oldDB.submissions.find((x) => x.structureId === s.structureId);
    if (before?.status === s.status) continue;
    const reason = s.status === "returned" ? s.returnReason : s.status === "draft" ? s.reopenReason : undefined;
    const { error } = await sb()!.rpc("set_submission_status", {
      p_structure_id: s.structureId, p_status: s.status, p_reason: reason ?? null,
    });
    if (error) errors.push(`marks workflow: ${error.message}`);
  }
}

/** save_register() writes one whole register (register row + every entry)
 *  per call and removes anyone no longer in the payload server-side, so
 *  there is nothing to delete separately on the client's end. */
async function syncAttendance(oldDB: DB, newDB: DB, errors: string[]) {
  const yr = activeYearId(newDB);
  const changed = newDB.attendance.filter((r) => {
    const before = oldDB.attendance.find((x) => x.date === r.date && x.classId === r.classId && x.sectionId === r.sectionId);
    return JSON.stringify(before?.marks) !== JSON.stringify(r.marks);
  });
  for (const r of changed) {
    const { error } = await sb()!.rpc("save_register", {
      p_year_id: yr ?? null, p_class_id: r.classId, p_section_id: r.sectionId,
      p_day: r.date, p_marks: r.marks,
    });
    if (error) errors.push(`attendance (${r.date}): ${error.message}`);
  }
}

/** Fee items: create_fee_item() for a brand-new charge, delete_fee_item()
 *  for one removed before any payment landed on it, record_fee_payment()
 *  for each payment appended since the last sync. The client id is passed
 *  through on create so later optimistic payment writes target the same
 *  permanent server row instead of a server-generated replacement id. */
async function syncFees(oldDB: DB, newDB: DB, errors: string[]) {
  const yr = activeYearId(newDB);

  for (const f of newDB.fees) {
    const before = oldDB.fees.find((x) => x.id === f.id);
    if (!before) {
      const { error } = await sb()!.rpc("create_fee_item", {
        p_id: f.id, p_student_id: f.studentId, p_label: f.label, p_amount: f.amount,
        p_due_date: f.due || null, p_year_id: yr ?? null,
      });
      if (error) errors.push(`fee item "${f.label}": ${error.message}`);
      continue;
    }
    const newPayments = (f.payments ?? []).slice((before.payments ?? []).length);
    for (const p of newPayments) {
      const { error } = await sb()!.rpc("record_fee_payment", {
        p_fee_item_id: f.id, p_amount: p.amount, p_method: p.method,
        p_reference: p.reference ?? null, p_bank: p.bank ?? null,
        p_payment_id: p.id,
      });
      if (error) errors.push(`payment on "${f.label}": ${error.message}`);
    }
  }

  for (const before of oldDB.fees) {
    if (newDB.fees.some((f) => f.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_fee_item", { p_fee_item_id: before.id });
    if (error) errors.push(`removing "${before.label}": ${error.message}`);
  }
}

/** Role definitions and their permission sets, via save_role() (create or
 *  update, atomically) and delete_role() (custom roles only — system roles
 *  are protected server-side too, not just greyed out in the UI). */
async function syncRoles(oldDB: DB, newDB: DB, errors: string[]) {
  for (const role of newDB.roles) {
    const before = oldDB.roles.find((r) => r.id === role.id);
    if (before && JSON.stringify(before) === JSON.stringify(role)) continue;
    // A "*" permission set is the fixed super-admin marker, not a real
    // editable list — nothing to persist even if it appears "changed".
    if (role.permissions.includes("*") && before?.permissions.includes("*")) continue;
    const { error } = await sb()!.rpc("save_role", {
      p_payload: {
        id: role.id, name: role.name, description: role.description,
        all_permissions: role.permissions.includes("*"),
        applies_to: role.appliesTo, status: role.status,
        permissions: role.permissions.includes("*") ? [] : role.permissions,
      },
    });
    if (error) errors.push(`role "${role.name}": ${error.message}`);
  }
  for (const before of oldDB.roles) {
    if (newDB.roles.some((r) => r.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_role", { p_role_id: before.id });
    if (error) errors.push(`removing role "${before.name}": ${error.message}`);
  }
}

/** Classes, including their section list as a full-replace set per class
 *  (mirrors how the Classes page always edits sections — as part of the
 *  class form, never independently). */
async function syncClasses(oldDB: DB, newDB: DB, errors: string[]) {
  for (const c of newDB.classes) {
    const before = oldDB.classes.find((x) => x.id === c.id);
    if (before && JSON.stringify(before) === JSON.stringify(c)) continue;
    const { error } = await sb()!.rpc("save_class", {
      p_payload: { id: c.id, name: c.name, level: c.level, sections: c.sections },
    });
    if (error) errors.push(`class "${c.name}": ${error.message}`);
  }
  for (const before of oldDB.classes) {
    if (newDB.classes.some((c) => c.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_class", { p_class_id: before.id });
    if (error) errors.push(`removing class "${before.name}": ${error.message}`);
  }
}

async function syncSubjects(oldDB: DB, newDB: DB, errors: string[]) {
  for (const s of newDB.subjects) {
    const before = oldDB.subjects.find((x) => x.id === s.id);
    if (before && JSON.stringify(before) === JSON.stringify(s)) continue;
    const { error } = await sb()!.rpc("save_subject", {
      p_payload: { id: s.id, name: s.name, code: s.code, color: s.color },
    });
    if (error) errors.push(`subject "${s.name}": ${error.message}`);
  }
  for (const before of oldDB.subjects) {
    if (newDB.subjects.some((s) => s.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_subject", { p_subject_id: before.id });
    if (error) errors.push(`removing subject "${before.name}": ${error.message}`);
  }
}

async function syncTeachers(oldDB: DB, newDB: DB, errors: string[]) {
  for (const t of newDB.teachers) {
    const before = oldDB.teachers.find((x) => x.id === t.id);
    if (before && JSON.stringify(before) === JSON.stringify(t)) continue;
    const { error } = await sb()!.rpc("save_teacher", {
      p_payload: { id: t.id, name: t.name, phone: t.phone ?? null, email: t.email ?? null, specialty: t.specialty ?? null },
    });
    if (error) errors.push(`teacher "${t.name}": ${error.message}`);
  }
  for (const before of oldDB.teachers) {
    if (newDB.teachers.some((t) => t.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_teacher", { p_teacher_id: before.id });
    if (error) errors.push(`removing teacher "${before.name}": ${error.message}`);
  }
}

async function syncAssignments(oldDB: DB, newDB: DB, errors: string[]) {
  for (const a of newDB.assignments) {
    const before = oldDB.assignments.find((x) => x.id === a.id);
    if (before && JSON.stringify(before) === JSON.stringify(a)) continue;
    const { error } = await sb()!.rpc("save_assignment", {
      p_payload: { id: a.id, year_id: a.yearId, class_id: a.classId, section_id: a.sectionId, subject_id: a.subjectId, teacher_id: a.teacherId },
    });
    if (error) errors.push(`assignment: ${error.message}`);
  }
  for (const before of oldDB.assignments) {
    if (newDB.assignments.some((a) => a.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_assignment", { p_assignment_id: before.id });
    if (error) errors.push(`removing assignment: ${error.message}`);
  }
}

async function syncHomework(oldDB: DB, newDB: DB, errors: string[]) {
  // `submitted` is handled separately below by toggle_homework_submission()
  // — save_homework() deliberately can't write it (see the migration
  // comment), so it's stripped from this comparison to avoid a pointless
  // (and no-op) save_homework() call every time a student ticks a box.
  const strip = (h: Homework) => ({ ...h, submitted: undefined });
  for (const h of newDB.homework) {
    const before = oldDB.homework.find((x) => x.id === h.id);
    if (before && JSON.stringify(strip(before)) === JSON.stringify(strip(h))) continue;
    const { error } = await sb()!.rpc("save_homework", {
      p_payload: {
        id: h.id, year_id: h.yearId, class_id: h.classId, section_id: h.sectionId, subject_id: h.subjectId,
        title: h.title, description: h.description ?? null, issued: h.issued, due: h.due,
      },
    });
    if (error) errors.push(`homework "${h.title}": ${error.message}`);
  }
  for (const before of oldDB.homework) {
    if (newDB.homework.some((h) => h.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_homework", { p_homework_id: before.id });
    if (error) errors.push(`removing homework "${before.title}": ${error.message}`);
  }
}

/** Each student's own submitted/not-submitted flag, toggled individually via
 *  toggle_homework_submission() rather than folded into save_homework() —
 *  see that migration's comment for why this needs its own, narrower
 *  permission check (a student marking their own homework, not a teacher
 *  editing the assignment). */
async function syncHomeworkSubmissions(oldDB: DB, newDB: DB, errors: string[]) {
  for (const h of newDB.homework) {
    const before = oldDB.homework.find((x) => x.id === h.id);
    const prevSubmitted = new Set(before?.submitted ?? []);
    const nowSubmitted = new Set(h.submitted);
    const changed = [...prevSubmitted].filter((s) => !nowSubmitted.has(s))
      .concat([...nowSubmitted].filter((s) => !prevSubmitted.has(s)));
    for (const studentId of changed) {
      const { error } = await sb()!.rpc("toggle_homework_submission", { p_homework_id: h.id, p_student_id: studentId });
      if (error) errors.push(`homework submission: ${error.message}`);
    }
  }
}

async function syncTimetable(oldDB: DB, newDB: DB, errors: string[]) {
  for (const t of newDB.timetable) {
    const before = oldDB.timetable.find((x) => x.id === t.id);
    if (before && JSON.stringify(before) === JSON.stringify(t)) continue;
    const { error } = await sb()!.rpc("save_timetable_entry", {
      p_payload: { id: t.id, class_id: t.classId, section_id: t.sectionId, day: t.day, period: t.period, subject_id: t.subjectId, room: t.room },
    });
    if (error) errors.push(`timetable entry: ${error.message}`);
  }
  for (const before of oldDB.timetable) {
    if (newDB.timetable.some((t) => t.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_timetable_entry", {
      p_class_id: before.classId, p_section_id: before.sectionId, p_day: before.day, p_period: before.period,
    });
    if (error) errors.push(`clearing timetable slot: ${error.message}`);
  }
}

async function syncAssessmentStructures(oldDB: DB, newDB: DB, errors: string[]) {
  for (const s of newDB.structures) {
    const before = oldDB.structures.find((x) => x.id === s.id);
    if (before && JSON.stringify(before) === JSON.stringify(s)) continue;
    const { error } = await sb()!.rpc("save_assessment_structure", {
      p_payload: {
        id: s.id, year_id: s.yearId, class_id: s.classId, subject_id: s.subjectId,
        term_id: termId(newDB, s.yearId, s.period),
        items: s.items.map((i, idx) => ({ id: i.id, name: i.name, max: i.max, weight: i.weight, sort: idx })),
      },
    });
    if (error) errors.push(`assessment structure: ${error.message}`);
  }
  for (const before of oldDB.structures) {
    if (newDB.structures.some((s) => s.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_assessment_structure", { p_structure_id: before.id });
    if (error) errors.push(`removing assessment structure: ${error.message}`);
  }
}

async function syncAnnouncements(oldDB: DB, newDB: DB, errors: string[]) {
  for (const a of newDB.announcements) {
    const before = oldDB.announcements.find((x) => x.id === a.id);
    // readBy is handled separately by syncReads — ignore it in this diff so
    // marking an announcement read doesn't trigger a pointless re-save.
    const strip = (x: Announcement) => ({ ...x, readBy: undefined });
    if (before && JSON.stringify(strip(before)) === JSON.stringify(strip(a))) continue;
    const { error } = await sb()!.rpc("save_announcement", {
      p_payload: {
        id: before ? a.id : null, title: a.title, body: a.body, category: a.category,
        audience: a.audience, status: a.status,
        scheduled_for: a.scheduledFor ?? null, pinned: a.pinned ?? false,
      },
    });
    if (error) errors.push(`announcement "${a.title}": ${error.message}`);
  }
  for (const before of oldDB.announcements) {
    if (newDB.announcements.some((a) => a.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_announcement", { p_announcement_id: before.id });
    if (error) { console.warn("[backend] delete_announcement:", error.message); errors.push(`deleting "${before.title}": ${error.message}`); }
  }
}

async function syncEvents(oldDB: DB, newDB: DB, errors: string[]) {
  for (const e of newDB.events) {
    const before = oldDB.events.find((x) => x.id === e.id);
    if (before && JSON.stringify(before) === JSON.stringify(e)) continue;
    const { error } = await sb()!.rpc("save_event", {
      p_payload: {
        id: e.id, title: e.title, description: e.description ?? null, day: e.date,
        time_of_day: e.time ?? null, location: e.location ?? null, category: e.category, audience: e.audience,
      },
    });
    if (error) errors.push(`event "${e.title}": ${error.message}`);
  }
  for (const before of oldDB.events) {
    if (newDB.events.some((e) => e.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_event", { p_event_id: before.id });
    if (error) errors.push(`removing event "${before.title}": ${error.message}`);
  }
}

/** Guardian bank-transfer receipt review: one call does the status change
 *  AND, on approval, the matching fee_items credit — atomically, so a
 *  double-click can't credit the same request twice the way two separate
 *  client-driven writes could. */
/**
 * Payment requests: submit_fee_payment_request() for a brand-new guardian
 * submission, review_fee_payment_request() for an admin's approve/reject
 * decision. Previously only the review half was called — a new request
 * (status still 'pending') fell through every branch here and was
 * silently never sent to the server at all; see 0041's header comment.
 */
async function syncPaymentRequests(oldDB: DB, newDB: DB, errors: string[]) {
  for (const r of newDB.paymentRequests) {
    const before = oldDB.paymentRequests.find((x) => x.id === r.id);
    if (!before) {
      // receiptDataUrl is the offline/demo-mode fallback only (see its
      // comment in types.ts) — there's no column for it server-side, a
      // real submission always has receiptPath instead.
      const { error } = await sb()!.rpc("submit_fee_payment_request", {
        p_id: r.id, p_student_id: r.studentId, p_fee_item_id: r.feeItemId, p_amount: r.amount,
        p_bank_account_id: r.bankAccountId, p_bank_name: r.bankName, p_reference: r.reference ?? null,
        p_receipt_path: r.receiptPath ?? null, p_receipt_name: r.receiptName ?? null,
      });
      if (error) errors.push(`submitting payment request: ${error.message}`);
      continue;
    }
    if (before.status === r.status) continue;
    if (r.status !== "approved" && r.status !== "rejected") continue;
    const { error } = await sb()!.rpc("review_fee_payment_request", {
      p_request_id: r.id, p_status: r.status, p_note: r.reviewNote ?? null,
    });
    if (error) errors.push(`reviewing payment request: ${error.message}`);
  }
}

async function syncSettings(oldDB: DB, newDB: DB, errors: string[]) {
  if (JSON.stringify(oldDB.settings) === JSON.stringify(newDB.settings)) return;
  const { error } = await sb()!.rpc("update_school_settings", {
    p_name: newDB.settings.schoolName, p_motto: newDB.settings.motto,
    p_bank_accounts: JSON.stringify(newDB.settings.bankAccounts ?? []),
    p_working_days: JSON.stringify(newDB.settings.workingDays?.length ? newDB.settings.workingDays : DEFAULT_WORKING_DAYS),
    p_periods: JSON.stringify(newDB.settings.periods?.length ? newDB.settings.periods : DEFAULT_PERIODS),
    p_logo_keys: JSON.stringify(newDB.settings.logos ?? []),
    p_active_logo_key: newDB.settings.activeLogoKey ?? null,
  });
  if (error) errors.push(`settings: ${error.message}`);
}

async function syncReads(
  table: string,
  oldList: { id: string; readBy?: string[] }[],
  newList: { id: string; readBy?: string[] }[],
  getId: (x: any) => string,
  getReads: (x: any) => string[],
  fk: string,
  errors: string[],
) {
  for (const item of newList) {
    const before = oldList.find((x) => getId(x) === getId(item));
    const now = getReads(item);
    const prev = before ? getReads(before) : [];
    const added = now.filter((p) => !prev.includes(p));
    if (added.length) await upsert(table, added.map((p) => ({ [fk]: getId(item), profile_id: p })), undefined, errors);
  }
}

/** Starting a conversation and hiding/archiving one, via start_conversation()
 *  and set_conversation_status(). Conversations are always exactly two
 *  participants (type is always "direct" — see types.ts), created together
 *  server-side, so there is no separate "add a participant" case to handle
 *  the way the old generic-upsert version tried to. */
async function syncConversations(oldDB: DB, newDB: DB, errors: string[]) {
  for (const c of newDB.conversations) {
    const before = oldDB.conversations.find((x) => x.id === c.id);
    if (!before) {
      const other = c.participants.find((p) => p !== currentProfileId());
      const { error } = await sb()!.rpc("start_conversation", {
        p_other_profile_id: other ?? null,
        p_related_student_id: c.relatedStudentId ?? null,
        p_related_class_id: c.relatedClassId ?? null,
        p_related_section_id: c.relatedSectionId ?? null,
        p_related_subject_id: c.relatedSubjectId ?? null,
      });
      if (error) errors.push(`starting conversation: ${error.message}`);
      continue;
    }
    if (before.status !== c.status) {
      const { error } = await sb()!.rpc("set_conversation_status", { p_conversation_id: c.id, p_status: c.status });
      if (error) errors.push(`conversation status: ${error.message}`);
    }
  }
}

/**
 * Opening a direct conversation with someone, called straight from the
 * page rather than through update()/sync().
 *
 * start_conversation() mints its own id server-side — it never accepts a
 * client-supplied one — and hands back an existing conversation's real id
 * too, if the two people already had one. The generic optimistic
 * update()/sync() diff (syncConversations above) only reconciles a
 * locally-invented id against the server's on FAILURE, via the recovery
 * hydrate() in store.tsx; on success the two ids were simply never
 * compared. A conversation opened by inventing a local id and navigating
 * straight there (the previous approach) would work for the rest of that
 * browser tab's session purely because the optimistic local copy was still
 * in memory, then break — silently pointing at an id the server never
 * created — the moment state next refreshed from the server under the
 * real id instead, e.g. on a page reload or a shared link. Calling the RPC
 * directly and waiting for its real id avoids ever having two ids for the
 * same conversation in the first place.
 */
export async function markAnnouncementRead(announcementId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await sb()!.rpc("mark_announcement_read", { p_announcement_id: announcementId });
  if (error) return { error: error.message };
  return { ok: true };
}

export interface MessageReportContext {
  report: MessageReport & { createdAt?: string };
  reporter: { id: string; name?: string; username?: string; role?: string } | null;
  reportedUser: { id: string; name?: string; username?: string; role?: string } | null;
  conversation: {
    id: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    participants: { id: string; name?: string; username?: string; role?: string }[];
  } | null;
  messages: {
    id: string;
    senderId: string;
    senderName?: string;
    senderRole?: string;
    body: string;
    createdAt: string;
    readBy: string[];
    isReported: boolean;
  }[];
}

export async function getMessageReportContext(reportId: string): Promise<MessageReportContext | null | { error: string }> {
  const { data, error } = await sb()!.rpc("get_message_report_context", { p_report_id: reportId });
  if (error) return { error: error.message };
  return (data ?? null) as MessageReportContext | null;
}

export async function startConversation(
  otherProfileId: string,
  related?: { studentId?: string; classId?: string; sectionId?: string; subjectId?: string }
): Promise<{ conversationId: string; created: boolean } | { error: string }> {
  const { data, error } = await sb()!.rpc("start_conversation", {
    p_other_profile_id: otherProfileId,
    p_related_student_id: related?.studentId ?? null,
    p_related_class_id: related?.classId ?? null,
    p_related_section_id: related?.sectionId ?? null,
    p_related_subject_id: related?.subjectId ?? null,
  });
  if (error) return { error: error.message };
  return data as { conversationId: string; created: boolean };
}


async function syncMessages(oldDB: DB, newDB: DB, errors: string[]) {
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

async function syncNotifications(oldDB: DB, newDB: DB, errors: string[]) {
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
  // A full clear-all action can remove many rows at once. Use the dedicated
  // server-side bulk operation so the client never has to issue hundreds of
  // individual RPC calls.
  if (del.length && newDB.notifications.length === 0) {
    const { error } = await sb()!.rpc("clear_notifications");
    if (error) errors.push(`clearing notifications: ${error.message}`);
  } else {
    for (const n of del) {
      const { data, error } = await sb()!.rpc("delete_notification", { p_notification_id: n.id });
      if (error) errors.push(`deleting notification: ${error.message}`);
      else if (data && typeof data === "object" && data.deleted === false) {
        // Non-UUID legacy/offline notification IDs are safe no-ops on the live server.
        // The local optimistic state has already removed them.
      }
    }
  }
}

/**
 * Message reports: a report is filed once (file_message_report — the
 * reporter, membership-checked) and later resolved or dismissed
 * (review_message_report — moderators only, via communication.moderate).
 * Both are real writes, not an append-only log — the previous comment
 * here claiming entries are "only ever added, never edited" was wrong:
 * ModerationPage's resolve/dismiss buttons edit an existing report's
 * status. That, plus this calling the deprecated raw upsert() (which
 * unconditionally throws for every table now — see backend.ts's own
 * upsert() comment), meant BOTH filing and reviewing a report have
 * always failed outright. Same new-vs-modified split as syncNotifications
 * above, since diff() doesn't distinguish them itself.
 * (audit_log is intentionally NOT synced this way: it has no insert policy
 * at all — it's written only by trusted SECURITY DEFINER functions like
 * create_user_account, so the client can never write to it directly. The
 * in-app Audit log page's own history stays session-local by design.)
 */
async function syncReports(oldDB: DB, newDB: DB, errors: string[]) {
  const { up } = diff(oldDB.reports, newDB.reports);
  const filed = up.filter((r) => !oldDB.reports.some((o) => o.id === r.id));
  const reviewed = up.filter((r) => {
    const o = oldDB.reports.find((x) => x.id === r.id);
    return o && o.status !== r.status;
  });

  for (const r of filed) {
    const { error } = await sb()!.rpc("file_message_report", {
      p_message_id: r.messageId, p_conversation_id: r.conversationId, p_reason: r.reason, p_detail: r.detail ?? null, p_report_id: r.id,
    });
    if (error) errors.push(`reporting message: ${error.message}`);
  }
  for (const r of reviewed) {
    const { error } = await sb()!.rpc("review_message_report", { p_report_id: r.id, p_status: r.status });
    if (error) errors.push(`reviewing report: ${error.message}`);
  }
}

/**
 * Profiles are Auth-managed. We sync editable fields (name, role, links) but
 * NEVER a password — new accounts go through the create_user_account RPC and
 * passwords only ever touch Supabase Auth.
 */
async function syncProfiles(oldDB: DB, newDB: DB, errors: string[]) {
  // Removed accounts → delete_user_account RPC (SECURITY DEFINER, gated by
  // users.manage). Deleting a Supabase Auth user needs admin privileges the
  // anon client never holds, so — same as creation — this has to happen
  // server-side via a definer function, not a plain `.delete()` call.
  for (const before of oldDB.users) {
    if (newDB.users.some((u) => u.id === before.id)) continue;
    const { error } = await sb()!.rpc("delete_user_account", { p_id: before.id });
    if (error) { console.warn("[backend] delete_user_account:", error.message); errors.push(`delete for ${before.name}: ${error.message}`); }
  }

  for (const u of newDB.users) {
    const before = oldDB.users.find((x) => x.id === u.id);
    if (!before) {
      // NEW account → created server-side via the create_user_account RPC
      // (SECURITY DEFINER, gated by users.manage). The plaintext password is
      // handed to Supabase Auth once and never stored anywhere.
      if (!u.username?.trim() || !u.password) continue;
      // A blank string is not the same as "no email" to SQL's coalesce() —
      // send null so the RPC's own username@school fallback actually applies.
      const email = u.email?.trim() ? u.email.trim() : null;
      const { data: newId, error } = await sb()!.rpc("create_user_account", {
        p_username: u.username.trim(), p_password: u.password, p_full_name: u.name,
        p_role: u.role, p_role_def_id: u.roleId,
        p_teacher_id: u.teacherId ?? null, p_student_id: u.studentId ?? null,
        p_email: email, p_phone: u.phone ?? null,
      });
      if (error) { console.warn("[backend] create_user_account:", error.message); errors.push(`login for ${u.name}: ${error.message}`); continue; }
      // The password is a one-shot Auth credential. Never leave it in the
      // client-side profile after the server has consumed it.
      u.password = "";
      if (u.role === "guardian" && u.childrenIds?.length && newId) {
        // Link the new guardian to their children through the same
        // SECURITY DEFINER RPC used when *editing* a guardian below
        // (update_user_account already replaces guardian_students as an
        // atomic set when the payload includes `children`) — rather than
        // the deprecated raw upsert(), which no longer writes anywhere.
        const { error: linkErr } = await sb()!.rpc("update_user_account", {
          p_payload: { id: newId, children: u.childrenIds },
        });
        if (linkErr) { console.warn("[backend] update_user_account (link children):", linkErr.message); errors.push(`guardian links for ${u.name}: ${linkErr.message}`); }
      }
      continue;
    }
    if (JSON.stringify(before) === JSON.stringify(u)) continue;
    // Editing a profile means editing someone's role and status, which is
    // the most privilege-sensitive write in the system. It goes through a
    // named operation that refuses to let you demote or disable yourself,
    // and that replaces guardian-child links atomically rather than as a
    // delete followed by an insert that might not happen.
    //
    // Note what is NOT sent: `username` and `role`. The login identity and
    // the coarse role are fixed at account creation; changing either has to
    // go through account creation/deletion so the auth record and the
    // profile can never drift apart.
    const { error: updErr } = await sb()!.rpc("update_user_account", {
      p_payload: {
        id: u.id,
        full_name: u.name,
        email: u.email ?? null,
        phone: u.phone ?? null,
        role_def_id: u.roleId,
        status: u.status,
        ...(u.role === "guardian" ? { children: u.childrenIds ?? [] } : {}),
      },
    });
    if (updErr) errors.push(`profile ${u.name}: ${updErr.message}`);
  }
}

/* =========================================================================
   session helpers
   ========================================================================= */

let _profileId: string | null = null;
export const setProfileId = (id: string | null) => { _profileId = id; };
export const currentProfileId = () => _profileId;

export async function loadProfileForSession(userId: string): Promise<User | null> {
  if (!isSupabaseConfigured) return null;
  // The server already knows who is signed in — it authenticated them. So
  // this asks "who am I" rather than "fetch the row with this id", which
  // also removes the possibility of a client asking about someone else.
  const data = await apiSession();
  if (!data) return null;
  // Guardian-child links come from my_scope(), which resolves them on the
  // server in the same request rather than a second round trip.
  let childIds: string[] = [];
  if (data.role === "guardian") {
    const { data: scope } = await sb()!.rpc<{ childIds?: string[] }>("my_scope", {});
    childIds = scope?.childIds ?? [];
  }
  const gs = childIds.map((student_id) => ({ student_id }));
  return {
    id: data.id, name: data.full_name, username: data.username, password: "",
    role: data.role, roleId: data.role_def_id, status: data.status,
    email: data.email, phone: data.phone, teacherId: data.teacher_id, studentId: data.student_id,
    childrenIds: data.role === "guardian" ? (gs ?? []).map((g: any) => g.student_id) : undefined,
    createdAt: data.created_at,
  } as User;
}
