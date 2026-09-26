import { fail, failFromPostgres, json, methodGuard, readJson, clientIp } from "../_lib/http";
import { csrfValid } from "../_lib/cookies";
import { originAllowed } from "../_lib/env";
import { adminClient, authenticate } from "../_lib/supabase";
import { RPC_ALLOWLIST, isReadOnly, rateLimitFor, validateArgs } from "../_lib/allowlist";
import { rateHeaders, rateLimit } from "../_lib/ratelimit";
import { updateProfileDirect } from "../_lib/profile-update";

export const config = { runtime: "edge" };

const UUID_ZERO = "00000000-0000-0000-0000-000000000000";

async function callerIsSuperAdmin(ctx: Awaited<ReturnType<typeof authenticate>>): Promise<boolean> {
  if (!ctx) return false;

  const { data: profile, error: profileError } = await ctx.db
    .from("profiles")
    .select("role_def_id,status")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (profileError || !profile || profile.status !== "active") return false;

  const { data: roleDef, error: roleError } = await ctx.db
    .from("role_defs")
    .select("id,name")
    .eq("id", profile.role_def_id)
    .maybeSingle();
  if (roleError || !roleDef) return false;

  return roleDef.id === "superadmin" || roleDef.name === "Super Admin";
}

async function clearAuditLogDirect(ctx: NonNullable<Awaited<ReturnType<typeof authenticate>>>) {
  if (!(await callerIsSuperAdmin(ctx))) {
    return fail("forbidden", "Only the Super Admin can clear the audit log.");
  }

  const { error, count } = await adminClient()
    .from("audit_log")
    .delete({ count: "exact" })
    .neq("id", UUID_ZERO);

  if (error) {
    console.error("[audit] direct clear failed:", error.message);
    return fail("server_error", "Could not clear the audit log. Please try again.");
  }

  return json({ ok: true, data: { cleared: true, removed: Number(count ?? 0) } });
}

async function deleteAuditEntryDirect(
  ctx: NonNullable<Awaited<ReturnType<typeof authenticate>>>,
  id: string
) {
  if (!(await callerIsSuperAdmin(ctx))) {
    return fail("forbidden", "Only the Super Admin can delete audit entries.");
  }

  const { data, error } = await adminClient()
    .from("audit_log")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[audit] direct delete failed:", error.message);
    return fail("server_error", "Could not delete that audit entry. Please try again.");
  }

  return json({ ok: true, data: { id, deleted: Boolean(data?.id) } });
}


/**
 * POST /api/rpc/<function-name>
 *
 * The entire data surface of the application. Everything the browser can do
 * to the database happens through this one door, and the door checks, in
 * order: origin, authentication, allowlist, CSRF, rate limit, argument shape,
 * and finally PostgreSQL/RLS.
 */
export default async function handler(req: Request): Promise<Response> {
  const bad = methodGuard(req, "POST");
  if (bad) return bad;

  if (!originAllowed(req)) return fail("forbidden", "Request origin not allowed.");

  const fn = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!Object.prototype.hasOwnProperty.call(RPC_ALLOWLIST, fn)) {
    return fail("not_found", "Unknown operation.");
  }

  const ctx = await authenticate(req);
  if (!ctx) return fail("unauthenticated", "Your session has expired. Please sign in again.");

  const writes = !isReadOnly(fn);
  if (writes && !csrfValid(req)) {
    return fail("forbidden", "Invalid request token. Please refresh the page.");
  }

  const limit = rateLimitFor(fn);
  const rl = await rateLimit(`rpc:${ctx.userId}:${fn}`, limit);
  if (!rl.allowed) {
    console.warn(`[rpc] rate limited user=${ctx.userId} fn=${fn} ip=${clientIp(req)}`);
    return fail("rate_limited", "You're going a bit fast. Try again in a moment.", rateHeaders(rl, limit));
  }

  const body = await readJson(req);
  if (!body) return fail("invalid_request", "Malformed request.");

  const validated = validateArgs(fn, body);
  if (!validated.ok) return fail("invalid_request", validated.error ?? "Invalid request.");

  // Compatibility shims: older cached frontends may still call these original
  // RPC names. Keep them working without sending the privileged operation
  // through the fragile PostgREST function cache.
  if (fn === "clear_audit_log" || fn === "clear_audit_log_v2") {
    return clearAuditLogDirect(ctx);
  }
  if (fn === "delete_audit_entry") {
    const id = String(validated.args?.p_id ?? "");
    if (!id) return fail("invalid_request", "Audit entry id is required.");
    return deleteAuditEntryDirect(ctx, id);
  }
  if (fn === "update_my_profile") {
    return updateProfileDirect(ctx, {
      username: validated.args?.p_username,
      fullName: validated.args?.p_full_name,
      currentPassword: validated.args?.p_current_password,
      newPassword: validated.args?.p_new_password,
    });
  }

  const started = Date.now();
  try {
    const { data, error } = await ctx.db.rpc(fn, validated.args ?? {});
    if (error) return failFromPostgres(error, `rpc ${fn}`);

    const ms = Date.now() - started;
    if (ms > 1000) console.warn(`[rpc] slow: ${fn} took ${ms}ms for user ${ctx.userId}`);

    return json({ ok: true, data: data ?? null }, 200, {
      ...rateHeaders(rl, limit),
      "server-timing": `db;dur=${ms}`,
    });
  } catch (e) {
    console.error(`[rpc] ${fn} threw:`, e);
    return fail("server_error", "Something went wrong. Please try again.");
  }
}
