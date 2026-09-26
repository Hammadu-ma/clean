# Production handover checklist

This package is intended to be deployed as the single Vite/Vercel application in this directory.

## Vercel environment variables

Set these for the Production environment before the first production deployment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET` (use a newly generated random value; do not reuse a development secret)
- `ALLOWED_ORIGIN` (optional when the browser and API are same-origin; recommended for an explicit production domain)
- `SCHOOL_AUTH_EMAIL_DOMAIN` (keep the domain used by the school's username-to-email mapping)

Do not place any Supabase service-role key in `src/`, public assets, or Vite `VITE_*` variables.

## Supabase

Apply every migration in `supabase/migrations/` in filename order. The newest release migrations are `0076_production_hardening.sql` and `0077_production_rpc_execute_lockdown.sql`.

Recommended Auth settings before handover:

- Enable leaked-password protection in Supabase Auth.
- Require a strong password policy appropriate for staff/student accounts.
- Verify email settings match the school's login model; this app normally maps usernames to the configured school Auth domain.

## Security checks

- Confirm the application only reaches the database through `/api` and the fixed RPC allowlist.
- Keep the `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- Verify Super Admin-only operations: audit deletion/clear, role administration, and protected account operations.
- Test one admin, one teacher, one student, and one guardian account before client handover.

## Functional smoke test

- Login and logout for each role.
- Student search, class/section filtering and student profile navigation.
- Attendance register load/save and mobile horizontal table scrolling.
- Mark entry load/save/submit/publish workflow.
- Fees list, payment request review and receipt preview/clear.
- Messages open/send/read/delete.
- Events create/edit/delete.
- Announcements create/publish/read.
- User create/edit/status/delete and password change.
- Profile username/name/password update.
- Audit log view, single-entry delete and clear.
- Academic-year switch and historical-year protection.

## Deployment verification

Run:

```bash
npm ci
npm run typecheck
npm run build
```

Then deploy the resulting Vite build to Vercel and confirm `/api/health` reports all required server variables as present.

## Verification status for this source package

The source has been statically checked for TypeScript/TSX parse errors and broken relative imports. A complete `npm run typecheck` / `npm run build` could not be executed in the packaging environment because the npm registry download timed out and the local npm cache was empty.

## Important data note

The live Supabase project still contains development/test records and must not be presented to the client as a clean operational database until those records are intentionally removed. This source package does not include a destructive automatic reset migration; reset the live data once, deliberately, and keep production backups before doing so.
