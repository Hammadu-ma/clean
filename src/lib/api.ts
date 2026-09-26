import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { ApiError, callRpc, callWrite, csrfToken } from "./http";
import { useAcademicYear } from "./yearContext";

/**
 * The data layer that replaces "load the whole school into a JavaScript
 * object and filter it with .filter()".
 *
 * Every hook here has three properties the old model could not have:
 *
 *   BOUNDED     — a request returns a page, never a table. The response size
 *                 is set by the page size, not by how many students the
 *                 school has or how many years it has been running.
 *   YEAR-SCOPED — the selected academic year is part of every query key and
 *                 every server call, so cached pages from one year can never
 *                 be shown under another.
 *   ROLE-SCOPED — the server decides the boundary (0024_paged_queries.sql).
 *                 A teacher's request for "students" returns their sections;
 *                 the same call from a guardian returns their children. The
 *                 client does not filter for security and cannot widen it.
 *
 * Caching strategy: reference data is effectively permanent, lists are
 * short-lived, and a single record sits in between. Mutations invalidate by
 * prefix rather than refetching everything.
 */

/* ========================================================================
   Query keys — one place, so invalidation can never drift from fetching.
   ======================================================================== */

export const qk = {
  bootstrap: (year: string) => ["bootstrap", year] as const,
  reference: (year: string) => ["reference", year] as const,
  students: (year: string, f: StudentFilters) => ["students", year, f] as const,
  student: (year: string, id: string) => ["student", year, id] as const,
  assessmentStructures: (year: string) => ["assessment-structures", year] as const,
  marksheet: (year: string, structureId: string, sectionId?: string, search?: string, page?: number) => ["marksheet", year, structureId, sectionId ?? "*", search ?? "", page ?? 0] as const,
  register: (year: string, c: string, s: string, day: string) =>
    ["register", year, c, s, day] as const,
  attendanceSummary: (year: string, c?: string, s?: string) =>
    ["attendance-summary", year, c ?? "*", s ?? "*"] as const,
  fees: (year: string, f: FeeFilters) => ["fees", year, f] as const,
  feeStudents: (year: string, f: FeeStudentFilters) => ["fee-students", year, f] as const,
  feeRequests: (year: string, f: FeeRequestFilters) => ["fee-requests", year, f] as const,
  conversations: (year: string) => ["conversations", year] as const,
  messages: (conversationId: string) => ["messages", conversationId] as const,
  notifications: (unreadOnly: boolean) => ["notifications", unreadOnly] as const,
  audit: (year: string) => ["audit", year] as const,
};

const STALE = {
  /** Classes, subjects, grading scale — changes about twice a year. */
  reference: 60 * 60 * 1000,
  /** Who I am and what I may do — for the session. */
  session: 30 * 60 * 1000,
  /** Lists people edit: stale quickly enough to feel live. */
  list: 30 * 1000,
  /** A single record being viewed. */
  record: 60 * 1000,
  /** Chat: always refetch on mount. */
  realtime: 0,
};

/**
 * Every call goes through the server API — allowlisted, rate-limited, and
 * authenticated by an httpOnly cookie the browser cannot read. Reads are
 * coalesced by src/lib/http.ts; writes never are.
 */
const rpc = <T>(fn: string, args: Record<string, unknown> = {}) => callRpc<T>(fn, args);
const write = <T>(fn: string, args: Record<string, unknown> = {}) => callWrite<T>(fn, args);

export async function saveStudent(payload: Record<string, unknown>, yearId: string) {
  return write<{ studentId: string; created: boolean }>("save_student", { p_payload: payload, p_year_id: yearId });
}

