import { createClient } from "@supabase/supabase-js";
import { env, originAllowed } from "../_lib/env";
import { adminClient, authenticate } from "../_lib/supabase";
import { csrfValid } from "../_lib/cookies";
import { clientIp, fail, failFromPostgres, json, methodGuard, readJson } from "../_lib/http";
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
 * Profile identity is still updated by the existing, permission-aware RPC.
 * Passwords deliberately do NOT go through SQL updates to auth.users anymore.
 * Instead we verify the current password through the normal Supabase Auth
 * sign-in path and then ask the Supabase Auth admin API to update only this
 * authenticated user's password. The service-role client is used only after
 * the current session and current password have both been verified, and the
 * credential never enters PostgreSQL SQL.
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
    // If a password is being changed, verify the existing credential through
    // the ordinary Auth password flow before mutating either side of the
    // account. The verifier client is intentionally separate from the current
    // session client so a verification attempt cannot replace that session.
    if (newPassword) {
      const { data: authData, error: authError } = await ctx.db.auth.getUser(ctx.tokens.accessToken);
      const email = authData.user?.email;
      if (authError || !email) {
        console.error("[profile] unable to resolve auth email for password verification:", authError?.code, authError?.message);
        return fail("server_error", "Could not verify your account. Please try again.");
      }

      const verifier = createClient(env.supabaseUrl, env.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyError || !verified.user || verified.user.id !== ctx.userId) {
        return fail("invalid_request", "Current password is incorrect.");
      }
    }

    // Reuse the existing identity-update business rules and uniqueness check,
    // but never pass a new password into that SQL function.
    const { data: profileData, error: profileError } = await ctx.db.rpc("update_my_profile", {
      p_username: username,
      p_current_password: null,
      p_new_password: null,
      p_full_name: fullName || null,
    });
    if (profileError) return failFromPostgres(profileError, "rpc update_my_profile");

    if (newPassword) {
      const { error: passwordError } = await adminClient().auth.admin.updateUserById(ctx.userId, {
        password: newPassword,
      });
      if (passwordError) {
        console.error("[profile] Supabase Auth password update failed:", passwordError.status, passwordError.code, passwordError.message);
        return fail("server_error", "Your profile was updated, but the password could not be changed. Please try again.");
      }
    }

    return json({
      ok: true,
      data: {
        username: String(profileData?.username ?? username),
        fullName: String(profileData?.fullName ?? fullName),
        passwordChanged: Boolean(newPassword),
      },
    }, 200, rateHeaders(limit, 10));
  } catch (e) {
    console.error("[profile] update-profile threw:", e);
    return fail("server_error", "Something went wrong. Please try again.");
  }
}
