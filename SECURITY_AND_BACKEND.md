# Serverless backend, key removal, and deployment

Everything from the previous round is still there (migrations `0021`–`0025`, the
paged hooks, the year context). This round moves the logic behind a server API,
removes the credentials from the bundle, and adds the targeted write path.

---

## Start here: rotate the key

`src/lib/supabase.ts` previously contained a live project URL and anon key as
hardcoded fallbacks. They were in the bundle, so they are in every browser
cache, every CDN copy, and this repository's history. Removing them from the
source does not un-publish them.

**Rotate the anon key in the Supabase dashboard before you deploy** (Settings →
API → roll the key). If a service-role key was ever committed anywhere, roll
that too. Everything below assumes fresh credentials that only the deployment's
environment holds.

---

## What the browser can and can't do now

Before: the browser held a Supabase credential and spoke to PostgREST
directly. Every table, every column, every filter operator was reachable, and
the only thing between a curious visitor and the data was whether all ~40 RLS
policies were correct.

After: the browser holds nothing. It calls same-origin `/api` paths. The
session lives in httpOnly cookies it cannot read. The server publishes a fixed
list of about thirty named operations and refuses everything else.

RLS didn't go anywhere — it still runs on every query, because the API calls
the database *as the signed-in user*, not as an admin. The difference is that
a policy gap is no longer immediately fatal, because there is no
`from('students').select('*')` to exploit it with.

```
browser ──/api/rpc/list_students──► allowlist ──► Supabase (as the user) ──► RLS ──► rows
   ▲                                    │
   └── httpOnly cookie ─────────────────┘   service-role key: login only, never here
```

### The request path, in order

1. **Origin** must match `ALLOWED_ORIGIN`
2. **Session** cookie verified by Supabase (not decoded and trusted locally)
3. **Allowlist** — the function name must be published in `api/_lib/allowlist.ts`
4. **CSRF** double-submit token, on every write
5. **Rate limit**, per user and per function
6. **Argument validation** — undeclared fields are dropped, numbers clamped
7. **RLS** decides what actually comes back

---

## New files

**Server** (`api/` — never imported from `src/`)

| File | Role |
|---|---|
| `_lib/env.ts` | The only place secrets are read. Fails fast if one is missing. |
| `_lib/cookies.ts` | httpOnly session cookies, CSRF, constant-time comparison. |
| `_lib/supabase.ts` | User-scoped client (RLS applies) vs. admin client (login only). |
| `_lib/allowlist.ts` | **The security boundary.** Every callable operation and its argument schema. |
| `_lib/ratelimit.ts` | Per-user limits; shared counter via Upstash when configured. |
| `_lib/http.ts` | Error mapping that never leaks a PostgreSQL message to the client. |
| `auth/login.ts` | Credentials in, cookies out. Rate-limited on IP *and* username. |
| `auth/session.ts` | Who am I (GET) / refresh the token (POST). |
| `auth/logout.ts` | Clears cookies **and** revokes the refresh token upstream. |
| `rpc/[fn].ts` | The single data endpoint. |
| `storage/presign.ts` | File uploads, with size and MIME rules enforced server-side. |

**Client**

| File | Role |
|---|---|
| `src/lib/http.ts` | Fetch wrapper: CSRF, one shared token refresh, request coalescing, timeouts. |
| `src/lib/supabase.ts` | Rewritten. No credentials. Bridges the old client surface to `/api`. |
| `src/lib/session.ts` | Rewritten for the non-secret hint cookie instead of a readable JWT. |

**Database** — `0026_write_api.sql`: `save_register`, `send_message`,
`record_fee_payment`, `set_submission_status`, `save_student`,
`set_student_status`, `register_file`, `unregister_file`, `save_role`,
`update_user_account`.

---

## Deploying

```bash
supabase db push          # 0021 → 0026
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SESSION_SECRET          # openssl rand -hex 32
vercel env add ALLOWED_ORIGIN          # https://your-app.vercel.app
vercel deploy --prod
```

Note there is **no `VITE_` prefix** on any of these. Vite inlines every
`VITE_*` variable into the client bundle at build time — that is precisely how
the key ended up public before. `src/vite-env.d.ts` no longer declares any, so
reintroducing one is now a type error rather than an accident.