export async function updateMyProfile(args: {
  username: string;
  currentPassword?: string;
  newPassword?: string;
  fullName?: string;
}): Promise<{ username: string; fullName: string; passwordChanged: boolean }> {
  const token = csrfToken();
  const res = await fetch("/api/auth/update-profile", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-csrf-token": token } : {}),
    },
    body: JSON.stringify({
      username: args.username,
      currentPassword: args.currentPassword || null,
      newPassword: args.newPassword || null,
      fullName: args.fullName || null,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    const err = payload?.error ?? {};
    throw new ApiError(
      err.code ?? "server_error",
      err.message ?? "Could not update your profile. Please try again.",
      res.status
    );
  }
  return payload.data as { username: string; fullName: string; passwordChanged: boolean };
}

export async function changeUserPassword(userId: string, password: string): Promise<{ userId: string; changed: boolean }> {
  return callWrite("change_user_password", { p_id: userId, p_password: password });
}

export async function createUserAccount(args: {
  username: string;
  password: string;
  fullName: string;
  role: string;
  roleDefId: string;
  teacherId?: string | null;
  studentId?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<string> {
  return callWrite<string>("create_user_account", {
    p_username: args.username,
    p_password: args.password,
    p_full_name: args.fullName,
    p_role: args.role,
    p_role_def_id: args.roleDefId,
    p_teacher_id: args.teacherId ?? null,
    p_student_id: args.studentId ?? null,
    p_email: args.email ?? null,
    p_phone: args.phone ?? null,
  });
}

export async function deleteUserAccount(userId: string): Promise<{ error: string | null }> {
  try {
    await callWrite("delete_user_account", { p_id: userId });
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateUserAccount(payload: Record<string, unknown>): Promise<{ userId: string }> {
  return callWrite<{ userId: string }>("update_user_account", { p_payload: payload });
}

/* ========================================================================
   Bootstrap — one request, role-shaped, year-scoped.
   Replaces get_app_bootstrap()'s full-database dump.
   ======================================================================== */

export interface Scope {
  profileId: string;
  role: "admin" | "teacher" | "student" | "guardian";
  roleDefId: string;
  yearId: string;
  permissions: string[];
  teacherId?: string;
  studentId?: string;
  childIds?: string[];
  assignments?: { classId: string; sectionId: string; subjectId: string }[];
  children?: { studentId: string; classId: string; sectionId: string; rollNumber: number }[];
}

export interface Bootstrap {
  yearId: string;
  scope: Scope;
  reference: {
    school: Record<string, unknown> | null;
    years: unknown[];
    terms: unknown[];
    classes: { id: string; name: string; level: number }[];
    sections: { id: string; class_id: string; name: string }[];
    subjects: { id: string; name: string; code: string; color: string | null }[];
    grading: { min_pct: number; max_pct: number; grade: string; remark: string }[];
    roleDefs: unknown[];
  };
  profile: Record<string, unknown> | null;
  unread: number;
  summary?: Record<string, number>;
  timetable?: unknown[];
  structures?: unknown[];
  fees?: unknown[];
  children?: unknown[];
}

export function useBootstrap() {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: qk.bootstrap(yearId ?? ""),
    enabled: Boolean(yearId),
    staleTime: STALE.session,
    queryFn: () => rpc<Bootstrap>("get_bootstrap_v3", { p_year_id: yearId }),
  });
}

/** Live count for the admin Fees navigation badge. The bootstrap summary is
 * intentionally tiny for administrators (counts only), so this does not load
 * the fee ledger just to render the sidebar. */
export function useAdminPendingFeePayments(yearId: string | null, enabled = true): number {
  const { data } = useQuery({
    queryKey: ["pending-fee-payments", yearId ?? ""] as const,
    enabled: enabled && Boolean(yearId),
    staleTime: 0,
    refetchInterval: 2500,
    queryFn: () => rpc<Bootstrap>("get_bootstrap_v3", { p_year_id: yearId }),
  });
  return Number(data?.summary?.pendingFeePayments ?? 0);
}

/** The caller's permission set, for gating UI. Authorization still happens
 *  on the server — this only decides what is worth rendering. */
export function usePermissions(): Set<string> {
  const { data } = useBootstrap();
  return new Set(data?.scope?.permissions ?? []);
}

/* ========================================================================
   Students — paged and searched on the server.

   The old people.tsx filtered an in-memory array on every keystroke. At
   5,000 students that is 5,000 string comparisons per character typed, on
   the UI thread. Here the browser sends the search term and receives 50
   rows; the trigram index in 0022 does the matching.
   ======================================================================== */

export interface StudentFilters {
  classId?: string;
  sectionId?: string;
  status?: string;
  search?: string;
  sort?: "name" | "roll" | "reg" | "admission";
  page?: number;
  pageSize?: number;
}

export interface StudentRow {
  student_id: string;
  reg_no: string;
  full_name: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  dob: string;
  photo_path: string | null;
  status: string;
  class_id: string;
  section_id: string;
  roll_number: number | null;
  guardian_phone: string | null;
  admission_date?: string | null;
  total_count: number;
}

export function useStudents(filters: StudentFilters = {}) {
  const { yearId } = useAcademicYear();
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;

  const query = useQuery({
    queryKey: qk.students(yearId ?? "", { ...filters, page, pageSize }),
    enabled: Boolean(yearId),
    staleTime: STALE.list,
    // Keeps the previous page on screen while the next one loads, so paging
    // and typing don't flash an empty table.
    placeholderData: keepPreviousData,
    queryFn: () =>
      rpc<StudentRow[]>("list_students", {
        p_year_id: yearId,
        p_class_id: filters.classId ?? null,
        p_section_id: filters.sectionId ?? null,
        p_status: filters.status ?? "active",
        p_search: filters.search?.trim() || null,
        p_sort: filters.sort ?? "name",
        p_limit: pageSize,
        p_offset: page * pageSize,
      }),
  });

  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return {
    ...query,
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface UserRow {
  id: string;
  full_name: string;
  username: string;
  role: string;
  role_def_id: string;
  status: string;
  email: string | null;
  phone: string | null;
  teacher_id: string | null;
  student_id: string | null;
  created_at: string;
  children_ids: string[];
  linked_name: string | null;
  linked_class_id: string | null;
  linked_section_id: string | null;
  total_count: number;
}

export interface UserFilters {
  enabled?: boolean;
  role?: string;
  status?: string;
  search?: string;
  classId?: string;
  sectionId?: string;
  page?: number;
  pageSize?: number;
}

export function useUsers(filters: UserFilters = {}) {
  const { yearId } = useAcademicYear();
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;
  const query = useQuery({
    queryKey: ["users", yearId ?? "", { ...filters, page, pageSize }] as const,
    enabled: Boolean(yearId) && (filters.enabled ?? true),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    queryFn: () => rpc<UserRow[]>("list_users", {
      p_year_id: yearId,
      p_role: filters.role ?? null,
      p_status: filters.status ?? null,
      p_search: filters.search?.trim() || null,
      p_class_id: filters.classId ?? null,
      p_section_id: filters.sectionId ?? null,
      p_limit: pageSize,
      p_offset: page * pageSize,
    }),
  });
  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return { ...query, rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export function useStudentDetail(studentId: string | null) {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: qk.student(yearId ?? "", studentId ?? ""),
    enabled: Boolean(yearId && studentId),
    staleTime: STALE.record,
    queryFn: () =>
      rpc<Record<string, unknown>>("get_student_detail", {
        p_student_id: studentId,
        p_year_id: yearId,
      }),
  });
}

/* ========================================================================
   Marks and attendance — the two tables that grow fastest.
   ======================================================================== */

export interface AssessmentStructureRow {
  id: string;
  year_id: string;
  class_id: string;
  subject_id: string;
  term_id: string;
  period: string;
  status: string;
  items: { id: string; name: string; max: number; weight: number }[];
}

export function useAssessmentStructures() {
  const { yearId } = useAcademicYear();
  const query = useQuery({
    queryKey: qk.assessmentStructures(yearId ?? ""),
    enabled: Boolean(yearId),
    staleTime: STALE.reference,
    queryFn: () => rpc<AssessmentStructureRow[]>("list_assessment_structures", { p_year_id: yearId }),
  });
  return { ...query, rows: query.data ?? [] };
}

export interface MarksheetPageRow {
  student_id: string;
  full_name: string;
  reg_no: string;
  roll_number: number | null;
  marks: Record<string, number>;
  total: number;
  pct: number;
  complete: boolean;
  rank: number | null;
  total_count: number;
}

export interface MarksheetPage {
  structure: { id: string; year_id: string; class_id: string; subject_id: string; term_id: string; period: string };
  status: string;
  submission: Record<string, any>;
  items: { id: string; name: string; max: number; weight: number }[];
  rows: MarksheetPageRow[];
}

export function useMarksheetPage(structureId: string | null, sectionId?: string, search?: string, page = 0, pageSize = 100) {
  const { yearId } = useAcademicYear();
  const query = useQuery({
    queryKey: qk.marksheet(yearId ?? "", structureId ?? "", sectionId, search, page),
    enabled: Boolean(structureId),
    staleTime: STALE.record,
    placeholderData: keepPreviousData,
    queryFn: () => rpc<MarksheetPage>("get_marksheet_page", {
      p_structure_id: structureId, p_section_id: sectionId ?? null, p_search: search?.trim() || null,
      p_limit: pageSize, p_offset: page * pageSize,
    }),
  });
  const rows = query.data?.rows ?? [];
  const total = rows[0]?.total_count ?? 0;
  return { ...query, data: query.data ?? null, rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function saveStudentMarks(structureId: string, studentId: string, values: Record<string, number>) {
  return write("save_student_marks", { p_structure_id: structureId, p_student_id: studentId, p_values: values });
}

export async function setSubmissionStatus(structureId: string, status: "submitted" | "approved" | "returned" | "published" | "draft", reason?: string) {
  return write("set_submission_status", { p_structure_id: structureId, p_status: status, p_reason: reason ?? null });
}

export function useMarksheet(structureId: string | null) {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: qk.marksheet(yearId ?? "", structureId ?? ""),
    enabled: Boolean(structureId),
    staleTime: STALE.record,
    queryFn: () => rpc<Record<string, unknown>>("get_marksheet", { p_structure_id: structureId }),
  });
}

export async function saveRegister(args: {
  yearId: string;
  classId: string;
  sectionId: string;
  day: string;
  marks: Record<string, string>;
}) {
  return write("save_register", {
    p_year_id: args.yearId,
    p_class_id: args.classId,
    p_section_id: args.sectionId,
    p_day: args.day,
    p_marks: args.marks,
  });
}

export function useRegister(classId: string | null, sectionId: string | null, day: string) {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: qk.register(yearId ?? "", classId ?? "", sectionId ?? "", day),
    enabled: Boolean(yearId && classId && sectionId && day),
    staleTime: STALE.list,
    queryFn: () =>
      rpc<Record<string, unknown>>("get_register", {
        p_year_id: yearId,
        p_class_id: classId,
        p_section_id: sectionId,
        p_day: day,
      }),
  });
}

export interface AttendanceSummaryPageFilters {
  classId?: string;
  sectionId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useAttendanceSummaryPage(filters: AttendanceSummaryPageFilters = {}) {
  const { yearId } = useAcademicYear();
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;
  const query = useQuery({
    queryKey: ["attendance-summary-page", yearId ?? "", { ...filters, page, pageSize }] as const,
    enabled: Boolean(yearId),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    queryFn: () => rpc<AttendanceSummaryRow[]>("get_attendance_summary_page", {
      p_year_id: yearId,
      p_class_id: filters.classId ?? null,
      p_section_id: filters.sectionId ?? null,
      p_from: filters.from ?? null,
      p_to: filters.to ?? null,
      p_search: filters.search?.trim() || null,
      p_limit: pageSize,
      p_offset: page * pageSize,
    }),
  });
  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return { ...query, rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface AttendanceSummaryRow {
  student_id: string;
  full_name: string;
  roll_number: number | null;
  present: number;
  absent: number;
  late: number;
  total: number;
  pct: number;
}

export function useAttendanceSummary(classId?: string, sectionId?: string, from?: string, to?: string) {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: [...qk.attendanceSummary(yearId ?? "", classId, sectionId), from ?? "*", to ?? "*"],
    enabled: Boolean(yearId),
    staleTime: STALE.list,
    queryFn: () =>
      rpc<AttendanceSummaryRow[]>("get_attendance_summary", {
        p_year_id: yearId,
        p_class_id: classId ?? null,
        p_section_id: sectionId ?? null,
        p_from: from ?? null,
        p_to: to ?? null,
      }),
  });
}

/* ========================================================================
   Fees
   ======================================================================== */

export interface FeeFilters {
  classId?: string;
  sectionId?: string;
  onlyOutstanding?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface FeeRow {
  fee_id: string;
  student_id: string;
  full_name: string;
  class_id: string | null;
  section_id: string | null;
  label: string;
  amount: number;
  paid: number;
  due_date: string | null;
  term_id: string | null;
  total_count: number;
  total_billed: number;
  total_paid: number;
}

export interface FeeStudentFilters {
  classId?: string;
  sectionId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface FeeStudentSummaryRow {
  student_id: string; full_name: string; reg_no: string; class_id: string | null; section_id: string | null;
  billed: number; paid: number; outstanding: number; total_count: number; total_billed: number; total_paid: number; total_outstanding: number;
}

export function useFeeStudentSummary(filters: FeeStudentFilters = {}) {
  const { yearId } = useAcademicYear();
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;
  const query = useQuery({
    queryKey: qk.feeStudents(yearId ?? "", { ...filters, page, pageSize }),
    enabled: Boolean(yearId),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    queryFn: () => rpc<FeeStudentSummaryRow[]>("list_fee_student_summary", {
      p_year_id: yearId, p_class_id: filters.classId ?? null, p_section_id: filters.sectionId ?? null,
      p_search: filters.search?.trim() || null, p_limit: pageSize, p_offset: page * pageSize,
    }),
  });
  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return { ...query, rows, total, billed: rows[0]?.total_billed ?? 0, collected: rows[0]?.total_paid ?? 0, outstanding: rows[0]?.total_outstanding ?? 0, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface FeeRequestRow {
  id: string; student_id: string; fee_item_id: string; amount: number; bank_account_id: string; bank_name: string; reference: string | null;
  receipt_path: string | null; receipt_name: string | null; submitted_by: string; submitted_by_name: string | null; submitted_at: string; status: string;
  reviewed_by: string | null; reviewed_by_name: string | null; reviewed_at: string | null; review_note: string | null; student_name: string; fee_label: string; total_count: number;
}
export interface FeeRequestFilters {
  status?: string; search?: string; receiptOnly?: boolean; page?: number; pageSize?: number;
}
export function useFeePaymentRequests(filters: FeeRequestFilters = {}) {
  const { yearId } = useAcademicYear();
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;
  const query = useQuery({
    queryKey: qk.feeRequests(yearId ?? "", { ...filters, page, pageSize }),
    enabled: Boolean(yearId), staleTime: STALE.list, placeholderData: keepPreviousData,
    queryFn: () => rpc<FeeRequestRow[]>("list_fee_payment_requests", {
      p_year_id: yearId, p_status: filters.status ?? null, p_search: filters.search?.trim() || null,
      p_receipt_only: filters.receiptOnly ?? false, p_limit: pageSize, p_offset: page * pageSize,
    }),
  });
  const rows = query.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  return { ...query, rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function bulkCreateFeeItems(args: { yearId: string; classId?: string | null; sectionId?: string | null; label: string; amount: number; dueDate?: string | null }) {
  return write("bulk_create_fee_items", { p_year_id: args.yearId, p_class_id: args.classId ?? null, p_section_id: args.sectionId ?? null, p_label: args.label, p_amount: args.amount, p_due_date: args.dueDate ?? null });
}
export async function createFeeItem(args: { id: string; studentId: string; label: string; amount: number; dueDate?: string | null; yearId?: string | null }) {
  return write("create_fee_item", { p_id: args.id, p_student_id: args.studentId, p_label: args.label, p_amount: args.amount, p_due_date: args.dueDate ?? null, p_year_id: args.yearId ?? null });
}
export async function deleteFeeItem(feeItemId: string) { return write("delete_fee_item", { p_fee_item_id: feeItemId }); }
export async function recordFeePayment(args: { feeItemId: string; amount: number; method: string; reference?: string | null; bank?: string | null; paymentId?: string | null; note?: string | null }) {
  return write("record_fee_payment", { p_fee_item_id: args.feeItemId, p_amount: args.amount, p_method: args.method, p_reference: args.reference ?? null, p_bank: args.bank ?? null, p_payment_id: args.paymentId ?? null, p_note: args.note ?? null });
}
export async function reviewFeePaymentRequest(requestId: string, status: "approved" | "rejected", note?: string) {
  return write("review_fee_payment_request", { p_request_id: requestId, p_status: status, p_note: note ?? null });
}

export interface FeeLedgerItem {
  id: string; student_id: string; label: string; amount: number; paid: number; due_date: string | null; term_id: string | null; payments: any[];
}
export interface FeeLedger {
  student: { id: string; reg_no: string; first_name: string; middle_name?: string | null; last_name: string; photo_path?: string | null };
  items: FeeLedgerItem[];
}
export function useFeeLedger(studentId: string | null) {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: ["fee-ledger", yearId ?? "", studentId ?? ""] as const,
    enabled: Boolean(yearId && studentId),
    staleTime: STALE.record,
    queryFn: () => rpc<FeeLedger>("get_fee_ledger", { p_year_id: yearId, p_student_id: studentId }),
  });
}

export function useFees(filters: FeeFilters = {}) {
  const { yearId } = useAcademicYear();
  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;

  const query = useQuery({
    queryKey: qk.fees(yearId ?? "", { ...filters, page, pageSize }),
    enabled: Boolean(yearId),
    staleTime: STALE.list,
    placeholderData: keepPreviousData,
    queryFn: () =>
      rpc<FeeRow[]>("list_fees", {
        p_year_id: yearId,
        p_class_id: filters.classId ?? null,
        p_section_id: filters.sectionId ?? null,
        p_only_outstanding: filters.onlyOutstanding ?? false,
        p_search: filters.search?.trim() || null,
        p_limit: pageSize,
        p_offset: page * pageSize,
      }),
  });

  const rows = query.data ?? [];
  return {
    ...query,
    rows,
    total: rows[0]?.total_count ?? 0,
    billed: rows[0]?.total_billed ?? 0,
    collected: rows[0]?.total_paid ?? 0,
    page,
    pageSize,
  };
}

export interface StudentResultRow {
  structure: { id: string; year_id: string; class_id: string; subject_id: string; term_id: string; period: string };
  subject: { id: string; name: string; code: string; color: string | null };
  status: string;
  items: { id: string; name: string; max: number; weight: number }[];
  marks: Record<string, number>;
}

export interface StudentResultsResponse {
  student: { id: string; reg_no: string; first_name: string; middle_name?: string | null; last_name: string; photo_path?: string | null; class_id?: string | null; section_id?: string | null; roll_number?: number | null };
  results: StudentResultRow[];
}

export function useStudentResults(studentId: string | null, publishedOnly = false) {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: ["student-results", yearId ?? "", studentId ?? "", publishedOnly] as const,
    enabled: Boolean(yearId && studentId),
    staleTime: STALE.record,
    queryFn: () => rpc<StudentResultsResponse>("get_student_results", {
      p_student_id: studentId, p_year_id: yearId, p_published_only: publishedOnly,
    }),
  });
}

/* ========================================================================
   Messaging — keyset pagination.

   OFFSET-based paging gets slower the further back you scroll, because the
   database still has to walk the rows it is skipping. "Everything before
   this timestamp" is an index seek no matter how deep the thread goes, so
   scrolling back through two years of messages costs the same as loading
   the first screen.
   ======================================================================== */

export interface MessageReportRow {
  id: string; message_id: string; conversation_id: string; reporter_id: string; reported_user_id: string | null;
  reason: string; detail: string | null; status: string; created_at: string;
  reporter_name: string | null; reporter_username: string | null; reported_user_name: string | null;
  reported_user_username: string | null; reported_user_role: string | null; message_body: string | null;
}

export function useMessageReports(status?: string, page = 0, pageSize = 50) {
  return useQuery({
    queryKey: ["message-reports", status ?? "*", page, pageSize] as const,
    staleTime: STALE.list,
    queryFn: () => rpc<MessageReportRow[]>("list_message_reports", { p_status: status ?? null, p_limit: pageSize, p_offset: page * pageSize }),
  });
}

export async function reviewMessageReport(reportId: string, status: "resolved" | "dismissed") {
  return write("review_message_report", { p_report_id: reportId, p_status: status });
}

export async function setConversationStatus(conversationId: string, status: "active" | "archived" | "hidden") {
  return write("set_conversation_status", { p_conversation_id: conversationId, p_status: status });
}

export function useConversations() {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: qk.conversations(yearId ?? ""),
    enabled: Boolean(yearId),
    staleTime: STALE.realtime,
    queryFn: () => rpc<unknown[]>("list_conversations", { p_year_id: yearId, p_limit: 30 }),
  });
}

export interface MessageRow {
  id: string;
  sender_id: string;
  body: string;
  read_by: string[];
  created_at: string;
}

export async function sendMessage(conversationId: string, body: string) {
  return write("send_message", { p_conversation_id: conversationId, p_body: body });
}
export async function markConversationRead(conversationId: string) {
  return write("mark_message_read", { p_conversation_id: conversationId });
}

export async function fileMessageReport(args: { messageId: string; conversationId: string; reason: string; detail?: string }) {
  return write("file_message_report", {
    p_message_id: args.messageId,
    p_conversation_id: args.conversationId,
    p_reason: args.reason,
    p_detail: args.detail?.trim() || null,
  });
}

export function useTeacherSectionCounts() {
  const { yearId } = useAcademicYear();
  return useQuery({
    queryKey: ["teacher-section-counts", yearId ?? ""] as const,
    enabled: Boolean(yearId),
    staleTime: STALE.list,
    queryFn: () => rpc<{ class_id: string; section_id: string; count: number }[]>("teacher_section_counts", { p_year_id: yearId }),
  });
}

export function useMessages(conversationId: string | null, pageSize = 50) {
  return useInfiniteQuery({
    queryKey: qk.messages(conversationId ?? ""),
    enabled: Boolean(conversationId),
    staleTime: STALE.realtime,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      rpc<MessageRow[]>("list_messages", {
        p_conversation_id: conversationId,
        p_before: pageParam,
        p_limit: pageSize,
      }),
    // The cursor is the oldest message we have; a short page means we've
    // reached the start of the thread.
    getNextPageParam: (last) =>
      last.length < pageSize ? undefined : last[last.length - 1]?.created_at ?? undefined,
  });
}

export function useNotifications(unreadOnly = false, pageSize = 30) {
  return useInfiniteQuery({
    queryKey: qk.notifications(unreadOnly),
    enabled: true,
    staleTime: STALE.realtime,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      rpc<{ id: string; created_at: string }[]>("list_notifications", {
        p_before: pageParam,
        p_limit: pageSize,
        p_unread_only: unreadOnly,
      }),
    getNextPageParam: (last) =>
      last.length < pageSize ? undefined : last[last.length - 1]?.created_at ?? undefined,
  });
}

export function useAuditLog(pageSize = 50) {
  const { yearId } = useAcademicYear();
  return useInfiniteQuery({
    queryKey: qk.audit(yearId ?? ""),
    enabled: Boolean(yearId),
    staleTime: STALE.list,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      rpc<{ id: string; at: string }[]>("list_audit", {
        p_year_id: yearId,
        p_before: pageParam,
        p_limit: pageSize,
      }),
    getNextPageParam: (last) =>
      last.length < pageSize ? undefined : last[last.length - 1]?.at ?? undefined,
  });
}

/* ========================================================================
   Year lifecycle mutations (0025_year_lifecycle.sql).
   ======================================================================== */

export function useYearAdmin() {
  const qc = useQueryClient();
  const invalidateEverything = () => qc.invalidateQueries();

  return {
    createYear: useMutation({
      mutationFn: (v: { id: string; name: string; start: string; end: string; terms?: string[] }) =>
        write("create_academic_year", {
          p_id: v.id,
          p_name: v.name,
          p_start: v.start,
          p_end: v.end,
          p_terms: v.terms ?? ["Term 1", "Term 2", "Term 3"],
        }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["academic-years"] }),
    }),

    setActiveYear: useMutation({
      mutationFn: (yearId: string) => write("set_active_year", { p_year_id: yearId }),
      onSuccess: invalidateEverything,
    }),

    closeYear: useMutation({
      mutationFn: (yearId: string) => write("close_year", { p_year_id: yearId }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["academic-years"] }),
    }),

    /** Copy a year's structure (assignments, timetable, grading, assessment
     *  shapes, fee templates) into a new year. Records are never copied. */
    rollover: useMutation({
      mutationFn: (v: { from: string; to: string }) =>
        write<Record<string, number>>("rollover_year", { p_from_year: v.from, p_to_year: v.to }),
      onSuccess: invalidateEverything,
    }),

    /** Move every active enrollment up one class level in one statement. */
    promote: useMutation({
      mutationFn: (v: { from: string; to: string; classId?: string; graduateTop?: boolean }) =>
        write<{ promoted: number; graduated: number }>("promote_students", {
          p_from_year: v.from,
          p_to_year: v.to,
          p_class_id: v.classId ?? null,
          p_graduate_top: v.graduateTop ?? true,
        }),
      onSuccess: invalidateEverything,
    }),

    /** Bill an entire class from one template. */
    applyFeeTemplate: useMutation({
      mutationFn: (templateId: string) => write("apply_fee_template", { p_template_id: templateId }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["fees"] }),
    }),
  };
}

/* ========================================================================
   Prefetching — the cheapest speed win available.

   Fires the request while the user is still deciding to click, so the page
   is already in cache by the time it mounts. Call from onMouseEnter on a
   row, or on a nav link.
   ======================================================================== */

export function usePrefetch() {
  const qc = useQueryClient();
  const { yearId } = useAcademicYear();

  return {
    student: (id: string) =>
      qc.prefetchQuery({
        queryKey: qk.student(yearId ?? "", id),
        queryFn: () => rpc("get_student_detail", { p_student_id: id, p_year_id: yearId }),
        staleTime: STALE.record,
      }),
    marksheet: (structureId: string) =>
      qc.prefetchQuery({
        queryKey: qk.marksheet(yearId ?? "", structureId),
        queryFn: () => rpc("get_marksheet", { p_structure_id: structureId }),
        staleTime: STALE.record,
      }),
  };
}
