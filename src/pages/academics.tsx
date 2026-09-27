import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Banknote, BookOpen, CalendarCheck2, CalendarRange, Check, CheckCheck, CheckCircle2, Settings2,
  ClipboardList, Clock as ClockIcon, Eye, FileBarChart2, FileDown, Globe2, Layers,
  PenLine, Pencil, Plus, Printer, Receipt, RotateCcw, Save, Send, ShieldCheck, Table2, Tag, Trash2,
  Undo2, UserCheck, UserX, Wallet, AlertTriangle,
} from "lucide-react";
import type {
  AcademicYear, AssessmentItem, AssessmentStructure, Assignment, AttendanceStatus, DB, FeeItem, Homework,
  PaymentMethod, PaymentRequest, SchoolClass, Section, Student, Submission, Subject, Term, TimetableEntry,
} from "../types";
import {
  assessmentCalc, attendanceStats, childrenOf, describeSyncErrors, feeStats, fmt1, fmtDate, fullName, getClass,
  getSubject, getTeacher, getYear, gradeFor, ordinal, sectionLabel, sectionShort, shortName,
  structureRanks, structureWeightSum, studentAverage, studentOf, studentResults, studentsOf,
  submissionFor, submissionStatus, teacherFor, teacherPairs, teacherStudentIds,
  todayISO, uid, useApp, useLazyGroups,
} from "../store";
import { hasPermission, isSuperAdmin, pushAudit, pushNotifications } from "../rbac";
import { WEEKDAYS } from "../data/seed";
import { DEFAULT_PERIODS, requestMarksReopen, reviewMarksReopen } from "../lib/backend";
import { downloadCsv, drawThemedHeader, drawThemedSectionLabel, drawThemedTable, newThemedDoc } from "../lib/exportKit";
import { clearFeeReceipt, getDownloadUrl } from "../lib/storage";
import {
  Avatar, Btn, Chip, EmptyState, Field, Modal, PageHead, Panel, Select, SkeletonCards, SkeletonPanel, SkeletonRows,
  Stat, Tabs, TextArea, TextInput, tdCls, thCls, useConfirm,
} from "../ui";
import { AccessDenied } from "./Auth";
import { useRegister, saveRegister, useAssessmentStructures, useMarksheetPage, saveStudentMarks, setSubmissionStatus, useStudentResults, useStudents, useFeeStudentSummary, useFeePaymentRequests, createFeeItem, deleteFeeItem, recordFeePayment, reviewFeePaymentRequest, bulkCreateFeeItems, useFeeLedger } from "../lib/api";

// DAYS was a fixed 5-day week; the timetable now reads db.settings.workingDays
// instead (a configurable subset of WEEKDAYS, imported below) so schools can
// add or remove days rather than being stuck at exactly 5 or 6.
const PERIODS = [1, 2, 3, 4, 5, 6];

/* ================= submission status chip (used by mark entry) ================= */
function SubmissionChip({ status }: { status: Submission["status"] }) {
  const meta: Record<Submission["status"], { tone: "gray" | "steel" | "gold" | "pine" | "rust"; label: string }> = {
    draft: { tone: "gray", label: "Draft" },
    submitted: { tone: "steel", label: "Submitted" },
    approved: { tone: "gold", label: "Approved" },
    published: { tone: "pine", label: "Published" },
    returned: { tone: "rust", label: "Returned" },
  };
  const m = meta[status];
  return <Chip tone={m.tone}>{m.label}</Chip>;
}

function exportMarkSheetCsv(db: DB, structure: AssessmentStructure, roster: Student[]) {
  const ranks = structureRanks(db, structure);
  const showGrade = getYear(db, structure.yearId)?.showGrade !== false;
  const header = ["#", "Student", "Reg. No", ...structure.items.map((i) => `${i.name} (/${i.max})`), "Total", "%", ...(showGrade ? ["Grade"] : []), "Rank"];
  const rows: (string | number)[][] = [header];
  roster.forEach((s, i) => {
    const calc = assessmentCalc(db, structure, s.id);
    const grade = calc?.complete ? gradeFor(calc.pct, db.grading) : null;
    rows.push([
      i + 1, fullName(s), s.regId,
      ...structure.items.map((it) => calc?.raw[it.id] ?? ""),
      calc?.complete ? fmt1(calc.total) : "",
      calc?.complete ? fmt1(calc.pct) : "",
      ...(showGrade ? [grade?.grade ?? ""] : []),
      calc?.complete && ranks[s.id] ? ranks[s.id] : "",
    ]);
  });
  const fname = `Marksheet-${getSubject(db, structure.subjectId)?.code ?? "subject"}-${getClass(db, structure.classId)?.name ?? ""}-${structure.period}.csv`.replace(/\s+/g, "-");
  downloadCsv(fname, rows);
}

function exportMarkSheetPdf(db: DB, structure: AssessmentStructure, roster: Student[]) {
  const ranks = structureRanks(db, structure);
  const showGrade = getYear(db, structure.yearId)?.showGrade !== false;
  const doc = newThemedDoc("landscape");
  const y0 = drawThemedHeader(doc, db.settings.schoolName, "Mark Sheet", `${getClass(db, structure.classId)?.name} · ${getSubject(db, structure.subjectId)?.name} · ${structure.period}`);
  const columns = [
    { header: "#", width: 8, align: "center" as const },
    { header: "Student", width: 45 },
    ...structure.items.map((it) => ({ header: `${it.name} /${it.max}`, width: 22, align: "center" as const })),
    { header: "Total", width: 18, align: "center" as const },
    { header: "%", width: 14, align: "center" as const },
    ...(showGrade ? [{ header: "Grade", width: 14, align: "center" as const }] : []),
    { header: "Rank", width: 12, align: "center" as const },
  ];
  const rows = roster.map((s, i) => {
    const calc = assessmentCalc(db, structure, s.id);
    const grade = calc?.complete ? gradeFor(calc.pct, db.grading) : null;
    return [
      i + 1, fullName(s),
      ...structure.items.map((it) => calc?.raw[it.id] ?? "—"),
      calc?.complete ? fmt1(calc.total) : "—",
      calc?.complete ? `${fmt1(calc.pct)}%` : "—",
      ...(showGrade ? [grade?.grade ?? "—"] : []),
      calc?.complete && ranks[s.id] ? ordinal(ranks[s.id]) : "—",
    ];
  });
  drawThemedTable(doc, y0 + 2, columns, rows);
  doc.save(`Marksheet-${getSubject(db, structure.subjectId)?.code ?? "subject"}-${structure.period}.pdf`.replace(/\s+/g, "-"));
}

