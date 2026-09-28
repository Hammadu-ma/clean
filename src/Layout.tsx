import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Banknote, Bell, CalendarCheck2, CalendarDays, CalendarRange, Settings2, ClipboardList, Clock as ClockIcon, FileBarChart2, GraduationCap,
  HeartHandshake, History, Inbox, KeyRound, LayoutDashboard, Layers, Megaphone, Menu,
  ShieldAlert, ShieldCheck, Table2, Users, X, Contact,
  AlertTriangle, Check, ChevronDown, User, BookOpen, Baby, PenLine,
} from "lucide-react";
import { homePathFor, timeAgo, useApp, useLazyGroups } from "./store";
import { useAdminPendingFeePayments } from "./lib/api";
import { hasPermission, totalUnreadMessages, unreadNotifications } from "./rbac";
import { Chip, RoleBadge, SchoolLogo, UserAvatar } from "./ui";
import type { AppNotification, Role } from "./types";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Optional Level-1 permission gate — the item is hidden without it. */
  perm?: string;
  /** Extra path prefixes that should keep this item highlighted. */
  match?: string[];
}
interface NavGroup {
  group: string;
  items: NavItem[];
}

// Messages, Notifications, Announcements and Events live under one hub with
// its own tab bar (see CommShell in pages/communication.tsx) — the sidebar
// only needs a single entry that stays highlighted on any of them.
const COMM_PATHS = ["/messages", "/notifications", "/announcements", "/events"];
const COMM_ITEMS: NavItem[] = [
  { to: "/messages", label: "Inbox & updates", icon: <Inbox className="h-4 w-4" />, perm: "communication.view", match: COMM_PATHS },
];

