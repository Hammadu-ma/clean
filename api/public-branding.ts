import { adminClient } from "./_lib/supabase";
import { env, originAllowed } from "./_lib/env";
import { fail, json, methodGuard } from "./_lib/http";

export const config = { runtime: "edge" };

const SCHOOL_ID = "school-1";

/** Public, unauthenticated projection used only by the getting/login screen. */
export default async function handler(req: Request): Promise<Response> {
  const bad = methodGuard(req, "GET");
  if (bad) return bad;
  if (!originAllowed(req)) return fail("forbidden", "Request origin not allowed.");

  try {
    const { data, error } = await adminClient()
      .from("schools")
      .select("name,motto,logo_keys,active_logo_key")
      .eq("id", SCHOOL_ID)
      .maybeSingle();

    if (error) {
      console.error("[public-branding] school lookup failed:", error.code, error.message);
      return fail("upstream_error", "School branding is temporarily unavailable.");
    }

    const schoolName = String(data?.name ?? "").trim();
    const motto = String(data?.motto ?? "").trim();
    const logos = Array.isArray(data?.logo_keys) ? data.logo_keys : [];
    const active = String(data?.active_logo_key ?? logos[0]?.key ?? logos[0] ?? "");
    const logoKey = active.startsWith(`school_logo/${SCHOOL_ID}/`) ? active : "";

    let logoUrl: string | undefined;
    if (logoKey) {
      const res = await fetch(`${env.supabaseUrl}/functions/v1/r2-storage`, {
        method: "POST",
        headers: { apikey: env.anonKey, "content-type": "application/json" },
        body: JSON.stringify({ action: "presign-public-logo", ownerType: "school_logo", ownerId: SCHOOL_ID, key: logoKey }),
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.url) logoUrl = String(payload.url);
      else console.error("[public-branding] public logo signing failed:", res.status, payload);
    }

    return json({
      ok: true,
      branding: { schoolName, motto, logoKey: logoKey || undefined, logoUrl },
    }, 200, {
      "cache-control": "no-store, max-age=0, must-revalidate",
      "vary": "Origin",
    });
  } catch (e) {
    console.error("[public-branding] failed:", e);
    return fail("upstream_error", "School branding is temporarily unavailable.");
  }
}
