import m1 from "../../supabase/migrations/0001_schema.sql?raw";
import m2 from "../../supabase/migrations/0002_rls_functions.sql?raw";
import m3 from "../../supabase/migrations/0003_seed_core.sql?raw";
import m4 from "../../supabase/migrations/0004_seed_academics.sql?raw";
import m5 from "../../supabase/migrations/0005_repair_auth_seed.sql?raw";
import m6 from "../../supabase/migrations/0006_fee_payments.sql?raw";
import m7 from "../../supabase/migrations/0007_fix_create_user_email.sql?raw";
import m8 from "../../supabase/migrations/0008_fix_auth_token_columns.sql?raw";
import m9 from "../../supabase/migrations/0009_lowercase_usernames.sql?raw";
import m10 from "../../supabase/migrations/0010_academic_years_permission.sql?raw";
import m11 from "../../supabase/migrations/0011_conversation_participants_policy.sql?raw";
import m12a from "../../supabase/migrations/0012_fast_bootstrap.sql?raw";
import m12b from "../../supabase/migrations/0012_student_visible_published_submissions.sql?raw";
import m13 from "../../supabase/migrations/0013_enable_realtime_messaging.sql?raw";
import m14 from "../../supabase/migrations/0014_file_storage.sql?raw";
import m15 from "../../supabase/migrations/0015_fee_payment_requests.sql?raw";
import m16 from "../../supabase/migrations/0016_delete_user_account.sql?raw";
import m17 from "../../supabase/migrations/0017_families_view_permission.sql?raw";
import m18 from "../../supabase/migrations/0018_fix_account_login_email_mismatch.sql?raw";
import m19 from "../../supabase/migrations/0019_guardian_fees_permission.sql?raw";
import m20 from "../../supabase/migrations/0020_fix_bootstrap_bank_accounts.sql?raw";
import m21 from "../../supabase/migrations/0021_year_scope.sql?raw";
import m22 from "../../supabase/migrations/0022_performance.sql?raw";
import m23 from "../../supabase/migrations/0023_scoped_bootstrap.sql?raw";
import m24 from "../../supabase/migrations/0024_paged_queries.sql?raw";
import m25 from "../../supabase/migrations/0025_year_lifecycle.sql?raw";
import m26 from "../../supabase/migrations/0026_write_api.sql?raw";
import m27 from "../../supabase/migrations/0027_fee_payment_detail.sql?raw";
import m28 from "../../supabase/migrations/0028_fee_item_crud.sql?raw";
import m29 from "../../supabase/migrations/0029_save_student_stable_id.sql?raw";
import m30 from "../../supabase/migrations/0030_write_api_structure.sql?raw";
import m31 from "../../supabase/migrations/0031_year_lifecycle_fixes.sql?raw";
import m32 from "../../supabase/migrations/0032_reconcile_student_documents.sql?raw";
import m33 from "../../supabase/migrations/0033_delete_announcement.sql?raw";
import m34 from "../../supabase/migrations/0034_fix_start_conversation_type_column.sql?raw";

/**
 * The migration bundle ships inside the app as plain text. SQL DDL is not a
 * secret — authorization lives in the RLS policies it creates. Privileged
 * keys are NEVER part of this bundle; they are typed into the setup console
 * at runtime and held in memory only.
 */
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

