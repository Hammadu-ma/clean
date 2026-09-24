import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Compass } from "lucide-react";
import { AppProvider, homePathFor, useApp } from "./store";
import type { Role } from "./types";
import { AppShell } from "./Layout";
import { AccessDenied, LoginPage } from "./pages/Auth";
import { SkeletonCards, SkeletonPanel } from "./ui";

/**
 * Route-level code splitting: only the login screen + shell are in the
 * initial bundle. Everything below (including the heavy recharts/jspdf/
 * dnd-kit-using academics page) is fetched on first navigation to a route
 * that needs it, not before — this is what actually gates first paint.
 *
 * Each page module is dynamic-import()'d once per named export below, but
 * the bundler/browser dedupes repeat import() calls to the same resolved
 * chunk, so e.g. all seven `./pages/people` exports still cost one fetch.
 */
const CHUNK_RECOVERY_KEY = "sms_chunk_recovery_once";

function named<M extends Record<string, any>>(loader: () => Promise<M>) {
  const loadWithRecovery = async () => {
    try {
      return await loader();
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      const isChunkFailure = /dynamically imported module|failed to fetch.*module|mime type.*text\/html/i.test(message);
      if (isChunkFailure) {
        try {
          if (!sessionStorage.getItem(CHUNK_RECOVERY_KEY)) {
            sessionStorage.setItem(CHUNK_RECOVERY_KEY, "1");
            const url = new URL(window.location.href);
            url.searchParams.set("_chunk_recovery", String(Date.now()));
            window.location.replace(url.toString());
            return await new Promise<M>(() => { /* navigation replaces this document */ });
          }
          sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
        } catch {
          // If storage is unavailable, let React surface the real loader error.
        }
      }
      throw error;
    }
  };

  return new Proxy({} as { [K in keyof M]: M[K] }, {
    get: (_t, key: string) => lazy(() => loadWithRecovery().then((m) => ({ default: m[key] }))),
  });
}

const dashboards = named(() => import("./pages/dashboards"));
const { AdminDashboard, GuardianDashboard, StudentDashboard, TeacherDashboard } = dashboards;

const people = named(() => import("./pages/people"));
const { FamiliesPage, GuardianFeesPage, ProfilePage, StudentProfilePage, StudentsPage, TeachersPage, UsersPage } = people;

const academics = named(() => import("./pages/academics"));
const {
  AssignmentsPage, AttendancePage, AcademicYearsPage, GradeConfigurationPage, ClassesPage, FeesPage, HomeworkPage, MarkEntryPage, ReportsPage, TimetablePage,
} = academics;

const communication = named(() => import("./pages/communication"));
const { AnnouncementsPage, ContactsPage, EventsPage, MessagesPage, ModerationPage, NotificationsPage } = communication;

const admin = named(() => import("./pages/admin"));
const { AuditPage, RolesPage } = admin;

/** Suspense fallback for a lazy page chunk still downloading. Mirrors the
 *  page's eventual layout (a stat row + a content panel) with shimmering
 *  placeholders instead of a spinner, so the shell doesn't jump/reflow once
 *  the real content lands. */
function PageLoading() {
  return (
    <div className="anim-rise p-4 sm:p-6">
      <div className="mb-4">
        <SkeletonCards n={4} />
      </div>
      <SkeletonPanel rows={6} />
    </div>
  );
}

/** Shown briefly while the initial Supabase session check is still in
 *  flight — avoids redirecting an already-signed-in person to /login just
 *  because currentUser hasn't resolved yet on this render. */
function CheckingSession() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-pine-200 border-t-pine-700" />
    </div>
  );
}

/** Route-level authorization: checks the signed-in role, blocks everything else. */
function Guard({ roles, required, children }: { roles: Role[]; required?: string; children: ReactNode }) {
  const { currentUser, sessionChecked } = useApp();
  if (!sessionChecked) return <CheckingSession />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!roles.includes(currentUser.role)) {
    return <AccessDenied required={required ?? roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(" / ")} />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { currentUser, sessionChecked } = useApp();
  if (!sessionChecked) return <CheckingSession />;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={homePathFor(currentUser.role)} replace />;
}

