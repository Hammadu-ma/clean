import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushBatch, type PushSubscriptionData, type PushPayload } from "npm:@mmmike/web-push@1.3.0/send";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

async function secret(name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_push_secret", { p_name: name });
  if (error) throw error;
  return data ? String(data) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const pushSecret = req.headers.get("x-push-secret") || "";
  const expected = await secret("push_webhook_secret");
  if (!expected || pushSecret !== expected) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const notificationId = typeof body?.notification_id === "string" ? body.notification_id : "";
  if (!notificationId) return json({ error: "notification_id is required" }, 400);

  try {
    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .select("id,profile_id,type,title,body,target_route,target_type,target_id")
      .eq("id", notificationId)
      .maybeSingle();
    if (notificationError) throw notificationError;
    if (!notification) return json({ ok: true, delivered: 0, reason: "notification_not_found" });

    const { data: rows, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("endpoint,subscription")
      .eq("profile_id", notification.profile_id);
    if (subscriptionError) throw subscriptionError;
    if (!rows?.length) return json({ ok: true, delivered: 0, reason: "no_devices" });

    const [publicKey, privateKey, subject] = await Promise.all([
      secret("push_vapid_public_key"),
      secret("push_vapid_private_key"),
      secret("push_vapid_subject"),
    ]);
    if (!publicKey || !privateKey) return json({ error: "Push signing keys are not configured." }, 500);

    const payload: PushPayload = {
      title: String(notification.title || "School notification"),
      body: String(notification.body || ""),
      url: typeof notification.target_route === "string" && notification.target_route.startsWith("/")
        ? notification.target_route
        : "/notifications",
      tag: `notification-${String(notification.id)}`,
    };

    const subscriptions = rows
      .map((row: any) => ({ endpoint: String(row.endpoint), ...(row.subscription || {}) } as PushSubscriptionData))
      .filter((sub: any) => sub.endpoint && sub.keys?.p256dh && sub.keys?.auth);
    if (!subscriptions.length) return json({ ok: true, delivered: 0, reason: "invalid_devices" });

    const result = await sendPushBatch(
      subscriptions,
      payload,
      { publicKey, privateKey, subject: subject || "mailto:notifications@school.local" },
      { concurrency: 20, ttl: 86_400, urgency: "high" },
    );

    const gone = new Set(result.gone);
    if (gone.size) await supabase.from("push_subscriptions").delete().in("endpoint", [...gone]);

    return json({ ok: true, delivered: result.delivered, gone: gone.size, failed: result.failed.length });
  } catch (e) {
    console.error("[push-notification] failed:", e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
