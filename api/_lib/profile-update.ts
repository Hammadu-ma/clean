import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { AuthedContext } from "./supabase";
import { json, fail } from "./http";

export interface ProfileUpdateArgs {
  username: unknown;
  fullName?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
}

/**
 * Single implementation for profile identity + password updates.
 *
 * It intentionally avoids the public PostgREST `update_my_profile` RPC for
 * both the new endpoint and the compatibility RPC route. Password changes
 * are verified through Supabase Auth and the current password is also passed
 * to `updateUser` so projects with "Require current password when changing
 * password" enabled can complete the operation.
 */
export async function updateProfileDirect(
  ctx: AuthedContext,
  args: ProfileUpdateArgs
): Promise<Response> {
  const username = String(args.username ?? "").trim().toLowerCase();
  const fullName = String(args.fullName ?? "").trim();
  const currentPassword = String(args.currentPassword ?? "");
  const newPassword = String(args.newPassword ?? "");

  if (!username) return fail("invalid_request", "Username is required.");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    return fail(
      "invalid_request",
      "Username must be 3-64 characters and use only letters, numbers, dot, underscore or hyphen."
    );
  }
  if (newPassword && newPassword.length < 6) {
    return fail("invalid_request", "New password must be at least 6 characters.");
  }
  if (newPassword && !currentPassword) {
    return fail("invalid_request", "Enter your current password.");
  }

  const { data: conflict, error: conflictError } = await ctx.db
    .from("profiles")
    .select("id")
    .eq("username", username)
    .neq("id", ctx.userId)
    .maybeSingle();

  if (conflictError) {
    console.error(
      "[profile] username availability check failed:",
      conflictError.message
    );
    return fail(
      "server_error",
      "Could not check username availability. Please try again."
    );
  }

  if (conflict?.id) {
    return fail("invalid_request", "That username is already taken.");
  }

  if (newPassword) {
    const { data: authData, error: authError } = await ctx.db.auth.getUser(
      ctx.tokens.accessToken
    );

    const email = authData.user?.email;

    if (authError || !email || authData.user?.id !== ctx.userId) {
      console.error(
        "[profile] unable to resolve auth email:",
        authError?.message
      );
      return fail(
        "server_error",
        "Could not verify your account. Please try again."
      );
    }

    // Verify the supplied current password through the normal password
    // authentication flow, without exposing any service-role credential.
    const verifier = createClient(env.supabaseUrl, env.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: verified, error: verifyError } =
      await verifier.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

    if (verifyError || !verified.user || verified.user.id !== ctx.userId) {
      return fail("invalid_request", "Current password is incorrect.");
    }

    /*
     * IMPORTANT:
     * Supabase supports `current_password` on updateUser. The previous code
     * verified the password separately but omitted it from this actual Auth
     * password-change request, which causes a 400 when the project has
     * "Require current password when changing password" enabled.
     *
     * Use the authenticated caller's client here so the password remains
     * attached to the current session/RLS context.
     */
    const { error: passwordError } = await ctx.db.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });

    if (passwordError) {
      console.error(
        "[profile] Auth password update failed:",
        passwordError.status,
        passwordError.code,
        passwordError.message
      );
      return fail(
        "invalid_request",
        passwordError.message || "Could not change your password."
      );
    }
  }

  const updatePayload: Record<string, string> = { username };
  if (fullName) updatePayload.full_name = fullName;

  const { data: updated, error: updateError } = await ctx.db
    .from("profiles")
    .update(updatePayload)
    .eq("id", ctx.userId)
    .select("username,full_name")
    .maybeSingle();

  if (updateError || !updated) {
    console.error(
      "[profile] profile update failed:",
      updateError?.message
    );
    return fail(
      "server_error",
      "Could not save your profile. Please try again."
    );
  }

  try {
    const { error: logError } = await ctx.db.rpc("log_action", {
      p_action: newPassword
        ? "profile.password_and_identity_update"
        : "profile.identity_update",
      p_target: ctx.userId,
      p_detail: username,
    });

    if (logError) {
      console.warn(
        "[profile] audit logging failed:",
        logError.message
      );
    }
  } catch (e) {
    console.warn("[profile] audit logging failed:", e);
  }

  return json({
    ok: true,
    data: {
      userId: ctx.userId,
      username: String(updated.username ?? username),
      fullName: String(updated.full_name ?? fullName),
      passwordChanged: Boolean(newPassword),
    },
  });
}