const NAV: Record<Role, NavGroup[]> = {
  admin: [
    { group: "Front office", items: [{ to: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> }] },
    {
      group: "People",
      items: [
        { to: "/admin/students", label: "Students", icon: <Users className="h-4 w-4" />, perm: "students.view" },
        { to: "/admin/teachers", label: "Teachers", icon: <Contact className="h-4 w-4" />, perm: "teachers.view" },
        { to: "/admin/families", label: "Families", icon: <HeartHandshake className="h-4 w-4" />, perm: "families.view" },
      ],
    },
    {
      group: "Academics",
      items: [
        { to: "/admin/academic-years", label: "Academic years", icon: <CalendarRange className="h-4 w-4" />, perm: "academics.manage_years" },
        { to: "/admin/grade-configuration", label: "Grade configuration", icon: <Settings2 className="h-4 w-4" />, perm: "academics.manage_years" },
        { to: "/admin/classes", label: "Classes & sections", icon: <Layers className="h-4 w-4" />, perm: "academics.view" },
        { to: "/admin/timetable", label: "Timetable", icon: <ClockIcon className="h-4 w-4" />, perm: "academics.view" },
        { to: "/admin/marks", label: "Mark entry", icon: <Table2 className="h-4 w-4" />, perm: "exams.view" },
        { to: "/admin/assignments", label: "Assignments", icon: <ClipboardList className="h-4 w-4" />, perm: "assignments.view" },
        { to: "/admin/homework", label: "Homework", icon: <PenLine className="h-4 w-4" />, perm: "homework.view" },
        { to: "/admin/reports", label: "Reports", icon: <FileBarChart2 className="h-4 w-4" />, perm: "results.view" },
      ],
    },
    {
      group: "Administration",
      items: [
        { to: "/admin/attendance", label: "Attendance", icon: <CalendarCheck2 className="h-4 w-4" />, perm: "attendance.view" },
        { to: "/admin/fees", label: "Fees", icon: <Banknote className="h-4 w-4" />, perm: "fees.view" },
        { to: "/admin/users", label: "Users & roles", icon: <ShieldCheck className="h-4 w-4" />, perm: "users.manage" },
        { to: "/admin/roles", label: "Roles & permissions", icon: <KeyRound className="h-4 w-4" />, perm: "roles.manage" },
        { to: "/admin/audit", label: "Audit log", icon: <History className="h-4 w-4" />, perm: "audit.view" },
        { to: "/admin/settings", label: "School settings", icon: <Settings2 className="h-4 w-4" />, perm: "settings.manage" },
      ],
    },
    { group: "Communication", items: [...COMM_ITEMS, { to: "/moderation", label: "Moderation", icon: <ShieldAlert className="h-4 w-4" />, perm: "communication.moderate" }] },
    { group: "Account", items: [{ to: "/profile", label: "My profile", icon: <User className="h-4 w-4" /> }] },
  ],
  teacher: [
    { group: "Overview", items: [{ to: "/teacher/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> }] },
    {
      group: "Teaching",
      items: [
        { to: "/teacher/classes", label: "My classes", icon: <Layers className="h-4 w-4" />, perm: "academics.view" },
        { to: "/admin/timetable", label: "Timetable", icon: <ClockIcon className="h-4 w-4" />, perm: "academics.view" },
        { to: "/teacher/students", label: "My students", icon: <Users className="h-4 w-4" />, perm: "students.view_assigned" },
        { to: "/teacher/attendance", label: "Attendance", icon: <CalendarCheck2 className="h-4 w-4" />, perm: "attendance.view" },
        { to: "/teacher/marks", label: "Mark entry", icon: <Table2 className="h-4 w-4" />, perm: "exams.view" },
        { to: "/teacher/assignments", label: "Assignments", icon: <ClipboardList className="h-4 w-4" />, perm: "assignments.view" },
        { to: "/teacher/homework", label: "Homework", icon: <PenLine className="h-4 w-4" />, perm: "homework.view" },
      ],
    },
    { group: "Communication", items: COMM_ITEMS },
    { group: "Account", items: [{ to: "/profile", label: "My profile", icon: <User className="h-4 w-4" /> }] },
  ],
  student: [
    { group: "Overview", items: [{ to: "/student/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> }] },
    {
      group: "Learning",
      items: [
        { to: "/student/classes", label: "My classes", icon: <BookOpen className="h-4 w-4" />, perm: "academics.view" },
        { to: "/admin/timetable", label: "Timetable", icon: <ClockIcon className="h-4 w-4" />, perm: "academics.view" },
        { to: "/student/grades", label: "My grades", icon: <FileBarChart2 className="h-4 w-4" />, perm: "results.view_self" },
        { to: "/student/attendance", label: "My attendance", icon: <CalendarCheck2 className="h-4 w-4" />, perm: "attendance.view" },
        { to: "/student/assignments", label: "My assignments", icon: <PenLine className="h-4 w-4" />, perm: "assignments.view" },
        { to: "/student/homework", label: "My homework", icon: <ClipboardList className="h-4 w-4" />, perm: "homework.view" },
      ],
    },
    { group: "Communication", items: COMM_ITEMS },
    { group: "Account", items: [{ to: "/profile", label: "My profile", icon: <User className="h-4 w-4" /> }] },
  ],
  guardian: [
    { group: "Overview", items: [{ to: "/guardian/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> }] },
    {
      group: "Family",
      items: [
        { to: "/guardian/children", label: "My children", icon: <Baby className="h-4 w-4" />, perm: "students.view_children" },
        { to: "/admin/timetable", label: "Timetable", icon: <ClockIcon className="h-4 w-4" />, perm: "academics.view" },
        { to: "/guardian/grades", label: "Grades", icon: <FileBarChart2 className="h-4 w-4" />, perm: "results.view_children" },
        { to: "/guardian/attendance", label: "Attendance", icon: <CalendarCheck2 className="h-4 w-4" />, perm: "attendance.view_children" },
        { to: "/guardian/fees", label: "Fees", icon: <Banknote className="h-4 w-4" />, perm: "fees.view_children" },
        { to: "/guardian/assignments", label: "Assignments", icon: <PenLine className="h-4 w-4" />, perm: "assignments.view" },
        { to: "/guardian/homework", label: "Homework", icon: <ClipboardList className="h-4 w-4" />, perm: "homework.view" },
      ],
    },
    { group: "Communication", items: COMM_ITEMS },
    { group: "Account", items: [{ to: "/profile", label: "My profile", icon: <User className="h-4 w-4" /> }] },
  ],
};

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden text-right leading-tight md:block">
      <p className="tnum font-mono text-[12.5px] font-semibold text-ink">
        {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-soft">
        {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
      </p>
    </div>
  );
}

export function AppShell() {
  const { db, currentUser, yearId, setYear, ui, dismissToast, update } = useApp();
  // Notifications are global header state, so keep exactly one live notification
  // loader mounted from the shell rather than creating another SSE stream on the
  // notifications page itself.
  const notificationsLoaded = useLazyGroups("notifications");
  const [incomingNotification, setIncomingNotification] = useState<AppNotification | null>(null);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const notificationWatcherReadyRef = useRef(false);
  const notificationUserIdRef = useRef<string | null>(null);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show a polished in-app popup when a genuinely new notification arrives
  // while the app is open. The first hydrated notification batch is marked as
  // seen so existing notifications never flash as if they were new.
  useEffect(() => {
    if (!notificationsLoaded || !currentUser) return;
    const currentIds = new Set(db.notifications.filter((n) => n.userId === currentUser.id).map((n) => n.id));
    if (notificationUserIdRef.current !== currentUser.id) {
      notificationUserIdRef.current = currentUser.id;
      seenNotificationIdsRef.current = currentIds;
      notificationWatcherReadyRef.current = true;
      setIncomingNotification(null);
      return;
    }
    if (!notificationWatcherReadyRef.current) {
      seenNotificationIdsRef.current = currentIds;
      notificationWatcherReadyRef.current = true;
      return;
    }

    const fresh = db.notifications
      .filter((n) => n.userId === currentUser.id && !seenNotificationIdsRef.current.has(n.id))
      .sort((a, b) => a.at.localeCompare(b.at));

    seenNotificationIdsRef.current = currentIds;
    if (!fresh.length) return;

    const newest = fresh[fresh.length - 1];
    setIncomingNotification(newest);
    if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
    incomingTimerRef.current = setTimeout(() => setIncomingNotification(null), 6500);

    return () => {
      if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
    };
  }, [db.notifications, currentUser?.id, notificationsLoaded]);
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // any navigation closes the drawer; also scrolls to top
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  useEffect(() => {
    document.title = db.settings.schoolName?.trim() || "School Management System";
  }, [db.settings.schoolName]);

  const toastId = ui.toast?.id;
  useEffect(() => {
    if (!toastId) return;
    const t = setTimeout(dismissToast, 3400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastId]);

  if (!currentUser) return <Navigate to="/login" replace />;

  // Each role's own list first — unchanged from before, so the ordinary
  // case (someone with exactly their role's usual permissions) looks
  // exactly like it always has.
  const ownGroups = NAV[currentUser.role];

  // Additive extras: a custom role can be granted permissions beyond what
  // its base role (admin/teacher/student/guardian) normally has — e.g. a
  // "teacher" profile granted the admin-level students.view. Previously
  // the sidebar only ever showed items from NAV[currentUser.role]'s fixed
  // list, so a scaled-up permission had nothing to attach a link to: it
  // could only ever hide items the role's own list already had, never add
  // one from outside it. This scans every OTHER role's item list (the
  // *only* places those extra pages' links live) for anything not already
  // in ownGroups, and includes it if the permission that gates it is
  // actually held — matched against src/App.tsx's now permission-checked
  // /admin/* routes, so a link that appears here is guaranteed to actually
  // open rather than immediately 403.
  const ownPaths = new Set(ownGroups.flatMap((g) => g.items.map((it) => it.to)));
  // "Additional access" should mean genuinely new capability — a
  // permission this role doesn't normally carry. Several /admin/* pages
  // (attendance, marks, assignments, homework, reports) render 100%
  // identically regardless of which URL reaches them — they branch on
  // currentUser.role internally, never take a `scoped` prop the way
  // ClassesPage/StudentsPage do (checked against src/App.tsx's routes) —
  // and every one of them is gated by the exact same permission string as
  // the matching item already in ownGroups (e.g. attendance.view gates
  // both /teacher/attendance and /admin/attendance). So *every* teacher,
  // with nothing scaled up at all, was seeing these listed as "additional"
  // — not because they'd been granted anything extra, but because their
  // completely ordinary default permission happens to gate both the
  // scoped and unscoped variant. Excluding any permission already used
  // somewhere in ownGroups fixes that false-positive case while still
  // correctly surfacing a real grant — e.g. a teacher given the
  // admin-level students.view (their own bucket only ever uses the
  // different string students.view_assigned) still shows up, since that
  // permission genuinely isn't part of what a teacher normally has.
  const ownPerms = new Set(ownGroups.flatMap((g) => g.items.map((it) => it.perm)).filter((p): p is string => !!p));
  const seenExtra = new Set<string>();
  const extraItems = (Object.keys(NAV) as Role[])
    .filter((r) => r !== currentUser.role)
    .flatMap((r) => NAV[r].flatMap((g) => g.items))
    .filter((it) => {
      if (!it.to.startsWith("/admin/")) return false; // only /admin/* was actually loosened in App.tsx — anything else would 403 regardless
      if (ownPaths.has(it.to) || seenExtra.has(it.to)) return false;
      if (!it.perm || ownPerms.has(it.perm) || !hasPermission(db, currentUser, it.perm)) return false;
      seenExtra.add(it.to);
      return true;
    });
  const groups = extraItems.length ? [...ownGroups, { group: "Additional access", items: extraItems }] : ownGroups;

  const unreadMsgs = totalUnreadMessages(db, currentUser);
  const unreadNotifs = unreadNotifications(db, currentUser);
  const pendingFeePayments = useAdminPendingFeePayments(yearId, currentUser?.role === "admin");
  const year = db.years.find((y) => y.id === yearId);

  const sidebar = (
    <div className="flex h-full w-[240px] flex-col bg-pine-950 text-pine-100"
      style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0 2px, transparent 2px 4px)" }}>
      <button onClick={() => nav(homePathFor(currentUser.role))} className="flex cursor-pointer items-center gap-3 px-5 pb-4 pt-5 text-left">
        <SchoolLogo settings={db.settings} size={40} />
        <span>
          <span className="font-display block max-w-[150px] truncate text-[15px] font-extrabold leading-none tracking-tight text-white">{db.settings.schoolName || "School"}</span>
          <span className="mt-1 block max-w-[150px] truncate text-[9.5px] font-semibold uppercase tracking-[0.18em] text-pine-300">{db.settings.motto || "School portal"}</span>
        </span>
      </button>

      <div className="mx-4 mb-3 flex items-center justify-between rounded-lg border border-pine-800 bg-pine-900/70 px-3 py-2">
        <span className="font-mono text-[11px] font-semibold text-gold-300">AY {year?.name}</span>
        <span className="flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-pine-300">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-gold-400" /> {year?.active ? "Active" : "Archived"}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => {
          const items = g.items.filter((it) => !it.perm || hasPermission(db, currentUser, it.perm));
          if (!items.length) return null;
          return (
            <div key={g.group} className="mt-3">
              <p className="px-2 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.2em] text-pine-400/80">{g.group}</p>
              {items.map((it) => {
                const badge =
                  it.to === "/messages" && unreadMsgs + unreadNotifs > 0 ? unreadMsgs + unreadNotifs
                  : it.to === "/admin/fees" && pendingFeePayments > 0 ? pendingFeePayments
                  : 0;
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    className={({ isActive: routeActive }) => {
                      const isActive = routeActive || (it.match?.some((m) => loc.pathname === m || loc.pathname.startsWith(`${m}/`)) ?? false);
                      return `group relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-all duration-150 ${
                        isActive ? "bg-pine-800 text-white shadow-sm" : "text-pine-200/85 hover:bg-pine-900 hover:text-white"
                      }`;
                    }}
                  >
                    {({ isActive: routeActive }) => {
                      const isActive = routeActive || (it.match?.some((m) => loc.pathname === m || loc.pathname.startsWith(`${m}/`)) ?? false);
                      return (
                      <>
                        {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-gold-400" />}
                        <span className={isActive ? "text-gold-400" : "text-pine-400 group-hover:text-pine-200"}>{it.icon}</span>
                        <span className="flex-1">{it.label}</span>
                        {badge > 0 && <span className="live-dot rounded-full bg-gold-400 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-pine-950">{badge}</span>}
                      </>
                      );
                    }}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-pine-800/80 p-3">
        <p className="px-2.5 text-[10px] text-pine-500">{db.settings.schoolName || "School"}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-[240px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-pine-950/60" onClick={() => setMobileOpen(false)} />
          <div className="anim-rise absolute inset-y-0 left-0">{sidebar}</div>
          <button onClick={() => setMobileOpen(false)} className="absolute left-[248px] top-4 cursor-pointer rounded-lg bg-pine-800 p-2 text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-mist bg-card/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="cursor-pointer rounded-lg border border-mist p-2 text-soft transition-colors hover:border-pine-400 hover:text-pine-700 lg:hidden" aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-[10.5px] font-bold uppercase tracking-[0.14em] text-soft md:block">Academic year</span>
            <div className="relative">
              <select
                value={yearId}
                onChange={(e) => setYear(e.target.value)}
                className="cursor-pointer appearance-none rounded-lg border border-pine-300 bg-pine-50 py-1.5 pl-2.5 pr-7 font-mono text-[11.5px] font-semibold text-pine-800 outline-none transition-colors hover:border-pine-500 sm:pl-3 sm:pr-8 sm:text-[12.5px]"
              >
                {db.years.map((y) => (
                  <option key={y.id} value={y.id}>{y.name}{y.active ? " · active" : ""}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-pine-600 sm:right-2" />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Clock />
            <span className="hidden h-6 w-px bg-mist md:block" />
            <NavLink
              to="/notifications"
              aria-label={unreadNotifs > 0 ? `${unreadNotifs} unread notifications` : "Notifications"}
              title={unreadNotifs > 0 ? `${unreadNotifs} unread notifications` : "Notifications"}
              className={({ isActive }) =>
                `relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-colors ${
                  isActive ? "border-pine-300 bg-pine-50 text-pine-700" : "border-mist text-soft hover:border-pine-300 hover:bg-pine-50 hover:text-pine-700"
                }`
              }
            >
              <Bell className="h-4 w-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[17px] rounded-full bg-rust-500 px-1 text-center font-mono text-[9px] font-extrabold leading-[17px] text-white shadow-sm ring-2 ring-card">
                  {unreadNotifs > 99 ? "99+" : unreadNotifs}
                </span>
              )}
            </NavLink>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      {incomingNotification && (
        <div className="pointer-events-none fixed left-4 right-4 top-4 z-[80] sm:left-auto sm:right-5 sm:w-[380px]">
          <button
            type="button"
            onClick={() => {
              const n = incomingNotification;
              void update((d) => {
                const item = d.notifications.find((x) => x.id === n.id && x.userId === currentUser?.id);
                if (item) item.read = true;
              });
              setIncomingNotification(null);
              nav(n.targetRoute || "/notifications");
            }}
            className="pointer-events-auto group w-full cursor-pointer rounded-2xl border border-pine-200 bg-card px-4 py-3.5 text-left shadow-2xl ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.16)]"
            aria-label="Open new notification"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pine-900 text-gold-400 shadow-sm">
                <Bell className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-pine-700">New notification</span>
                  <span className="shrink-0 text-[10px] font-semibold text-soft">{timeAgo(incomingNotification.at)}</span>
                </span>
                <span className="mt-1 block truncate text-[13.5px] font-extrabold text-ink">{incomingNotification.title}</span>
                <span className="mt-0.5 block max-h-10 overflow-hidden text-[12px] leading-relaxed text-soft">{incomingNotification.body}</span>
                <span className="mt-2 block text-[11px] font-bold text-pine-700 transition-colors group-hover:text-pine-900">Tap to view →</span>
              </span>
            </div>
          </button>
        </div>
      )}

      {ui.toast && (
        <div key={ui.toast.id} className="anim-toast fixed bottom-4 left-4 right-4 z-[70] sm:bottom-5 sm:left-auto sm:right-5">
          <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-xl ${ui.toast.tone === "ok" ? "border-pine-800 bg-pine-900 text-pine-50" : "border-rust-700 bg-rust-600 text-white"}`}>
            {ui.toast.tone === "ok" ? <Check className="h-4 w-4 text-gold-400" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="text-[13px] font-semibold">{ui.toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
