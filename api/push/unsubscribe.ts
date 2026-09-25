import { authenticate } from "../_lib/supabase";
import { csrfValid } from "../_lib/cookies";
import { originAllowed } from "../_lib/env";
import { fail, failFromPostgres, json, methodGuard, readJson } from "../_lib/http";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const bad = methodGuard(req, "POST");
  if (bad) return bad;
  if (!originAllowed(req)) return fail("forbidden", "Request origin not allowed.");

  const ctx = await authenticate(req);
  if (!ctx) return fail("unauthenticated", "Your session has expired. Please sign in again.");
  if (!csrfValid(req)) return fail("forbidden", "Invalid request token.");

  const body = await readJson<{ endpoint?: string }>(req, 4096);
  const endpoint = String(body?.endpoint ?? "");
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2048) {
    return fail("invalid_request", "This device subscription is not valid.");
  }

  const { data, error } = await ctx.db.rpc("remove_push_subscription", { p_endpoint: endpoint });
  if (error) return failFromPostgres(error, "push unsubscribe");
  return json({ ok: true, data });
}