/* ================= mark entry (admin full / teacher scoped) ================= */
export function MarkEntryPage() {
  const { db, currentUser, yearId, toast } = useApp();
  const location = useLocation();
  const assessmentQuery = useAssessmentStructures();
  const role = currentUser?.role ?? "admin";
  const isAdmin = role === "admin";
  const pairs = teacherPairs(db, currentUser);
  const [marksPage, setMarksPage] = useState(0);
  const [marksSearch, setMarksSearch] = useState("");
  const canViewMarks = hasPermission(db, currentUser, "exams.view");

  const allStructures: AssessmentStructure[] = useMemo(() => (assessmentQuery.rows ?? []).map((st) => ({
    id: st.id, yearId: st.year_id, classId: st.class_id, subjectId: st.subject_id, period: st.period,
    items: (st.items ?? []).map((i) => ({ id: i.id, name: i.name, max: Number(i.max), weight: Number(i.weight) })),
  })), [assessmentQuery.rows]);

  const allowedStructures = allStructures.filter((st) => {
    if (isAdmin) return true;
    return pairs.some((p) => p.classId === st.classId && p.subjectIds.includes(st.subjectId));
  });

  const classOptions = [...new Set(allowedStructures.map((st) => st.classId))];
  const subjectOptions = [...new Set(allowedStructures.map((st) => st.subjectId))];
  const periodOptions = [...new Set(allowedStructures.map((st) => st.period))];

  const requestedStructureId = new URLSearchParams(location.search).get("structure");
  const requestedStructure = requestedStructureId ? allowedStructures.find((st) => st.id === requestedStructureId) : undefined;
  const requestedStructureKey = requestedStructure ? `${requestedStructure.id}|${requestedStructure.classId}|${requestedStructure.subjectId}|${requestedStructure.period}` : "";

  const [filterClassId, setFilterClassId] = useState<string>(requestedStructure?.classId ?? "");
  const [filterSectionId, setFilterSectionId] = useState<string>("");
  const [filterSubjectId, setFilterSubjectId] = useState<string>(requestedStructure?.subjectId ?? "");
  const [filterPeriod, setFilterPeriod] = useState<string>(requestedStructure?.period ?? "");

  useEffect(() => {
    if (!requestedStructure) return;
    setFilterClassId(requestedStructure.classId);
    setFilterSubjectId(requestedStructure.subjectId);
    setFilterPeriod(requestedStructure.period);
    setFilterSectionId("");
  }, [requestedStructureKey]);

  const filteredStructures = allowedStructures.filter((st) => {
    if (filterClassId && st.classId !== filterClassId) return false;
    if (filterSectionId) {
      const cls = getClass(db, st.classId);
      if (!cls?.sections.some((s) => s.id === filterSectionId)) return false;
    }
    if (filterSubjectId && st.subjectId !== filterSubjectId) return false;
    if (filterPeriod && st.period !== filterPeriod) return false;
    return true;
  });

  const [editStruct, setEditStruct] = useState<AssessmentStructure | "new" | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // With class + subject + period all chosen, exactly one structure should match.
  const structure = filteredStructures.length === 1 ? filteredStructures[0] : null;
  const marksQuery = useMarksheetPage(structure?.id ?? null, filterSectionId || undefined, marksSearch, marksPage, 100);
  const submissionRaw = marksQuery.data?.submission ?? {};
  const submission: Submission | undefined = (submissionRaw as any).id ? {
    id: (submissionRaw as any).id, structureId: structure?.id ?? "", status: ((submissionRaw as any).status ?? marksQuery.data?.status ?? "draft") as Submission["status"],
    submittedBy: (submissionRaw as any).submitted_by ?? undefined, submittedAt: (submissionRaw as any).submitted_at ?? undefined,
    approvedBy: (submissionRaw as any).approved_by ?? undefined, approvedAt: (submissionRaw as any).approved_at ?? undefined,
    publishedBy: (submissionRaw as any).published_by ?? undefined, publishedAt: (submissionRaw as any).published_at ?? undefined,
    returnedBy: (submissionRaw as any).returned_by ?? undefined, returnedAt: (submissionRaw as any).returned_at ?? undefined,
    returnReason: (submissionRaw as any).return_reason ?? undefined,
    reopenReason: (submissionRaw as any).reopen_reason ?? undefined,
    reopenRequestStatus: (submissionRaw as any).reopen_request_status ?? "none",
    reopenRequestedBy: (submissionRaw as any).reopen_requested_by ?? undefined,
    reopenRequestedAt: (submissionRaw as any).reopen_requested_at ?? undefined,
    reopenRequestReason: (submissionRaw as any).reopen_request_reason ?? undefined,
    reopenDecidedBy: (submissionRaw as any).reopen_decided_by ?? undefined,
    reopenDecidedAt: (submissionRaw as any).reopen_decided_at ?? undefined,
    reopenDecisionNote: (submissionRaw as any).reopen_decision_note ?? undefined,
  } : undefined;
  const status = (marksQuery.data?.status ?? "draft") as Submission["status"];
  const roster: Student[] = useMemo(() => (marksQuery.rows ?? []).map((r) => {
    const [firstName, ...rest] = String(r.full_name ?? "").trim().split(/\s+/);
    return {
      id: r.student_id, regId: r.reg_no, firstName: firstName ?? "", middleName: "", lastName: rest.join(" "), gender: "Male", dob: "", status: "active",
      guardian: { father: "", relation: "Guardian" }, admission: { number: "", date: "", type: "" },
      enrollment: { yearId: structure?.yearId ?? yearId, classId: structure?.classId ?? "", sectionId: filterSectionId || "", rollNumber: r.roll_number ?? undefined, status: "active" }, history: [], documents: [],
    };
  }), [marksQuery.rows, structure, yearId, filterSectionId]);
  const viewDb = useMemo(() => ({
    ...db,
    students: roster,
    assessmentMarks: structure ? { ...db.assessmentMarks, [structure.id]: Object.fromEntries((marksQuery.rows ?? []).map((r) => [r.student_id, r.marks])) } : db.assessmentMarks,
  }), [db, roster, structure, marksQuery.rows]);
  const ranks = useMemo(() => Object.fromEntries((marksQuery.rows ?? []).map((r) => [r.student_id, r.rank ?? undefined])), [marksQuery.rows]);

  useEffect(() => { setMarksPage(0); }, [structure?.id, filterSectionId, marksSearch]);

  const availableSections = useMemo(() => {
    if (!filterClassId) return [];
    const cls = getClass(db, filterClassId);
    return cls?.sections || [];
  }, [db, filterClassId]);

  const canApprove = hasPermission(db, currentUser, "results.manage");
  const showGrade = getYear(db, structure?.yearId)?.showGrade !== false;
  const canPublish = hasPermission(db, currentUser, "results.publish");
  const canReopen = isSuperAdmin(db, currentUser); // DB enforces super-admin-only for this transition
  const canEnter = hasPermission(db, currentUser, "exams.enter_marks");
  // The database only allows writing assessment structures with exams.manage —
  // mirror that here so admin-shaped roles without it don't see buttons that
  // would fail on save.
  const canManageStructures = hasPermission(db, currentUser, "exams.manage");
  const canEdit = canEnter && (status === "draft" || status === "returned");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReasonInput, setReopenReasonInput] = useState("");
  // Tracks which workflow action (if any) is mid-flight, so its button can
  // show a spinner and every button can be disabled — without this there was
  // no feedback while `update()` was awaiting the server round-trip, which
  // made a slow save look hung and invited a second, overlapping click.
  const [workflowBusy, setWorkflowBusy] = useState<"submit" | "approve" | "return" | "publish" | "reopen" | "reopenRequest" | "reopenReview" | null>(null);
  const [reopenRequestOpen, setReopenRequestOpen] = useState(false);
  const [reopenRequestReason, setReopenRequestReason] = useState("");
  const [reopenReviewOpen, setReopenReviewOpen] = useState(false);
  const [reopenReviewDecision, setReopenReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reopenReviewNote, setReopenReviewNote] = useState("");

  const canEditStructure = canManageStructures && (isAdmin || status === "draft");

  if (!canViewMarks) {
    return <AccessDenied required="exams.view" reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }
  const canRequestReopen = !isAdmin && role === "teacher" && ["submitted", "approved", "published"].includes(status);
  const hasPendingReopenRequest = submission?.reopenRequestStatus === "pending";

  const doRequestReopen = async () => {
    if (!structure || !reopenRequestReason.trim() || workflowBusy) {
      if (!reopenRequestReason.trim()) toast("Please explain why these marks need to be reopened.", "warn");
      return;
    }
    setWorkflowBusy("reopenRequest");
    const error = await requestMarksReopen(structure.id, reopenRequestReason.trim());
    setWorkflowBusy(null);
    if (error) {
      toast(error, "warn");
      return;
    }
    await marksQuery.refetch();
    setReopenRequestReason("");
    setReopenRequestOpen(false);
    toast("Reopen request sent to administrators.");
  };

  const doReviewReopen = async () => {
    if (!structure || workflowBusy || (reopenReviewDecision === "rejected" && !reopenReviewNote.trim())) {
      if (reopenReviewDecision === "rejected" && !reopenReviewNote.trim()) toast("A reason is required when rejecting the request.", "warn");
      return;
    }
    setWorkflowBusy("reopenReview");
    const error = await reviewMarksReopen(structure.id, reopenReviewDecision, reopenReviewNote.trim() || undefined);
    setWorkflowBusy(null);
    if (error) {
      toast(error, "warn");
      return;
    }
    await marksQuery.refetch();
    setReopenReviewNote("");
    setReopenReviewOpen(false);
    toast(reopenReviewDecision === "approved" ? "Request approved — the teacher can edit marks again." : "Reopen request rejected.");
  };

  const doSubmit = async () => {
    if (!structure || !currentUser || workflowBusy) return;
    setWorkflowBusy("submit");
    try {
      const result = await setSubmissionStatus(structure.id, "submitted");
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await marksQuery.refetch();
      setConfirmSubmit(false);
      toast("Submitted for administrative review.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't submit marks.", "warn"); }
    finally { setWorkflowBusy(null); }
  };

  const doApprove = async () => {
    if (!structure || workflowBusy) return;
    setWorkflowBusy("approve");
    try {
      const result = await setSubmissionStatus(structure.id, "approved");
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await marksQuery.refetch();
      toast("Marks approved.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't approve marks.", "warn"); }
    finally { setWorkflowBusy(null); }
  };

  const doReturn = async () => {
    if (!structure || !returnReason.trim() || workflowBusy) { if (!returnReason.trim()) toast("A reason is required to return marks.", "warn"); return; }
    setWorkflowBusy("return");
    try {
      const result = await setSubmissionStatus(structure.id, "returned", returnReason.trim());
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await marksQuery.refetch();
      setReturnOpen(false); setReturnReason("");
      toast("Returned for correction.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't return marks.", "warn"); }
    finally { setWorkflowBusy(null); }
  };

  const doPublish = async () => {
    if (!structure || workflowBusy) return;
    setWorkflowBusy("publish");
    try {
      const result = await setSubmissionStatus(structure.id, "published");
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await marksQuery.refetch();
      setConfirmPublish(false);
      toast("Published — students and families can now view these results.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't publish results.", "warn"); }
    finally { setWorkflowBusy(null); }
  };

  const doReopen = async () => {
    if (!structure || !reopenReasonInput.trim() || workflowBusy) { if (!reopenReasonInput.trim()) toast("A reason is required to reopen a marks workflow.", "warn"); return; }
    setWorkflowBusy("reopen");
    try {
      const result = await setSubmissionStatus(structure.id, "draft", reopenReasonInput.trim());
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await marksQuery.refetch();
      setReopenOpen(false); setReopenReasonInput("");
      toast("Reopened — marks are editable again.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't reopen marks.", "warn"); }
    finally { setWorkflowBusy(null); }
  };

  const setScore = async (studentId: string, item: AssessmentItem, raw: string) => {
    if (!structure || !canEdit) return;
    const current = (marksQuery.rows ?? []).find((r) => r.student_id === studentId)?.marks ?? {};
    const next = { ...current };
    if (raw === "") delete next[item.id];
    else { const v = Number(raw); next[item.id] = isNaN(v) ? 0 : Math.max(0, Math.min(item.max, v)); }
    try {
      const result = await saveStudentMarks(structure.id, studentId, next);
      if ((result as any)?.error) { toast((result as any).error, "warn"); await marksQuery.refetch(); return; }
      setSavedAt(new Date().toLocaleTimeString("en-GB"));
      void marksQuery.refetch();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save mark.", "warn"); await marksQuery.refetch(); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead kicker="Examination" title="Mark entry" sub={isAdmin ? "Choose year, semester, grade, section and subject — totals, percentages, grades and ranks are all derived." : "Only subjects you are assigned to appear. Totals follow each structure's weights."}>
        {canManageStructures && <Btn variant="gold" onClick={() => setEditStruct("new")}><Plus className="h-4 w-4" /> New structure</Btn>}
      </PageHead>

      <div className="anim-rise mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-mist bg-card p-3">
        <div className="flex min-h-[44px] items-center rounded-lg border border-pine-200 bg-pine-50 px-3 text-[11.5px] font-semibold text-pine-800">
          <span>Academic year: <strong>{getYear(db, yearId)?.name ?? "Selected in header"}</strong></span>
        </div>

        <Field label="Semester" className="w-36">
          <Select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}>
            <option value="">All</option>
            {periodOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>

        <Field label="Grade" className="w-40">
          <Select
            value={filterClassId}
            onChange={(e) => { setFilterClassId(e.target.value); setFilterSectionId(""); }}
          >
            <option value="">All grades</option>
            {classOptions.map((id) => {
              const cls = getClass(db, id);
              return cls ? <option key={id} value={id}>{cls.name}</option> : null;
            })}
          </Select>
        </Field>

        <Field label="Section" className="w-32">
          <Select
            value={filterSectionId}
            onChange={(e) => setFilterSectionId(e.target.value)}
            disabled={!filterClassId}
          >
            <option value="">All sections</option>
            {availableSections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
          </Select>
        </Field>

        <Field label="Subject" className="w-48">
          <Select
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
          >
            <option value="">All subjects</option>
            {subjectOptions.map((id) => {
              const subj = getSubject(db, id);
              return subj ? <option key={id} value={id}>{subj.name}</option> : null;
            })}
          </Select>
        </Field>

        <Field label="Search student" className="w-48"><TextInput value={marksSearch} onChange={(e) => setMarksSearch(e.target.value)} placeholder="Name or reg. no…" /></Field>

        {(filterClassId || filterSectionId || filterSubjectId || filterPeriod) && (
          <Btn size="sm" variant="ghost" onClick={() => { setFilterClassId(""); setFilterSectionId(""); setFilterSubjectId(""); setFilterPeriod(""); }}>
            <RotateCcw className="h-3.5 w-3.5" /> Clear filters
          </Btn>
        )}
      </div>

      {assessmentQuery.isPending ? (
        <SkeletonPanel />
      ) : allowedStructures.length === 0 ? (
        <Panel className="anim-rise"><EmptyState icon={<Table2 className="h-5 w-5" />} title="No assessment structures in your scope" body={isAdmin ? "Create a structure: subject + period + assessments with max marks and weights." : "Structures appear here once the admin configures them for your subjects, or ask the office."} action={canManageStructures ? <Btn onClick={() => setEditStruct("new")}><Plus className="h-4 w-4" /> New structure</Btn> : undefined} /></Panel>
      ) : !structure ? (
        <Panel className="anim-rise">
          <EmptyState
            icon={<Table2 className="h-5 w-5" />}
            title={filteredStructures.length === 0 ? "No structure matches those filters" : "Choose a semester, grade and subject"}
            body={filteredStructures.length === 0 ? "Try a different combination, or ask the office to create one." : "Once all three narrow the list to a single mark sheet, it will open here."}
          />
        </Panel>
      ) : (
        <>
          <Panel className="anim-rise overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mist bg-pine-900 px-4 py-3.5 sm:px-5">
                <div>
                  <h2 className="font-display text-[15px] font-extrabold tracking-tight text-white">
                    {getSubject(db, structure.subjectId)?.name} — {getClass(db, structure.classId)?.name} · {structure.period}
                  </h2>
                  <p className="text-[11px] text-pine-300">Weights: {structure.items.map((i) => `${i.name} ${i.weight}%`).join(" · ")} · Σ {fmt1(structureWeightSum(structure))}%</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {savedAt && status === "draft" && <Chip tone="pine" className="!border-pine-600 !bg-pine-800 !text-pine-100"><Check className="h-3 w-3" /> Saved {savedAt}</Chip>}
                  <SubmissionChip status={status} />
                  {isAdmin && <Btn size="sm" variant="soft" onClick={() => exportMarkSheetCsv(viewDb, structure, roster)}><FileDown className="h-3.5 w-3.5" /> CSV</Btn>}
                  {isAdmin && <Btn size="sm" variant="soft" onClick={() => exportMarkSheetPdf(viewDb, structure, roster)}><Printer className="h-3.5 w-3.5" /> PDF</Btn>}
                  {canEditStructure && <Btn size="sm" variant="gold" onClick={() => setEditStruct(structure)}><Pencil className="h-3.5 w-3.5" /> Edit structure</Btn>}
                  {canManageStructures && !canEditStructure && !isAdmin && status !== "draft" && <Chip tone="steel"><ShieldCheck className="h-3 w-3" /> Structure locked</Chip>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-mist bg-paper/70 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && canEnter && (
                    <Btn size="sm" disabled={!!workflowBusy} onClick={() => setConfirmSubmit(true)}><Send className="h-3.5 w-3.5" /> Submit for review</Btn>
                  )}

                  {status === "submitted" && canApprove && (
                    <>
                      <Btn size="sm" variant="gold" busy={workflowBusy === "approve"} disabled={!!workflowBusy} onClick={doApprove}><CheckCheck className="h-3.5 w-3.5" /> Approve</Btn>
                      <Btn size="sm" variant="dangerSoft" disabled={!!workflowBusy} onClick={() => setReturnOpen(true)}><Undo2 className="h-3.5 w-3.5" /> Return for correction</Btn>
                    </>
                  )}
                  {status === "approved" && canPublish && (
                    <Btn size="sm" variant="solid" disabled={!!workflowBusy} onClick={() => setConfirmPublish(true)}><Globe2 className="h-3.5 w-3.5" /> Publish results</Btn>
                  )}
                  {(status === "approved" || status === "published") && canReopen && (
                    <Btn size="sm" variant="ghost" disabled={!!workflowBusy} onClick={() => setReopenOpen(true)}><RotateCcw className="h-3.5 w-3.5" /> Reopen</Btn>
                  )}
                  {canRequestReopen && !hasPendingReopenRequest && (
                    <Btn size="sm" variant="ghost" disabled={!!workflowBusy} onClick={() => setReopenRequestOpen(true)}><RotateCcw className="h-3.5 w-3.5" /> Request reopen</Btn>
                  )}
                  {canRequestReopen && hasPendingReopenRequest && (
                    <Chip tone="gold"><ClockIcon className="h-3 w-3" /> Reopen request pending</Chip>
                  )}
                </div>
                {!canEdit && (
                  <p className="ml-auto flex items-center gap-1.5 text-[11.5px] font-semibold text-soft">
                    <ShieldCheck className="h-3.5 w-3.5 text-pine-600" />
                    {status === "submitted" ? "Locked — awaiting administrative review." : status === "approved" ? "Locked — approved, ready to publish." : status === "published" ? "Locked — published and visible to students & families." : "Locked."}
                  </p>
                )}
                {canEdit && status === "returned" && submission?.returnReason && (
                  <p className="ml-auto max-w-md truncate text-[11.5px] font-semibold text-rust-600" title={submission.returnReason}>↩ {submission.returnReason}</p>
                )}
              </div>

              {isAdmin && hasPendingReopenRequest && submission && (
                <div className="border-b border-gold-200 bg-gold-50 px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[12px] font-extrabold text-ink"><RotateCcw className="h-4 w-4 text-gold-700" /> Teacher requested a reopen</div>
                      <p className="mt-1 text-[12px] text-soft">{submission.reopenRequestReason || "No reason provided."}</p>
                      <p className="mt-1 text-[10.5px] font-semibold text-soft">Requested {submission.reopenRequestedAt ? fmtDate(submission.reopenRequestedAt) : "recently"} · {submission.reopenRequestedBy === currentUser?.id ? (currentUser?.name ?? "Assigned teacher") : "Assigned teacher"}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Btn size="sm" variant="dangerSoft" disabled={!!workflowBusy} onClick={() => { setReopenReviewDecision("rejected"); setReopenReviewOpen(true); }}>Reject</Btn>
                      <Btn size="sm" variant="gold" disabled={!!workflowBusy} onClick={() => { setReopenReviewDecision("approved"); setReopenReviewOpen(true); }}><Check className="h-3.5 w-3.5" /> Approve & reopen</Btn>
                    </div>
                  </div>
                </div>
              )}

              <div className="mark-entry-table-wrap overflow-x-auto">
                <table className="mark-entry-table w-full min-w-[980px]">
                  <thead className="border-b border-mist bg-paper/60">
                    <tr>
                      <th className={`${thCls()} w-10`}>#</th>
                      <th className={`${thCls()} mark-entry-student-head`}>Student</th>
                      {structure.items.map((it) => (
                        <th key={it.id} className={`${thCls()} text-center`}>
                          <span className="block whitespace-nowrap">{it.name}</span>
                          <span className="font-mono text-[9.5px] font-semibold normal-case tracking-normal text-soft">/{it.max} · {it.weight}%</span>
                        </th>
                      ))}
                      <th className={`${thCls()} text-center text-gold-700`}>Total<span className="ml-1 font-mono text-[9.5px] font-semibold normal-case text-soft">/{fmt1(structureWeightSum(structure))}</span></th>
                      <th className={`${thCls()} text-center`}>%</th>
                      {showGrade && <th className={`${thCls()} text-center`}>Grade</th>}
                      <th className={`${thCls()} text-center`}>Rank</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist/70">
                    {roster.map((s, i) => {
                      const calc = assessmentCalc(viewDb, structure, s.id);
                      const grade = calc?.complete ? gradeFor(calc.pct, viewDb.grading) : null;
                      return (
                        <tr key={s.id} className={`transition-colors ${calc?.complete ? "hover:bg-pine-50/60" : calc ? "bg-gold-100/25" : "bg-paper/40"}`}>
                          <td className={`${tdCls()} tnum font-mono text-[11.5px] text-soft`}>{i + 1}</td>
                          <td className={`${tdCls()} mark-entry-student-cell`}>
                            <span className="flex flex-nowrap items-center gap-2.5 whitespace-nowrap">
                              <Avatar student={s} size={30} />
                              <span className="font-bold text-ink">{shortName(s)}</span>
                              {calc && !calc.complete && <Chip tone="gold">incomplete</Chip>}
                              {!calc && <Chip tone="gray">not started</Chip>}
                            </span>
                          </td>
                          {structure.items.map((it) => (
                            <td key={it.id} className={`${tdCls()} text-center`}>
                              <input
                                type="number" min={0} max={it.max}
                                value={calc?.raw[it.id] ?? ""}
                                placeholder="–"
                                disabled={!canEdit}
                                onChange={(e) => setScore(s.id, it, e.target.value)}
                                className={`tnum w-16 rounded-md border border-mist bg-card px-2 py-1.5 text-center font-mono text-[13px] font-semibold outline-none transition-all focus:border-pine-500 focus:ring-2 focus:ring-pine-500/25 ${!canEdit ? "cursor-not-allowed bg-paper/60 text-soft" : ""}`}
                              />
                            </td>
                          ))}
                          <td className={`${tdCls()} text-center font-mono text-[13px] font-bold ${calc ? "text-ink" : "text-soft/50"}`}>{calc ? fmt1(calc.total) : "—"}</td>
                          <td className={`${tdCls()} tnum text-center font-mono text-[12.5px] font-semibold ${calc ? "text-pine-800" : "text-soft/50"}`}>{calc ? `${fmt1(calc.pct)}%` : "—"}</td>
                          {showGrade && <td className={`${tdCls()} text-center`}>{grade ? <Chip tone={calc!.pct >= 80 ? "pine" : calc!.pct >= 50 ? "gold" : "rust"}>{grade.grade}</Chip> : <span className="text-soft/40">—</span>}</td>}
                          <td className={`${tdCls()} tnum text-center font-mono text-[12px] text-soft`}>{calc?.complete && ranks[s.id] ? ordinal(ranks[s.id]) : "—"}</td>
                        </tr>
                      );
                    })}
                    {roster.length === 0 && <tr><td colSpan={structure.items.length + 6} className="px-5 py-10 text-center text-[12.5px] text-soft">No students in scope for this structure.</td></tr>}
                  </tbody>
                </table>
              </div>
              {marksQuery.pageCount > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mist px-4 py-3 sm:px-5">
                  <span className="text-[11.5px] text-soft">Showing {marksQuery.page * marksQuery.pageSize + (roster.length ? 1 : 0)}–{marksQuery.page * marksQuery.pageSize + roster.length} of {marksQuery.total} students</span>
                  <div className="flex gap-2">
                    <Btn size="sm" variant="ghost" disabled={marksPage === 0 || marksQuery.isFetching} onClick={() => setMarksPage((p) => Math.max(0, p - 1))}>Previous</Btn>
                    <Btn size="sm" variant="soft" disabled={marksPage >= marksQuery.pageCount - 1 || marksQuery.isFetching} onClick={() => setMarksPage((p) => Math.min(marksQuery.pageCount - 1, p + 1))}>Next</Btn>
                  </div>
                </div>
              )}
            </Panel>
        </>
      )}

      {editStruct && canManageStructures && <StructureModal existing={editStruct === "new" ? undefined : editStruct} onClose={() => setEditStruct(null)} />}

      {structure && confirmSubmit && (
        <Modal title="Submit marks for review" kicker={`${getSubject(db, structure.subjectId)?.name} · ${getClass(db, structure.classId)?.name} · ${structure.period}`} onClose={() => !workflowBusy && setConfirmSubmit(false)}
          footer={<><Btn variant="ghost" disabled={!!workflowBusy} onClick={() => setConfirmSubmit(false)}>Cancel</Btn><Btn busy={workflowBusy === "submit"} onClick={doSubmit}><Send className="h-4 w-4" /> Submit</Btn></>}>
          <p className="text-[13px] leading-relaxed text-ink">
            You are about to submit marks for <strong>{getClass(db, structure.classId)?.name}</strong> — <strong>{getSubject(db, structure.subjectId)?.name}</strong> — <strong>{structure.period}</strong>.
          </p>
          <p className="mt-2 rounded-lg bg-paper px-3 py-2.5 text-[12.5px] leading-relaxed text-soft">
            Once submitted, marks are locked and require administrative review before publication.
            {canApprove && <span className="mt-1 block font-semibold text-pine-700">You hold the approve permission, so you may also approve this submission.</span>}
          </p>
        </Modal>
      )}

      {structure && returnOpen && (
        <Modal title="Return for correction" kicker="A reason is required" onClose={() => !workflowBusy && setReturnOpen(false)}
          footer={<><Btn variant="ghost" disabled={!!workflowBusy} onClick={() => setReturnOpen(false)}>Cancel</Btn><Btn variant="danger" busy={workflowBusy === "return"} onClick={doReturn}><Undo2 className="h-4 w-4" /> Return marks</Btn></>}>
          <Field label="Reason" required>
            <TextArea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g. Please verify Abebe's mark — the attendance register shows he was absent." />
          </Field>
          <p className="mt-2 text-[12px] text-soft">The teacher will be notified and can correct and resubmit.</p>
        </Modal>
      )}

      {structure && reopenOpen && (
        <Modal title="Reopen marks workflow" kicker="Super-admin only — a reason is required" onClose={() => !workflowBusy && setReopenOpen(false)}
          footer={<><Btn variant="ghost" disabled={!!workflowBusy} onClick={() => setReopenOpen(false)}>Cancel</Btn><Btn variant="danger" busy={workflowBusy === "reopen"} onClick={doReopen}><RotateCcw className="h-4 w-4" /> Reopen</Btn></>}>
          <Field label="Reason" required>
            <TextArea value={reopenReasonInput} onChange={(e) => setReopenReasonInput(e.target.value)} placeholder="e.g. Correcting a transcription error found after publishing." />
          </Field>
          <p className="mt-2 text-[12px] text-soft">This unlocks the marks for editing again and is permanently recorded in the audit log.</p>
        </Modal>
      )}

      {structure && reopenRequestOpen && (
        <Modal title="Request marks to be reopened" kicker="Administrator review required" onClose={() => !workflowBusy && setReopenRequestOpen(false)}
          footer={<><Btn variant="ghost" disabled={!!workflowBusy} onClick={() => setReopenRequestOpen(false)}>Cancel</Btn><Btn busy={workflowBusy === "reopenRequest"} onClick={doRequestReopen}><Send className="h-4 w-4" /> Send request</Btn></>}>
          <p className="text-[13px] leading-relaxed text-ink">These marks are locked. Explain what needs to be corrected so an administrator can decide whether to reopen them.</p>
          <div className="mt-3"><Field label="Reason" required><TextArea value={reopenRequestReason} onChange={(e) => setReopenRequestReason(e.target.value)} placeholder="e.g. I entered two students' marks against the wrong assessment item." /></Field></div>
          <p className="mt-2 text-[11.5px] text-soft">The request will remain pending until an authorized administrator approves or rejects it.</p>
        </Modal>
      )}

      {structure && reopenReviewOpen && (
        <Modal title={reopenReviewDecision === "approved" ? "Approve reopen request" : "Reject reopen request"} kicker="Teacher request" onClose={() => !workflowBusy && setReopenReviewOpen(false)}
          footer={<><Btn variant="ghost" disabled={!!workflowBusy} onClick={() => setReopenReviewOpen(false)}>Cancel</Btn><Btn variant={reopenReviewDecision === "approved" ? "gold" : "danger"} busy={workflowBusy === "reopenReview"} onClick={doReviewReopen}>{reopenReviewDecision === "approved" ? <><RotateCcw className="h-4 w-4" /> Approve & reopen</> : <><Undo2 className="h-4 w-4" /> Reject request</>}</Btn></>}>
          <p className="text-[13px] leading-relaxed text-ink">{submission?.reopenRequestReason || "No reason provided by the teacher."}</p>
          <div className="mt-3"><Field label={reopenReviewDecision === "rejected" ? "Reason for rejection" : "Note (optional)"} required={reopenReviewDecision === "rejected"}><TextArea value={reopenReviewNote} onChange={(e) => setReopenReviewNote(e.target.value)} placeholder={reopenReviewDecision === "rejected" ? "Explain why the marks should remain locked." : "Optional note for the teacher."} /></Field></div>
        </Modal>
      )}

      {structure && confirmPublish && (
        <Modal title="Publish results" kicker={`${getSubject(db, structure.subjectId)?.name} · ${getClass(db, structure.classId)?.name}`} onClose={() => !workflowBusy && setConfirmPublish(false)}
          footer={<><Btn variant="ghost" disabled={!!workflowBusy} onClick={() => setConfirmPublish(false)}>Cancel</Btn><Btn variant="gold" busy={workflowBusy === "publish"} onClick={doPublish}><Globe2 className="h-4 w-4" /> Publish</Btn></>}>
          <p className="text-[13px] leading-relaxed text-ink">Publishing makes these results visible to the students of <strong>{getClass(db, structure.classId)?.name}</strong> and their families.</p>
          <p className="mt-2 rounded-lg bg-paper px-3 py-2.5 text-[12.5px] text-soft">This is recorded in the audit log. You can reopen later if a correction is needed.</p>
        </Modal>
      )}
    </div>
  );
}