export const MIGRATIONS: MigrationFile[] = [
  { file: "0001_schema.sql", title: "Relational schema — 30 tables, FKs, indexes", sql: m1 },
  { file: "0002_rls_functions.sql", title: "RLS policies, authz functions, workflow triggers", sql: m2 },
  { file: "0003_seed_core.sql", title: "School structure, people, roles + demo logins", sql: m3 },
  { file: "0004_seed_academics.sql", title: "Assessments, marks, attendance, communication", sql: m4 },
  { file: "0005_repair_auth_seed.sql", title: "Auth repair — fixes GoTrue schema error on login", sql: m5 },
  { file: "0006_fee_payments.sql", title: "Fee payments — per-transaction method & reference history", sql: m6 },
  { file: "0007_fix_create_user_email.sql", title: "Fix: blank email broke login for newly created accounts", sql: m7 },
  { file: "0008_fix_auth_token_columns.sql", title: "Fix: 500 on login for accounts created after registration (auth token columns)", sql: m8 },
  { file: "0009_lowercase_usernames.sql", title: "Fix: login failed for usernames typed with any capital letters", sql: m9 },
  { file: "0010_academic_years_permission.sql", title: "Adds a dedicated academic-years/terms management permission", sql: m10 },
  { file: "0011_conversation_participants_policy.sql", title: "Fix: starting a new direct conversation always failed", sql: m11 },
  { file: "0012_fast_bootstrap.sql", title: "Fast bootstrap — one request for initial shell, one for full snapshot", sql: m12a },
  { file: "0012_student_visible_published_submissions.sql", title: "Fix: students/guardians saw no grades even once published", sql: m12b },
  { file: "0013_enable_realtime_messaging.sql", title: "Realtime — conversations update live instead of on next page load", sql: m13 },
  { file: "0014_file_storage.sql", title: "Generic file registry + authorization functions for Cloudflare R2 storage", sql: m14 },
  { file: "0015_fee_payment_requests.sql", title: "Guardian bank-transfer fee payments, pending admin review", sql: m15 },
  { file: "0016_delete_user_account.sql", title: "Fix: \"Delete\" on a user did nothing server-side — adds a real delete RPC", sql: m16 },
  { file: "0017_families_view_permission.sql", title: "Adds a dedicated \"View families\" permission for the Families page", sql: m17 },
  { file: "0018_fix_account_login_email_mismatch.sql", title: "Fix: new accounts with a real contact email could never log in", sql: m18 },
  { file: "0019_guardian_fees_permission.sql", title: "Adds \"View children's fees\" permission — powers the guardian sidebar Fees page", sql: m19 },
  { file: "0020_fix_bootstrap_bank_accounts.sql", title: "Fix: bank accounts never appeared in the Pay modal (missing from the bootstrap RPC)", sql: m20 },
  { file: "0021_year_scope.sql", title: "Every record (timetable, attendance, fees, events, announcements, conversations) tied to an academic year", sql: m21 },
  { file: "0022_performance.sql", title: "Indexes for the tables that grow — attendance, marks, fee items", sql: m22 },
  { file: "0023_scoped_bootstrap.sql", title: "Each role's login only loads its own year-scoped data instead of the whole school", sql: m23 },
  { file: "0024_paged_queries.sql", title: "Server-side filtering, sorting, searching and paging for large tables", sql: m24 },
  { file: "0025_year_lifecycle.sql", title: "Starting a new academic year — rollover, promotion, fee templates", sql: m25 },
  { file: "0026_write_api.sql", title: "Real write RPCs for students, marks, attendance, fees, roles, messages, accounts", sql: m26 },
  { file: "0027_fee_payment_detail.sql", title: "Fix: fee payments recorded the new total but dropped the transaction detail", sql: m27 },
  { file: "0028_fee_item_crud.sql", title: "Real write RPCs for adding/removing a one-off fee item", sql: m28 },
  { file: "0029_save_student_stable_id.sql", title: "Fix: creating a student could get a different id server-side than the client already used", sql: m29 },
  { file: "0030_write_api_structure.sql", title: "Real write RPCs for classes, subjects, teachers, homework, timetable, announcements, events, conversations", sql: m30 },
  { file: "0031_year_lifecycle_fixes.sql", title: "Fix: academic-year permission and rollover-copy bugs from 0025", sql: m31 },
  { file: "0032_reconcile_student_documents.sql", title: "Fix: uploaded student documents were invisible until reload (read/write table split)", sql: m32 },
  { file: "0033_delete_announcement.sql", title: "Fix: deleting an announcement didn't persist — adds a real delete RPC", sql: m33 },
  { file: "0034_fix_start_conversation_type_column.sql", title: "Fix: starting a conversation always failed (referenced a column that doesn't exist)", sql: m34 },
];

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