function NotFound() {
  const { currentUser } = useApp();
  return (
    <AccessDenied
      required="A valid route"
      reason={
        currentUser
          ? "That address doesn't exist in the system. If you followed a link, it may have pointed to a section your role can't reach."
          : "Sign in to reach the school management system."
      }
    />
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<AppShell />}>
            {/* shared across all authenticated roles — communication (relationship-checked inside) */}
            <Route path="/announcements" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="Any signed-in user"><AnnouncementsPage /></Guard>} />
            <Route path="/messages" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="Any signed-in user"><MessagesPage /></Guard>} />
            <Route path="/messages/:id" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="Any signed-in user"><MessagesPage /></Guard>} />
            <Route path="/notifications" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="Any signed-in user"><NotificationsPage /></Guard>} />
            <Route path="/events" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="Any signed-in user"><EventsPage /></Guard>} />
            <Route path="/contacts" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="Any signed-in user"><ContactsPage /></Guard>} />
            <Route path="/moderation" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="communication.moderate permission"><ModerationPage /></Guard>} />
            <Route path="/profile" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="Any signed-in user"><ProfilePage /></Guard>} />

            {/*
              system administration & the /admin/* pages below: guarded here
              by "any signed-in role" rather than roles={["admin"]} — each of
              these components already does its own internal
              hasPermission()/relationship check (verified: roles.manage,
              audit.view, students.view, teachers.view, families.view,
              academics.view/manage_years, exams.view, assignments.view,
              homework.view, results.view, attendance.view, fees.view,
              users.manage), which is the REAL gate. Previously this literal
              roles={["admin"]} wrapper meant a custom role built on "teacher"
              or "guardian" could be granted e.g. students.view directly and
              still never reach the page that permission is for — the
              sidebar (Layout.tsx) only ever showed items from a fixed list
              per base role, and even a fixed sidebar link would have hit
              this exact wall. Scaling a role's permissions up now actually
              unlocks the matching page instead of silently doing nothing.
              /admin/dashboard is deliberately NOT included: AdminDashboard
              has no internal permission check of its own (it's a pure
              aggregate-stats view with no single permission it naturally
              maps to), so loosening it would remove its only access check
              entirely rather than replace it with a better one.
            */}
            <Route path="/admin/roles" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="roles.manage permission"><RolesPage /></Guard>} />
            <Route path="/admin/audit" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="audit.view permission"><AuditPage /></Guard>} />

            {/* administrator */}
            <Route path="/admin/dashboard" element={<Guard roles={["admin"]} required="Administrator"><AdminDashboard /></Guard>} />
            <Route path="/admin/students" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="students.view permission"><StudentsPage /></Guard>} />
            <Route path="/admin/students/:id" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="A relationship to this student, or students.view"><StudentProfilePage /></Guard>} />
            <Route path="/admin/teachers" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="teachers.view permission"><TeachersPage /></Guard>} />
            <Route path="/admin/families" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="families.view permission"><FamiliesPage /></Guard>} />
            <Route path="/admin/classes" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="academics.view permission"><ClassesPage /></Guard>} />
            <Route path="/admin/academic-years" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="academics.manage_years permission"><AcademicYearsPage /></Guard>} />
            <Route path="/admin/grade-configuration" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="academics.manage_years permission"><GradeConfigurationPage /></Guard>} />
            <Route path="/admin/timetable" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="academics.view permission"><TimetablePage /></Guard>} />
            <Route path="/admin/marks" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="exams.view permission"><MarkEntryPage /></Guard>} />
            <Route path="/admin/assignments" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="assignments.view permission"><AssignmentsPage /></Guard>} />
            <Route path="/admin/homework" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="homework.view permission"><HomeworkPage /></Guard>} />
            <Route path="/admin/reports" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="results.view permission"><ReportsPage /></Guard>} />
            <Route path="/admin/attendance" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="attendance.view permission"><AttendancePage /></Guard>} />
            <Route path="/admin/fees" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="fees.view permission"><FeesPage /></Guard>} />
            <Route path="/admin/users" element={<Guard roles={["admin", "teacher", "student", "guardian"]} required="users.manage permission"><UsersPage /></Guard>} />

            {/* teacher — scoped to assigned classes/students inside each page */}
            <Route path="/teacher/dashboard" element={<Guard roles={["teacher"]} required="Teacher"><TeacherDashboard /></Guard>} />
            <Route path="/teacher/classes" element={<Guard roles={["teacher"]} required="Teacher"><ClassesPage scoped /></Guard>} />
            <Route path="/teacher/students" element={<Guard roles={["teacher"]} required="Teacher"><StudentsPage scoped /></Guard>} />
            <Route path="/teacher/students/:id" element={<Guard roles={["teacher"]} required="Teacher"><StudentProfilePage /></Guard>} />
            <Route path="/teacher/attendance" element={<Guard roles={["teacher"]} required="Teacher"><AttendancePage /></Guard>} />
            <Route path="/teacher/marks" element={<Guard roles={["teacher"]} required="Teacher"><MarkEntryPage /></Guard>} />
            <Route path="/teacher/assignments" element={<Guard roles={["teacher"]} required="Teacher"><AssignmentsPage /></Guard>} />
            <Route path="/teacher/homework" element={<Guard roles={["teacher"]} required="Teacher"><HomeworkPage /></Guard>} />

            {/* student — own records only */}
            <Route path="/student/dashboard" element={<Guard roles={["student"]} required="Student"><StudentDashboard /></Guard>} />
            <Route path="/student/classes" element={<Guard roles={["student"]} required="Student"><ClassesPage scoped /></Guard>} />
            <Route path="/student/grades" element={<Guard roles={["student"]} required="Student"><ReportsPage /></Guard>} />
            <Route path="/student/attendance" element={<Guard roles={["student"]} required="Student"><AttendancePage /></Guard>} />
            <Route path="/student/assignments" element={<Guard roles={["student"]} required="Student"><AssignmentsPage /></Guard>} />
            <Route path="/student/homework" element={<Guard roles={["student"]} required="Student"><HomeworkPage /></Guard>} />

            {/* guardian — registered children only */}
            <Route path="/guardian/dashboard" element={<Guard roles={["guardian"]} required="Guardian"><GuardianDashboard /></Guard>} />
            <Route path="/guardian/children" element={<Guard roles={["guardian"]} required="Guardian"><StudentsPage scoped /></Guard>} />
            <Route path="/guardian/children/:id" element={<Guard roles={["guardian"]} required="Guardian"><StudentProfilePage /></Guard>} />
            <Route path="/guardian/grades" element={<Guard roles={["guardian"]} required="Guardian"><ReportsPage /></Guard>} />
            <Route path="/guardian/attendance" element={<Guard roles={["guardian"]} required="Guardian"><AttendancePage /></Guard>} />
            <Route path="/guardian/fees" element={<Guard roles={["guardian"]} required="Guardian"><GuardianFeesPage /></Guard>} />
            <Route path="/guardian/assignments" element={<Guard roles={["guardian"]} required="Guardian"><AssignmentsPage /></Guard>} />
            <Route path="/guardian/homework" element={<Guard roles={["guardian"]} required="Guardian"><HomeworkPage /></Guard>} />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        </Suspense>
      </HashRouter>
    </AppProvider>
  );
}
