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
  studentAverage, studentOf, studentResults, structureRanks, teacherPairs, teachersOfStudent,
  todayISO, uid, useApp, useLazyGroups,
} from "../store";
import {
  Avatar, Btn, Chip, EmptyState, Field, Modal, PageHead, Panel, Ring, RoleBadge, Select, Skel, SkeletonPanel, SkeletonRows,
  Stat, Tabs, TextInput, UserAvatar, UsernameConflictModal, tdCls, thCls, useConfirm,
} from "../ui";
import { getDownloadUrl, isStorageConfigured, uploadFile } from "../lib/storage";
import { AccessDenied } from "./Auth";
import { defaultRoleIdFor, hasPermission, pushAudit } from "../rbac";
import { changeUserPassword, updateMyProfile, useStudents, studentRowToStudent, useStudentDetail, studentDetailToStudent } from "../lib/api";
import { deleteStudentRecord, deleteUserAccount } from "../lib/backend";
import { IDCardModal, RegistrationWizard } from "./registration";

/* ================= student profile (entity-guarded) ================= */
export function StudentProfilePage() {
  const { db, currentUser, toast } = useApp();
  const groupsLoaded = useLazyGroups(["attendance", "academics", "homework", "fees"]);
  const { id } = useParams();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const [payItem, setPayItem] = useState<FeeItem | null>(null);

  // get_student_detail() enforces the relationship boundary server-side
  // (can_view_student() in 0024_paged_queries.sql — admin sees anyone,
  // teacher only their sections, guardian only their children, student
  // only themselves), so a failed/empty result here always means "not
  // found or not permitted" and there's no separate client-side db.students
  // check to duplicate that with.
  const detailQuery = useStudentDetail(id ?? null);
  const s = detailQuery.data ? studentDetailToStudent(detailQuery.data) : undefined;

  /*
   * IMPORTANT:
   * Every hook below is intentionally unconditional.
   *
   * Previously these hooks were placed after:
   *   if (!id) return ...
   *   if (detailQuery.isPending) return ...
   *   if (!s) return ...
   *
   * That changed the hook order between renders and caused:
   *   Minified React error #310
   */

  const [gradePeriodFilter, setGradePeriodFilter] = useState("");

  // Until the student detail arrives, use an empty result set.
  // This keeps the hook execution stable during loading.
  const results = s ? studentResults(db, s) : [];

  const gradePeriods = useMemo(() => {
    const seen: string[] = [];
    for (const r of results) {
      if (!seen.includes(r.st.period)) {
        seen.push(r.st.period);
      }
    }
    return seen;
  }, [results]);

  useEffect(() => {
    if (
      gradePeriodFilter &&
      !gradePeriods.includes(gradePeriodFilter)
    ) {
      setGradePeriodFilter("");
    }
  }, [gradePeriods, gradePeriodFilter]);

  const filteredResults = gradePeriodFilter
    ? results.filter((r) => r.st.period === gradePeriodFilter)
    : results;

  const gradeGroups = useMemo(() => {
    const map = new Map<string, typeof results>();

    for (const r of filteredResults) {
      map.set(
        r.st.period,
        [...(map.get(r.st.period) ?? []), r]
      );
    }

    return [...map.entries()];
  }, [filteredResults]);

  const openDocument = async (dc: Student["documents"][number]) => {
    if (dc.storagePath) {
      try {
        const url = await getDownloadUrl(
          "student_document",
          id!,
          dc.storagePath
        );
        window.open(url, "_blank", "noopener");
      } catch (e) {
        toast(
          `Couldn't open ${dc.name}: ${
            e instanceof Error ? e.message : String(e)
          }`,
          "warn"
        );
      }
    } else if (dc.dataUrl) {
      window.open(dc.dataUrl, "_blank", "noopener");
    } else {
      toast("No preview available for this file.", "warn");
    }
  };

  /*
   * Conditional returns come ONLY after all hooks above.
   */

  if (!id) {
    return (
      <AccessDenied
        required="A valid student id"
        reason="No student record matches that address."
      />
    );
  }

  if (detailQuery.isPending) {
    return (
      <div className="mx-auto max-w-6xl">
        <SkeletonPanel rows={8} />
      </div>
    );
  }

  if (!s) {
    const why =
      currentUser?.role === "teacher"
        ? "This student isn't in any class section you teach. Teacher access follows your subject assignments."
        : currentUser?.role === "guardian"
          ? "This student isn't registered under your guardian account. Guardians can only open their own children."
          : currentUser?.role === "student"
            ? "Students can only open their own record."
            : currentUser
              ? "No student record matches that address."
              : "You need to sign in to view this record.";

    return (
      <AccessDenied
        required="A valid student id or a relationship to this student"
        reason={why}
      />
    );
  }

  const isAdmin = currentUser?.role === "admin";
  const isGuardian = currentUser?.role === "guardian";
  const enr = s.enrollment;
  const att = attendanceStats(db, s.id);
  const avg = studentAverage(db, s);
  const fees = feeStats(db, s.id);
  const teachers = teachersOfStudent(db, s);
  const homework = db.homework.filter(
    (h) =>
      h.classId === enr?.classId &&
      h.sectionId === enr?.sectionId
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Panel className="anim-rise overflow-hidden">
        <div className="relative bg-pine-900 px-4 py-4 sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border-[18px] border-pine-800/70" />

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Avatar
              student={s}
              size={56}
              className="ring-4 ring-pine-700"
            />

            <div className="min-w-0">
              <h1 className="font-display text-[21px] font-extrabold leading-tight tracking-tight text-white sm:text-[25px]">
                {fullName(s)}
              </h1>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Chip className="!border-pine-700 !bg-pine-800 font-mono !text-gold-300">
                  {s.regId}
                </Chip>

                {enr && (
                  <Chip tone="gold">
                    {sectionLabel(db, enr.classId, enr.sectionId)}
                  </Chip>
                )}

                <Chip className="!border-pine-700 !bg-pine-800 !text-pine-200">
                  {s.gender}
                </Chip>

                {!isAdmin && (
                  <Chip className="!border-pine-700 !bg-pine-800 !text-pine-200">
                    <Lock className="h-3 w-3" />
                    Read-only for {currentUser?.role}
                  </Chip>
                )}
              </div>
            </div>

            <div className="ml-auto flex gap-2">
              {isAdmin && (
                <Btn
                  variant="soft"
                  size="sm"
                  onClick={() => setIdCardOpen(true)}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  ID card
                </Btn>
              )}

              {isAdmin && (
                <Btn
                  variant="gold"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Btn>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-mist sm:grid-cols-4">
          {[
            {
              label: "Attendance",
              node: groupsLoaded ? (
                <Ring
                  pct={att.pct}
                  size={42}
                  stroke={5}
                  color={
                    att.pct >= 90
                      ? "var(--color-pine-600)"
                      : "var(--color-gold-500)"
                  }
                />
              ) : (
                <Skel className="h-[42px] w-[42px] rounded-full" />
              ),
            },
            {
              label: "Average",
              node: groupsLoaded ? (
                <span className="font-display text-[20px] font-extrabold text-pine-800 sm:text-[24px]">
                  {avg != null ? `${avg}%` : "—"}
                </span>
              ) : (
                <Skel className="h-6 w-12" />
              ),
            },
            {
              label: "Grade",
              node: groupsLoaded ? (
                <span className="font-display text-[20px] font-extrabold text-ink sm:text-[24px]">
                  {avg != null
                    ? gradeFor(avg, db.grading).grade
                    : "—"}
                </span>
              ) : (
                <Skel className="h-6 w-8" />
              ),
            },
            {
              label: "Guardian",
              node: (
                <span className="text-[13px] font-bold text-ink">
                  {guardianOfStudent(db, s.id)?.name ??
                    s.guardian.father}
                </span>
              ),
            },
          ].map((x) => (
            <div
              key={x.label}
              className="bg-card px-3.5 py-3 sm:px-4"
            >
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-soft">
                {x.label}
              </p>
              {x.node}
            </div>
          ))}
        </div>
      </Panel>

      <div className="anim-rise mt-4">
        <Tabs
          tabs={[
            {
              id: "overview",
              label: "Overview",
              icon: <UserIcon className="h-3.5 w-3.5" />,
            },
            {
              id: "grades",
              label: "Grades",
              icon: <FileBarChart2 className="h-3.5 w-3.5" />,
            },
            {
              id: "attendance",
              label: "Attendance",
              icon: <CalendarCheck2 className="h-3.5 w-3.5" />,
            },
            {
              id: "assignments",
              label: "Assignments",
              icon: <Notebook className="h-3.5 w-3.5" />,
            },
            ...(
              isAdmin || isGuardian
                ? [
                    {
                      id: "fees",
                      label: "Fees",
                      icon: <Wallet className="h-3.5 w-3.5" />,
                    },
                  ]
                : []
            ),
            {
              id: "documents",
              label: "Documents",
              icon: <Inbox className="h-3.5 w-3.5" />,
            },
            {
              id: "history",
              label: "History",
              icon: <History className="h-3.5 w-3.5" />,
            },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-4 space-y-4">
        {!groupsLoaded && tab !== "overview" ? (
          <SkeletonPanel rows={5} />
        ) : (
          <>
            {tab === "overview" && (
              <div className="anim-rise grid gap-4 md:grid-cols-3">
                <Panel className="p-5">
                  <h3 className="mb-3 font-display text-[14px] font-bold">
                    Personal
                  </h3>

                  <dl className="space-y-2.5 text-[13px]">
                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Date of birth
                      </dt>
                      <dd className="font-semibold text-ink">
                        {fmtDate(s.dob)}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Address
                      </dt>
                      <dd className="font-semibold text-ink">
                        {s.address || "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Student email
                      </dt>
                      <dd className="font-semibold text-ink">
                        {s.email || "—"}
                      </dd>
                    </div>
                  </dl>
                </Panel>

                <Panel className="p-5">
                  <h3 className="mb-3 font-display text-[14px] font-bold">
                    Family
                  </h3>

                  <dl className="space-y-2.5 text-[13px]">
                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Guardian ({s.guardian.relation})
                      </dt>
                      <dd className="font-semibold text-ink">
                        {s.guardian.father}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Mother
                      </dt>
                      <dd className="font-semibold text-ink">
                        {s.guardian.mother || "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Phone
                      </dt>
                      <dd className="font-semibold text-ink">
                        {s.guardian.phone || "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Linked account
                      </dt>
                      <dd>
                        {guardianOfStudent(db, s.id) ? (
                          <Chip tone="gold">
                            <Baby className="h-3 w-3" />
                            {guardianOfStudent(db, s.id)!.username}
                          </Chip>
                        ) : (
                          <Chip tone="gray">none</Chip>
                        )}
                      </dd>
                    </div>
                  </dl>
                </Panel>

                <Panel className="p-5">
                  <h3 className="mb-3 font-display text-[14px] font-bold">
                    Placement & teachers
                  </h3>

                  <dl className="space-y-2.5 text-[13px]">
                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Class
                      </dt>
                      <dd className="font-semibold text-ink">
                        {enr
                          ? sectionLabel(
                              db,
                              enr.classId,
                              enr.sectionId
                            )
                          : "—"}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Admitted
                      </dt>
                      <dd className="font-semibold text-ink">
                        {fmtDate(s.admission.date)} ·{" "}
                        {s.admission.type}
                      </dd>
                    </div>

                    <div>
                      <dt className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-soft">
                        Teachers
                      </dt>

                      <dd className="flex flex-wrap gap-1">
                        {teachers.map(
                          ({ teacher, subjectIds }) => (
                            <Chip
                              key={teacher.id}
                              tone="pine"
                            >
                              {teacher.name} ·{" "}
                              {subjectIds
                                .map(
                                  (x) =>
                                    getSubject(db, x)?.code
                                )
                                .join("/")}
                            </Chip>
                          )
                        )}
                      </dd>
                    </div>
                  </dl>
                </Panel>
              </div>
            )}

            {tab === "grades" && (
              <Panel className="anim-rise overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist px-5 py-3.5">
                  <div>
                    <h3 className="font-display text-[15px] font-bold">
                      Assessment results
                    </h3>
                    <p className="text-[11.5px] text-soft">
                      Totals and percentages are weighted from each
                      subject's assessment structure.
                    </p>
                  </div>

                  {gradePeriods.length > 1 && (
                    <Field label="Term" className="w-44">
                      <Select
                        value={gradePeriodFilter}
                        onChange={(e) =>
                          setGradePeriodFilter(e.target.value)
                        }
                      >
                        <option value="">All terms</option>

                        {gradePeriods.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="academic-results-table w-full min-w-[760px]">
                    <thead className="border-b border-mist bg-paper/60">
                      <tr>
                        <th
                          className={`${thCls()} whitespace-nowrap`}
                        >
                          Subject
                        </th>

                        <th
                          className={`${thCls()} min-w-[220px] whitespace-nowrap`}
                        >
                          Structure
                        </th>

                        <th
                          className={`${thCls()} w-[100px] whitespace-nowrap`}
                        >
                          %
                        </th>

                        <th
                          className={`${thCls()} w-[100px] whitespace-nowrap`}
                        >
                          Grade
                        </th>

                        <th
                          className={`${thCls()} min-w-[120px] whitespace-nowrap`}
                        >
                          Position
                        </th>
                      </tr>
                    </thead>

                    {gradeGroups.map(([period, rows]) => (
                      <tbody
                        key={period}
                        className="divide-y divide-mist/70"
                      >
                        <tr className="bg-paper/70">
                          <td
                            colSpan={5}
                            className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-soft"
                          >
                            {period}
                          </td>
                        </tr>

                        {rows.map(
                          ({ st, calc, subject }) => {
                            const ranks = structureRanks(
                              db,
                              st
                            );

                            const band = gradeFor(
                              calc.pct,
                              db.grading
                            );

                            return (
                              <tr
                                key={st.id}
                                className="transition-colors hover:bg-pine-50/50"
                              >
                                <td
                                  className={`${tdCls()} whitespace-nowrap`}
                                >
                                  <span className="flex items-center gap-2 whitespace-nowrap font-bold text-ink">
                                    <span
                                      className="h-4 w-1 shrink-0 rounded-full"
                                      style={{
                                        background:
                                          subject?.color,
                                      }}
                                    />
                                    {subject?.name}
                                  </span>
                                </td>

                                <td
                                  className={`${tdCls()} min-w-[220px] whitespace-nowrap text-[11.5px] text-soft`}
                                >
                                  {st.items
                                    .map((i) => i.name)
                                    .join(" · ")}
                                </td>

                                <td
                                  className={`${tdCls()} whitespace-nowrap font-mono text-[12.5px] font-bold ${
                                    calc.complete
                                      ? "text-pine-800"
                                      : "text-gold-600"
                                  }`}
                                >
                                  {calc.complete
                                    ? `${calc.pct}%`
                                    : "in progress"}
                                </td>

                                <td
                                  className={`${tdCls()} whitespace-nowrap`}
                                >
                                  {calc.complete ? (
                                    <Chip
                                      tone={
                                        calc.pct >= 80
                                          ? "pine"
                                          : calc.pct >= 50
                                            ? "gold"
                                            : "rust"
                                      }
                                    >
                                      {band.grade}
                                    </Chip>
                                  ) : (
                                    "—"
                                  )}
                                </td>

                                <td
                                  className={`${tdCls()} whitespace-nowrap text-soft`}
                                >
                                  {calc.complete &&
                                  ranks[s.id]
                                    ? `${ordinal(
                                        ranks[s.id]
                                      )} of ${
                                        Object.keys(ranks)
                                          .length
                                      }`
                                    : "—"}
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    ))}

                    {gradeGroups.length === 0 && (
                      <tbody>
                        <tr>
                          <td
                            colSpan={5}
                            className="px-5 py-10 text-center text-[12.5px] text-soft"
                          >
                            No assessment structures for this
                            class yet.
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </table>
                </div>
              </Panel>
            )}

            {tab === "attendance" && (
              <div className="anim-rise grid gap-4 md:grid-cols-3">
                <Panel className="flex flex-col items-center justify-center gap-2 p-6">
                  <Ring
                    pct={att.pct}
                    size={110}
                    stroke={9}
                    color={
                      att.pct >= 90
                        ? "var(--color-pine-600)"
                        : att.pct >= 75
                          ? "var(--color-gold-500)"
                          : "var(--color-rust-500)"
                    }
                  />

                  <p className="font-display text-[15px] font-bold">
                    Overall attendance
                  </p>

                  <div className="mt-1 flex gap-2">
                    <Chip tone="pine">
                      {att.present} present
                    </Chip>
                    <Chip tone="gold">
                      {att.late} late
                    </Chip>
                    <Chip tone="rust">
                      {att.absent} absent
                    </Chip>
                  </div>
                </Panel>

                <Panel className="overflow-hidden md:col-span-2">
                  <div className="border-b border-mist px-5 py-3.5">
                    <h3 className="font-display text-[15px] font-bold">
                      Register history
                    </h3>
                  </div>

                  <ul className="max-h-[360px] divide-y divide-mist/70 overflow-y-auto">
                    {db.attendance
                      .filter(
                        (r) =>
                          r.classId === enr?.classId &&
                          r.sectionId ===
                            enr?.sectionId &&
                          r.marks[s.id]
                      )
                      .sort((a, b) =>
                        b.date.localeCompare(a.date)
                      )
                      .map((r) => (
                        <li
                          key={r.date}
                          className="flex items-center justify-between px-5 py-2.5"
                        >
                          <span className="text-[13px] font-semibold text-ink">
                            {fmtDate(r.date)}
                          </span>

                          <Chip
                            tone={
                              r.marks[s.id] ===
                              "present"
                                ? "pine"
                                : r.marks[s.id] ===
                                    "late"
                                  ? "gold"
                                  : "rust"
                            }
                          >
                            {r.marks[s.id]}
                          </Chip>
                        </li>
                      ))}

                    {db.attendance.filter(
                      (r) => r.marks[s.id]
                    ).length === 0 && (
                      <li className="px-5 py-10 text-center text-[12.5px] text-soft">
                        No registers recorded yet.
                      </li>
                    )}
                  </ul>
                </Panel>
              </div>
            )}

            {tab === "assignments" && (
              <Panel className="anim-rise overflow-hidden">
                <ul className="divide-y divide-mist/70">
                  {homework.map((h) => {
                    const done =
                      h.submitted.includes(s.id);

                    return (
                      <li
                        key={h.id}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <span
                          className="h-8 w-1 shrink-0 rounded-full"
                          style={{
                            background:
                              getSubject(
                                db,
                                h.subjectId
                              )?.color,
                          }}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-bold text-ink">
                            {h.title}
                          </p>

                          <p className="text-[11.5px] text-soft">
                            {getSubject(
                              db,
                              h.subjectId
                            )?.name}{" "}
                            · issued {fmtDate(h.issued)} ·
                            due {fmtDate(h.due)}
                          </p>
                        </div>

                        <Chip
                          tone={
                            done
                              ? "pine"
                              : h.due < todayISO()
                                ? "rust"
                                : "gold"
                          }
                        >
                          {done
                            ? "Submitted"
                            : h.due < todayISO()
                              ? "Overdue"
                              : "Pending"}
                        </Chip>
                      </li>
                    );
                  })}

                  {homework.length === 0 && (
                    <li className="px-5 py-10 text-center text-[12.5px] text-soft">
                      No assignments for this class yet.
                    </li>
                  )}
                </ul>
              </Panel>
            )}

            {tab === "fees" && (
              <Panel className="anim-rise overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-mist px-4 py-3.5 sm:px-5">
                  <h3 className="font-display text-[15px] font-bold">
                    Fee ledger
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    <Chip tone="gray">
                      Billed ETB{" "}
                      {fees.billed.toLocaleString()}
                    </Chip>

                    <Chip tone="pine">
                      Paid ETB{" "}
                      {fees.paid.toLocaleString()}
                    </Chip>

                    <Chip
                      tone={
                        fees.outstanding > 0
                          ? "rust"
                          : "pine"
                      }
                    >
                      Due ETB{" "}
                      {fees.outstanding.toLocaleString()}
                    </Chip>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px]">
                    <thead className="border-b border-mist bg-paper/60">
                      <tr>
                        <th className={thCls()}>
                          Item
                        </th>
                        <th className={thCls()}>
                          Amount
                        </th>
                        <th className={thCls()}>
                          Paid
                        </th>
                        <th className={thCls()}>
                          Due
                        </th>
                        <th className={thCls()}>
                          Status
                        </th>
                        {isGuardian && (
                          <th className={thCls()}></th>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-mist/70">
                      {fees.items.map((f) => {
                        const pending =
                          pendingRequestFor(db, f.id);

                        const due =
                          f.amount - f.paid > 0;

                        return (
                          <tr key={f.id}>
                            <td
                              className={`${tdCls()} font-bold text-ink`}
                            >
                              {f.label}
                            </td>

                            <td
                              className={`${tdCls()} font-mono text-[12px]`}
                            >
                              ETB{" "}
                              {f.amount.toLocaleString()}
                            </td>

                            <td
                              className={`${tdCls()} font-mono text-[12px]`}
                            >
                              ETB{" "}
                              {f.paid.toLocaleString()}
                            </td>

                            <td
                              className={`${tdCls()} text-soft`}
                            >
                              {fmtDate(f.due)}
                            </td>

                            <td className={tdCls()}>
                              {pending ? (
                                <Chip tone="gold">
                                  Pending review
                                </Chip>
                              ) : due ? (
                                <Chip tone="rust">
                                  ETB{" "}
                                  {(
                                    f.amount - f.paid
                                  ).toLocaleString()}{" "}
                                  due
                                </Chip>
                              ) : (
                                <Chip tone="pine">
                                  Settled
                                </Chip>
                              )}
                            </td>

                            {isGuardian && (
                              <td
                                className={`${tdCls()} text-right`}
                              >
                                {due && !pending && (
                                  <Btn
                                    size="sm"
                                    variant="soft"
                                    onClick={() =>
                                      setPayItem(f)
                                    }
                                  >
                                    <Wallet className="h-3.5 w-3.5" />
                                    Pay
                                  </Btn>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {tab === "documents" && (
              <Panel className="anim-rise overflow-hidden">
                <ul className="divide-y divide-mist/70">
                  {s.documents.map((dc) => (
                    <li
                      key={dc.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pine-100 text-pine-700">
                        <Notebook className="h-4 w-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-ink">
                          {dc.name}
                        </p>

                        <p className="text-[11px] text-soft">
                          {dc.kind} · {dc.size} ·{" "}
                          {fmtDate(dc.date)}
                        </p>
                      </div>

                      <Chip tone="gray">
                        {dc.kind}
                      </Chip>

                      {(dc.storagePath || dc.dataUrl) && (
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => openDocument(dc)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Open
                        </Btn>
                      )}
                    </li>
                  ))}

                  {s.documents.length === 0 && (
                    <li className="px-5 py-10 text-center text-[12.5px] text-soft">
                      No documents on file.
                    </li>
                  )}
                </ul>
              </Panel>
            )}

            {tab === "history" && (
              <Panel className="anim-rise p-6">
                <h3 className="mb-1 font-display text-[15px] font-bold">
                  Academic history
                </h3>

                <p className="mb-5 text-[12px] text-soft">
                  Placements are appended each year — the
                  record is never overwritten.
                </p>

                <ol className="relative ml-3 space-y-5 border-l-2 border-pine-200 pl-6">
                  {[...s.history]
                    .sort((a, b) =>
                      a.yearId.localeCompare(b.yearId)
                    )
                    .map((h, i, arr) => {
                      const yr = db.years.find(
                        (y) => y.id === h.yearId
                      );

                      const current =
                        i === arr.length - 1;

                      return (
                        <li
                          key={h.yearId + i}
                          className="relative"
                        >
                          <span
                            className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full border-4 ${
                              current
                                ? "border-gold-300 bg-gold-500"
                                : "border-pine-200 bg-pine-600"
                            }`}
                          />

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[12px] font-bold text-pine-700">
                              {yr?.name}
                            </span>

                            <span className="font-display text-[15px] font-bold text-ink">
                              {sectionLabel(
                                db,
                                h.classId,
                                h.sectionId
                              )}
                            </span>

                            {current && (
                              <Chip tone="gold">
                                Current year
                              </Chip>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ol>
              </Panel>
            )}
          </>
        )}
      </div>

      {editOpen && isAdmin && (
        <RegistrationWizard
          student={s}
          onClose={() => setEditOpen(false)}
        />
      )}

      {idCardOpen && (
        <IDCardModal
          student={s}
          onClose={() => setIdCardOpen(false)}
        />
      )}

      {payItem && (
        <PayFeeModal
          student={s}
          item={payItem}
          onClose={() => setPayItem(null)}
        />
      )}
    </div>
  );
}
