/**
 * The migration bundle ships inside the app as plain text. SQL DDL is not a
 * secret — authorization lives in the RLS policies it creates. Privileged
 * keys are NEVER part of this bundle; they are typed into the setup console
 * at runtime and held in memory only.
 *
 * Every *.sql file under supabase/migrations/ is picked up automatically
 * (Vite resolves this glob at build time) — there is no per-file import to
 * remember to add. Previously this list was maintained by hand and silently
 * fell 14 migrations behind (stuck at 0020 while 0021–0034 shipped), so
 * anyone who set up a project through this console got an incomplete
 * schema with no indication anything was missing. A file that exists on
 * disk now always ends up in COMBINED_SQL — the one thing that can no
 * longer drift is *completeness*. Only the human-friendly `title` below is
 * still hand-maintained, and it degrades gracefully (falls back to the
 * filename) rather than blocking anything if a new one isn't added yet.
 */
const files = import.meta.glob<string>("../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

import { supabaseProjectUrl } from "./supabase";

/**
 * The project ref is parsed from whatever Supabase URL is actually
 * configured (VITE_SUPABASE_URL) — never hardcoded. Getting this wrong meant
 * "Apply migrations" and the SQL Editor link silently pointed at the wrong
 * project whenever someone connected their own Supabase project instead of
 * the shared demo one, making the in-app setup console a dead end for them.
 */
export const PROJECT_REF = (() => {
  const m = supabaseProjectUrl?.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m?.[1] ?? "";
})();

export interface MigrationFile {
  file: string;
  title: string;
  sql: string;
}

/** Hand-written descriptions, purely cosmetic — keyed by filename. A file
 *  with no entry here still ships (see the glob comment above); it just
 *  falls back to a title generated from its own name instead of failing
 *  to appear at all. */
const TITLES: Record<string, string> = {
  "0001_schema.sql": "Relational schema — 30 tables, FKs, indexes",
  "0002_rls_functions.sql": "RLS policies, authz functions, workflow triggers",
  "0003_seed_core.sql": "School structure, people, roles + demo logins",
  "0004_seed_academics.sql": "Assessments, marks, attendance, communication",
  "0005_repair_auth_seed.sql": "Auth repair — fixes GoTrue schema error on login",
  "0006_fee_payments.sql": "Fee payments — per-transaction method & reference history",
  "0007_fix_create_user_email.sql": "Fix: blank email broke login for newly created accounts",
  "0008_fix_auth_token_columns.sql": "Fix: 500 on login for accounts created after registration (auth token columns)",
  "0009_lowercase_usernames.sql": "Fix: login failed for usernames typed with any capital letters",
  "0010_academic_years_permission.sql": "Adds a dedicated academic-years/terms management permission",
  "0011_conversation_participants_policy.sql": "Fix: starting a new direct conversation always failed",
  "0012_fast_bootstrap.sql": "Fast bootstrap — one request for initial shell, one for full snapshot",
  "0012_student_visible_published_submissions.sql": "Fix: students/guardians saw no grades even once published",
  "0013_enable_realtime_messaging.sql": "Realtime — conversations update live instead of on next page load",
  "0014_file_storage.sql": "Generic file registry + authorization functions for Cloudflare R2 storage",
  "0015_fee_payment_requests.sql": "Guardian bank-transfer fee payments, pending admin review",
  "0016_delete_user_account.sql": "Fix: \"Delete\" on a user did nothing server-side — adds a real delete RPC",
  "0017_families_view_permission.sql": "Adds a dedicated \"View families\" permission for the Families page",
  "0018_fix_account_login_email_mismatch.sql": "Fix: new accounts with a real contact email could never log in",
  "0019_guardian_fees_permission.sql": "Adds \"View children's fees\" permission — powers the guardian sidebar Fees page",
  "0020_fix_bootstrap_bank_accounts.sql": "Fix: bank accounts never appeared in the Pay modal (missing from the bootstrap RPC)",
  "0021_year_scope.sql": "Every record (timetable, attendance, fees, events, announcements, conversations) tied to an academic year",
  "0022_performance.sql": "Indexes for the tables that grow — attendance, marks, fee items",
  "0023_scoped_bootstrap.sql": "Each role's login only loads its own year-scoped data instead of the whole school (not yet wired into the frontend — see 0035)",
  "0024_paged_queries.sql": "Server-side filtering, sorting, searching and paging for large tables (not yet wired into the frontend — see 0035)",
  "0025_year_lifecycle.sql": "Starting a new academic year — rollover, promotion, fee templates",
  "0026_write_api.sql": "Real write RPCs for students, marks, attendance, fees, roles, messages, accounts",
  "0027_fee_payment_detail.sql": "Fix: fee payments recorded the new total but dropped the transaction detail",
  "0028_fee_item_crud.sql": "Real write RPCs for adding/removing a one-off fee item",
  "0029_save_student_stable_id.sql": "Fix: creating a student could get a different id server-side than the client already used",
  "0030_write_api_structure.sql": "Real write RPCs for classes, subjects, teachers, homework, timetable, announcements, events, conversations",
  "0031_year_lifecycle_fixes.sql": "Fix: academic-year permission and rollover-copy bugs from 0025",
  "0032_reconcile_student_documents.sql": "Fix: uploaded student documents were invisible until reload (read/write table split)",
  "0033_delete_announcement.sql": "Fix: deleting an announcement didn't persist — adds a real delete RPC",
  "0034_fix_start_conversation_type_column.sql": "Fix: starting a conversation always failed (referenced a column that doesn't exist)",
  "0035_year_scope_legacy_reads.sql": "Fix: login and every feature's first load downloaded the entire school's data, for every year, every time",
  "0036_year_switcher_params.sql": "Fix: the Academic year dropdown stopped working once 0035 scoped reads to a single year — restores it with a real year parameter",
  "0037_fee_payment_requests_in_snapshot.sql": "Fix: guardian bank-transfer fee payment requests were never included in the snapshot read at all — always came back empty",
  "0038_my_permissions_role_status.sql": "Fix: my_permissions() ignored a disabled role — powers the new live permission sync (see store.tsx)",
  "0039_configurable_working_days.sql": "Timetable working days are now configurable per school instead of fixed to Mon-Fri",
  "0040_message_report_rpcs.sql": "Fix: filing or reviewing a reported message has always failed outright — adds the missing RPCs",
  "0041_submit_fee_payment_request.sql": "Fix: a guardian's bank-transfer payment submission never actually reached the server — adds the missing RPC",
  "0042_configurable_periods.sql": "Timetable periods (count and start times) are now configurable per school, no longer fixed to 6 or capped at 12",
};

/** Turns "0036_some_new_thing.sql" into "Some new thing" for anything not
 *  yet in TITLES above, so a freshly added migration still shows up with a
 *  readable (if generic) label instead of its raw filename. */
function titleFromFilename(file: string): string {
  const stem = file.replace(/^\d+_/, "").replace(/\.sql$/, "").replace(/_/g, " ");
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export const MIGRATIONS: MigrationFile[] = Object.entries(files)
  .map(([path, sql]) => ({ file: path.split("/").pop()!, sql }))
  // apply_0026_to_0032.sql is a hand-maintained convenience bundle for
  // pasting straight into the SQL Editor (see that file's own header) — its
  // content duplicates the individually-numbered 0026–0032 files below.
  // Including it here would run all of those a second time.
  .filter(({ file }) => /^\d{4}_/.test(file))
  .map(({ file, sql }) => ({ file, title: TITLES[file] ?? titleFromFilename(file), sql }))
  // Filenames sort correctly as plain strings: zero-padded 4-digit
  // prefixes order numerically, and where two files share a prefix
  // (0012_fast_bootstrap / 0012_student_visible_...) alphabetical order
  // happens to match the order they need to run in.
  .sort((a, b) => a.file.localeCompare(b.file));

/**
 * All migrations concatenated in order, each wrapped in its own transaction
 * and separated by a marker comment. One paste, one "Run" click in the SQL
 * Editor instead of copying and running each file individually — the guided
 * path's whole reason for being slow.
 */
export const COMBINED_SQL = MIGRATIONS
  .map((m) => `-- ============================================================\n-- ${m.file} — ${m.title}\n-- ============================================================\nbegin;\n\n${m.sql.trim()}\n\ncommit;\n`)
  .join("\n\n");

export const sqlEditorUrl = `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`;