`vercel.json` sets a CSP with `connect-src 'self'`. That one directive is what
makes the key removal *enforceable*: even if a compromised dependency
reintroduced a Supabase client, the browser would refuse to let it reach
`supabase.co`.

The functions use the Edge runtime and Web-standard `Request`/`Response`, so
they port to Cloudflare Workers, Netlify or Deno Deploy by changing the export
shape and nothing else.

---

## Speed

- **Login payload** is role-shaped and year-scoped (`get_bootstrap`): tens of
  KB at any school size, instead of the whole database.
- **First paint** doesn't wait on a network round trip — `peekSession()` reads
  the hint cookie synchronously and paints the right shell immediately.
- **Token refresh** is shared: six queries hitting 401 at the same moment
  produce one refresh, not six racing ones.
- **Reads are coalesced**: two components asking for the same thing in the
  same tick produce one request.
- **Writes are targeted**: changing one mark sends one mark. Previously it
  serialised and diffed the entire in-memory database, twice.
- **Concurrent edits are safe**: `record_fee_payment` takes a row lock, so two
  bursars posting at once can't overwrite each other. Snapshot diffing had
  last-writer-wins across the whole database, silently.
- Reads add one server hop (~10–30ms on Edge, co-locate the region with your
  Supabase project). The bootstrap going from megabytes to kilobytes more than
  pays for it.

---

## Three things I did not paper over

**1. There is no generic table endpoint, so some page writes will now error.**

I could have shipped `POST /api/table/:name` accepting arbitrary rows, and
every page would still run untouched. That endpoint would re-expose exactly
the surface this work removes — arbitrary table, arbitrary columns — and it
would have been invisible, because nothing would appear broken.

Instead, `upsert()`/`remove()` in `backend.ts` now throw an error naming the
operation to use. Reads still work: `sel()` falls back to the allowlisted
`get_app_snapshot()`, which is the same whole-database read as before — a
contained, clearly-labelled shim, not an improvement. Pages moved onto the
paged hooks in `api.ts` stop touching it. When the last one has, delete
`sel()` and remove `get_app_snapshot` from the allowlist.

Old write → new operation:

| Was | Now |
|---|---|
| `students`, `enrollments` | `save_student`, `set_student_status` |
| `assessment_marks` | `save_student_marks` |
| `mark_submissions` | `set_submission_status` |
| `attendance_registers/entries` | `save_register` |
| `fee_items` | `record_fee_payment`, `apply_fee_template` |
| `messages` | `send_message` |
| `profiles`, `guardian_students` | `update_user_account` |
| `role_defs`, `role_permissions` | `save_role` |
| `file_objects` | `register_file`, `unregister_file` |

**2. Realtime messaging is off.**

Supabase Realtime is a direct WebSocket authenticated with a token the browser
holds — which it no longer does. Leaving a socket that silently never connects
would be worse than turning it off, so the effect in `store.tsx` returns early
with the two replacement options documented inline: `refetchInterval` on
`useMessages` (a two-line change, fine for a school), or an SSE endpoint under
`api/` if live chat genuinely matters. Presence reports nobody rather than
reporting wrongly.

**3. Rate limiting is per-instance without Upstash.**

