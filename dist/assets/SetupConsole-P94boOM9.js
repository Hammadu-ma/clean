import{j as e}from"./vendor-query-C3IBDsPT.js";import{a}from"./vendor-react-BKP_Udqj.js";import{c as r,u as k,B as $,bI as q}from"./index-BIpjtHdG.js";import{C as f}from"./check-circle-2-De5dXkMA.js";/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=r("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=r("Database",[["ellipse",{cx:"12",cy:"5",rx:"9",ry:"3",key:"msslwz"}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5",key:"1wlel7"}],["path",{d:"M3 12A9 3 0 0 0 21 12",key:"mv7ke4"}]]);/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=r("ExternalLink",[["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}],["polyline",{points:"15 3 21 3 21 9",key:"mznyad"}],["line",{x1:"10",x2:"21",y1:"14",y2:"3",key:"18c3s4"}]]);/**
 * @license lucide-react v0.294.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=r("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]),A=`-- ===========================================================================
-- Riverside School Management System — 0001_schema.sql
-- Relational core. Text PKs preserve the application's existing identifiers
-- (st1, sec8b, as-bio8s1 …); uuid PKs are reserved for auth-linked and
-- high-churn rows (profiles, messages, notifications, audit).
-- Idempotent: safe to re-run. Never drops data.
-- ===========================================================================

create extension if not exists pgcrypto;

/* ---------------- school & academic calendar ---------------- */

create table if not exists public.schools (
  id          text primary key,
  name        text not null,
  motto       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.academic_years (
  id          text primary key,
  school_id   text not null references public.schools(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date > start_date)
);
-- Only one active year at a time.
create unique index if not exists uq_one_active_year
  on public.academic_years (school_id) where is_active;

create table if not exists public.terms (
  id          text primary key,
  year_id     text not null references public.academic_years(id) on delete cascade,
  name        text not null,
  seq         integer not null default 0,
  unique (year_id, name)
);

/* ---------------- structure: classes / sections / subjects ---------------- */

create table if not exists public.classes (
  id          text primary key,
  school_id   text not null references public.schools(id) on delete cascade,
  name        text not null,
  level       integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.sections (
  id          text primary key,
  class_id    text not null references public.classes(id) on delete cascade,
  name        text not null,
  unique (class_id, name)
);

create table if not exists public.subjects (
  id          text primary key,
  school_id   text not null references public.schools(id) on delete cascade,
  code        text not null,
  name        text not null,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, code)
);

create table if not exists public.teachers (
  id          text primary key,
  school_id   text not null references public.schools(id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  specialty   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

/* ---------------- people ---------------- */

create table if not exists public.students (
  id              text primary key,
  school_id       text not null references public.schools(id) on delete cascade,
  reg_no          text not null,
  admission_no    text,
  first_name      text not null,
  middle_name     text,
  last_name       text not null,
  gender          text not null check (gender in ('Male','Female')),
  dob             date not null,
  phone           text,
  email           text,
  address         text,
  status          text not null default 'active'
                  check (status in ('active','transferred','withdrawn','graduated')),
  guardian_name   text,
  guardian_relation text,
  guardian_phone  text,
  guardian_address text,
  mother_name     text,
  admission_date  date,
  previous_school text,
  admission_type  text,
  photo_path      text,            -- Storage: profile-photos/{student_id}/photo
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (school_id, reg_no)
);

-- One permanent student record; enrollments are the per-year history.
create table if not exists public.enrollments (
  id            text primary key,
  student_id    text not null references public.students(id) on delete cascade,
  year_id       text not null references public.academic_years(id) on delete cascade,
  class_id      text not null references public.classes(id) on delete cascade,
  section_id    text not null references public.sections(id) on delete cascade,
  roll_number   integer,
  status        text not null default 'active'
                check (status in ('active','transferred','withdrawn')),
  enrolled_on   date,
  created_at    timestamptz not null default now(),
  unique (student_id, year_id)
);
create index if not exists ix_enrollments_student on public.enrollments (student_id);
create index if not exists ix_enrollments_section on public.enrollments (year_id, class_id, section_id);

create table if not exists public.student_documents (
  id            text primary key,
  student_id    text not null references public.students(id) on delete cascade,
  name          text not null,
  kind          text,
  size          text,
  doc_date      date,
  storage_path  text,               -- Storage: student-documents/{student_id}/…
  created_at    timestamptz not null default now()
);
create index if not exists ix_student_documents_student on public.student_documents (student_id);

/* ---------------- roles / permissions / profiles ---------------- */

create table if not exists public.permissions (
  id            text primary key,   -- e.g. 'marks.enter'
  name          text not null,
  description   text,
  category      text not null
);

create table if not exists public.role_defs (
  id              text primary key, -- 'superadmin', 'admin', 'coordinator', …
  name            text not null,
  description     text,
  is_system       boolean not null default false,
  all_permissions boolean not null default false,  -- true ⇒ '*'
  applies_to      text[] not null default '{}',
  status          text not null default 'active' check (status in ('active','disabled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_def_id   text not null references public.role_defs(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  primary key (role_def_id, permission_id)
);

-- 1:1 with auth.users. The role lives HERE (server-side), never client-supplied.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  school_id     text references public.schools(id),
  username      text not null,
  full_name     text not null,
  email         text,
  phone         text,
  role          text not null check (role in ('admin','teacher','student','guardian')),
  role_def_id   text not null references public.role_defs(id),
  status        text not null default 'active' check (status in ('active','disabled')),
  teacher_id    text references public.teachers(id),
  student_id    text references public.students(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (username),
  check ( (role <> 'teacher') or (teacher_id is not null) ),
  check ( (role <> 'student') or (student_id is not null) )
);
create index if not exists ix_profiles_role on public.profiles (role);

-- Guardian ↔ student is many-to-many (a guardian may have several children,
-- a student may have several guardians).
create table if not exists public.guardian_students (
  guardian_id   uuid not null references public.profiles(id) on delete cascade,
  student_id    text not null references public.students(id) on delete cascade,
  relation      text not null default 'Guardian',
  primary key (guardian_id, student_id)
);
create index if not exists ix_guardian_students_student on public.guardian_students (student_id);

/* ---------------- teaching assignments ---------------- */

create table if not exists public.teacher_assignments (
  id            text primary key,
  year_id       text not null references public.academic_years(id) on delete cascade,
  class_id      text not null references public.classes(id) on delete cascade,
  section_id    text not null references public.sections(id) on delete cascade,
  subject_id    text not null references public.subjects(id) on delete cascade,
  teacher_id    text not null references public.teachers(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (year_id, class_id, section_id, subject_id)
);
create index if not exists ix_assignments_teacher on public.teacher_assignments (teacher_id, year_id);

/* ---------------- timetable / homework ---------------- */

create table if not exists public.timetable_entries (
  id            text primary key,
  class_id      text not null references public.classes(id) on delete cascade,
  section_id    text not null references public.sections(id) on delete cascade,
  day           integer not null check (day between 0 and 6),
  period        integer not null check (period between 1 and 12),
  subject_id    text not null references public.subjects(id) on delete cascade,
  room          text,
  unique (class_id, section_id, day, period)
);

create table if not exists public.homework (
  id            text primary key,
  year_id       text not null references public.academic_years(id) on delete cascade,
  class_id      text not null references public.classes(id) on delete cascade,
  section_id    text not null references public.sections(id) on delete cascade,
  subject_id    text not null references public.subjects(id) on delete cascade,
  title         text not null,
  description   text,
  issued        date not null,
  due           date not null,
  submitted_students text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

/* ---------------- assessment system ---------------- */

create table if not exists public.assessment_structures (
  id            text primary key,
  year_id       text not null references public.academic_years(id) on delete cascade,
  class_id      text not null references public.classes(id) on delete cascade,
  subject_id    text not null references public.subjects(id) on delete cascade,
  term_id       text references public.terms(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (year_id, class_id, subject_id, term_id)
);

create table if not exists public.assessment_items (
  id            text primary key,
  structure_id  text not null references public.assessment_structures(id) on delete cascade,
  name          text not null,
  max_mark      numeric(6,2) not null check (max_mark > 0),
  weight        numeric(5,2) not null check (weight > 0),
  sort          integer not null default 0
);
create index if not exists ix_assessment_items_structure on public.assessment_items (structure_id);

create table if not exists public.assessment_marks (
  id            text primary key,
  structure_id  text not null references public.assessment_structures(id) on delete cascade,
  item_id       text not null references public.assessment_items(id) on delete cascade,
  student_id    text not null references public.students(id) on delete cascade,
  raw_mark      numeric(6,2) not null check (raw_mark >= 0),
  entered_by    uuid references public.profiles(id),
  entered_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (item_id, student_id)
);
create index if not exists ix_marks_structure_student on public.assessment_marks (structure_id, student_id);

-- Mark workflow: one record per assessment structure.
create table if not exists public.mark_submissions (
  id              text primary key,
  structure_id    text not null references public.assessment_structures(id) on delete cascade,
  status          text not null default 'draft'
                  check (status in ('draft','submitted','approved','published','returned')),
  submitted_by    uuid references public.profiles(id),
  submitted_at    timestamptz,
  approved_by     uuid references public.profiles(id),
  approved_at     timestamptz,
  returned_by     uuid references public.profiles(id),
  returned_at     timestamptz,
  return_reason   text,
  published_by    uuid references public.profiles(id),
  published_at    timestamptz,
  reopen_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (structure_id)
);

-- Immutable history of every mark change (never deleted, never overwritten).
create table if not exists public.mark_audit (
  id            uuid primary key default gen_random_uuid(),
  structure_id  text not null,
  item_id       text,
  student_id    text,
  old_value     numeric(6,2),
  new_value     numeric(6,2),
  actor         uuid references public.profiles(id),
  actor_name    text,
  reason        text,
  at            timestamptz not null default now()
);
create index if not exists ix_mark_audit_structure on public.mark_audit (structure_id);

create table if not exists public.grade_bands (
  id            text primary key,
  school_id     text not null references public.schools(id) on delete cascade,
  min_pct       numeric(5,2) not null,
  max_pct       numeric(5,2) not null,
  grade         text not null,
  remark        text,
  sort          integer not null default 0,
  check (max_pct >= min_pct)
);

/* ---------------- attendance / fees ---------------- */

create table if not exists public.attendance_registers (
  id            text primary key,
  day           date not null,
  class_id      text not null references public.classes(id) on delete cascade,
  section_id    text not null references public.sections(id) on delete cascade,
  recorded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (day, class_id, section_id)
);

create table if not exists public.attendance_entries (
  id            text primary key,
  register_id   text not null references public.attendance_registers(id) on delete cascade,
  student_id    text not null references public.students(id) on delete cascade,
  status        text not null check (status in ('present','absent','late')),
  unique (register_id, student_id)
);
create index if not exists ix_attendance_entries_student on public.attendance_entries (student_id);

create table if not exists public.fee_items (
  id            text primary key,
  student_id    text not null references public.students(id) on delete cascade,
  label         text not null,
  amount        numeric(10,2) not null check (amount >= 0),
  paid          numeric(10,2) not null default 0 check (paid >= 0),
  due_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (paid <= amount)
);

/* ---------------- communication ---------------- */

create table if not exists public.announcements (
  id              text primary key,
  title           text not null,
  body            text not null,
  category        text not null,
  sender_id       uuid references public.profiles(id),
  audience        jsonb not null default '{"kind":"everyone"}',
  status          text not null default 'draft'
                  check (status in ('draft','scheduled','published','archived')),
  scheduled_for   timestamptz,
  published_at    timestamptz,
  pinned          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.announcement_reads (
  announcement_id text not null references public.announcements(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

create table if not exists public.conversations (
  id                    text primary key,
  related_student_id    text references public.students(id) on delete set null,
  related_class_id      text references public.classes(id) on delete set null,
  related_section_id    text references public.sections(id) on delete set null,
  related_subject_id    text references public.subjects(id) on delete set null,
  status                text not null default 'active'
                        check (status in ('active','archived','hidden')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id text not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, profile_id)
);
create index if not exists ix_conv_participants_profile on public.conversation_participants (profile_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id text not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id),
  body            text not null check (char_length(body) > 0),
  read_by         uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists ix_messages_conversation on public.messages (conversation_id, created_at);

create table if not exists public.message_reports (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.messages(id) on delete cascade,
  conversation_id text not null,
  reporter_id     uuid not null references public.profiles(id),
  reason          text not null,
  detail          text,
  status          text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at      timestamptz not null default now()
);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists ix_notifications_profile on public.notifications (profile_id, is_read);

create table if not exists public.events (
  id            text primary key,
  title         text not null,
  description   text,
  day           date not null,
  time_of_day   text,
  location      text,
  category      text not null,
  audience      jsonb not null default '{"kind":"everyone"}',
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

/* ---------------- audit ---------------- */

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id),
  actor_name  text,
  action      text not null,
  target      text,
  detail      text,
  at          timestamptz not null default now()
);
create index if not exists ix_audit_log_at on public.audit_log (at desc);

/* ---------------- housekeeping ---------------- */

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'schools','academic_years','classes','subjects','teachers','students',
    'profiles','role_defs','assessment_structures','assessment_marks',
    'mark_submissions','homework','fee_items','announcements','conversations','events'
  ] loop
    execute format(
      'drop trigger if exists trg_updated_at on public.%I;
       create trigger trg_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;
`,R=`-- ===========================================================================
-- Riverside SMS — 0002_rls_functions.sql
-- Authorization lives HERE, in PostgreSQL. The client never decides access.
-- All helpers are SECURITY DEFINER so policies never recurse through RLS.
-- ===========================================================================

/* ================= core identity / permission helpers ================= */

create or replace function public.my_profile()
returns public.profiles language sql security definer stable as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.is_active_profile()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.my_role_def()
returns public.role_defs language sql security definer stable as $$
  select r.* from public.role_defs r
  join public.profiles p on p.role_def_id = r.id
  where p.id = auth.uid();
$$;

-- Level-1: role permission. Super admin role_def has all_permissions = true.
create or replace function public.has_perm(perm text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_defs r on r.id = p.role_def_id
    where p.id = auth.uid() and p.status = 'active'
      and ( r.all_permissions
         or exists (select 1 from public.role_permissions rp
                    where rp.role_def_id = r.id and rp.permission_id = perm) )
  );
$$;

create or replace function public.is_super()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles p
    join public.role_defs r on r.id = p.role_def_id
    where p.id = auth.uid() and r.all_permissions and p.status = 'active'
  );
$$;

/* ================= relationship helpers (Level-2) ================= */

-- Students the caller may access: teacher→assigned sections, student→self,
-- guardian→linked children, admin→everyone.
create or replace function public.can_view_student(sid text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and (
      p.role = 'admin'
      or (p.role = 'student' and p.student_id = sid)
      or (p.role = 'guardian' and exists (
            select 1 from public.guardian_students g
            where g.guardian_id = auth.uid() and g.student_id = sid))
      or (p.role = 'teacher' and p.teacher_id is not null and exists (
            select 1
            from public.teacher_assignments ta
            join public.enrollments e
              on e.year_id = ta.year_id and e.class_id = ta.class_id and e.section_id = ta.section_id
            where ta.teacher_id = p.teacher_id and e.student_id = sid and e.status = 'active'))
    )
  );
$$;

-- Teacher write-scope over an assessment structure (year + class + subject).
create or replace function public.teacher_can_write_structure(st_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1
    from public.profiles p
    join public.assessment_structures s on s.id = st_id
    join public.teacher_assignments ta
      on ta.teacher_id = p.teacher_id and ta.year_id = s.year_id
     and ta.class_id = s.class_id and ta.subject_id = s.subject_id
    where p.id = auth.uid() and p.role = 'teacher' and p.status = 'active'
  );
$$;

create or replace function public.structure_status(st_id text)
returns text language sql security definer stable as $$
  select coalesce((select status from public.mark_submissions where structure_id = st_id), 'draft');
$$;

/* ================= audience helpers ================= */

create or replace function public.audience_contains(aud jsonb)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and (
      case aud->>'kind'
        when 'everyone' then true
        when 'teachers' then p.role in ('teacher','admin')
        when 'students' then p.role = 'student'
        when 'guardians' then p.role in ('guardian','admin')
        when 'section-students' then p.role = 'student' and exists (
          select 1 from public.enrollments e
          where e.student_id = p.student_id and e.status = 'active'
            and e.class_id = aud->>'classId' and e.section_id = aud->>'sectionId')
        when 'section-guardians' then p.role in ('guardian','admin') and (p.role = 'admin' or exists (
          select 1 from public.guardian_students g
          join public.enrollments e on e.student_id = g.student_id and e.status = 'active'
          where g.guardian_id = auth.uid()
            and e.class_id = aud->>'classId' and e.section_id = aud->>'sectionId'))
        else false
      end
    )
  );
$$;

create or replace function public.can_see_announcement_row(a public.announcements)
returns boolean language sql security definer stable as $$
  select public.is_admin()
      or a.sender_id = auth.uid()
      or ((a.status = 'published' or (a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= now()))
          and public.audience_contains(a.audience));
$$;

create or replace function public.can_see_event_row(e public.events)
returns boolean language sql security definer stable as $$
  select public.is_admin() or e.created_by = auth.uid() or public.audience_contains(e.audience);
$$;

create or replace function public.can_see_homework_row(h public.homework)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and (
      p.role = 'admin'
      or (p.role = 'teacher' and p.teacher_id is not null and exists (
            select 1 from public.teacher_assignments ta
            where ta.teacher_id = p.teacher_id and ta.year_id = h.year_id
              and ta.class_id = h.class_id and ta.section_id = h.section_id and ta.subject_id = h.subject_id))
      or (p.role = 'student' and exists (
            select 1 from public.enrollments e
            where e.student_id = p.student_id and e.status = 'active'
              and e.year_id = h.year_id and e.class_id = h.class_id and e.section_id = h.section_id))
      or (p.role = 'guardian' and exists (
            select 1 from public.guardian_students g
            join public.enrollments e on e.student_id = g.student_id and e.status = 'active'
            where g.guardian_id = auth.uid()
              and e.year_id = h.year_id and e.class_id = h.class_id and e.section_id = h.section_id))
    )
  );
$$;

create or replace function public.can_see_section(class_id text, section_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and (
      p.role = 'admin'
      or (p.role = 'teacher' and p.teacher_id is not null and exists (
            select 1 from public.teacher_assignments ta
            where ta.teacher_id = p.teacher_id and ta.class_id = class_id and ta.section_id = section_id))
      or (p.role = 'student' and exists (
            select 1 from public.enrollments e
            where e.student_id = p.student_id and e.status = 'active'
              and e.class_id = class_id and e.section_id = section_id))
      or (p.role = 'guardian' and exists (
            select 1 from public.guardian_students g
            join public.enrollments e on e.student_id = g.student_id and e.status = 'active'
            where g.guardian_id = auth.uid() and e.class_id = class_id and e.section_id = section_id))
    )
  );
$$;

create or replace function public.is_conversation_member(conv_id text)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.conversation_participants
                 where conversation_id = conv_id and profile_id = auth.uid());
$$;

-- Relationship rule for OPENING a conversation with another user.
create or replace function public.can_message_user(other uuid)
returns boolean language sql security definer stable as $$
  select exists (
    with me as (select * from public.profiles where id = auth.uid() and status = 'active'),
         them as (select * from public.profiles where id = other and status = 'active')
    select 1 from me, them where
      public.has_perm('communication.send') and (
        public.is_admin()
        or (me.role = 'teacher' and them.role = 'admin')
        or (me.role = 'teacher' and them.role = 'teacher')
        or (me.role = 'teacher' and them.role = 'student' and public.can_view_student(them.student_id))
        or (me.role = 'teacher' and them.role = 'guardian' and exists (
              select 1 from public.guardian_students g
              where g.guardian_id = them.id and public.can_view_student(g.student_id)))
        or (me.role = 'student' and them.role = 'admin')
        or (me.role = 'student' and them.role = 'teacher' and public.can_view_student(me.student_id)
            and exists (select 1 from public.teacher_assignments ta
                        join public.enrollments e on e.year_id = ta.year_id
                          and e.class_id = ta.class_id and e.section_id = ta.section_id
                        where ta.teacher_id = them.teacher_id and e.student_id = me.student_id and e.status='active'))
        or (me.role = 'guardian' and them.role = 'admin')
        or (me.role = 'guardian' and them.role = 'teacher' and exists (
              select 1 from public.guardian_students g
              join public.enrollments e on e.student_id = g.student_id and e.status = 'active'
              join public.teacher_assignments ta on ta.year_id = e.year_id
                and ta.class_id = e.class_id and ta.section_id = e.section_id
              where g.guardian_id = me.id and ta.teacher_id = them.teacher_id))
      )
  );
$$;

/* ================= mark workflow triggers ================= */

-- Marks are writable ONLY while the structure is draft/returned, and always
-- range-checked against the item maximum.
create or replace function public.tg_marks_lock()
returns trigger language plpgsql security definer as $$
declare
  st_id text;
  v_max numeric;
  v_raw numeric;
begin
  st_id := coalesce(new.structure_id, old.structure_id);
  if public.structure_status(st_id) not in ('draft','returned') then
    raise exception 'Marks are locked: this assessment is %. Reopen it before editing.',
      public.structure_status(st_id);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select max_mark into v_max from public.assessment_items where id = new.item_id;
    if new.raw_mark > v_max then
      raise exception 'Mark % exceeds the maximum of % for this assessment.', new.raw_mark, v_max;
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_marks_lock on public.assessment_marks;
create trigger trg_marks_lock
  before insert or update or delete on public.assessment_marks
  for each row execute function public.tg_marks_lock();

-- Immutable audit history for every mark change.
create or replace function public.tg_mark_audit()
returns trigger language plpgsql security definer as $$
declare
  actor uuid := auth.uid();
  aname text;
begin
  select full_name into aname from public.profiles where id = actor;
  if tg_op = 'INSERT' then
    insert into public.mark_audit (structure_id, item_id, student_id, old_value, new_value, actor, actor_name)
    values (new.structure_id, new.item_id, new.student_id, null, new.raw_mark, actor, aname);
  elsif tg_op = 'UPDATE' then
    if old.raw_mark is distinct from new.raw_mark then
      insert into public.mark_audit (structure_id, item_id, student_id, old_value, new_value, actor, actor_name)
      values (new.structure_id, new.item_id, new.student_id, old.raw_mark, new.raw_mark, actor, aname);
    end if;
  else
    insert into public.mark_audit (structure_id, item_id, student_id, old_value, new_value, actor, actor_name)
    values (old.structure_id, old.item_id, old.student_id, old.raw_mark, null, actor, aname);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_mark_audit on public.assessment_marks;
create trigger trg_mark_audit
  after insert or update or delete on public.assessment_marks
  for each row execute function public.tg_mark_audit();

-- Submission state machine:
--   draft → submitted (teacher with scope)
--   submitted → approved | returned (results.manage, NOT the submitter unless super)
--   returned → submitted (teacher with scope)
--   approved → published (results.publish)
--   any → draft (super admin ONLY, with reopen_reason)
create or replace function public.tg_submission_state()
returns trigger language plpgsql security definer as $$
declare
  me uuid := auth.uid();
begin
  if new.status = old.status then
    return new;
  end if;

  -- Reopen path: super admin only, reason mandatory, audit recorded.
  if new.status = 'draft' then
    if not public.is_super() then
      raise exception 'Only a super admin can reopen a marks workflow.';
    end if;
    if new.reopen_reason is null or length(trim(new.reopen_reason)) = 0 then
      raise exception 'A reason is required to reopen approved marks.';
    end if;
    insert into public.mark_audit (structure_id, actor, actor_name, reason)
    select new.structure_id, me, p.full_name, 'REOPEN: ' || new.reopen_reason
    from public.profiles p where p.id = me;
    return new;
  end if;

  if old.status in ('draft','returned') and new.status = 'submitted' then
    if not (public.is_admin() or public.teacher_can_write_structure(new.structure_id)) then
      raise exception 'You are not assigned to this subject — cannot submit its marks.';
    end if;
    new.submitted_by := me; new.submitted_at := now();
    return new;
  end if;

  if old.status = 'submitted' and new.status in ('approved','returned') then
    if not public.has_perm('results.manage') then
      raise exception 'Approving or returning marks requires the results.manage permission.';
    end if;
    -- Separation of duties: no self-approval (super admin exempt).
    if new.status = 'approved' and old.submitted_by = me and not public.is_super() then
      raise exception 'You submitted these marks — a different administrator must approve them.';
    end if;
    if new.status = 'approved' then
      new.approved_by := me; new.approved_at := now();
    else
      if new.return_reason is null or length(trim(new.return_reason)) = 0 then
        raise exception 'A reason is required to return marks for correction.';
      end if;
      new.returned_by := me; new.returned_at := now();
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'published' then
    if not public.has_perm('results.publish') then
      raise exception 'Publishing results requires the results.publish permission.';
    end if;
    new.published_by := me; new.published_at := now();
    return new;
  end if;

  raise exception 'Invalid workflow transition: % → %', old.status, new.status;
end $$;

drop trigger if exists trg_submission_state on public.mark_submissions;
create trigger trg_submission_state
  before update on public.mark_submissions
  for each row execute function public.tg_submission_state();

/* ================= profile protection ================= */

create or replace function public.tg_profile_protect()
returns trigger language plpgsql security definer as $$
begin
  -- Privileged fields cannot be changed through the normal update path.
  if new.role is distinct from old.role
     or new.role_def_id is distinct from old.role_def_id
     or new.status is distinct from old.status
     or new.teacher_id is distinct from old.teacher_id
     or new.student_id is distinct from old.student_id
     or new.school_id is distinct from old.school_id then
    if not public.has_perm('users.manage') then
      raise exception 'Role, status and account links can only be changed by an administrator.';
    end if;
    if new.role_def_id is distinct from old.role_def_id and not public.is_super() then
      raise exception 'Only a super admin may change permission profiles.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_profile_protect on public.profiles;
create trigger trg_profile_protect
  before update on public.profiles
  for each row execute function public.tg_profile_protect();

/* ================= announcement scope trigger ================= */

create or replace function public.tg_announcement_scope()
returns trigger language plpgsql security definer as $$
begin
  if new.audience->>'kind' = 'everyone' and not public.has_perm('communication.school_wide') then
    raise exception 'School-wide announcements require the communication.school_wide permission.';
  end if;
  return new;
end $$;

drop trigger if exists trg_announcement_scope on public.announcements;
create trigger trg_announcement_scope
  before insert or update of audience, status on public.announcements
  for each row execute function public.tg_announcement_scope();

/* ================= RPCs (privileged, definer) ================= */

-- Creating an auth user needs the service role; this definer function does it
-- server-side, gated by users.manage. No privileged key ever reaches the client.
create or replace function public.create_user_account(
  p_username text, p_password text, p_full_name text, p_role text,
  p_role_def_id text, p_teacher_id text default null, p_student_id text default null,
  p_email text default null, p_phone text default null
) returns uuid language plpgsql security definer as $$
declare
  new_id uuid := gen_random_uuid();
  email text := coalesce(p_email, p_username || '@riverside.school');
  cols  text;
  vals  text;
  c     text;
begin
  if not public.has_perm('users.manage') then
    raise exception 'Creating accounts requires the users.manage permission.';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username)) then
    raise exception 'That username is already taken.';
  end if;

  -- Write only the columns this project's auth schema actually has
  -- (audit_info / is_anonymous / is_sso_user vary across GoTrue versions).
  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now(), '
    || '%L, jsonb_build_object(''username'', %L), now(), now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    email, p_password,
    '{"provider":"email","providers":["email"]}', p_username);
  foreach c in array array['audit_info', 'is_anonymous', 'is_sso_user'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c when 'audit_info' then ', ''{}''::jsonb' else ', false' end;
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s)', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), new_id, jsonb_build_object('sub', new_id::text, 'email', email),
     'email', new_id::text, now(), now(), now());

  insert into public.profiles
    (id, school_id, username, full_name, email, phone, role, role_def_id, status, teacher_id, student_id)
  values
    (new_id, 'school-1', p_username, p_full_name, email, p_phone, p_role, p_role_def_id,
     'active', p_teacher_id, p_student_id);

  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), p2.full_name, 'user.create', p_full_name, 'role=' || p_role
  from public.profiles p2 where p2.id = auth.uid();

  return new_id;
end $$;

-- Structured audit entry; actor comes from the session, never the client.
create or replace function public.log_action(p_action text, p_target text default null, p_detail text default null)
returns void language plpgsql security definer as $$
begin
  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), p.full_name, p_action, p_target, p_detail
  from public.profiles p where p.id = auth.uid();
end $$;

-- Notification fan-out. Non-admins may only notify users they are related to.
create or replace function public.notify_users(p_ids uuid[], p_type text, p_title text, p_body text)
returns void language plpgsql security definer as $$
declare
  target uuid;
begin
  if not public.has_perm('communication.send') then
    raise exception 'You do not have permission to send notifications.';
  end if;
  if not public.is_admin() then
    foreach target in array p_ids loop
      if not public.can_message_user(target) and target <> auth.uid() then
        raise exception 'You are not authorized to notify this user.';
      end if;
    end loop;
  end if;
  insert into public.notifications (profile_id, type, title, body)
  select distinct u.id, p_type, p_title, p_body
  from unnest(p_ids) u(id)
  join public.profiles pr on pr.id = u.id and pr.status = 'active';
end $$;

-- Marks upsert for ONE student within a structure (lock + audit via triggers).
create or replace function public.save_student_marks(p_structure_id text, p_student_id text, p_values jsonb)
returns void language plpgsql security definer as $$
declare
  k text;
begin
  if not public.can_view_student(p_student_id) then
    raise exception 'You do not have access to this student.';
  end if;
  if not (public.is_admin() or public.teacher_can_write_structure(p_structure_id)) then
    raise exception 'You are not assigned to enter marks for this assessment.';
  end if;
  -- remove rows not present in the payload
  delete from public.assessment_marks m
  where m.structure_id = p_structure_id and m.student_id = p_student_id
    and not (p_values ? m.item_id);
  -- upsert payload
  for k in select jsonb_object_keys(p_values) loop
    if p_values->>k is null then
      delete from public.assessment_marks
      where structure_id = p_structure_id and student_id = p_student_id and item_id = k;
    else
      insert into public.assessment_marks (id, structure_id, item_id, student_id, raw_mark, entered_by)
      values (p_structure_id || ':' || p_student_id || ':' || k, p_structure_id, k, p_student_id,
              (p_values->>k)::numeric, auth.uid())
      on conflict (item_id, student_id) do update
        set raw_mark = excluded.raw_mark, entered_by = auth.uid();
    end if;
  end loop;
end $$;

/* ================= RLS ================= */

alter table public.schools               enable row level security;
alter table public.academic_years        enable row level security;
alter table public.terms                 enable row level security;
alter table public.classes               enable row level security;
alter table public.sections              enable row level security;
alter table public.subjects              enable row level security;
alter table public.teachers              enable row level security;
alter table public.students              enable row level security;
alter table public.enrollments           enable row level security;
alter table public.student_documents     enable row level security;
alter table public.permissions           enable row level security;
alter table public.role_defs             enable row level security;
alter table public.role_permissions      enable row level security;
alter table public.profiles              enable row level security;
alter table public.guardian_students     enable row level security;
alter table public.teacher_assignments   enable row level security;
alter table public.timetable_entries     enable row level security;
alter table public.homework              enable row level security;
alter table public.assessment_structures enable row level security;
alter table public.assessment_items      enable row level security;
alter table public.assessment_marks      enable row level security;
alter table public.mark_submissions      enable row level security;
alter table public.mark_audit            enable row level security;
alter table public.grade_bands           enable row level security;
alter table public.attendance_registers  enable row level security;
alter table public.attendance_entries    enable row level security;
alter table public.fee_items             enable row level security;
alter table public.announcements         enable row level security;
alter table public.announcement_reads    enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages              enable row level security;
alter table public.message_reports       enable row level security;
alter table public.notifications         enable row level security;
alter table public.events                enable row level security;
alter table public.audit_log             enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.schools, public.academic_years, public.terms, public.classes, public.sections,
  public.subjects, public.teachers, public.students, public.enrollments, public.student_documents,
  public.permissions, public.role_defs, public.role_permissions, public.profiles,
  public.guardian_students, public.teacher_assignments, public.timetable_entries, public.homework,
  public.assessment_structures, public.assessment_items, public.assessment_marks,
  public.mark_submissions, public.mark_audit, public.grade_bands, public.attendance_registers,
  public.attendance_entries, public.fee_items, public.announcements, public.announcement_reads,
  public.conversations, public.conversation_participants, public.messages, public.message_reports,
  public.notifications, public.events, public.audit_log
to authenticated;
grant execute on function
  public.has_perm(text), public.is_admin(), public.is_super(), public.can_view_student(text),
  public.teacher_can_write_structure(text), public.structure_status(text),
  public.can_message_user(uuid), public.create_user_account(text,text,text,text,text,text,text,text,text),
  public.log_action(text,text,text), public.notify_users(uuid[],text,text,text),
  public.save_student_marks(text,text,jsonb), public.my_profile()
to authenticated;

do $$
begin
  /* ---- school structure: everyone authenticated reads; admins write ---- */
  create policy schools_sel        on public.schools        for select to authenticated using (true);
  create policy schools_wri        on public.schools        for all    to authenticated using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));
  create policy years_sel          on public.academic_years for select to authenticated using (true);
  create policy years_wri          on public.academic_years for all    to authenticated using (public.has_perm('academics.manage')) with check (public.has_perm('academics.manage'));
  create policy terms_sel          on public.terms          for select to authenticated using (true);
  create policy terms_wri          on public.terms          for all    to authenticated using (public.has_perm('academics.manage')) with check (public.has_perm('academics.manage'));
  create policy classes_sel        on public.classes        for select to authenticated using (true);
  create policy classes_wri        on public.classes        for all    to authenticated using (public.has_perm('academics.manage')) with check (public.has_perm('academics.manage'));
  create policy sections_sel       on public.sections       for select to authenticated using (true);
  create policy sections_wri       on public.sections       for all    to authenticated using (public.has_perm('academics.manage')) with check (public.has_perm('academics.manage'));
  create policy subjects_sel       on public.subjects       for select to authenticated using (true);
  create policy subjects_wri       on public.subjects       for all    to authenticated using (public.has_perm('academics.manage')) with check (public.has_perm('academics.manage'));
  create policy teachers_sel       on public.teachers       for select to authenticated using (true);
  create policy teachers_wri       on public.teachers       for all    to authenticated using (public.has_perm('teachers.manage')) with check (public.has_perm('teachers.manage'));
  create policy assignments_sel    on public.teacher_assignments for select to authenticated using (true);
  create policy assignments_wri    on public.teacher_assignments for all  to authenticated using (public.has_perm('academics.manage')) with check (public.has_perm('academics.manage'));
  create policy timetable_sel      on public.timetable_entries for select to authenticated using (true);
  create policy timetable_wri      on public.timetable_entries for all  to authenticated using (public.has_perm('academics.manage')) with check (public.has_perm('academics.manage'));
  create policy gradesel           on public.grade_bands    for select to authenticated using (true);
  create policy gradewri           on public.grade_bands    for all    to authenticated using (public.has_perm('results.manage')) with check (public.has_perm('results.manage'));
  create policy perms_sel          on public.permissions    for select to authenticated using (true);
  create policy roledef_sel        on public.role_defs      for select to authenticated using (true);
  create policy roleperm_sel       on public.role_permissions for select to authenticated using (true);
  create policy roles_wri          on public.role_defs      for all    to authenticated using (public.has_perm('roles.manage')) with check (public.has_perm('roles.manage'));
  create policy roleperm_wri       on public.role_permissions for all  to authenticated using (public.has_perm('roles.manage')) with check (public.has_perm('roles.manage'));

  /* ---- people: relationship-scoped ---- */
  create policy students_sel  on public.students     for select to authenticated using (public.can_view_student(id));
  create policy students_ins  on public.students     for insert to authenticated with check (public.has_perm('students.create'));
  create policy students_upd  on public.students     for update to authenticated using (public.has_perm('students.edit')) with check (public.has_perm('students.edit'));
  create policy students_del  on public.students     for delete to authenticated using (public.has_perm('students.delete'));
  create policy enroll_sel    on public.enrollments  for select to authenticated using (public.can_view_student(student_id));
  create policy enroll_wri    on public.enrollments  for all    to authenticated using (public.has_perm('students.edit')) with check (public.has_perm('students.edit'));
  create policy docs_sel      on public.student_documents for select to authenticated using (public.can_view_student(student_id));
  create policy docs_wri      on public.student_documents for all  to authenticated using (public.has_perm('students.edit')) with check (public.has_perm('students.edit'));
  create policy guardian_sel  on public.guardian_students for select to authenticated using (guardian_id = auth.uid() or public.can_view_student(student_id));
  create policy guardian_wri  on public.guardian_students for all  to authenticated using (public.has_perm('students.edit')) with check (public.has_perm('students.edit'));

  /* ---- profiles: directory readable, self-service limited, admin-gated ---- */
  create policy profiles_sel on public.profiles for select to authenticated using (true);
  create policy profiles_upd on public.profiles for update to authenticated
    using (id = auth.uid() or public.has_perm('users.manage'))
    with check (id = auth.uid() or public.has_perm('users.manage'));

  /* ---- homework / attendance / fees ---- */
  create policy homework_sel on public.homework for select to authenticated using (public.can_see_homework_row(homework));
  create policy homework_wri on public.homework for all to authenticated
    using (public.has_perm('homework.manage')) with check (public.has_perm('homework.manage'));
  create policy attreg_sel on public.attendance_registers for select to authenticated
    using (public.can_see_section(class_id, section_id));
  create policy attreg_wri on public.attendance_registers for all to authenticated
    using (public.has_perm('attendance.manage') and public.can_see_section(class_id, section_id))
    with check (public.has_perm('attendance.manage') and public.can_see_section(class_id, section_id));
  create policy attent_sel on public.attendance_entries for select to authenticated
    using (exists (select 1 from public.attendance_registers r where r.id = register_id and public.can_see_section(r.class_id, r.section_id)));
  create policy attent_wri on public.attendance_entries for all to authenticated
    using (public.has_perm('attendance.manage')) with check (public.has_perm('attendance.manage'));
  create policy fees_sel on public.fee_items for select to authenticated
    using (public.is_admin() or exists (select 1 from public.guardian_students g where g.guardian_id = auth.uid() and g.student_id = student_id));
  create policy fees_wri on public.fee_items for all to authenticated
    using (public.has_perm('fees.manage')) with check (public.has_perm('fees.manage'));

  /* ---- assessments & marks ---- */
  create policy structs_sel on public.assessment_structures for select to authenticated using (true);
  create policy structs_wri on public.assessment_structures for all to authenticated
    using (public.has_perm('exams.manage')) with check (public.has_perm('exams.manage'));
  create policy items_sel on public.assessment_items for select to authenticated using (true);
  create policy items_wri on public.assessment_items for all to authenticated
    using (public.has_perm('exams.manage')) with check (public.has_perm('exams.manage'));
  create policy marks_sel on public.assessment_marks for select to authenticated
    using (public.can_view_student(student_id)
      and ( public.is_admin()
         or public.structure_status(structure_id) = 'published'
         or public.teacher_can_write_structure(structure_id) ));
  create policy marks_ins on public.assessment_marks for insert to authenticated
    with check (public.is_admin() or public.teacher_can_write_structure(structure_id));
  create policy marks_upd on public.assessment_marks for update to authenticated
    using (public.is_admin() or public.teacher_can_write_structure(structure_id))
    with check (public.is_admin() or public.teacher_can_write_structure(structure_id));
  create policy marks_del on public.assessment_marks for delete to authenticated
    using (public.is_admin() or public.teacher_can_write_structure(structure_id));
  create policy subs_sel on public.mark_submissions for select to authenticated
    using (public.is_admin() or public.teacher_can_write_structure(structure_id));
  create policy subs_ins on public.mark_submissions for insert to authenticated
    with check (public.is_admin() or public.teacher_can_write_structure(structure_id));
  create policy subs_upd on public.mark_submissions for update to authenticated
    using (public.is_admin() or public.teacher_can_write_structure(structure_id) or public.has_perm('results.manage'))
    with check (public.is_admin() or public.teacher_can_write_structure(structure_id) or public.has_perm('results.manage'));
  create policy maudit_sel on public.mark_audit for select to authenticated
    using (public.has_perm('audit.view') or public.is_admin() or public.teacher_can_write_structure(structure_id));

  /* ---- communication ---- */
  create policy ann_sel on public.announcements for select to authenticated using (public.can_see_announcement_row(announcements));
  create policy ann_ins on public.announcements for insert to authenticated
    with check (public.has_perm('communication.create_announcement'));
  create policy ann_upd on public.announcements for update to authenticated
    using (public.has_perm('communication.manage_announcement')
        or (sender_id = auth.uid() and status in ('draft','scheduled')))
    with check (public.has_perm('communication.manage_announcement') or sender_id = auth.uid());
  create policy ann_del on public.announcements for delete to authenticated using (public.has_perm('communication.delete'));
  create policy annreads_sel on public.announcement_reads for select to authenticated using (profile_id = auth.uid() or public.is_admin());
  create policy annreads_ins on public.announcement_reads for insert to authenticated with check (profile_id = auth.uid());

  create policy conv_sel on public.conversations for select to authenticated
    using (public.is_conversation_member(id) or public.has_perm('communication.moderate'));
  create policy conv_ins on public.conversations for insert to authenticated
    with check (public.has_perm('communication.send'));
  create policy conv_upd on public.conversations for update to authenticated
    using (public.is_conversation_member(id) or public.has_perm('communication.moderate'))
    with check (public.is_conversation_member(id) or public.has_perm('communication.moderate'));
  create policy convp_sel on public.conversation_participants for select to authenticated
    using (profile_id = auth.uid() or public.is_conversation_member(conversation_id) or public.has_perm('communication.moderate'));
  create policy convp_ins on public.conversation_participants for insert to authenticated
    with check (profile_id = auth.uid() and public.has_perm('communication.send'));
  create policy msg_sel on public.messages for select to authenticated
    using (public.is_conversation_member(conversation_id) or public.has_perm('communication.moderate'));
  create policy msg_ins on public.messages for insert to authenticated
    with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id) and public.has_perm('communication.send'));
  create policy msg_upd on public.messages for update to authenticated
    using (public.is_conversation_member(conversation_id)) with check (public.is_conversation_member(conversation_id));
  create policy mrep_ins on public.message_reports for insert to authenticated
    with check (reporter_id = auth.uid() and public.is_conversation_member(conversation_id));
  create policy mrep_sel on public.message_reports for select to authenticated using (public.has_perm('communication.moderate'));
  create policy mrep_upd on public.message_reports for update to authenticated
    using (public.has_perm('communication.moderate')) with check (public.has_perm('communication.moderate'));

  create policy notif_sel on public.notifications for select to authenticated using (profile_id = auth.uid() or public.is_admin());
  create policy notif_upd on public.notifications for update to authenticated
    using (profile_id = auth.uid()) with check (profile_id = auth.uid());

  create policy events_sel on public.events for select to authenticated using (public.can_see_event_row(events));
  create policy events_wri on public.events for all to authenticated
    using (public.has_perm('events.manage')) with check (public.has_perm('events.manage'));

  create policy audit_sel on public.audit_log for select to authenticated using (public.has_perm('audit.view') or public.is_super());
exception when duplicate_object then null;
end $$;

/* ================= storage ================= */

insert into storage.buckets (id, name, public)
values ('student-documents','student-documents',false),
       ('profile-photos','profile-photos',false)
on conflict (id) do nothing;

do $$
begin
  create policy doc_read on storage.objects for select to authenticated
    using (bucket_id in ('student-documents','profile-photos')
      and public.can_view_student((storage.foldername(name))[1]));
  create policy doc_write on storage.objects for insert to authenticated
    with check (bucket_id in ('student-documents','profile-photos')
      and public.has_perm('students.edit')
      and public.can_view_student((storage.foldername(name))[1]));
  create policy doc_delete on storage.objects for delete to authenticated
    using (bucket_id in ('student-documents','profile-photos')
      and public.has_perm('students.edit')
      and public.can_view_student((storage.foldername(name))[1]));
exception when duplicate_object then null;
end $$;
`,E=`-- ===========================================================================
-- Riverside SMS — 0003_seed_core.sql
-- Core demo data: school, years, classes, subjects, teachers, assignments,
-- students + enrollments, guardian links, users (Supabase Auth), roles.
-- Idempotent (ON CONFLICT DO NOTHING). Relative dates anchor on now().
-- ===========================================================================

insert into public.schools (id, name, motto)
values ('school-1', 'Riverside Secondary School', 'Knowledge · Discipline · Service')
on conflict (id) do update set name = excluded.name, motto = excluded.motto;

/* ---------------- academic years & terms ---------------- */
insert into public.academic_years (id, school_id, name, start_date, end_date, is_active) values
  ('y25','school-1','2025/26','2025-09-15','2026-07-03',false),
  ('y26','school-1','2026/27','2026-09-14','2027-07-02',true)
on conflict (id) do nothing;

insert into public.terms (id, year_id, name, seq) values
  ('y25-t1','y25','Semester 1',1), ('y25-t2','y25','Semester 2',2), ('y25-ann','y25','Annual',3),
  ('y26-t1','y26','Semester 1',1), ('y26-t2','y26','Semester 2',2), ('y26-ann','y26','Annual',3)
on conflict (id) do nothing;

/* ---------------- classes / sections / subjects / teachers ---------------- */
insert into public.classes (id, school_id, name, level) values
  ('c7','school-1','Grade 7',7), ('c8','school-1','Grade 8',8)
on conflict (id) do nothing;

insert into public.sections (id, class_id, name) values
  ('sec7a','c7','A'), ('sec7b','c7','B'),
  ('sec8a','c8','A'), ('sec8b','c8','B'), ('sec8c','c8','C')
on conflict (id) do nothing;

insert into public.subjects (id, school_id, code, name, color) values
  ('math','school-1','MATH','Mathematics','#2c654c'),
  ('bio','school-1','BIO','Biology','#557d3b'),
  ('eng','school-1','ENG','English','#b07e24'),
  ('phy','school-1','PHY','Physics','#3a6b8c'),
  ('hist','school-1','HIS','History','#96543f')
on conflict (id) do nothing;

insert into public.teachers (id, school_id, name, phone, email, specialty) values
  ('t1','school-1','Mr. Ahmed Yusuf','0911 234 501','ahmed.yusuf@riverside.edu','Mathematics'),
  ('t2','school-1','Ms. Hana Girma','0911 234 502','hana.girma@riverside.edu','Biology'),
  ('t3','school-1','Mr. Ali Omar','0911 234 503','ali.omar@riverside.edu','English'),
  ('t4','school-1','Mrs. Selam Tesfaye','0911 234 504','selam.tesfaye@riverside.edu','Physics'),
  ('t5','school-1','Ms. Meron Alemu','0911 234 506','meron.alemu@riverside.edu','History'),
  ('t6','school-1','Mr. Samuel Tadesse','0911 234 507','samuel.tadesse@riverside.edu','Mathematics')
on conflict (id) do nothing;

/* ---------------- students (permanent records) ---------------- */
-- Seeded through a function: mirrors the app's deterministic generator.
create or replace function public.seed_rnd(i integer, salt integer)
returns double precision language sql immutable as $$
  select (x - floor(x)) from (select sin(i * 127.1 + salt * 311.7) * 43758.5453 as x) t;
$$;

do $$
declare
  r record;
  i integer;
  dob_y integer;
  addr text[] := array['Kebena, Block 4, House 21','Piassa, near Post Office, House 12',
    'Gotera, Condominium B-304','Merkato, Arada sub-city, House 88','Sarbet, House 45',
    'Kazanchis, House 7','Bole, Woreda 03, House 19','Summit, Condominium A-118'];
  fathers text[] := array['Kebede','Alemu','Mohammed','Tesfay','Girma','Mengistu','Tadesse','Solomon'];
  mothers text[] := array['Almaz','Tigist','Fatuma','Wudenesh','Hirut','Meskerem'];
  prev text[] := array['Hope Primary School','Bright Future Academy','Riverside Primary School'];
begin
  for r, i in
    select * from (values
      ( 1,'st1','Abebe','Kebede','Tesema','Male',8), ( 2,'st2','Hana','Alemu','Worku','Female',8),
      ( 3,'st3','Ahmed','Mohammed','Nuru','Male',8), ( 4,'st4','Sara','Tesfay','Gebre','Female',8),
      ( 5,'st5','Yohannes','Girma','Debebe','Male',8), ( 6,'st6','Lulit','Mengistu','Assefa','Female',8),
      ( 7,'st7','Bereket','Tadesse','Lemma','Male',8), ( 8,'st8','Selamawit','Awate','Berhe','Female',8),
      ( 9,'st9','Kalkidan','Fikre','Haile','Female',8),
      (10,'st10','Dawit','Solomon','Ayele','Male',8), (11,'st11','Mariam','Haftu','Kidane','Female',8),
      (12,'st12','Natnael','Zerihun','Getachew','Male',8), (13,'st13','Tigist','Alemayehu','Sisay','Female',8),
      (14,'st14','Robel','Kassa','Mulugeta','Male',8), (15,'st15','Betelhem','Girma','Tefera','Female',8),
      (16,'st16','Eyob','Tesfaye','Aragaw','Male',8), (17,'st17','Rahel','Bekele','Desta','Female',8),
      (18,'st18','Samuel','Fikadu','Gudeta','Male',7), (19,'st19','Hanna','Demissie','Belay','Female',7),
      (20,'st20','Yonas','Kebede','Endale','Male',7), (21,'st21','Feven','Haile','Mariam','Female',7),
      (22,'st22','Abel','Tesfaye','Wondimu','Male',7), (23,'st23','Lidya','Mengistu','Tafari','Female',7)
    ) as t(n, id, fn, mn, ln, g, grade)
  loop
    dob_y := case when r.grade = 8 then 2013 else 2014 end;
    insert into public.students
      (id, school_id, reg_no, admission_no, first_name, middle_name, last_name, gender, dob,
       phone, email, address, status, guardian_name, guardian_relation, guardian_phone, guardian_address,
       mother_name, admission_date, previous_school, admission_type)
    values
      (r.id, 'school-1', 'ST-2026-' || lpad(r.n::text,3,'0'), 'ADM-2026-' || lpad(r.n::text,3,'0'),
       r.fn, r.mn, r.ln, r.g,
       make_date(dob_y, 1 + floor(public.seed_rnd(r.n,3)*11)::int, 1 + floor(public.seed_rnd(r.n,4)*27)::int),
       '09' || lpad((10000000 + floor(public.seed_rnd(r.n,5)*89999999)::bigint)::text, 8, '0'),
       lower(r.fn || '.' || r.ln) || '@student.riverside.edu',
       addr[(r.n % 8) + 1], 'active',
       fathers[(r.n % 8) + 1] || ' ' || r.ln, 'Father',
       '09' || lpad((20000000 + floor(public.seed_rnd(r.n,6)*79999999)::bigint)::text, 8, '0'),
       addr[(r.n % 8) + 1],
       mothers[(r.n % 6) + 1] || ' ' || r.ln,
       (current_date - (45 - (r.n % 9)) * interval '1 day')::date,
       prev[(r.n % 3) + 1], case when r.n % 5 = 0 then 'Transfer' else 'New Admission' end)
    on conflict (id) do nothing;

    insert into public.student_documents (id, student_id, name, kind, size, doc_date)
    values ('doc-' || r.id, r.id, 'Birth certificate.pdf', 'Birth certificate',
            (120 + (r.n % 9) * 37) || ' KB', (current_date - (40 - (r.n % 9)) * interval '1 day')::date)
    on conflict (id) do nothing;
  end loop;
end $$;

/* ---------------- enrollments (history is append-only) ---------------- */
do $$
declare n integer; sid text; sec7 text;
begin
  -- Grade 8B: st1–st9 (y25 in Grade 7, y26 in 8B)
  for n in 1..9 loop
    sid := 'st' || n;
    sec7 := case when (n - 1) % 2 = 0 then 'sec7b' else 'sec7a' end;
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, status, enrolled_on)
    values ('en-' || sid || '-y25', sid, 'y25', 'c7', sec7, 'active', '2025-09-15')
    on conflict (student_id, year_id) do nothing;
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, status, enrolled_on)
    values ('en-' || sid || '-y26', sid, 'y26', 'c8', 'sec8b', 'active', '2026-09-14')
    on conflict (student_id, year_id) do nothing;
  end loop;
  -- Grade 8A: st10–st17
  for n in 10..17 loop
    sid := 'st' || n;
    sec7 := case when (n - 10) % 2 = 0 then 'sec7a' else 'sec7b' end;
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, status, enrolled_on)
    values ('en-' || sid || '-y25', sid, 'y25', 'c7', sec7, 'active', '2025-09-15')
    on conflict (student_id, year_id) do nothing;
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, status, enrolled_on)
    values ('en-' || sid || '-y26', sid, 'y26', 'c8', 'sec8a', 'active', '2026-09-14')
    on conflict (student_id, year_id) do nothing;
  end loop;
  -- Grade 7A: st18–st23 (current year only)
  for n in 18..23 loop
    sid := 'st' || n;
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, status, enrolled_on)
    values ('en-' || sid || '-y26', sid, 'y26', 'c7', 'sec7a', 'active', '2026-09-14')
    on conflict (student_id, year_id) do nothing;
  end loop;
end $$;

/* ---------------- teacher assignments (scope = security) ---------------- */
do $$
declare
  aid integer := 0;
  pair record; sub record;
  tid text;
begin
  for pair in select * from (values ('c8','sec8a'), ('c8','sec8b'), ('c8','sec8c'), ('c7','sec7a')) as t(c, s) loop
    for sub in select id from public.subjects order by id loop
      aid := aid + 1;
      tid := case when sub.id = 'math' and pair.c = 'c8' and pair.s = 'sec8a' then 't6'
                  else (select t2.id from (values ('math','t1'),('bio','t2'),('eng','t3'),('phy','t4'),('hist','t5')) as t2(s2,t2id)
                        where t2.s2 = sub.id limit 1) end;
      insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
      values ('as' || aid, 'y26', pair.c, pair.s, sub.id, tid)
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;

/* ---------------- roles, permissions, role↔permission mapping ---------------- */
insert into public.permissions (id, name, description, category) values
 ('students.view','View students','Browse the student register.','Students'),
 ('students.view_assigned','View assigned students','See only students in classes/sections this user teaches.','Students'),
 ('students.view_self','View own record','See one''s own student profile.','Students'),
 ('students.view_children','View children','See only registered children.','Students'),
 ('students.create','Register students','Create new student records.','Students'),
 ('students.edit','Edit students','Modify student records.','Students'),
 ('students.delete','Delete students','Remove student records.','Students'),
 ('teachers.view','View teachers','Browse the teaching staff.','Staff'),
 ('teachers.manage','Manage teachers','Add, edit and assign teachers.','Staff'),
 ('academics.view','View academics','See classes, timetable and syllabus.','Academics'),
 ('academics.manage','Manage academics','Edit classes, sections and assignments.','Academics'),
 ('homework.manage','Manage homework','Set and grade homework.','Academics'),
 ('homework.view','View homework','See assigned homework.','Academics'),
 ('assignments.view','View assignments','See teacher–subject assignments.','Academics'),
 ('exams.view','View exams','See examinations and components.','Exams & Marks'),
 ('exams.manage','Manage exams','Create and schedule examinations.','Exams & Marks'),
 ('exams.enter_marks','Enter marks','Record marks for assigned subjects.','Exams & Marks'),
 ('results.view','View results','Browse results for accessible students.','Results'),
 ('results.view_self','View own results','See one''s own results.','Results'),
 ('results.view_children','View children''s results','See results of registered children.','Results'),
 ('results.manage','Manage results','Review and approve results.','Results'),
 ('results.publish','Publish results','Release results to students and families.','Results'),
 ('attendance.view','View attendance','See attendance registers.','Attendance'),
 ('attendance.view_children','View children''s attendance','See attendance of registered children.','Attendance'),
 ('attendance.manage','Take attendance','Record attendance registers.','Attendance'),
 ('fees.view','View fees','See fee ledgers.','Fees'),
 ('fees.manage','Manage fees','Record payments and adjust fees.','Fees'),
 ('communication.view','View communication','Read announcements, messages and notifications.','Communication'),
 ('communication.send','Send messages','Send one-to-one messages (still relationship-checked).','Communication'),
 ('communication.create_announcement','Create announcements','Compose announcements for permitted audiences.','Communication'),
 ('communication.manage_announcement','Manage announcements','Edit, publish or archive any announcement.','Communication'),
 ('communication.moderate','Moderate communication','Review reported messages and conversations.','Communication'),
 ('communication.delete','Delete communication','Remove announcements or conversations.','Communication'),
 ('communication.school_wide','School-wide announcements','Address the entire school.','Communication'),
 ('communication.message_teacher','Message teachers','Open conversations with teachers.','Communication'),
 ('communication.message_student','Message students','Open conversations with students.','Communication'),
 ('communication.message_parent','Message families','Open conversations with parents/guardians.','Communication'),
 ('communication.message_admin','Message administration','Open conversations with the school office.','Communication'),
 ('events.view','View events','See the school calendar.','Events'),
 ('events.manage','Manage events','Create and edit calendar events.','Events'),
 ('users.manage','Manage users','Create accounts and assign roles.','System'),
 ('roles.manage','Manage roles & permissions','Create roles and change permission sets.','System'),
 ('audit.view','View audit log','Read the security/activity audit trail.','System'),
 ('settings.manage','Manage settings','Change school settings.','System')
on conflict (id) do nothing;

insert into public.role_defs (id, name, description, is_system, all_permissions, applies_to, status) values
 ('superadmin','Super Admin','Full system access, including role & permission management.',true,true,array['admin'],'active'),
 ('admin','School Administrator','School-wide administration across all modules.',true,false,array['admin'],'active'),
 ('coordinator','Academic Coordinator','Manages academic activities and results, without user/role administration.',false,false,array['admin','teacher'],'active'),
 ('teacher','Teacher','Academic and communication access for assigned classes and students.',true,false,array['teacher'],'active'),
 ('student','Student','Access to own academic information and permitted communication.',true,false,array['student'],'active'),
 ('guardian','Parent / Family','Access to registered children and their communication.',true,false,array['guardian'],'active')
on conflict (id) do nothing;

do $$
declare
  all_perms text[];
  admin_perms text[];
begin
  select array_agg(id) into all_perms from public.permissions;
  admin_perms := array_remove(all_perms, 'roles.manage');

  insert into public.role_permissions (role_def_id, permission_id)
  select 'admin', unnest(admin_perms) on conflict do nothing;

  insert into public.role_permissions (role_def_id, permission_id)
  select 'coordinator', unnest(array[
    'students.view','students.view_assigned','students.edit','teachers.view',
    'academics.view','academics.manage','assignments.view',
    'exams.view','exams.manage','exams.enter_marks',
    'results.view','results.manage','results.publish',
    'attendance.view','attendance.manage',
    'communication.view','communication.send','communication.create_announcement',
    'communication.message_teacher','communication.message_student','communication.message_parent','communication.message_admin',
    'events.view','events.manage']) on conflict do nothing;

  insert into public.role_permissions (role_def_id, permission_id)
  select 'teacher', unnest(array[
    'students.view_assigned','teachers.view',
    'academics.view','homework.manage','homework.view','assignments.view',
    'exams.view','exams.enter_marks','results.view',
    'attendance.view','attendance.manage',
    'communication.view','communication.send',
    'communication.message_student','communication.message_parent','communication.message_admin',
    'events.view']) on conflict do nothing;

  insert into public.role_permissions (role_def_id, permission_id)
  select 'student', unnest(array[
    'students.view_self','academics.view','homework.view','assignments.view',
    'exams.view','results.view_self','attendance.view',
    'communication.view','communication.send',
    'communication.message_teacher','communication.message_admin','events.view']) on conflict do nothing;

  insert into public.role_permissions (role_def_id, permission_id)
  select 'guardian', unnest(array[
    'students.view_children','academics.view','homework.view','assignments.view',
    'results.view_children','attendance.view_children',
    'communication.view','communication.send',
    'communication.message_teacher','communication.message_admin','events.view']) on conflict do nothing;
end $$;

/* ---------------- auth users + profiles ---------------- */
-- Demo logins map username → username@riverside.school.
create or replace function public.seed_login(
  uid uuid, uname text, pw text, full_name text, base_role text, role_def text,
  teacher_id text default null, student_id text default null,
  status text default 'active', created_days_ago integer default 45,
  children text[] default '{}'
) returns void language plpgsql as $$
declare
  email text := uname || '@riverside.school';
  cols  text;
  vals  text;
  c     text;
begin
  -- Write only the columns this project's auth schema actually has
  -- (audit_info / is_anonymous / is_sso_user vary across GoTrue versions).
  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now() - %s * interval ''1 day'', '
    || '%L, jsonb_build_object(''username'', %L), now() - %s * interval ''1 day'', now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    email, pw, created_days_ago,
    '{"provider":"email","providers":["email"]}', uname, created_days_ago);
  foreach c in array array['audit_info', 'is_anonymous', 'is_sso_user'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c when 'audit_info' then ', ''{}''::jsonb' else ', false' end;
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s) on conflict (id) do nothing', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', email),
         'email', uid::text, now(), now(), now()
  where not exists (select 1 from auth.identities where user_id = uid and provider = 'email');

  insert into public.profiles
    (id, school_id, username, full_name, email, role, role_def_id, status, teacher_id, student_id, created_at)
  values
    (uid, 'school-1', uname, full_name, email, base_role, role_def, status, teacher_id, student_id,
     now() - created_days_ago * interval '1 day')
  on conflict (id) do nothing;

  foreach c in array children loop
    insert into public.guardian_students (guardian_id, student_id, relation)
    values (uid, c, 'Father')
    on conflict do nothing;
  end loop;
end $$;

do $$
begin
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000001', 'root',   'root'  || '123', 'Dr. Selam Bekele',  'admin',   'superadmin', null, null, 'active', 500);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000002', 'admin',  'admin' || '123', 'Amara Tesfaye',   'admin',   'admin',      null, null, 'active', 400);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000003', 'lydia',  'coord' || '123', 'Ms. Lydia Fikre', 'admin',   'coordinator',null, null, 'active', 250);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000004', 'ahmed',  'teach' || '123', 'Mr. Ahmed Yusuf', 'teacher', 'teacher',    't1', null, 'active', 320);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000005', 'hana.g', 'teach' || '123', 'Ms. Hana Girma',  'teacher', 'teacher',    't2', null, 'active', 320);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000006', 'ali',    'teach' || '123', 'Mr. Ali Omar',    'teacher', 'teacher',    't3', null, 'disabled', 300);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000007', 'abebe',  'stud'  || '123', 'Abebe Kebede',    'student', 'student',    null, 'st1', 'active', 45);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000008', 'hana.a', 'stud'  || '123', 'Hana Alemu',      'student', 'student',    null, 'st2', 'active', 45);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000009', 'kebede', 'fam'   || '123', 'Kebede Tesema',   'guardian','guardian',   null, null, 'active', 45, array['st1','st2']);
  perform public.seed_login('7d0a0000-0000-4000-8000-00000000000a', 'almaz',  'fam'   || '123', 'Almaz Worku',     'guardian','guardian',   null, null, 'active', 40, array['st3']);
end $$;
`,L=`-- ===========================================================================
-- Riverside SMS — 0004_seed_academics.sql
-- Timetable, homework, assessment structures + items, marks (generated with
-- the same deterministic function as the app), workflow submissions, grading,
-- attendance, fees, announcements, conversations, notifications, events, audit.
-- Idempotent.
-- ===========================================================================

/* ---------------- timetable (generated) ---------------- */
do $$
declare
  d integer; p integer;
  subj text[] := array['math','bio','eng','phy','hist'];
  fills text[][] := array[['c8','sec8b','0'],['c8','sec8b','1'],['c8','sec8b','2'],['c8','sec8b','3'],['c8','sec8b','4'],
                          ['c8','sec8a','0'],['c8','sec8a','2'],['c8','sec8a','4'],
                          ['c7','sec7a','1'],['c7','sec7a','3']];
  f text[]; off integer;
begin
  foreach f slice 1 in array fills loop
    off := case when f[1] = 'c8' then 0 else 1 end;
    for p in 0..5 loop
      insert into public.timetable_entries (id, class_id, section_id, day, period, subject_id, room)
      values ('tt-' || f[1] || '-' || f[2] || '-' || f[3] || '-' || (p+1),
              f[1], f[2], f[3]::int, p + 1,
              subj[((f[3]::int * 3 + p * 2 + off) % 5) + 1],
              'R-20' || ((f[3]::int + p + case when f[1]='c8' then 1 else 4 end) % 10))
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;

/* ---------------- homework ---------------- */
insert into public.homework (id, year_id, class_id, section_id, subject_id, title, description, issued, due, submitted_students) values
 ('hw1','y26','c8','sec8b','math','Exercises 1–10, page 24','Solve exercises 1–10 from the textbook. Show all working steps.',
   (current_date - 3), (current_date + 2), array['st1','st2','st3','st5']),
 ('hw2','y26','c8','sec8b','bio','Lab report — onion cell slide','One-page lab report with a labelled diagram.',
   (current_date - 2), (current_date + 4), array['st1','st6']),
 ('hw3','y26','c8','sec8b','eng','Essay: My favourite season','300 words, five adjectives, two similes.',
   (current_date - 6), (current_date - 1), array['st1','st2','st4','st7','st9']),
 ('hw4','y26','c8','sec8a','phy','Speed & velocity — sheet 3','Problems 1–8 with SI units.',
   (current_date - 1), (current_date + 6), '{}'),
 ('hw5','y26','c7','sec7a','math','Fractions worksheet','Complete the worksheet handed out in class.',
   (current_date - 2), (current_date + 3), array['st18'])
on conflict (id) do nothing;

/* ---------------- assessment structures + items ---------------- */
insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id) values
 ('as-bio8s1','y26','c8','bio','y26-t1'),
 ('as-math8s1','y26','c8','math','y26-t1'),
 ('as-eng8s1','y26','c8','eng','y26-t1'),
 ('as-phy8s1','y26','c8','phy','y26-t1'),
 ('as-hist8s1','y26','c8','hist','y26-t1')
on conflict (id) do nothing;

insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort) values
 ('bio8s1-i1','as-bio8s1','Assessment 1',20,20,1), ('bio8s1-i2','as-bio8s1','Assessment 2',20,20,2),
 ('bio8s1-i3','as-bio8s1','Assessment 3',20,20,3), ('bio8s1-i4','as-bio8s1','Final Exam',40,40,4),
 ('math8s1-i1','as-math8s1','Quiz 1',10,10,1), ('math8s1-i2','as-math8s1','Assignment',10,10,2),
 ('math8s1-i3','as-math8s1','Midterm',30,30,3), ('math8s1-i4','as-math8s1','Final Exam',50,50,4),
 ('eng8s1-i1','as-eng8s1','Listening',20,20,1), ('eng8s1-i2','as-eng8s1','Assignment',10,10,2),
 ('eng8s1-i3','as-eng8s1','Midterm',30,30,3), ('eng8s1-i4','as-eng8s1','Final Exam',40,40,4),
 ('phy8s1-i1','as-phy8s1','Practical',30,30,1), ('phy8s1-i2','as-phy8s1','Midterm',30,30,2),
 ('phy8s1-i3','as-phy8s1','Final Exam',40,40,3),
 ('hist8s1-i1','as-hist8s1','Quiz 1',10,10,1), ('hist8s1-i2','as-hist8s1','Assignment',10,10,2),
 ('hist8s1-i3','as-hist8s1','Midterm',30,30,3), ('hist8s1-i4','as-hist8s1','Final Exam',50,50,4)
on conflict (id) do nothing;

/* ---------------- marks (same deterministic generator as the app) ---------------- */
do $$
declare
  ability numeric[] := array[0.87,0.93,0.80,0.84,0.76,0.90,0.71,0.79,0.86,
                             0.82,0.88,0.74,0.91,0.69,0.85,0.78,0.89];
  struct record; item record;
  sid text; idx integer; jitter numeric; raw integer; floor_min integer;
begin
  for struct in select * from public.assessment_structures where class_id = 'c8' loop
    for idx in 1..17 loop
      sid := 'st' || idx;
      -- Biology skips st9 (a student mid-entry in the demo narrative)
      if struct.id = 'as-bio8s1' and idx = 9 then continue; end if;
      for item in select * from public.assessment_items where structure_id = struct.id order by sort loop
        jitter := (public.seed_rnd(idx, (struct.id || item.id)::text % 1000 ) - 0.5) * 0.18;
        -- match the app: salt per structure+item ordinal
        floor_min := round(item.max_mark * 0.3)::int;
        raw := least(item.max_mark::int, greatest(floor_min, round(item.max_mark * (ability[idx] + jitter))::int));
        insert into public.assessment_marks (id, structure_id, item_id, student_id, raw_mark, entered_by)
        values (struct.id || ':' || sid || ':' || item.id, struct.id, item.id, sid, raw,
                '7d0a0000-0000-4000-8000-000000000004')
        on conflict (item_id, student_id) do nothing;
      end loop;
    end loop;
  end loop;

  -- Pinned example rows (the documented Abebe / Hana / Ahmed Biology numbers).
  update public.assessment_marks set raw_mark = v.m
  from (values ('bio8s1-i1','st1',18),('bio8s1-i2','st1',17),('bio8s1-i3','st1',19),('bio8s1-i4','st1',35),
               ('bio8s1-i1','st2',16),('bio8s1-i2','st2',18),('bio8s1-i3','st2',17),('bio8s1-i4','st2',32),
               ('bio8s1-i1','st3',12),('bio8s1-i2','st3',14),('bio8s1-i3','st3',13),('bio8s1-i4','st3',25)
       ) as v(item, sid, m)
  where assessment_marks.item_id = v.item and assessment_marks.student_id = v.sid;

  -- One student mid-entry: Bereket has no Final Exam mark yet.
  delete from public.assessment_marks where item_id = 'bio8s1-i4' and student_id = 'st7';
end $$;

/* ---------------- workflow demo states ---------------- */
insert into public.mark_submissions
  (id, structure_id, status, submitted_by, submitted_at, approved_by, approved_at, published_by, published_at, returned_by, returned_at, return_reason)
values
 ('sub-bio8','as-bio8s1','published','7d0a0000-0000-4000-8000-000000000004', now() - interval '6 days',
   '7d0a0000-0000-4000-8000-000000000002', now() - interval '5 days',
   '7d0a0000-0000-4000-8000-000000000002', now() - interval '4 days', null, null, null),
 ('sub-math8','as-math8s1','approved','7d0a0000-0000-4000-8000-000000000004', now() - interval '3 days',
   '7d0a0000-0000-4000-8000-000000000002', now() - interval '2 days', null, null, null, null, null),
 ('sub-eng8','as-eng8s1','submitted','7d0a0000-0000-4000-8000-000000000005', now() - interval '1 day',
   null, null, null, null, null, null, null),
 ('sub-phy8','as-phy8s1','returned','7d0a0000-0000-4000-8000-000000000005', now() - interval '2 days',
   null, null, null, null, '7d0a0000-0000-4000-8000-000000000002', now() - interval '1 day',
   'Please verify Practical marks for Section B — two entries exceed the component maximum.')
on conflict (structure_id) do nothing;

/* ---------------- grading scale ---------------- */
insert into public.grade_bands (id, school_id, min_pct, max_pct, grade, remark, sort) values
 ('gb1','school-1',90,100,'A+','Outstanding',1),
 ('gb2','school-1',80,89.99,'A','Excellent',2),
 ('gb3','school-1',70,79.99,'B','Very good',3),
 ('gb4','school-1',60,69.99,'C','Good',4),
 ('gb5','school-1',50,59.99,'D','Fair',5),
 ('gb6','school-1',0,49.99,'F','Needs improvement',6)
on conflict (id) do nothing;

/* ---------------- attendance (past 12 weekdays + today; 8A/8B open today) ---------------- */
do $$
declare
  day date; di integer := 0;
  days date[];
  sec record; ci integer;
  stu record; si integer;
  r numeric; reg text; st text;
begin
  select array_agg(d order by d desc) into days
  from (select generate_series(current_date - 20, current_date - 1, interval '1 day')::date as d) t
  where extract(dow from d) not in (0, 6)
  limit 12;
  days := days || current_date;

  for di in 1..array_length(days, 1) loop
    day := days[di];
    ci := 0;
    for sec in select * from (values ('c7','sec7a'),('c8','sec8a'),('c8','sec8b')) as t(c, s) loop
      ci := ci + 1;
      if day = current_date and sec.c = 'c8' then continue; end if;
      reg := 'att-' || day || '-' || sec.s;
      insert into public.attendance_registers (id, day, class_id, section_id, recorded_by)
      values (reg, day, sec.c, sec.s, '7d0a0000-0000-4000-8000-000000000002')
      on conflict (day, class_id, section_id) do nothing;
      si := 0;
      for stu in
        select e.student_id from public.enrollments e
        where e.year_id = 'y26' and e.class_id = sec.c and e.section_id = sec.s and e.status = 'active'
        order by e.student_id
      loop
        si := si + 1;
        r := public.seed_rnd((di - 1) * 31 + (si - 1) * 7 + (ci - 1) * 13, 53);
        st := case when r < 0.055 then 'absent' when r < 0.1 then 'late' else 'present' end;
        insert into public.attendance_entries (id, register_id, student_id, status)
        values (reg || '-' || stu.student_id, reg, stu.student_id, st)
        on conflict (register_id, student_id) do nothing;
      end loop;
    end loop;
  end loop;
end $$;

/* ---------------- fees ---------------- */
do $$
declare n integer;
begin
  for n in 1..23 loop
    insert into public.fee_items (id, student_id, label, amount, paid, due_date) values
      ('fe' || (n*2-1), 'st' || n, 'Tuition — Term 1', 4500, case when (n-1) % 4 = 0 then 2500 else 4500 end, current_date - 20),
      ('fe' || (n*2),   'st' || n, 'Laboratory & materials', 350, case when (n-1) % 3 = 0 then 0 else 350 end, current_date + 12)
    on conflict (id) do nothing;
  end loop;
end $$;

/* ---------------- announcements + reads ---------------- */
insert into public.announcements
  (id, title, body, category, sender_id, audience, status, scheduled_for, published_at, pinned, created_at) values
 ('an1','Water supply interruption — Friday 09:00–12:00',
   E'Municipality maintenance on our line. Water off in blocks B and C Friday morning.\\n\\nCanteen serves a cold menu; practicals move to block A. Refill bottles before 09:00.',
   'Urgent','7d0a0000-0000-4000-8000-000000000002','{"kind":"everyone"}','published',null,now() - interval '3 hours',true,now() - interval '3 hours'),
 ('an2','First Semester Midterm timetable released',
   E'The midterm schedule is live. Check your grade''s dates and duration per subject.\\n\\nArrive 15 minutes early with your student ID card.',
   'Exams','7d0a0000-0000-4000-8000-000000000002','{"kind":"everyone"}','published',null,now() - interval '2 days',true,now() - interval '2 days'),
 ('an3','PTA General Meeting — Saturday 9:00 AM',
   'All guardians invited to the main hall. Agenda: fee adjustment, examination calendar and the results workflow.',
   'Event','7d0a0000-0000-4000-8000-000000000002','{"kind":"guardians"}','published',null,now() - interval '3 days',false,now() - interval '3 days'),
 ('an4','Midterm revision pack — Grade 8B families',
   'The revision pack covers units 1–4. Please ensure students finish the timed practice sheet before Friday.',
   'Academic','7d0a0000-0000-4000-8000-000000000004','{"kind":"section-guardians","classId":"c8","sectionId":"sec8b"}','published',null,now() - interval '2 days',false,now() - interval '2 days'),
 ('an5','Sports Day — house registrations close Wednesday',
   'Registrations for athletics, football and relay close next Wednesday. Sign up with your PE teacher or class monitor.',
   'Event','7d0a0000-0000-4000-8000-000000000002','{"kind":"students"}','scheduled',now() + interval '1 day',null,false,now() - interval '1 day'),
 ('an6','Staff meeting — Thursday 3:30 PM',
   'Agenda: midterm moderation, sports day duties, assessment structures. Please confirm attendance.',
   'General','7d0a0000-0000-4000-8000-000000000002','{"kind":"teachers"}','draft',null,null,false,now() - interval '5 hours')
on conflict (id) do nothing;

insert into public.announcement_reads (announcement_id, profile_id) values
 ('an1','7d0a0000-0000-4000-8000-000000000002'), ('an1','7d0a0000-0000-4000-8000-000000000004'), ('an1','7d0a0000-0000-4000-8000-000000000007'),
 ('an2','7d0a0000-0000-4000-8000-000000000002'), ('an2','7d0a0000-0000-4000-8000-000000000004'), ('an2','7d0a0000-0000-4000-8000-000000000005'),
 ('an2','7d0a0000-0000-4000-8000-000000000007'), ('an2','7d0a0000-0000-4000-8000-000000000009'),
 ('an3','7d0a0000-0000-4000-8000-000000000002'), ('an3','7d0a0000-0000-4000-8000-000000000009'),
 ('an4','7d0a0000-0000-4000-8000-000000000004'), ('an4','7d0a0000-0000-4000-8000-000000000009'),
 ('an5','7d0a0000-0000-4000-8000-000000000002'), ('an6','7d0a0000-0000-4000-8000-000000000002')
on conflict do nothing;

/* ---------------- conversations / participants / messages ---------------- */
insert into public.conversations (id, related_student_id, related_class_id, related_section_id, related_subject_id, status, created_at, updated_at) values
 ('cv1','st1','c8','sec8b','bio','active', now() - interval '3 days', now() - interval '3 hours'),
 ('cv2','st1','c8','sec8b','bio','active', now() - interval '2 days', now() - interval '1 day'),
 ('cv3','st2','c8','sec8b','eng','active', now() - interval '4 days', now() - interval '2 days'),
 ('cv4','st3',null,null,null,'active', now() - interval '5 days', now() - interval '3 days'),
 ('cv5',null,null,null,null,'active', now() - interval '6 days', now() - interval '4 days')
on conflict (id) do nothing;

insert into public.conversation_participants (conversation_id, profile_id) values
 ('cv1','7d0a0000-0000-4000-8000-000000000004'), ('cv1','7d0a0000-0000-4000-8000-000000000009'),
 ('cv2','7d0a0000-0000-4000-8000-000000000004'), ('cv2','7d0a0000-0000-4000-8000-000000000007'),
 ('cv3','7d0a0000-0000-4000-8000-000000000005'), ('cv3','7d0a0000-0000-4000-8000-000000000009'),
 ('cv4','7d0a0000-0000-4000-8000-00000000000a'), ('cv4','7d0a0000-0000-4000-8000-000000000002'),
 ('cv5','7d0a0000-0000-4000-8000-000000000007'), ('cv5','7d0a0000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.messages (conversation_id, sender_id, body, read_by, created_at) values
 ('cv1','7d0a0000-0000-4000-8000-000000000004','Good morning. Abebe has been doing very well in Biology this term — I wanted to share that his lab work is excellent.',
   array['7d0a0000-0000-4000-8000-000000000004'::uuid,'7d0a0000-0000-4000-8000-000000000009'::uuid], now() - interval '3 days'),
 ('cv1','7d0a0000-0000-4000-8000-000000000009','Thank you Mr. Ahmed, that''s wonderful to hear. We''ll keep encouraging him at home.',
   array['7d0a0000-0000-4000-8000-000000000004'::uuid,'7d0a0000-0000-4000-8000-000000000009'::uuid], now() - interval '3 days' + interval '10 minutes'),
 ('cv1','7d0a0000-0000-4000-8000-000000000004','One reminder: the midterm revision pack is due Friday. Please make sure Abebe completes the timed practice sheet.',
   array['7d0a0000-0000-4000-8000-000000000004'::uuid], now() - interval '3 hours'),
 ('cv2','7d0a0000-0000-4000-8000-000000000007','Sir, I had a question about question 4 on the genetics worksheet.',
   array['7d0a0000-0000-4000-8000-000000000004'::uuid,'7d0a0000-0000-4000-8000-000000000007'::uuid], now() - interval '2 days'),
 ('cv2','7d0a0000-0000-4000-8000-000000000004','Of course — remember the Punnett square we did in class. Try setting it up for both parents first, then combine.',
   array['7d0a0000-0000-4000-8000-000000000004'::uuid,'7d0a0000-0000-4000-8000-000000000007'::uuid], now() - interval '2 days' + interval '50 minutes'),
 ('cv3','7d0a0000-0000-4000-8000-000000000005','Hello. Hana''s reading comprehension has improved a lot this month. Keep up the great support at home!',
   array['7d0a0000-0000-4000-8000-000000000005'::uuid,'7d0a0000-0000-4000-8000-000000000009'::uuid], now() - interval '4 days'),
 ('cv4','7d0a0000-0000-4000-8000-00000000000a','Hello, I''d like to ask about the laboratory fee for this term.',
   array['7d0a0000-0000-4000-8000-000000000002'::uuid,'7d0a0000-0000-4000-8000-00000000000a'::uuid], now() - interval '5 days'),
 ('cv4','7d0a0000-0000-4000-8000-000000000002','Of course. The laboratory & materials fee is ETB 350, due with Term 1 tuition. I can email you the breakdown.',
   array['7d0a0000-0000-4000-8000-000000000002'::uuid], now() - interval '3 days'),
 ('cv5','7d0a0000-0000-4000-8000-000000000007','Good morning. When will the midterm timetable be posted?',
   array['7d0a0000-0000-4000-8000-000000000002'::uuid,'7d0a0000-0000-4000-8000-000000000007'::uuid], now() - interval '6 days')
on conflict do nothing;

/* ---------------- notifications ---------------- */
insert into public.notifications (profile_id, type, title, body, is_read, created_at) values
 ('7d0a0000-0000-4000-8000-000000000007','announcement','First Semester Midterm timetable released','Check your grade''s dates and duration per subject.',true,now() - interval '2 days'),
 ('7d0a0000-0000-4000-8000-000000000007','homework','New Biology homework posted','Genetics worksheet — due Friday.',false,now() - interval '1 day'),
 ('7d0a0000-0000-4000-8000-000000000009','message','Mr. Ahmed Yusuf sent you a message','One reminder: the midterm revision pack is due Friday…',false,now() - interval '3 hours'),
 ('7d0a0000-0000-4000-8000-000000000009','announcement','PTA General Meeting — Saturday 9:00 AM','All guardians invited to the main hall.',false,now() - interval '3 days'),
 ('7d0a0000-0000-4000-8000-000000000004','system','Midterm mark entry opens Monday','Assessment structures are ready for your subjects.',false,now() - interval '1 day'),
 ('7d0a0000-0000-4000-8000-00000000000a','message','School Administrator replied','The laboratory & materials fee is ETB 350…',false,now() - interval '3 days')
on conflict do nothing;

/* ---------------- events ---------------- */
insert into public.events (id, title, description, day, time_of_day, location, category, audience, created_by) values
 ('ev1','First Semester Midterm Examinations','Midterm examinations for all grades.',current_date + 12,'08:30','All blocks','Exams','{"kind":"everyone"}','7d0a0000-0000-4000-8000-000000000002'),
 ('ev2','PTA General Meeting',null,current_date + 4,'09:00','Main hall','Event','{"kind":"guardians"}','7d0a0000-0000-4000-8000-000000000002'),
 ('ev3','Annual Sports Day',null,current_date + 20,'08:00','School field','Event','{"kind":"students"}','7d0a0000-0000-4000-8000-000000000002'),
 ('ev4','Staff moderation workshop',null,current_date + 7,'15:30','Staff room','Academic','{"kind":"teachers"}','7d0a0000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

/* ---------------- audit trail ---------------- */
insert into public.audit_log (actor_id, actor_name, action, target, detail, at) values
 ('7d0a0000-0000-4000-8000-000000000001','Dr. Selam Bekele','role.create','Academic Coordinator','Custom role with academic + results permissions.',now() - interval '10 days'),
 ('7d0a0000-0000-4000-8000-000000000002','Amara Tesfaye','announcement.publish','First Semester Midterm timetable released','Entire school',now() - interval '2 days'),
 ('7d0a0000-0000-4000-8000-000000000002','Amara Tesfaye','user.deactivate','Mr. Ali Omar','Account disabled — on leave.',now() - interval '9 days'),
 ('7d0a0000-0000-4000-8000-000000000004','Mr. Ahmed Yusuf','conversation.open','Kebede Tesema','About Abebe Kebede · Biology',now() - interval '3 days'),
 ('7d0a0000-0000-4000-8000-000000000002','Amara Tesfaye','marks.approve','Biology — Grade 8 · Semester 1','Approved after moderation.',now() - interval '5 days'),
 ('7d0a0000-0000-4000-8000-000000000002','Amara Tesfaye','marks.return','Physics — Grade 8 · Semester 1','Two entries exceed the component maximum.',now() - interval '1 day')
on conflict do nothing;
`,M=`-- ===========================================================================
-- Riverside SMS — 0005_repair_auth_seed.sql
-- Repairs "500 Database error querying schema" on /auth/v1/token.
--
-- Root cause: GoTrue (Supabase Auth) expects auth.users to carry newer
-- columns (audit_info, is_anonymous, is_sso_user). Users seeded via plain
-- SQL without them can leave the auth schema inconsistent, and GoTrue's
-- schema introspection fails on sign-in.
--
-- This file is idempotent and non-destructive:
--   1. gives audit_info a safe default (if the column exists but has none)
--   2. replaces public.seed_login with a version that writes ONLY the
--      columns that actually exist on auth.users
--   3. re-seeds every demo login (existing rows are left untouched)
-- ===========================================================================

/* 1 — make audit_info safe for GoTrue */
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name = 'audit_info' and column_default is null
  ) then
    alter table auth.users alter column audit_info set default '{}'::jsonb;
  end if;
end $$;

/* 2 — resilient seed_login: only writes columns present in this project */
create or replace function public.seed_login(
  uid uuid, uname text, pw text, full_name text, base_role text, role_def text,
  teacher_id text default null, student_id text default null,
  status text default 'active', created_days_ago integer default 45,
  children text[] default '{}'
) returns void language plpgsql as $$
declare
  email text := uname || '@riverside.school';
  cols  text;
  vals  text;
  c     text;
begin
  -- columns present in every Supabase auth schema
  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now() - %s * interval ''1 day'', '
    || '%L, jsonb_build_object(''username'', %L), now() - %s * interval ''1 day'', now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    email, pw, created_days_ago,
    '{"provider":"email","providers":["email"]}', uname, created_days_ago);

  -- newer GoTrue columns — include them only when this project has them
  foreach c in array array['audit_info', 'is_anonymous', 'is_sso_user'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c
        when 'audit_info' then ', ''{}''::jsonb'
        else ', false'
      end;
    end if;
  end loop;

  execute format('insert into auth.users (%s) values (%s) on conflict (id) do nothing', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), uid,
         jsonb_build_object('sub', uid::text, 'email', email),
         'email', uid::text, now(), now(), now()
  where not exists (select 1 from auth.identities where user_id = uid and provider = 'email');

  insert into public.profiles
    (id, school_id, username, full_name, email, role, role_def_id, status, teacher_id, student_id, created_at)
  values
    (uid, 'school-1', uname, full_name, email, base_role, role_def, status, teacher_id, student_id,
     now() - created_days_ago * interval '1 day')
  on conflict (id) do nothing;

  insert into public.guardian_students (guardian_id, student_id, relation)
  select uid, unnest(children), 'Guardian'
  on conflict do nothing;
end $$;

/* 3 — re-seed demo logins (no-ops where the row already exists) */
do $$
begin
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000001', 'root',   'root123',  'Dr. Selam Bekele',  'admin',   'superadmin',  null, null, 'active', 500);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000002', 'admin',  'admin123', 'Amara Tesfaye',   'admin',   'admin',       null, null, 'active', 400);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000003', 'lydia',  'coord123', 'Ms. Lydia Fikre', 'admin',   'coordinator', null, null, 'active', 250);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000004', 'ahmed',  'teach123', 'Mr. Ahmed Yusuf', 'teacher', 'teacher',     't1', null, 'active', 320);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000005', 'hana.g', 'teach123', 'Ms. Hana Girma',  'teacher', 'teacher',     't2', null, 'active', 320);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000006', 'ali',    'teach123', 'Mr. Ali Omar',    'teacher', 'teacher',     't3', null, 'disabled', 300);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000007', 'abebe',  'stud123',  'Abebe Kebede',    'student', 'student',     null, 'st1', 'active', 45);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000008', 'hana.a', 'stud123',  'Hana Alemu',      'student', 'student',     null, 'st2', 'active', 45);
  perform public.seed_login('7d0a0000-0000-4000-8000-000000000009', 'kebede', 'fam123',   'Kebede Tesema',   'guardian','guardian',    null, null, 'active', 45, array['st1','st2']);
  perform public.seed_login('7d0a0000-0000-4000-8000-00000000000a', 'almaz',  'fam123',   'Almaz Worku',     'guardian','guardian',    null, null, 'active', 40, array['st3']);
end $$;
`,N=`/* Adds a per-transaction payment history to fee_items, so each payment
   records its own method (cash / mobile money / bank transfer / cheque),
   a reference number, and — for bank transfers — which bank it came
   through. Additive only: existing rows default to an empty history and
   keep working with the existing \`paid\` running total. */

alter table public.fee_items
  add column if not exists payments jsonb not null default '[]'::jsonb;

comment on column public.fee_items.payments is
  'Array of {id, amount, method, reference, bank, date, recordedBy} — one entry per payment transaction.';
`,z=`/* Bug fix: create_user_account used coalesce(p_email, ...) to fall back to
   username@riverside.school when no personal email was given. coalesce()
   only substitutes on NULL — but the app was (and defensively still might)
   pass an empty string '' for "no email", which coalesce() does NOT treat
   as missing. That left new accounts (most commonly students, who usually
   have no personal email) with an email of '' in auth.users, which never
   matches the username@riverside.school the login screen computes — so
   the account existed but could never sign in.

   nullif(p_email, '') turns '' into NULL first, so the fallback actually
   applies regardless of what the caller sends. */

create or replace function public.create_user_account(
  p_username text, p_password text, p_full_name text, p_role text,
  p_role_def_id text, p_teacher_id text default null, p_student_id text default null,
  p_email text default null, p_phone text default null
) returns uuid language plpgsql security definer as $$
declare
  new_id uuid := gen_random_uuid();
  email text := coalesce(nullif(trim(p_email), ''), p_username || '@riverside.school');
  cols  text;
  vals  text;
  c     text;
begin
  if not public.has_perm('users.manage') then
    raise exception 'Creating accounts requires the users.manage permission.';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username)) then
    raise exception 'That username is already taken.';
  end if;

  -- Write only the columns this project's auth schema actually has
  -- (audit_info / is_anonymous / is_sso_user vary across GoTrue versions).
  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now(), '
    || '%L, jsonb_build_object(''username'', %L), now(), now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    email, p_password,
    '{"provider":"email","providers":["email"]}', p_username);
  foreach c in array array['audit_info', 'is_anonymous', 'is_sso_user'] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c when 'audit_info' then ', ''{}''::jsonb' else ', false' end;
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s)', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), new_id, jsonb_build_object('sub', new_id::text, 'email', email),
     'email', new_id::text, now(), now(), now());

  insert into public.profiles
    (id, school_id, username, full_name, email, phone, role, role_def_id, status, teacher_id, student_id)
  values
    (new_id, 'school-1', p_username, p_full_name, email, p_phone, p_role, p_role_def_id,
     'active', p_teacher_id, p_student_id);

  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), p2.full_name, 'user.create', p_full_name, 'role=' || p_role
  from public.profiles p2 where p2.id = auth.uid();

  return new_id;
end $$;
`,F=`/* Bug fix: "Database error querying schema" (500) on /auth/v1/token — but
   this time on accounts created via create_user_account (e.g. a freshly
   registered student), not the original demo seed.

   Root cause: GoTrue's own Go code expects several auth.users text columns
   to always be a string, never NULL — confirmation_token and recovery_token
   were already handled (0005/0007), but email_change, phone_change,
   phone_change_token, email_change_token_new, email_change_token_current,
   and reauthentication_token were not. Any of those left NULL causes
   GoTrue's row-scan on sign-in to fail with exactly this generic 500.

   This migration:
     1. Gives each of those columns a safe '' default, when the column
        exists on this project's auth schema (versions vary).
     2. Repairs any row that already has NULL in one of them — including
        the student account you just created, without needing to recreate it.
     3. Updates create_user_account and seed_login to set all of them
        explicitly going forward. */

do $$
declare
  c text;
begin
  foreach c in array array[
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      execute format('alter table auth.users alter column %I set default ''''', c);
      execute format('update auth.users set %I = '''' where %I is null', c, c);
    end if;
  end loop;
end $$;

create or replace function public.create_user_account(
  p_username text, p_password text, p_full_name text, p_role text,
  p_role_def_id text, p_teacher_id text default null, p_student_id text default null,
  p_email text default null, p_phone text default null
) returns uuid language plpgsql security definer as $$
declare
  new_id uuid := gen_random_uuid();
  email text := coalesce(nullif(trim(p_email), ''), p_username || '@riverside.school');
  cols  text;
  vals  text;
  c     text;
begin
  if not public.has_perm('users.manage') then
    raise exception 'Creating accounts requires the users.manage permission.';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username)) then
    raise exception 'That username is already taken.';
  end if;

  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now(), '
    || '%L, jsonb_build_object(''username'', %L), now(), now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    email, p_password,
    '{"provider":"email","providers":["email"]}', p_username);

  foreach c in array array[
    'audit_info', 'is_anonymous', 'is_sso_user',
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c
        when 'audit_info' then ', ''{}''::jsonb'
        when 'is_anonymous' then ', false'
        when 'is_sso_user' then ', false'
        else ', '''''
      end;
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s)', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), new_id, jsonb_build_object('sub', new_id::text, 'email', email),
     'email', new_id::text, now(), now(), now());

  insert into public.profiles
    (id, school_id, username, full_name, email, phone, role, role_def_id, status, teacher_id, student_id)
  values
    (new_id, 'school-1', p_username, p_full_name, email, p_phone, p_role, p_role_def_id,
     'active', p_teacher_id, p_student_id);

  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), p2.full_name, 'user.create', p_full_name, 'role=' || p_role
  from public.profiles p2 where p2.id = auth.uid();

  return new_id;
end $$;

create or replace function public.seed_login(
  uid uuid, uname text, pw text, full_name text, base_role text, role_def text,
  teacher_id text default null, student_id text default null,
  status text default 'active', created_days_ago integer default 45,
  children text[] default '{}'
) returns void language plpgsql as $$
declare
  email text := uname || '@riverside.school';
  cols  text;
  vals  text;
  c     text;
begin
  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now() - %s * interval ''1 day'', '
    || '%L, jsonb_build_object(''username'', %L), now() - %s * interval ''1 day'', now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    email, pw, created_days_ago,
    '{"provider":"email","providers":["email"]}', uname, created_days_ago);

  foreach c in array array[
    'audit_info', 'is_anonymous', 'is_sso_user',
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c
        when 'audit_info' then ', ''{}''::jsonb'
        when 'is_anonymous' then ', false'
        when 'is_sso_user' then ', false'
        else ', '''''
      end;
    end if;
  end loop;

  execute format('insert into auth.users (%s) values (%s) on conflict (id) do nothing', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), uid,
         jsonb_build_object('sub', uid::text, 'email', email),
         'email', uid::text, now(), now(), now()
  where not exists (select 1 from auth.identities where user_id = uid and provider = 'email');

  insert into public.profiles
    (id, school_id, username, full_name, email, role, role_def_id, status, teacher_id, student_id, created_at)
  values
    (uid, 'school-1', uname, full_name, email, base_role, role_def, status, teacher_id, student_id,
     now() - created_days_ago * interval '1 day')
  on conflict (id) do nothing;

  insert into public.guardian_students (guardian_id, student_id, relation)
  select uid, unnest(children), 'Guardian'
  on conflict do nothing;
end $$;
`,P=`/* Bug fix: login fails with a 400 "invalid_grant" on /auth/v1/token for any
   account whose username was typed with a capital letter (e.g. "Abebe.K").

   Root cause: usernameToEmail() on the client always lowercases the username
   before building the sign-in email ("abebe.k@riverside.school"), but
   create_user_account() and seed_login() stored the email/username using
   whatever case was typed at creation time ("Abebe.K@riverside.school").
   GoTrue matches email by exact string, so the two never met.

   This migration:
     1. Repairs every account already created with mixed-case email/username.
     2. Rewrites create_user_account and seed_login to always lower() the
        username before using it in the email and before storing it, so this
        class of bug cannot happen again regardless of what the client sends. */

-- 1. Repair existing rows (safe / idempotent — no-op if already lowercase).
update auth.users
   set email = lower(email)
 where email <> lower(email);

update public.profiles
   set username = lower(username),
       email    = lower(email)
 where username <> lower(username)
    or (email is not null and email <> lower(email));

-- 2. Harden create_user_account: normalize the username up front.
create or replace function public.create_user_account(
  p_username text, p_password text, p_full_name text, p_role text,
  p_role_def_id text, p_teacher_id text default null, p_student_id text default null,
  p_email text default null, p_phone text default null
) returns uuid language plpgsql security definer as $$
declare
  uname text := lower(trim(p_username));
  new_id uuid := gen_random_uuid();
  email text := lower(coalesce(nullif(trim(p_email), ''), uname || '@riverside.school'));
  cols  text;
  vals  text;
  c     text;
begin
  if not public.has_perm('users.manage') then
    raise exception 'Creating accounts requires the users.manage permission.';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if uname = '' then
    raise exception 'Username is required.';
  end if;
  if exists (select 1 from public.profiles where lower(username) = uname) then
    raise exception 'That username is already taken.';
  end if;

  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now(), '
    || '%L, jsonb_build_object(''username'', %L), now(), now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    email, p_password,
    '{"provider":"email","providers":["email"]}', uname);

  foreach c in array array[
    'audit_info', 'is_anonymous', 'is_sso_user',
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c
        when 'audit_info' then ', ''{}''::jsonb'
        when 'is_anonymous' then ', false'
        when 'is_sso_user' then ', false'
        else ', '''''
      end;
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s)', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), new_id, jsonb_build_object('sub', new_id::text, 'email', email),
     'email', new_id::text, now(), now(), now());

  insert into public.profiles
    (id, school_id, username, full_name, email, phone, role, role_def_id, status, teacher_id, student_id)
  values
    (new_id, 'school-1', uname, p_full_name, email, p_phone, p_role, p_role_def_id,
     'active', p_teacher_id, p_student_id);

  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), p2.full_name, 'user.create', p_full_name, 'role=' || p_role
  from public.profiles p2 where p2.id = auth.uid();

  return new_id;
end $$;

-- 3. Same normalization for the demo/seed helper, for consistency.
create or replace function public.seed_login(
  uid uuid, uname text, pw text, full_name text, base_role text, role_def text,
  teacher_id text default null, student_id text default null,
  status text default 'active', created_days_ago integer default 45,
  children text[] default '{}'
) returns void language plpgsql as $$
declare
  norm_uname text := lower(trim(uname));
  email text := norm_uname || '@riverside.school';
  cols  text;
  vals  text;
  c     text;
begin
  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now() - %s * interval ''1 day'', '
    || '%L, jsonb_build_object(''username'', %L), now() - %s * interval ''1 day'', now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    email, pw, created_days_ago,
    '{"provider":"email","providers":["email"]}', norm_uname, created_days_ago);

  foreach c in array array[
    'audit_info', 'is_anonymous', 'is_sso_user',
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c
        when 'audit_info' then ', ''{}''::jsonb'
        when 'is_anonymous' then ', false'
        when 'is_sso_user' then ', false'
        else ', '''''
      end;
    end if;
  end loop;

  execute format('insert into auth.users (%s) values (%s) on conflict (id) do nothing', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), uid,
         jsonb_build_object('sub', uid::text, 'email', email),
         'email', uid::text, now(), now(), now()
  where not exists (select 1 from auth.identities where user_id = uid and provider = 'email');

  insert into public.profiles
    (id, school_id, username, full_name, email, role, role_def_id, status, teacher_id, student_id, created_at)
  values
    (uid, 'school-1', norm_uname, full_name, email, base_role, role_def, status, teacher_id, student_id,
     now() - created_days_ago * interval '1 day')
  on conflict (id) do nothing;

  insert into public.guardian_students (guardian_id, student_id, relation)
  select uid, unnest(children), 'Guardian'
  on conflict do nothing;
end $$;

-- 4. Belt-and-braces: stop a mixed-case username ever landing in profiles
-- again, even via a direct update/insert outside the RPC.
alter table public.profiles
  add constraint profiles_username_lowercase check (username = lower(username));
`,C=`/* Adds a dedicated permission for managing academic years & terms/semesters.
   Previously this was folded into the broad "academics.manage" permission
   (which also covers classes/sections/assignments) — this splits it out so
   a school can grant "manage classes" without also granting "restructure
   the academic calendar", and vice versa.

   Defaults to Admin + Super Admin only:
     - Super Admin already bypasses per-permission checks (all_permissions).
     - Admin gets every permission except roles.manage, so it picks this up
       automatically via the insert below.
     - No other built-in role (coordinator/teacher/student/guardian) is
       granted it here — same as any other permission, it can be turned on
       for any role from Roles & permissions in the app. */

insert into public.permissions (id, name, description, category) values
  ('academics.manage_years', 'Manage academic years & terms', 'Create academic years, set the active year, and manage semesters/terms.', 'Academics')
on conflict (id) do nothing;

insert into public.role_permissions (role_def_id, permission_id)
values ('admin', 'academics.manage_years')
on conflict do nothing;

drop policy if exists years_wri on public.academic_years;
create policy years_wri on public.academic_years
  for all to authenticated
  using (public.has_perm('academics.manage_years'))
  with check (public.has_perm('academics.manage_years'));

drop policy if exists terms_wri on public.terms;
create policy terms_wri on public.terms
  for all to authenticated
  using (public.has_perm('academics.manage_years'))
  with check (public.has_perm('academics.manage_years'));
`,O=`/* Bug fix: starting a new direct conversation was impossible.

   openDirect() (client) creates a conversation with BOTH participants
   (yourself + the person you're messaging) in one batch insert into
   conversation_participants. But the original policy only allowed a row
   where profile_id = auth.uid() — i.e. you could only ever insert a
   participant row for YOURSELF. Since a Postgres RLS with-check applies to
   every row in a batch insert, the other person's row was always rejected,
   and the whole insert failed atomically. Every attempt to start a new
   conversation failed at this step, even though messaging inside an
   existing conversation worked fine.

   Fix: also allow inserting a participant row for someone else, as long as
   you're actually allowed to message them — reusing can_message_user(),
   the exact same relationship check the client's own "can I message this
   person" gate is built on. */

drop policy if exists convp_ins on public.conversation_participants;
create policy convp_ins on public.conversation_participants
  for insert to authenticated
  with check (
    public.has_perm('communication.send')
    and (profile_id = auth.uid() or public.can_message_user(profile_id))
  );
`,B=`-- Fast application bootstrap.
-- Keeps authorization in PostgreSQL (SECURITY INVOKER) while reducing the
-- browser from dozens of HTTP requests to one request for the initial shell
-- and one request for the complete snapshot in the background.

create or replace function public.get_app_bootstrap()
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,structure_id,name,max_mark,weight,sort from public.assessment_items) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,structure_id,status,submitted_by,submitted_at,approved_by,approved_at,returned_by,returned_at,return_reason,published_by,published_at,reopen_reason from public.mark_submissions) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;

grant execute on function public.get_app_bootstrap() to authenticated;

create or replace function public.get_app_snapshot()
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_items) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.mark_submissions) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;

grant execute on function public.get_app_snapshot() to authenticated;
`,D=`/* Bug fix: students and guardians never saw any grades, even published ones.

   assessment_marks' own SELECT policy (marks_sel) correctly lets a student
   see their published marks — it checks structure_status(structure_id) via
   a SECURITY DEFINER function, which bypasses RLS internally, so that part
   was always fine.

   But the client also reads mark_submissions directly (hydrateGroup("academics")
   does a plain \`select * from mark_submissions\`) to know WHICH structures are
   published, so the UI can decide what to render. The original subs_sel
   policy only allowed admins and the assignment's own teacher to select from
   mark_submissions at all:

     using (public.is_admin() or public.teacher_can_write_structure(structure_id))

   For a student or guardian, every row was denied — not just unpublished
   ones — so the query came back with zero rows regardless of status. With no
   submission record to point to, the client had no way to tell a published
   structure apart from a draft one, so it rendered as if nothing was ever
   published: grades looked completely missing, even though the marks
   themselves were sitting right there in assessment_marks.

   Fix: also allow reading a mark_submissions row once its status is
   'published'. This only exposes the same "published" flag that already
   governs (and was always meant to govern) whether a student can see marks
   for that structure — never submitted/approved/draft/returned rows, and
   never the marks/scores themselves, which stay governed by marks_sel. */

drop policy if exists subs_sel on public.mark_submissions;
create policy subs_sel on public.mark_submissions for select to authenticated
  using (
    public.is_admin()
    or public.teacher_can_write_structure(structure_id)
    or status = 'published'
  );
`,Y=`/* 0013_enable_realtime_messaging.sql
   Turns on Supabase Realtime (Postgres change streaming) for the tables the
   Messages screen needs to update live, instead of only on next page load:

     - messages                 new messages appear instantly; a message's
                                 read_by flip (sent → read) updates the
                                 sender's ticks live, without a refetch.
     - conversations            a conversation's updated_at bump (used to
                                 re-sort the inbox) is pushed live.
     - conversation_participants  lets a person's browser learn about a
                                 brand-new conversation someone just started
                                 with them, the moment it's created.

   RLS stays the authority: adding a table to supabase_realtime only lets
   Postgres changes be *streamed*; each connected client still only receives
   rows its own session could \`select\` under the table's existing RLS
   policies (msgs_sel / conv_sel / conv_part_sel from 0002_rls_functions.sql).
   This migration grants no new access on its own — it's idempotent and
   safe to re-run. */

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_participants'
  ) then
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end $$;
`,H=`-- Generic object-storage registry for Cloudflare R2.
--
-- Design: this table is intentionally generic (owner_type/owner_id) so every
-- future upload — staff photos, a school logo, receipts, message attachments —
-- reuses the same table, the same edge function, and the same two SQL
-- functions below, instead of a bespoke column + bucket per feature.
--
-- The actual bytes live in R2, never in Postgres. This table only tracks
-- *who is allowed to see/manage which key*, plus light metadata. The
-- \`can_view_file\` / \`can_manage_file\` functions are the single source of
-- truth for that authorization and are called from two places that must
-- always agree: the RLS policies below, and the \`r2-storage\` edge function
-- (via supabase-js .rpc(), using the caller's own JWT so it's bound by the
-- same RLS/permission rules as everything else in this app).


create table if not exists public.file_objects (
  id            uuid primary key default gen_random_uuid(),
  owner_type    text not null,          -- 'student_photo' | 'student_document' | … (extend the functions below to add more)
  owner_id      text not null,          -- business id of the owning row (e.g. a students.id)
  storage_key   text not null unique,   -- full R2 object key
  original_name text,
  mime_type     text,
  size_bytes    bigint,
  kind          text,                   -- free-form sub-category, e.g. 'transcript', 'birth_certificate'
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists ix_file_objects_owner on public.file_objects (owner_type, owner_id);

alter table public.file_objects enable row level security;

-- Add a new \`when\` branch here for every new owner_type you introduce.
create or replace function public.can_view_file(p_owner_type text, p_owner_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_owner_type
    when 'student_photo'    then can_view_student(p_owner_id)
    when 'student_document' then can_view_student(p_owner_id)
    else is_admin()
  end;
$$;

create or replace function public.can_manage_file(p_owner_type text, p_owner_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_owner_type
    when 'student_photo'    then can_view_student(p_owner_id) and has_perm('students.edit')
    when 'student_document' then can_view_student(p_owner_id) and has_perm('students.edit')
    else is_admin()
  end;
$$;

grant execute on function public.can_view_file(text, text) to authenticated;
grant execute on function public.can_manage_file(text, text) to authenticated;

drop policy if exists file_objects_select on public.file_objects;
create policy file_objects_select on public.file_objects for select
  using (can_view_file(owner_type, owner_id));

drop policy if exists file_objects_insert on public.file_objects;
create policy file_objects_insert on public.file_objects for insert
  with check (can_manage_file(owner_type, owner_id) and uploaded_by = auth.uid());

drop policy if exists file_objects_delete on public.file_objects;
create policy file_objects_delete on public.file_objects for delete
  using (can_manage_file(owner_type, owner_id));

-- No update policy: uploads are immutable rows — "replace" is delete + insert.

`,G=`/* Manual bank-transfer payments: a guardian picks a fee item + the school's
   bank account, pays outside the app, then submits a receipt here. It sits
   'pending' until someone with fees.manage reviews the receipt and approves
   or rejects it. Approval itself does NOT happen in SQL — the admin's own
   client session (which already has fees.manage) appends the resulting
   Payment onto fee_items.payments and bumps \`paid\` through the normal
   diff-sync, exactly like a manually recorded payment. This table only
   needs to let a guardian INSERT their own child's request and let
   fees.manage UPDATE its status. */

create table if not exists public.fee_payment_requests (
  id                 text primary key,
  student_id         text not null references public.students(id) on delete cascade,
  fee_item_id        text not null references public.fee_items(id) on delete cascade,
  amount             numeric(10,2) not null check (amount > 0),
  bank_account_id    text not null,
  bank_name          text not null,
  reference          text,
  receipt_path       text,
  receipt_name       text,
  submitted_by       uuid references public.profiles(id) on delete set null,
  submitted_by_name  text,
  submitted_at       timestamptz not null default now(),
  status             text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by        uuid references public.profiles(id) on delete set null,
  reviewed_by_name   text,
  reviewed_at        timestamptz,
  review_note        text
);

create index if not exists ix_fee_payment_requests_student on public.fee_payment_requests (student_id);
create index if not exists ix_fee_payment_requests_status  on public.fee_payment_requests (status);

alter table public.fee_payment_requests enable row level security;

drop policy if exists fee_payment_requests_sel on public.fee_payment_requests;
create policy fee_payment_requests_sel on public.fee_payment_requests for select to authenticated
  using (
    public.is_admin()
    or public.has_perm('fees.manage')
    or exists (select 1 from public.guardian_students g where g.guardian_id = auth.uid() and g.student_id = student_id)
  );

-- A guardian may only file a request for their own linked child, as
-- themselves, and it must start out pending — everything else (approving,
-- backdating a decision) goes through the update policy below instead.
drop policy if exists fee_payment_requests_ins on public.fee_payment_requests;
create policy fee_payment_requests_ins on public.fee_payment_requests for insert to authenticated
  with check (
    status = 'pending'
    and reviewed_by is null
    and (
      public.is_admin()
      or (
        submitted_by = auth.uid()
        and exists (select 1 from public.guardian_students g where g.guardian_id = auth.uid() and g.student_id = student_id)
      )
    )
  );

-- Only fees.manage can move a request out of pending (approve/reject).
drop policy if exists fee_payment_requests_upd on public.fee_payment_requests;
create policy fee_payment_requests_upd on public.fee_payment_requests for update to authenticated
  using (public.has_perm('fees.manage'))
  with check (public.has_perm('fees.manage'));

drop policy if exists fee_payment_requests_del on public.fee_payment_requests;
create policy fee_payment_requests_del on public.fee_payment_requests for delete to authenticated
  using (public.has_perm('fees.manage'));

/* Bank accounts guardians pay into — kept as jsonb on the single schools
   row, same pattern as fee_items.payments. Admin-managed via settings.manage. */
alter table public.schools
  add column if not exists bank_accounts jsonb not null default '[]'::jsonb;

comment on column public.schools.bank_accounts is
  'Array of {id, bankName, accountName, accountNumber, branch, note} shown to guardians for manual bank transfers.';

/* ---- receipts: extend the generic file_objects authorization ---- */
create or replace function public.can_view_file(p_owner_type text, p_owner_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_owner_type
    when 'student_photo'    then can_view_student(p_owner_id)
    when 'student_document' then can_view_student(p_owner_id)
    when 'fee_receipt'      then can_view_student(p_owner_id) or has_perm('fees.manage')
    else is_admin()
  end;
$$;

create or replace function public.can_manage_file(p_owner_type text, p_owner_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_owner_type
    when 'student_photo'    then can_view_student(p_owner_id) and has_perm('students.edit')
    when 'student_document' then can_view_student(p_owner_id) and has_perm('students.edit')
    -- A guardian uploads their own child's receipt when filing the request;
    -- fees.manage can also attach/replace one while reviewing.
    when 'fee_receipt'      then can_view_student(p_owner_id) or has_perm('fees.manage')
    else is_admin()
  end;
$$;
`,U=`/* Bug fix: the Users & Roles page has always shown a "Delete" button (Trash2
   icon) that just did \`d.users = d.users.filter(...)\` on the client. In live
   mode that never reached the server at all — there was no RPC and no RLS
   delete policy on public.profiles (delete requires an admin-privileged
   operation on auth.users, same reasoning as create_user_account), so the
   account silently reappeared the next time the app reconnected/hydrated.
   The toast said "User deleted." regardless.

   This adds a real, server-side delete_user_account RPC — the deletion
   counterpart to create_user_account — gated the same way (users.manage),
   with the same self-delete / last-admin guards the client already has, as
   defense in depth.

   One more wrinkle a plain \`delete from auth.users\` runs into: most audit
   trail columns (mark_audit.entered_by, mark_submissions.submitted_by /
   approved_by / returned_by / published_by, attendance_registers.recorded_by,
   messages.sender_id, message_reports.reporter_id, events.created_by,
   audit_log.actor_id, …) reference public.profiles(id) with NO explicit
   "on delete" action, i.e. RESTRICT — so deleting any account that has ever
   entered a mark, taken attendance, sent a message, reported a message,
   created an event, or performed an audited action raises a foreign key
   violation. In practice that's nearly every teacher/admin within days, so
   rather than let that surface as a raw Postgres error (or, worse, silently
   do nothing), this catches it and tells the caller to disable the account
   instead — which already works today, stops sign-in, and keeps history
   intact. Deletion stays available for the case it's actually safe: a
   brand-new account with no activity behind it yet (e.g. a typo'd login). */

create or replace function public.delete_user_account(p_id uuid)
returns void language plpgsql security definer as $$
declare
  target_name text;
  target_role text;
  other_active_admins int;
begin
  if not public.has_perm('users.manage') then
    raise exception 'Deleting accounts requires the users.manage permission.';
  end if;
  if p_id = auth.uid() then
    raise exception 'You can''t delete your own account.';
  end if;

  select full_name, role into target_name, target_role
  from public.profiles where id = p_id;
  if target_name is null then
    raise exception 'That account no longer exists.';
  end if;

  if target_role = 'admin' then
    select count(*) into other_active_admins
    from public.profiles where role = 'admin' and status = 'active' and id <> p_id;
    if other_active_admins = 0 then
      raise exception 'The school needs at least one active administrator.';
    end if;
  end if;

  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), p2.full_name, 'user.delete', target_name, 'role=' || target_role
  from public.profiles p2 where p2.id = auth.uid();

  begin
    delete from auth.users where id = p_id; -- cascades to public.profiles (on delete cascade)
  exception
    when foreign_key_violation then
      raise exception '% has activity on record (marks, attendance, messages, etc.) and can''t be permanently deleted — disable the account instead so it keeps its history but can no longer sign in.', target_name;
  end;
end $$;

revoke all on function public.delete_user_account(uuid) from public;
grant execute on function public.delete_user_account(uuid) to authenticated;
`,V=`/* Adds a dedicated "View families" permission for the Families page (guardian
   accounts + linked children). Previously that page had no Level-1 permission
   gate at all — any admin-shaped user could reach it regardless of what their
   role profile actually granted. This brings it in line with every other
   "*.view" permission (students.view, teachers.view, academics.view, …),
   which are UI-visibility gates: the underlying data reads/writes already go
   through their own row-level checks (can_view_student / users.manage), this
   permission only controls whether the Families section (and its sidebar
   link) appears for a role.

   Defaults to Admin + Super Admin only, same rationale as 0010:
     - Super Admin bypasses per-permission checks (all_permissions).
     - Admin gets every permission except roles.manage, so it picks this up
       automatically via the insert below.
     - No other built-in role is granted it here — it can be turned on for
       any role from Roles & permissions in the app. */

insert into public.permissions (id, name, description, category) values
  ('families.view', 'View families', 'Browse guardian accounts and the children connected to them.', 'Staff')
on conflict (id) do nothing;

insert into public.role_permissions (role_def_id, permission_id)
values ('admin', 'families.view')
on conflict do nothing;
`,W=`/* Bug fix: a brand-new account (student, guardian, or any user created with
   a real contact email filled in) is created successfully but can NEVER log
   in — "Incorrect username or password" every time, even with the exact
   password just set.

   Root cause: create_user_account() was using ONE \`email\` value for two
   different jobs that must never be the same value:
     1. The Auth login identity (auth.users.email / auth.identities) — this
        MUST always be \`username@riverside.school\`, because the client's
        login screen (usernameToEmail() in src/lib/supabase.ts) only ever
        builds that exact pattern from whatever username the person types.
        It has no way to know a person's real email.
     2. The contact/display email shown in Families, People, etc.
        (public.profiles.email) — this SHOULD be whatever real address the
        admin typed in (e.g. a student's or guardian's personal email).

   Whenever an admin left a real email in the form, create_user_account used
   it as BOTH: the Auth login email became "abebe@gmail.com" instead of
   "abebe.k@riverside.school", so the login page's guess never matched and
   sign-in always failed — while the account otherwise looked completely
   normal (profile exists, password is fine).

   This migration:
     1. Repairs every existing account whose Auth login email doesn't match
        its canonical username@riverside.school form, without touching the
        contact email shown in the UI (public.profiles.email is untouched).
     2. Rewrites create_user_account to always use the canonical
        username@riverside.school address for Auth, and to keep storing the
        real contact email (if any) only in public.profiles.email. */

-- 1. Repair accounts already broken by this bug.
do $$
declare
  r record;
  canonical text;
begin
  for r in select id, username from public.profiles loop
    canonical := lower(trim(r.username)) || '@riverside.school';

    update auth.users
       set email = canonical
     where id = r.id
       and email is distinct from canonical;

    update auth.identities
       set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(canonical))
     where user_id = r.id
       and provider = 'email'
       and identity_data ->> 'email' is distinct from canonical;
  end loop;
end $$;

-- 2. Rewrite create_user_account: Auth email is always canonical; the real
--    contact email (if provided) only ever lands in profiles.email.
create or replace function public.create_user_account(
  p_username text, p_password text, p_full_name text, p_role text,
  p_role_def_id text, p_teacher_id text default null, p_student_id text default null,
  p_email text default null, p_phone text default null
) returns uuid language plpgsql security definer as $$
declare
  uname text := lower(trim(p_username));
  new_id uuid := gen_random_uuid();
  -- Auth login identity — ALWAYS this pattern. Never the contact email:
  -- the client's login screen can only ever guess this exact address.
  auth_email text := lower(trim(p_username)) || '@riverside.school';
  -- Contact/display email shown in the UI — the real address if one was
  -- given, otherwise falls back to the login address for display purposes.
  contact_email text := lower(coalesce(nullif(trim(p_email), ''), auth_email));
  cols  text;
  vals  text;
  c     text;
begin
  if not public.has_perm('users.manage') then
    raise exception 'Creating accounts requires the users.manage permission.';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if uname = '' then
    raise exception 'Username is required.';
  end if;
  if exists (select 1 from public.profiles where lower(username) = uname) then
    raise exception 'That username is already taken.';
  end if;

  cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, '
       || 'raw_app_meta_data, raw_user_meta_data, created_at, updated_at, '
       || 'confirmation_token, recovery_token';
  vals := format(
    '%L, %L, %L, %L, %L, crypt(%L, gen_salt(''bf'')), now(), '
    || '%L, jsonb_build_object(''username'', %L), now(), now(), '''', ''''',
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    auth_email, p_password,
    '{"provider":"email","providers":["email"]}', uname);

  foreach c in array array[
    'audit_info', 'is_anonymous', 'is_sso_user',
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      cols := cols || ', ' || c;
      vals := vals || case c
        when 'audit_info' then ', ''{}''::jsonb'
        when 'is_anonymous' then ', false'
        when 'is_sso_user' then ', false'
        else ', '''''
      end;
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s)', cols, vals);

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), new_id, jsonb_build_object('sub', new_id::text, 'email', auth_email),
     'email', new_id::text, now(), now(), now());

  insert into public.profiles
    (id, school_id, username, full_name, email, phone, role, role_def_id, status, teacher_id, student_id)
  values
    (new_id, 'school-1', uname, p_full_name, contact_email, p_phone, p_role, p_role_def_id,
     'active', p_teacher_id, p_student_id);

  insert into public.audit_log (actor_id, actor_name, action, target, detail)
  select auth.uid(), p2.full_name, 'user.create', p_full_name, 'role=' || p_role
  from public.profiles p2 where p2.id = auth.uid();

  return new_id;
end $$;
`,K=`/* Adds a "View children's fees" permission so guardians get a proper Fees
   entry in their own sidebar (linking to a ledger across all their
   registered children), instead of fee ledgers only being reachable one
   child's profile at a time.

   Guardians could already read their own children's fee_items via RLS
   (fees_sel policy checks guardian_students, not any permission) — this
   permission is purely the Level-1 UI gate for the new /guardian/fees nav
   item and page, consistent with results.view_children /
   attendance.view_children.

   Granted to:
     - guardian (so the nav item appears for every guardian by default)
     - admin (admin gets every permission except roles.manage; explicit
       here because admin's original grant ran once, at seed time, and a
       permission added later doesn't retroactively backfill it) */

insert into public.permissions (id, name, description, category) values
  ('fees.view_children', 'View children''s fees', 'See and pay fees for registered children.', 'Fees')
on conflict (id) do nothing;

insert into public.role_permissions (role_def_id, permission_id)
values ('guardian', 'fees.view_children'), ('admin', 'fees.view_children')
on conflict do nothing;
`,J=`/* Bug fix: bank accounts an admin added under Admin → Fees never showed up
   in anyone's Pay modal (guardian) after a fresh page load — not because of
   RLS or a permission, but because get_app_bootstrap() (migration 0012),
   the single RPC the app calls on every boot to fetch the "schools" row,
   explicitly listed out \`id, name, motto\` and left \`bank_accounts\` off that
   list. The column was never sent to the browser, so db.settings.bankAccounts
   was always [] on load, no matter what was actually saved in the database.

   It looked intermittent because the admin who *just* added an account
   still saw it (their own in-memory state was updated locally without a
   refetch) — but anyone loading fresh, including every guardian, never got
   it. This just adds the missing column to that one RPC. */

create or replace function public.get_app_bootstrap()
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,structure_id,name,max_mark,weight,sort from public.assessment_items) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,structure_id,status,submitted_by,submitted_at,approved_by,approved_at,returned_by,returned_at,return_reason,published_by,published_at,reopen_reason from public.mark_submissions) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;

grant execute on function public.get_app_bootstrap() to authenticated;
`,Q=`-- ===========================================================================
-- 0021_year_scope.sql — every record belongs to an academic year
--
-- 0001_schema.sql scoped only *some* tables by year (enrollments, homework,
-- teacher_assignments, assessment_structures). Everything else floated free:
-- a timetable, an attendance register, a fee item, an event, an announcement
-- or a conversation had no way to say which year it belonged to. That meant
-- "show me last year" was impossible, and every query had to scan all years
-- of history forever.
--
-- This migration closes that gap. It is additive and idempotent: it never
-- drops a table, never deletes a row, and can be re-run safely.
--
-- Two kinds of year_id are added:
--   OWNED     — the row genuinely belongs to a year (timetable, fees, events).
--   INHERITED — the row's year is implied by its parent, but is denormalised
--               onto the row so large tables can be filtered by year without
--               a join (attendance_entries, assessment_marks, mark_audit).
--               A trigger keeps these correct; they are never client-supplied.
-- ===========================================================================

/* ---------------- helper: which year is "now" ---------------- */

create or replace function public.current_year_id()
returns text language sql stable security definer as $$
  select id from public.academic_years
  where is_active
  order by start_date desc
  limit 1;
$$;
comment on function public.current_year_id() is
  'The single active academic year. Used as the default for new rows and as the backfill fallback.';

-- Resolve a date to the year that contains it, falling back to the active year.
create or replace function public.year_for_date(d date)
returns text language sql stable security definer as $$
  select coalesce(
    (select y.id from public.academic_years y
      where d between y.start_date and y.end_date
      order by y.start_date desc limit 1),
    public.current_year_id()
  );
$$;

grant execute on function public.current_year_id() to authenticated;
grant execute on function public.year_for_date(date) to authenticated;

/* =========================================================================
   1. OWNED year_id — the row belongs to a year in its own right
   ========================================================================= */

alter table public.timetable_entries     add column if not exists year_id text;
alter table public.attendance_registers  add column if not exists year_id text;
alter table public.fee_items             add column if not exists year_id text;
alter table public.fee_items             add column if not exists term_id text;
alter table public.events                add column if not exists year_id text;
alter table public.announcements         add column if not exists year_id text;
alter table public.conversations         add column if not exists year_id text;
alter table public.grade_bands           add column if not exists year_id text;

-- Documents and notifications are only *sometimes* year-bound (a birth
-- certificate is not). Nullable on purpose — null means "applies to the
-- student/user, not to a year".
alter table public.student_documents     add column if not exists year_id text;
alter table public.notifications         add column if not exists year_id text;
alter table public.audit_log             add column if not exists year_id text;

/* =========================================================================
   2. INHERITED year_id — denormalised from the parent for fast filtering.
      These are the tables that grow fastest (one row per student per day,
      one row per student per assessment item), so they must be filterable
      by year without joining.
   ========================================================================= */

alter table public.attendance_entries    add column if not exists year_id text;
alter table public.assessment_marks      add column if not exists year_id text;
alter table public.mark_audit            add column if not exists year_id text;
alter table public.enrollments           add column if not exists year_locked boolean not null default false;

/* =========================================================================
   3. BACKFILL — derive the year from the best evidence each row carries,
      falling back to the active year. Only touches rows still null, so
      re-running this migration is a no-op.
   ========================================================================= */

-- Date-bearing rows: use the year whose date range contains them.
update public.attendance_registers set year_id = public.year_for_date(day)          where year_id is null;
update public.events                set year_id = public.year_for_date(day)          where year_id is null;
update public.fee_items             set year_id = public.year_for_date(coalesce(due_date, created_at::date)) where year_id is null;
update public.announcements         set year_id = public.year_for_date(coalesce(published_at, created_at)::date) where year_id is null;
update public.conversations         set year_id = public.year_for_date(created_at::date) where year_id is null;

-- Structure-bearing rows: no date of their own, so they belong to the
-- currently active year.
update public.timetable_entries     set year_id = public.current_year_id() where year_id is null;
update public.grade_bands           set year_id = public.current_year_id() where year_id is null;

-- Inherited: take the parent's year.
update public.attendance_entries e
   set year_id = r.year_id
  from public.attendance_registers r
 where r.id = e.register_id and e.year_id is null;

update public.assessment_marks m
   set year_id = s.year_id
  from public.assessment_structures s
 where s.id = m.structure_id and m.year_id is null;

update public.mark_audit a
   set year_id = s.year_id
  from public.assessment_structures s
 where s.id = a.structure_id and a.year_id is null;

/* =========================================================================
   4. CONSTRAINTS — foreign keys + NOT NULL + defaults.
      NOT NULL is only applied when the backfill left no nulls behind, so a
      database with unexpected data fails loudly at step 3 rather than
      halfway through an ALTER.
   ========================================================================= */

do $$
declare
  t text;
  owned text[] := array[
    'timetable_entries','attendance_registers','fee_items','events',
    'announcements','conversations','grade_bands'
  ];
  inherited text[] := array['attendance_entries','assessment_marks','mark_audit'];
  nullable text[] := array['student_documents','notifications','audit_log'];
  remaining bigint;
begin
  -- Foreign keys for every table that got a year_id.
  foreach t in array owned || inherited || nullable loop
    if not exists (
      select 1 from pg_constraint
      where conname = format('fk_%s_year', t)
        and conrelid = format('public.%I', t)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint fk_%s_year foreign key (year_id)
           references public.academic_years(id) on delete cascade', t, t);
    end if;
  end loop;

  -- NOT NULL + default for the tables where a year is mandatory.
  foreach t in array owned || inherited loop
    execute format('select count(*) from public.%I where year_id is null', t) into remaining;
    if remaining = 0 then
      execute format('alter table public.%I alter column year_id set not null', t);
    else
      raise warning
        '0021: % still has % rows with no year_id — left nullable. Assign a year, then re-run.',
        t, remaining;
    end if;
  end loop;

  -- New rows default to the active year so existing INSERT statements in the
  -- app keep working unchanged while the frontend is migrated over.
  foreach t in array owned loop
    execute format('alter table public.%I alter column year_id set default public.current_year_id()', t);
  end loop;
end $$;

-- fee_items.term_id is optional (not every fee is termly).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_fee_items_term') then
    alter table public.fee_items
      add constraint fk_fee_items_term foreign key (term_id)
      references public.terms(id) on delete set null;
  end if;
end $$;

/* =========================================================================
   5. UNIQUENESS now includes the year.

      This is the correctness fix that matters most. Before this, a school
      could not have a timetable for 2025/26 *and* 2026/27 — the second one
      collided with the first on (class, section, day, period). Same for
      attendance: the same calendar day in two different years collided.
   ========================================================================= */

do $$
declare c text;
begin
  -- timetable: old key was (class, section, day, period)
  for c in
    select conname from pg_constraint
    where conrelid = 'public.timetable_entries'::regclass and contype = 'u'
  loop
    execute format('alter table public.timetable_entries drop constraint %I', c);
  end loop;

  for c in
    select conname from pg_constraint
    where conrelid = 'public.attendance_registers'::regclass and contype = 'u'
  loop
    execute format('alter table public.attendance_registers drop constraint %I', c);
  end loop;
end $$;

create unique index if not exists uq_timetable_year_slot
  on public.timetable_entries (year_id, class_id, section_id, day, period);

create unique index if not exists uq_attendance_register_day
  on public.attendance_registers (year_id, day, class_id, section_id);

-- One grade band table per year, ordered.
create unique index if not exists uq_grade_band_year_sort
  on public.grade_bands (year_id, sort);

/* =========================================================================
   6. TRIGGERS — keep inherited year_id honest.

      The client never sets these. Even if a compromised client tried to
      write assessment_marks.year_id = 'some-other-year', the trigger
      overwrites it with the structure's real year before the row lands.
   ========================================================================= */

create or replace function public.tg_inherit_year()
returns trigger language plpgsql security definer as $$
begin
  if tg_table_name = 'attendance_entries' then
    select r.year_id into new.year_id
      from public.attendance_registers r where r.id = new.register_id;
  elsif tg_table_name in ('assessment_marks','mark_audit') then
    select s.year_id into new.year_id
      from public.assessment_structures s where s.id = new.structure_id;
  end if;
  return new;
end $$;

-- NAME MATTERS HERE. PostgreSQL fires BEFORE triggers in alphabetical order,
-- and 0025 adds \`trg_block_closed_year\` to these same tables. If this trigger
-- sorted after it, the guard would read a year_id that had not been populated
-- yet and reject every legitimate write. The leading \`_a_\` keeps it first.
do $$
declare t text;
begin
  foreach t in array array['attendance_entries','assessment_marks','mark_audit'] loop
    execute format(
      'drop trigger if exists trg_inherit_year on public.%I;
       drop trigger if exists trg_a_inherit_year on public.%I;
       create trigger trg_a_inherit_year before insert or update on public.%I
       for each row execute function public.tg_inherit_year();', t, t, t);
  end loop;
end $$;

-- A fee item's term must belong to the fee item's year. Cheap guard against
-- the kind of cross-year mismatch that only shows up months later in a report.
create or replace function public.tg_check_term_year()
returns trigger language plpgsql security definer as $$
begin
  if new.term_id is not null and not exists (
    select 1 from public.terms t where t.id = new.term_id and t.year_id = new.year_id
  ) then
    raise exception 'term % does not belong to academic year %', new.term_id, new.year_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_fee_term_year on public.fee_items;
create trigger trg_fee_term_year before insert or update on public.fee_items
for each row execute function public.tg_check_term_year();

-- Same guard for assessment structures, which already had both columns but
-- no constraint tying them together.
drop trigger if exists trg_structure_term_year on public.assessment_structures;
create trigger trg_structure_term_year before insert or update on public.assessment_structures
for each row execute function public.tg_check_term_year();

/* =========================================================================
   7. RLS for the new column — policies already exist on these tables and
      continue to apply. Nothing here widens access; the year_id column is
      just another filterable attribute inside the same policy envelope.
   ========================================================================= */

-- Grade bands were school-wide; now year-scoped. Keep the read policy open
-- to authenticated users (a grading scale is not sensitive) but writes still
-- require results.manage, unchanged from 0002.

comment on column public.attendance_entries.year_id is
  'Denormalised from attendance_registers. Maintained by trigger — never trust a client value.';
comment on column public.assessment_marks.year_id is
  'Denormalised from assessment_structures. Maintained by trigger — never trust a client value.';
`,X=`-- ===========================================================================
-- 0022_performance.sql — make the tables that grow answer in milliseconds
--
-- Sizing assumption behind every index here: ~5,000 students, ~200 school
-- days a year, ~12 subjects. That is roughly
--     attendance_entries  1,000,000 rows / year
--     assessment_marks      600,000 rows / year
--     fee_items              40,000 rows / year
-- Postgres handles that comfortably — but only if every query can start from
-- an index on (year_id, …) instead of scanning the whole table.
--
-- Every index below is \`if not exists\` and creates no locks worth worrying
-- about on an empty or small database. On a database that is already large,
-- run this migration with CONCURRENTLY (see the note at the bottom).
-- ===========================================================================

create extension if not exists pg_trgm;

/* ---------------- students & enrollment ---------------- */

-- The single most important index in the system: "students in this section,
-- this year". Drives class lists, mark entry, attendance, report cards.
create index if not exists ix_enroll_year_section_status
  on public.enrollments (year_id, class_id, section_id, status)
  include (student_id, roll_number);

-- "which years has this student been enrolled in" — student history page.
create index if not exists ix_enroll_student_year
  on public.enrollments (student_id, year_id);

-- Roll-number ordering inside a section without a sort step.
create index if not exists ix_enroll_section_roll
  on public.enrollments (year_id, class_id, section_id, roll_number);

-- Fuzzy name search that stays fast at 50k students. Trigram index means
-- \`name ilike '%abe%'\` uses an index instead of scanning every row.
create index if not exists ix_students_name_trgm
  on public.students using gin (
    (coalesce(first_name,'') || ' ' || coalesce(middle_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops
  );

create index if not exists ix_students_regno_trgm
  on public.students using gin (reg_no gin_trgm_ops);

create index if not exists ix_students_school_status
  on public.students (school_id, status);

/* ---------------- attendance — the biggest table ---------------- */

create index if not exists ix_att_entries_student_year
  on public.attendance_entries (student_id, year_id)
  include (status);

create index if not exists ix_att_entries_register
  on public.attendance_entries (register_id);

create index if not exists ix_att_reg_year_day
  on public.attendance_registers (year_id, day desc);

create index if not exists ix_att_reg_year_section_day
  on public.attendance_registers (year_id, class_id, section_id, day desc);

/* ---------------- marks & assessment ---------------- */

create index if not exists ix_marks_student_year
  on public.assessment_marks (student_id, year_id);

create index if not exists ix_marks_item
  on public.assessment_marks (item_id);

create index if not exists ix_structures_year_class_subject
  on public.assessment_structures (year_id, class_id, subject_id);

create index if not exists ix_structures_year_term
  on public.assessment_structures (year_id, term_id);

create index if not exists ix_submissions_status
  on public.mark_submissions (status);

create index if not exists ix_mark_audit_year_at
  on public.mark_audit (year_id, at desc);

/* ---------------- fees ---------------- */

create index if not exists ix_fees_year_student
  on public.fee_items (year_id, student_id);

-- Partial index for the query the bursar actually runs all day: who owes money.
create index if not exists ix_fees_outstanding
  on public.fee_items (year_id, due_date)
  where paid < amount;

/* ---------------- timetable, homework, assignments ---------------- */

create index if not exists ix_timetable_year_section
  on public.timetable_entries (year_id, class_id, section_id, day, period);

create index if not exists ix_homework_year_section_due
  on public.homework (year_id, class_id, section_id, due desc);

create index if not exists ix_assignments_year_section
  on public.teacher_assignments (year_id, class_id, section_id);

/* ---------------- communication ---------------- */

-- Keyset pagination on a conversation: "50 messages before this timestamp".
create index if not exists ix_messages_conv_created_desc
  on public.messages (conversation_id, created_at desc);

create index if not exists ix_conversations_year_updated
  on public.conversations (year_id, updated_at desc);

-- Unread badge: partial index so it stays small no matter how much history
-- accumulates.
create index if not exists ix_notifications_unread
  on public.notifications (profile_id, created_at desc)
  where not is_read;

create index if not exists ix_announcements_year_published
  on public.announcements (year_id, published_at desc)
  where status = 'published';

create index if not exists ix_events_year_day
  on public.events (year_id, day);

/* ---------------- profiles & audit ---------------- */

create index if not exists ix_profiles_student on public.profiles (student_id) where student_id is not null;
create index if not exists ix_profiles_teacher on public.profiles (teacher_id) where teacher_id is not null;
create index if not exists ix_profiles_school_role on public.profiles (school_id, role, status);

create index if not exists ix_audit_year_at on public.audit_log (year_id, at desc);

/* =========================================================================
   Planner statistics.

   year_id, class_id and section_id are heavily correlated — a section only
   exists inside one class, and most queries filter on all three. Without
   this, Postgres multiplies the selectivities and badly underestimates row
   counts, which is how you end up with a nested loop over a million rows.
   ========================================================================= */

do $$ begin
  if not exists (select 1 from pg_statistic_ext where stxname = 'st_enroll_year_class_section') then
    create statistics st_enroll_year_class_section (dependencies, ndistinct)
      on year_id, class_id, section_id from public.enrollments;
  end if;
  if not exists (select 1 from pg_statistic_ext where stxname = 'st_att_entries_year_student') then
    create statistics st_att_entries_year_student (dependencies, ndistinct)
      on year_id, student_id from public.attendance_entries;
  end if;
  if not exists (select 1 from pg_statistic_ext where stxname = 'st_marks_year_structure') then
    create statistics st_marks_year_structure (dependencies, ndistinct)
      on year_id, structure_id, student_id from public.assessment_marks;
  end if;
end $$;

analyze public.enrollments;
analyze public.students;
analyze public.attendance_entries;
analyze public.assessment_marks;

-- ---------------------------------------------------------------------------
-- Note for an already-large production database:
-- \`create index\` takes a write lock on the table for its duration. On a live
-- system with millions of attendance rows, run each index separately as
--     create index concurrently if not exists <name> on …;
-- outside a transaction block, rather than running this file as one unit.
-- On a fresh or small database, running this file as-is is fine.
-- ---------------------------------------------------------------------------
`,Z=`-- ===========================================================================
-- 0023_scoped_bootstrap.sql — each role loads only its own data
--
-- WHY THIS EXISTS
-- 0012_fast_bootstrap.sql was a real improvement (dozens of HTTP round trips
-- collapsed into one) but it kept a fatal property: \`get_app_bootstrap()\`
-- selects EVERY student, EVERY profile, EVERY homework row, EVERY timetable
-- entry, for EVERY year, on EVERY login. RLS trims what a student or
-- guardian sees, so their payload stays small — but an admin or teacher at a
-- 3,000-student school downloads several megabytes of JSON before the first
-- pixel paints, and it grows every single year the school operates.
--
-- The replacement below is bounded by design:
--   * always scoped to ONE academic year
--   * shaped by the caller's role — a teacher gets their sections, not the
--     school; an admin gets counts, not 3,000 student rows
--   * the unbounded collections (students, attendance, marks, fees, messages)
--     are NOT in the payload at all. They are paged, on demand, by the
--     functions in 0024_paged_queries.sql.
--
-- A login payload here is a few tens of kilobytes whether the school has 50
-- students or 50,000. get_app_bootstrap() and get_app_snapshot() are left in
-- place so nothing breaks mid-migration, but both are marked deprecated.
-- ===========================================================================

/* =========================================================================
   1. Who am I, and what may I do — one round trip, no table scans.
   ========================================================================= */

create or replace function public.my_permissions()
returns text[] language sql security definer stable as $$
  select case
    when r.all_permissions then array(select id from public.permissions)
    else coalesce(array(
      select rp.permission_id from public.role_permissions rp
      where rp.role_def_id = r.id
    ), '{}')
  end
  from public.profiles p
  join public.role_defs r on r.id = p.role_def_id
  where p.id = auth.uid() and p.status = 'active';
$$;
grant execute on function public.my_permissions() to authenticated;

-- The caller's data boundary, resolved once on the server instead of being
-- recomputed in the browser from a full copy of the school's assignments.
create or replace function public.my_scope(p_year_id text default null)
returns jsonb language plpgsql security definer stable as $$
declare
  me public.profiles;
  yr text := coalesce(p_year_id, public.current_year_id());
  out jsonb;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then
    return jsonb_build_object('role', null, 'yearId', yr);
  end if;

  out := jsonb_build_object(
    'profileId',   me.id,
    'role',        me.role,
    'roleDefId',   me.role_def_id,
    'yearId',      yr,
    'permissions', to_jsonb(public.my_permissions())
  );

  if me.role = 'teacher' then
    out := out || jsonb_build_object(
      'teacherId', me.teacher_id,
      -- exactly the class/section/subject triples this teacher is assigned
      -- in this year, and nothing else
      'assignments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'classId', ta.class_id, 'sectionId', ta.section_id, 'subjectId', ta.subject_id))
        from public.teacher_assignments ta
        where ta.teacher_id = me.teacher_id and ta.year_id = yr
      ), '[]'::jsonb),
      'studentCount', (
        select count(*) from public.enrollments e
        where e.year_id = yr and e.status = 'active'
          and exists (select 1 from public.teacher_assignments ta
                      where ta.teacher_id = me.teacher_id and ta.year_id = yr
                        and ta.class_id = e.class_id and ta.section_id = e.section_id)
      )
    );

  elsif me.role = 'student' then
    out := out || jsonb_build_object(
      'studentId', me.student_id,
      'enrollment', (
        select to_jsonb(x) from (
          select e.year_id, e.class_id, e.section_id, e.roll_number, e.status
          from public.enrollments e
          where e.student_id = me.student_id and e.year_id = yr
        ) x
      )
    );

  elsif me.role = 'guardian' then
    out := out || jsonb_build_object(
      'childIds', coalesce((
        select jsonb_agg(g.student_id) from public.guardian_students g
        where g.guardian_id = me.id
      ), '[]'::jsonb),
      'children', coalesce((
        select jsonb_agg(jsonb_build_object(
          'studentId', e.student_id, 'classId', e.class_id,
          'sectionId', e.section_id, 'rollNumber', e.roll_number))
        from public.enrollments e
        join public.guardian_students g on g.student_id = e.student_id
        where g.guardian_id = me.id and e.year_id = yr
      ), '[]'::jsonb)
    );
  end if;

  return out;
end $$;
grant execute on function public.my_scope(text) to authenticated;

/* =========================================================================
   2. Reference data — small, shared, cacheable for a long time.
      Classes, sections, subjects, terms, grading scale. A few hundred rows
      at any school size, and it changes maybe twice a year.
   ========================================================================= */

create or replace function public.get_reference(p_year_id text default null)
returns jsonb language sql security invoker stable as $$
  with yr as (select coalesce(p_year_id, public.current_year_id()) as id)
  select jsonb_build_object(
    'yearId',  (select id from yr),
    'school',  (select to_jsonb(s) from public.schools s limit 1),
    'years',   coalesce((select jsonb_agg(to_jsonb(x) order by x.start_date desc)
                         from (select id, name, start_date, end_date, is_active
                               from public.academic_years) x), '[]'::jsonb),
    'terms',   coalesce((select jsonb_agg(to_jsonb(x) order by x.seq)
                         from (select id, year_id, name, seq from public.terms
                               where year_id = (select id from yr)) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x) order by x.level)
                         from (select id, name, level from public.classes) x), '[]'::jsonb),
    'sections',coalesce((select jsonb_agg(to_jsonb(x))
                         from (select id, class_id, name from public.sections) x), '[]'::jsonb),
    'subjects',coalesce((select jsonb_agg(to_jsonb(x))
                         from (select id, name, code, color from public.subjects) x), '[]'::jsonb),
    'grading', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort)
                         from (select min_pct, max_pct, grade, remark, sort
                               from public.grade_bands
                               where year_id = (select id from yr)) x), '[]'::jsonb),
    'roleDefs',coalesce((select jsonb_agg(to_jsonb(x))
                         from (select id, name, description, is_system, all_permissions,
                                      applies_to, status from public.role_defs) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_reference(text) to authenticated;

/* =========================================================================
   3. The bootstrap itself — reference + scope + a role-appropriate slice.

      Note what is NOT here: students, attendance, marks, fees, messages,
      audit. Those are paged. This payload's size is a function of the
      caller's role, not of the school's size.
   ========================================================================= */

create or replace function public.get_bootstrap(p_year_id text default null)
returns jsonb language plpgsql security invoker stable as $$
declare
  yr    text := coalesce(p_year_id, public.current_year_id());
  scope jsonb := public.my_scope(yr);
  role  text := scope->>'role';
  out   jsonb;
begin
  out := jsonb_build_object(
    'yearId',    yr,
    'scope',     scope,
    'reference', public.get_reference(yr),
    'profile',   (select to_jsonb(x) from (
                    select id, full_name, username, role, role_def_id, status,
                           email, phone, teacher_id, student_id
                    from public.profiles where id = auth.uid()) x),
    'unread',    (select count(*) from public.notifications
                   where profile_id = auth.uid() and not is_read)
  );

  if role = 'admin' then
    -- Counts, not rows. The admin dashboard needs totals; the people page
    -- pages through list_students() when the user actually opens it.
    out := out || jsonb_build_object('summary', jsonb_build_object(
      'students',   (select count(*) from public.enrollments where year_id = yr and status = 'active'),
      'teachers',   (select count(*) from public.teachers),
      'staff',      (select count(*) from public.profiles where status = 'active'),
      'sections',   (select count(distinct (class_id, section_id)) from public.enrollments where year_id = yr),
      'feesBilled', (select coalesce(sum(amount), 0) from public.fee_items where year_id = yr),
      'feesPaid',   (select coalesce(sum(paid), 0)   from public.fee_items where year_id = yr),
      'pendingMarkApprovals', (
        select count(*) from public.mark_submissions ms
        join public.assessment_structures s on s.id = ms.structure_id
        where s.year_id = yr and ms.status = 'submitted')
    ));

  elsif role = 'teacher' then
    -- Their timetable and their assessment structures only. Bounded by how
    -- many sections one human teaches — a couple of dozen rows.
    out := out || jsonb_build_object(
      'timetable', coalesce((
        select jsonb_agg(to_jsonb(x)) from (
          select t.id, t.class_id, t.section_id, t.day, t.period, t.subject_id, t.room
          from public.timetable_entries t
          where t.year_id = yr and exists (
            select 1 from public.teacher_assignments ta
            where ta.teacher_id = (scope->>'teacherId') and ta.year_id = yr
              and ta.class_id = t.class_id and ta.section_id = t.section_id
              and ta.subject_id = t.subject_id)) x), '[]'::jsonb),
      'structures', coalesce((
        select jsonb_agg(to_jsonb(x)) from (
          select s.id, s.year_id, s.class_id, s.subject_id, s.term_id,
                 coalesce(ms.status, 'draft') as status
          from public.assessment_structures s
          left join public.mark_submissions ms on ms.structure_id = s.id
          where s.year_id = yr and public.teacher_can_write_structure(s.id)) x), '[]'::jsonb)
    );

  elsif role = 'student' then
    out := out || jsonb_build_object(
      'timetable', coalesce((
        select jsonb_agg(to_jsonb(x)) from (
          select t.id, t.class_id, t.section_id, t.day, t.period, t.subject_id, t.room
          from public.timetable_entries t
          join public.enrollments e
            on e.year_id = t.year_id and e.class_id = t.class_id and e.section_id = t.section_id
          where t.year_id = yr and e.student_id = (scope->>'studentId')) x), '[]'::jsonb),
      'fees', coalesce((
        select jsonb_agg(to_jsonb(x)) from (
          select id, label, amount, paid, due_date, term_id
          from public.fee_items
          where year_id = yr and student_id = (scope->>'studentId')) x), '[]'::jsonb)
    );

  elsif role = 'guardian' then
    out := out || jsonb_build_object(
      'fees', coalesce((
        select jsonb_agg(to_jsonb(x)) from (
          select f.id, f.student_id, f.label, f.amount, f.paid, f.due_date, f.term_id
          from public.fee_items f
          join public.guardian_students g on g.student_id = f.student_id
          where f.year_id = yr and g.guardian_id = auth.uid()) x), '[]'::jsonb),
      'children', coalesce((
        select jsonb_agg(to_jsonb(x)) from (
          select s.id, s.reg_no, s.first_name, s.middle_name, s.last_name,
                 s.photo_path, e.class_id, e.section_id, e.roll_number
          from public.students s
          join public.guardian_students g on g.student_id = s.id
          left join public.enrollments e on e.student_id = s.id and e.year_id = yr
          where g.guardian_id = auth.uid()) x), '[]'::jsonb)
    );
  end if;

  return out;
end $$;
grant execute on function public.get_bootstrap(text) to authenticated;

/* =========================================================================
   4. Mark the old entry points deprecated. They still work — nothing in the
      existing frontend breaks the moment this migration lands — but they
      should not be called once src/lib/api.ts is wired in.
   ========================================================================= */

comment on function public.get_app_bootstrap() is
  'DEPRECATED (0023): unbounded — returns every student/profile/homework row for every year. Use get_bootstrap(year_id) plus the paged list_* functions.';
comment on function public.get_app_snapshot() is
  'DEPRECATED (0023): full-table dump, intended only for the rare recovery resync. Never call on login.';
`,ee=`-- ===========================================================================
-- 0024_paged_queries.sql — the tables that grow are never loaded whole
--
-- The current frontend holds one in-memory \`DB\` object containing every
-- student, every attendance record and every mark, then filters it with
-- Array.prototype.filter. That is O(n) per keystroke in the browser's main
-- thread, and n grows every year the school runs. At a few hundred students
-- it feels fine; at five thousand the search box stutters and the tab uses
-- hundreds of megabytes.
--
-- These functions move filtering, sorting, searching, counting and
-- aggregating into PostgreSQL, where the indexes from 0022 make each one an
-- index scan over a few dozen rows. The browser holds a page at a time.
--
-- SECURITY NOTE — why SECURITY DEFINER here
-- Row Level Security evaluates can_view_student() once PER ROW. For a paged
-- read that is fine, but for \`count(*)\` over 5,000 students it means 5,000
-- correlated subqueries. These functions instead resolve the caller's scope
-- ONCE, then apply it as a set-based predicate — same boundary, one
-- evaluation. RLS remains enabled on every table underneath, so direct
-- PostgREST access is still governed by 0002's policies; this is a faster
-- road to the same place, not a way around it.
-- ===========================================================================

/* =========================================================================
   Students — paged, searchable, year-scoped, role-scoped.
   Returns total_count alongside each row so the UI can render "1–50 of 4,812"
   without a second round trip.
   ========================================================================= */

create or replace function public.list_students(
  p_year_id    text default null,
  p_class_id   text default null,
  p_section_id text default null,
  p_status     text default 'active',
  p_search     text default null,
  p_sort       text default 'name',      -- 'name' | 'roll' | 'reg'
  p_limit      integer default 50,
  p_offset     integer default 0
)
returns table (
  student_id   text,
  reg_no       text,
  full_name    text,
  first_name   text,
  middle_name  text,
  last_name    text,
  gender       text,
  dob          date,
  photo_path   text,
  status       text,
  class_id     text,
  section_id   text,
  roll_number  integer,
  guardian_phone text,
  total_count  bigint
)
language plpgsql security definer stable as $$
declare
  yr  text := coalesce(p_year_id, public.current_year_id());
  me  public.profiles;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);  -- hard ceiling
  off integer := greatest(coalesce(p_offset, 0), 0);
  q   text := nullif(btrim(coalesce(p_search, '')), '');
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
  with scoped as (
    select e.student_id, e.class_id, e.section_id, e.roll_number, e.status as enroll_status
    from public.enrollments e
    where e.year_id = yr
      and (p_class_id   is null or e.class_id   = p_class_id)
      and (p_section_id is null or e.section_id = p_section_id)
      and (p_status     is null or e.status     = p_status)
      -- ---- the role boundary, applied once ----
      and (
        me.role = 'admin'
        or (me.role = 'student'  and e.student_id = me.student_id)
        or (me.role = 'guardian' and exists (
              select 1 from public.guardian_students g
              where g.guardian_id = me.id and g.student_id = e.student_id))
        or (me.role = 'teacher'  and exists (
              select 1 from public.teacher_assignments ta
              where ta.teacher_id = me.teacher_id and ta.year_id = yr
                and ta.class_id = e.class_id and ta.section_id = e.section_id))
      )
  ),
  matched as (
    select sc.*, s.reg_no, s.first_name, s.middle_name, s.last_name,
           s.gender, s.dob, s.photo_path, s.guardian_phone,
           (coalesce(s.first_name,'') || ' ' || coalesce(s.middle_name,'') || ' ' ||
            coalesce(s.last_name,'')) as fname
    from scoped sc
    join public.students s on s.id = sc.student_id
    where q is null
       or s.reg_no ilike '%' || q || '%'
       or (coalesce(s.first_name,'') || ' ' || coalesce(s.middle_name,'') || ' ' ||
           coalesce(s.last_name,'')) ilike '%' || q || '%'
  ),
  counted as (select count(*) as n from matched)
  select m.student_id, m.reg_no, btrim(regexp_replace(m.fname, '\\s+', ' ', 'g')),
         m.first_name, m.middle_name, m.last_name, m.gender, m.dob,
         m.photo_path, m.enroll_status, m.class_id, m.section_id,
         m.roll_number, m.guardian_phone, c.n
  from matched m cross join counted c
  order by
    case when p_sort = 'roll' then m.roll_number end nulls last,
    case when p_sort = 'reg'  then m.reg_no      end,
    case when p_sort = 'name' then m.fname       end,
    m.student_id
  limit lim offset off;
end $$;
grant execute on function public.list_students(text,text,text,text,text,text,integer,integer) to authenticated;

/* =========================================================================
   One student, everything — replaces "filter six in-memory arrays".
   One round trip for the whole student detail page, already aggregated.
   ========================================================================= */

create or replace function public.get_student_detail(p_student_id text, p_year_id text default null)
returns jsonb language plpgsql security invoker stable as $$
declare
  yr text := coalesce(p_year_id, public.current_year_id());
begin
  -- SECURITY INVOKER: a single-row read, so per-row RLS costs nothing and
  -- can_view_student() stays the one authority on who may see this student.
  if not public.can_view_student(p_student_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'student', (select to_jsonb(s) from public.students s where s.id = p_student_id),
    'yearId', yr,
    -- full enrollment history, so "which class was she in two years ago" works
    'enrollments', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.year_id desc) from (
        select e.year_id, e.class_id, e.section_id, e.roll_number, e.status, e.enrolled_on
        from public.enrollments e where e.student_id = p_student_id) x), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, name, kind, size, doc_date, storage_path, year_id
        from public.student_documents where student_id = p_student_id) x), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select id, label, amount, paid, due_date, term_id
        from public.fee_items
        where student_id = p_student_id and year_id = yr) x), '[]'::jsonb),
    -- aggregated, not one row per school day
    'attendance', (
      select jsonb_build_object(
        'present', count(*) filter (where status = 'present'),
        'absent',  count(*) filter (where status = 'absent'),
        'late',    count(*) filter (where status = 'late'),
        'total',   count(*))
      from public.attendance_entries
      where student_id = p_student_id and year_id = yr),
    'guardians', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select p.id, p.full_name, p.phone, p.email, g.relation
        from public.guardian_students g
        join public.profiles p on p.id = g.guardian_id
        where g.student_id = p_student_id) x), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_student_detail(text,text) to authenticated;

/* =========================================================================
   Marks — one section's sheet for one assessment, in one call.
   Previously the client held every mark in the school to render this.
   ========================================================================= */

create or replace function public.get_marksheet(p_structure_id text)
returns jsonb language plpgsql security invoker stable as $$
declare st public.assessment_structures;
begin
  select * into st from public.assessment_structures where id = p_structure_id;
  if st.id is null then raise exception 'unknown structure %', p_structure_id; end if;

  return jsonb_build_object(
    'structure', to_jsonb(st),
    'status', coalesce((select status from public.mark_submissions where structure_id = st.id), 'draft'),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort) from (
        select id, name, max_mark, weight, sort
        from public.assessment_items where structure_id = st.id) x), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.roll_number nulls last, x.full_name) from (
        select s.id as student_id,
               btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')) as full_name,
               e.roll_number,
               coalesce((
                 select jsonb_object_agg(m.item_id, m.raw_mark)
                 from public.assessment_marks m
                 where m.structure_id = st.id and m.student_id = s.id), '{}'::jsonb) as marks
        from public.enrollments e
        join public.students s on s.id = e.student_id
        where e.year_id = st.year_id and e.class_id = st.class_id and e.status = 'active') x), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_marksheet(text) to authenticated;

/* =========================================================================
   Attendance — a single day's register, and per-section summaries.
   Never "all attendance".
   ========================================================================= */

create or replace function public.get_register(
  p_year_id text, p_class_id text, p_section_id text, p_day date)
returns jsonb language plpgsql security invoker stable as $$
begin
  if not public.can_see_section(p_class_id, p_section_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'day', p_day, 'yearId', p_year_id, 'classId', p_class_id, 'sectionId', p_section_id,
    'registerId', (select id from public.attendance_registers
                   where year_id = p_year_id and day = p_day
                     and class_id = p_class_id and section_id = p_section_id),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.roll_number nulls last) from (
        select s.id as student_id,
               btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')) as full_name,
               e.roll_number,
               (select ae.status from public.attendance_entries ae
                join public.attendance_registers r on r.id = ae.register_id
                where ae.student_id = s.id and r.year_id = p_year_id and r.day = p_day
                  and r.class_id = p_class_id and r.section_id = p_section_id) as status
        from public.enrollments e
        join public.students s on s.id = e.student_id
        where e.year_id = p_year_id and e.class_id = p_class_id
          and e.section_id = p_section_id and e.status = 'active') x), '[]'::jsonb)
  );
end $$;
grant execute on function public.get_register(text,text,text,date) to authenticated;

create or replace function public.get_attendance_summary(
  p_year_id text, p_class_id text default null, p_section_id text default null,
  p_from date default null, p_to date default null)
returns table (student_id text, full_name text, roll_number integer,
               present bigint, absent bigint, late bigint, total bigint, pct numeric)
language plpgsql security definer stable as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  return query
  select s.id,
         btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')),
         e.roll_number,
         count(*) filter (where ae.status = 'present'),
         count(*) filter (where ae.status = 'absent'),
         count(*) filter (where ae.status = 'late'),
         count(ae.*),
         case when count(ae.*) = 0 then 0
              else round(100.0 * (count(*) filter (where ae.status = 'present')
                                + 0.5 * count(*) filter (where ae.status = 'late'))
                         / count(ae.*), 1) end
  from public.enrollments e
  join public.students s on s.id = e.student_id
  left join public.attendance_entries ae
         on ae.student_id = e.student_id and ae.year_id = e.year_id
  left join public.attendance_registers r on r.id = ae.register_id
  where e.year_id = p_year_id
    and (p_class_id   is null or e.class_id   = p_class_id)
    and (p_section_id is null or e.section_id = p_section_id)
    and (p_from is null or r.day >= p_from)
    and (p_to   is null or r.day <= p_to)
    and (
      me.role = 'admin'
      or (me.role = 'student'  and e.student_id = me.student_id)
      or (me.role = 'guardian' and exists (select 1 from public.guardian_students g
            where g.guardian_id = me.id and g.student_id = e.student_id))
      or (me.role = 'teacher'  and exists (select 1 from public.teacher_assignments ta
            where ta.teacher_id = me.teacher_id and ta.year_id = e.year_id
              and ta.class_id = e.class_id and ta.section_id = e.section_id))
    )
  group by s.id, s.first_name, s.last_name, e.roll_number
  order by e.roll_number nulls last;
end $$;
grant execute on function public.get_attendance_summary(text,text,text,date,date) to authenticated;

/* =========================================================================
   Fees — paged, with the outstanding filter the bursar actually uses.
   ========================================================================= */

create or replace function public.list_fees(
  p_year_id text default null, p_class_id text default null,
  p_section_id text default null, p_only_outstanding boolean default false,
  p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (fee_id text, student_id text, full_name text, class_id text, section_id text,
               label text, amount numeric, paid numeric, due_date date, term_id text,
               total_count bigint, total_billed numeric, total_paid numeric)
language plpgsql security definer stable as $$
declare
  yr text := coalesce(p_year_id, public.current_year_id());
  me public.profiles;
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  select * into me from public.profiles where id = auth.uid() and status = 'active';
  if me.id is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  return query
  with rows_ as (
    select f.id, f.student_id, f.label, f.amount, f.paid, f.due_date, f.term_id,
           e.class_id, e.section_id,
           btrim(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')) as fname
    from public.fee_items f
    join public.students s on s.id = f.student_id
    left join public.enrollments e on e.student_id = f.student_id and e.year_id = yr
    where f.year_id = yr
      and (p_class_id is null or e.class_id = p_class_id)
      and (p_section_id is null or e.section_id = p_section_id)
      and (not p_only_outstanding or f.paid < f.amount)
      and (q is null or s.reg_no ilike '%'||q||'%'
           or (coalesce(s.first_name,'')||' '||coalesce(s.last_name,'')) ilike '%'||q||'%')
      and (
        me.role = 'admin'
        or (me.role = 'student'  and f.student_id = me.student_id)
        or (me.role = 'guardian' and exists (select 1 from public.guardian_students g
              where g.guardian_id = me.id and g.student_id = f.student_id))
        or (me.role = 'teacher'  and public.has_perm('fees.view') and exists (
              select 1 from public.teacher_assignments ta
              where ta.teacher_id = me.teacher_id and ta.year_id = yr
                and ta.class_id = e.class_id and ta.section_id = e.section_id))
      )
  ),
  agg as (select count(*) n, coalesce(sum(amount),0) b, coalesce(sum(paid),0) p from rows_)
  select r.id, r.student_id, r.fname, r.class_id, r.section_id, r.label,
         r.amount, r.paid, r.due_date, r.term_id, a.n, a.b, a.p
  from rows_ r cross join agg a
  order by (r.amount - r.paid) desc, r.due_date nulls last
  limit lim offset greatest(coalesce(p_offset,0), 0);
end $$;
grant execute on function public.list_fees(text,text,text,boolean,text,integer,integer) to authenticated;

/* =========================================================================
   Messages & notifications — keyset pagination.
   OFFSET gets slower the deeper you page; "everything before this timestamp"
   stays constant-time forever, which is what a chat thread needs.
   ========================================================================= */

create or replace function public.list_messages(
  p_conversation_id text, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_id uuid, body text, read_by uuid[], created_at timestamptz)
language sql security invoker stable as $$
  select m.id, m.sender_id, m.body, m.read_by, m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;
grant execute on function public.list_messages(text,timestamptz,integer) to authenticated;

create or replace function public.list_conversations(
  p_year_id text default null, p_limit integer default 30, p_offset integer default 0)
returns jsonb language sql security invoker stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
  from (
    select c.id, c.year_id, c.status, c.updated_at,
           c.related_student_id, c.related_class_id, c.related_section_id, c.related_subject_id,
           (select jsonb_agg(cp.profile_id) from public.conversation_participants cp
             where cp.conversation_id = c.id) as participants,
           (select jsonb_build_object('body', m.body, 'at', m.created_at, 'sender', m.sender_id)
              from public.messages m where m.conversation_id = c.id
             order by m.created_at desc limit 1) as last_message,
           (select count(*) from public.messages m
             where m.conversation_id = c.id and not (auth.uid() = any(m.read_by))) as unread
    from public.conversations c
    where c.year_id = coalesce(p_year_id, public.current_year_id())
      and public.is_conversation_member(c.id)
    order by c.updated_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ) x;
$$;
grant execute on function public.list_conversations(text,integer,integer) to authenticated;

create or replace function public.list_notifications(
  p_before timestamptz default null, p_limit integer default 30, p_unread_only boolean default false)
returns table (id uuid, type text, title text, body text, is_read boolean,
               year_id text, created_at timestamptz)
language sql security invoker stable as $$
  select n.id, n.type, n.title, n.body, n.is_read, n.year_id, n.created_at
  from public.notifications n
  where n.profile_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
    and (not p_unread_only or not n.is_read)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
grant execute on function public.list_notifications(timestamptz,integer,boolean) to authenticated;

create or replace function public.list_audit(
  p_year_id text default null, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, actor_name text, action text, target text, detail text, at timestamptz)
language sql security invoker stable as $$
  select a.id, a.actor_name, a.action, a.target, a.detail, a.at
  from public.audit_log a
  where (p_year_id is null or a.year_id = p_year_id)
    and (p_before is null or a.at < p_before)
  order by a.at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
grant execute on function public.list_audit(text,timestamptz,integer) to authenticated;
`,ne=`-- ===========================================================================
-- 0025_year_lifecycle.sql — what was missing: how a school STARTS a new year
--
-- Once every record is tied to an academic year, the obvious next question is
-- the one the schema had no answer for: what happens in September? Today an
-- administrator would have to hand-create a new year and then re-enter every
-- teacher assignment, every timetable slot, every assessment structure, every
-- grade band, and re-enroll every student one at a time. At 3,000 students
-- that is not a feature gap, it is a reason the system gets abandoned.
--
-- This migration adds:
--   * fee_templates          — define a fee once per class, not once per child
--   * set_active_year()      — safe, audited switch of the active year
--   * rollover_year()        — copy a year's *structure* into the next one
--   * promote_students()     — move enrollments up a level, graduate the top
--   * apply_fee_template()   — bill a whole class in one statement
--   * close_year()           — freeze a finished year against further edits
-- ===========================================================================

/* =========================================================================
   1. Fee templates — the missing layer between "a fee exists" and
      "3,000 fee_items rows".
   ========================================================================= */

create table if not exists public.fee_templates (
  id          text primary key,
  year_id     text not null references public.academic_years(id) on delete cascade,
  class_id    text references public.classes(id) on delete cascade,  -- null = all classes
  term_id     text references public.terms(id) on delete set null,
  label       text not null,
  amount      numeric(10,2) not null check (amount >= 0),
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (year_id, class_id, term_id, label)
);
create index if not exists ix_fee_templates_year on public.fee_templates (year_id, class_id);

alter table public.fee_items add column if not exists template_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fk_fee_items_template') then
    alter table public.fee_items
      add constraint fk_fee_items_template foreign key (template_id)
      references public.fee_templates(id) on delete set null;
  end if;
end $$;
-- A student is billed for a given template exactly once.
create unique index if not exists uq_fee_item_student_template
  on public.fee_items (student_id, template_id) where template_id is not null;

alter table public.fee_templates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'fee_templates_sel') then
    create policy fee_templates_sel on public.fee_templates for select to authenticated
      using (public.has_perm('fees.view') or public.is_admin());
    create policy fee_templates_wri on public.fee_templates for all to authenticated
      using (public.has_perm('fees.manage')) with check (public.has_perm('fees.manage'));
  end if;
end $$;

drop trigger if exists trg_updated_at on public.fee_templates;
create trigger trg_updated_at before update on public.fee_templates
for each row execute function public.set_updated_at();

-- Same year/term consistency guard the fee items get.
drop trigger if exists trg_fee_template_term_year on public.fee_templates;
create trigger trg_fee_template_term_year before insert or update on public.fee_templates
for each row execute function public.tg_check_term_year();

/* =========================================================================
   2. A year can be closed. A closed year is history — readable forever,
      not editable by accident.
   ========================================================================= */

alter table public.academic_years add column if not exists status text not null default 'open';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'academic_years_status_check') then
    alter table public.academic_years
      add constraint academic_years_status_check check (status in ('planned','open','closed'));
  end if;
end $$;

create or replace function public.year_is_open(p_year_id text)
returns boolean language sql security definer stable as $$
  select coalesce((select status <> 'closed' from public.academic_years where id = p_year_id), false);
$$;
grant execute on function public.year_is_open(text) to authenticated;

-- Block writes into a closed year on the tables that carry real records.
-- A null year_id means the row's year has not been resolved yet (see the
-- inherit trigger in 0021, which runs first by name). Nothing to guard in
-- that case — let it through rather than rejecting a legitimate write.
create or replace function public.tg_block_closed_year()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then
    if old.year_id is not null and not public.year_is_open(old.year_id) then
      raise exception 'academic year % is closed', old.year_id using errcode = '42501';
    end if;
    return old;
  end if;
  if new.year_id is not null and not public.year_is_open(new.year_id) then
    raise exception 'academic year % is closed', new.year_id using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'enrollments','attendance_registers','attendance_entries','assessment_marks',
    'fee_items','homework','timetable_entries','teacher_assignments','assessment_structures'
  ] loop
    execute format(
      'drop trigger if exists trg_block_closed_year on public.%I;
       create trigger trg_block_closed_year before insert or update or delete on public.%I
       for each row execute function public.tg_block_closed_year();', t, t);
  end loop;
end $$;

/* =========================================================================
   3. Switching the active year.
   ========================================================================= */

create or replace function public.set_active_year(p_year_id text)
returns void language plpgsql security definer as $$
declare sid text;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select school_id into sid from public.academic_years where id = p_year_id;
  if sid is null then raise exception 'unknown academic year %', p_year_id; end if;

  -- The partial unique index allows only one active year per school, so the
  -- old one must be cleared before the new one is set.
  update public.academic_years set is_active = false where school_id = sid and is_active;
  update public.academic_years set is_active = true, status = 'open' where id = p_year_id;

  perform public.log_action('year.activate', p_year_id, 'Active academic year switched');
end $$;
grant execute on function public.set_active_year(text) to authenticated;

create or replace function public.close_year(p_year_id text)
returns void language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if (select is_active from public.academic_years where id = p_year_id) then
    raise exception 'cannot close the active year — activate the next year first';
  end if;
  update public.academic_years set status = 'closed' where id = p_year_id;
  perform public.log_action('year.close', p_year_id, 'Academic year closed to further edits');
end $$;
grant execute on function public.close_year(text) to authenticated;

/* =========================================================================
   4. Rollover — copy a year's STRUCTURE (not its records) into a new year.

      Copied:    teacher assignments, timetable, grade bands, assessment
                 structures + items, fee templates.
      Not copied: marks, attendance, fees, homework, messages. Those are the
                 previous year's record and stay there.
   ========================================================================= */

create or replace function public.rollover_year(
  p_from_year text,
  p_to_year   text,
  p_copy_assignments boolean default true,
  p_copy_timetable   boolean default true,
  p_copy_structures  boolean default true,
  p_copy_fees        boolean default true
)
returns jsonb language plpgsql security definer as $$
declare
  n_assign int := 0; n_time int := 0; n_struct int := 0;
  n_items int := 0; n_bands int := 0; n_fees int := 0;
  term_map jsonb := '{}'::jsonb;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_from_year = p_to_year then raise exception 'source and target year are the same'; end if;
  if not exists (select 1 from public.academic_years where id = p_from_year) then
    raise exception 'unknown source year %', p_from_year; end if;
  if not public.year_is_open(p_to_year) then
    raise exception 'target year % is closed', p_to_year; end if;

  -- Terms are matched by sequence number, so "Term 1" maps to "Term 1".
  select coalesce(jsonb_object_agg(f.id, t.id), '{}'::jsonb) into term_map
  from public.terms f
  join public.terms t on t.year_id = p_to_year and t.seq = f.seq
  where f.year_id = p_from_year;

  if p_copy_assignments then
    insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
    select p_to_year || '-' || md5(a.class_id || a.section_id || a.subject_id),
           p_to_year, a.class_id, a.section_id, a.subject_id, a.teacher_id
    from public.teacher_assignments a
    where a.year_id = p_from_year
    on conflict (year_id, class_id, section_id, subject_id) do nothing;
    get diagnostics n_assign = row_count;
  end if;

  if p_copy_timetable then
    insert into public.timetable_entries (id, year_id, class_id, section_id, day, period, subject_id, room)
    select p_to_year || '-tt-' || md5(t.class_id || t.section_id || t.day || t.period),
           p_to_year, t.class_id, t.section_id, t.day, t.period, t.subject_id, t.room
    from public.timetable_entries t
    where t.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_time = row_count;
  end if;

  -- Grade bands: the grading scale almost never changes between years, and a
  -- year with no bands renders every report card as "—".
  insert into public.grade_bands (id, school_id, year_id, min_pct, max_pct, grade, remark, sort)
  select p_to_year || '-gb-' || g.sort, g.school_id, p_to_year,
         g.min_pct, g.max_pct, g.grade, g.remark, g.sort
  from public.grade_bands g
  where g.year_id = p_from_year
  on conflict do nothing;
  get diagnostics n_bands = row_count;

  if p_copy_structures then
    insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id)
    select p_to_year || '-as-' || md5(s.class_id || s.subject_id || coalesce(s.term_id,'')),
           p_to_year, s.class_id, s.subject_id, (term_map->>s.term_id)
    from public.assessment_structures s
    where s.year_id = p_from_year
      and (s.term_id is null or term_map ? s.term_id)
    on conflict (year_id, class_id, subject_id, term_id) do nothing;
    get diagnostics n_struct = row_count;

    -- The items (Quiz 1, Midterm, Final…) that make each structure meaningful.
    insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort)
    select md5(ns.id || i.name || i.sort), ns.id, i.name, i.max_mark, i.weight, i.sort
    from public.assessment_structures os
    join public.assessment_items i on i.structure_id = os.id
    join public.assessment_structures ns
      on ns.year_id = p_to_year and ns.class_id = os.class_id
     and ns.subject_id = os.subject_id
     and ns.term_id is not distinct from (term_map->>os.term_id)
    where os.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_items = row_count;
  end if;

  if p_copy_fees then
    insert into public.fee_templates (id, year_id, class_id, term_id, label, amount, due_date)
    select p_to_year || '-ft-' || md5(coalesce(f.class_id,'*') || f.label),
           p_to_year, f.class_id, (term_map->>f.term_id), f.label, f.amount, null
    from public.fee_templates f
    where f.year_id = p_from_year
    on conflict (year_id, class_id, term_id, label) do nothing;
    get diagnostics n_fees = row_count;
  end if;

  perform public.log_action('year.rollover', p_to_year,
    format('Structure copied from %s', p_from_year));

  return jsonb_build_object(
    'fromYear', p_from_year, 'toYear', p_to_year,
    'assignments', n_assign, 'timetable', n_time, 'gradeBands', n_bands,
    'structures', n_struct, 'assessmentItems', n_items, 'feeTemplates', n_fees);
end $$;
grant execute on function public.rollover_year(text,text,boolean,boolean,boolean,boolean) to authenticated;

/* =========================================================================
   5. Promotion — move students up a class level in the new year.

      Set-based: one statement for the whole school, not 3,000 round trips.
      Idempotent: enrollments has unique (student_id, year_id), so re-running
      a promotion cannot duplicate anyone.
   ========================================================================= */

create or replace function public.promote_students(
  p_from_year text,
  p_to_year   text,
  p_class_id  text default null,          -- null = whole school
  p_graduate_top boolean default true     -- top level leaves rather than repeating
)
returns jsonb language plpgsql security definer as $$
declare
  n_promoted int := 0; n_graduated int := 0; top_level int;
begin
  if not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.year_is_open(p_to_year) then
    raise exception 'target year % is closed', p_to_year; end if;

  select max(level) into top_level from public.classes;

  -- Everyone below the top level moves into the class one level up, keeping
  -- their section name where that section exists in the new class.
  with moved as (
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, roll_number, status, enrolled_on)
    select p_to_year || '-' || e.student_id, e.student_id, p_to_year,
           nc.id,
           coalesce(
             (select ns.id from public.sections ns
               join public.sections os on os.id = e.section_id
              where ns.class_id = nc.id and ns.name = os.name),
             (select ns.id from public.sections ns where ns.class_id = nc.id order by ns.name limit 1)
           ),
           e.roll_number, 'active', current_date
    from public.enrollments e
    join public.classes c  on c.id = e.class_id
    join public.classes nc on nc.level = c.level + 1
    where e.year_id = p_from_year
      and e.status = 'active'
      and (p_class_id is null or e.class_id = p_class_id)
      and (not p_graduate_top or c.level < top_level)
      and not exists (select 1 from public.enrollments x
                      where x.student_id = e.student_id and x.year_id = p_to_year)
    returning 1
  ) select count(*) into n_promoted from moved;

  if p_graduate_top then
    with grad as (
      update public.students s set status = 'graduated'
      where s.status = 'active' and exists (
        select 1 from public.enrollments e
        join public.classes c on c.id = e.class_id
        where e.student_id = s.id and e.year_id = p_from_year
          and e.status = 'active' and c.level = top_level
          and (p_class_id is null or e.class_id = p_class_id))
      returning 1
    ) select count(*) into n_graduated from grad;
  end if;

  perform public.log_action('year.promote', p_to_year,
    format('%s promoted, %s graduated from %s', n_promoted, n_graduated, p_from_year));

  return jsonb_build_object('promoted', n_promoted, 'graduated', n_graduated,
                            'fromYear', p_from_year, 'toYear', p_to_year);
end $$;
grant execute on function public.promote_students(text,text,text,boolean) to authenticated;

/* =========================================================================
   6. Billing a whole class from a template — one statement, any size.
   ========================================================================= */

create or replace function public.apply_fee_template(p_template_id text)
returns jsonb language plpgsql security definer as $$
declare t public.fee_templates; n int := 0;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into t from public.fee_templates where id = p_template_id;
  if t.id is null then raise exception 'unknown fee template %', p_template_id; end if;
  if not public.year_is_open(t.year_id) then
    raise exception 'academic year % is closed', t.year_id; end if;

  with billed as (
    insert into public.fee_items (id, student_id, year_id, term_id, label, amount, paid, due_date, template_id)
    select md5(t.id || e.student_id), e.student_id, t.year_id, t.term_id,
           t.label, t.amount, 0, t.due_date, t.id
    from public.enrollments e
    where e.year_id = t.year_id
      and e.status = 'active'
      and (t.class_id is null or e.class_id = t.class_id)
    on conflict (student_id, template_id) do nothing
    returning 1
  ) select count(*) into n from billed;

  perform public.log_action('fees.bill', t.id, format('%s students billed for %s', n, t.label));
  return jsonb_build_object('templateId', t.id, 'billed', n);
end $$;
grant execute on function public.apply_fee_template(text) to authenticated;

/* =========================================================================
   7. Creating the next year in one call, so the console has something to
      point at.
   ========================================================================= */

create or replace function public.create_academic_year(
  p_id text, p_name text, p_start date, p_end date, p_terms text[] default array['Term 1','Term 2','Term 3'])
returns jsonb language plpgsql security definer as $$
declare sid text; i int;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select id into sid from public.schools order by id limit 1;

  insert into public.academic_years (id, school_id, name, start_date, end_date, is_active, status)
  values (p_id, sid, p_name, p_start, p_end, false, 'planned')
  on conflict (id) do nothing;

  for i in 1 .. coalesce(array_length(p_terms, 1), 0) loop
    insert into public.terms (id, year_id, name, seq)
    values (p_id || '-t' || i, p_id, p_terms[i], i)
    on conflict (year_id, name) do nothing;
  end loop;

  perform public.log_action('year.create', p_id, p_name);
  return jsonb_build_object('yearId', p_id, 'terms', coalesce(array_length(p_terms, 1), 0));
end $$;
grant execute on function public.create_academic_year(text,text,date,date,text[]) to authenticated;
`,te=`-- ===========================================================================
-- 0026_write_api.sql — every write becomes one intentional statement
--
-- THE PROBLEM THIS SOLVES
-- \`sync()\` in src/lib/backend.ts takes the previous in-memory DB and the new
-- one, diffs ~22 tables, and applies the delta. Changing a single mark means
-- serialising every student, every fee, every homework row and every
-- announcement in the school — twice — to discover that one number moved.
-- That is the write-path equivalent of the bootstrap problem: correct at 300
-- students, untenable at 5,000, and it gets worse every year.
--
-- It also has a correctness problem that has nothing to do with size. Two
-- people editing different students at the same time each hold a full
-- snapshot; whoever saves second writes their entire snapshot over the first
-- person's change. Last-writer-wins across the whole database, silently.
--
-- The functions below each do one thing, take only what changed, run in a
-- single transaction, and check permission themselves. \`save_student_marks\`
-- in 0002 was already the right shape — this extends that pattern to the
-- rest of the write surface.
--
-- All are SECURITY DEFINER with an explicit permission check as the first
-- statement. That check is not optional decoration; it is the authorization.
-- ===========================================================================

/* =========================================================================
   Attendance — one register, one statement.
   p_marks: {"st1":"present","st2":"absent",…}
   ========================================================================= */

create or replace function public.save_register(
  p_year_id text, p_class_id text, p_section_id text, p_day date, p_marks jsonb)
returns jsonb language plpgsql security definer as $$
declare reg_id text; n int := 0;
begin
  if not public.has_perm('attendance.manage') and not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.can_see_section(p_class_id, p_section_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.year_is_open(p_year_id) then
    raise exception 'academic year % is closed', p_year_id using errcode = '42501';
  end if;

  reg_id := p_year_id || '-' || to_char(p_day, 'YYYYMMDD') || '-' || p_class_id || '-' || p_section_id;

  insert into public.attendance_registers (id, year_id, day, class_id, section_id, recorded_by)
  values (reg_id, p_year_id, p_day, p_class_id, p_section_id, auth.uid())
  on conflict (year_id, day, class_id, section_id) do update
    set recorded_by = auth.uid()
  returning id into reg_id;

  -- Only students actually enrolled in this section this year can be marked,
  -- however the client built its payload.
  with incoming as (
    select key as student_id, value #>> '{}' as status
    from jsonb_each(p_marks)
  ), valid as (
    select i.student_id, i.status
    from incoming i
    join public.enrollments e
      on e.student_id = i.student_id and e.year_id = p_year_id
     and e.class_id = p_class_id and e.section_id = p_section_id and e.status = 'active'
    where i.status in ('present','absent','late')
  ), written as (
    insert into public.attendance_entries (id, register_id, student_id, status)
    select reg_id || '-' || v.student_id, reg_id, v.student_id, v.status from valid v
    on conflict (register_id, student_id) do update set status = excluded.status
    returning 1
  ) select count(*) into n from written;

  -- Anyone removed from the payload is no longer marked.
  delete from public.attendance_entries ae
  where ae.register_id = reg_id and not (p_marks ? ae.student_id);

  perform public.log_action('attendance.save', reg_id, format('%s students marked', n));
  return jsonb_build_object('registerId', reg_id, 'saved', n);
end $$;
grant execute on function public.save_register(text,text,text,date,jsonb) to authenticated;

/* =========================================================================
   Messaging
   ========================================================================= */

create or replace function public.send_message(p_conversation_id text, p_body text)
returns jsonb language plpgsql security definer as $$
declare new_id uuid; recipients uuid[];
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'message body is empty';
  end if;

  insert into public.messages (conversation_id, sender_id, body, read_by)
  values (p_conversation_id, auth.uid(), btrim(p_body), array[auth.uid()])
  returning id into new_id;

  update public.conversations set updated_at = now() where id = p_conversation_id;

  select array_agg(profile_id) into recipients
  from public.conversation_participants
  where conversation_id = p_conversation_id and profile_id <> auth.uid();

  if recipients is not null then
    perform public.notify_users(recipients, 'message', 'New message',
      left(btrim(p_body), 120));
  end if;

  return jsonb_build_object('id', new_id);
end $$;
grant execute on function public.send_message(text,text) to authenticated;

create or replace function public.mark_notifications_read(p_ids text[] default null)
returns integer language plpgsql security definer as $$
declare n int;
begin
  update public.notifications
     set is_read = true
   where profile_id = auth.uid()
     and not is_read
     and (p_ids is null or id::text = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_notifications_read(text[]) to authenticated;

/* =========================================================================
   Fees — payments are money, so this one is deliberately strict.
   ========================================================================= */

create or replace function public.record_fee_payment(
  p_fee_item_id text, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare f public.fee_items; new_paid numeric;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  -- Row lock: two bursars posting against the same fee at the same moment
  -- would otherwise both read the old \`paid\` and the second would overwrite
  -- the first. This is exactly the class of bug snapshot-diffing produced.
  select * into f from public.fee_items where id = p_fee_item_id for update;
  if f.id is null then raise exception 'unknown fee item %', p_fee_item_id; end if;
  if not public.year_is_open(f.year_id) then
    raise exception 'academic year % is closed', f.year_id using errcode = '42501';
  end if;

  new_paid := f.paid + p_amount;
  if new_paid > f.amount then
    raise exception 'payment of % exceeds the % outstanding', p_amount, f.amount - f.paid;
  end if;

  update public.fee_items set paid = new_paid where id = f.id;

  perform public.log_action('fees.payment', f.id,
    format('%s recorded against %s%s', p_amount, f.label,
           case when p_note is null then '' else ' — ' || p_note end));

  return jsonb_build_object('feeItemId', f.id, 'paid', new_paid,
                            'outstanding', f.amount - new_paid);
end $$;
grant execute on function public.record_fee_payment(text,numeric,text) to authenticated;

/* =========================================================================
   Mark submission workflow — the state machine, server-side.
   The existing tg_submission_state trigger validates transitions; this is
   the single entry point that drives them.
   ========================================================================= */

create or replace function public.set_submission_status(
  p_structure_id text, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer as $$
declare cur text;
begin
  cur := public.structure_status(p_structure_id);

  -- Who may make which move. Deliberately explicit rather than a generic
  -- "can edit marks" check: publishing results is not the same authority as
  -- entering them, and conflating the two is how marks reach families early.
  if p_status = 'submitted' then
    if not public.teacher_can_write_structure(p_structure_id) and not public.is_admin() then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status in ('approved','returned') then
    if not public.has_perm('results.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status = 'published' then
    if not public.has_perm('results.publish') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status = 'draft' then
    if not public.has_perm('results.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    raise exception 'unknown status %', p_status;
  end if;

  insert into public.mark_submissions (id, structure_id, status)
  values ('ms-' || p_structure_id, p_structure_id, p_status)
  on conflict (structure_id) do update set
    status        = p_status,
    submitted_by  = case when p_status = 'submitted' then auth.uid() else public.mark_submissions.submitted_by end,
    submitted_at  = case when p_status = 'submitted' then now()      else public.mark_submissions.submitted_at end,
    approved_by   = case when p_status = 'approved'  then auth.uid() else public.mark_submissions.approved_by end,
    approved_at   = case when p_status = 'approved'  then now()      else public.mark_submissions.approved_at end,
    returned_by   = case when p_status = 'returned'  then auth.uid() else public.mark_submissions.returned_by end,
    returned_at   = case when p_status = 'returned'  then now()      else public.mark_submissions.returned_at end,
    return_reason = case when p_status = 'returned'  then p_reason   else public.mark_submissions.return_reason end,
    published_by  = case when p_status = 'published' then auth.uid() else public.mark_submissions.published_by end,
    published_at  = case when p_status = 'published' then now()      else public.mark_submissions.published_at end,
    reopen_reason = case when p_status = 'draft'     then p_reason   else public.mark_submissions.reopen_reason end;

  perform public.log_action('marks.' || p_status, p_structure_id,
    coalesce(p_reason, format('%s → %s', cur, p_status)));

  return jsonb_build_object('structureId', p_structure_id, 'from', cur, 'to', p_status);
end $$;
grant execute on function public.set_submission_status(text,text,text) to authenticated;

/* =========================================================================
   Students — create/update through one door, with an explicit column
   whitelist. A client cannot set \`id\`, \`school_id\`, or \`status\` by smuggling
   them into the payload, because only the keys named below are ever read.
   ========================================================================= */

create or replace function public.save_student(p_payload jsonb, p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  sid text := nullif(p_payload->>'id', '');
  yr  text := coalesce(p_year_id, public.current_year_id());
  sch text;
  is_new boolean := sid is null;
begin
  if is_new then
    if not public.has_perm('students.create') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    if not public.has_perm('students.edit') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  if is_new then sid := 'st-' || replace(gen_random_uuid()::text, '-', ''); end if;

  insert into public.students (
    id, school_id, reg_no, admission_no, first_name, middle_name, last_name,
    gender, dob, phone, email, address, guardian_name, guardian_relation,
    guardian_phone, guardian_address, mother_name, admission_date,
    previous_school, admission_type, photo_path)
  values (
    sid, sch,
    coalesce(p_payload->>'reg_no', sid),
    p_payload->>'admission_no',
    p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name',
    coalesce(p_payload->>'gender', 'Male'),
    (p_payload->>'dob')::date,
    p_payload->>'phone', p_payload->>'email', p_payload->>'address',
    p_payload->>'guardian_name', p_payload->>'guardian_relation',
    p_payload->>'guardian_phone', p_payload->>'guardian_address',
    p_payload->>'mother_name',
    nullif(p_payload->>'admission_date','')::date,
    p_payload->>'previous_school', p_payload->>'admission_type',
    p_payload->>'photo_path')
  on conflict (id) do update set
    reg_no            = coalesce(excluded.reg_no, public.students.reg_no),
    admission_no      = excluded.admission_no,
    first_name        = excluded.first_name,
    middle_name       = excluded.middle_name,
    last_name         = excluded.last_name,
    gender            = excluded.gender,
    dob               = excluded.dob,
    phone             = excluded.phone,
    email             = excluded.email,
    address           = excluded.address,
    guardian_name     = excluded.guardian_name,
    guardian_relation = excluded.guardian_relation,
    guardian_phone    = excluded.guardian_phone,
    guardian_address  = excluded.guardian_address,
    mother_name       = excluded.mother_name,
    admission_date    = excluded.admission_date,
    previous_school   = excluded.previous_school,
    admission_type    = excluded.admission_type,
    photo_path        = coalesce(excluded.photo_path, public.students.photo_path);

  -- Enrollment for the selected year, if the caller supplied a placement.
  if (p_payload ? 'class_id') and (p_payload ? 'section_id') then
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, roll_number, status, enrolled_on)
    values (yr || '-' || sid, sid, yr,
            p_payload->>'class_id', p_payload->>'section_id',
            nullif(p_payload->>'roll_number','')::integer, 'active', current_date)
    on conflict (student_id, year_id) do update set
      class_id    = excluded.class_id,
      section_id  = excluded.section_id,
      roll_number = excluded.roll_number;
  end if;

  perform public.log_action(
    case when is_new then 'student.create' else 'student.update' end, sid,
    btrim(coalesce(p_payload->>'first_name','') || ' ' || coalesce(p_payload->>'last_name','')));

  return jsonb_build_object('studentId', sid, 'created', is_new);
end $$;
grant execute on function public.save_student(jsonb,text) to authenticated;

create or replace function public.set_student_status(p_student_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('active','transferred','withdrawn','graduated') then
    raise exception 'unknown status %', p_status;
  end if;
  update public.students set status = p_status where id = p_student_id;
  perform public.log_action('student.status', p_student_id, p_status);
  return jsonb_build_object('studentId', p_student_id, 'status', p_status);
end $$;
grant execute on function public.set_student_status(text,text) to authenticated;

/* =========================================================================
   File metadata — the browser used to insert into and delete from
   \`file_objects\` directly. It can't any more (there is no table surface), so
   these are the two named operations that replace it. Both re-check the
   owner relationship rather than trusting the caller's word for it.
   ========================================================================= */

create or replace function public.register_file(
  p_owner_type text, p_owner_id text, p_storage_key text,
  p_original_name text default null, p_mime_type text default null,
  p_size_bytes bigint default null, p_kind text default null)
returns jsonb language plpgsql security definer as $$
declare new_id uuid;
begin
  if p_owner_type not in ('student_photo','student_document','fee_receipt') then
    raise exception 'unsupported owner type %', p_owner_type;
  end if;

  -- All three current owner types hang off a student, so the same check
  -- covers them. Add a branch here when a new owner type is introduced —
  -- and note that failing to do so denies access rather than granting it.
  if not public.can_view_student(p_owner_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_owner_type = 'student_photo' and not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  insert into public.file_objects (
    owner_type, owner_id, storage_key, original_name, mime_type, size_bytes, kind, uploaded_by)
  values (p_owner_type, p_owner_id, p_storage_key, p_original_name, p_mime_type,
          p_size_bytes, p_kind, auth.uid())
  on conflict (storage_key) do update set
    original_name = excluded.original_name,
    mime_type     = excluded.mime_type,
    size_bytes    = excluded.size_bytes,
    kind          = excluded.kind
  returning id into new_id;

  perform public.log_action('file.upload', p_storage_key, coalesce(p_original_name, p_owner_type));
  return jsonb_build_object('fileId', new_id, 'key', p_storage_key);
end $$;
grant execute on function public.register_file(text,text,text,text,text,bigint,text) to authenticated;

create or replace function public.unregister_file(p_storage_key text)
returns jsonb language plpgsql security definer as $$
declare f public.file_objects;
begin
  select * into f from public.file_objects where storage_key = p_storage_key;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;

  if not public.can_view_student(f.owner_id) or not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  delete from public.file_objects where id = f.id;
  perform public.log_action('file.delete', p_storage_key, f.original_name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.unregister_file(text) to authenticated;

/* =========================================================================
   Roles and user accounts — the last two things the browser used to write
   directly. Both are privilege-adjacent, which is exactly why they should
   never have been a raw table write: \`profiles.role\` and
   \`role_permissions\` decide what everyone else can do.
   ========================================================================= */

create or replace function public.save_role(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare rid text := p_payload->>'id'; perms text[];
begin
  if not public.has_perm('roles.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if rid is null or btrim(rid) = '' then raise exception 'role id is required'; end if;

  -- A system role's identity is fixed; only its permission set may move.
  if exists (select 1 from public.role_defs where id = rid and is_system) then
    if coalesce(p_payload->>'name','') <> '' and
       (select name from public.role_defs where id = rid) <> (p_payload->>'name') then
      raise exception 'built-in roles cannot be renamed';
    end if;
  end if;

  insert into public.role_defs (id, name, description, is_system, all_permissions, applies_to, status)
  values (rid,
          coalesce(p_payload->>'name', rid),
          p_payload->>'description',
          false,
          coalesce((p_payload->>'all_permissions')::boolean, false),
          coalesce(array(select jsonb_array_elements_text(p_payload->'applies_to')), '{}'),
          coalesce(p_payload->>'status', 'active'))
  on conflict (id) do update set
    name            = excluded.name,
    description     = excluded.description,
    all_permissions = excluded.all_permissions,
    applies_to      = excluded.applies_to,
    status          = excluded.status;

  -- Replace the permission set atomically, and only with permissions that
  -- actually exist — a typo silently granting nothing is better than a typo
  -- inserting a row nothing ever checks.
  if p_payload ? 'permissions' then
    perms := array(select jsonb_array_elements_text(p_payload->'permissions'));
    delete from public.role_permissions where role_def_id = rid;
    insert into public.role_permissions (role_def_id, permission_id)
    select rid, p.id from public.permissions p where p.id = any(perms);
  end if;

  perform public.log_action('role.save', rid, p_payload->>'name');
  return jsonb_build_object('roleId', rid);
end $$;
grant execute on function public.save_role(jsonb) to authenticated;

create or replace function public.update_user_account(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare uid uuid := (p_payload->>'id')::uuid; target public.profiles;
begin
  if not public.has_perm('users.manage') and not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into target from public.profiles where id = uid;
  if target.id is null then raise exception 'unknown user'; end if;

  -- You cannot disable or demote yourself. Locking the last administrator
  -- out of their own system is a support call nobody enjoys.
  if uid = auth.uid() and (
       coalesce(p_payload->>'status', target.status) <> 'active'
       or coalesce(p_payload->>'role_def_id', target.role_def_id) <> target.role_def_id) then
    raise exception 'you cannot change your own role or status';
  end if;

  update public.profiles set
    full_name   = coalesce(p_payload->>'full_name', full_name),
    email       = coalesce(p_payload->>'email', email),
    phone       = coalesce(p_payload->>'phone', phone),
    role_def_id = coalesce(p_payload->>'role_def_id', role_def_id),
    status      = coalesce(p_payload->>'status', status)
  where id = uid;

  -- Guardian-to-child links, replaced as a set when supplied.
  if p_payload ? 'children' then
    delete from public.guardian_students where guardian_id = uid;
    insert into public.guardian_students (guardian_id, student_id)
    select uid, s.id from public.students s
    where s.id = any(array(select jsonb_array_elements_text(p_payload->'children')))
    on conflict do nothing;
  end if;

  perform public.log_action('user.update', uid::text, target.username);
  return jsonb_build_object('userId', uid);
end $$;
grant execute on function public.update_user_account(jsonb) to authenticated;
`,se=`-- ===========================================================================
-- 0027_fee_payment_detail.sql — record_fee_payment keeps the transaction,
-- not just the new total.
--
-- WHY THIS EXISTS
-- 0006_fee_payments.sql added a \`payments jsonb\` column to fee_items so each
-- payment keeps its own method (cash / telebirr / cbe_birr / bank_transfer /
-- cheque), a reference number, and — for bank transfers — which bank it came
-- through. The UI (FeesPage.recordPayment) has always collected all of that.
--
-- But 0026_write_api.sql's record_fee_payment(fee_item_id, amount, note) only
-- ever touched the \`paid\` running total — it never appended to \`payments\`.
-- There was no server-side way to save the method/reference/bank at all, so
-- receipts and audit trails would have shown a number with no transaction
-- behind it. This replaces that function with one that does both, in the
-- same row-locked transaction.
--
-- The 3-argument signature is dropped rather than left as a second overload:
-- both versions accept (text, numeric, text) as their first three
-- parameters, and PostgREST/PostgreSQL can pick either when called by
-- argument name, so keeping both risks calling the wrong one silently.
-- ===========================================================================

drop function if exists public.record_fee_payment(text, numeric, text);

create or replace function public.record_fee_payment(
  p_fee_item_id text,
  p_amount numeric,
  p_method text default 'cash',
  p_reference text default null,
  p_bank text default null,
  p_note text default null)
returns jsonb language plpgsql security definer as $$
declare
  f public.fee_items;
  new_paid numeric;
  entry jsonb;
  recorder text;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if p_method not in ('cash','telebirr','cbe_birr','bank_transfer','cheque') then
    raise exception 'unknown payment method %', p_method;
  end if;
  if p_method <> 'cash' and coalesce(btrim(p_reference), '') = '' then
    raise exception '% requires a transaction reference', p_method;
  end if;

  -- Row lock: two bursars posting against the same fee at the same moment
  -- would otherwise both read the old \`paid\` and the second would overwrite
  -- the first. This is exactly the class of bug snapshot-diffing produced.
  select * into f from public.fee_items where id = p_fee_item_id for update;
  if f.id is null then raise exception 'unknown fee item %', p_fee_item_id; end if;
  if not public.year_is_open(f.year_id) then
    raise exception 'academic year % is closed', f.year_id using errcode = '42501';
  end if;

  new_paid := f.paid + p_amount;
  if new_paid > f.amount then
    raise exception 'payment of % exceeds the % outstanding', p_amount, f.amount - f.paid;
  end if;

  select full_name into recorder from public.profiles where id = auth.uid();

  entry := jsonb_build_object(
    'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
    'amount', p_amount,
    'method', p_method,
    'reference', nullif(btrim(coalesce(p_reference, '')), ''),
    'bank', case when p_method = 'bank_transfer' then p_bank else null end,
    'date', to_char(now(), 'YYYY-MM-DD'),
    'recordedBy', recorder);

  update public.fee_items
     set paid = new_paid,
         payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(entry)
   where id = f.id;

  perform public.log_action('fees.payment', f.id,
    format('%s recorded against %s%s', p_amount, f.label,
           case when p_note is null then '' else ' — ' || p_note end));

  return jsonb_build_object(
    'feeItemId', f.id, 'paid', new_paid,
    'outstanding', f.amount - new_paid, 'entry', entry);
end $$;
grant execute on function public.record_fee_payment(text,numeric,text,text,text,text) to authenticated;
`,ae=`-- ===========================================================================
-- 0028_fee_item_crud.sql — creating and removing a fee item, as named ops
--
-- 0026_write_api.sql gave \`record_fee_payment\` a real home but never covered
-- the other two fee_items writes the Fees page performs: billing a student
-- for a new item ("Add fee") and removing one that was added in error.
-- Both went through the generic upsert()/remove(), which 0026 disabled for
-- every table — so, same as students/marks/attendance/messages before this
-- round, they currently fail with "no longer go through snapshot syncing."
--
-- \`apply_fee_template()\` (0025) already covers billing a whole class at
-- once; \`create_fee_item\` is the one-student equivalent for a one-off charge
-- outside any template.
-- ===========================================================================

create or replace function public.create_fee_item(
  p_student_id text, p_label text, p_amount numeric, p_due_date date default null,
  p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  fid text := 'fee-' || replace(gen_random_uuid()::text, '-', '');
  yr text := coalesce(p_year_id, public.current_year_id());
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.can_view_student(p_student_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'a label is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if not public.year_is_open(yr) then
    raise exception 'academic year % is closed', yr using errcode = '42501';
  end if;

  insert into public.fee_items (id, student_id, label, amount, paid, due_date, year_id, payments)
  values (fid, p_student_id, btrim(p_label), p_amount, 0, p_due_date, yr, '[]'::jsonb);

  perform public.log_action('fees.create', fid, format('%s — %s', btrim(p_label), p_amount));
  return jsonb_build_object('feeItemId', fid);
end $$;
grant execute on function public.create_fee_item(text,text,numeric,date,text) to authenticated;

-- ===========================================================================
-- mark_message_read — the other half of 0026's send_message.
--
-- send_message() covers sending; nothing covered a message's read_by flip
-- (sent → read), so it went through the same disabled generic upsert as
-- everything else in this file. Realtime (0013) streams the change once
-- it happens — this is what makes it happen.
-- ===========================================================================

create or replace function public.mark_message_read(p_conversation_id text)
returns integer language plpgsql security definer as $$
declare n int;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.messages
     set read_by = read_by || array[auth.uid()]
   where conversation_id = p_conversation_id
     and sender_id <> auth.uid()
     and not (auth.uid() = any(read_by));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_message_read(text) to authenticated;

-- ===========================================================================
-- delete_role — RolesPage has always offered to delete a custom (non-system)
-- role. 0026's save_role covers create/update; nothing covered delete, so it
-- fell through to the same disabled generic remove() as everything else.
-- ===========================================================================

create or replace function public.delete_role(p_role_id text)
returns jsonb language plpgsql security definer as $$
declare r public.role_defs;
begin
  if not public.has_perm('roles.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into r from public.role_defs where id = p_role_id;
  if r.id is null then return jsonb_build_object('deleted', 0); end if;
  if r.is_system then raise exception 'system roles cannot be deleted'; end if;
  if exists (select 1 from public.profiles where role_def_id = r.id) then
    raise exception 'cannot delete a role that is still assigned to a user';
  end if;

  delete from public.role_defs where id = r.id; -- role_permissions cascades
  perform public.log_action('role.delete', p_role_id, r.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_role(text) to authenticated;

create or replace function public.delete_fee_item(p_fee_item_id text)
returns jsonb language plpgsql security definer as $$
declare f public.fee_items;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into f from public.fee_items where id = p_fee_item_id;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;
  if f.paid > 0 then
    raise exception 'cannot delete a fee item that already has payments recorded against it';
  end if;

  delete from public.fee_items where id = f.id;
  perform public.log_action('fees.delete', p_fee_item_id, f.label);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_fee_item(text) to authenticated;
`,ie=`-- ===========================================================================
-- 0029_save_student_stable_id.sql — a new student keeps the id the client
-- already gave it.
--
-- THE PROBLEM
-- save_student() (0026) decided "is this a create or an edit?" by whether
-- p_payload had an \`id\`: no id → generate one server-side. That matches a
-- UUID-keyed table, but students are the one entity this schema's own header
-- comment (0001_schema.sql) says keeps client-assigned short text ids
-- ("Text PKs preserve the application's existing identifiers"), and the
-- Registration wizard has always generated that id up front — before the
-- record is saved, and before it's known whether a login account will be
-- created in the same action.
--
-- Sending no id to let the server mint its own would leave the client
-- holding one id (used locally, and already wired into a new login
-- account's student_id in the same save) while the server used a different
-- one — a silent mismatch that would only surface later as a guardian or
-- teacher whose account points at a student that doesn't exist.
--
-- THE FIX
-- Always accept the client's id. "Is this new?" is now answered by whether
-- a row with that id already exists, not by whether an id was supplied —
-- which also means students.create vs students.edit is checked against
-- reality, not against what the client happened to send.
-- ===========================================================================

create or replace function public.save_student(p_payload jsonb, p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  sid text := nullif(p_payload->>'id', '');
  yr  text := coalesce(p_year_id, public.current_year_id());
  sch text;
  is_new boolean;
begin
  if sid is null then
    raise exception 'a student id is required';
  end if;
  is_new := not exists (select 1 from public.students where id = sid);

  if is_new then
    if not public.has_perm('students.create') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    if not public.has_perm('students.edit') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.students (
    id, school_id, reg_no, admission_no, first_name, middle_name, last_name,
    gender, dob, phone, email, address, guardian_name, guardian_relation,
    guardian_phone, guardian_address, mother_name, admission_date,
    previous_school, admission_type, photo_path)
  values (
    sid, sch,
    coalesce(p_payload->>'reg_no', sid),
    p_payload->>'admission_no',
    p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name',
    coalesce(p_payload->>'gender', 'Male'),
    (p_payload->>'dob')::date,
    p_payload->>'phone', p_payload->>'email', p_payload->>'address',
    p_payload->>'guardian_name', p_payload->>'guardian_relation',
    p_payload->>'guardian_phone', p_payload->>'guardian_address',
    p_payload->>'mother_name',
    nullif(p_payload->>'admission_date','')::date,
    p_payload->>'previous_school', p_payload->>'admission_type',
    p_payload->>'photo_path')
  on conflict (id) do update set
    reg_no            = coalesce(excluded.reg_no, public.students.reg_no),
    admission_no      = excluded.admission_no,
    first_name        = excluded.first_name,
    middle_name       = excluded.middle_name,
    last_name         = excluded.last_name,
    gender            = excluded.gender,
    dob               = excluded.dob,
    phone             = excluded.phone,
    email             = excluded.email,
    address           = excluded.address,
    guardian_name     = excluded.guardian_name,
    guardian_relation = excluded.guardian_relation,
    guardian_phone    = excluded.guardian_phone,
    guardian_address  = excluded.guardian_address,
    mother_name       = excluded.mother_name,
    admission_date    = excluded.admission_date,
    previous_school   = excluded.previous_school,
    admission_type    = excluded.admission_type,
    photo_path        = coalesce(excluded.photo_path, public.students.photo_path);

  if (p_payload ? 'class_id') and (p_payload ? 'section_id') then
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, roll_number, status, enrolled_on)
    values (yr || '-' || sid, sid, yr,
            p_payload->>'class_id', p_payload->>'section_id',
            nullif(p_payload->>'roll_number','')::integer, 'active', current_date)
    on conflict (student_id, year_id) do update set
      class_id    = excluded.class_id,
      section_id  = excluded.section_id,
      roll_number = excluded.roll_number;
  end if;

  perform public.log_action(
    case when is_new then 'student.create' else 'student.update' end, sid,
    btrim(coalesce(p_payload->>'first_name','') || ' ' || coalesce(p_payload->>'last_name','')));

  return jsonb_build_object('studentId', sid, 'created', is_new);
end $$;
grant execute on function public.save_student(jsonb,text) to authenticated;
`,oe=`-- ===========================================================================
-- 0030_write_api_structure.sql — the rest of the write surface
--
-- 0026/0027/0028/0029 covered students, marks, attendance, fees, roles,
-- messages and user accounts. Everything else the app can save — classes,
-- sections, subjects, teachers, teacher assignments, homework, timetable
-- entries, announcements, events, starting a conversation, and reviewing a
-- guardian's bank-transfer receipt — still fell through to the same
-- disabled generic upsert()/remove() as those did before this round. Same
-- fix, same pattern, applied to what's left.
--
-- A few of these add a guard 0026 didn't need: deleting a class, subject or
-- teacher that's still in active use (an enrollment, an assignment) is
-- refused with a clear reason rather than silently orphaning rows that
-- foreign keys would otherwise cascade-delete out from under a live
-- school — e.g. deleting a class quietly un-enrolling every student in it.
-- ===========================================================================

/* ============================= classes ============================= */

create or replace function public.save_class(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare cid text := p_payload->>'id'; sch text; sec jsonb;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a class name is required'; end if;
  if cid is null or btrim(cid) = '' then raise exception 'a class id is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.classes (id, school_id, name, level)
  values (cid, sch, btrim(p_payload->>'name'), coalesce((p_payload->>'level')::integer, 0))
  on conflict (id) do update set name = excluded.name, level = excluded.level, updated_at = now();

  if p_payload ? 'sections' then
    delete from public.sections s
    where s.class_id = cid
      and not (s.id = any(array(select jsonb_array_elements(p_payload->'sections') ->> 'id')));
    for sec in select jsonb_array_elements(p_payload->'sections') loop
      insert into public.sections (id, class_id, name)
      values (sec->>'id', cid, sec->>'name')
      on conflict (id) do update set name = excluded.name;
    end loop;
  end if;

  perform public.log_action('class.save', cid, p_payload->>'name');
  return jsonb_build_object('classId', cid);
end $$;
grant execute on function public.save_class(jsonb) to authenticated;

create or replace function public.delete_class(p_class_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.enrollments where class_id = p_class_id and status = 'active') then
    raise exception 'cannot delete a class with actively enrolled students';
  end if;
  delete from public.classes where id = p_class_id;
  perform public.log_action('class.delete', p_class_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_class(text) to authenticated;

/* ============================= subjects ============================= */

create or replace function public.save_subject(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare sid text := p_payload->>'id'; sch text;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if sid is null or btrim(sid) = '' then raise exception 'a subject id is required'; end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a subject name is required'; end if;
  if coalesce(btrim(p_payload->>'code'), '') = '' then raise exception 'a subject code is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.subjects (id, school_id, code, name, color)
  values (sid, sch, upper(btrim(p_payload->>'code')), btrim(p_payload->>'name'), p_payload->>'color')
  on conflict (id) do update set
    code = excluded.code, name = excluded.name, color = excluded.color, updated_at = now();

  perform public.log_action('subject.save', sid, p_payload->>'name');
  return jsonb_build_object('subjectId', sid);
end $$;
grant execute on function public.save_subject(jsonb) to authenticated;

create or replace function public.delete_subject(p_subject_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.teacher_assignments where subject_id = p_subject_id) then
    raise exception 'cannot delete a subject that still has teacher assignments';
  end if;
  delete from public.subjects where id = p_subject_id;
  perform public.log_action('subject.delete', p_subject_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_subject(text) to authenticated;

/* ============================= teachers ============================= */

create or replace function public.save_teacher(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare tid text := p_payload->>'id'; sch text;
begin
  if not public.has_perm('teachers.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if tid is null or btrim(tid) = '' then raise exception 'a teacher id is required'; end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a teacher name is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.teachers (id, school_id, name, phone, email, specialty)
  values (tid, sch, btrim(p_payload->>'name'), p_payload->>'phone', p_payload->>'email', p_payload->>'specialty')
  on conflict (id) do update set
    name = excluded.name, phone = excluded.phone, email = excluded.email,
    specialty = excluded.specialty, updated_at = now();

  perform public.log_action('teacher.save', tid, p_payload->>'name');
  return jsonb_build_object('teacherId', tid);
end $$;
grant execute on function public.save_teacher(jsonb) to authenticated;

create or replace function public.delete_teacher(p_teacher_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('teachers.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.teacher_assignments where teacher_id = p_teacher_id) then
    raise exception 'cannot delete a teacher with active class assignments';
  end if;
  delete from public.teachers where id = p_teacher_id;
  perform public.log_action('teacher.delete', p_teacher_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_teacher(text) to authenticated;

/* ======================= teacher assignments ======================= */

create or replace function public.save_assignment(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare aid text := coalesce(p_payload->>'id', 'asg-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
  values (aid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'section_id',
          p_payload->>'subject_id', p_payload->>'teacher_id')
  on conflict (id) do update set
    class_id = excluded.class_id, section_id = excluded.section_id,
    subject_id = excluded.subject_id, teacher_id = excluded.teacher_id;
  perform public.log_action('assignment.save', aid, null);
  return jsonb_build_object('assignmentId', aid);
end $$;
grant execute on function public.save_assignment(jsonb) to authenticated;

create or replace function public.delete_assignment(p_assignment_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.teacher_assignments where id = p_assignment_id;
  perform public.log_action('assignment.delete', p_assignment_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_assignment(text) to authenticated;

/* ============================= homework ============================= */

create or replace function public.save_homework(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare hid text := coalesce(p_payload->>'id', 'hw-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('homework.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.homework (id, year_id, class_id, section_id, subject_id, title, description, issued, due)
  values (hid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'section_id', p_payload->>'subject_id',
          btrim(p_payload->>'title'), p_payload->>'description',
          coalesce((p_payload->>'issued')::date, current_date), (p_payload->>'due')::date)
  on conflict (id) do update set
    class_id = excluded.class_id, section_id = excluded.section_id, subject_id = excluded.subject_id,
    title = excluded.title, description = excluded.description, due = excluded.due, updated_at = now();
  perform public.log_action('homework.save', hid, p_payload->>'title');
  return jsonb_build_object('homeworkId', hid);
end $$;
grant execute on function public.save_homework(jsonb) to authenticated;

-- A separate, narrower operation from save_homework() on purpose: marking
-- a homework item submitted is done by two different kinds of caller — a
-- teacher/admin ticking off the class roster, and a student marking their
-- own — and the second group will never hold homework.manage. Gating the
-- whole row (title/description/due) behind homework.manage while gating
-- just this one array behind "is this your own submission" keeps a
-- student's access exactly as wide as it needs to be and no wider.
create or replace function public.toggle_homework_submission(p_homework_id text, p_student_id text)
returns jsonb language plpgsql security definer as $$
declare h public.homework; now_submitted boolean;
begin
  if not public.has_perm('homework.manage') then
    if not exists (select 1 from public.profiles where id = auth.uid() and student_id = p_student_id) then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select * into h from public.homework where id = p_homework_id;
  if h.id is null then raise exception 'unknown homework %', p_homework_id; end if;

  if p_student_id = any(h.submitted_students) then
    update public.homework set submitted_students = array_remove(submitted_students, p_student_id) where id = h.id;
    now_submitted := false;
  else
    update public.homework set submitted_students = array_append(submitted_students, p_student_id) where id = h.id;
    now_submitted := true;
  end if;

  return jsonb_build_object('homeworkId', h.id, 'studentId', p_student_id, 'submitted', now_submitted);
end $$;
grant execute on function public.toggle_homework_submission(text,text) to authenticated;

create or replace function public.delete_homework(p_homework_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('homework.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.homework where id = p_homework_id;
  perform public.log_action('homework.delete', p_homework_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_homework(text) to authenticated;

/* =========================== timetable =========================== */

create or replace function public.save_timetable_entry(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare eid text := coalesce(p_payload->>'id', 'tt-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.timetable_entries (id, class_id, section_id, day, period, subject_id, room)
  values (eid, p_payload->>'class_id', p_payload->>'section_id',
          (p_payload->>'day')::integer, (p_payload->>'period')::integer,
          p_payload->>'subject_id', p_payload->>'room')
  on conflict (id) do update set subject_id = excluded.subject_id, room = excluded.room;
  perform public.log_action('timetable.save', eid, null);
  return jsonb_build_object('entryId', eid);
end $$;
grant execute on function public.save_timetable_entry(jsonb) to authenticated;

create or replace function public.delete_timetable_entry(
  p_class_id text, p_section_id text, p_day integer, p_period integer)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.timetable_entries
   where class_id = p_class_id and section_id = p_section_id and day = p_day and period = p_period;
  perform public.log_action('timetable.delete', p_class_id || '/' || p_section_id, format('day %s period %s', p_day, p_period));
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_timetable_entry(text,text,integer,integer) to authenticated;

/* ===================== assessment structures ===================== */

create or replace function public.save_assessment_structure(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare sid text := coalesce(p_payload->>'id', 'as-' || replace(gen_random_uuid()::text, '-', '')); it jsonb;
begin
  if not public.has_perm('exams.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id)
  values (sid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'subject_id', p_payload->>'term_id')
  on conflict (id) do update set
    class_id = excluded.class_id, subject_id = excluded.subject_id, term_id = excluded.term_id, updated_at = now();

  if p_payload ? 'items' then
    delete from public.assessment_items i
    where i.structure_id = sid
      and not (i.id = any(array(select jsonb_array_elements(p_payload->'items') ->> 'id')));
    for it in select jsonb_array_elements(p_payload->'items') loop
      insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort)
      values (it->>'id', sid, it->>'name', (it->>'max')::numeric, (it->>'weight')::numeric,
              coalesce((it->>'sort')::integer, 0))
      on conflict (id) do update set
        name = excluded.name, max_mark = excluded.max_mark, weight = excluded.weight, sort = excluded.sort;
    end loop;
  end if;

  perform public.log_action('assessment.save', sid, p_payload->>'period');
  return jsonb_build_object('structureId', sid);
end $$;
grant execute on function public.save_assessment_structure(jsonb) to authenticated;

create or replace function public.delete_assessment_structure(p_structure_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('exams.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.assessment_marks where structure_id = p_structure_id) then
    raise exception 'cannot delete an assessment that already has marks entered against it';
  end if;
  delete from public.assessment_structures where id = p_structure_id;
  perform public.log_action('assessment.delete', p_structure_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_assessment_structure(text) to authenticated;

/* =========================== communication =========================== */

create or replace function public.save_announcement(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare aid text := p_payload->>'id'; is_new boolean;
begin
  is_new := aid is null or btrim(aid) = '';
  if is_new then
    if not public.has_perm('communication.create_announcement') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
    aid := 'ann-' || replace(gen_random_uuid()::text, '-', '');
  else
    if not public.has_perm('communication.manage_announcement') and not public.has_perm('communication.create_announcement') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  insert into public.announcements (id, title, body, category, sender_id, audience, status, scheduled_for, published_at, pinned)
  values (aid, p_payload->>'title', p_payload->>'body', p_payload->>'category', auth.uid(),
          coalesce(p_payload->'audience', '{"kind":"everyone"}'::jsonb),
          coalesce(p_payload->>'status', 'draft'),
          nullif(p_payload->>'scheduled_for','')::timestamptz,
          case when p_payload->>'status' = 'published' then now() else nullif(p_payload->>'published_at','')::timestamptz end,
          coalesce((p_payload->>'pinned')::boolean, false))
  on conflict (id) do update set
    title = excluded.title, body = excluded.body, category = excluded.category,
    audience = excluded.audience, status = excluded.status,
    scheduled_for = excluded.scheduled_for,
    published_at = coalesce(public.announcements.published_at, excluded.published_at),
    pinned = excluded.pinned, updated_at = now();

  perform public.log_action(case when is_new then 'announcement.create' else 'announcement.update' end, aid, p_payload->>'title');
  return jsonb_build_object('announcementId', aid);
end $$;
grant execute on function public.save_announcement(jsonb) to authenticated;

create or replace function public.save_event(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare eid text := coalesce(nullif(p_payload->>'id',''), 'evt-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('events.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.events (id, title, description, day, time_of_day, location, category, audience, created_by)
  values (eid, p_payload->>'title', p_payload->>'description', (p_payload->>'day')::date,
          p_payload->>'time_of_day', p_payload->>'location', p_payload->>'category',
          coalesce(p_payload->'audience', '{"kind":"everyone"}'::jsonb), auth.uid())
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, day = excluded.day,
    time_of_day = excluded.time_of_day, location = excluded.location, category = excluded.category,
    audience = excluded.audience, updated_at = now();
  perform public.log_action('event.save', eid, p_payload->>'title');
  return jsonb_build_object('eventId', eid);
end $$;
grant execute on function public.save_event(jsonb) to authenticated;

create or replace function public.delete_event(p_event_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('events.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.events where id = p_event_id;
  perform public.log_action('event.delete', p_event_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_event(text) to authenticated;

/* ========================= conversations ========================= */

create or replace function public.start_conversation(
  p_other_profile_id uuid, p_related_student_id text default null,
  p_related_class_id text default null, p_related_section_id text default null,
  p_related_subject_id text default null)
returns jsonb language plpgsql security definer as $$
declare cid text; existing text;
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    raise exception 'a conversation needs a real other participant';
  end if;

  -- Reuse an existing direct conversation between exactly these two people
  -- rather than spawning a duplicate every time "message" is clicked.
  select c.id into existing
  from public.conversations c
  where c.type = 'direct'
    and exists (select 1 from public.conversation_participants p1 where p1.conversation_id = c.id and p1.profile_id = auth.uid())
    and exists (select 1 from public.conversation_participants p2 where p2.conversation_id = c.id and p2.profile_id = p_other_profile_id)
    and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if existing is not null then
    return jsonb_build_object('conversationId', existing, 'created', false);
  end if;

  cid := 'conv-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.conversations (id, type, related_student_id, related_class_id, related_section_id, related_subject_id, status)
  values (cid, 'direct', p_related_student_id, p_related_class_id, p_related_section_id, p_related_subject_id, 'active');
  insert into public.conversation_participants (conversation_id, profile_id) values (cid, auth.uid()), (cid, p_other_profile_id);

  perform public.log_action('conversation.start', cid, null);
  return jsonb_build_object('conversationId', cid, 'created', true);
end $$;
grant execute on function public.start_conversation(uuid,text,text,text,text) to authenticated;

create or replace function public.set_conversation_status(p_conversation_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('active','archived','hidden') then raise exception 'unknown status %', p_status; end if;
  update public.conversations set status = p_status, updated_at = now() where id = p_conversation_id;
  return jsonb_build_object('conversationId', p_conversation_id, 'status', p_status);
end $$;
grant execute on function public.set_conversation_status(text,text) to authenticated;

/* ================= fee payment request review ================= */

create or replace function public.review_fee_payment_request(
  p_request_id text, p_status text, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare r public.fee_payment_requests; f public.fee_items; entry jsonb; new_paid numeric;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'unknown status %', p_status; end if;

  select * into r from public.fee_payment_requests where id = p_request_id for update;
  if r.id is null then raise exception 'unknown payment request %', p_request_id; end if;
  if r.status <> 'pending' then raise exception 'this request has already been reviewed'; end if;

  update public.fee_payment_requests set
    status = p_status, reviewed_by = auth.uid(),
    reviewed_by_name = (select full_name from public.profiles where id = auth.uid()),
    reviewed_at = now(), review_note = p_note
  where id = r.id;

  if p_status = 'approved' then
    select * into f from public.fee_items where id = r.fee_item_id for update;
    if f.id is null then raise exception 'the fee item this request was for no longer exists'; end if;
    new_paid := least(f.amount, f.paid + r.amount);

    entry := jsonb_build_object(
      'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
      'amount', r.amount, 'method', 'bank_transfer', 'reference', r.reference, 'bank', r.bank_name,
      'date', to_char(now(), 'YYYY-MM-DD'),
      'recordedBy', (select full_name from public.profiles where id = auth.uid()));

    update public.fee_items
       set paid = new_paid, payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(entry)
     where id = f.id;
  end if;

  perform public.log_action('fees.payment.' || p_status, p_request_id, p_note);
  return jsonb_build_object('requestId', p_request_id, 'status', p_status);
end $$;
grant execute on function public.review_fee_payment_request(text,text,text) to authenticated;

/* ============================= settings ============================= */

create or replace function public.update_school_settings(
  p_name text default null, p_motto text default null, p_bank_accounts text default null)
returns jsonb language plpgsql security definer as $$
declare sch text; accounts jsonb;
begin
  if not public.has_perm('settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_bank_accounts is not null then
    begin
      accounts := p_bank_accounts::jsonb;
    exception when others then
      raise exception 'bank accounts payload is not valid JSON';
    end;
    if jsonb_typeof(accounts) <> 'array' then
      raise exception 'bank accounts must be a JSON array';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  update public.schools set
    name = coalesce(p_name, name),
    motto = coalesce(p_motto, motto),
    bank_accounts = coalesce(accounts, bank_accounts)
  where id = sch;
  perform public.log_action('settings.update', sch, p_name);
  return jsonb_build_object('schoolId', sch);
end $$;
grant execute on function public.update_school_settings(text,text,text) to authenticated;
`,re=`-- ===========================================================================
-- 0031_year_lifecycle_fixes.sql
--
-- TWO PROBLEMS, ONE FILE
--
-- 1. A real permission bug, not just a missing operation. 0010 deliberately
--    split "manage academic years & terms" into its own permission
--    (academics.manage_years) so a school could grant "manage classes"
--    without also granting "restructure the academic calendar" — and wired
--    the RLS policies on academic_years/terms to check it. But
--    0025_year_lifecycle.sql, written after 0010, checks the broader
--    academics.manage in set_active_year, close_year, rollover_year and
--    create_academic_year instead. A role holding only
--    academics.manage_years — exactly the case 0010 exists to support —
--    would see the Academic Years page (the client checks the right
--    permission) and then get "not permitted" from every action on it.
--    This redefines all four with the permission 0010 actually introduced.
--
-- 2. Missing operations. AcademicYearsPage has always supported editing an
--    existing year's name/dates, and creating/editing/deleting individual
--    terms one at a time — none of which 0025 or 0026 gave a named
--    operation to. update_academic_year, delete_academic_year, save_term
--    and delete_term fill that in, with the same in-use guards the client
--    already checks re-verified server-side rather than trusted from the
--    client alone.
-- ===========================================================================

create or replace function public.set_active_year(p_year_id text)
returns void language plpgsql security definer as $$
declare sid text;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select school_id into sid from public.academic_years where id = p_year_id;
  if sid is null then raise exception 'unknown academic year %', p_year_id; end if;

  update public.academic_years set is_active = false where school_id = sid and is_active;
  update public.academic_years set is_active = true, status = 'open' where id = p_year_id;

  perform public.log_action('year.activate', p_year_id, 'Active academic year switched');
end $$;
grant execute on function public.set_active_year(text) to authenticated;

create or replace function public.close_year(p_year_id text)
returns void language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if (select is_active from public.academic_years where id = p_year_id) then
    raise exception 'cannot close the active year — activate the next year first';
  end if;
  update public.academic_years set status = 'closed' where id = p_year_id;
  perform public.log_action('year.close', p_year_id, 'Academic year closed to further edits');
end $$;
grant execute on function public.close_year(text) to authenticated;

create or replace function public.rollover_year(
  p_from_year text,
  p_to_year   text,
  p_copy_assignments boolean default true,
  p_copy_timetable   boolean default true,
  p_copy_structures  boolean default true,
  p_copy_fees        boolean default true
)
returns jsonb language plpgsql security definer as $$
declare
  n_assign int := 0; n_time int := 0; n_struct int := 0;
  n_items int := 0; n_bands int := 0; n_fees int := 0;
  term_map jsonb := '{}'::jsonb;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_from_year = p_to_year then raise exception 'source and target year are the same'; end if;
  if not exists (select 1 from public.academic_years where id = p_from_year) then
    raise exception 'unknown source year %', p_from_year; end if;
  if not public.year_is_open(p_to_year) then
    raise exception 'target year % is closed', p_to_year; end if;

  select coalesce(jsonb_object_agg(f.id, t.id), '{}'::jsonb) into term_map
  from public.terms f
  join public.terms t on t.year_id = p_to_year and t.seq = f.seq
  where f.year_id = p_from_year;

  if p_copy_assignments then
    insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
    select p_to_year || '-' || md5(a.class_id || a.section_id || a.subject_id),
           p_to_year, a.class_id, a.section_id, a.subject_id, a.teacher_id
    from public.teacher_assignments a
    where a.year_id = p_from_year
    on conflict (year_id, class_id, section_id, subject_id) do nothing;
    get diagnostics n_assign = row_count;
  end if;

  if p_copy_timetable then
    insert into public.timetable_entries (id, year_id, class_id, section_id, day, period, subject_id, room)
    select p_to_year || '-tt-' || md5(t.class_id || t.section_id || t.day || t.period),
           p_to_year, t.class_id, t.section_id, t.day, t.period, t.subject_id, t.room
    from public.timetable_entries t
    where t.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_time = row_count;
  end if;

  insert into public.grade_bands (id, school_id, year_id, min_pct, max_pct, grade, remark, sort)
  select p_to_year || '-gb-' || g.sort, g.school_id, p_to_year,
         g.min_pct, g.max_pct, g.grade, g.remark, g.sort
  from public.grade_bands g
  where g.year_id = p_from_year
  on conflict do nothing;
  get diagnostics n_bands = row_count;

  if p_copy_structures then
    insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id)
    select p_to_year || '-as-' || md5(s.class_id || s.subject_id || coalesce(s.term_id,'')),
           p_to_year, s.class_id, s.subject_id, (term_map->>s.term_id)
    from public.assessment_structures s
    where s.year_id = p_from_year
      and (s.term_id is null or term_map ? s.term_id)
    on conflict (year_id, class_id, subject_id, term_id) do nothing;
    get diagnostics n_struct = row_count;

    insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort)
    select md5(ns.id || i.name || i.sort), ns.id, i.name, i.max_mark, i.weight, i.sort
    from public.assessment_structures os
    join public.assessment_items i on i.structure_id = os.id
    join public.assessment_structures ns
      on ns.year_id = p_to_year and ns.class_id = os.class_id
     and ns.subject_id = os.subject_id
     and ns.term_id is not distinct from (term_map->>os.term_id)
    where os.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_items = row_count;
  end if;

  if p_copy_fees then
    insert into public.fee_templates (id, year_id, class_id, term_id, label, amount, due_date)
    select p_to_year || '-ft-' || md5(coalesce(f.class_id,'*') || f.label),
           p_to_year, f.class_id, (term_map->>f.term_id), f.label, f.amount, null
    from public.fee_templates f
    where f.year_id = p_from_year
    on conflict (year_id, class_id, term_id, label) do nothing;
    get diagnostics n_fees = row_count;
  end if;

  perform public.log_action('year.rollover', p_to_year, format('Structure copied from %s', p_from_year));

  return jsonb_build_object(
    'fromYear', p_from_year, 'toYear', p_to_year,
    'assignments', n_assign, 'timetable', n_time, 'gradeBands', n_bands,
    'structures', n_struct, 'assessmentItems', n_items, 'feeTemplates', n_fees);
end $$;
grant execute on function public.rollover_year(text,text,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.create_academic_year(
  p_id text, p_name text, p_start date, p_end date, p_terms text[] default '{}')
returns jsonb language plpgsql security definer as $$
declare sid text; i int;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select id into sid from public.schools order by id limit 1;

  insert into public.academic_years (id, school_id, name, start_date, end_date, is_active, status)
  values (p_id, sid, p_name, p_start, p_end, false, 'planned')
  on conflict (id) do nothing;

  for i in 1 .. coalesce(array_length(p_terms, 1), 0) loop
    insert into public.terms (id, year_id, name, seq)
    values (p_id || '-t' || i, p_id, p_terms[i], i)
    on conflict (year_id, name) do nothing;
  end loop;

  perform public.log_action('year.create', p_id, p_name);
  return jsonb_build_object('yearId', p_id, 'terms', coalesce(array_length(p_terms, 1), 0));
end $$;
grant execute on function public.create_academic_year(text,text,date,date,text[]) to authenticated;

-- Editing an EXISTING year's name/dates never had an operation — only
-- creating one did. Deliberately does not touch is_active or status;
-- set_active_year() and close_year() own those.
create or replace function public.update_academic_year(p_year_id text, p_name text, p_start date, p_end date)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years where id = p_year_id) then
    raise exception 'unknown academic year %', p_year_id;
  end if;
  if p_end <= p_start then raise exception 'end date must be after the start date'; end if;

  update public.academic_years set name = p_name, start_date = p_start, end_date = p_end where id = p_year_id;
  perform public.log_action('year.update', p_year_id, p_name);
  return jsonb_build_object('yearId', p_year_id);
end $$;
grant execute on function public.update_academic_year(text,text,date,date) to authenticated;

create or replace function public.delete_academic_year(p_year_id text)
returns jsonb language plpgsql security definer as $$
declare y public.academic_years;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into y from public.academic_years where id = p_year_id;
  if y.id is null then return jsonb_build_object('deleted', 0); end if;
  if y.is_active then raise exception 'set a different year as active before deleting this one'; end if;
  if exists (select 1 from public.enrollments where year_id = p_year_id)
    or exists (select 1 from public.assessment_structures where year_id = p_year_id)
    or exists (select 1 from public.homework where year_id = p_year_id) then
    raise exception 'this year has enrollment, assessment structures or homework tied to it — remove those first';
  end if;

  delete from public.academic_years where id = p_year_id; -- terms cascade
  perform public.log_action('year.delete', p_year_id, y.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_academic_year(text) to authenticated;

create or replace function public.save_term(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare tid text := p_payload->>'id'; yid text := p_payload->>'year_id';
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a term name is required'; end if;
  if exists (
    select 1 from public.terms
    where year_id = yid and lower(btrim(name)) = lower(btrim(p_payload->>'name')) and id <> coalesce(tid, '')
  ) then
    raise exception 'this year already has a term with that name';
  end if;

  if tid is null or btrim(tid) = '' then
    tid := yid || '-t-' || replace(gen_random_uuid()::text, '-', '');
  end if;

  insert into public.terms (id, year_id, name, seq)
  values (tid, yid, btrim(p_payload->>'name'), coalesce((p_payload->>'seq')::integer, 1))
  on conflict (id) do update set name = excluded.name, seq = excluded.seq;

  perform public.log_action('term.save', tid, p_payload->>'name');
  return jsonb_build_object('termId', tid);
end $$;
grant execute on function public.save_term(jsonb) to authenticated;

create or replace function public.delete_term(p_term_id text)
returns jsonb language plpgsql security definer as $$
declare t public.terms;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into t from public.terms where id = p_term_id;
  if t.id is null then return jsonb_build_object('deleted', 0); end if;
  if exists (
    select 1 from public.assessment_structures
    where year_id = t.year_id and term_id = t.id
  ) then
    raise exception 'this term has assessment structures using it — remove those first';
  end if;

  delete from public.terms where id = t.id;
  perform public.log_action('term.delete', p_term_id, t.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_term(text) to authenticated;
`,ce=`-- ===========================================================================
-- 0032_reconcile_student_documents.sql
--
-- THE SPLIT (flagged, not fixed, in the previous round)
-- Uploads have always gone through register_file()/unregister_file()
-- (0026), which write to \`file_objects\` — the newer, R2-backed storage
-- table. But the read path (hydrateCoreViaBootstrap / hydrateCoreViaTables
-- in src/lib/backend.ts) has always read a student's documents from the
-- older \`student_documents\` table. A document a registrar just uploaded
-- would sit in file_objects, invisible, until someone thought to look in
-- two different tables for "a student's documents."
--
-- THE FIX, AND WHY THIS SHAPE
-- Two ways to close this: change the read path to query file_objects
-- instead, or make the write path keep both tables in sync. The read path
-- was left alone on purpose — get_app_bootstrap()/get_app_snapshot() are
-- the two most security-sensitive functions in the schema (they decide
-- what an entire login sees), and reshaping either of them blind, without
-- a live database to verify the RLS-scoping still behaves correctly for
-- every role, is a worse risk than it's worth. Instead, register_file()
-- and unregister_file() now mirror student_document rows into
-- student_documents using the *same id* as the file_objects row, so the
-- existing, already-correct read path sees them immediately. photo and
-- fee-receipt uploads are untouched — student_documents was never meant to
-- hold those, so mirroring is scoped to owner_type = 'student_document'.
--
-- This is the pragmatic fix under a deadline, not the final architecture.
-- The honest next step, once there's a live database to test the change
-- against, is to migrate the read path onto file_objects as the single
-- source of truth and retire student_documents outright.
-- ===========================================================================

create or replace function public.register_file(
  p_owner_type text, p_owner_id text, p_storage_key text,
  p_original_name text default null, p_mime_type text default null,
  p_size_bytes bigint default null, p_kind text default null)
returns jsonb language plpgsql security definer as $$
declare new_id uuid;
begin
  if p_owner_type not in ('student_photo','student_document','fee_receipt') then
    raise exception 'unsupported owner type %', p_owner_type;
  end if;

  if not public.can_view_student(p_owner_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_owner_type = 'student_photo' and not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  insert into public.file_objects (
    owner_type, owner_id, storage_key, original_name, mime_type, size_bytes, kind, uploaded_by)
  values (p_owner_type, p_owner_id, p_storage_key, p_original_name, p_mime_type,
          p_size_bytes, p_kind, auth.uid())
  on conflict (storage_key) do update set
    original_name = excluded.original_name,
    mime_type     = excluded.mime_type,
    size_bytes    = excluded.size_bytes,
    kind          = excluded.kind
  returning id into new_id;

  if p_owner_type = 'student_document' then
    insert into public.student_documents (id, student_id, name, kind, size, doc_date, storage_path)
    values (new_id::text, p_owner_id, coalesce(p_original_name, p_storage_key), p_kind,
            p_size_bytes::text, current_date, p_storage_key)
    on conflict (id) do update set
      name = excluded.name, kind = excluded.kind, size = excluded.size, storage_path = excluded.storage_path;
  end if;

  perform public.log_action('file.upload', p_storage_key, coalesce(p_original_name, p_owner_type));
  return jsonb_build_object('fileId', new_id, 'key', p_storage_key);
end $$;
grant execute on function public.register_file(text,text,text,text,text,bigint,text) to authenticated;

create or replace function public.unregister_file(p_storage_key text)
returns jsonb language plpgsql security definer as $$
declare f public.file_objects;
begin
  select * into f from public.file_objects where storage_key = p_storage_key;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;

  if not public.can_view_student(f.owner_id) or not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  delete from public.file_objects where id = f.id;
  delete from public.student_documents where id = f.id::text;
  perform public.log_action('file.delete', p_storage_key, f.original_name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.unregister_file(text) to authenticated;

-- Back-fill: any student_document already sitting in file_objects from
-- before this migration (i.e. uploaded, then never visible) becomes
-- visible the moment this migration runs, without needing a re-upload.
insert into public.student_documents (id, student_id, name, kind, size, doc_date, storage_path)
select f.id::text, f.owner_id, coalesce(f.original_name, f.storage_key), f.kind,
       f.size_bytes::text, f.created_at::date, f.storage_key
from public.file_objects f
where f.owner_type = 'student_document'
on conflict (id) do nothing;
`,de=`/* ---------------------------------------------------------------------
   0033 — delete_announcement

   save_announcement (0030) covers create/update, but nothing ever gave
   announcements a real delete path once the client stopped being able to
   \`.delete()\` the table directly. The client's Delete button (added
   alongside Archive/Restore) was writing the removal into local state
   only — syncAnnouncements() in backend.ts had no delete branch to call,
   so the row survived in Postgres and came back on the next read,
   making deletes look like they silently undid themselves.

   RLS already had a delete policy for this (ann_del, from
   0002_rls_functions.sql, gated on communication.delete) that's been
   dormant ever since raw table writes were removed — this just gives it
   a callable RPC. Permission mirrors save_announcement's update case
   (sender OR communication.manage_announcement) rather than requiring
   the separate communication.delete grant, so it matches what the
   client's canManageAnnouncement() already uses to show the button.
   --------------------------------------------------------------------- */

create or replace function public.delete_announcement(p_announcement_id text)
returns jsonb language plpgsql security definer as $$
declare target public.announcements;
begin
  select * into target from public.announcements where id = p_announcement_id;
  if target.id is null then
    return jsonb_build_object('deleted', 0);
  end if;

  if target.sender_id <> auth.uid() and not public.has_perm('communication.manage_announcement') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- announcement_reads references announcements with ON DELETE CASCADE,
  -- so its rows go automatically.
  delete from public.announcements where id = p_announcement_id;

  perform public.log_action('announcement.delete', p_announcement_id, target.title);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_announcement(text) to authenticated;
`,le=`/* ---------------------------------------------------------------------
   0034 — fix start_conversation: conversations has no "type" column

   public.conversations was never given a \`type\` column (0001_schema.sql
   — id, related_student_id/class_id/section_id/subject_id, status,
   created_at, updated_at). The table has only ever held direct
   one-to-one conversations, so the read side (mapConversations() in
   src/lib/backend.ts) has always just hardcoded \`type: "direct"\` on the
   way out rather than reading it from a column.

   start_conversation() (0030_write_api_structure.sql) was written as if
   that column existed: it filtered on \`c.type = 'direct'\` and inserted
   a \`type\` value. Every call has therefore failed outright with
   "column "type" of relation "conversations" does not exist" — a
   Postgres error code failFromPostgres() (api/_lib/http.ts) doesn't
   recognize, so it fell through to the generic
   "The request could not be completed. Reference: xxxxxx" message
   instead of anything actionable. This has made it impossible to start
   any new conversation since 0030 shipped.

   Fix: drop the \`type\` references — the WHERE clause's dedup lookup
   doesn't need it (every row already is a direct conversation) and the
   INSERT just stops naming a column that was never there.
   --------------------------------------------------------------------- */

create or replace function public.start_conversation(
  p_other_profile_id uuid, p_related_student_id text default null,
  p_related_class_id text default null, p_related_section_id text default null,
  p_related_subject_id text default null)
returns jsonb language plpgsql security definer as $$
declare cid text; existing text;
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    raise exception 'a conversation needs a real other participant';
  end if;

  -- Reuse an existing direct conversation between exactly these two people
  -- rather than spawning a duplicate every time "message" is clicked.
  select c.id into existing
  from public.conversations c
  where exists (select 1 from public.conversation_participants p1 where p1.conversation_id = c.id and p1.profile_id = auth.uid())
    and exists (select 1 from public.conversation_participants p2 where p2.conversation_id = c.id and p2.profile_id = p_other_profile_id)
    and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if existing is not null then
    return jsonb_build_object('conversationId', existing, 'created', false);
  end if;

  cid := 'conv-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.conversations (id, related_student_id, related_class_id, related_section_id, related_subject_id, status)
  values (cid, p_related_student_id, p_related_class_id, p_related_section_id, p_related_subject_id, 'active');
  insert into public.conversation_participants (conversation_id, profile_id) values (cid, auth.uid()), (cid, p_other_profile_id);

  perform public.log_action('conversation.start', cid, null);
  return jsonb_build_object('conversationId', cid, 'created', true);
end $$;
grant execute on function public.start_conversation(uuid,text,text,text,text) to authenticated;
`,ue=`/* ---------------------------------------------------------------------
   0035 — year-scope the legacy bootstrap/snapshot reads

   WHY THIS EXISTS
   get_app_bootstrap() and get_app_snapshot() (0012) are what the frontend
   actually calls on every login and on first use of any feature group,
   respectively (0023/0024 built proper replacements — get_bootstrap() and
   the list_*() functions — but the frontend was never migrated onto them;
   that's a separate, much larger change touching most pages, tracked
   separately). Both of the legacy functions select every row in every
   per-year table for every year the school has ever run, every single
   time. That's the "downloads everything, for every role, every time"
   problem: it doesn't just cost bandwidth once, it gets slower and
   heavier every single year the school keeps using the app.

   This migration narrows both functions to the current academic year for
   tables that are genuinely per-year *operational* data (this year's
   timetable, this year's homework, this year's attendance, this year's
   marks, this year's fee items) — the exact same boundary
   0023's get_bootstrap()/my_scope() already use for the tables it covers.

   Deliberately NOT year-filtered, because people reasonably expect them to
   persist across a year boundary rather than vanish the moment the active
   year rolls over:
     - students (demographic record — also, the frontend derives the next
       admission number from this array's length; filtering it would silently
       start colliding with old admission numbers)
     - enrollments (people.tsx renders a student's full multi-year enrollment
       history, and registration.tsx reads past entries when re-enrolling a
       returning student — both are real, existing features)
     - profiles / guardian_students (identity & relationships, not activity)
     - announcements, events (moderate volume; still worth reading last year's)
     - conversations, messages, notifications, audit_log (audit trails and
       conversation history exist specifically to be looked back on)

   Same JSON field names and shapes come back either way, so nothing in the
   frontend needs to change for this migration to take effect — it only
   ever returns a subset of what it returned before.
   --------------------------------------------------------------------- */

create or replace function public.get_app_bootstrap()
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    -- year-scoped: an assignment is "this teacher teaches this section this
    -- year" — last year's assignments aren't part of how the school runs today.
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = public.current_year_id()) x), '[]'::jsonb),
    -- NOT year-scoped: the demographic record. Filtering this by enrollment
    -- year would also silently break the admission-number counter, which
    -- reads this array's total length.
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    -- NOT year-scoped: people.tsx renders a student's full multi-year
    -- enrollment history (a real feature), and registration.tsx reads past
    -- entries when re-enrolling a returning student. Unlike the other
    -- per-year tables, "last year's" rows here are actively displayed.
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries where year_id = public.current_year_id()) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.id,ai.structure_id,ai.name,ai.max_mark,ai.weight,ai.sort from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.id,ms.structure_id,ms.status,ms.submitted_by,ms.submitted_at,ms.approved_by,ms.approved_at,ms.returned_by,ms.returned_at,ms.return_reason,ms.published_by,ms.published_at,ms.reopen_reason from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers where year_id = public.current_year_id()) x), '[]'::jsonb),
    -- NOT year-scoped: announcements are low-volume enough (dozens to
    -- hundreds a year) that last year's are still worth reading, not worth
    -- the risk of hiding something someone expects to still be there.
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;

create or replace function public.get_app_snapshot()
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = public.current_year_id()) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = public.current_year_id()) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = public.current_year_id()) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = public.current_year_id()) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = public.current_year_id()) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = public.current_year_id()) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = public.current_year_id()) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = public.current_year_id()) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    -- Left unscoped below: announcements, events, conversations, messages,
    -- notifications and audit_log are things people expect to still find
    -- after the school's active year rolls over (a compliance trail, a
    -- chat thread, a notification history) — see the header comment.
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;

grant execute on function public.get_app_bootstrap() to authenticated;
grant execute on function public.get_app_snapshot() to authenticated;

comment on function public.get_app_bootstrap() is
  'Year-scoped as of 0035 for per-year operational tables (teacher assignments, timetable, homework, assessments, attendance). Still unbounded for students/enrollments/profiles/announcements — see 0035 header comment for why. Superseded long-term by get_bootstrap(year_id) once the frontend migrates onto it.';
comment on function public.get_app_snapshot() is
  'Year-scoped as of 0035 the same way as get_app_bootstrap(). Still a full-table read for anything not per-year (messages, notifications, audit, announcements, events) — intended only as the rare recovery resync, never the hot path.';
`,_e=`/* ---------------------------------------------------------------------
   0036 — a year_id parameter for get_app_bootstrap / get_app_snapshot

   The app already ships an "Academic year" dropdown in the header
   (Layout.tsx) and another on the Academics page, both bound to a
   \`yearId\`/\`setYear\` pair that's been in the store since before this
   session's changes. Before 0035, switching it "worked" only because
   get_app_bootstrap()/get_app_snapshot() downloaded every year's data
   unconditionally, so the dropdown was just filtering an already-complete
   in-memory copy. 0035 removed that — it scopes the query itself to
   current_year_id() — which is exactly correct for the normal case (why
   download years nobody's viewing) but as a side effect silently broke
   the dropdown: selecting anything but the active year now filters an
   array that was never fetched for that year in the first place, so it
   just shows nothing.

   This migration is what turns that dropdown from decorative back into
   functional: both functions take an optional p_year_id, defaulting to
   current_year_id() exactly as before when omitted, so every existing
   caller (that doesn't pass it) is unaffected. The frontend change that
   actually calls this with a real value lives in src/lib/backend.ts /
   src/store.tsx, not here.
   --------------------------------------------------------------------- */

create or replace function public.get_app_bootstrap(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.id,ai.structure_id,ai.name,ai.max_mark,ai.weight,ai.sort from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.id,ms.structure_id,ms.status,ms.submitted_by,ms.submitted_at,ms.approved_by,ms.approved_at,ms.returned_by,ms.returned_at,ms.return_reason,ms.published_by,ms.published_at,ms.reopen_reason from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;

create or replace function public.get_app_snapshot(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;

grant execute on function public.get_app_bootstrap(text) to authenticated;
grant execute on function public.get_app_snapshot(text) to authenticated;

-- The old zero-arg signatures become redundant once the frontend always
-- passes p_year_id (even as null) — but only drop them once nothing calls
-- get_app_bootstrap()/get_app_snapshot() with no arguments anymore, since
-- Postgres treats different argument counts as different functions.
drop function if exists public.get_app_bootstrap();
drop function if exists public.get_app_snapshot();
`,pe=`/* ---------------------------------------------------------------------
   0037 — fee_payment_requests was never in get_app_snapshot()

   Found while working on 0035/0036: hydrateGroup()'s "fees" case (backend.ts)
   has always called sel("fee_payment_requests") — a guardian's pending
   bank-transfer submission awaiting fees.manage review (0015) — but that
   key has never once existed in get_app_snapshot()'s output, in any of its
   versions (0012 through 0036). sel() silently falls back to [] and logs a
   console warning when a requested table isn't in the snapshot, so this
   never surfaced as an error anywhere — db.paymentRequests has just always
   been empty for anyone reading it through this path, with no visible sign
   why. Concretely: an admin reviewing "pending fee payments" would never
   see any a guardian had actually submitted.

   Fix: add the missing key. Scoped by year the same way as the rest of the
   "fees" group (0035) — a payment request is for one fee_item, and
   fee_items already carries year_id, so that's joined through rather than
   added as a new column on fee_payment_requests itself.
   --------------------------------------------------------------------- */

create or replace function public.get_app_snapshot(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    -- Was missing entirely before this migration — see header comment.
    'fee_payment_requests', coalesce((select jsonb_agg(to_jsonb(x)) from (select r.* from public.fee_payment_requests r join public.fee_items fi on fi.id = r.fee_item_id where fi.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;

grant execute on function public.get_app_snapshot(text) to authenticated;
`,me=`/* ---------------------------------------------------------------------
   0038 — my_permissions() ignored a disabled role_def

   Found while fixing the "granting a permission doesn't reach anyone
   already using the app" problem (see the frontend change in
   src/store.tsx for the main fix). While wiring that up against
   my_permissions() (0023), it turned out that function only checks
   profiles.status = 'active' — never role_defs.status — so disabling a
   whole role (RolesPage's "Deactivate" toggle, which its own UI copy
   claims cuts off access "immediately") would leave my_permissions()
   still returning that role's full permission list. The client's own
   hasPermission() has always independently checked role.status too, so
   this only mattered once something started actually polling
   my_permissions() to sync live — which is exactly what's being added
   now. Fixed to match hasPermission()'s two-part check (profile active
   AND role active) exactly.
   --------------------------------------------------------------------- */

create or replace function public.my_permissions()
returns text[] language sql security definer stable as $$
  select case
    when r.all_permissions then array(select id from public.permissions)
    else coalesce(array(
      select rp.permission_id from public.role_permissions rp
      where rp.role_def_id = r.id
    ), '{}')
  end
  from public.profiles p
  join public.role_defs r on r.id = p.role_def_id
  where p.id = auth.uid() and p.status = 'active' and r.status = 'active';
$$;
grant execute on function public.my_permissions() to authenticated;
`,be=`/* ---------------------------------------------------------------------
   0039 — configurable working days (timetable was hardcoded to Mon–Fri)

   The timetable grid's day columns came from a plain JS constant —
   DAYS = ["Monday", ..., "Friday"] — duplicated in both
   src/pages/academics.tsx and src/data/seed.ts, with no way for a school
   to add a working Saturday, drop a day, or otherwise run anything but
   exactly that fixed five-day week.

   working_days stores which of the 7 weekdays count as working days — a
   subset toggle of a fixed, stable set, not a reorderable named list.
   That's deliberate: timetable_entries.day has always been a plain 0-6
   index (the DB's check constraint already allowed 0-6; only the client's
   5-element array ever limited it to 0-4), so this changes nothing about
   what an existing entry's day number means or how it's stored — no data
   migration, no risk of an old "Wednesday" entry silently becoming
   "Thursday" if a school removes a day from the middle of what used to be
   an arbitrary ordered list. Toggling Tuesday off just stops rendering
   column 2; it can never renumber Wednesday.

   Day 0 means Monday, not Sunday: the old 5-element DAYS array was
   ["Monday", ..., "Friday"], so day=0 in any timetable entry a real school
   has already entered means Monday today. The 7-day set here keeps that
   exact ordering (Mon=0..Fri=4, Sat=5, Sun=6) specifically so existing
   entries keep meaning what they've always meant — this is NOT
   JavaScript's Date.getDay() convention (which is Sunday-first), and
   using that instead would have silently relabeled every existing
   Wed/Thu/Fri entry as Tue/Wed/Thu.
   --------------------------------------------------------------------- */

alter table public.schools
  add column if not exists working_days jsonb not null default '[0,1,2,3,4]'::jsonb;

create or replace function public.get_app_bootstrap(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts,working_days from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.id,ai.structure_id,ai.name,ai.max_mark,ai.weight,ai.sort from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.id,ms.structure_id,ms.status,ms.submitted_by,ms.submitted_at,ms.approved_by,ms.approved_at,ms.returned_by,ms.returned_at,ms.return_reason,ms.published_by,ms.published_at,ms.reopen_reason from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_bootstrap(text) to authenticated;

create or replace function public.get_app_snapshot(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_payment_requests', coalesce((select jsonb_agg(to_jsonb(x)) from (select r.* from public.fee_payment_requests r join public.fee_items fi on fi.id = r.fee_item_id where fi.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_snapshot(text) to authenticated;

create or replace function public.update_school_settings(
  p_name text default null, p_motto text default null, p_bank_accounts text default null,
  p_working_days text default null)
returns jsonb language plpgsql security definer as $$
declare sch text; accounts jsonb; days jsonb;
begin
  if not public.has_perm('settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_bank_accounts is not null then
    begin
      accounts := p_bank_accounts::jsonb;
    exception when others then
      raise exception 'bank accounts payload is not valid JSON';
    end;
    if jsonb_typeof(accounts) <> 'array' then
      raise exception 'bank accounts must be a JSON array';
    end if;
  end if;
  if p_working_days is not null then
    begin
      days := p_working_days::jsonb;
    exception when others then
      raise exception 'working days payload is not valid JSON';
    end;
    if jsonb_typeof(days) <> 'array' or jsonb_array_length(days) = 0 then
      raise exception 'working days must be a non-empty JSON array';
    end if;
    if exists (
      select 1 from jsonb_array_elements(days) v
      where jsonb_typeof(v) <> 'number' or (v::text)::int not between 0 and 6
    ) then
      raise exception 'working days must be integers 0-6 (Sunday-Saturday)';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  update public.schools set
    name = coalesce(p_name, name),
    motto = coalesce(p_motto, motto),
    bank_accounts = coalesce(accounts, bank_accounts),
    working_days = coalesce(days, working_days)
  where id = sch;
  perform public.log_action('settings.update', sch, p_name);
  return jsonb_build_object('schoolId', sch);
end $$;
grant execute on function public.update_school_settings(text,text,text,text) to authenticated;
drop function if exists public.update_school_settings(text,text,text);
`,fe=`/* ---------------------------------------------------------------------
   0040 — message_reports had no RPC at all; both filing and
   resolving a report have always failed

   Found while verifying messaging/notifications are correctly tied to
   accounts. syncReports() (backend.ts) is the ONLY remaining caller of
   the deprecated raw upsert() helper — every other table moved onto a
   real RPC back in 0026-0032, but this one was left behind (flagged and
   deliberately left out of scope earlier in this project; fixing it now
   since it's squarely inside "is messaging correct end to end").
   upsert() unconditionally throws "no longer go through snapshot
   syncing" for any table, so both of communication.tsx's write paths
   here have never actually worked:
     - reporting a message (ModerationPage's report flow, line ~636)
     - resolving/dismissing a report (ModerationPage, line ~865)

   Same "new vs modified" split as the notifications fix in this same
   session: filing a report and reviewing one are different operations
   with different permission requirements (reporter files their own;
   only a moderator reviews), so they get two RPCs, not one upsert.
   --------------------------------------------------------------------- */

create or replace function public.file_message_report(
  p_message_id text, p_conversation_id text, p_reason text, p_detail text default null)
returns jsonb language plpgsql security definer as $$
declare new_id uuid;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not exists (select 1 from public.messages where id = p_message_id::uuid and conversation_id = p_conversation_id) then
    raise exception 'that message is not in this conversation';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'a reason is required';
  end if;

  insert into public.message_reports (message_id, conversation_id, reporter_id, reason, detail)
  values (p_message_id::uuid, p_conversation_id, auth.uid(), btrim(p_reason), nullif(btrim(coalesce(p_detail, '')), ''))
  returning id into new_id;

  perform public.log_action('report.file', new_id::text, p_reason);
  return jsonb_build_object('id', new_id);
end $$;
grant execute on function public.file_message_report(text,text,text,text) to authenticated;

create or replace function public.review_message_report(p_report_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('communication.moderate') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'unknown status %', p_status;
  end if;
  update public.message_reports set status = p_status where id = p_report_id::uuid;
  if not found then raise exception 'unknown report %', p_report_id; end if;

  perform public.log_action('report.' || p_status, p_report_id, null);
  return jsonb_build_object('id', p_report_id, 'status', p_status);
end $$;
grant execute on function public.review_message_report(text,text) to authenticated;
`,he=`/* ---------------------------------------------------------------------
   0041 — fee_payment_requests had no way to actually create one

   Found while checking why fees "aren't working correctly." The bank-
   transfer flow (0015_fee_payment_requests.sql) has a review RPC
   (review_fee_payment_request, 0030) for approving/rejecting an existing
   request, and syncPaymentRequests() (backend.ts) correctly calls it —
   but nothing has ever covered *creating* one. syncPaymentRequests()
   only acts when a request's status changes to 'approved' or 'rejected';
   a brand-new request is still sitting at its default 'pending' status,
   so that same guard (\`if (r.status !== "approved" && r.status !== "rejected") continue;\`)
   silently skips it. A guardian filling out GuardianFeesPage's "submit a
   bank transfer" form (people.tsx) gets a success toast — the object is
   real in their own browser's memory — but it was never sent to the
   server at all. It quietly disappears on the next reload, and no admin
   ever sees it to review, because it never existed server-side to begin
   with.

   This adds the missing half: a guardian (or admin) can file a request
   for a fee item that actually belongs to their own linked child,
   matching exactly what the existing RLS insert policy already requires
   (fee_payment_requests_ins, 0015) — this RPC exists so the client has a
   real operation to call, not because RLS needed loosening.
   --------------------------------------------------------------------- */

create or replace function public.submit_fee_payment_request(
  p_student_id text, p_fee_item_id text, p_amount numeric,
  p_bank_account_id text, p_bank_name text, p_reference text default null,
  p_receipt_path text default null, p_receipt_name text default null)
returns jsonb language plpgsql security definer as $$
declare
  fid text := 'payreq-' || replace(gen_random_uuid()::text, '-', '');
  f public.fee_items;
  submitter text;
begin
  if not public.is_admin() and not exists (
    select 1 from public.guardian_students g where g.guardian_id = auth.uid() and g.student_id = p_student_id
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select * into f from public.fee_items where id = p_fee_item_id and student_id = p_student_id;
  if f.id is null then raise exception 'that fee item does not belong to this student'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_amount > (f.amount - f.paid) then raise exception 'amount exceeds the % outstanding', f.amount - f.paid; end if;
  if coalesce(btrim(p_bank_account_id), '') = '' or coalesce(btrim(p_bank_name), '') = '' then
    raise exception 'a bank account is required';
  end if;

  select full_name into submitter from public.profiles where id = auth.uid();

  insert into public.fee_payment_requests (
    id, student_id, fee_item_id, amount, bank_account_id, bank_name, reference,
    receipt_path, receipt_name, submitted_by, submitted_by_name, status)
  values (
    fid, p_student_id, p_fee_item_id, p_amount, btrim(p_bank_account_id), btrim(p_bank_name),
    nullif(btrim(coalesce(p_reference, '')), ''), p_receipt_path, p_receipt_name,
    auth.uid(), submitter, 'pending');

  perform public.log_action('fees.payment_request', fid, format('%s via %s', p_amount, p_bank_name));
  return jsonb_build_object('id', fid);
end $$;
grant execute on function public.submit_fee_payment_request(text,text,numeric,text,text,text,text,text) to authenticated;
`,ge=`/* ---------------------------------------------------------------------
   0042 — configurable periods (was fixed to exactly 6, DB capped at 12)

   Same shape of problem as 0039's working days: the timetable grid's
   period rows came from a plain JS constant in src/pages/academics.tsx
   (PERIODS = [1,2,3,4,5,6]) and a second, richer copy in
   src/data/seed.ts (with start times, used by dashboards.tsx) — no way
   for a school to run more or fewer periods, and the schema itself
   capped at 12 regardless.

   periods stores an ordered list of {period, time} — the period NUMBER
   (still what timetable_entries.period stores, unchanged) paired with
   its start time, editable exactly like working_days: add a row, remove
   a row, reorder, no arbitrary ceiling. Unlike days there's no natural
   fixed set to be a subset of (a school day isn't limited to 7 possible
   periods the way a week is limited to 7 days), so this is a genuinely
   free-form list rather than a subset toggle — periods.length simply
   grows or shrinks as periods are added or removed.

   The 1-12 check constraint is widened to just "positive" (no upper
   bound) to actually honor "as much as needed" rather than swapping one
   arbitrary ceiling for another slightly higher one.
   --------------------------------------------------------------------- */

alter table public.schools
  add column if not exists periods jsonb not null default
    '[{"period":1,"time":"08:00"},{"period":2,"time":"09:00"},{"period":3,"time":"10:30"},{"period":4,"time":"11:30"},{"period":5,"time":"13:30"},{"period":6,"time":"14:30"}]'::jsonb;

alter table public.timetable_entries drop constraint if exists timetable_entries_period_check;
alter table public.timetable_entries add constraint timetable_entries_period_check check (period > 0);

create or replace function public.get_app_bootstrap(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts,working_days,periods from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.id,ai.structure_id,ai.name,ai.max_mark,ai.weight,ai.sort from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.id,ms.structure_id,ms.status,ms.submitted_by,ms.submitted_at,ms.approved_by,ms.approved_at,ms.returned_by,ms.returned_at,ms.return_reason,ms.published_by,ms.published_at,ms.reopen_reason from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_bootstrap(text) to authenticated;

create or replace function public.get_app_snapshot(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_payment_requests', coalesce((select jsonb_agg(to_jsonb(x)) from (select r.* from public.fee_payment_requests r join public.fee_items fi on fi.id = r.fee_item_id where fi.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_snapshot(text) to authenticated;

create or replace function public.update_school_settings(
  p_name text default null, p_motto text default null, p_bank_accounts text default null,
  p_working_days text default null, p_periods text default null)
returns jsonb language plpgsql security definer as $$
declare sch text; accounts jsonb; days jsonb; per jsonb;
begin
  if not public.has_perm('settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_bank_accounts is not null then
    begin
      accounts := p_bank_accounts::jsonb;
    exception when others then
      raise exception 'bank accounts payload is not valid JSON';
    end;
    if jsonb_typeof(accounts) <> 'array' then
      raise exception 'bank accounts must be a JSON array';
    end if;
  end if;
  if p_working_days is not null then
    begin
      days := p_working_days::jsonb;
    exception when others then
      raise exception 'working days payload is not valid JSON';
    end;
    if jsonb_typeof(days) <> 'array' or jsonb_array_length(days) = 0 then
      raise exception 'working days must be a non-empty JSON array';
    end if;
    if exists (
      select 1 from jsonb_array_elements(days) v
      where jsonb_typeof(v) <> 'number' or (v::text)::int not between 0 and 6
    ) then
      raise exception 'working days must be integers 0-6 (Sunday-Saturday)';
    end if;
  end if;
  if p_periods is not null then
    begin
      per := p_periods::jsonb;
    exception when others then
      raise exception 'periods payload is not valid JSON';
    end;
    if jsonb_typeof(per) <> 'array' or jsonb_array_length(per) = 0 then
      raise exception 'periods must be a non-empty JSON array';
    end if;
    if exists (
      select 1 from jsonb_array_elements(per) v
      where jsonb_typeof(v->'period') <> 'number' or (v->>'period')::int <= 0
         or jsonb_typeof(v->'time') <> 'string'
    ) then
      raise exception 'each period needs a positive period number and a time';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  update public.schools set
    name = coalesce(p_name, name),
    motto = coalesce(p_motto, motto),
    bank_accounts = coalesce(accounts, bank_accounts),
    working_days = coalesce(days, working_days),
    periods = coalesce(per, periods)
  where id = sch;
  perform public.log_action('settings.update', sch, p_name);
  return jsonb_build_object('schoolId', sch);
end $$;
grant execute on function public.update_school_settings(text,text,text,text,text) to authenticated;
drop function if exists public.update_school_settings(text,text,text,text);
`,ye=`/* ---------------------------------------------------------------------
   0043 — profiles was the one table nothing ever scoped, at all

   Prompted by: this app needs to work for a genuinely large school
   (5,000+ students) on Supabase's free tier, where both egress and
   compute are real, hard limits, not just nice-to-haves.

   Checking every table get_app_bootstrap()/get_app_snapshot() touch
   against its own RLS policy turned up good news first: most of the
   tables that scale with student count are already correctly scoped by
   existing, working RLS —
     - students / enrollments / student_documents: can_view_student(id)
       (admin: everyone; teacher: their assigned students; student:
       themselves; guardian: their linked children)
     - attendance_registers / attendance_entries: can_see_section(...)
     - guardian_students: guardian_id = auth.uid() or can_view_student(...)
   All of these already silently return a small, correctly-scoped set for
   every role except admin, purely because these functions run
   \`security invoker\` — RLS applies exactly as if the caller queried the
   table directly, with no code change needed. That was already true
   before this migration.

   profiles was the one real gap: \`create policy profiles_sel ... using
   (true)\` (0002) — every authenticated account can read every other
   account's row, full stop, no role-based limiting at all. At 5,000+
   students that's roughly 8,000-15,000 profile rows (students, their
   guardians, staff) downloaded in full by literally every login, every
   time — the dominant cost by far, and the one table where "genuinely
   large school" turns into "everyone's login gets slower and heavier
   forever," independent of which year is active.

   Fixed the same way as the already-working tables above: scoped in the
   bootstrap/snapshot queries themselves (not by tightening the
   underlying RLS policy, which other features may depend on staying
   open — e.g. an admin's user-management tooling, or name lookups this
   migration didn't audit) to yourself, plus anyone can_message_user()
   already says you're connected to — the same proven relationship
   matrix messaging already uses (teacher <-> their students/guardians,
   colleagues, everyone <-> admin). Reusing it here means no new
   relationship rules to get wrong, and it already handles admin
   correctly (sees everyone).
   --------------------------------------------------------------------- */

create or replace function public.get_app_bootstrap(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts,working_days,periods from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    -- Scoped: see this migration's header comment. Own row always
    -- included even if can_message_user(id) would say no (e.g.
    -- communication.send revoked) — you can always see yourself.
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at
      from public.profiles
      where public.is_admin() or id = auth.uid() or public.can_message_user(id)
    ) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.id,ai.structure_id,ai.name,ai.max_mark,ai.weight,ai.sort from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.id,ms.structure_id,ms.status,ms.submitted_by,ms.submitted_at,ms.approved_by,ms.approved_at,ms.returned_by,ms.returned_at,ms.return_reason,ms.published_by,ms.published_at,ms.reopen_reason from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_bootstrap(text) to authenticated;

create or replace function public.get_app_snapshot(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_payment_requests', coalesce((select jsonb_agg(to_jsonb(x)) from (select r.* from public.fee_payment_requests r join public.fee_items fi on fi.id = r.fee_item_id where fi.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.profiles
      where public.is_admin() or id = auth.uid() or public.can_message_user(id)
    ) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_snapshot(text) to authenticated;
`,xe=`/* ---------------------------------------------------------------------
   0044 — notifications are created by the database, not the browser

   Homework, announcements and events used to build their recipient list in
   the browser (db.users / db.students) and send one notify_users() call per
   recipient. Since the bounded bootstrap (0023/0043) the browser only holds
   the signed-in user, so those lists came back empty and nobody was
   notified. Fee items never notified anyone at all.

   The database knows who the recipients are, so it now creates the
   notifications itself with AFTER triggers. This works no matter which
   client or RPC wrote the row. Safe to re-run.
   --------------------------------------------------------------------- */

-- Insert one notification per distinct, active profile.
create or replace function public._notify_profiles(
  p_ids uuid[], p_type text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (profile_id, type, title, body)
  select distinct pr.id, p_type, p_title, p_body
  from unnest(coalesce(p_ids, '{}'::uuid[])) u(id)
  join public.profiles pr on pr.id = u.id and pr.status = 'active';
$$;

-- Profiles for a student: the student's own login plus every linked guardian.
create or replace function public._student_profile_ids(p_student_ids text[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct id), '{}'::uuid[]) from (
    select pr.id from public.profiles pr
      where pr.role = 'student' and pr.student_id = any(p_student_ids)
    union
    select gs.guardian_id from public.guardian_students gs
      where gs.student_id = any(p_student_ids)
  ) x;
$$;

-- Resolve an announcement/event audience (same shapes as the app's Audience
-- type) to profile ids. Sections are matched against the ACTIVE year.
create or replace function public._audience_profile_ids(p_aud jsonb)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  kind text := coalesce(p_aud->>'kind', 'everyone');
  cls  text := coalesce(p_aud->>'classId',  p_aud->>'class_id');
  sec  text := coalesce(p_aud->>'sectionId', p_aud->>'section_id');
  yr   text := (select id from public.academic_years where is_active limit 1);
  ids  uuid[];
begin
  if kind = 'everyone' then
    select array_agg(id) into ids from public.profiles where status = 'active';
  elsif kind in ('teachers', 'students', 'guardians') then
    select array_agg(id) into ids from public.profiles
      where status = 'active' and role = rtrim(kind, 's');
  elsif kind in ('section-students', 'section-guardians') then
    select public._student_profile_ids(array_agg(e.student_id)) into ids
      from public.enrollments e
      where e.year_id = yr and e.class_id = cls and e.section_id = sec and e.status = 'active';
    -- keep only the role the audience asked for
    select array_agg(pr.id) into ids from public.profiles pr
      where pr.id = any(coalesce(ids, '{}'::uuid[]))
        and pr.role = case when kind = 'section-students' then 'student' else 'guardian' end;
  end if;
  return coalesce(ids, '{}'::uuid[]);
end $$;

/* ---------------- homework ---------------- */
create or replace function public.trg_notify_homework()
returns trigger language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select public._student_profile_ids(array_agg(e.student_id)) into ids
    from public.enrollments e
    where e.year_id = new.year_id and e.class_id = new.class_id
      and e.section_id = new.section_id and e.status = 'active';
  perform public._notify_profiles(ids, 'homework', 'New homework',
    new.title || ' — due ' || to_char(new.due, 'DD Mon YYYY') || '.');
  return null;
end $$;
drop trigger if exists notify_homework on public.homework;
create trigger notify_homework after insert on public.homework
  for each row execute function public.trg_notify_homework();

/* ---------------- fees ---------------- */
create or replace function public.trg_notify_fee_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._notify_profiles(
    public._student_profile_ids(array[new.student_id]), 'fee', 'New fee added',
    new.label || ' — ' || trim(to_char(new.amount, 'FM999,999,990.00'))
      || coalesce(' (due ' || to_char(new.due_date, 'DD Mon YYYY') || ')', ''));
  return null;
end $$;
drop trigger if exists notify_fee_item on public.fee_items;
create trigger notify_fee_item after insert on public.fee_items
  for each row execute function public.trg_notify_fee_item();

/* ---------------- announcements (on becoming published) ---------------- */
create or replace function public.trg_notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform public._notify_profiles(
      array(select x from unnest(public._audience_profile_ids(new.audience)) x
            where x is distinct from new.sender_id),
      'announcement', new.title, left(new.body, 110));
  end if;
  return null;
end $$;
drop trigger if exists notify_announcement on public.announcements;
create trigger notify_announcement after insert or update of status on public.announcements
  for each row execute function public.trg_notify_announcement();

/* ---------------- events ---------------- */
create or replace function public.trg_notify_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._notify_profiles(
    array(select x from unnest(public._audience_profile_ids(new.audience)) x
          where x is distinct from new.created_by),
    'event', 'New school event',
    new.title || ' — ' || to_char(new.day, 'DD Mon YYYY')
      || coalesce(' at ' || new.time_of_day, '') || coalesce(', ' || new.location, ''));
  return null;
end $$;
drop trigger if exists notify_event on public.events;
create trigger notify_event after insert on public.events
  for each row execute function public.trg_notify_event();

notify pgrst, 'reload schema';
`,we=`/* ---------------------------------------------------------------------
   0045 — never deliver a teacher-area notification to an admin

   A notification carries a target_route inside one role's area. Some of the
   functions that create notifications don't check the recipient's role, so
   a teacher's "/teacher/marks" notification reached an admin, whose click
   ended on "Access denied — Required access: Teacher".

   This BEFORE INSERT trigger is deliberately narrow and NEVER blocks any
   other notification:
     - recipient is an admin and the route is a /teacher/... route
         -> the notification is skipped (never inserted, so no push either);
     - any other role-area mismatch (e.g. a /student/... route sent to a
       guardian) -> the row is still delivered, with its route cleared so a
       click falls back to the app's per-role destination;
     - no route, a shared route, or a matching route -> untouched.
   /admin/... routes are open to every base role by design, so they are
   never treated as a mismatch.

   Safe to re-run (CREATE OR REPLACE). If notifications ever stop arriving,
   this is the first thing to disable:
     drop trigger if exists notifications_role_guard on public.notifications;
   --------------------------------------------------------------------- */

create or replace function public.trg_notifications_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  route     text := to_jsonb(new)->>'target_route';  -- tolerant if the column is absent
  area      text;
  recipient text;
begin
  if route is null then
    return new;
  end if;

  area := substring(btrim(route) from '^/(admin|teacher|student|guardian)/');
  if area is null or area = 'admin' then
    return new;
  end if;

  select pr.role::text into recipient from public.profiles pr where pr.id = new.profile_id;
  if recipient is null or recipient = area then
    return new;
  end if;

  if recipient = 'admin' and area = 'teacher' then
    return null;                 -- a teacher's notification must not reach an admin
  end if;

  new.target_route := null;      -- deliver anyway; the app picks a valid destination
  return new;
end $$;

drop trigger if exists notifications_role_guard on public.notifications;
create trigger notifications_role_guard
  before insert on public.notifications
  for each row execute function public.trg_notifications_role_guard();

notify pgrst, 'reload schema';
`,je=`-- Applies migrations 0026-0032 (the write API) in order. Safe to re-run.
-- Paste the whole file into the Supabase SQL Editor and run it once.

-- =================== 0026_write_api.sql ===================
-- ===========================================================================
-- 0026_write_api.sql — every write becomes one intentional statement
--
-- THE PROBLEM THIS SOLVES
-- \`sync()\` in src/lib/backend.ts takes the previous in-memory DB and the new
-- one, diffs ~22 tables, and applies the delta. Changing a single mark means
-- serialising every student, every fee, every homework row and every
-- announcement in the school — twice — to discover that one number moved.
-- That is the write-path equivalent of the bootstrap problem: correct at 300
-- students, untenable at 5,000, and it gets worse every year.
--
-- It also has a correctness problem that has nothing to do with size. Two
-- people editing different students at the same time each hold a full
-- snapshot; whoever saves second writes their entire snapshot over the first
-- person's change. Last-writer-wins across the whole database, silently.
--
-- The functions below each do one thing, take only what changed, run in a
-- single transaction, and check permission themselves. \`save_student_marks\`
-- in 0002 was already the right shape — this extends that pattern to the
-- rest of the write surface.
--
-- All are SECURITY DEFINER with an explicit permission check as the first
-- statement. That check is not optional decoration; it is the authorization.
-- ===========================================================================

/* =========================================================================
   Attendance — one register, one statement.
   p_marks: {"st1":"present","st2":"absent",…}
   ========================================================================= */

create or replace function public.save_register(
  p_year_id text, p_class_id text, p_section_id text, p_day date, p_marks jsonb)
returns jsonb language plpgsql security definer as $$
declare reg_id text; n int := 0;
begin
  if not public.has_perm('attendance.manage') and not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.can_see_section(p_class_id, p_section_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.year_is_open(p_year_id) then
    raise exception 'academic year % is closed', p_year_id using errcode = '42501';
  end if;

  reg_id := p_year_id || '-' || to_char(p_day, 'YYYYMMDD') || '-' || p_class_id || '-' || p_section_id;

  insert into public.attendance_registers (id, year_id, day, class_id, section_id, recorded_by)
  values (reg_id, p_year_id, p_day, p_class_id, p_section_id, auth.uid())
  on conflict (year_id, day, class_id, section_id) do update
    set recorded_by = auth.uid()
  returning id into reg_id;

  -- Only students actually enrolled in this section this year can be marked,
  -- however the client built its payload.
  with incoming as (
    select key as student_id, value #>> '{}' as status
    from jsonb_each(p_marks)
  ), valid as (
    select i.student_id, i.status
    from incoming i
    join public.enrollments e
      on e.student_id = i.student_id and e.year_id = p_year_id
     and e.class_id = p_class_id and e.section_id = p_section_id and e.status = 'active'
    where i.status in ('present','absent','late')
  ), written as (
    insert into public.attendance_entries (id, register_id, student_id, status)
    select reg_id || '-' || v.student_id, reg_id, v.student_id, v.status from valid v
    on conflict (register_id, student_id) do update set status = excluded.status
    returning 1
  ) select count(*) into n from written;

  -- Anyone removed from the payload is no longer marked.
  delete from public.attendance_entries ae
  where ae.register_id = reg_id and not (p_marks ? ae.student_id);

  perform public.log_action('attendance.save', reg_id, format('%s students marked', n));
  return jsonb_build_object('registerId', reg_id, 'saved', n);
end $$;
grant execute on function public.save_register(text,text,text,date,jsonb) to authenticated;

/* =========================================================================
   Messaging
   ========================================================================= */

create or replace function public.send_message(p_conversation_id text, p_body text)
returns jsonb language plpgsql security definer as $$
declare new_id uuid; recipients uuid[];
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'message body is empty';
  end if;

  insert into public.messages (conversation_id, sender_id, body, read_by)
  values (p_conversation_id, auth.uid(), btrim(p_body), array[auth.uid()])
  returning id into new_id;

  update public.conversations set updated_at = now() where id = p_conversation_id;

  select array_agg(profile_id) into recipients
  from public.conversation_participants
  where conversation_id = p_conversation_id and profile_id <> auth.uid();

  if recipients is not null then
    perform public.notify_users(recipients, 'message', 'New message',
      left(btrim(p_body), 120));
  end if;

  return jsonb_build_object('id', new_id);
end $$;
grant execute on function public.send_message(text,text) to authenticated;

create or replace function public.mark_notifications_read(p_ids text[] default null)
returns integer language plpgsql security definer as $$
declare n int;
begin
  update public.notifications
     set is_read = true
   where profile_id = auth.uid()
     and not is_read
     and (p_ids is null or id::text = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_notifications_read(text[]) to authenticated;

/* =========================================================================
   Fees — payments are money, so this one is deliberately strict.
   ========================================================================= */

create or replace function public.record_fee_payment(
  p_fee_item_id text, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare f public.fee_items; new_paid numeric;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  -- Row lock: two bursars posting against the same fee at the same moment
  -- would otherwise both read the old \`paid\` and the second would overwrite
  -- the first. This is exactly the class of bug snapshot-diffing produced.
  select * into f from public.fee_items where id = p_fee_item_id for update;
  if f.id is null then raise exception 'unknown fee item %', p_fee_item_id; end if;
  if not public.year_is_open(f.year_id) then
    raise exception 'academic year % is closed', f.year_id using errcode = '42501';
  end if;

  new_paid := f.paid + p_amount;
  if new_paid > f.amount then
    raise exception 'payment of % exceeds the % outstanding', p_amount, f.amount - f.paid;
  end if;

  update public.fee_items set paid = new_paid where id = f.id;

  perform public.log_action('fees.payment', f.id,
    format('%s recorded against %s%s', p_amount, f.label,
           case when p_note is null then '' else ' — ' || p_note end));

  return jsonb_build_object('feeItemId', f.id, 'paid', new_paid,
                            'outstanding', f.amount - new_paid);
end $$;
grant execute on function public.record_fee_payment(text,numeric,text) to authenticated;

/* =========================================================================
   Mark submission workflow — the state machine, server-side.
   The existing tg_submission_state trigger validates transitions; this is
   the single entry point that drives them.
   ========================================================================= */

create or replace function public.set_submission_status(
  p_structure_id text, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer as $$
declare cur text;
begin
  cur := public.structure_status(p_structure_id);

  -- Who may make which move. Deliberately explicit rather than a generic
  -- "can edit marks" check: publishing results is not the same authority as
  -- entering them, and conflating the two is how marks reach families early.
  if p_status = 'submitted' then
    if not public.teacher_can_write_structure(p_structure_id) and not public.is_admin() then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status in ('approved','returned') then
    if not public.has_perm('results.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status = 'published' then
    if not public.has_perm('results.publish') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status = 'draft' then
    if not public.has_perm('results.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    raise exception 'unknown status %', p_status;
  end if;

  insert into public.mark_submissions (id, structure_id, status)
  values ('ms-' || p_structure_id, p_structure_id, p_status)
  on conflict (structure_id) do update set
    status        = p_status,
    submitted_by  = case when p_status = 'submitted' then auth.uid() else public.mark_submissions.submitted_by end,
    submitted_at  = case when p_status = 'submitted' then now()      else public.mark_submissions.submitted_at end,
    approved_by   = case when p_status = 'approved'  then auth.uid() else public.mark_submissions.approved_by end,
    approved_at   = case when p_status = 'approved'  then now()      else public.mark_submissions.approved_at end,
    returned_by   = case when p_status = 'returned'  then auth.uid() else public.mark_submissions.returned_by end,
    returned_at   = case when p_status = 'returned'  then now()      else public.mark_submissions.returned_at end,
    return_reason = case when p_status = 'returned'  then p_reason   else public.mark_submissions.return_reason end,
    published_by  = case when p_status = 'published' then auth.uid() else public.mark_submissions.published_by end,
    published_at  = case when p_status = 'published' then now()      else public.mark_submissions.published_at end,
    reopen_reason = case when p_status = 'draft'     then p_reason   else public.mark_submissions.reopen_reason end;

  perform public.log_action('marks.' || p_status, p_structure_id,
    coalesce(p_reason, format('%s → %s', cur, p_status)));

  return jsonb_build_object('structureId', p_structure_id, 'from', cur, 'to', p_status);
end $$;
grant execute on function public.set_submission_status(text,text,text) to authenticated;

/* =========================================================================
   Students — create/update through one door, with an explicit column
   whitelist. A client cannot set \`id\`, \`school_id\`, or \`status\` by smuggling
   them into the payload, because only the keys named below are ever read.
   ========================================================================= */

create or replace function public.save_student(p_payload jsonb, p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  sid text := nullif(p_payload->>'id', '');
  yr  text := coalesce(p_year_id, public.current_year_id());
  sch text;
  is_new boolean := sid is null;
begin
  if is_new then
    if not public.has_perm('students.create') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    if not public.has_perm('students.edit') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  if is_new then sid := 'st-' || replace(gen_random_uuid()::text, '-', ''); end if;

  insert into public.students (
    id, school_id, reg_no, admission_no, first_name, middle_name, last_name,
    gender, dob, phone, email, address, guardian_name, guardian_relation,
    guardian_phone, guardian_address, mother_name, admission_date,
    previous_school, admission_type, photo_path)
  values (
    sid, sch,
    coalesce(p_payload->>'reg_no', sid),
    p_payload->>'admission_no',
    p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name',
    coalesce(p_payload->>'gender', 'Male'),
    (p_payload->>'dob')::date,
    p_payload->>'phone', p_payload->>'email', p_payload->>'address',
    p_payload->>'guardian_name', p_payload->>'guardian_relation',
    p_payload->>'guardian_phone', p_payload->>'guardian_address',
    p_payload->>'mother_name',
    nullif(p_payload->>'admission_date','')::date,
    p_payload->>'previous_school', p_payload->>'admission_type',
    p_payload->>'photo_path')
  on conflict (id) do update set
    reg_no            = coalesce(excluded.reg_no, public.students.reg_no),
    admission_no      = excluded.admission_no,
    first_name        = excluded.first_name,
    middle_name       = excluded.middle_name,
    last_name         = excluded.last_name,
    gender            = excluded.gender,
    dob               = excluded.dob,
    phone             = excluded.phone,
    email             = excluded.email,
    address           = excluded.address,
    guardian_name     = excluded.guardian_name,
    guardian_relation = excluded.guardian_relation,
    guardian_phone    = excluded.guardian_phone,
    guardian_address  = excluded.guardian_address,
    mother_name       = excluded.mother_name,
    admission_date    = excluded.admission_date,
    previous_school   = excluded.previous_school,
    admission_type    = excluded.admission_type,
    photo_path        = coalesce(excluded.photo_path, public.students.photo_path);

  -- Enrollment for the selected year, if the caller supplied a placement.
  if (p_payload ? 'class_id') and (p_payload ? 'section_id') then
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, roll_number, status, enrolled_on)
    values (yr || '-' || sid, sid, yr,
            p_payload->>'class_id', p_payload->>'section_id',
            nullif(p_payload->>'roll_number','')::integer, 'active', current_date)
    on conflict (student_id, year_id) do update set
      class_id    = excluded.class_id,
      section_id  = excluded.section_id,
      roll_number = excluded.roll_number;
  end if;

  perform public.log_action(
    case when is_new then 'student.create' else 'student.update' end, sid,
    btrim(coalesce(p_payload->>'first_name','') || ' ' || coalesce(p_payload->>'last_name','')));

  return jsonb_build_object('studentId', sid, 'created', is_new);
end $$;
grant execute on function public.save_student(jsonb,text) to authenticated;

create or replace function public.set_student_status(p_student_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('active','transferred','withdrawn','graduated') then
    raise exception 'unknown status %', p_status;
  end if;
  update public.students set status = p_status where id = p_student_id;
  perform public.log_action('student.status', p_student_id, p_status);
  return jsonb_build_object('studentId', p_student_id, 'status', p_status);
end $$;
grant execute on function public.set_student_status(text,text) to authenticated;

/* =========================================================================
   File metadata — the browser used to insert into and delete from
   \`file_objects\` directly. It can't any more (there is no table surface), so
   these are the two named operations that replace it. Both re-check the
   owner relationship rather than trusting the caller's word for it.
   ========================================================================= */

create or replace function public.register_file(
  p_owner_type text, p_owner_id text, p_storage_key text,
  p_original_name text default null, p_mime_type text default null,
  p_size_bytes bigint default null, p_kind text default null)
returns jsonb language plpgsql security definer as $$
declare new_id uuid;
begin
  if p_owner_type not in ('student_photo','student_document','fee_receipt') then
    raise exception 'unsupported owner type %', p_owner_type;
  end if;

  -- All three current owner types hang off a student, so the same check
  -- covers them. Add a branch here when a new owner type is introduced —
  -- and note that failing to do so denies access rather than granting it.
  if not public.can_view_student(p_owner_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_owner_type = 'student_photo' and not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  insert into public.file_objects (
    owner_type, owner_id, storage_key, original_name, mime_type, size_bytes, kind, uploaded_by)
  values (p_owner_type, p_owner_id, p_storage_key, p_original_name, p_mime_type,
          p_size_bytes, p_kind, auth.uid())
  on conflict (storage_key) do update set
    original_name = excluded.original_name,
    mime_type     = excluded.mime_type,
    size_bytes    = excluded.size_bytes,
    kind          = excluded.kind
  returning id into new_id;

  perform public.log_action('file.upload', p_storage_key, coalesce(p_original_name, p_owner_type));
  return jsonb_build_object('fileId', new_id, 'key', p_storage_key);
end $$;
grant execute on function public.register_file(text,text,text,text,text,bigint,text) to authenticated;

create or replace function public.unregister_file(p_storage_key text)
returns jsonb language plpgsql security definer as $$
declare f public.file_objects;
begin
  select * into f from public.file_objects where storage_key = p_storage_key;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;

  if not public.can_view_student(f.owner_id) or not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  delete from public.file_objects where id = f.id;
  perform public.log_action('file.delete', p_storage_key, f.original_name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.unregister_file(text) to authenticated;

/* =========================================================================
   Roles and user accounts — the last two things the browser used to write
   directly. Both are privilege-adjacent, which is exactly why they should
   never have been a raw table write: \`profiles.role\` and
   \`role_permissions\` decide what everyone else can do.
   ========================================================================= */

create or replace function public.save_role(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare rid text := p_payload->>'id'; perms text[];
begin
  if not public.has_perm('roles.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if rid is null or btrim(rid) = '' then raise exception 'role id is required'; end if;

  -- A system role's identity is fixed; only its permission set may move.
  if exists (select 1 from public.role_defs where id = rid and is_system) then
    if coalesce(p_payload->>'name','') <> '' and
       (select name from public.role_defs where id = rid) <> (p_payload->>'name') then
      raise exception 'built-in roles cannot be renamed';
    end if;
  end if;

  insert into public.role_defs (id, name, description, is_system, all_permissions, applies_to, status)
  values (rid,
          coalesce(p_payload->>'name', rid),
          p_payload->>'description',
          false,
          coalesce((p_payload->>'all_permissions')::boolean, false),
          coalesce(array(select jsonb_array_elements_text(p_payload->'applies_to')), '{}'),
          coalesce(p_payload->>'status', 'active'))
  on conflict (id) do update set
    name            = excluded.name,
    description     = excluded.description,
    all_permissions = excluded.all_permissions,
    applies_to      = excluded.applies_to,
    status          = excluded.status;

  -- Replace the permission set atomically, and only with permissions that
  -- actually exist — a typo silently granting nothing is better than a typo
  -- inserting a row nothing ever checks.
  if p_payload ? 'permissions' then
    perms := array(select jsonb_array_elements_text(p_payload->'permissions'));
    delete from public.role_permissions where role_def_id = rid;
    insert into public.role_permissions (role_def_id, permission_id)
    select rid, p.id from public.permissions p where p.id = any(perms);
  end if;

  perform public.log_action('role.save', rid, p_payload->>'name');
  return jsonb_build_object('roleId', rid);
end $$;
grant execute on function public.save_role(jsonb) to authenticated;

create or replace function public.update_user_account(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare uid uuid := (p_payload->>'id')::uuid; target public.profiles;
begin
  if not public.has_perm('users.manage') and not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into target from public.profiles where id = uid;
  if target.id is null then raise exception 'unknown user'; end if;

  -- You cannot disable or demote yourself. Locking the last administrator
  -- out of their own system is a support call nobody enjoys.
  if uid = auth.uid() and (
       coalesce(p_payload->>'status', target.status) <> 'active'
       or coalesce(p_payload->>'role_def_id', target.role_def_id) <> target.role_def_id) then
    raise exception 'you cannot change your own role or status';
  end if;

  update public.profiles set
    full_name   = coalesce(p_payload->>'full_name', full_name),
    email       = coalesce(p_payload->>'email', email),
    phone       = coalesce(p_payload->>'phone', phone),
    role_def_id = coalesce(p_payload->>'role_def_id', role_def_id),
    status      = coalesce(p_payload->>'status', status)
  where id = uid;

  -- Guardian-to-child links, replaced as a set when supplied.
  if p_payload ? 'children' then
    delete from public.guardian_students where guardian_id = uid;
    insert into public.guardian_students (guardian_id, student_id)
    select uid, s.id from public.students s
    where s.id = any(array(select jsonb_array_elements_text(p_payload->'children')))
    on conflict do nothing;
  end if;

  perform public.log_action('user.update', uid::text, target.username);
  return jsonb_build_object('userId', uid);
end $$;
grant execute on function public.update_user_account(jsonb) to authenticated;


-- =================== 0027_fee_payment_detail.sql ===================
-- ===========================================================================
-- 0027_fee_payment_detail.sql — record_fee_payment keeps the transaction,
-- not just the new total.
--
-- WHY THIS EXISTS
-- 0006_fee_payments.sql added a \`payments jsonb\` column to fee_items so each
-- payment keeps its own method (cash / telebirr / cbe_birr / bank_transfer /
-- cheque), a reference number, and — for bank transfers — which bank it came
-- through. The UI (FeesPage.recordPayment) has always collected all of that.
--
-- But 0026_write_api.sql's record_fee_payment(fee_item_id, amount, note) only
-- ever touched the \`paid\` running total — it never appended to \`payments\`.
-- There was no server-side way to save the method/reference/bank at all, so
-- receipts and audit trails would have shown a number with no transaction
-- behind it. This replaces that function with one that does both, in the
-- same row-locked transaction.
--
-- The 3-argument signature is dropped rather than left as a second overload:
-- both versions accept (text, numeric, text) as their first three
-- parameters, and PostgREST/PostgreSQL can pick either when called by
-- argument name, so keeping both risks calling the wrong one silently.
-- ===========================================================================

drop function if exists public.record_fee_payment(text, numeric, text);

create or replace function public.record_fee_payment(
  p_fee_item_id text,
  p_amount numeric,
  p_method text default 'cash',
  p_reference text default null,
  p_bank text default null,
  p_note text default null)
returns jsonb language plpgsql security definer as $$
declare
  f public.fee_items;
  new_paid numeric;
  entry jsonb;
  recorder text;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if p_method not in ('cash','telebirr','cbe_birr','bank_transfer','cheque') then
    raise exception 'unknown payment method %', p_method;
  end if;
  if p_method <> 'cash' and coalesce(btrim(p_reference), '') = '' then
    raise exception '% requires a transaction reference', p_method;
  end if;

  -- Row lock: two bursars posting against the same fee at the same moment
  -- would otherwise both read the old \`paid\` and the second would overwrite
  -- the first. This is exactly the class of bug snapshot-diffing produced.
  select * into f from public.fee_items where id = p_fee_item_id for update;
  if f.id is null then raise exception 'unknown fee item %', p_fee_item_id; end if;
  if not public.year_is_open(f.year_id) then
    raise exception 'academic year % is closed', f.year_id using errcode = '42501';
  end if;

  new_paid := f.paid + p_amount;
  if new_paid > f.amount then
    raise exception 'payment of % exceeds the % outstanding', p_amount, f.amount - f.paid;
  end if;

  select full_name into recorder from public.profiles where id = auth.uid();

  entry := jsonb_build_object(
    'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
    'amount', p_amount,
    'method', p_method,
    'reference', nullif(btrim(coalesce(p_reference, '')), ''),
    'bank', case when p_method = 'bank_transfer' then p_bank else null end,
    'date', to_char(now(), 'YYYY-MM-DD'),
    'recordedBy', recorder);

  update public.fee_items
     set paid = new_paid,
         payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(entry)
   where id = f.id;

  perform public.log_action('fees.payment', f.id,
    format('%s recorded against %s%s', p_amount, f.label,
           case when p_note is null then '' else ' — ' || p_note end));

  return jsonb_build_object(
    'feeItemId', f.id, 'paid', new_paid,
    'outstanding', f.amount - new_paid, 'entry', entry);
end $$;
grant execute on function public.record_fee_payment(text,numeric,text,text,text,text) to authenticated;


-- =================== 0028_fee_item_crud.sql ===================
-- ===========================================================================
-- 0028_fee_item_crud.sql — creating and removing a fee item, as named ops
--
-- 0026_write_api.sql gave \`record_fee_payment\` a real home but never covered
-- the other two fee_items writes the Fees page performs: billing a student
-- for a new item ("Add fee") and removing one that was added in error.
-- Both went through the generic upsert()/remove(), which 0026 disabled for
-- every table — so, same as students/marks/attendance/messages before this
-- round, they currently fail with "no longer go through snapshot syncing."
--
-- \`apply_fee_template()\` (0025) already covers billing a whole class at
-- once; \`create_fee_item\` is the one-student equivalent for a one-off charge
-- outside any template.
-- ===========================================================================

create or replace function public.create_fee_item(
  p_student_id text, p_label text, p_amount numeric, p_due_date date default null,
  p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  fid text := 'fee-' || replace(gen_random_uuid()::text, '-', '');
  yr text := coalesce(p_year_id, public.current_year_id());
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.can_view_student(p_student_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'a label is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if not public.year_is_open(yr) then
    raise exception 'academic year % is closed', yr using errcode = '42501';
  end if;

  insert into public.fee_items (id, student_id, label, amount, paid, due_date, year_id, payments)
  values (fid, p_student_id, btrim(p_label), p_amount, 0, p_due_date, yr, '[]'::jsonb);

  perform public.log_action('fees.create', fid, format('%s — %s', btrim(p_label), p_amount));
  return jsonb_build_object('feeItemId', fid);
end $$;
grant execute on function public.create_fee_item(text,text,numeric,date,text) to authenticated;

-- ===========================================================================
-- mark_message_read — the other half of 0026's send_message.
--
-- send_message() covers sending; nothing covered a message's read_by flip
-- (sent → read), so it went through the same disabled generic upsert as
-- everything else in this file. Realtime (0013) streams the change once
-- it happens — this is what makes it happen.
-- ===========================================================================

create or replace function public.mark_message_read(p_conversation_id text)
returns integer language plpgsql security definer as $$
declare n int;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.messages
     set read_by = read_by || array[auth.uid()]
   where conversation_id = p_conversation_id
     and sender_id <> auth.uid()
     and not (auth.uid() = any(read_by));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_message_read(text) to authenticated;

-- ===========================================================================
-- delete_role — RolesPage has always offered to delete a custom (non-system)
-- role. 0026's save_role covers create/update; nothing covered delete, so it
-- fell through to the same disabled generic remove() as everything else.
-- ===========================================================================

create or replace function public.delete_role(p_role_id text)
returns jsonb language plpgsql security definer as $$
declare r public.role_defs;
begin
  if not public.has_perm('roles.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into r from public.role_defs where id = p_role_id;
  if r.id is null then return jsonb_build_object('deleted', 0); end if;
  if r.is_system then raise exception 'system roles cannot be deleted'; end if;
  if exists (select 1 from public.profiles where role_def_id = r.id) then
    raise exception 'cannot delete a role that is still assigned to a user';
  end if;

  delete from public.role_defs where id = r.id; -- role_permissions cascades
  perform public.log_action('role.delete', p_role_id, r.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_role(text) to authenticated;

create or replace function public.delete_fee_item(p_fee_item_id text)
returns jsonb language plpgsql security definer as $$
declare f public.fee_items;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into f from public.fee_items where id = p_fee_item_id;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;
  if f.paid > 0 then
    raise exception 'cannot delete a fee item that already has payments recorded against it';
  end if;

  delete from public.fee_items where id = f.id;
  perform public.log_action('fees.delete', p_fee_item_id, f.label);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_fee_item(text) to authenticated;


-- =================== 0029_save_student_stable_id.sql ===================
-- ===========================================================================
-- 0029_save_student_stable_id.sql — a new student keeps the id the client
-- already gave it.
--
-- THE PROBLEM
-- save_student() (0026) decided "is this a create or an edit?" by whether
-- p_payload had an \`id\`: no id → generate one server-side. That matches a
-- UUID-keyed table, but students are the one entity this schema's own header
-- comment (0001_schema.sql) says keeps client-assigned short text ids
-- ("Text PKs preserve the application's existing identifiers"), and the
-- Registration wizard has always generated that id up front — before the
-- record is saved, and before it's known whether a login account will be
-- created in the same action.
--
-- Sending no id to let the server mint its own would leave the client
-- holding one id (used locally, and already wired into a new login
-- account's student_id in the same save) while the server used a different
-- one — a silent mismatch that would only surface later as a guardian or
-- teacher whose account points at a student that doesn't exist.
--
-- THE FIX
-- Always accept the client's id. "Is this new?" is now answered by whether
-- a row with that id already exists, not by whether an id was supplied —
-- which also means students.create vs students.edit is checked against
-- reality, not against what the client happened to send.
-- ===========================================================================

create or replace function public.save_student(p_payload jsonb, p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  sid text := nullif(p_payload->>'id', '');
  yr  text := coalesce(p_year_id, public.current_year_id());
  sch text;
  is_new boolean;
begin
  if sid is null then
    raise exception 'a student id is required';
  end if;
  is_new := not exists (select 1 from public.students where id = sid);

  if is_new then
    if not public.has_perm('students.create') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    if not public.has_perm('students.edit') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.students (
    id, school_id, reg_no, admission_no, first_name, middle_name, last_name,
    gender, dob, phone, email, address, guardian_name, guardian_relation,
    guardian_phone, guardian_address, mother_name, admission_date,
    previous_school, admission_type, photo_path)
  values (
    sid, sch,
    coalesce(p_payload->>'reg_no', sid),
    p_payload->>'admission_no',
    p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name',
    coalesce(p_payload->>'gender', 'Male'),
    (p_payload->>'dob')::date,
    p_payload->>'phone', p_payload->>'email', p_payload->>'address',
    p_payload->>'guardian_name', p_payload->>'guardian_relation',
    p_payload->>'guardian_phone', p_payload->>'guardian_address',
    p_payload->>'mother_name',
    nullif(p_payload->>'admission_date','')::date,
    p_payload->>'previous_school', p_payload->>'admission_type',
    p_payload->>'photo_path')
  on conflict (id) do update set
    reg_no            = coalesce(excluded.reg_no, public.students.reg_no),
    admission_no      = excluded.admission_no,
    first_name        = excluded.first_name,
    middle_name       = excluded.middle_name,
    last_name         = excluded.last_name,
    gender            = excluded.gender,
    dob               = excluded.dob,
    phone             = excluded.phone,
    email             = excluded.email,
    address           = excluded.address,
    guardian_name     = excluded.guardian_name,
    guardian_relation = excluded.guardian_relation,
    guardian_phone    = excluded.guardian_phone,
    guardian_address  = excluded.guardian_address,
    mother_name       = excluded.mother_name,
    admission_date    = excluded.admission_date,
    previous_school   = excluded.previous_school,
    admission_type    = excluded.admission_type,
    photo_path        = coalesce(excluded.photo_path, public.students.photo_path);

  if (p_payload ? 'class_id') and (p_payload ? 'section_id') then
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, roll_number, status, enrolled_on)
    values (yr || '-' || sid, sid, yr,
            p_payload->>'class_id', p_payload->>'section_id',
            nullif(p_payload->>'roll_number','')::integer, 'active', current_date)
    on conflict (student_id, year_id) do update set
      class_id    = excluded.class_id,
      section_id  = excluded.section_id,
      roll_number = excluded.roll_number;
  end if;

  perform public.log_action(
    case when is_new then 'student.create' else 'student.update' end, sid,
    btrim(coalesce(p_payload->>'first_name','') || ' ' || coalesce(p_payload->>'last_name','')));

  return jsonb_build_object('studentId', sid, 'created', is_new);
end $$;
grant execute on function public.save_student(jsonb,text) to authenticated;


-- =================== 0030_write_api_structure.sql ===================
-- ===========================================================================
-- 0030_write_api_structure.sql — the rest of the write surface
--
-- 0026/0027/0028/0029 covered students, marks, attendance, fees, roles,
-- messages and user accounts. Everything else the app can save — classes,
-- sections, subjects, teachers, teacher assignments, homework, timetable
-- entries, announcements, events, starting a conversation, and reviewing a
-- guardian's bank-transfer receipt — still fell through to the same
-- disabled generic upsert()/remove() as those did before this round. Same
-- fix, same pattern, applied to what's left.
--
-- A few of these add a guard 0026 didn't need: deleting a class, subject or
-- teacher that's still in active use (an enrollment, an assignment) is
-- refused with a clear reason rather than silently orphaning rows that
-- foreign keys would otherwise cascade-delete out from under a live
-- school — e.g. deleting a class quietly un-enrolling every student in it.
-- ===========================================================================

/* ============================= classes ============================= */

create or replace function public.save_class(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare cid text := p_payload->>'id'; sch text; sec jsonb;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a class name is required'; end if;
  if cid is null or btrim(cid) = '' then raise exception 'a class id is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.classes (id, school_id, name, level)
  values (cid, sch, btrim(p_payload->>'name'), coalesce((p_payload->>'level')::integer, 0))
  on conflict (id) do update set name = excluded.name, level = excluded.level, updated_at = now();

  if p_payload ? 'sections' then
    delete from public.sections s
    where s.class_id = cid
      and not (s.id = any(array(select jsonb_array_elements(p_payload->'sections') ->> 'id')));
    for sec in select jsonb_array_elements(p_payload->'sections') loop
      insert into public.sections (id, class_id, name)
      values (sec->>'id', cid, sec->>'name')
      on conflict (id) do update set name = excluded.name;
    end loop;
  end if;

  perform public.log_action('class.save', cid, p_payload->>'name');
  return jsonb_build_object('classId', cid);
end $$;
grant execute on function public.save_class(jsonb) to authenticated;

create or replace function public.delete_class(p_class_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.enrollments where class_id = p_class_id and status = 'active') then
    raise exception 'cannot delete a class with actively enrolled students';
  end if;
  delete from public.classes where id = p_class_id;
  perform public.log_action('class.delete', p_class_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_class(text) to authenticated;

/* ============================= subjects ============================= */

create or replace function public.save_subject(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare sid text := p_payload->>'id'; sch text;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if sid is null or btrim(sid) = '' then raise exception 'a subject id is required'; end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a subject name is required'; end if;
  if coalesce(btrim(p_payload->>'code'), '') = '' then raise exception 'a subject code is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.subjects (id, school_id, code, name, color)
  values (sid, sch, upper(btrim(p_payload->>'code')), btrim(p_payload->>'name'), p_payload->>'color')
  on conflict (id) do update set
    code = excluded.code, name = excluded.name, color = excluded.color, updated_at = now();

  perform public.log_action('subject.save', sid, p_payload->>'name');
  return jsonb_build_object('subjectId', sid);
end $$;
grant execute on function public.save_subject(jsonb) to authenticated;

create or replace function public.delete_subject(p_subject_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.teacher_assignments where subject_id = p_subject_id) then
    raise exception 'cannot delete a subject that still has teacher assignments';
  end if;
  delete from public.subjects where id = p_subject_id;
  perform public.log_action('subject.delete', p_subject_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_subject(text) to authenticated;

/* ============================= teachers ============================= */

create or replace function public.save_teacher(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare tid text := p_payload->>'id'; sch text;
begin
  if not public.has_perm('teachers.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if tid is null or btrim(tid) = '' then raise exception 'a teacher id is required'; end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a teacher name is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.teachers (id, school_id, name, phone, email, specialty)
  values (tid, sch, btrim(p_payload->>'name'), p_payload->>'phone', p_payload->>'email', p_payload->>'specialty')
  on conflict (id) do update set
    name = excluded.name, phone = excluded.phone, email = excluded.email,
    specialty = excluded.specialty, updated_at = now();

  perform public.log_action('teacher.save', tid, p_payload->>'name');
  return jsonb_build_object('teacherId', tid);
end $$;
grant execute on function public.save_teacher(jsonb) to authenticated;

create or replace function public.delete_teacher(p_teacher_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('teachers.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.teacher_assignments where teacher_id = p_teacher_id) then
    raise exception 'cannot delete a teacher with active class assignments';
  end if;
  delete from public.teachers where id = p_teacher_id;
  perform public.log_action('teacher.delete', p_teacher_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_teacher(text) to authenticated;

/* ======================= teacher assignments ======================= */

create or replace function public.save_assignment(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare aid text := coalesce(p_payload->>'id', 'asg-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
  values (aid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'section_id',
          p_payload->>'subject_id', p_payload->>'teacher_id')
  on conflict (id) do update set
    class_id = excluded.class_id, section_id = excluded.section_id,
    subject_id = excluded.subject_id, teacher_id = excluded.teacher_id;
  perform public.log_action('assignment.save', aid, null);
  return jsonb_build_object('assignmentId', aid);
end $$;
grant execute on function public.save_assignment(jsonb) to authenticated;

create or replace function public.delete_assignment(p_assignment_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.teacher_assignments where id = p_assignment_id;
  perform public.log_action('assignment.delete', p_assignment_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_assignment(text) to authenticated;

/* ============================= homework ============================= */

create or replace function public.save_homework(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare hid text := coalesce(p_payload->>'id', 'hw-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('homework.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.homework (id, year_id, class_id, section_id, subject_id, title, description, issued, due)
  values (hid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'section_id', p_payload->>'subject_id',
          btrim(p_payload->>'title'), p_payload->>'description',
          coalesce((p_payload->>'issued')::date, current_date), (p_payload->>'due')::date)
  on conflict (id) do update set
    class_id = excluded.class_id, section_id = excluded.section_id, subject_id = excluded.subject_id,
    title = excluded.title, description = excluded.description, due = excluded.due, updated_at = now();
  perform public.log_action('homework.save', hid, p_payload->>'title');
  return jsonb_build_object('homeworkId', hid);
end $$;
grant execute on function public.save_homework(jsonb) to authenticated;

-- A separate, narrower operation from save_homework() on purpose: marking
-- a homework item submitted is done by two different kinds of caller — a
-- teacher/admin ticking off the class roster, and a student marking their
-- own — and the second group will never hold homework.manage. Gating the
-- whole row (title/description/due) behind homework.manage while gating
-- just this one array behind "is this your own submission" keeps a
-- student's access exactly as wide as it needs to be and no wider.
create or replace function public.toggle_homework_submission(p_homework_id text, p_student_id text)
returns jsonb language plpgsql security definer as $$
declare h public.homework; now_submitted boolean;
begin
  if not public.has_perm('homework.manage') then
    if not exists (select 1 from public.profiles where id = auth.uid() and student_id = p_student_id) then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select * into h from public.homework where id = p_homework_id;
  if h.id is null then raise exception 'unknown homework %', p_homework_id; end if;

  if p_student_id = any(h.submitted_students) then
    update public.homework set submitted_students = array_remove(submitted_students, p_student_id) where id = h.id;
    now_submitted := false;
  else
    update public.homework set submitted_students = array_append(submitted_students, p_student_id) where id = h.id;
    now_submitted := true;
  end if;

  return jsonb_build_object('homeworkId', h.id, 'studentId', p_student_id, 'submitted', now_submitted);
end $$;
grant execute on function public.toggle_homework_submission(text,text) to authenticated;

create or replace function public.delete_homework(p_homework_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('homework.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.homework where id = p_homework_id;
  perform public.log_action('homework.delete', p_homework_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_homework(text) to authenticated;

/* =========================== timetable =========================== */

create or replace function public.save_timetable_entry(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare eid text := coalesce(p_payload->>'id', 'tt-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.timetable_entries (id, class_id, section_id, day, period, subject_id, room)
  values (eid, p_payload->>'class_id', p_payload->>'section_id',
          (p_payload->>'day')::integer, (p_payload->>'period')::integer,
          p_payload->>'subject_id', p_payload->>'room')
  on conflict (id) do update set subject_id = excluded.subject_id, room = excluded.room;
  perform public.log_action('timetable.save', eid, null);
  return jsonb_build_object('entryId', eid);
end $$;
grant execute on function public.save_timetable_entry(jsonb) to authenticated;

create or replace function public.delete_timetable_entry(
  p_class_id text, p_section_id text, p_day integer, p_period integer)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.timetable_entries
   where class_id = p_class_id and section_id = p_section_id and day = p_day and period = p_period;
  perform public.log_action('timetable.delete', p_class_id || '/' || p_section_id, format('day %s period %s', p_day, p_period));
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_timetable_entry(text,text,integer,integer) to authenticated;

/* ===================== assessment structures ===================== */

create or replace function public.save_assessment_structure(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare sid text := coalesce(p_payload->>'id', 'as-' || replace(gen_random_uuid()::text, '-', '')); it jsonb;
begin
  if not public.has_perm('exams.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id)
  values (sid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'subject_id', p_payload->>'term_id')
  on conflict (id) do update set
    class_id = excluded.class_id, subject_id = excluded.subject_id, term_id = excluded.term_id, updated_at = now();

  if p_payload ? 'items' then
    delete from public.assessment_items i
    where i.structure_id = sid
      and not (i.id = any(array(select jsonb_array_elements(p_payload->'items') ->> 'id')));
    for it in select jsonb_array_elements(p_payload->'items') loop
      insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort)
      values (it->>'id', sid, it->>'name', (it->>'max')::numeric, (it->>'weight')::numeric,
              coalesce((it->>'sort')::integer, 0))
      on conflict (id) do update set
        name = excluded.name, max_mark = excluded.max_mark, weight = excluded.weight, sort = excluded.sort;
    end loop;
  end if;

  perform public.log_action('assessment.save', sid, p_payload->>'period');
  return jsonb_build_object('structureId', sid);
end $$;
grant execute on function public.save_assessment_structure(jsonb) to authenticated;

create or replace function public.delete_assessment_structure(p_structure_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('exams.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.assessment_marks where structure_id = p_structure_id) then
    raise exception 'cannot delete an assessment that already has marks entered against it';
  end if;
  delete from public.assessment_structures where id = p_structure_id;
  perform public.log_action('assessment.delete', p_structure_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_assessment_structure(text) to authenticated;

/* =========================== communication =========================== */

create or replace function public.save_announcement(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare aid text := p_payload->>'id'; is_new boolean;
begin
  is_new := aid is null or btrim(aid) = '';
  if is_new then
    if not public.has_perm('communication.create_announcement') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
    aid := 'ann-' || replace(gen_random_uuid()::text, '-', '');
  else
    if not public.has_perm('communication.manage_announcement') and not public.has_perm('communication.create_announcement') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  insert into public.announcements (id, title, body, category, sender_id, audience, status, scheduled_for, published_at, pinned)
  values (aid, p_payload->>'title', p_payload->>'body', p_payload->>'category', auth.uid(),
          coalesce(p_payload->'audience', '{"kind":"everyone"}'::jsonb),
          coalesce(p_payload->>'status', 'draft'),
          nullif(p_payload->>'scheduled_for','')::timestamptz,
          case when p_payload->>'status' = 'published' then now() else nullif(p_payload->>'published_at','')::timestamptz end,
          coalesce((p_payload->>'pinned')::boolean, false))
  on conflict (id) do update set
    title = excluded.title, body = excluded.body, category = excluded.category,
    audience = excluded.audience, status = excluded.status,
    scheduled_for = excluded.scheduled_for,
    published_at = coalesce(public.announcements.published_at, excluded.published_at),
    pinned = excluded.pinned, updated_at = now();

  perform public.log_action(case when is_new then 'announcement.create' else 'announcement.update' end, aid, p_payload->>'title');
  return jsonb_build_object('announcementId', aid);
end $$;
grant execute on function public.save_announcement(jsonb) to authenticated;

create or replace function public.save_event(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare eid text := coalesce(nullif(p_payload->>'id',''), 'evt-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('events.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.events (id, title, description, day, time_of_day, location, category, audience, created_by)
  values (eid, p_payload->>'title', p_payload->>'description', (p_payload->>'day')::date,
          p_payload->>'time_of_day', p_payload->>'location', p_payload->>'category',
          coalesce(p_payload->'audience', '{"kind":"everyone"}'::jsonb), auth.uid())
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, day = excluded.day,
    time_of_day = excluded.time_of_day, location = excluded.location, category = excluded.category,
    audience = excluded.audience, updated_at = now();
  perform public.log_action('event.save', eid, p_payload->>'title');
  return jsonb_build_object('eventId', eid);
end $$;
grant execute on function public.save_event(jsonb) to authenticated;

create or replace function public.delete_event(p_event_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('events.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.events where id = p_event_id;
  perform public.log_action('event.delete', p_event_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_event(text) to authenticated;

/* ========================= conversations ========================= */

create or replace function public.start_conversation(
  p_other_profile_id uuid, p_related_student_id text default null,
  p_related_class_id text default null, p_related_section_id text default null,
  p_related_subject_id text default null)
returns jsonb language plpgsql security definer as $$
declare cid text; existing text;
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    raise exception 'a conversation needs a real other participant';
  end if;

  -- Reuse an existing direct conversation between exactly these two people
  -- rather than spawning a duplicate every time "message" is clicked.
  select c.id into existing
  from public.conversations c
  where c.type = 'direct'
    and exists (select 1 from public.conversation_participants p1 where p1.conversation_id = c.id and p1.profile_id = auth.uid())
    and exists (select 1 from public.conversation_participants p2 where p2.conversation_id = c.id and p2.profile_id = p_other_profile_id)
    and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if existing is not null then
    return jsonb_build_object('conversationId', existing, 'created', false);
  end if;

  cid := 'conv-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.conversations (id, type, related_student_id, related_class_id, related_section_id, related_subject_id, status)
  values (cid, 'direct', p_related_student_id, p_related_class_id, p_related_section_id, p_related_subject_id, 'active');
  insert into public.conversation_participants (conversation_id, profile_id) values (cid, auth.uid()), (cid, p_other_profile_id);

  perform public.log_action('conversation.start', cid, null);
  return jsonb_build_object('conversationId', cid, 'created', true);
end $$;
grant execute on function public.start_conversation(uuid,text,text,text,text) to authenticated;

create or replace function public.set_conversation_status(p_conversation_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('active','archived','hidden') then raise exception 'unknown status %', p_status; end if;
  update public.conversations set status = p_status, updated_at = now() where id = p_conversation_id;
  return jsonb_build_object('conversationId', p_conversation_id, 'status', p_status);
end $$;
grant execute on function public.set_conversation_status(text,text) to authenticated;

/* ================= fee payment request review ================= */

create or replace function public.review_fee_payment_request(
  p_request_id text, p_status text, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare r public.fee_payment_requests; f public.fee_items; entry jsonb; new_paid numeric;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'unknown status %', p_status; end if;

  select * into r from public.fee_payment_requests where id = p_request_id for update;
  if r.id is null then raise exception 'unknown payment request %', p_request_id; end if;
  if r.status <> 'pending' then raise exception 'this request has already been reviewed'; end if;

  update public.fee_payment_requests set
    status = p_status, reviewed_by = auth.uid(),
    reviewed_by_name = (select full_name from public.profiles where id = auth.uid()),
    reviewed_at = now(), review_note = p_note
  where id = r.id;

  if p_status = 'approved' then
    select * into f from public.fee_items where id = r.fee_item_id for update;
    if f.id is null then raise exception 'the fee item this request was for no longer exists'; end if;
    new_paid := least(f.amount, f.paid + r.amount);

    entry := jsonb_build_object(
      'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
      'amount', r.amount, 'method', 'bank_transfer', 'reference', r.reference, 'bank', r.bank_name,
      'date', to_char(now(), 'YYYY-MM-DD'),
      'recordedBy', (select full_name from public.profiles where id = auth.uid()));

    update public.fee_items
       set paid = new_paid, payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(entry)
     where id = f.id;
  end if;

  perform public.log_action('fees.payment.' || p_status, p_request_id, p_note);
  return jsonb_build_object('requestId', p_request_id, 'status', p_status);
end $$;
grant execute on function public.review_fee_payment_request(text,text,text) to authenticated;

/* ============================= settings ============================= */

create or replace function public.update_school_settings(
  p_name text default null, p_motto text default null, p_bank_accounts text default null)
returns jsonb language plpgsql security definer as $$
declare sch text; accounts jsonb;
begin
  if not public.has_perm('settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_bank_accounts is not null then
    begin
      accounts := p_bank_accounts::jsonb;
    exception when others then
      raise exception 'bank accounts payload is not valid JSON';
    end;
    if jsonb_typeof(accounts) <> 'array' then
      raise exception 'bank accounts must be a JSON array';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  update public.schools set
    name = coalesce(p_name, name),
    motto = coalesce(p_motto, motto),
    bank_accounts = coalesce(accounts, bank_accounts)
  where id = sch;
  perform public.log_action('settings.update', sch, p_name);
  return jsonb_build_object('schoolId', sch);
end $$;
grant execute on function public.update_school_settings(text,text,text) to authenticated;


-- =================== 0031_year_lifecycle_fixes.sql ===================
-- ===========================================================================
-- 0031_year_lifecycle_fixes.sql
--
-- TWO PROBLEMS, ONE FILE
--
-- 1. A real permission bug, not just a missing operation. 0010 deliberately
--    split "manage academic years & terms" into its own permission
--    (academics.manage_years) so a school could grant "manage classes"
--    without also granting "restructure the academic calendar" — and wired
--    the RLS policies on academic_years/terms to check it. But
--    0025_year_lifecycle.sql, written after 0010, checks the broader
--    academics.manage in set_active_year, close_year, rollover_year and
--    create_academic_year instead. A role holding only
--    academics.manage_years — exactly the case 0010 exists to support —
--    would see the Academic Years page (the client checks the right
--    permission) and then get "not permitted" from every action on it.
--    This redefines all four with the permission 0010 actually introduced.
--
-- 2. Missing operations. AcademicYearsPage has always supported editing an
--    existing year's name/dates, and creating/editing/deleting individual
--    terms one at a time — none of which 0025 or 0026 gave a named
--    operation to. update_academic_year, delete_academic_year, save_term
--    and delete_term fill that in, with the same in-use guards the client
--    already checks re-verified server-side rather than trusted from the
--    client alone.
-- ===========================================================================

create or replace function public.set_active_year(p_year_id text)
returns void language plpgsql security definer as $$
declare sid text;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select school_id into sid from public.academic_years where id = p_year_id;
  if sid is null then raise exception 'unknown academic year %', p_year_id; end if;

  update public.academic_years set is_active = false where school_id = sid and is_active;
  update public.academic_years set is_active = true, status = 'open' where id = p_year_id;

  perform public.log_action('year.activate', p_year_id, 'Active academic year switched');
end $$;
grant execute on function public.set_active_year(text) to authenticated;

create or replace function public.close_year(p_year_id text)
returns void language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if (select is_active from public.academic_years where id = p_year_id) then
    raise exception 'cannot close the active year — activate the next year first';
  end if;
  update public.academic_years set status = 'closed' where id = p_year_id;
  perform public.log_action('year.close', p_year_id, 'Academic year closed to further edits');
end $$;
grant execute on function public.close_year(text) to authenticated;

create or replace function public.rollover_year(
  p_from_year text,
  p_to_year   text,
  p_copy_assignments boolean default true,
  p_copy_timetable   boolean default true,
  p_copy_structures  boolean default true,
  p_copy_fees        boolean default true
)
returns jsonb language plpgsql security definer as $$
declare
  n_assign int := 0; n_time int := 0; n_struct int := 0;
  n_items int := 0; n_bands int := 0; n_fees int := 0;
  term_map jsonb := '{}'::jsonb;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_from_year = p_to_year then raise exception 'source and target year are the same'; end if;
  if not exists (select 1 from public.academic_years where id = p_from_year) then
    raise exception 'unknown source year %', p_from_year; end if;
  if not public.year_is_open(p_to_year) then
    raise exception 'target year % is closed', p_to_year; end if;

  select coalesce(jsonb_object_agg(f.id, t.id), '{}'::jsonb) into term_map
  from public.terms f
  join public.terms t on t.year_id = p_to_year and t.seq = f.seq
  where f.year_id = p_from_year;

  if p_copy_assignments then
    insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
    select p_to_year || '-' || md5(a.class_id || a.section_id || a.subject_id),
           p_to_year, a.class_id, a.section_id, a.subject_id, a.teacher_id
    from public.teacher_assignments a
    where a.year_id = p_from_year
    on conflict (year_id, class_id, section_id, subject_id) do nothing;
    get diagnostics n_assign = row_count;
  end if;

  if p_copy_timetable then
    insert into public.timetable_entries (id, year_id, class_id, section_id, day, period, subject_id, room)
    select p_to_year || '-tt-' || md5(t.class_id || t.section_id || t.day || t.period),
           p_to_year, t.class_id, t.section_id, t.day, t.period, t.subject_id, t.room
    from public.timetable_entries t
    where t.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_time = row_count;
  end if;

  insert into public.grade_bands (id, school_id, year_id, min_pct, max_pct, grade, remark, sort)
  select p_to_year || '-gb-' || g.sort, g.school_id, p_to_year,
         g.min_pct, g.max_pct, g.grade, g.remark, g.sort
  from public.grade_bands g
  where g.year_id = p_from_year
  on conflict do nothing;
  get diagnostics n_bands = row_count;

  if p_copy_structures then
    insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id)
    select p_to_year || '-as-' || md5(s.class_id || s.subject_id || coalesce(s.term_id,'')),
           p_to_year, s.class_id, s.subject_id, (term_map->>s.term_id)
    from public.assessment_structures s
    where s.year_id = p_from_year
      and (s.term_id is null or term_map ? s.term_id)
    on conflict (year_id, class_id, subject_id, term_id) do nothing;
    get diagnostics n_struct = row_count;

    insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort)
    select md5(ns.id || i.name || i.sort), ns.id, i.name, i.max_mark, i.weight, i.sort
    from public.assessment_structures os
    join public.assessment_items i on i.structure_id = os.id
    join public.assessment_structures ns
      on ns.year_id = p_to_year and ns.class_id = os.class_id
     and ns.subject_id = os.subject_id
     and ns.term_id is not distinct from (term_map->>os.term_id)
    where os.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_items = row_count;
  end if;

  if p_copy_fees then
    insert into public.fee_templates (id, year_id, class_id, term_id, label, amount, due_date)
    select p_to_year || '-ft-' || md5(coalesce(f.class_id,'*') || f.label),
           p_to_year, f.class_id, (term_map->>f.term_id), f.label, f.amount, null
    from public.fee_templates f
    where f.year_id = p_from_year
    on conflict (year_id, class_id, term_id, label) do nothing;
    get diagnostics n_fees = row_count;
  end if;

  perform public.log_action('year.rollover', p_to_year, format('Structure copied from %s', p_from_year));

  return jsonb_build_object(
    'fromYear', p_from_year, 'toYear', p_to_year,
    'assignments', n_assign, 'timetable', n_time, 'gradeBands', n_bands,
    'structures', n_struct, 'assessmentItems', n_items, 'feeTemplates', n_fees);
end $$;
grant execute on function public.rollover_year(text,text,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.create_academic_year(
  p_id text, p_name text, p_start date, p_end date, p_terms text[] default '{}')
returns jsonb language plpgsql security definer as $$
declare sid text; i int;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select id into sid from public.schools order by id limit 1;

  insert into public.academic_years (id, school_id, name, start_date, end_date, is_active, status)
  values (p_id, sid, p_name, p_start, p_end, false, 'planned')
  on conflict (id) do nothing;

  for i in 1 .. coalesce(array_length(p_terms, 1), 0) loop
    insert into public.terms (id, year_id, name, seq)
    values (p_id || '-t' || i, p_id, p_terms[i], i)
    on conflict (year_id, name) do nothing;
  end loop;

  perform public.log_action('year.create', p_id, p_name);
  return jsonb_build_object('yearId', p_id, 'terms', coalesce(array_length(p_terms, 1), 0));
end $$;
grant execute on function public.create_academic_year(text,text,date,date,text[]) to authenticated;

-- Editing an EXISTING year's name/dates never had an operation — only
-- creating one did. Deliberately does not touch is_active or status;
-- set_active_year() and close_year() own those.
create or replace function public.update_academic_year(p_year_id text, p_name text, p_start date, p_end date)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years where id = p_year_id) then
    raise exception 'unknown academic year %', p_year_id;
  end if;
  if p_end <= p_start then raise exception 'end date must be after the start date'; end if;

  update public.academic_years set name = p_name, start_date = p_start, end_date = p_end where id = p_year_id;
  perform public.log_action('year.update', p_year_id, p_name);
  return jsonb_build_object('yearId', p_year_id);
end $$;
grant execute on function public.update_academic_year(text,text,date,date) to authenticated;

create or replace function public.delete_academic_year(p_year_id text)
returns jsonb language plpgsql security definer as $$
declare y public.academic_years;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into y from public.academic_years where id = p_year_id;
  if y.id is null then return jsonb_build_object('deleted', 0); end if;
  if y.is_active then raise exception 'set a different year as active before deleting this one'; end if;
  if exists (select 1 from public.enrollments where year_id = p_year_id)
    or exists (select 1 from public.assessment_structures where year_id = p_year_id)
    or exists (select 1 from public.homework where year_id = p_year_id) then
    raise exception 'this year has enrollment, assessment structures or homework tied to it — remove those first';
  end if;

  delete from public.academic_years where id = p_year_id; -- terms cascade
  perform public.log_action('year.delete', p_year_id, y.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_academic_year(text) to authenticated;

create or replace function public.save_term(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare tid text := p_payload->>'id'; yid text := p_payload->>'year_id';
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a term name is required'; end if;
  if exists (
    select 1 from public.terms
    where year_id = yid and lower(btrim(name)) = lower(btrim(p_payload->>'name')) and id <> coalesce(tid, '')
  ) then
    raise exception 'this year already has a term with that name';
  end if;

  if tid is null or btrim(tid) = '' then
    tid := yid || '-t-' || replace(gen_random_uuid()::text, '-', '');
  end if;

  insert into public.terms (id, year_id, name, seq)
  values (tid, yid, btrim(p_payload->>'name'), coalesce((p_payload->>'seq')::integer, 1))
  on conflict (id) do update set name = excluded.name, seq = excluded.seq;

  perform public.log_action('term.save', tid, p_payload->>'name');
  return jsonb_build_object('termId', tid);
end $$;
grant execute on function public.save_term(jsonb) to authenticated;

create or replace function public.delete_term(p_term_id text)
returns jsonb language plpgsql security definer as $$
declare t public.terms;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into t from public.terms where id = p_term_id;
  if t.id is null then return jsonb_build_object('deleted', 0); end if;
  if exists (
    select 1 from public.assessment_structures
    where year_id = t.year_id and term_id = t.id
  ) then
    raise exception 'this term has assessment structures using it — remove those first';
  end if;

  delete from public.terms where id = t.id;
  perform public.log_action('term.delete', p_term_id, t.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_term(text) to authenticated;


-- =================== 0032_reconcile_student_documents.sql ===================
-- ===========================================================================
-- 0032_reconcile_student_documents.sql
--
-- THE SPLIT (flagged, not fixed, in the previous round)
-- Uploads have always gone through register_file()/unregister_file()
-- (0026), which write to \`file_objects\` — the newer, R2-backed storage
-- table. But the read path (hydrateCoreViaBootstrap / hydrateCoreViaTables
-- in src/lib/backend.ts) has always read a student's documents from the
-- older \`student_documents\` table. A document a registrar just uploaded
-- would sit in file_objects, invisible, until someone thought to look in
-- two different tables for "a student's documents."
--
-- THE FIX, AND WHY THIS SHAPE
-- Two ways to close this: change the read path to query file_objects
-- instead, or make the write path keep both tables in sync. The read path
-- was left alone on purpose — get_app_bootstrap()/get_app_snapshot() are
-- the two most security-sensitive functions in the schema (they decide
-- what an entire login sees), and reshaping either of them blind, without
-- a live database to verify the RLS-scoping still behaves correctly for
-- every role, is a worse risk than it's worth. Instead, register_file()
-- and unregister_file() now mirror student_document rows into
-- student_documents using the *same id* as the file_objects row, so the
-- existing, already-correct read path sees them immediately. photo and
-- fee-receipt uploads are untouched — student_documents was never meant to
-- hold those, so mirroring is scoped to owner_type = 'student_document'.
--
-- This is the pragmatic fix under a deadline, not the final architecture.
-- The honest next step, once there's a live database to test the change
-- against, is to migrate the read path onto file_objects as the single
-- source of truth and retire student_documents outright.
-- ===========================================================================

create or replace function public.register_file(
  p_owner_type text, p_owner_id text, p_storage_key text,
  p_original_name text default null, p_mime_type text default null,
  p_size_bytes bigint default null, p_kind text default null)
returns jsonb language plpgsql security definer as $$
declare new_id uuid;
begin
  if p_owner_type not in ('student_photo','student_document','fee_receipt') then
    raise exception 'unsupported owner type %', p_owner_type;
  end if;

  if not public.can_view_student(p_owner_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_owner_type = 'student_photo' and not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  insert into public.file_objects (
    owner_type, owner_id, storage_key, original_name, mime_type, size_bytes, kind, uploaded_by)
  values (p_owner_type, p_owner_id, p_storage_key, p_original_name, p_mime_type,
          p_size_bytes, p_kind, auth.uid())
  on conflict (storage_key) do update set
    original_name = excluded.original_name,
    mime_type     = excluded.mime_type,
    size_bytes    = excluded.size_bytes,
    kind          = excluded.kind
  returning id into new_id;

  if p_owner_type = 'student_document' then
    insert into public.student_documents (id, student_id, name, kind, size, doc_date, storage_path)
    values (new_id::text, p_owner_id, coalesce(p_original_name, p_storage_key), p_kind,
            p_size_bytes::text, current_date, p_storage_key)
    on conflict (id) do update set
      name = excluded.name, kind = excluded.kind, size = excluded.size, storage_path = excluded.storage_path;
  end if;

  perform public.log_action('file.upload', p_storage_key, coalesce(p_original_name, p_owner_type));
  return jsonb_build_object('fileId', new_id, 'key', p_storage_key);
end $$;
grant execute on function public.register_file(text,text,text,text,text,bigint,text) to authenticated;

create or replace function public.unregister_file(p_storage_key text)
returns jsonb language plpgsql security definer as $$
declare f public.file_objects;
begin
  select * into f from public.file_objects where storage_key = p_storage_key;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;

  if not public.can_view_student(f.owner_id) or not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  delete from public.file_objects where id = f.id;
  delete from public.student_documents where id = f.id::text;
  perform public.log_action('file.delete', p_storage_key, f.original_name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.unregister_file(text) to authenticated;

-- Back-fill: any student_document already sitting in file_objects from
-- before this migration (i.e. uploaded, then never visible) becomes
-- visible the moment this migration runs, without needing a re-upload.
insert into public.student_documents (id, student_id, name, kind, size, doc_date, storage_path)
select f.id::text, f.owner_id, coalesce(f.original_name, f.storage_key), f.kind,
       f.size_bytes::text, f.created_at::date, f.storage_key
from public.file_objects f
where f.owner_type = 'student_document'
on conflict (id) do nothing;


-- make the API see the new functions
notify pgrst, 'reload schema';
`,ve=Object.assign({"../../supabase/migrations/0001_schema.sql":A,"../../supabase/migrations/0002_rls_functions.sql":R,"../../supabase/migrations/0003_seed_core.sql":E,"../../supabase/migrations/0004_seed_academics.sql":L,"../../supabase/migrations/0005_repair_auth_seed.sql":M,"../../supabase/migrations/0006_fee_payments.sql":N,"../../supabase/migrations/0007_fix_create_user_email.sql":z,"../../supabase/migrations/0008_fix_auth_token_columns.sql":F,"../../supabase/migrations/0009_lowercase_usernames.sql":P,"../../supabase/migrations/0010_academic_years_permission.sql":C,"../../supabase/migrations/0011_conversation_participants_policy.sql":O,"../../supabase/migrations/0012_fast_bootstrap.sql":B,"../../supabase/migrations/0012_student_visible_published_submissions.sql":D,"../../supabase/migrations/0013_enable_realtime_messaging.sql":Y,"../../supabase/migrations/0014_file_storage.sql":H,"../../supabase/migrations/0015_fee_payment_requests.sql":G,"../../supabase/migrations/0016_delete_user_account.sql":U,"../../supabase/migrations/0017_families_view_permission.sql":V,"../../supabase/migrations/0018_fix_account_login_email_mismatch.sql":W,"../../supabase/migrations/0019_guardian_fees_permission.sql":K,"../../supabase/migrations/0020_fix_bootstrap_bank_accounts.sql":J,"../../supabase/migrations/0021_year_scope.sql":Q,"../../supabase/migrations/0022_performance.sql":X,"../../supabase/migrations/0023_scoped_bootstrap.sql":Z,"../../supabase/migrations/0024_paged_queries.sql":ee,"../../supabase/migrations/0025_year_lifecycle.sql":ne,"../../supabase/migrations/0026_write_api.sql":te,"../../supabase/migrations/0027_fee_payment_detail.sql":se,"../../supabase/migrations/0028_fee_item_crud.sql":ae,"../../supabase/migrations/0029_save_student_stable_id.sql":ie,"../../supabase/migrations/0030_write_api_structure.sql":oe,"../../supabase/migrations/0031_year_lifecycle_fixes.sql":re,"../../supabase/migrations/0032_reconcile_student_documents.sql":ce,"../../supabase/migrations/0033_delete_announcement.sql":de,"../../supabase/migrations/0034_fix_start_conversation_type_column.sql":le,"../../supabase/migrations/0035_year_scope_legacy_reads.sql":ue,"../../supabase/migrations/0036_year_switcher_params.sql":_e,"../../supabase/migrations/0037_fee_payment_requests_in_snapshot.sql":pe,"../../supabase/migrations/0038_my_permissions_role_status.sql":me,"../../supabase/migrations/0039_configurable_working_days.sql":be,"../../supabase/migrations/0040_message_report_rpcs.sql":fe,"../../supabase/migrations/0041_submit_fee_payment_request.sql":he,"../../supabase/migrations/0042_configurable_periods.sql":ge,"../../supabase/migrations/0043_scope_profiles_bootstrap.sql":ye,"../../supabase/migrations/0044_server_side_notifications.sql":xe,"../../supabase/migrations/0045_role_aware_notifications.sql":we,"../../supabase/migrations/apply_0026_to_0032.sql":je}),g="",ke={"0001_schema.sql":"Relational schema — 30 tables, FKs, indexes","0002_rls_functions.sql":"RLS policies, authz functions, workflow triggers","0003_seed_core.sql":"School structure, people, roles + demo logins","0004_seed_academics.sql":"Assessments, marks, attendance, communication","0005_repair_auth_seed.sql":"Auth repair — fixes GoTrue schema error on login","0006_fee_payments.sql":"Fee payments — per-transaction method & reference history","0007_fix_create_user_email.sql":"Fix: blank email broke login for newly created accounts","0008_fix_auth_token_columns.sql":"Fix: 500 on login for accounts created after registration (auth token columns)","0009_lowercase_usernames.sql":"Fix: login failed for usernames typed with any capital letters","0010_academic_years_permission.sql":"Adds a dedicated academic-years/terms management permission","0011_conversation_participants_policy.sql":"Fix: starting a new direct conversation always failed","0012_fast_bootstrap.sql":"Fast bootstrap — one request for initial shell, one for full snapshot","0012_student_visible_published_submissions.sql":"Fix: students/guardians saw no grades even once published","0013_enable_realtime_messaging.sql":"Realtime — conversations update live instead of on next page load","0014_file_storage.sql":"Generic file registry + authorization functions for Cloudflare R2 storage","0015_fee_payment_requests.sql":"Guardian bank-transfer fee payments, pending admin review","0016_delete_user_account.sql":'Fix: "Delete" on a user did nothing server-side — adds a real delete RPC',"0017_families_view_permission.sql":'Adds a dedicated "View families" permission for the Families page',"0018_fix_account_login_email_mismatch.sql":"Fix: new accounts with a real contact email could never log in","0019_guardian_fees_permission.sql":`Adds "View children's fees" permission — powers the guardian sidebar Fees page`,"0020_fix_bootstrap_bank_accounts.sql":"Fix: bank accounts never appeared in the Pay modal (missing from the bootstrap RPC)","0021_year_scope.sql":"Every record (timetable, attendance, fees, events, announcements, conversations) tied to an academic year","0022_performance.sql":"Indexes for the tables that grow — attendance, marks, fee items","0023_scoped_bootstrap.sql":"Each role's login only loads its own year-scoped data instead of the whole school (not yet wired into the frontend — see 0035)","0024_paged_queries.sql":"Server-side filtering, sorting, searching and paging for large tables (not yet wired into the frontend — see 0035)","0025_year_lifecycle.sql":"Starting a new academic year — rollover, promotion, fee templates","0026_write_api.sql":"Real write RPCs for students, marks, attendance, fees, roles, messages, accounts","0027_fee_payment_detail.sql":"Fix: fee payments recorded the new total but dropped the transaction detail","0028_fee_item_crud.sql":"Real write RPCs for adding/removing a one-off fee item","0029_save_student_stable_id.sql":"Fix: creating a student could get a different id server-side than the client already used","0030_write_api_structure.sql":"Real write RPCs for classes, subjects, teachers, homework, timetable, announcements, events, conversations","0031_year_lifecycle_fixes.sql":"Fix: academic-year permission and rollover-copy bugs from 0025","0032_reconcile_student_documents.sql":"Fix: uploaded student documents were invisible until reload (read/write table split)","0033_delete_announcement.sql":"Fix: deleting an announcement didn't persist — adds a real delete RPC","0034_fix_start_conversation_type_column.sql":"Fix: starting a conversation always failed (referenced a column that doesn't exist)","0035_year_scope_legacy_reads.sql":"Fix: login and every feature's first load downloaded the entire school's data, for every year, every time","0036_year_switcher_params.sql":"Fix: the Academic year dropdown stopped working once 0035 scoped reads to a single year — restores it with a real year parameter","0037_fee_payment_requests_in_snapshot.sql":"Fix: guardian bank-transfer fee payment requests were never included in the snapshot read at all — always came back empty","0038_my_permissions_role_status.sql":"Fix: my_permissions() ignored a disabled role — powers the new live permission sync (see store.tsx)","0039_configurable_working_days.sql":"Timetable working days are now configurable per school instead of fixed to Mon-Fri","0040_message_report_rpcs.sql":"Fix: filing or reviewing a reported message has always failed outright — adds the missing RPCs","0041_submit_fee_payment_request.sql":"Fix: a guardian's bank-transfer payment submission never actually reached the server — adds the missing RPC","0042_configurable_periods.sql":"Timetable periods (count and start times) are now configurable per school, no longer fixed to 6 or capped at 12","0043_scope_profiles_bootstrap.sql":"Performance: profiles (every account in the school) was the one table with no row-level scoping at all — every login downloaded every account regardless of role"};function $e(n){const s=n.replace(/^\d+_/,"").replace(/\.sql$/,"").replace(/_/g," ");return s.charAt(0).toUpperCase()+s.slice(1)}const o=Object.entries(ve).map(([n,s])=>({file:n.split("/").pop(),sql:s})).filter(({file:n})=>/^\d{4}_/.test(n)).map(({file:n,sql:s})=>({file:n,title:ke[n]??$e(n),sql:s})).sort((n,s)=>n.file.localeCompare(s.file)),qe=o.map(n=>`-- ============================================================
-- ${n.file} — ${n.title}
-- ============================================================
begin;

${n.sql.trim()}

commit;
`).join(`

`),Te=`https://supabase.com/dashboard/project/${g}/sql/new`;function Ee({onConnected:n}){const{reconnect:s,toast:y}=k(),[x,w]=a.useState(!0),[c,_]=a.useState(!1),[d,l]=a.useState(null),[i,p]=a.useState(null),[m,j]=a.useState(!1),v=async()=>{_(!0);const t=await s();_(!1),t==="live"?(y("Connected to Supabase — live mode.","ok"),n()):l(t==="error"?{tone:"warn",text:"Couldn't reach the project just now (network hiccup?). Wait a moment and re-check."}:{tone:"warn",text:"Schema still not detected. If you just applied the migrations, wait a moment and re-check."})},b=async(t,u)=>{try{await navigator.clipboard.writeText(u),p(t),setTimeout(()=>p(null),1600)}catch{l({tone:"warn",text:"Clipboard blocked — select the file in supabase/migrations and copy manually."})}};return e.jsxs("div",{className:"anim-rise mb-6 overflow-hidden rounded-xl border border-pine-800 bg-pine-950 text-pine-100 shadow-lg",children:[e.jsxs("button",{onClick:()=>w(t=>!t),className:"flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-pine-900/60",children:[e.jsx("span",{className:"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-400/15 text-gold-400",children:e.jsx(T,{className:"h-4.5 w-4.5"})}),e.jsxs("span",{className:"flex-1",children:[e.jsx("span",{className:"flex items-center gap-2 font-display text-[15px] font-extrabold tracking-tight text-white",children:"Connect the live database"}),e.jsxs("span",{className:"mt-0.5 block text-[11.5px] text-pine-300",children:["Project ",e.jsx("span",{className:"font-mono text-gold-300",children:g})," is reachable — apply the schema (once, from the Supabase dashboard) to enable real sign-in and persistence."]})]}),e.jsx("span",{className:"live-dot h-2.5 w-2.5 shrink-0 rounded-full bg-gold-400"})]}),x&&e.jsxs("div",{className:"border-t border-pine-800/70 px-5 py-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsxs("p",{className:"text-[11.5px] leading-relaxed text-pine-300",children:["Open the ",e.jsxs("a",{href:Te,target:"_blank",rel:"noreferrer",className:"inline-flex items-center gap-1 font-bold text-gold-300 underline-offset-2 hover:underline",children:["SQL Editor ",e.jsx(S,{className:"h-3 w-3"})]})," (Supabase dashboard, not this app), paste, and click Run — once:"]}),e.jsxs("button",{onClick:()=>b("__combined__",qe),className:"flex w-full cursor-pointer items-center gap-3 rounded-lg border border-gold-400/40 bg-gold-400/10 px-3.5 py-3 text-left transition-colors hover:bg-gold-400/15",children:[e.jsx("span",{className:"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-400 text-pine-950",children:i==="__combined__"?e.jsx(f,{className:"h-4 w-4"}):e.jsx(h,{className:"h-4 w-4"})}),e.jsxs("span",{className:"min-w-0 flex-1",children:[e.jsx("span",{className:"block font-mono text-[12px] font-bold text-white",children:i==="__combined__"?"Copied — paste it into the SQL Editor":`Copy all ${o.length} migrations as one script`}),e.jsxs("span",{className:"block text-[10.5px] text-pine-400",children:["One paste, one Run — instead of ",o.length," separate copy/paste/run cycles."]})]})]}),e.jsx("button",{onClick:()=>j(t=>!t),className:"cursor-pointer text-[11px] font-semibold text-pine-400 underline-offset-2 hover:text-pine-200 hover:underline",children:m?"Hide individual files":"Prefer to run them one at a time instead? (for troubleshooting)"}),m&&o.map((t,u)=>e.jsxs("div",{className:"flex items-center gap-2.5 rounded-lg border border-pine-800 bg-pine-900/50 px-3 py-2",children:[e.jsx("span",{className:"flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pine-800 font-mono text-[10px] font-bold text-gold-300",children:u+1}),e.jsxs("span",{className:"min-w-0 flex-1",children:[e.jsx("span",{className:"block truncate font-mono text-[11.5px] font-semibold text-white",children:t.file}),e.jsx("span",{className:"block truncate text-[10px] text-pine-400",children:t.title})]}),e.jsxs("button",{onClick:()=>b(t.file,t.sql),className:"flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-pine-800 px-2 py-1.5 text-[11px] font-bold text-pine-100 transition-colors hover:bg-pine-700",children:[i===t.file?e.jsx(f,{className:"h-3.5 w-3.5 text-gold-400"}):e.jsx(h,{className:"h-3.5 w-3.5"}),i===t.file?"Copied":"Copy"]})]},t.file))]}),d&&e.jsx("div",{className:`mt-3 rounded-lg px-3.5 py-2.5 text-[12px] font-semibold ${d.tone==="ok"?"bg-pine-800/70 text-pine-100":"bg-gold-400/10 text-gold-300"}`,children:d.text}),e.jsxs("div",{className:"mt-4 flex items-center gap-2 border-t border-pine-800/70 pt-3.5",children:[e.jsxs($,{variant:"outline",onClick:v,disabled:c,className:"!border-pine-700 !bg-transparent !text-pine-200 hover:!bg-pine-900",children:[c?e.jsx(q,{className:"h-4 w-4 animate-spin"}):e.jsx(I,{className:"h-4 w-4"}),c?"Checking…":"Re-check & connect"]}),e.jsx("span",{className:"text-[10.5px] text-pine-400",children:"Sign-in is disabled until the schema is applied and this reconnects."})]})]})]})}export{Ee as default};
