import { originAllowed } from "../_lib/env";
import { authenticate } from "../_lib/supabase";
import { updateProfileDirect } from "../_lib/profile-update";
import { csrfValid } from "../_lib/cookies";
import { clientIp, fail, methodGuard, readJson } from "../_lib/http";
import { rateHeaders, rateLimit } from "../_lib/ratelimit";

export const config = { runtime: "edge" };

type Body = {
  username?: unknown;
  fullName?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
};

/**
 * POST /api/auth/update-profile
 *
 * Uses the shared profile-update implementation. It deliberately avoids the
 * stale public PostgREST update_my_profile RPC for both identity and password
 * changes. Password verification and mutation happen through Supabase Auth,
 * while the profile row is updated under the caller's normal RLS context.
 */
export default async function handler(req: Request): Promise<Response> {
  const bad = methodGuard(req, "POST");
  if (bad) return bad;
  if (!originAllowed(req)) return fail("forbidden", "Request origin not allowed.");

  const ctx = await authenticate(req);
  if (!ctx) return fail("unauthenticated", "Your session has expired. Please sign in again.");
  if (!csrfValid(req)) return fail("forbidden", "Invalid request token. Please refresh the page.");

  const limit = await rateLimit(`profile:${ctx.userId}:${clientIp(req)}`, 10);
  if (!limit.allowed) {
    return fail("rate_limited", "You're going a bit fast. Try again in a moment.", rateHeaders(limit, 10));
  }

  const body = await readJson<Body>(req, 8192);
  if (!body) return fail("invalid_request", "Malformed request.");

  const username = String(body.username ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim();
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!username) return fail("invalid_request", "Username is required.");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    return fail("invalid_request", "Username must be 3-64 characters and use only letters, numbers, dot, underscore or hyphen.");
  }
  if (username.length > 64 || fullName.length > 200 || currentPassword.length > 200 || newPassword.length > 200) {
    return fail("invalid_request", "One or more values are too long.");
  }
  if (newPassword && newPassword.length < 6) {
    return fail("invalid_request", "New password must be at least 6 characters.");
  }
  if (newPassword && !currentPassword) {
    return fail("invalid_request", "Enter your current password.");
  }

  try {
    return updateProfileDirect(ctx, {
      username,
      fullName,
      currentPassword,
      newPassword,
    });
  } catch (e) {
    console.error("[profile] update-profile threw:", e);
    return fail("server_error", "Something went wrong. Please try again.");
  }
}