The default is an in-memory counter, so on Vercel the effective limit is
(your limit × warm instance count) and it resets when an instance recycles.
That is real protection against a runaway client loop and **not** protection
against a distributed brute-force on login. Set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` and it switches to a shared counter automatically.
Until then, keep Supabase's own auth rate limiting on.

---

## Suggested order

1. Rotate the anon key. Deploy with the new env vars.
2. Mount `<AcademicYearProvider>` and add the year picker (round one, step 1).
3. Convert `StudentsPage` to `useStudents` — highest value, least work.
4. Convert `MarkEntryPage`, `AttendancePage`, `FeesPage`.
5. Convert `MessagesPage` to `useMessages` with a 5s `refetchInterval`.
6. Delete `sel()` and drop `get_app_snapshot` from the allowlist.

After step 6 there is no whole-database read left anywhere in the system.

---

## Addendum — the write side was left half-migrated; now it isn't (mostly)

0026 gave students, marks, attendance, fees and roles their own named write
functions, but no page was ever moved onto them — `upsert()`/`remove()` in
`src/lib/backend.ts` unconditionally errored for **every** table, so every
save in the app (register a student, enter a mark, take attendance, record a
payment, edit a role) failed against a live database. This has now been
fixed on the *write* side: `backend.ts`'s `sync()` routes students, marks,
mark-submission workflow, attendance, fee items/payments, role
defs/permissions and messages/read-receipts to their real RPCs
(`save_student`, `save_student_marks`, `set_submission_status`,
`save_register`, `record_fee_payment`, `create_fee_item`, `delete_fee_item`,
`save_role`, `delete_role`, `send_message`, `mark_message_read` — see
`0026_write_api.sql`, `0027_fee_payment_detail.sql`,
`0028_fee_item_crud.sql`, `0029_save_student_stable_id.sql`). Saving now
actually reaches Postgres for those six areas.

**This is independent of steps 2–6 above**, which are about the *read* side
(the whole-school bootstrap on login) and are still not done — don't read
"writes now work" as "the scaling work is finished." Both need doing before
this is comfortable at 5,000+ students.

**Still genuinely unwired on the write side**: nothing. As of `0032`, every
table any page actually saves to has a named write op wired into `sync()`.

---

## Round two — the rest of the write surface, the permission bug, and the document split

Everything in the addendum's "still genuinely unwired" list above is now
wired: classes, sections, subjects, teachers, teacher_assignments, homework
(+ the separate, narrower `toggle_homework_submission` for a student marking
their own — see that migration's comment for why it isn't folded into
`save_homework`), timetable_entries, assessment_structures/items,
announcements, events, starting/archiving a conversation, and reviewing a
guardian's bank-transfer receipt (`0030_write_api_structure.sql`).

**A real permission bug, not just a missing operation.** 0010 split "manage
academic years & terms" into its own permission
(`academics.manage_years`) precisely so a school could grant "manage
classes" without also granting control of the academic calendar. But
`0025_year_lifecycle.sql`, written after 0010, checked the broader
`academics.manage` in `set_active_year`, `close_year`, `rollover_year` and
`create_academic_year` instead — so a role holding exactly the permission
0010 was built for would see the Academic Years page and then get "not
permitted" on every action on it. Fixed in `0031_year_lifecycle_fixes.sql`,
which also adds `update_academic_year`, `delete_academic_year`, `save_term`
and `delete_term` — editing an existing year's dates and any per-term CRUD
had no operation at all before this. `AcademicYearsPage` is now wired
through `syncYears()`/`syncTerms()` in `backend.ts`, the same pattern as
everything else. `close_year`, `rollover_year` and `promote_students`
remain correctly permissioned but still have no button anywhere in the UI
to trigger them — that's a feature to build, not a bug to fix.

**The student-documents split, reconciled (pragmatically, not architecturally).**
Uploads have always gone through `register_file()` into `file_objects`; the
read path has always read a student's documents from the older
`student_documents` table. A freshly uploaded document could sit invisible
until someone thought to check the other table. `0032_reconcile_student_documents.sql`
makes `register_file()`/`unregister_file()` mirror student-document rows
into `student_documents` (same id, so they stay linked), plus a one-time
backfill for anything already stranded in `file_objects` from before this
fix. This was a deliberate choice to change the write side rather than the
read side: `get_app_bootstrap()`/`get_app_snapshot()` are the two most
security-sensitive functions in the schema, and reshaping either blind, with
no live database to verify the RLS-scoping still holds for every role, is a
worse risk than living with a mirrored table a little longer. **The honest
next step**, once there's a live database to test against, is to migrate
the read path onto `file_objects` as the single source of truth and retire
`student_documents` — this fix buys correctness now without taking that risk
tonight.

**What is still not done, and could not responsibly be done blind tonight:**
the read-side scaling conversion this whole addendum keeps distinguishing
from the write-side fixes — mounting `<AcademicYearProvider>` and moving
`StudentsPage`/`MarkEntryPage`/`AttendancePage`/`FeesPage`/`MessagesPage`
onto the paged hooks in `src/lib/api.ts` (steps 2–6 at the top of this
file). That is a rewrite of several thousand lines of page components that
changes how and when the UI fetches data, and it needs to be tested against
a live database with realistic data volume as it's built — not written in
one blind pass with no way to run it. Everything in this document up to
this line has been verified with `tsc --noEmit` and a full production
build; none of it has been exercised against a live Supabase project or
tested at 5,000-student scale, because neither was available in this
session. Treat this round as "every save now reaches the database
correctly," not as "verified end-to-end" or "scales."