/** Create / edit an assessment structure — subject + class + period + weighted items. */
function StructureModal({ existing, onClose }: { existing?: AssessmentStructure; onClose: () => void }) {
  const { db, yearId, update, toast, currentUser } = useApp();
  const [classId, setClassId] = useState(existing?.classId ?? db.classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(existing?.subjectId ?? db.subjects[0]?.id ?? "");
  const [period, setPeriod] = useState(existing?.period ?? "Semester 1");
  const [items, setItems] = useState<AssessmentItem[]>(existing?.items.map((i) => ({ ...i })) ?? [
    { id: uid(), name: "Assessment 1", max: 20, weight: 20 },
    { id: uid(), name: "Final Exam", max: 40, weight: 40 },
  ]);

  const weightSum = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);

  const addItem = () => setItems((p) => [...p, { id: uid(), name: `Assessment ${p.length + 1}`, max: 20, weight: 20 }]);
  const removeItem = (id: string) => setItems((p) => p.filter((i) => i.id !== id));
  const patchItem = (id: string, patch: Partial<AssessmentItem>) => setItems((p) => p.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const save = async () => {
    if (!classId || !subjectId) { toast("Choose a class and subject.", "warn"); return; }
    if (items.length === 0) { toast("Add at least one assessment item.", "warn"); return; }
    if (items.some((i) => !i.name.trim())) { toast("Every item needs a name.", "warn"); return; }
    const errors = await update((d) => {
      if (existing) {
        const i = d.structures.findIndex((s) => s.id === existing.id);
        if (i >= 0) d.structures[i] = { ...existing, classId, subjectId, period, items };
        pushAudit(d, currentUser, "structure.update", `${getSubject(db, subjectId)?.name} · ${getClass(db, classId)?.name}`);
      } else {
        d.structures.push({ id: uid(), yearId, classId, subjectId, period, items });
        pushAudit(d, currentUser, "structure.create", `${getSubject(db, subjectId)?.name} · ${getClass(db, classId)?.name}`);
      }
    });
    if (errors.length) { toast(describeSyncErrors(errors), "warn"); return; }
    toast(existing ? "Structure updated." : "Structure created.");
    onClose();
  };

  return (
    <Modal title={existing ? "Edit assessment structure" : "New assessment structure"} kicker={`${getYear(db, yearId)?.name ?? "Academic year"} · ${existing ? "Locked workflow aware" : "Build a weighted mark sheet"}`} onClose={onClose} wide
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={weightSum !== 100}><Save className="h-4 w-4" /> Save structure</Btn></>}>
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1.4fr_1fr]">
          <div className="rounded-xl border border-mist bg-paper/70 p-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-soft">Class</p>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1.5">
              {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="rounded-xl border border-mist bg-paper/70 p-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-soft">Subject</p>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="mt-1.5">
              {db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div className="rounded-xl border border-mist bg-paper/70 p-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-soft">Period</p>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1.5">
              <option>Semester 1</option><option>Semester 2</option><option>Annual</option>
            </Select>
          </div>
        </div>

        <div className={`rounded-xl border p-4 ${weightSum === 100 ? "border-pine-200 bg-pine-50/60" : "border-gold-200 bg-gold-50/70"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-[14px] font-extrabold text-ink">Assessment blueprint</p>
              <p className="mt-0.5 text-[11.5px] text-soft">Each component contributes its weight to the final result.</p>
            </div>
            <div className="rounded-lg border border-white/70 bg-card px-3 py-2 text-right shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-soft">Total weight</p>
              <p className={`font-mono text-[18px] font-extrabold ${weightSum === 100 ? "text-pine-700" : "text-gold-700"}`}>{fmt1(weightSum)}%</p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist">
            <div className={`h-full rounded-full transition-all ${weightSum === 100 ? "bg-pine-600" : "bg-gold-500"}`} style={{ width: `${Math.min(100, weightSum)}%` }} />
          </div>
          {weightSum !== 100 && <p className="mt-2 text-[11.5px] font-semibold text-gold-800">Adjust the component weights to exactly 100% before saving.</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-soft">Components</p><p className="text-[11.5px] text-soft">Give every assessment a clear name, maximum mark and final weight.</p></div>
          <Btn size="sm" variant="soft" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Add component</Btn>
        </div>

        <div className="space-y-2.5">
          {items.map((it, index) => (
            <div key={it.id} className="rounded-xl border border-mist bg-card p-3.5 shadow-sm">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pine-100 font-mono text-[12px] font-extrabold text-pine-800">{String(index + 1).padStart(2, "0")}</div>
                <div className="min-w-[180px] flex-1">
                  <Field label="Assessment name" required><TextInput value={it.name} onChange={(e) => patchItem(it.id, { name: e.target.value })} placeholder="e.g. Midterm examination" /></Field>
                </div>
                <div className="w-full sm:w-28">
                  <Field label="Max mark" required><TextInput type="number" min="1" value={it.max} onChange={(e) => patchItem(it.id, { max: Math.max(1, Number(e.target.value) || 1) })} /></Field>
                </div>
                <div className="w-full sm:w-28">
                  <Field label="Weight %" required><TextInput type="number" min="0" max="100" step="0.01" value={it.weight} onChange={(e) => patchItem(it.id, { weight: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                </div>
                <button onClick={() => removeItem(it.id)} disabled={items.length <= 1} aria-label={`Remove assessment ${index + 1}`} className="mt-6 cursor-pointer rounded-lg border border-mist p-2 text-soft transition hover:border-rust-200 hover:bg-rust-50 hover:text-rust-600 disabled:cursor-not-allowed disabled:opacity-25"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );

}

/* =========================================================================
   CLASSES, SECTIONS & SUBJECTS
   Admin: full CRUD. Teacher/student/guardian: scoped read-only view of the
   classes they teach / are enrolled in, with subjects & teachers shown.
   ========================================================================= */
/* ================= academic years & terms (admin/superadmin, gated by academics.manage_years) ================= */
export function GradeConfigurationPage() {
  const { db, currentUser, update, toast, yearId, setYear } = useApp();
  const loaded = true;
  const canManage = hasPermission(db, currentUser, "academics.manage_years");
  const selectedYear = getYear(db, yearId);
  const [rows, setRows] = useState<DB["grading"]>([]);

  useEffect(() => {
    setRows((db.grading ?? []).map((g) => ({ ...g })));
  }, [yearId, db.grading]);

  if (!canManage) return <AccessDenied required="academics.manage_years" reason="Only authorized academic administrators can configure grading." />;

  const save = async () => {
    if (!selectedYear) return;
    const normalized = rows
      .map((g, i) => ({ ...g, yearId: selectedYear.id, id: g.id ?? uid() , min: Number(g.min), max: Number(g.max), grade: g.grade.trim(), remark: g.remark?.trim() ?? "" }))
      .sort((a, b) => b.min - a.min);
    for (let i = 0; i < normalized.length; i++) {
      const g = normalized[i];
      if (!g.grade) { toast("Every grade needs a grade label.", "warn"); return; }
      if (!Number.isFinite(g.min) || !Number.isFinite(g.max) || g.min < 0 || g.max > 100 || g.min > g.max) {
        toast(`Invalid range for ${g.grade}. Use 0–100 and make minimum no greater than maximum.`, "warn"); return;
      }
      for (let j = i + 1; j < normalized.length; j++) {
        const h = normalized[j];
        if (g.min <= h.max && g.max >= h.min) { toast(`${g.grade} overlaps ${h.grade}. Grade ranges cannot overlap.`, "warn"); return; }
      }
    }
    const errors = await update((d) => {
      d.grading = normalized;
      pushAudit(d, currentUser, "grading.update", selectedYear.name, `${normalized.length} grade bands configured`);
    });
    if (errors.length) toast(errors[0], "warn"); else toast("Grade configuration saved.");
  };

  const toggleVisibility = async (show: boolean) => {
    if (!selectedYear) return;
    const errors = await update((d) => {
      const y = d.years.find((x) => x.id === selectedYear.id);
      if (y) y.showGrade = show;
      pushAudit(d, currentUser, "grading.visibility", selectedYear.name, show ? "Grade column enabled" : "Grade column disabled");
    });
    if (errors.length) toast(errors[0], "warn"); else toast(show ? "Grade column enabled." : "Grade column hidden from results.");
  };

  const add = () => setRows((r) => [...r, { id: uid(), yearId: selectedYear?.id, min: 0, max: 49.99, grade: "F", remark: "Needs improvement" }]);
  const remove = (id?: string) => setRows((r) => r.filter((g) => g.id !== id));
  const updateRow = (id: string | undefined, patch: Partial<DB["grading"][number]>) => setRows((r) => r.map((g) => g.id === id ? { ...g, ...patch } : g));

  return <div className="mx-auto max-w-5xl">
    <PageHead kicker="Academics" title="Grade configuration" sub="Define percentage ranges for each academic year and decide whether Grade appears on results and report cards.">
      <Btn variant="solid" onClick={save} disabled={!loaded || !selectedYear}><Save className="h-4 w-4" /> Save configuration</Btn>
    </PageHead>

    <Panel className="mb-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field label="Academic year" className="min-w-[220px]">
          <Select value={yearId} onChange={(e) => setYear(e.target.value)}>
            {db.years.slice().sort((a,b) => b.start.localeCompare(a.start)).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-3 rounded-xl border border-mist bg-paper px-3 py-2">
          <div><p className="text-[12px] font-bold text-ink">Show Grade in results</p><p className="text-[11px] text-soft">Hide it when this school year uses percentage-only results.</p></div>
          <button type="button" onClick={() => toggleVisibility(!(selectedYear?.showGrade !== false))} className={`relative h-6 w-11 rounded-full transition ${selectedYear?.showGrade !== false ? "bg-pine-600" : "bg-mist"}`} aria-label="Toggle Grade column">
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${selectedYear?.showGrade !== false ? "left-6" : "left-1"}`} />
          </button>
        </div>
      </div>
    </Panel>

    <Panel className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-mist px-4 py-3">
        <div><p className="font-display text-[15px] font-bold text-ink">Percentage → Grade bands</p><p className="text-[11px] text-soft">Ranges are inclusive. Overlapping ranges are blocked by the database.</p></div>
        <Btn size="sm" variant="soft" onClick={add}><Plus className="h-3.5 w-3.5" /> Add grade</Btn>
      </div>
      {!loaded ? <div className="p-6"><SkeletonPanel rows={5} /></div> : rows.length === 0 ? <EmptyState icon={<Settings2 className="h-5 w-5" />} title="No grade bands configured" body="Add your first percentage range for this academic year." action={<Btn onClick={add}><Plus className="h-4 w-4" /> Add grade</Btn>} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-mist bg-paper/60"><tr><th className={thCls()}>Min %</th><th className={thCls()}>Max %</th><th className={thCls()}>Grade</th><th className={thCls()}>Remark</th><th className={thCls()}></th></tr></thead>
            <tbody>{rows.map((g) => <tr key={g.id} className="border-b border-mist/70 last:border-0">
              <td className={tdCls()}><TextInput type="number" min="0" max="100" step="0.01" value={g.min} onChange={(e) => updateRow(g.id, { min: Number(e.target.value) })} /></td>
              <td className={tdCls()}><TextInput type="number" min="0" max="100" step="0.01" value={g.max} onChange={(e) => updateRow(g.id, { max: Number(e.target.value) })} /></td>
              <td className={tdCls()}><TextInput value={g.grade} onChange={(e) => updateRow(g.id, { grade: e.target.value })} placeholder="A+" /></td>
              <td className={tdCls()}><TextInput value={g.remark} onChange={(e) => updateRow(g.id, { remark: e.target.value })} placeholder="Outstanding" /></td>
              <td className={tdCls()}><button onClick={() => remove(g.id)} className="cursor-pointer rounded-lg p-2 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-4 w-4" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end border-t border-mist px-4 py-3"><Btn variant="solid" onClick={save} disabled={!loaded || !selectedYear}><Save className="h-4 w-4" /> Save configuration</Btn></div>
    </Panel>
  </div>;
}

export function AcademicYearsPage() {
  const { db, currentUser, update, toast, setYear } = useApp();
  useLazyGroups(["academics", "homework"]);
  const canManage = hasPermission(db, currentUser, "academics.manage_years");
  const [editYear, setEditYear] = useState<AcademicYear | "new" | null>(null);
  const [editTerm, setEditTerm] = useState<{ yearId: string; term: Term | "new" } | null>(null);
  const [confirmDeleteYear, setConfirmDeleteYear] = useState<AcademicYear | null>(null);
  const [confirmDeleteTerm, setConfirmDeleteTerm] = useState<Term | null>(null);

  if (!canManage) {
    return <AccessDenied required="academics.manage_years" reason="Only Admins and the Super Admin can manage academic years & terms by default. Ask them to grant it to your role in Roles & permissions if you need it." />;
  }

  const yearInUse = (y: AcademicYear) =>
    db.students.some((s) => s.enrollment?.yearId === y.id) || db.structures.some((st) => st.yearId === y.id) || db.homework.some((h) => h.yearId === y.id);
  const termInUse = (t: Term) => db.structures.some((st) => st.yearId === t.yearId && st.period.trim().toLowerCase() === t.name.trim().toLowerCase());

  const setActiveYear = async (y: AcademicYear) => {
    const errors = await update((d) => {
      d.years.forEach((x) => { x.active = x.id === y.id; });
      pushAudit(d, currentUser, "year.activate", y.name, "Set as the active academic year");
    });
    if (errors.length) {
      toast(errors[0], "warn");
      return;
    }
    // Selecting a year and making it active are separate concepts, but after
    // activation the admin should immediately be looking at that same year.
    setYear(y.id);
    toast(`${y.name} is now the active academic year.`);
  };

  const removeYear = (y: AcademicYear) => {
    if (y.active) { toast("Set a different year as active before deleting this one.", "warn"); return; }
    if (yearInUse(y)) { toast("This year has enrollment, assessment structures or homework tied to it — remove those first.", "warn"); return; }
    update((d) => {
      d.years = d.years.filter((x) => x.id !== y.id);
      d.terms = d.terms.filter((t) => t.yearId !== y.id);
      pushAudit(d, currentUser, "year.delete", y.name);
    });
    toast("Academic year deleted.");
    setConfirmDeleteYear(null);
  };

  const removeTerm = (t: Term) => {
    if (termInUse(t)) { toast("This term has assessment structures using it — remove those first.", "warn"); return; }
    update((d) => { d.terms = d.terms.filter((x) => x.id !== t.id); pushAudit(d, currentUser, "term.delete", t.name); });
    toast("Term deleted.");
    setConfirmDeleteTerm(null);
  };

  const years = [...db.years].sort((a, b) => b.start.localeCompare(a.start));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHead kicker="Academics" title="Academic years & terms" sub="The academic calendar everything else — enrollment, assessment periods, homework — is dated against.">
        <Btn variant="gold" onClick={() => setEditYear("new")}><Plus className="h-4 w-4" /> New academic year</Btn>
      </PageHead>

      {years.length === 0 ? (
        <Panel className="anim-rise"><EmptyState icon={<CalendarRange className="h-5 w-5" />} title="No academic years yet" body="Create one to start enrolling students and scheduling terms." /></Panel>
      ) : (
        <div className="space-y-4">
          {years.map((y) => {
            const terms = db.terms.filter((t) => t.yearId === y.id).sort((a, b) => a.seq - b.seq);
            return (
              <Panel key={y.id} className="anim-rise p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-display text-[16px] font-bold text-ink">
                      {y.name}
                      {y.active && <Chip tone="pine"><CheckCircle2 className="h-3 w-3" /> Active</Chip>}
                    </p>
                    <p className="text-[11.5px] text-soft">{fmtDate(y.start)} — {fmtDate(y.end)}</p>
                  </div>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {!y.active && <Btn size="sm" variant="ghost" onClick={() => setActiveYear(y)}><CheckCircle2 className="h-3.5 w-3.5" /> Set active</Btn>}
                    <button onClick={() => setEditYear(y)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-pine-100 hover:text-pine-700"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDeleteYear(y)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>

                <div className="mt-3 border-t border-mist pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-soft">Terms / semesters</p>
                    <button onClick={() => setEditTerm({ yearId: y.id, term: "new" })} className="flex cursor-pointer items-center gap-1 text-[11.5px] font-semibold text-pine-700 hover:text-pine-800">
                      <Plus className="h-3.5 w-3.5" /> Add term
                    </button>
                  </div>
                  {terms.length === 0 ? (
                    <p className="text-[12px] text-soft">No terms defined for this year yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {terms.map((t) => (
                        <span key={t.id} className="flex items-center gap-1.5 rounded-lg border border-mist bg-card py-1 pl-2.5 pr-1.5 text-[12px] font-semibold text-ink">
                          {t.name}
                          <button onClick={() => setEditTerm({ yearId: y.id, term: t })} className="cursor-pointer rounded p-0.5 text-soft hover:bg-pine-100 hover:text-pine-700"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => setConfirmDeleteTerm(t)} className="cursor-pointer rounded p-0.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {editYear && <YearModal existing={editYear === "new" ? null : editYear} onClose={() => setEditYear(null)} />}
      {editTerm && <TermModal yearId={editTerm.yearId} existing={editTerm.term === "new" ? null : editTerm.term} onClose={() => setEditTerm(null)} />}

      {confirmDeleteYear && (
        <Modal title="Delete academic year?" kicker={confirmDeleteYear.name} onClose={() => setConfirmDeleteYear(null)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmDeleteYear(null)}>Cancel</Btn><Btn variant="danger" onClick={() => removeYear(confirmDeleteYear)}><Trash2 className="h-4 w-4" /> Delete</Btn></>}>
          <p className="text-[13px] text-soft">This also removes its terms. This can't be undone.</p>
        </Modal>
      )}
      {confirmDeleteTerm && (
        <Modal title="Delete term?" kicker={confirmDeleteTerm.name} onClose={() => setConfirmDeleteTerm(null)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmDeleteTerm(null)}>Cancel</Btn><Btn variant="danger" onClick={() => removeTerm(confirmDeleteTerm)}><Trash2 className="h-4 w-4" /> Delete</Btn></>}>
          <p className="text-[13px] text-soft">This can't be undone.</p>
        </Modal>
      )}
    </div>
  );
}

function YearModal({ existing, onClose }: { existing: AcademicYear | null; onClose: () => void }) {
  const { toast, db, currentUser, update } = useApp();
  const [name, setName] = useState(existing?.name ?? "");
  const [start, setStart] = useState(existing?.start ?? todayISO());
  const [end, setEnd] = useState(existing?.end ?? todayISO());
  const [makeActive, setMakeActive] = useState(existing?.active ?? db.years.length === 0);

  const save = async () => {
    if (!name.trim()) { toast("Give the academic year a name, e.g. 2027/28.", "warn"); return; }
    if (!start || !end || end <= start) { toast("End date must be after the start date.", "warn"); return; }
    const errors = await update((d) => {
      if (makeActive) d.years.forEach((y) => { y.active = false; });
      if (existing) {
        const y = d.years.find((x) => x.id === existing.id)!;
        y.name = name.trim(); y.start = start; y.end = end; y.active = makeActive || y.active;
        pushAudit(d, currentUser, "year.update", name.trim());
      } else {
        d.years.push({ id: uid(), name: name.trim(), start, end, active: makeActive, showGrade: true });
        pushAudit(d, currentUser, "year.create", name.trim());
      }
    });
    if (errors.length) { toast(describeSyncErrors(errors), "warn"); return; }
    toast(existing ? "Academic year updated." : "Academic year created.");
    onClose();
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : "New academic year"} kicker="Academic calendar" onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}><Save className="h-4 w-4" /> Save</Btn></>}>
      <div className="space-y-3">
        <Field label="Name" required><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2027/28" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start date" required><TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End date" required><TextInput type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-ink">
          <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} className="h-4 w-4 rounded border-mist" />
          Make this the active academic year
        </label>
        {makeActive && <p className="text-[11.5px] text-soft">This deactivates whichever year is currently active.</p>}
      </div>
    </Modal>
  );
}

function TermModal({ yearId, existing, onClose }: { yearId: string; existing: Term | null; onClose: () => void }) {
  const { toast, db, currentUser, update } = useApp();
  const [name, setName] = useState(existing?.name ?? "");
  const [seq, setSeq] = useState(existing?.seq ?? (db.terms.filter((t) => t.yearId === yearId).length + 1));

  const save = async () => {
    if (!name.trim()) { toast("Give the term a name, e.g. Semester 1.", "warn"); return; }
    const dup = db.terms.some((t) => t.yearId === yearId && t.id !== existing?.id && t.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (dup) { toast("This year already has a term with that name.", "warn"); return; }
    const errors = await update((d) => {
      if (existing) {
        const t = d.terms.find((x) => x.id === existing.id)!;
        t.name = name.trim(); t.seq = seq;
        pushAudit(d, currentUser, "term.update", name.trim());
      } else {
        d.terms.push({ id: uid(), yearId, name: name.trim(), seq });
        pushAudit(d, currentUser, "term.create", name.trim());
      }
    });
    if (errors.length) { toast(describeSyncErrors(errors), "warn"); return; }
    toast(existing ? "Term updated." : "Term added.");
    onClose();
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : "Add term"} kicker={getYear(db, yearId)?.name ?? ""} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}><Save className="h-4 w-4" /> Save</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
        <Field label="Name" required><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Semester 1" /></Field>
        <Field label="Order" hint="display order"><TextInput type="number" min={1} value={seq} onChange={(e) => setSeq(Number(e.target.value) || 1)} /></Field>
      </div>
    </Modal>
  );
}

/* ================= classes & subjects ================= */
export function ClassesPage({ scoped }: { scoped?: boolean } = {}) {
  const { db, currentUser, update, toast } = useApp();
  useLazyGroups(["academics", "timetable"]);
  const role = currentUser?.role ?? "admin";
  const canManage = !scoped && hasPermission(db, currentUser, "academics.manage");
  const [tab, setTab] = useState<"classes" | "subjects">("classes");
  const [editClass, setEditClass] = useState<SchoolClass | "new" | null>(null);
  const [editSubject, setEditSubject] = useState<Subject | "new" | null>(null);
  const [confirmDeleteClass, setConfirmDeleteClass] = useState<SchoolClass | null>(null);
  const [confirmDeleteSubject, setConfirmDeleteSubject] = useState<Subject | null>(null);

  /* -------- scoped (read-only) view for teacher / student / guardian -------- */
  if (scoped) {
    let pairs: { classId: string; sectionId: string; subjectIds: string[] }[] = [];
    if (role === "teacher") pairs = teacherPairs(db, currentUser);
    else if (role === "student") {
      const s = studentOf(db, currentUser);
      if (s?.enrollment) pairs = [{ classId: s.enrollment.classId, sectionId: s.enrollment.sectionId, subjectIds: db.assignments.filter((a) => a.classId === s.enrollment!.classId && a.sectionId === s.enrollment!.sectionId).map((a) => a.subjectId) }];
    } else if (role === "guardian") {
      pairs = childrenOf(db, currentUser).filter((c) => c.enrollment).map((c) => ({
        classId: c.enrollment!.classId, sectionId: c.enrollment!.sectionId,
        subjectIds: db.assignments.filter((a) => a.classId === c.enrollment!.classId && a.sectionId === c.enrollment!.sectionId).map((a) => a.subjectId),
      }));
    }

    return (
      <div className="mx-auto max-w-5xl">
        <PageHead kicker="Academics" title="My classes" sub="Subjects and the teacher for each, in your current placement." />
        {pairs.length === 0 ? (
          <Panel className="anim-rise"><EmptyState icon={<Layers className="h-5 w-5" />} title="No classes yet" body="Once enrollment or an assignment is set up, it will appear here." /></Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pairs.map((p, idx) => (
              <Panel key={idx} className="anim-rise p-4">
                <p className="font-display text-[15px] font-bold text-ink">{sectionLabel(db, p.classId, p.sectionId)}</p>
                <div className="mt-3 space-y-1.5">
                  {[...new Set(p.subjectIds)].map((sid) => {
                    const subj = getSubject(db, sid);
                    const t = teacherFor(db, db.years.find((y) => y.active)?.id ?? "", p.classId, p.sectionId, sid);
                    return (
                      <div key={sid} className="flex items-center justify-between rounded-md bg-paper px-2.5 py-1.5">
                        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                          <span className="h-2 w-2 rounded-full" style={{ background: subj?.color }} /> {subj?.name}
                        </span>
                        <span className="text-[11.5px] text-soft">{t?.name ?? "Unassigned"}</span>
                      </div>
                    );
                  })}
                  {p.subjectIds.length === 0 && <p className="text-[12px] text-soft">No subjects assigned yet.</p>}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* -------- admin: manage -------- */
  if (!hasPermission(db, currentUser, "academics.view")) {
    return <AccessDenied required="academics.view" reason="You don't have permission to view academic structure." />;
  }

  const classInUse = (c: SchoolClass) => db.students.some((s) => s.enrollment?.classId === c.id) || db.assignments.some((a) => a.classId === c.id) || db.timetable.some((t) => t.classId === c.id);
  const subjectInUse = (s: Subject) => db.assignments.some((a) => a.subjectId === s.id) || db.structures.some((st) => st.subjectId === s.id) || db.timetable.some((t) => t.subjectId === s.id);

  const removeClass = (c: SchoolClass) => {
    if (classInUse(c)) { toast("This class has students, assignments or timetable entries — remove those first.", "warn"); return; }
    update((d) => { d.classes = d.classes.filter((x) => x.id !== c.id); pushAudit(d, currentUser, "class.delete", c.name); });
    toast("Class deleted.");
    setConfirmDeleteClass(null);
  };
  const removeSubject = (s: Subject) => {
    if (subjectInUse(s)) { toast("This subject is used in assignments, structures or the timetable — remove those first.", "warn"); return; }
    update((d) => { d.subjects = d.subjects.filter((x) => x.id !== s.id); pushAudit(d, currentUser, "subject.delete", s.name); });
    toast("Subject deleted.");
    setConfirmDeleteSubject(null);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="Academics" title="Classes & sections" sub="The structure everything else (timetable, assignments, enrollment) is built on.">
        {canManage && tab === "classes" && <Btn variant="gold" onClick={() => setEditClass("new")}><Plus className="h-4 w-4" /> New class</Btn>}
        {canManage && tab === "subjects" && <Btn variant="gold" onClick={() => setEditSubject("new")}><Plus className="h-4 w-4" /> New subject</Btn>}
      </PageHead>

      <div className="mb-4"><Tabs tabs={[{ id: "classes", label: "Classes & sections", icon: <Layers className="h-3.5 w-3.5" /> }, { id: "subjects", label: "Subjects", icon: <BookOpen className="h-3.5 w-3.5" /> }]} active={tab} onChange={(id) => setTab(id as any)} /></div>

      {tab === "classes" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {db.classes.map((c) => (
            <Panel key={c.id} className="anim-rise p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-[16px] font-bold text-ink">{c.name}</p>
                  <p className="text-[11px] text-soft">Level {c.level} · {c.sections.length} section{c.sections.length !== 1 ? "s" : ""}</p>
                </div>
                {canManage && (
                  <span className="flex gap-1">
                    <button onClick={() => setEditClass(c)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-pine-100 hover:text-pine-700"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDeleteClass(c)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.sections.map((s) => (
                  <Chip key={s.id} tone="pine">Section {s.name} · {studentsOf(db, c.id, s.id).length} students</Chip>
                ))}
                {c.sections.length === 0 && <p className="text-[12px] text-soft">No sections yet.</p>}
              </div>
            </Panel>
          ))}
          {db.classes.length === 0 && <Panel className="anim-rise sm:col-span-2"><EmptyState icon={<Layers className="h-5 w-5" />} title="No classes yet" body="Create the first class to start building the academic structure." action={canManage ? <Btn onClick={() => setEditClass("new")}><Plus className="h-4 w-4" /> New class</Btn> : undefined} /></Panel>}
        </div>
      )}

      {tab === "subjects" && (
        <Panel className="anim-rise overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-mist bg-paper/60">
              <tr><th className={thCls()}>Subject</th><th className={thCls()}>Code</th><th className={thCls()}>In use</th><th className={thCls()}></th></tr>
            </thead>
            <tbody className="divide-y divide-mist/70">
              {db.subjects.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-pine-50/50">
                  <td className={tdCls()}><span className="flex items-center gap-2 font-bold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name}</span></td>
                  <td className={tdCls()}><Chip tone="gray">{s.code}</Chip></td>
                  <td className={tdCls()}>{subjectInUse(s) ? <Chip tone="pine">Yes</Chip> : <Chip tone="gray">No</Chip>}</td>
                  <td className={`${tdCls()} text-right`}>
                    {canManage && (
                      <span className="inline-flex gap-1">
                        <button onClick={() => setEditSubject(s)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-pine-100 hover:text-pine-700"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setConfirmDeleteSubject(s)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {db.subjects.length === 0 && <tr><td colSpan={4}><EmptyState icon={<BookOpen className="h-5 w-5" />} title="No subjects yet" body="Add the subjects your school teaches." /></td></tr>}
            </tbody>
          </table>
        </Panel>
      )}

      {editClass && <ClassModal existing={editClass === "new" ? undefined : editClass} onClose={() => setEditClass(null)} />}
      {editSubject && <SubjectModal existing={editSubject === "new" ? undefined : editSubject} onClose={() => setEditSubject(null)} />}

      {confirmDeleteClass && (
        <Modal title={`Delete ${confirmDeleteClass.name}?`} onClose={() => setConfirmDeleteClass(null)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmDeleteClass(null)}>Cancel</Btn><Btn variant="danger" onClick={() => removeClass(confirmDeleteClass)}><Trash2 className="h-4 w-4" /> Delete</Btn></>}>
          <p className="text-[13px] text-ink">This can't be undone. It only succeeds if no students, assignments or timetable entries reference this class.</p>
        </Modal>
      )}
      {confirmDeleteSubject && (
        <Modal title={`Delete ${confirmDeleteSubject.name}?`} onClose={() => setConfirmDeleteSubject(null)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmDeleteSubject(null)}>Cancel</Btn><Btn variant="danger" onClick={() => removeSubject(confirmDeleteSubject)}><Trash2 className="h-4 w-4" /> Delete</Btn></>}>
          <p className="text-[13px] text-ink">This can't be undone. It only succeeds if no assignments, structures or timetable entries reference this subject.</p>
        </Modal>
      )}
    </div>
  );
}

function ClassModal({ existing, onClose }: { existing?: SchoolClass; onClose: () => void }) {
  const { update, toast, currentUser } = useApp();
  const [name, setName] = useState(existing?.name ?? "");
  const [level, setLevel] = useState(existing?.level ?? 1);
  const [sections, setSections] = useState<Section[]>(existing?.sections.map((s) => ({ ...s })) ?? [{ id: uid(), name: "A" }]);

  const addSection = () => setSections((p) => [...p, { id: uid(), name: String.fromCharCode(65 + p.length) }]);
  const removeSection = (id: string) => setSections((p) => (p.length > 1 ? p.filter((s) => s.id !== id) : p));
  const renameSection = (id: string, name: string) => setSections((p) => p.map((s) => (s.id === id ? { ...s, name } : s)));

  const save = () => {
    if (!name.trim()) { toast("Give the class a name.", "warn"); return; }
    if (sections.some((s) => !s.name.trim())) { toast("Every section needs a name.", "warn"); return; }
    update((d) => {
      if (existing) {
        const i = d.classes.findIndex((c) => c.id === existing.id);
        if (i >= 0) d.classes[i] = { ...existing, name: name.trim(), level: Number(level), sections };
        pushAudit(d, currentUser, "class.update", name.trim());
      } else {
        d.classes.push({ id: uid(), name: name.trim(), level: Number(level), sections });
        pushAudit(d, currentUser, "class.create", name.trim());
      }
    });
    toast(existing ? "Class updated." : "Class created.");
    onClose();
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : "New class"} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}><Save className="h-4 w-4" /> Save</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Class name" required><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 9" /></Field>
        <Field label="Level" required><input type="number" min={1} value={level} onChange={(e) => setLevel(Number(e.target.value) || 1)} className="w-full rounded-lg border border-mist bg-card px-3 py-2 text-[13.5px]" /></Field>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-soft">Sections</p>
          <Btn size="sm" variant="soft" onClick={addSection}><Plus className="h-3.5 w-3.5" /> Add section</Btn>
        </div>
        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <TextInput value={s.name} onChange={(e) => renameSection(s.id, e.target.value)} className="max-w-[160px]" />
              <button onClick={() => removeSection(s.id)} disabled={sections.length <= 1} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function SubjectModal({ existing, onClose }: { existing?: Subject; onClose: () => void }) {
  const { update, toast, currentUser } = useApp();
  const [name, setName] = useState(existing?.name ?? "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [color, setColor] = useState(existing?.color ?? "#2c654c");

  const save = () => {
    if (!name.trim() || !code.trim()) { toast("Name and code are both required.", "warn"); return; }
    update((d) => {
      if (existing) {
        const i = d.subjects.findIndex((s) => s.id === existing.id);
        if (i >= 0) d.subjects[i] = { ...existing, name: name.trim(), code: code.trim().toUpperCase(), color };
        pushAudit(d, currentUser, "subject.update", name.trim());
      } else {
        d.subjects.push({ id: uid(), name: name.trim(), code: code.trim().toUpperCase(), color });
        pushAudit(d, currentUser, "subject.create", name.trim());
      }
    });
    toast(existing ? "Subject updated." : "Subject created.");
    onClose();
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : "New subject"} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}><Save className="h-4 w-4" /> Save</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Subject name" required><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chemistry" /></Field>
        <Field label="Code" required><TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CHEM" /></Field>
      </div>
      <Field label="Colour" className="mt-3">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 cursor-pointer rounded border border-mist bg-card" />
      </Field>
    </Modal>
  );
}

/* =========================================================================
   TIMETABLE (admin builder)
   ========================================================================= */
export function TimetablePage() {
  const { db, currentUser, update, toast } = useApp();
  const groupsLoaded = useLazyGroups("timetable");
  if (!hasPermission(db, currentUser, "academics.view")) {
    return <AccessDenied required="academics.view" reason="You don't have permission to view the timetable." />;
  }
  const canManage = hasPermission(db, currentUser, "academics.manage");
  const defaultClassSection = (() => {
    if (currentUser?.role === "student") {
      const s = studentOf(db, currentUser);
      if (s?.enrollment) return { classId: s.enrollment.classId, sectionId: s.enrollment.sectionId };
    }
    if (currentUser?.role === "guardian") {
      const c = childrenOf(db, currentUser)[0];
      if (c?.enrollment) return { classId: c.enrollment.classId, sectionId: c.enrollment.sectionId };
    }
    if (currentUser?.role === "teacher") {
      const p = teacherPairs(db, currentUser)[0];
      if (p) return { classId: p.classId, sectionId: p.sectionId };
    }
    return { classId: db.classes[0]?.id ?? "", sectionId: "" };
  })();
  const [classId, setClassId] = useState(defaultClassSection.classId);
  const cls = getClass(db, classId);
  const [sectionId, setSectionId] = useState(defaultClassSection.sectionId || cls?.sections[0]?.id || "");
  useEffect(() => {
    const c = getClass(db, classId);
    if (c && !c.sections.some((s) => s.id === sectionId)) setSectionId(c.sections[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);
  const [editCell, setEditCell] = useState<{ day: number; period: number } | null>(null);
  const [editDays, setEditDays] = useState(false);
  const [editPeriods, setEditPeriods] = useState(false);

  const activeDays = [...(db.settings.workingDays?.length ? db.settings.workingDays : [0, 1, 2, 3, 4])].sort((a, b) => a - b);
  const activePeriods = [...(db.settings.periods?.length ? db.settings.periods : DEFAULT_PERIODS)].sort((a, b) => a.period - b.period);

  const entryFor = (day: number, period: number) => db.timetable.find((t) => t.classId === classId && t.sectionId === sectionId && t.day === day && t.period === period);

  const availableSubjects = [...new Set(db.assignments.filter((a) => a.classId === classId && a.sectionId === sectionId).map((a) => a.subjectId))];

  const activePeriodNums = new Set(activePeriods.map((p) => p.period));
  const removedDays = db.timetable.filter((t) => t.classId === classId && t.sectionId === sectionId && !activeDays.includes(t.day));
  const removedPeriods = db.timetable.filter((t) => t.classId === classId && t.sectionId === sectionId && !activePeriodNums.has(t.period));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead kicker="Academics" title="Timetable" sub={`One grid per class & section — ${activeDays.map((d) => WEEKDAYS[d]).join(", ")}, ${activePeriods.length} periods a day.`}>
        <Field label="Class" className="w-36"><Select value={classId} onChange={(e) => setClassId(e.target.value)}>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Section" className="w-28"><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>{cls?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        {canManage && <Btn variant="soft" onClick={() => setEditDays(true)}><CalendarRange className="h-4 w-4" /> Working days</Btn>}
        {canManage && <Btn variant="soft" onClick={() => setEditPeriods(true)}><ClockIcon className="h-4 w-4" /> Periods</Btn>}
      </PageHead>

      {availableSubjects.length === 0 && canManage && (
        <p className="anim-rise mb-3 rounded-lg border border-gold-200 bg-gold-100/60 px-3 py-2 text-[12px] font-semibold text-gold-700">No teacher–subject assignments exist for this class/section yet — set those up first so periods can be assigned.</p>
      )}
      {removedDays.length > 0 && canManage && (
        <p className="anim-rise mb-3 rounded-lg border border-gold-200 bg-gold-100/60 px-3 py-2 text-[12px] font-semibold text-gold-700">
          {removedDays.length} period{removedDays.length > 1 ? "s are" : " is"} scheduled on a day that's no longer a working day ({[...new Set(removedDays.map((t) => WEEKDAYS[t.day]))].join(", ")}) — they're kept, just hidden below. Re-add that day to see them again.
        </p>
      )}
      {removedPeriods.length > 0 && canManage && (
        <p className="anim-rise mb-3 rounded-lg border border-gold-200 bg-gold-100/60 px-3 py-2 text-[12px] font-semibold text-gold-700">
          {removedPeriods.length} lesson{removedPeriods.length > 1 ? "s are" : " is"} scheduled in a period that no longer exists (P{[...new Set(removedPeriods.map((t) => t.period))].sort((a, b) => a - b).join(", P")}) — kept, just hidden below. Add that period back to see them again.
        </p>
      )}

      {!groupsLoaded ? (
        <SkeletonPanel rows={activePeriods.length} />
      ) : (
      <Panel className="anim-rise overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-mist bg-paper/60">
            <tr>
              <th className={`${thCls()} w-24`}>Period</th>
              {activeDays.map((day) => <th key={day} className={thCls()}>{WEEKDAYS[day]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist/70">
            {activePeriods.map(({ period: p, time }) => (
              <tr key={p}>
                <td className={`${tdCls()} font-mono text-[12px] font-bold text-soft`}>P{p}<span className="block font-normal text-soft/70">{time}</span></td>
                {activeDays.map((day) => {
                  const e = entryFor(day, p);
                  const subj = e ? getSubject(db, e.subjectId) : null;
                  const teacher = e ? teacherFor(db, db.years.find((y) => y.active)?.id ?? "", classId, sectionId, e.subjectId) : null;
                  return (
                    <td key={day} className={tdCls()}>
                      <button
                        disabled={!canManage}
                        onClick={() => setEditCell({ day, period: p })}
                        className={`w-full cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-all ${e ? "border-pine-200 bg-pine-50 hover:border-pine-400" : "border-dashed border-mist bg-paper/50 hover:border-pine-300"} disabled:cursor-not-allowed`}
                      >
                        {subj ? (
                          <>
                            <span className="flex items-center gap-1.5 text-[12px] font-bold text-ink"><span className="h-1.5 w-1.5 rounded-full" style={{ background: subj.color }} /> {subj.name}</span>
                            <span className="block text-[10.5px] text-soft">{teacher?.name ?? "Unassigned"} · {e!.room}</span>
                          </>
                        ) : (
                          <span className="text-[11.5px] text-soft/60">{canManage ? "+ Assign" : "Free period"}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      )}

      {editDays && (
        <WorkingDaysModal
          selected={activeDays}
          onClose={() => setEditDays(false)}
          onSave={(days) => {
            update((d) => { d.settings.workingDays = days; });
            toast("Working days updated.");
            setEditDays(false);
          }}
        />
      )}

      {editPeriods && (
        <PeriodsModal
          selected={activePeriods}
          onClose={() => setEditPeriods(false)}
          onSave={(periods) => {
            update((d) => { d.settings.periods = periods; });
            toast("Periods updated.");
            setEditPeriods(false);
          }}
        />
      )}

      {editCell && (
        <TimetableCellModal
          day={editCell.day} period={editCell.period} classId={classId} sectionId={sectionId}
          existing={entryFor(editCell.day, editCell.period)}
          availableSubjects={availableSubjects}
          onClose={() => setEditCell(null)}
        />
      )}
    </div>
  );
}

function WorkingDaysModal({ selected, onClose, onSave }: { selected: number[]; onClose: () => void; onSave: (days: number[]) => void }) {
  const [days, setDays] = useState<number[]>(selected);
  const toggle = (d: number) => setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  const save = () => {
    if (!days.length) return;
    onSave([...days].sort((a, b) => a - b));
  };
  return (
    <Modal title="Working days" kicker="Timetable" onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={!days.length}><Save className="h-4 w-4" /> Save</Btn></>}>
      <p className="mb-3 text-[12.5px] text-soft">Choose which days the timetable covers. A day you remove isn't deleted — any periods already scheduled on it stay in place, just hidden, until you add that day back.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WEEKDAYS.map((name, d) => (
          <label key={d} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${days.includes(d) ? "border-pine-400 bg-pine-50 text-pine-800" : "border-mist text-soft hover:border-pine-300"}`}>
            <input type="checkbox" checked={days.includes(d)} onChange={() => toggle(d)} className="accent-pine-600" />
            {name}
          </label>
        ))}
      </div>
      {!days.length && <p className="mt-2 text-[11.5px] font-semibold text-rust-600">Pick at least one day.</p>}
    </Modal>
  );
}

function PeriodsModal({ selected, onClose, onSave }: { selected: { period: number; time: string }[]; onClose: () => void; onSave: (periods: { period: number; time: string }[]) => void }) {
  const [rows, setRows] = useState(selected.map((p) => ({ ...p })));
  const setTime = (i: number, time: string) => setRows((cur) => cur.map((r, idx) => idx === i ? { ...r, time } : r));
  const removeRow = (i: number) => setRows((cur) => cur.filter((_, idx) => idx !== i));
  const addRow = () => setRows((cur) => [...cur, { period: (cur.at(-1)?.period ?? 0) + 1, time: "" }]);
  const save = () => {
    if (!rows.length || rows.some((r) => !r.time.trim())) return;
    // Renumber 1..N in the order shown, rather than trusting stale numbers
    // after rows have been added/removed — a period's number is just its
    // position, same as before, only the count is no longer fixed.
    onSave(rows.map((r, i) => ({ period: i + 1, time: r.time.trim() })));
  };
  return (
    <Modal title="Periods" kicker="Timetable" onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={!rows.length || rows.some((r) => !r.time.trim())}><Save className="h-4 w-4" /> Save</Btn></>}>
      <p className="mb-3 text-[12.5px] text-soft">Add or remove periods, and set each one's start time. A period you remove isn't deleted — any lessons already scheduled in it stay in place, just hidden, until you add it back.</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-10 shrink-0 font-mono text-[12px] font-bold text-soft">P{i + 1}</span>
            <TextInput type="time" value={r.time} onChange={(e) => setTime(i, e.target.value)} className="flex-1" />
            <Btn size="sm" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="h-3.5 w-3.5" /></Btn>
          </div>
        ))}
      </div>
      <Btn size="sm" variant="soft" className="mt-3" onClick={addRow}><Plus className="h-3.5 w-3.5" /> Add period</Btn>
      {(!rows.length || rows.some((r) => !r.time.trim())) && <p className="mt-2 text-[11.5px] font-semibold text-rust-600">Every period needs a start time.</p>}
    </Modal>
  );
}

function TimetableCellModal({ day, period, classId, sectionId, existing, availableSubjects, onClose }: {
  day: number; period: number; classId: string; sectionId: string; existing?: TimetableEntry; availableSubjects: string[]; onClose: () => void;
}) {
  const { db, update, toast, currentUser } = useApp();
  const [subjectId, setSubjectId] = useState(existing?.subjectId ?? availableSubjects[0] ?? "");
  const [room, setRoom] = useState(existing?.room ?? "");
  const [confirmConflict, setConfirmConflict] = useState(false);
  const yearId = db.years.find((y) => y.active)?.id ?? "";

  const teacher = subjectId ? teacherFor(db, yearId, classId, sectionId, subjectId) : undefined;
  // Same teacher, same day & period, some OTHER class/section — a double
  // booking. Looked up by resolving each other slot's own teacher the same
  // way (timetable entries don't store a teacher id directly, only a
  // subject — the teacher comes from that class/section/subject's
  // assignment), not by anything TimetableCellModal already had cached.
  const conflicts = teacher
    ? db.timetable.filter((t) => {
        if (t.day !== day || t.period !== period) return false;
        if (t.classId === classId && t.sectionId === sectionId) return false;
        return teacherFor(db, yearId, t.classId, t.sectionId, t.subjectId)?.id === teacher.id;
      })
    : [];

  const doSave = () => {
    update((d) => {
      const i = d.timetable.findIndex((t) => t.classId === classId && t.sectionId === sectionId && t.day === day && t.period === period);
      if (i >= 0) d.timetable[i] = { ...d.timetable[i], subjectId, room: room.trim() };
      else d.timetable.push({ id: uid(), classId, sectionId, day, period, subjectId, room: room.trim() });
      pushAudit(d, currentUser, "timetable.update", `${WEEKDAYS[day]} P${period} · ${getClass(db, classId)?.name}`);
    });
    toast("Timetable updated.");
    onClose();
  };

  const save = () => {
    if (!subjectId) { toast("Choose a subject.", "warn"); return; }
    if (conflicts.length && !confirmConflict) { setConfirmConflict(true); return; }
    doSave();
  };
  const clear = () => {
    update((d) => { d.timetable = d.timetable.filter((t) => !(t.classId === classId && t.sectionId === sectionId && t.day === day && t.period === period)); });
    toast("Period cleared.");
    onClose();
  };

  return (
    <Modal title={`${WEEKDAYS[day]} · Period ${period}`} kicker={sectionLabel(db, classId, sectionId)} onClose={onClose}
      footer={<>
        {existing && <Btn variant="dangerSoft" onClick={clear}><Trash2 className="h-4 w-4" /> Clear</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}><Save className="h-4 w-4" /> Save</Btn>
      </>}>
      <Field label="Subject" required>
        <Select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setConfirmConflict(false); }}>
          {availableSubjects.length === 0 && <option value="">No assignments for this class/section</option>}
          {availableSubjects.map((sid) => <option key={sid} value={sid}>{getSubject(db, sid)?.name}</option>)}
        </Select>
      </Field>
      <Field label="Room" className="mt-3"><TextInput value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. R-201" /></Field>

      {conflicts.length > 0 && (
        <div className="anim-rise mt-3 flex gap-2.5 rounded-xl border border-rust-200 bg-rust-50 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rust-600" />
          <div className="min-w-0 text-[12.5px] leading-relaxed text-rust-800">
            <p className="font-bold">{teacher!.name} is already teaching this period</p>
            <ul className="mt-1 space-y-0.5">
              {conflicts.map((t) => (
                <li key={t.id}>{sectionLabel(db, t.classId, t.sectionId)} · {getSubject(db, t.subjectId)?.name}{t.room ? ` · ${t.room}` : ""}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-rust-700/80">Pick a different subject, or Save again to assign them here too.</p>
          </div>
        </div>
      )}

      {confirmConflict && (
        <Modal title="Double-book this teacher?" kicker={teacher?.name} onClose={() => setConfirmConflict(false)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmConflict(false)}>Go back</Btn><Btn variant="danger" onClick={doSave}><Save className="h-4 w-4" /> Assign anyway</Btn></>}>
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rust-100"><AlertTriangle className="h-5 w-5 text-rust-600" /></div>
            <div className="text-[13px] leading-relaxed text-ink">
              <p><strong>{teacher?.name}</strong> is already scheduled for {WEEKDAYS[day]} · Period {period}, at:</p>
              <ul className="mt-2 space-y-1 rounded-lg border border-mist bg-paper/60 px-3 py-2">
                {conflicts.map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <span className="font-semibold">{sectionLabel(db, t.classId, t.sectionId)}</span>
                    <span className="text-soft">{getSubject(db, t.subjectId)?.name}{t.room ? ` · ${t.room}` : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-soft">Assigning them here too means they'd need to be in two places at once. Go back to pick a different subject, or assign anyway if this is intentional (e.g. a co-taught or combined class).</p>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/* =========================================================================
   ATTENDANCE
   Teacher/admin: mark a daily register. Student/guardian: view stats & history.
   ========================================================================= */
export function AttendancePage() {
  const { db, currentUser, yearId, toast } = useApp();
  const role = currentUser?.role ?? "admin";

  if (role === "student" || role === "guardian") {
    return <AttendanceViewer />;
  }

  if (!hasPermission(db, currentUser, "attendance.view")) {
    return <AccessDenied required="attendance.view" reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }

  const canManage = hasPermission(db, currentUser, "attendance.manage");
  const isAdmin = role === "admin";
  const pairs = teacherPairs(db, currentUser);
  const classIds = isAdmin ? db.classes.map((c) => c.id) : [...new Set(pairs.map((p) => p.classId))];

  const [classId, setClassId] = useState(classIds[0] ?? "");
  const cls = getClass(db, classId);
  const sectionOptionsForClass = isAdmin
    ? (cls?.sections ?? [])
    : (cls?.sections ?? []).filter((s) => pairs.some((p) => p.classId === classId && p.sectionId === s.id));
  const [sectionId, setSectionId] = useState(sectionOptionsForClass[0]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [savingAll, setSavingAll] = useState(false);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});

  useEffect(() => {
    const opts = isAdmin
      ? (getClass(db, classId)?.sections ?? [])
      : (getClass(db, classId)?.sections ?? []).filter((s) => pairs.some((p) => p.classId === classId && p.sectionId === s.id));
    if (!opts.some((s) => s.id === sectionId)) setSectionId(opts[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const registerQuery = useRegister(classId || null, sectionId || null, date);
  const registerRows = Array.isArray((registerQuery.data as any)?.rows) ? ((registerQuery.data as any).rows as Array<{student_id:string;full_name:string;roll_number:number|null;status:string}>) : [];
  const registerMap = useMemo(() => new Map(registerRows.map((r) => [r.student_id, r.status as AttendanceStatus])), [registerRows]);

  useEffect(() => {
    const next: Record<string, AttendanceStatus> = {};
    for (const row of registerRows) if (["present","absent","late"].includes(row.status)) next[row.student_id] = row.status as AttendanceStatus;
    setMarks(next);
  }, [registerQuery.dataUpdatedAt, classId, sectionId, date]);

  const setMark = async (studentId: string, status: AttendanceStatus) => {
    if (!canManage || !yearId || !classId || !sectionId) return;
    const next = { ...marks, [studentId]: status };
    setMarks(next);
    try {
      await saveRegister({ yearId, classId, sectionId, day: date, marks: next });
      await registerQuery.refetch();
    } catch (e) {
      setMarks(marks);
      toast(e instanceof Error ? e.message : "Could not save attendance.", "warn");
    }
  };

  const markAllPresent = async () => {
    if (!canManage || !yearId || !classId || !sectionId) return;
    const next = { ...marks };
    registerRows.forEach((r) => { if (!next[r.student_id]) next[r.student_id] = "present"; });
    setMarks(next);
    setSavingAll(true);
    try {
      await saveRegister({ yearId, classId, sectionId, day: date, marks: next });
      await registerQuery.refetch();
      toast("Unmarked students set to present.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save attendance.", "warn");
    } finally {
      setSavingAll(false);
    }
  };

  const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
  registerRows.forEach((r) => {
    const m = marks[r.student_id] ?? registerMap.get(r.student_id);
    if (m === "present") counts.present++;
    else if (m === "absent") counts.absent++;
    else if (m === "late") counts.late++;
    else counts.unmarked++;
  });

  if (classIds.length === 0) {
    return <AccessDenied required="attendance.manage / a teaching assignment" reason="You aren't assigned to any class-section yet." />;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="Attendance" title="Daily register" sub="Mark present, absent or late for each student. Unmarked students count as not yet recorded.">
        <Field label="Class" className="w-36"><Select value={classId} onChange={(e) => setClassId(e.target.value)}>{classIds.map((id) => <option key={id} value={id}>{getClass(db, id)?.name}</option>)}</Select></Field>
        <Field label="Section" className="w-28"><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>{sectionOptionsForClass.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Date" className="w-40"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
      </PageHead>

      {registerQuery.isPending ? (
        <><div className="anim-rise mb-4"><SkeletonCards n={4} /></div><SkeletonPanel rows={8} /></>
      ) : registerQuery.isError ? (
        <Panel><EmptyState icon={<CalendarCheck2 className="h-5 w-5" />} title="Attendance could not be loaded" body="Please retry this class, section or date." action={<Btn onClick={() => void registerQuery.refetch()}>Retry</Btn>} /></Panel>
      ) : (
        <>
          <div className="anim-rise mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Present" value={counts.present} tone="pine" icon={<UserCheck className="h-4.5 w-4.5" />} />
            <Stat label="Absent" value={counts.absent} tone="rust" icon={<UserX className="h-4.5 w-4.5" />} />
            <Stat label="Late" value={counts.late} tone="gold" icon={<ClockIcon className="h-4.5 w-4.5" />} />
            <Stat label="Unmarked" value={counts.unmarked} tone="steel" icon={<CalendarCheck2 className="h-4.5 w-4.5" />} />
          </div>

          <Panel className="anim-rise overflow-hidden">
            <div className="flex items-center justify-between border-b border-mist bg-paper/60 px-4 py-3">
              <p className="whitespace-nowrap text-[12.5px] font-bold text-ink">{sectionLabel(db, classId, sectionId)} · {fmtDate(date)}</p>
              {canManage && <Btn size="sm" variant="soft" disabled={savingAll || registerRows.length === 0} onClick={() => void markAllPresent()}><CheckCircle2 className="h-3.5 w-3.5" /> {savingAll ? "Saving…" : "Mark rest present"}</Btn>}
            </div>
            <div className="attendance-table-wrap">
              <table className="attendance-table">
                <thead className="border-b border-mist bg-paper/60"><tr><th className={`${thCls()} w-12 whitespace-nowrap`}>#</th><th className={`${thCls()} min-w-[260px] whitespace-nowrap`}>Student</th><th className={`${thCls()} min-w-[260px] whitespace-nowrap text-center`}>Status</th></tr></thead>
                <tbody className="divide-y divide-mist/70">
                  {registerRows.map((s, i) => {
                    const m = marks[s.student_id] ?? registerMap.get(s.student_id);
                    return (
                      <tr key={s.student_id} className="transition-colors hover:bg-pine-50/40">
                        <td className={`${tdCls()} whitespace-nowrap tnum text-soft`}>{i + 1}</td>
                        <td className={`${tdCls()} whitespace-nowrap`}><span className="flex items-center gap-2.5 whitespace-nowrap"><UserAvatar name={s.full_name} role="student" size={30} /><span className="whitespace-nowrap font-bold text-ink">{s.full_name}</span></span></td>
                        <td className={`${tdCls()} text-center`}>
                          <span className="inline-flex min-w-max gap-1 whitespace-nowrap">
                            {(["present", "late", "absent"] as AttendanceStatus[]).map((st) => (
                              <button key={st} type="button" disabled={!canManage || registerQuery.isFetching} onClick={() => void setMark(s.student_id, st)}
                                className={`shrink-0 cursor-pointer whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-bold capitalize transition-all disabled:cursor-not-allowed ${m === st ? (st === "present" ? "border-pine-700 bg-pine-700 text-white" : st === "late" ? "border-gold-500 bg-gold-500 text-white" : "border-rust-600 bg-rust-600 text-white") : "border-mist bg-card text-soft hover:border-pine-300"}`}>
                                {st}
                              </button>
                            ))}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {registerRows.length === 0 && <tr><td colSpan={3}><EmptyState icon={<CalendarCheck2 className="h-5 w-5" />} title="No students in this section" body="Enroll students into this class/section first." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

/** Read-only attendance view for students (own record) and guardians (per child). */
function AttendanceViewer() {
  const { db, currentUser } = useApp();
  const role = currentUser?.role;
  const viewPerm = role === "guardian" ? "attendance.view_children" : "attendance.view";
  if (!hasPermission(db, currentUser, viewPerm)) {
    return <AccessDenied required={viewPerm} reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }
  const kids = role === "guardian" ? childrenOf(db, currentUser) : (studentOf(db, currentUser) ? [studentOf(db, currentUser)!] : []);
  const [selId, setSelId] = useState(kids[0]?.id ?? "");
  const student = kids.find((k) => k.id === selId) ?? kids[0];

  if (!student) return <AccessDenied required="students.view_self / students.view_children" reason="No linked student record was found." />;

  const stats = attendanceStats(db, student.id);
  const history = db.attendance
    .filter((r) => student.enrollment && r.classId === student.enrollment.classId && r.sectionId === student.enrollment.sectionId && r.marks[student.id])
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead kicker="Attendance" title={role === "guardian" ? "Attendance" : "My attendance"} sub="Present, late and absent counts across the academic year.">
        {role === "guardian" && kids.length > 1 && (
          <Field label="Child" className="w-48"><Select value={selId} onChange={(e) => setSelId(e.target.value)}>{kids.map((k) => <option key={k.id} value={k.id}>{shortName(k)}</option>)}</Select></Field>
        )}
      </PageHead>

      <div className="anim-rise mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Present" value={stats.present} tone="pine" icon={<UserCheck className="h-4.5 w-4.5" />} />
        <Stat label="Late" value={stats.late} tone="gold" icon={<ClockIcon className="h-4.5 w-4.5" />} />
        <Stat label="Absent" value={stats.absent} tone="rust" icon={<UserX className="h-4.5 w-4.5" />} />
        <Stat label="Attendance rate" value={`${stats.pct}%`} tone="steel" icon={<CalendarCheck2 className="h-4.5 w-4.5" />} />
      </div>

      <Panel className="anim-rise overflow-hidden">
        <div className="attendance-table-wrap">
          <table className="attendance-table">
            <thead className="border-b border-mist bg-paper/60"><tr><th className={`${thCls()} min-w-[240px] whitespace-nowrap`}>Date</th><th className={`${thCls()} min-w-[240px] whitespace-nowrap text-center`}>Status</th></tr></thead>
            <tbody className="divide-y divide-mist/70">
            {history.map((r) => (
              <tr key={r.date}><td className={tdCls()}>{fmtDate(r.date)}</td><td className={`${tdCls()} text-center`}><Chip tone={r.marks[student.id] === "present" ? "pine" : r.marks[student.id] === "late" ? "gold" : "rust"}>{r.marks[student.id]}</Chip></td></tr>
            ))}
            {history.length === 0 && <tr><td colSpan={2}><EmptyState icon={<CalendarCheck2 className="h-5 w-5" />} title="No attendance recorded yet" body="Records will appear here once the register is taken." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* =========================================================================
   TEACHER–SUBJECT ASSIGNMENTS
   Admin: full CRUD. Teacher/student/guardian: read-only, scoped to them.
   ========================================================================= */
export function AssignmentsPage() {
  const { db, currentUser, yearId, update, toast } = useApp();
  const role = currentUser?.role ?? "admin";

  if (role !== "admin") {
    if (!hasPermission(db, currentUser, "assignments.view")) {
      return <AccessDenied required="assignments.view" reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
    }
    let rows: { classId: string; sectionId: string; subjectId: string; teacherId: string }[] = [];
    if (role === "teacher") {
      for (const p of teacherPairs(db, currentUser)) for (const sid of p.subjectIds) rows.push({ classId: p.classId, sectionId: p.sectionId, subjectId: sid, teacherId: currentUser!.teacherId! });
    } else if (role === "student") {
      const s = studentOf(db, currentUser);
      if (s?.enrollment) rows = db.assignments.filter((a) => a.classId === s.enrollment!.classId && a.sectionId === s.enrollment!.sectionId).map((a) => ({ classId: a.classId, sectionId: a.sectionId, subjectId: a.subjectId, teacherId: a.teacherId }));
    } else if (role === "guardian") {
      for (const c of childrenOf(db, currentUser)) {
        if (!c.enrollment) continue;
        for (const a of db.assignments.filter((a) => a.classId === c.enrollment!.classId && a.sectionId === c.enrollment!.sectionId)) rows.push({ classId: a.classId, sectionId: a.sectionId, subjectId: a.subjectId, teacherId: a.teacherId });
      }
    }
    return (
      <div className="mx-auto max-w-4xl">
        <PageHead kicker="Academics" title="Assignments" sub="Which teacher covers which subject for each class." />
        <Panel className="anim-rise overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-mist bg-paper/60"><tr><th className={thCls()}>Class</th><th className={thCls()}>Subject</th><th className={thCls()}>Teacher</th></tr></thead>
            <tbody className="divide-y divide-mist/70">
              {rows.map((r, i) => (
                <tr key={i}><td className={tdCls()}>{sectionShort(db, r.classId, r.sectionId)}</td><td className={tdCls()}>{getSubject(db, r.subjectId)?.name}</td><td className={tdCls()}>{getTeacher(db, r.teacherId)?.name}</td></tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={3}><EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Nothing assigned yet" body="Assignments will appear once the office sets them up." /></td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  }

  if (!hasPermission(db, currentUser, "academics.manage")) {
    return <AccessDenied required="academics.manage" reason="You don't have permission to manage teacher assignments." />;
  }

  const [edit, setEdit] = useState<Assignment | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Assignment | null>(null);
  const [filterClass, setFilterClass] = useState("");

  const rows = db.assignments.filter((a) => a.yearId === yearId && (!filterClass || a.classId === filterClass));

  const remove = (a: Assignment) => {
    update((d) => { d.assignments = d.assignments.filter((x) => x.id !== a.id); pushAudit(d, currentUser, "assignment.delete", `${getSubject(db, a.subjectId)?.name} · ${sectionShort(db, a.classId, a.sectionId)}`); });
    toast("Assignment removed.");
    setConfirmDelete(null);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="Academics" title="Teacher assignments" sub="The source of truth for who teaches what, where — drives access for teachers everywhere in the system.">
        <Field label="Class" className="w-40"><Select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}><option value="">All classes</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Btn variant="gold" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> New assignment</Btn>
      </PageHead>

      <Panel className="anim-rise overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-mist bg-paper/60"><tr><th className={thCls()}>Class · Section</th><th className={thCls()}>Subject</th><th className={thCls()}>Teacher</th><th className={thCls()}></th></tr></thead>
          <tbody className="divide-y divide-mist/70">
            {rows.map((a) => (
              <tr key={a.id} className="transition-colors hover:bg-pine-50/50">
                <td className={tdCls()}>{sectionShort(db, a.classId, a.sectionId)}</td>
                <td className={tdCls()}><span className="flex items-center gap-1.5"><Tag className="h-3 w-3 text-soft" /> {getSubject(db, a.subjectId)?.name}</span></td>
                <td className={tdCls()}>{getTeacher(db, a.teacherId)?.name}</td>
                <td className={`${tdCls()} text-right`}>
                  <span className="inline-flex gap-1">
                    <button onClick={() => setEdit(a)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-pine-100 hover:text-pine-700"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDelete(a)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4}><EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No assignments yet" body="Assign a teacher to a subject for a class & section." action={<Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> New assignment</Btn>} /></td></tr>}
          </tbody>
        </table>
      </Panel>

      {edit && <AssignmentModal existing={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
      {confirmDelete && (
        <Modal title="Remove this assignment?" onClose={() => setConfirmDelete(null)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn><Btn variant="danger" onClick={() => remove(confirmDelete)}><Trash2 className="h-4 w-4" /> Remove</Btn></>}>
          <p className="text-[13px] text-ink">The teacher will immediately lose access to students in this class/section for this subject.</p>
        </Modal>
      )}
    </div>
  );
}

function AssignmentModal({ existing, onClose }: { existing?: Assignment; onClose: () => void }) {
  const { db, yearId, update, toast, currentUser } = useApp();
  const [classId, setClassId] = useState(existing?.classId ?? db.classes[0]?.id ?? "");
  const cls = getClass(db, classId);
  const [sectionId, setSectionId] = useState(existing?.sectionId ?? cls?.sections[0]?.id ?? "");
  useEffect(() => {
    const c = getClass(db, classId);
    if (c && !c.sections.some((s) => s.id === sectionId)) setSectionId(c.sections[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);
  const [subjectId, setSubjectId] = useState(existing?.subjectId ?? db.subjects[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(existing?.teacherId ?? db.teachers[0]?.id ?? "");

  const save = () => {
    const dup = db.assignments.find((a) => a.id !== existing?.id && a.yearId === yearId && a.classId === classId && a.sectionId === sectionId && a.subjectId === subjectId);
    if (dup) { toast("This class/section already has a teacher for that subject — edit the existing assignment instead.", "warn"); return; }
    update((d) => {
      if (existing) {
        const i = d.assignments.findIndex((a) => a.id === existing.id);
        if (i >= 0) d.assignments[i] = { ...existing, classId, sectionId, subjectId, teacherId };
        pushAudit(d, currentUser, "assignment.update", `${getSubject(db, subjectId)?.name} · ${sectionShort(db, classId, sectionId)}`);
      } else {
        d.assignments.push({ id: uid(), yearId, classId, sectionId, subjectId, teacherId });
        pushAudit(d, currentUser, "assignment.create", `${getSubject(db, subjectId)?.name} · ${sectionShort(db, classId, sectionId)}`);
      }
    });
    toast(existing ? "Assignment updated." : "Assignment created.");
    onClose();
  };

  return (
    <Modal title={existing ? "Edit assignment" : "New assignment"} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}><Save className="h-4 w-4" /> Save</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Class" required><Select value={classId} onChange={(e) => setClassId(e.target.value)}>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Section" required><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>{cls?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Subject" required><Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>{db.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Teacher" required><Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>{db.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
      </div>
    </Modal>
  );
}

/* =========================================================================
   RESULTS / REPORT CARDS (role-aware viewer)
   ========================================================================= */
export function ReportsPage() {
  const { db, currentUser } = useApp();
  const role = currentUser?.role ?? "admin";
  const isAdmin = role === "admin";
  const [classId, setClassId] = useState(db.classes[0]?.id ?? "");
  const cls = getClass(db, classId);
  const [sectionId, setSectionId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [openStudent, setOpenStudent] = useState<Student | null>(null);
  const rosterQuery = useStudents({ classId: classId || undefined, sectionId: sectionId || undefined, search: q, page, pageSize: 50 });

  if (role === "student" || role === "guardian") return <ReportCardViewer />;
  if (!hasPermission(db, currentUser, "results.view")) {
    return <AccessDenied required="results.view" reason="You don't have permission to view results." />;
  }

  const roster = rosterQuery.rows.map(studentRowToStudent);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="Results" title="Reports" sub="Class averages across every published assessment structure.">
        <Field label="Class" className="w-36"><Select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); setPage(0); }}>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Section" className="w-32"><Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(0); }}><option value="">All</option>{cls?.sections.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}</Select></Field>
        <Field label="Search" className="w-48"><TextInput value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Student name…" /></Field>
      </PageHead>

      <Panel className="anim-rise overflow-hidden">
        {rosterQuery.isPending && !roster.length ? <SkeletonPanel rows={6} /> : <>
          <div className="overflow-x-auto">
            <table className="reports-table w-full min-w-[760px]">
              <thead className="border-b border-mist bg-paper/60"><tr><th className={`${thCls()} w-10 whitespace-nowrap`}>#</th><th className={`${thCls()} min-w-[240px] whitespace-nowrap`}>Student</th><th className={`${thCls()} min-w-[140px] whitespace-nowrap`}>Section</th><th className={`${thCls()} min-w-[130px] whitespace-nowrap text-center`}>Average</th><th className={`${thCls()} w-[100px] whitespace-nowrap`}></th></tr></thead>
              <tbody className="divide-y divide-mist/70">
                {roster.map((student, i) => (
                  <ReportRosterRow key={student.id} student={student} db={db} onOpen={setOpenStudent} index={page * rosterQuery.pageSize + i} />
                ))}
                {roster.length === 0 && <tr><td colSpan={5}><EmptyState icon={<FileBarChart2 className="h-5 w-5" />} title="No students match" body="Try a different class, section, or search." /></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist bg-paper/40 px-4 py-3">
            <p className="text-[11px] font-semibold text-soft">{rosterQuery.total} student{rosterQuery.total === 1 ? "" : "s"}</p>
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="ghost" disabled={page <= 0 || rosterQuery.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Btn>
              <span className="min-w-[86px] text-center font-mono text-[11px] text-soft">Page {page + 1} / {rosterQuery.pageCount}</span>
              <Btn size="sm" variant="ghost" disabled={page + 1 >= rosterQuery.pageCount || rosterQuery.isFetching} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        </>}
      </Panel>

      {openStudent && <ReportCardModal student={openStudent} onClose={() => setOpenStudent(null)} adminView={isAdmin} />}
    </div>
  );
}

function ReportRosterRow({ student, db, onOpen, index }: { student: Student; db: DB; onOpen: (student: Student) => void; index: number }) {
  const resultsQuery = useStudentResults(student.id, false);
  const all = resultsQuery.data?.results ?? [];
  const complete = all.filter((r) => r.items.length > 0 && r.items.every((it) => r.marks[it.id] != null));
  const average = complete.length ? complete.reduce((sum, r) => {
    const total = r.items.reduce((t, it) => t + ((Number(r.marks[it.id]) || 0) / Math.max(1, Number(it.max))) * Number(it.weight), 0);
    return sum + total;
  }, 0) / complete.length : null;
  return (
    <tr className="transition-colors hover:bg-pine-50/50">
      <td className={`${tdCls()} tnum text-soft`}>{index + 1}</td>
      <td className={tdCls()}><span className="flex items-center gap-2.5"><Avatar student={student} size={30} /><span className="font-bold text-ink">{shortName(student)}</span></span></td>
      <td className={`${tdCls()} whitespace-nowrap`}>{student.enrollment ? sectionShort(db, student.enrollment.classId, student.enrollment.sectionId) : "—"}</td>
      <td className={`${tdCls()} whitespace-nowrap text-center font-mono font-bold`}>{resultsQuery.isPending ? "…" : average != null ? `${fmt1(average)}%` : "—"}</td>
      <td className={`${tdCls()} whitespace-nowrap text-right`}><Btn size="sm" variant="ghost" onClick={() => onOpen(student)}><Eye className="h-3.5 w-3.5" /> View</Btn></td>
    </tr>
  );
}

function studentRowToStudent(r: import("../lib/api").StudentRow): Student {
  return {
    id: r.student_id,
    regId: r.reg_no,
    firstName: r.first_name,
    middleName: r.middle_name ?? "",
    lastName: r.last_name,
    gender: r.gender === "Female" ? "Female" : "Male",
    dob: r.dob ?? "",
    status: (r.status as Student["status"]) || "active",
    guardian: { father: "", relation: "Guardian", phone: r.guardian_phone ?? undefined },
    admission: { number: "", date: r.admission_date ?? "", type: "" },
    enrollment: { yearId: "", classId: r.class_id, sectionId: r.section_id, rollNumber: r.roll_number ?? undefined, status: "active" } as Student["enrollment"],
    history: [], documents: [],
  };
}

/** Student/guardian: only ever see PUBLISHED results. */
function ReportCardViewer() {
  const { db, currentUser } = useApp();
  const role = currentUser?.role;
  const kids = role === "guardian" ? childrenOf(db, currentUser) : (studentOf(db, currentUser) ? [studentOf(db, currentUser)!] : []);
  const [selId, setSelId] = useState(kids[0]?.id ?? "");
  const student = kids.find((k) => k.id === selId) ?? kids[0];
  if (!student) return <AccessDenied required="results.view_self / results.view_children" reason="No linked student record was found." />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead kicker="Results" title={role === "guardian" ? "Grades" : "My grades"} sub="Only published results are shown here.">
        {role === "guardian" && kids.length > 1 && (
          <Field label="Child" className="w-48"><Select value={selId} onChange={(e) => setSelId(e.target.value)}>{kids.map((k) => <option key={k.id} value={k.id}>{shortName(k)}</option>)}</Select></Field>
        )}
      </PageHead>
      <ReportCardBody student={student} publishedOnly />
    </div>
  );
}

function ReportCardModal({ student, onClose, adminView }: { student: Student; onClose: () => void; adminView?: boolean }) {
  const { currentUser } = useApp();
  const canExport = currentUser?.role === "admin";
  return (
    <Modal title={fullName(student)} kicker="Report card" onClose={onClose} wide
      footer={<><Btn variant="ghost" onClick={onClose}>Close</Btn>{canExport && <Btn onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Btn>}</>}>
      <ReportCardBody student={student} publishedOnly={!adminView} />
    </Modal>
  );
}

type ReportResult = {
  st: AssessmentStructure;
  subject: { id: string; name: string; code: string; color: string | null };
  calc: { raw: Record<string, number>; total: number; pct: number; complete: boolean };
};

function normalizeReportResults(rows: import("../lib/api").StudentResultRow[]): ReportResult[] {
  return rows.map((r) => {
    const items = r.items.map((it) => ({ id: it.id, name: it.name, max: Number(it.max), weight: Number(it.weight) }));
    const raw = Object.fromEntries(Object.entries(r.marks ?? {}).map(([k, v]) => [k, Number(v)]));
    const complete = items.length > 0 && items.every((it) => raw[it.id] != null);
    const total = items.reduce((sum, it) => sum + ((Number(raw[it.id]) || 0) / Math.max(1, it.max)) * it.weight, 0);
    return {
      st: { id: r.structure.id, yearId: r.structure.year_id, classId: r.structure.class_id, subjectId: r.structure.subject_id, period: r.structure.period, items },
      subject: r.subject,
      calc: { raw, total, pct: total, complete },
    };
  });
}

function exportReportCardCsv(db: DB, student: Student, results: ReportResult[]) {
  const showGrade = getYear(db, db.years.find((y) => y.active)?.id)?.showGrade !== false;
  const rows: (string | number)[][] = [["Subject", "Period", "Assessment", "Max", "Weight %", "Score"]];
  results.forEach((r) => {
    r.st.items.forEach((it) => rows.push([r.subject?.name ?? "", r.st.period, it.name, it.max, it.weight, r.calc.raw[it.id] ?? ""]));
    rows.push([r.subject?.name ?? "", r.st.period, "TOTAL", "", "", r.calc.complete ? fmt1(r.calc.total) : ""]);
  });
  if (showGrade) rows.push(["", "", "Grade column enabled", "", "", ""]);
  downloadCsv(`Report-${student.regId}.csv`, rows);
}

function exportReportCardPdf(db: DB, student: Student, results: ReportResult[]) {
  const showGrade = getYear(db, db.years.find((y) => y.active)?.id)?.showGrade !== false;
  const doc = newThemedDoc("portrait");
  let y = drawThemedHeader(doc, db.settings.schoolName, "Report Card", `${fullName(student)} · Reg. ${student.regId}`);
  y += 2;
  y = drawThemedTable(doc, y, [
    { header: "Subject", width: 55 }, { header: "Period", width: 35, align: "center" }, { header: "Total", width: 25, align: "center" }, { header: "%", width: 20, align: "center" },
    ...(showGrade ? [{ header: "Grade", width: 20, align: "center" as const }] : []),
  ], results.map((r) => {
    const grade = r.calc.complete ? gradeFor(r.calc.pct, db.grading) : null;
    return [r.subject?.name ?? "", r.st.period, r.calc.complete ? fmt1(r.calc.total) : "—", r.calc.complete ? `${fmt1(r.calc.pct)}%` : "—", ...(showGrade ? [grade?.grade ?? "—"] : [])];
  }));
  y += 6;
  results.forEach((r) => {
    y = drawThemedSectionLabel(doc, y, `${r.subject?.name ?? ""} — ${r.st.period}`);
    y = drawThemedTable(doc, y, [
      { header: "Assessment", width: 65 }, { header: "Max", width: 25, align: "center" }, { header: "Weight %", width: 25, align: "center" }, { header: "Score", width: 25, align: "center" },
    ], r.st.items.map((it) => [it.name, it.max, `${it.weight}%`, r.calc.raw[it.id] ?? "—"]));
    y += 6;
  });
  doc.save(`Report-${student.regId}.pdf`);
}

function ReportCardBody({ student, publishedOnly }: { student: Student; publishedOnly?: boolean }) {
  const { db, currentUser } = useApp();
  const canExport = currentUser?.role === "admin";
  const resultsQuery = useStudentResults(student.id, publishedOnly);
  const results = normalizeReportResults(resultsQuery.data?.results ?? []);
  const completeOnes = results.filter((r) => r.calc.complete);
  const showGrade = getYear(db, db.years.find((y) => y.active)?.id)?.showGrade !== false;
  const avg = completeOnes.length ? +(completeOnes.reduce((s, r) => s + r.calc.pct, 0) / completeOnes.length).toFixed(1) : null;
  const [tab, setTab] = useState<"summary" | "detailed">("summary");

  if (resultsQuery.isPending) return <SkeletonPanel rows={5} />;
  if (resultsQuery.error) return <EmptyState icon={<AlertTriangle className="h-5 w-5" />} title="Results unavailable" body={(resultsQuery.error as Error).message || "Could not load this report card."} />;

  return (
    <div className="anim-rise">
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-mist bg-paper/50 p-3">
        <Avatar student={student} size={40} />
        <div><p className="font-display font-bold text-ink">{fullName(student)}</p><p className="text-[11.5px] text-soft">{student.enrollment ? sectionShort(db, student.enrollment.classId, student.enrollment.sectionId) : "—"} · Reg. {student.regId}</p></div>
        {avg != null && <span className="text-right"><span className="block font-mono text-[20px] font-extrabold text-pine-800">{avg}%</span><span className="block text-[10.5px] font-semibold text-soft">overall average</span></span>}
        {canExport && <div className="ml-auto flex gap-2"><Btn size="sm" variant="soft" onClick={() => exportReportCardCsv(db, student, results)}><FileDown className="h-3.5 w-3.5" /> CSV</Btn><Btn size="sm" variant="soft" onClick={() => exportReportCardPdf(db, student, results)}><Printer className="h-3.5 w-3.5" /> PDF</Btn></div>}
      </div>
      <div className="mb-3"><Tabs tabs={[{ id: "summary", label: "Summary", icon: <FileBarChart2 className="h-3.5 w-3.5" /> }, { id: "detailed", label: "Detailed", icon: <Table2 className="h-3.5 w-3.5" /> }]} active={tab} onChange={(id) => setTab(id as any)} /></div>
      {tab === "summary" ? (
        <Panel className="overflow-x-auto">
          <table className="academic-results-table w-full min-w-[700px]">
            <thead className="border-b border-mist bg-paper/60"><tr><th className={thCls()}>Subject</th><th className={thCls()}>Period</th><th className={`${thCls()} text-center`}>Total</th><th className={`${thCls()} text-center`}>%</th>{showGrade && <th className={`${thCls()} text-center`}>Grade</th>}</tr></thead>
            <tbody className="divide-y divide-mist/70">
              {results.map((r) => { const grade = r.calc.complete ? gradeFor(r.calc.pct, db.grading) : null; return <tr key={r.st.id}>
                <td className={tdCls()}><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.subject?.color ?? undefined }} /> {r.subject?.name}</span></td>
                <td className={tdCls()}>{r.st.period}</td><td className={`${tdCls()} text-center font-mono font-bold`}>{r.calc.complete ? fmt1(r.calc.total) : "—"}</td><td className={`${tdCls()} text-center font-mono`}>{r.calc.complete ? `${fmt1(r.calc.pct)}%` : "—"}</td>
                {showGrade && <td className={`${tdCls()} text-center`}>{grade ? <Chip tone={r.calc.pct >= 80 ? "pine" : r.calc.pct >= 50 ? "gold" : "rust"}>{grade.grade}</Chip> : <Chip tone="gray">pending</Chip>}</td>}
              </tr>; })}
              {results.length === 0 && <tr><td colSpan={showGrade ? 5 : 4}><EmptyState icon={<FileBarChart2 className="h-5 w-5" />} title={publishedOnly ? "No published results yet" : "No results yet"} body={publishedOnly ? "Results appear here once the office publishes them." : "No assessment results have been entered for this student."} /></td></tr>}
            </tbody>
          </table>
        </Panel>
      ) : (
        <div className="space-y-4">
          {results.map((r) => <Panel key={r.st.id} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-mist bg-paper/60 px-4 py-2.5"><span className="flex items-center gap-2 text-[12.5px] font-bold text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.subject?.color ?? undefined }} /> {r.subject?.name} <span className="font-normal text-soft">· {r.st.period}</span></span><span className="font-mono text-[12.5px] font-bold text-pine-800">{r.calc.complete ? `${fmt1(r.calc.total)} (${fmt1(r.calc.pct)}%)` : "Incomplete"}</span></div>
            <div className="overflow-x-auto"><table className="academic-results-table w-full min-w-[520px]"><thead className="border-b border-mist bg-paper/40"><tr><th className={thCls()}>Assessment</th><th className={`${thCls()} text-center`}>Max</th><th className={`${thCls()} text-center`}>Weight</th><th className={`${thCls()} text-center`}>Score</th></tr></thead><tbody className="divide-y divide-mist/70">{r.st.items.map((it) => <tr key={it.id}><td className={tdCls()}>{it.name}</td><td className={`${tdCls()} text-center font-mono`}>{it.max}</td><td className={`${tdCls()} text-center font-mono`}>{it.weight}%</td><td className={`${tdCls()} text-center font-mono font-bold`}>{r.calc.raw[it.id] ?? "—"}</td></tr>)}</tbody></table></div>
          </Panel>)}
          {results.length === 0 && <Panel><EmptyState icon={<Table2 className="h-5 w-5" />} title={publishedOnly ? "No published results yet" : "No results yet"} body={publishedOnly ? "Results appear here once the office publishes them." : "No assessment results have been entered for this student."} /></Panel>}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   FEES (admin ledger + simple receipts)
   ========================================================================= */
function feeStudentToStudent(r: { student_id: string; full_name: string; reg_no: string; class_id: string | null; section_id: string | null }): Student {
  const parts = String(r.full_name ?? "").trim().split(/\s+/);
  return {
    id: r.student_id,
    regId: r.reg_no,
    firstName: parts[0] ?? "",
    middleName: "",
    lastName: parts.slice(1).join(" "),
    gender: "Male",
    dob: "",
    status: "active",
    guardian: { father: "", relation: "Guardian" },
    admission: { number: "", date: "", type: "" },
    enrollment: r.class_id ? { yearId: "", classId: r.class_id, sectionId: r.section_id ?? "", status: "active" } : undefined,
    history: [], documents: [],
  };
}

function feeRequestToPaymentRequest(r: any): PaymentRequest {
  return {
    id: r.id, studentId: r.student_id, feeItemId: r.fee_item_id, amount: Number(r.amount),
    bankAccountId: r.bank_account_id, bankName: r.bank_name, reference: r.reference ?? undefined,
    receiptPath: r.receipt_path ?? undefined, receiptName: r.receipt_name ?? undefined,
    submittedBy: r.submitted_by, submittedByName: r.submitted_by_name ?? undefined, submittedAt: r.submitted_at,
    status: r.status, reviewedBy: r.reviewed_by ?? undefined, reviewedByName: r.reviewed_by_name ?? undefined,
    reviewedAt: r.reviewed_at ?? undefined, reviewNote: r.review_note ?? undefined,
    studentName: r.student_name ?? r.student_id, feeLabel: r.fee_label ?? r.fee_item_id,
  } as PaymentRequest & { studentName: string; feeLabel: string };
}

/* =========================================================================
   FEES (server-paged admin ledger + targeted receipts/payment requests)
   ========================================================================= */
export function FeesPage() {
  const { db, currentUser, toast, update, yearId } = useApp();
  const canView = hasPermission(db, currentUser, "fees.view");
  const canManage = hasPermission(db, currentUser, "fees.manage");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [q, setQ] = useState("");
  const [feePage, setFeePage] = useState(0);
  const [openStudent, setOpenStudent] = useState<Student | null>(null);
  const [reviewRequest, setReviewRequest] = useState<PaymentRequest | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<PaymentRequest | null>(null);
  const [receiptQuery, setReceiptQuery] = useState("");
  const [receiptFeeFilter, setReceiptFeeFilter] = useState("all");
  const [receiptStatus, setReceiptStatus] = useState("all");
  const [receiptPage, setReceiptPage] = useState(0);
  const [bankDraft, setBankDraft] = useState({ bankName: "", accountName: "", accountNumber: "", branch: "" });

  const cls = getClass(db, classId);
  const feeQuery = useFeeStudentSummary({ classId: classId || undefined, sectionId: sectionId || undefined, search: q || undefined, page: feePage, pageSize: 50 });
  const pendingQuery = useFeePaymentRequests({ status: "pending", page: 0, pageSize: 50 });
  const receiptQueryResult = useFeePaymentRequests({
    status: receiptStatus === "all" ? undefined : receiptStatus,
    search: receiptQuery || undefined,
    receiptOnly: true,
    page: receiptPage,
    pageSize: 50,
  });

  useEffect(() => { setFeePage(0); }, [classId, sectionId, q]);
  useEffect(() => { setReceiptPage(0); }, [receiptQuery, receiptStatus, receiptFeeFilter]);

  if (!canView) {
    return <AccessDenied required="fees.view" reason="You don't have permission to view fee records." />;
  }

  const pendingRequests = (pendingQuery.rows ?? []).map(feeRequestToPaymentRequest);
  const receiptRows = (receiptQueryResult.rows ?? []).map(feeRequestToPaymentRequest);
  const feeOptions = [...new Set((receiptQueryResult.rows ?? []).map((r) => r.fee_label).filter(Boolean))].sort((a: string, b: string) => a.localeCompare(b));
  const filteredReceipts = receiptRows.filter((r: any) => receiptFeeFilter === "all" || r.feeLabel === receiptFeeFilter);
  const totals = { billed: feeQuery.billed, paid: feeQuery.collected, outstanding: feeQuery.outstanding };
  const bankAccounts = db.settings.bankAccounts ?? [];

  const addBankAccount = () => {
    if (!bankDraft.bankName.trim() || !bankDraft.accountName.trim() || !bankDraft.accountNumber.trim()) {
      toast("Bank, account name, and account number are all required.", "warn"); return;
    }
    void update((d) => {
      d.settings.bankAccounts = [...(d.settings.bankAccounts ?? []), {
        id: uid(), bankName: bankDraft.bankName.trim(), accountName: bankDraft.accountName.trim(),
        accountNumber: bankDraft.accountNumber.trim(), branch: bankDraft.branch.trim() || undefined,
      }];
    });
    toast("Bank account added — guardians will see it when paying by transfer.");
    setBankDraft({ bankName: "", accountName: "", accountNumber: "", branch: "" });
  };
  const removeBankAccount = (id: string) => {
    void update((d) => { d.settings.bankAccounts = (d.settings.bankAccounts ?? []).filter((a) => a.id !== id); });
    toast("Bank account removed.");
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="Finance" title="Fees" sub="Per-student ledgers — billed, paid and outstanding.">
        <Field label="Class" className="w-36"><Select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}><option value="">All</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Section" className="w-28"><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}><option value="">All</option>{cls?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Search" className="w-44"><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student name…" /></Field>
        {canManage && <Btn variant="gold" onClick={() => setBulkOpen(true)}><Plus className="h-4 w-4" /> Bulk add fee item</Btn>}
      </PageHead>

      {feeQuery.isPending ? (
        <><div className="anim-rise mb-4"><SkeletonCards n={3} /></div><SkeletonPanel rows={6} /></>
      ) : (
        <>
          <div className="anim-rise mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Billed" value={`Br ${totals.billed.toLocaleString()}`} tone="steel" icon={<Banknote className="h-4.5 w-4.5" />} />
            <Stat label="Collected" value={`Br ${totals.paid.toLocaleString()}`} tone="pine" icon={<Wallet className="h-4.5 w-4.5" />} />
            <Stat label="Outstanding" value={`Br ${totals.outstanding.toLocaleString()}`} tone="rust" icon={<Receipt className="h-4.5 w-4.5" />} />
          </div>

          {canManage && pendingRequests.length > 0 && (
            <Panel className="anim-rise mb-4 overflow-hidden border-gold-300">
              <div className="flex items-center justify-between border-b border-mist px-4 py-3 sm:px-5"><h3 className="font-display text-[14px] font-bold">Bank transfers awaiting review</h3><Chip tone="gold">{pendingQuery.total} pending</Chip></div>
              <ul className="divide-y divide-mist/70">
                {pendingRequests.map((r: any) => <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-[160px] flex-1"><p className="text-[13px] font-bold text-ink">{r.studentName ?? r.studentId} — {r.feeLabel ?? "Fee"}</p><p className="text-[11px] text-soft">Br {r.amount.toLocaleString()} · {r.bankName} · submitted by {r.submittedByName ?? "guardian"} · {fmtDate(r.submittedAt.slice(0, 10))}</p></div><Btn size="sm" variant="soft" onClick={() => setReviewRequest(r)}><Eye className="h-3.5 w-3.5" /> Review</Btn></li>)}
              </ul>
            </Panel>
          )}

          {currentUser?.role === "admin" && (
            <Panel className="anim-rise mb-4 overflow-hidden">
              <div className="border-b border-mist px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-display text-[14px] font-bold">Receipts</h3><p className="mt-0.5 text-[11px] text-soft">Uploaded receipts remain here after approval until an admin clears them.</p></div><Chip tone="gray">{receiptQueryResult.total}</Chip></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_140px]"><TextInput value={receiptQuery} onChange={(e) => setReceiptQuery(e.target.value)} placeholder="Search student, fee, bank or reference…" /><Select value={receiptFeeFilter} onChange={(e) => setReceiptFeeFilter(e.target.value)}><option value="all">All fee names</option>{feeOptions.map((label) => <option key={label} value={label}>{label}</option>)}</Select><Select value={receiptStatus} onChange={(e) => setReceiptStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></Select></div>
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead className="border-b border-mist bg-paper/60"><tr><th className={thCls()}>Student</th><th className={thCls()}>Fee</th><th className={`${thCls()} text-center`}>Amount</th><th className={thCls()}>Status</th><th className={thCls()}>Submitted</th><th className={thCls()}></th></tr></thead><tbody className="divide-y divide-mist/70">
                {filteredReceipts.map((r: any) => <tr key={r.id} className="hover:bg-pine-50/40"><td className={`${tdCls()} whitespace-nowrap font-semibold text-ink`}>{r.studentName ?? r.studentId}</td><td className={`${tdCls()} whitespace-nowrap`}>{r.feeLabel ?? r.feeItemId}</td><td className={`${tdCls()} whitespace-nowrap text-center font-mono font-bold`}>Br {r.amount.toLocaleString()}</td><td className={tdCls()}><Chip tone={r.status === "approved" ? "pine" : r.status === "pending" ? "gold" : "rust"}>{r.status}</Chip></td><td className={`${tdCls()} whitespace-nowrap text-soft`}>{fmtDate(r.submittedAt.slice(0, 10))}</td><td className={`${tdCls()} text-right`}><Btn size="sm" variant="soft" onClick={() => setReceiptPreview(r)}><Eye className="h-3.5 w-3.5" /> Preview</Btn></td></tr>)}
                {filteredReceipts.length === 0 && <tr><td colSpan={6}><EmptyState icon={<Receipt className="h-5 w-5" />} title="No stored receipts" body="Uploaded receipts will stay here until an admin clears them." /></td></tr>}
              </tbody></table></div>
              {receiptQueryResult.pageCount > 1 && <div className="flex items-center justify-between border-t border-mist px-4 py-3"><span className="text-[11px] text-soft">Page {receiptPage + 1} of {receiptQueryResult.pageCount}</span><div className="flex gap-2"><Btn size="sm" variant="ghost" disabled={receiptPage === 0} onClick={() => setReceiptPage((p) => Math.max(0, p - 1))}>Previous</Btn><Btn size="sm" variant="soft" disabled={receiptPage >= receiptQueryResult.pageCount - 1} onClick={() => setReceiptPage((p) => p + 1)}>Next</Btn></div></div>}
            </Panel>
          )}

          <Panel className="anim-rise overflow-x-auto"><table className="w-full min-w-[640px]"><thead className="border-b border-mist bg-paper/60"><tr><th className={thCls()}>Student</th><th className={thCls()}>Section</th><th className={`${thCls()} text-center`}>Billed</th><th className={`${thCls()} text-center`}>Paid</th><th className={`${thCls()} text-center`}>Outstanding</th><th className={thCls()}></th></tr></thead><tbody className="divide-y divide-mist/70">
            {feeQuery.rows.map((r) => { const st = feeStudentToStudent(r); return <tr key={r.student_id} className="transition-colors hover:bg-pine-50/50"><td className={tdCls()}><span className="flex items-center gap-2.5"><Avatar student={st} size={30} /><span className="font-bold text-ink">{shortName(st)}</span></span></td><td className={tdCls()}>{r.class_id ? sectionShort(db, r.class_id, r.section_id ?? "") : "—"}</td><td className={`${tdCls()} text-center font-mono`}>{Number(r.billed).toLocaleString()}</td><td className={`${tdCls()} text-center font-mono text-pine-700`}>{Number(r.paid).toLocaleString()}</td><td className={`${tdCls()} text-center font-mono ${Number(r.outstanding) > 0 ? "font-bold text-rust-600" : "text-soft"}`}>{Number(r.outstanding).toLocaleString()}</td><td className={`${tdCls()} text-right`}><Btn size="sm" variant="ghost" onClick={() => { setOpenStudent(st); }}><Eye className="h-3.5 w-3.5" /> Ledger</Btn></td></tr>; })}
            {feeQuery.rows.length === 0 && <tr><td colSpan={6}><EmptyState icon={<Banknote className="h-5 w-5" />} title="No students match" body="Try a different class, section, or search." /></td></tr>}
          </tbody></table></Panel>
          {feeQuery.pageCount > 1 && <div className="mt-2 flex items-center justify-between"><span className="text-[11.5px] text-soft">Page {feePage + 1} of {feeQuery.pageCount} · {feeQuery.total} students</span><div className="flex gap-2"><Btn size="sm" variant="ghost" disabled={feePage === 0 || feeQuery.isFetching} onClick={() => setFeePage((p) => Math.max(0, p - 1))}>Previous</Btn><Btn size="sm" variant="soft" disabled={feePage >= feeQuery.pageCount - 1 || feeQuery.isFetching} onClick={() => setFeePage((p) => p + 1)}>Next</Btn></div></div>}

          {canManage && <Panel className="anim-rise mt-4 overflow-hidden"><button onClick={() => setBankOpen((v) => !v)} className="flex w-full cursor-pointer items-center justify-between px-4 py-3.5 text-left sm:px-5"><h3 className="font-display text-[14px] font-bold">Bank accounts for guardian transfers</h3><Chip tone="gray">{bankAccounts.length}</Chip></button>{bankOpen && <div className="border-t border-mist p-4 sm:p-5"><p className="mb-3 text-[11.5px] text-soft">These are the accounts guardians see when they pay a fee by manual bank transfer.</p><div className="space-y-2">{bankAccounts.map((a) => <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-card p-2.5"><div className="min-w-[160px] flex-1"><p className="text-[12.5px] font-bold text-ink">{a.bankName} — {a.accountName}</p><p className="font-mono text-[11.5px] text-soft">{a.accountNumber}{a.branch ? ` · ${a.branch}` : ""}</p></div><button onClick={() => removeBankAccount(a.id)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}{bankAccounts.length === 0 && <p className="py-3 text-center text-[12px] text-soft">No accounts added yet.</p>}</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><TextInput value={bankDraft.bankName} onChange={(e) => setBankDraft((p) => ({ ...p, bankName: e.target.value }))} placeholder="Bank name" /><TextInput value={bankDraft.accountName} onChange={(e) => setBankDraft((p) => ({ ...p, accountName: e.target.value }))} placeholder="Account holder name" /><TextInput value={bankDraft.accountNumber} onChange={(e) => setBankDraft((p) => ({ ...p, accountNumber: e.target.value }))} placeholder="Account number" /><TextInput value={bankDraft.branch} onChange={(e) => setBankDraft((p) => ({ ...p, branch: e.target.value }))} placeholder="Branch (optional)" /></div><div className="mt-2 flex justify-end"><Btn size="sm" onClick={addBankAccount}><Plus className="h-3.5 w-3.5" /> Add account</Btn></div></div>}</Panel>}
        </>
      )}

      {openStudent && <FeeLedgerModal student={openStudent} canManage={canManage} onClose={() => { setOpenStudent(null); }} />}
      {reviewRequest && <ReviewPaymentRequestModal request={reviewRequest} onClose={() => { setReviewRequest(null); void pendingQuery.refetch(); void feeQuery.refetch(); }} />}
      {receiptPreview && <ReceiptPreviewModal request={receiptPreview} onClose={() => { setReceiptPreview(null); void receiptQueryResult.refetch(); }} />}
      {bulkOpen && <BulkFeeModal onClose={() => { setBulkOpen(false); void feeQuery.refetch(); }} />}
    </div>
  );
}

/** Admin bulk action: create the same fee item (label, amount, due date) for
 *  every student in a chosen class/section in one go, instead of opening
 *  each student's ledger individually. Scope narrows live as class/section
 *  are picked, and any student can be unchecked from the resulting list
 *  before it's created — so it still covers "just these few" without a
 *  separate individual flow. */
function BulkFeeModal({ onClose }: { onClose: () => void }) {
  const { db, currentUser, toast, yearId } = useApp();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState(todayISO());
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const cls = getClass(db, classId);
  const sectionName = classId && sectionId ? cls?.sections.find((s) => s.id === sectionId)?.name : undefined;

  const submit = async () => {
    if (!label.trim() || amount <= 0) { toast("Give the fee a label and a positive amount.", "warn"); return; }
    setBusy(true);
    try {
      const result = await bulkCreateFeeItems({ yearId, classId: classId || null, sectionId: sectionId || null, label: label.trim(), amount, dueDate: due });
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      const count = Number((result as any)?.created ?? 0);
      toast(`Added "${label.trim()}" to ${count} student${count !== 1 ? "s" : ""}.`);
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't add fee items.", "warn"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Bulk add fee item" kicker="The server applies this to every active enrollment in the scope you pick" onClose={onClose} wide
      footer={<><Btn variant="ghost" onClick={onClose} disabled={busy}>Cancel</Btn><Btn onClick={submit} busy={busy}><Save className="h-4 w-4" /> Add fee item</Btn></>}>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Label" required><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tuition — Term 2" /></Field>
        <Field label="Amount" required><input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="w-full rounded-lg border border-mist bg-card px-3 py-2 text-[13.5px]" /></Field>
        <Field label="Due date" required><TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Class"><Select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}><option value="">Whole school</option>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Section"><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}><option value="">All sections</option>{cls?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      </div>
      <div className="mt-4 rounded-xl border border-pine-200 bg-pine-50/60 p-4 text-[12.5px] text-soft">
        <p className="font-bold text-ink">Scope</p>
        <p className="mt-1">{classId ? `${cls?.name ?? classId}${sectionName ? ` · Section ${sectionName}` : " · all sections"}` : "All active students in the selected academic year"}</p>
        <p className="mt-1 text-[11.5px]">The database performs the bulk insert directly, so this action does not download the whole student list into the browser.</p>
      </div>
    </Modal>
  );
}

function ReceiptPreviewModal({ request, onClose }: { request: PaymentRequest; onClose: () => void }) {
  const { toast, update } = useApp();
  const confirm = useConfirm();
  const [url, setUrl] = useState<string | undefined>(request.receiptDataUrl);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const studentName = (request as any).studentName ?? request.studentId;
  const itemLabel = (request as any).feeLabel ?? request.feeItemId;

  useEffect(() => {
    if (!request.receiptPath || url) return;
    setLoading(true);
    getDownloadUrl("fee_receipt", request.studentId, request.receiptPath)
      .then(setUrl)
      .catch((e) => toast(`Couldn't load the receipt: ${e instanceof Error ? e.message : String(e)}`, "warn"))
      .finally(() => setLoading(false));
  }, [request.receiptPath, request.receiptDataUrl]);

  const clear = async () => {
    const ok = await confirm({ title: "Clear receipt?", body: "This permanently removes the uploaded receipt file. The payment record and audit history stay intact.", confirmLabel: "Clear receipt", danger: true });
    if (!ok) return;
    if (!request.receiptPath) {
      update((d) => { const r = d.paymentRequests.find((x) => x.id === request.id); if (r) { r.receiptDataUrl = undefined; r.receiptName = undefined; } });
      toast("Receipt cleared.");
      onClose();
      return;
    }
    setBusy(true);
    try {
      await clearFeeReceipt(request.id, request.studentId, request.receiptPath);
      update((d) => {
        const r = d.paymentRequests.find((x) => x.id === request.id);
        if (r) { r.receiptPath = undefined; r.receiptDataUrl = undefined; r.receiptName = undefined; }
      });
      toast("Receipt cleared. Payment record remains.");
      onClose();
    } catch (e) {
      toast(`Couldn't clear the receipt: ${e instanceof Error ? e.message : String(e)}`, "warn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={itemLabel} kicker={studentName} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Close</Btn><Btn variant="dangerSoft" onClick={clear} busy={busy}><Trash2 className="h-4 w-4" /> Clear receipt</Btn></>}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-soft">
        <span>Br {request.amount.toLocaleString()}</span><span>{request.status}</span><span>{fmtDate(request.submittedAt.slice(0, 10))}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-mist bg-paper/50 p-2">
        {loading ? <p className="py-16 text-center text-[12px] text-soft">Loading receipt…</p> : url ? (
          request.receiptName?.toLowerCase().endsWith(".pdf") ? <iframe src={url} title="Receipt" className="h-[68vh] min-h-[420px] w-full rounded-lg" /> : <a href={url} target="_blank" rel="noopener"><img src={url} alt="Payment receipt" className="mx-auto max-h-[68vh] w-full rounded-lg object-contain" /></a>
        ) : <p className="py-16 text-center text-[12px] text-soft">No receipt file is available.</p>}
      </div>
    </Modal>
  );
}

/** Admin decision point: view the uploaded receipt, then approve (which turns
 *  it into a real Payment on the fee item) or reject it. */
function ReviewPaymentRequestModal({ request, onClose }: { request: PaymentRequest; onClose: () => void }) {
  const { db, currentUser, update, toast } = useApp();
  const [receiptUrl, setReceiptUrl] = useState<string | undefined>(request.receiptDataUrl);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const studentName = (request as any).studentName ?? request.studentId;
  const itemLabel = (request as any).feeLabel ?? request.feeItemId;

  useEffect(() => {
    if (request.receiptPath && !receiptUrl) {
      setLoadingReceipt(true);
      getDownloadUrl("fee_receipt", request.studentId, request.receiptPath)
        .then(setReceiptUrl)
        .catch((e) => toast(`Couldn't load the receipt: ${e instanceof Error ? e.message : String(e)}`, "warn"))
        .finally(() => setLoadingReceipt(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.receiptPath]);

  const decide = async (status: "approved" | "rejected") => {
    setBusy(true);
    try {
      const result = await reviewFeePaymentRequest(request.id, status, note.trim() || undefined);
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      toast(status === "approved" ? "Payment approved and recorded." : "Request rejected.");
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't review payment request.", "warn"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`${studentName} — ${itemLabel}`} kicker="Review bank transfer receipt" onClose={onClose}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn variant="soft" onClick={() => decide("rejected")} busy={busy}><UserX className="h-4 w-4" /> Reject</Btn>
        <Btn onClick={() => decide("approved")} busy={busy}><CheckCircle2 className="h-4 w-4" /> Approve</Btn>
      </>}>
      <div className="grid gap-2 text-[12.5px] sm:grid-cols-2">
        <div><span className="text-soft">Amount</span> · <span className="font-mono font-bold">Br {request.amount.toLocaleString()}</span></div>
        <div><span className="text-soft">Bank</span> · <span className="font-bold">{request.bankName}</span></div>
        {request.reference && <div><span className="text-soft">Reference</span> · <span className="font-mono">{request.reference}</span></div>}
        <div><span className="text-soft">Submitted</span> · {fmtDate(request.submittedAt.slice(0, 10))} by {request.submittedByName ?? "guardian"}</div>
      </div>

      <div className="mt-3 rounded-lg border border-mist bg-paper/50 p-3">
        <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-soft">Receipt</p>
        {loadingReceipt ? (
          <p className="text-[12px] text-soft">Loading…</p>
        ) : receiptUrl ? (
          /\.pdf($|\?)/i.test(receiptUrl) || (request.receiptName ?? "").toLowerCase().endsWith(".pdf") ? (
            <a href={receiptUrl} target="_blank" rel="noopener" className="text-[12.5px] font-bold text-pine-700 underline">Open {request.receiptName ?? "receipt"} (PDF)</a>
          ) : (
            <a href={receiptUrl} target="_blank" rel="noopener"><img src={receiptUrl} alt="Payment receipt" className="max-h-72 w-full rounded-lg object-contain" /></a>
          )
        ) : (
          <p className="text-[12px] text-soft">No receipt on file.</p>
        )}
      </div>

      <Field label="Note (optional, shown in the audit log)" className="mt-3">
        <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. slip matches the amount and account" />
      </Field>
    </Modal>
  );
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "telebirr", label: "telebirr" },
  { id: "cbe_birr", label: "CBE Birr" },
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "cash", label: "Cash" },
  { id: "cheque", label: "Cheque" },
];
const ETH_BANKS = ["Commercial Bank of Ethiopia", "Awash Bank", "Dashen Bank", "Bank of Abyssinia", "Wegagen Bank", "Cooperative Bank of Oromia", "Zemen Bank", "Hibret Bank"];

function methodLabel(m: PaymentMethod) { return PAYMENT_METHODS.find((x) => x.id === m)?.label ?? m; }

function FeeLedgerModal({ student, canManage, onClose }: { student: Student; canManage: boolean; onClose: () => void }) {
  const { db, toast, currentUser, yearId } = useApp();
  const confirm = useConfirm();
  const ledgerQuery = useFeeLedger(student.id);
  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState(todayISO());
  const [payItem, setPayItem] = useState<FeeItem | null>(null);
  const [historyItem, setHistoryItem] = useState<FeeItem | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("telebirr");
  const [payReference, setPayReference] = useState("");
  const [payBank, setPayBank] = useState(ETH_BANKS[0]);

  const items: FeeItem[] = (ledgerQuery.data?.items ?? []).map((f) => ({
    id: f.id, studentId: f.student_id, label: f.label, amount: Number(f.amount), paid: Number(f.paid), due: f.due_date ?? "",
    payments: (f.payments ?? []).map((p: any) => ({ id: String(p.id), amount: Number(p.amount), method: p.method as PaymentMethod, reference: p.reference ?? undefined, bank: p.bank ?? undefined, date: p.date ?? "", recordedBy: p.recordedBy ?? undefined })),
  }));
  const stats = useMemo(() => items.reduce((a, f) => ({ billed: a.billed + f.amount, paid: a.paid + f.paid, outstanding: a.outstanding + Math.max(0, f.amount - f.paid) }), { billed: 0, paid: 0, outstanding: 0 }), [items]);

  const addItem = async () => {
    if (!label.trim() || amount <= 0) { toast("Give the fee a label and a positive amount.", "warn"); return; }
    try {
      const result = await createFeeItem({ id: uid(), studentId: student.id, label: label.trim(), amount, dueDate: due, yearId });
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await ledgerQuery.refetch();
      toast("Fee item added.");
      setAddOpen(false); setLabel(""); setAmount(0);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't add fee item.", "warn"); }
  };
  const removeItem = async (f: FeeItem) => {
    const ok = await confirm({ title: "Delete this fee item?", body: `${f.label} for ${fullName(student)} will be removed.`, confirmLabel: "Delete fee", variant: "danger" });
    if (!ok) return;
    try {
      const result = await deleteFeeItem(f.id);
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await ledgerQuery.refetch();
      toast("Fee item removed.");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't remove fee item.", "warn"); }
  };
  const recordPayment = async () => {
    if (!payItem || payAmount <= 0) { toast("Enter a positive payment amount.", "warn"); return; }
    if (payMethod !== "cash" && !payReference.trim()) { toast(`Enter the ${methodLabel(payMethod)} transaction reference.`, "warn"); return; }
    try {
      const result = await recordFeePayment({ feeItemId: payItem.id, amount: payAmount, method: payMethod, reference: payMethod === "cash" ? null : payReference.trim(), bank: payMethod === "bank_transfer" ? payBank : null, paymentId: `pay-${uid()}` });
      if ((result as any)?.error) { toast((result as any).error, "warn"); return; }
      await ledgerQuery.refetch();
      toast("Payment recorded.");
      setPayItem(null); setPayAmount(0); setPayReference(""); setPayMethod("telebirr");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't record payment.", "warn"); }
  };

  const printReceipt = async (f: FeeItem) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    doc.setFontSize(14); doc.text(db.settings.schoolName || "School", 12, 16);
    doc.setFontSize(10); doc.text("Payment receipt", 12, 23);
    doc.setDrawColor(200); doc.line(12, 27, 138, 27);
    doc.setFontSize(11);
    doc.text(`Student: ${fullName(student)}`, 12, 36);
    doc.text(`Reg. no: ${student.regId}`, 12, 43);
    doc.text(`Item: ${f.label}`, 12, 50);
    doc.text(`Billed: Br ${f.amount.toLocaleString()}`, 12, 57);
    doc.text(`Paid to date: Br ${f.paid.toLocaleString()}`, 12, 64);
    doc.text(`Outstanding: Br ${(f.amount - f.paid).toLocaleString()}`, 12, 71);
    const last = (f.payments ?? [])[f.payments.length - 1];
    let y = 78;
    if (last) {
      doc.text(`Last payment: Br ${last.amount.toLocaleString()} via ${methodLabel(last.method)}`, 12, y); y += 7;
      if (last.bank) { doc.text(`Bank: ${last.bank}`, 12, y); y += 7; }
      if (last.reference) { doc.text(`Reference: ${last.reference}`, 12, y); y += 7; }
    }
    doc.text(`Date issued: ${fmtDate(todayISO())}`, 12, y);
    doc.save(`Receipt-${student.regId}-${f.label.replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <Modal title={fullName(student)} kicker="Fee ledger" onClose={onClose} wide
      footer={<><Btn variant="ghost" onClick={onClose}>Close</Btn>{canManage && <Btn variant="gold" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add fee item</Btn>}</>}>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-paper p-2.5 text-center"><p className="font-mono text-[16px] font-extrabold text-ink">{stats.billed.toLocaleString()}</p><p className="text-[10.5px] font-bold uppercase text-soft">Billed</p></div>
        <div className="rounded-lg bg-paper p-2.5 text-center"><p className="font-mono text-[16px] font-extrabold text-pine-700">{stats.paid.toLocaleString()}</p><p className="text-[10.5px] font-bold uppercase text-soft">Paid</p></div>
        <div className="rounded-lg bg-paper p-2.5 text-center"><p className={`font-mono text-[16px] font-extrabold ${stats.outstanding > 0 ? "text-rust-600" : "text-ink"}`}>{stats.outstanding.toLocaleString()}</p><p className="text-[10.5px] font-bold uppercase text-soft">Outstanding</p></div>
      </div>

      {addOpen && (
        <div className="mb-3 rounded-lg border border-mist bg-paper/50 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Tuition — Term 2" className="sm:col-span-1" />
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="Amount" className="rounded-lg border border-mist bg-card px-3 py-2 text-[13.5px]" />
            <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="mt-2 flex justify-end gap-2"><Btn size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn><Btn size="sm" onClick={addItem}><Save className="h-3.5 w-3.5" /> Add</Btn></div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-mist bg-card p-2.5">
            <div className="min-w-[140px] flex-1">
              <p className="text-[12.5px] font-bold text-ink">{f.label}</p>
              <p className="text-[10.5px] text-soft">Due {fmtDate(f.due)}{(f.payments?.length ?? 0) > 0 && ` · ${f.payments.length} payment${f.payments.length !== 1 ? "s" : ""}`}</p>
            </div>
            <span className="font-mono text-[12.5px]">Br {f.amount.toLocaleString()}</span>
            <Chip tone={f.paid >= f.amount ? "pine" : f.paid > 0 ? "gold" : "rust"}>{f.paid >= f.amount ? "Paid" : f.paid > 0 ? "Partial" : "Unpaid"}</Chip>
            {canManage && f.paid < f.amount && <Btn size="sm" variant="soft" onClick={() => { setPayItem(f); setPayAmount(f.amount - f.paid); setPayMethod("telebirr"); setPayReference(""); setPayBank(ETH_BANKS[0]); }}><Wallet className="h-3.5 w-3.5" /> Record payment</Btn>}
            {(f.payments?.length ?? 0) > 0 && <Btn size="sm" variant="ghost" onClick={() => setHistoryItem(f)}><Eye className="h-3.5 w-3.5" /> History</Btn>}
            {currentUser?.role === "admin" && <Btn size="sm" variant="ghost" onClick={() => printReceipt(f)}><Printer className="h-3.5 w-3.5" /> Receipt</Btn>}
            {canManage && <button onClick={() => removeItem(f)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
        {items.length === 0 && <p className="py-6 text-center text-[12.5px] text-soft">No fee items yet.</p>}
      </div>

      {payItem && (
        <Modal title={`Record payment — ${payItem.label}`} kicker="Choose the channel the payer used" onClose={() => setPayItem(null)}
          footer={<><Btn variant="ghost" onClick={() => setPayItem(null)}>Cancel</Btn><Btn onClick={recordPayment}><Save className="h-4 w-4" /> Save payment</Btn></>}>
          <Field label={`Amount (outstanding: Br ${(payItem.amount - payItem.paid).toLocaleString()})`} required>
            <input type="number" min={0} max={payItem.amount - payItem.paid} value={payAmount} onChange={(e) => setPayAmount(Math.min(payItem.amount - payItem.paid, Number(e.target.value) || 0))} className="w-full rounded-lg border border-mist bg-card px-3 py-2 text-[13.5px]" />
          </Field>
          <Field label="Payment method" required className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.id} onClick={() => setPayMethod(m.id)}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-all ${payMethod === m.id ? "border-pine-700 bg-pine-700 text-white" : "border-mist bg-card text-soft hover:border-pine-300"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
          {payMethod === "bank_transfer" && (
            <Field label="Receiving bank" required className="mt-3">
              <Select value={payBank} onChange={(e) => setPayBank(e.target.value)}>{ETH_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</Select>
            </Field>
          )}
          {payMethod !== "cash" && (
            <Field label={payMethod === "bank_transfer" ? "Deposit slip / transaction number" : payMethod === "cheque" ? "Cheque number" : `${methodLabel(payMethod)} transaction number`} required className="mt-3">
              <TextInput value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder={payMethod === "telebirr" || payMethod === "cbe_birr" ? "e.g. CBE1A2B3C4D5" : "Reference number"} />
            </Field>
          )}
        </Modal>
      )}

      {historyItem && (
        <Modal title={`Payment history — ${historyItem.label}`} onClose={() => setHistoryItem(null)} footer={<Btn variant="ghost" onClick={() => setHistoryItem(null)}>Close</Btn>}>
          <div className="space-y-2">
            {[...(historyItem.payments ?? [])].reverse().map((p) => (
              <div key={p.id} className="rounded-lg border border-mist bg-card p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[13px] font-bold text-ink">Br {p.amount.toLocaleString()}</span>
                  <Chip tone="pine">{methodLabel(p.method)}</Chip>
                </div>
                <p className="mt-1 text-[11px] text-soft">
                  {fmtDate(p.date)}{p.bank ? ` · ${p.bank}` : ""}{p.reference ? ` · Ref: ${p.reference}` : ""}{p.recordedBy ? ` · recorded by ${p.recordedBy}` : ""}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/* =========================================================================
   HOMEWORK
   Teacher/admin: set homework for a class/section/subject and see who
   submitted. Student: view what's due and mark it done. Guardian: read-only
   per child.
   ========================================================================= */
export function HomeworkPage() {
  const { db, currentUser } = useApp();
  const groupsLoaded = useLazyGroups("homework");
  const role = currentUser?.role ?? "admin";

  if (role === "student") return <StudentHomework />;
  if (role === "guardian") return <GuardianHomework />;

  if (!hasPermission(db, currentUser, "homework.view")) {
    return <AccessDenied required="homework.view" reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }

  const isAdmin = role === "admin";
  const canManage = hasPermission(db, currentUser, "homework.manage");
  const pairs = teacherPairs(db, currentUser);

  const [classId, setClassId] = useState("");
  const cls = getClass(db, classId);
  const [sectionId, setSectionId] = useState("");
  const [edit, setEdit] = useState<Homework | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Homework | null>(null);
  const [openRoster, setOpenRoster] = useState<Homework | null>(null);

  const scopedClassIds = isAdmin ? db.classes.map((c) => c.id) : [...new Set(pairs.map((p) => p.classId))];

  const rows = db.homework
    .filter((h) => scopedClassIds.includes(h.classId))
    .filter((h) => (isAdmin ? true : pairs.some((p) => p.classId === h.classId && p.sectionId === h.sectionId && p.subjectIds.includes(h.subjectId))))
    .filter((h) => !classId || h.classId === classId)
    .filter((h) => !sectionId || h.sectionId === sectionId)
    .sort((a, b) => b.due.localeCompare(a.due));

  const { update, toast } = useApp();
  const remove = (h: Homework) => {
    update((d) => { d.homework = d.homework.filter((x) => x.id !== h.id); pushAudit(d, currentUser, "homework.delete", h.title); });
    toast("Homework removed.");
    setConfirmDelete(null);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHead kicker="Academics" title="Homework" sub="Set homework for a class & subject, and track who's submitted.">
        <Field label="Class" className="w-36"><Select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}><option value="">All</option>{scopedClassIds.map((id) => <option key={id} value={id}>{getClass(db, id)?.name}</option>)}</Select></Field>
        <Field label="Section" className="w-28"><Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}><option value="">All</option>{cls?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        {canManage && <Btn variant="gold" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Set homework</Btn>}
      </PageHead>

      <div className="space-y-2.5">
        {!groupsLoaded ? (
          <SkeletonPanel rows={Math.min(rows.length || 4, 6)} />
        ) : (
        <>
        {rows.map((h) => {
          const roster = studentsOf(db, h.classId, h.sectionId);
          const submittedCount = roster.filter((s) => h.submitted.includes(s.id)).length;
          const overdue = h.due < todayISO();
          return (
            <Panel key={h.id} className="anim-rise p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-display text-[14.5px] font-bold text-ink">
                    {h.title}
                    <Chip tone={overdue ? "rust" : "steel"}>{overdue ? "Overdue" : `Due ${fmtDate(h.due)}`}</Chip>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-soft">{sectionShort(db, h.classId, h.sectionId)} · {getSubject(db, h.subjectId)?.name} · issued {fmtDate(h.issued)}</p>
                  {h.description && <p className="mt-1.5 text-[12.5px] text-ink">{h.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Chip tone={submittedCount === roster.length && roster.length > 0 ? "pine" : "gold"}>{submittedCount}/{roster.length} submitted</Chip>
                  <Btn size="sm" variant="ghost" onClick={() => setOpenRoster(h)}><Eye className="h-3.5 w-3.5" /> Roster</Btn>
                  {canManage && (isAdmin || pairs.some((p) => p.classId === h.classId && p.sectionId === h.sectionId && p.subjectIds.includes(h.subjectId))) && (
                    <>
                      <button onClick={() => setEdit(h)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-pine-100 hover:text-pine-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setConfirmDelete(h)} className="cursor-pointer rounded p-1.5 text-soft hover:bg-rust-100 hover:text-rust-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            </Panel>
          );
        })}
        {rows.length === 0 && <Panel className="anim-rise"><EmptyState icon={<PenLine className="h-5 w-5" />} title="No homework set yet" body="Set homework for a class & subject you teach." action={canManage ? <Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Set homework</Btn> : undefined} /></Panel>}
        </>
        )}
      </div>

      {edit && <HomeworkModal existing={edit === "new" ? undefined : edit} teacherPairs={pairs} isAdmin={isAdmin} onClose={() => setEdit(null)} />}
      {openRoster && <HomeworkRosterModal homework={openRoster} onClose={() => setOpenRoster(null)} canManage={canManage} />}
      {confirmDelete && (
        <Modal title={`Delete "${confirmDelete.title}"?`} onClose={() => setConfirmDelete(null)}
          footer={<><Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn><Btn variant="danger" onClick={() => remove(confirmDelete)}><Trash2 className="h-4 w-4" /> Delete</Btn></>}>
          <p className="text-[13px] text-ink">This can't be undone.</p>
        </Modal>
      )}
    </div>
  );
}

function HomeworkModal({ existing, teacherPairs: pairs, isAdmin, onClose }: {
  existing?: Homework; teacherPairs: { classId: string; sectionId: string; subjectIds: string[] }[]; isAdmin: boolean; onClose: () => void;
}) {
  const { db, yearId, update, toast, currentUser } = useApp();
  const options = isAdmin
    ? db.classes.flatMap((c) => c.sections.flatMap((s) => db.subjects.map((sub) => ({ classId: c.id, sectionId: s.id, subjectId: sub.id }))))
    : pairs.flatMap((p) => p.subjectIds.map((sid) => ({ classId: p.classId, sectionId: p.sectionId, subjectId: sid })));

  const key = (o: { classId: string; sectionId: string; subjectId: string }) => `${o.classId}|${o.sectionId}|${o.subjectId}`;
  const [combo, setCombo] = useState(existing ? key({ classId: existing.classId, sectionId: existing.sectionId, subjectId: existing.subjectId }) : key(options[0] ?? { classId: "", sectionId: "", subjectId: "" }));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [due, setDue] = useState(existing?.due ?? todayISO());

  const save = () => {
    if (!title.trim()) { toast("Give the homework a title.", "warn"); return; }
    const [classId, sectionId, subjectId] = combo.split("|");
    if (!classId) { toast("Choose a class, section and subject.", "warn"); return; }
    update((d) => {
      if (existing) {
        const i = d.homework.findIndex((h) => h.id === existing.id);
        if (i >= 0) d.homework[i] = { ...existing, classId, sectionId, subjectId, title: title.trim(), description: description.trim() || undefined, due };
        pushAudit(d, currentUser, "homework.update", title.trim());
      } else {
        d.homework.push({ id: uid(), yearId, classId, sectionId, subjectId, title: title.trim(), description: description.trim() || undefined, issued: todayISO(), due, submitted: [] });
        pushAudit(d, currentUser, "homework.create", title.trim());
        const roster = studentsOf(d, classId, sectionId);
        const recipients = d.users.filter((u) => u.status === "active" && (roster.some((s) => u.studentId === s.id) || (u.childrenIds ?? []).some((cid) => roster.some((s) => s.id === cid))));
        pushNotifications(d, recipients.map((u) => u.id), "homework", "New homework", `${title.trim()} — due ${fmtDate(due)}.`);
      }
    });
    toast(existing ? "Homework updated." : "Homework set.");
    onClose();
  };

  return (
    <Modal title={existing ? "Edit homework" : "Set homework"} onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}><Save className="h-4 w-4" /> Save</Btn></>}>
      <Field label="Class · section · subject" required>
        <Select value={combo} onChange={(e) => setCombo(e.target.value)}>
          {options.length === 0 && <option value="">No teaching assignments found</option>}
          {options.map((o) => <option key={key(o)} value={key(o)}>{sectionShort(db, o.classId, o.sectionId)} · {getSubject(db, o.subjectId)?.name}</option>)}
        </Select>
      </Field>
      <Field label="Title" required className="mt-3"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 4 exercises" /></Field>
      <Field label="Description" className="mt-3"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details…" /></Field>
      <Field label="Due date" required className="mt-3"><TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
    </Modal>
  );
}

function HomeworkRosterModal({ homework, onClose, canManage }: { homework: Homework; onClose: () => void; canManage: boolean }) {
  const { db, update, toast } = useApp();
  const roster = studentsOf(db, homework.classId, homework.sectionId);

  const toggle = (studentId: string) => {
    if (!canManage) return;
    update((d) => {
      const h = d.homework.find((x) => x.id === homework.id);
      if (!h) return;
      if (h.submitted.includes(studentId)) h.submitted = h.submitted.filter((id) => id !== studentId);
      else h.submitted.push(studentId);
    });
  };

  return (
    <Modal title={homework.title} kicker={`${sectionShort(db, homework.classId, homework.sectionId)} · due ${fmtDate(homework.due)}`} onClose={onClose} footer={<Btn variant="ghost" onClick={onClose}>Close</Btn>}>
      <div className="space-y-1.5">
        {roster.map((s) => {
          const done = homework.submitted.includes(s.id);
          return (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-mist bg-card p-2.5">
              <span className="flex items-center gap-2.5"><Avatar student={s} size={28} /><span className="text-[12.5px] font-bold text-ink">{shortName(s)}</span></span>
              <button disabled={!canManage} onClick={() => toggle(s.id)} className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-bold transition-all disabled:cursor-not-allowed ${done ? "border-pine-700 bg-pine-700 text-white" : "border-mist bg-paper text-soft hover:border-pine-300"}`}>
                {done ? "Submitted" : "Not yet"}
              </button>
            </div>
          );
        })}
        {roster.length === 0 && <p className="py-6 text-center text-[12.5px] text-soft">No students in this section.</p>}
      </div>
    </Modal>
  );
}

/** Student: homework due for my class/section, with a self-serve "mark done". */
function StudentHomework() {
  const { db, currentUser, update, toast } = useApp();
  if (!hasPermission(db, currentUser, "homework.view")) {
    return <AccessDenied required="homework.view" reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }
  const student = studentOf(db, currentUser);
  if (!student?.enrollment) return <AccessDenied required="homework.view" reason="No enrollment on record." />;

  const rows = db.homework
    .filter((h) => h.classId === student.enrollment!.classId && h.sectionId === student.enrollment!.sectionId)
    .sort((a, b) => a.due.localeCompare(b.due));

  const toggle = (h: Homework) => {
    update((d) => {
      const x = d.homework.find((y) => y.id === h.id);
      if (!x) return;
      if (x.submitted.includes(student.id)) x.submitted = x.submitted.filter((id) => id !== student.id);
      else x.submitted.push(student.id);
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead kicker="Academics" title="My homework" sub="Mark it done once you've submitted it in class." />
      <div className="space-y-2.5">
        {rows.map((h) => {
          const done = h.submitted.includes(student.id);
          const overdue = !done && h.due < todayISO();
          return (
            <Panel key={h.id} className="anim-rise p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[14px] font-bold text-ink">{h.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-soft">{getSubject(db, h.subjectId)?.name} · due {fmtDate(h.due)}</p>
                  {h.description && <p className="mt-1.5 text-[12.5px] text-ink">{h.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {overdue && <Chip tone="rust">Overdue</Chip>}
                  <Btn size="sm" variant={done ? "soft" : "gold"} onClick={() => toggle(h)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> {done ? "Submitted" : "Mark done"}
                  </Btn>
                </div>
              </div>
            </Panel>
          );
        })}
        {rows.length === 0 && <Panel className="anim-rise"><EmptyState icon={<PenLine className="h-5 w-5" />} title="No homework yet" body="Homework set by your teachers will appear here." /></Panel>}
      </div>
    </div>
  );
}

/** Guardian: read-only, per child. */
function GuardianHomework() {
  const { db, currentUser } = useApp();
  if (!hasPermission(db, currentUser, "homework.view")) {
    return <AccessDenied required="homework.view" reason="Your role doesn't include this permission. Ask an administrator to grant it in Roles & permissions if you need it." />;
  }
  const kids = childrenOf(db, currentUser).filter((c) => c.enrollment);
  const [selId, setSelId] = useState(kids[0]?.id ?? "");
  const child = kids.find((k) => k.id === selId) ?? kids[0];
  if (!child?.enrollment) return <AccessDenied required="homework.view" reason="No linked student record was found." />;

  const rows = db.homework
    .filter((h) => h.classId === child.enrollment!.classId && h.sectionId === child.enrollment!.sectionId)
    .sort((a, b) => a.due.localeCompare(b.due));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead kicker="Academics" title="Homework" sub="What's been set for your child's class.">
        {kids.length > 1 && <Field label="Child" className="w-48"><Select value={selId} onChange={(e) => setSelId(e.target.value)}>{kids.map((k) => <option key={k.id} value={k.id}>{shortName(k)}</option>)}</Select></Field>}
      </PageHead>
      <div className="space-y-2.5">
        {rows.map((h) => {
          const done = h.submitted.includes(child.id);
          return (
            <Panel key={h.id} className="anim-rise p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[14px] font-bold text-ink">{h.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-soft">{getSubject(db, h.subjectId)?.name} · due {fmtDate(h.due)}</p>
                  {h.description && <p className="mt-1.5 text-[12.5px] text-ink">{h.description}</p>}
                </div>
                <Chip tone={done ? "pine" : h.due < todayISO() ? "rust" : "gold"}>{done ? "Submitted" : h.due < todayISO() ? "Overdue" : "Pending"}</Chip>
              </div>
            </Panel>
          );
        })}
        {rows.length === 0 && <Panel className="anim-rise"><EmptyState icon={<PenLine className="h-5 w-5" />} title="No homework yet" body="Homework set by teachers will appear here." /></Panel>}
      </div>
    </div>
  );
}
