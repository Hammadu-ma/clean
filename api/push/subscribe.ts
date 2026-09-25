import { authenticate } from "../_lib/supabase";
import { csrfValid } from "../_lib/cookies";
import { originAllowed } from "../_lib/env";
import { fail, failFromPostgres, json, methodGuard, readJson } from "../_lib/http";

export const config = { runtime: "edge" };

type PushSubscriptionBody = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: { p256dh?: string; auth?: string };
};

export default async function handler(req: Request): Promise<Response> {
  const bad = methodGuard(req, "POST");
  if (bad) return bad;
  if (!originAllowed(req)) return fail("forbidden", "Request origin not allowed.");

  const ctx = await authenticate(req);
  if (!ctx) return fail("unauthenticated", "Your session has expired. Please sign in again.");
  if (!csrfValid(req)) return fail("forbidden", "Invalid request token.");

  const body = await readJson<{ subscription?: PushSubscriptionBody; userAgent?: string }>(req, 16 * 1024);
  if (!body?.subscription) return fail("invalid_request", "Push subscription is missing.");

  const subscription = body.subscription;
  const endpoint = String(subscription.endpoint ?? "");
  const p256dh = String(subscription.keys?.p256dh ?? "");
  const auth = String(subscription.keys?.auth ?? "");
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2048 || !p256dh || !auth) {
    return fail("invalid_request", "This device subscription is not valid.");
  }

  const { data, error } = await ctx.db.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_subscription: {
      endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: { p256dh, auth },
    },
    p_user_agent: String(body.userAgent ?? "").slice(0, 500) || null,
  });
  if (error) return failFromPostgres(error, "push subscribe");
  return json({ ok: true, data });
}
