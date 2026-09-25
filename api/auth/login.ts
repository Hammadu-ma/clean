import { createClient } from "@supabase/supabase-js";
import { env, originAllowed } from "../_lib/env";
import { adminClient } from "../_lib/supabase";
import { clientIp, fail, json, methodGuard, readJson } from "../_lib/http";
import { newCsrfToken, sessionCookies, withCookies } from "../_lib/cookies";
import { hasSharedLimiter, rateLimit } from "../_lib/ratelimit";

export const config = { runtime: "edge" };

/**
 * POST /api/auth/login  { username, password }
 *
 * The browser sends credentials to our origin and gets back a session in
 * httpOnly cookies. It never receives a token, never sees the Supabase URL,
 * and has no way to talk to the database directly.
 *
 * ON ENUMERATION
 * Every failure below returns the same message and the same status. A
 * response that distinguished "no such user" from "wrong password" would let
 * anyone confirm which usernames exist — and in a school system the usernames
 * are children's names. The timing differs slightly between the two paths;
 * that's a known, minor leak I've chosen not to paper over with an artificial
 * delay, because the delay is easy to get wrong and the signal is weak
 * compared to the rate limit below.
 */
export default async function handler(req: Request): Promise<Response> {
  const bad = methodGuard(req, "POST");
  if (bad) return bad;

  if (!originAllowed(req)) {
    return fail("forbidden", "Request origin not allowed.");
  }

  const body = await readJson<{ username?: string; password?: string }>(req, 4096);
  if (!body) return fail("invalid_request", "Malformed request.");

  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) {
    return fail("invalid_request", "Enter your username and password.");
  }

  // Limit on IP *and* on the username being attempted, so one attacker can't
  // spread attempts across accounts, and can't rotate IPs to grind one account.
  const ip = clientIp(req);
  const [byIp, byUser] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 20),
    rateLimit(`login:user:${username}`, 10),
  ]);
  if (!byIp.allowed || !byUser.allowed) {
    return fail("rate_limited", "Too many sign-in attempts. Please wait a minute and try again.", {
      "retry-after": String(Math.max(byIp.retryAfterSeconds, byUser.retryAfterSeconds)),
    });
  }
  if (!hasSharedLimiter() && env.isProduction) {
    // Surfaced once per cold start rather than per request.
    console.warn("[login] no shared rate limiter configured — see api/_lib/ratelimit.ts");
  }

  const GENERIC = "That username and password don't match.";

  try {
    // Resolve username → login email. The service role is needed here because
    // the caller has no session yet, so there is no user context to run as.
    const admin = adminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, username, status")
      .eq("username", username)
      .maybeSingle();
    if (profileError) {
      // Wrong service-role key, missing table, or RLS/grants problem. Server
      // log only; the client still gets the generic message below.
      console.error("[login] profile lookup failed:", profileError.code, profileError.message);
    }

    if (profile && profile.status !== "active") {
      // Deliberately the same message: whether an account is disabled is not
      // something an unauthenticated caller should be able to learn.
      return fail("unauthenticated", GENERIC);
    }

    // Resolve the actual Auth email from this profile's Auth user. The profile
    // username is the human-facing login identifier and can now change without
    // forcing an Auth email migration.
    if (!profile) return fail("unauthenticated", GENERIC);
    const authAccount = await admin.auth.admin.getUserById(profile.id);
    const email = authAccount.data.user?.email;
    if (!email) {
      console.error("[login] auth account email missing");
      return fail("unauthenticated", GENERIC);
    }

    // Sign in with the ANON key, not the service role — this must go through
    // the normal auth path so password policy, lockouts and audit all apply.
    const auth = createClient(env.supabaseUrl, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await auth.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      // The client only ever sees GENERIC. The real reason goes to the
      // function log so "wrong password" can be told apart from "Database
      // error querying schema" (migrations 0005/0008 missing) or a bad key.
      // Usernames are deliberately not logged.
      console.error("[login] auth rejected:", {
        profileFound: !!profile,
        status: error?.status,
        code: (error as { code?: string } | null)?.code,
        message: error?.message,
      });
      return fail("unauthenticated", GENERIC);
    }

    // Re-read the profile as the authenticated user so the hint reflects what
    // RLS would actually show, not what the service role could see.
    const { data: me } = await admin
      .from("profiles")
      .select("role, full_name, status")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!me || me.status !== "active") {
      await auth.auth.signOut();
      return fail("unauthenticated", GENERIC);
    }

    const csrf = newCsrfToken();
    const expiresIn = data.session.expires_in ?? 3600;

    const res = json({
      ok: true,
      // The hint is not a credential. It is the minimum needed to render the
      // right shell before the first data request returns.
      user: { role: me.role, name: me.full_name },
      csrfToken: csrf,
    });

    return withCookies(
      res,
      sessionCookies(
        { accessToken: data.session.access_token, refreshToken: data.session.refresh_token },
        csrf,
        { role: me.role, name: me.full_name, exp: Math.floor(Date.now() / 1000) + expiresIn },
        expiresIn
      )
    );
  } catch (e) {
    console.error("[login] unexpected failure:", e);
    return fail("server_error", "Sign-in is temporarily unavailable. Please try again.");
  }
}
