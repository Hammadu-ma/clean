import { env, originAllowed } from "../_lib/env";
import { authenticate, adminClient } from "../_lib/supabase";
import { fail, json, methodGuard } from "../_lib/http";

export const config = { runtime: "edge" };

function b64url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(part: string): Uint8Array {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function generateVapidPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;

  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey) as JsonWebKey;
  const x = b64urlToBytes(String(jwk.x ?? ""));
  const y = b64urlToBytes(String(jwk.y ?? ""));
  const d = b64urlToBytes(String(jwk.d ?? ""));
  if (x.length !== 32 || y.length !== 32 || d.length !== 32) throw new Error("VAPID key generation failed.");

  const publicRaw = new Uint8Array(65);
  publicRaw[0] = 4;
  publicRaw.set(x, 1);
  publicRaw.set(y, 33);

  return { publicKey: b64url(publicRaw), privateKey: b64url(d) };
}

/** Returns the public VAPID key. The private key never leaves the server. */
export default async function handler(req: Request): Promise<Response> {
  const bad = methodGuard(req, "GET");
  if (bad) return bad;
  if (!originAllowed(req)) return fail("forbidden", "Request origin not allowed.");

  const ctx = await authenticate(req);
  if (!ctx) return fail("unauthenticated", "Your session has expired. Please sign in again.");

  try {
    const admin = adminClient();
    let { data: configRow, error } = await admin
      .from("push_config")
      .select("public_key,subject")
      .eq("singleton", true)
      .maybeSingle();

    if (error) {
      console.error("[push/config] lookup failed:", error.code, error.message);
      return fail("upstream_error", "Device notifications are temporarily unavailable.");
    }

    if (!configRow?.public_key) {
      const generated = await generateVapidPair();
      const { data: ensured, error: ensureError } = await admin.rpc("ensure_push_config", {
        p_public_key: generated.publicKey,
        p_private_key: generated.privateKey,
        p_subject: "mailto:notifications@school.local",
      });
      if (ensureError) {
        console.error("[push/config] key initialization failed:", ensureError.code, ensureError.message);
        return fail("upstream_error", "Device notifications are temporarily unavailable.");
      }
      const publicKey = String(ensured || generated.publicKey);
      // Re-fetch only the public projection so races always return the authoritative key.
      ({ data: configRow, error } = await admin
        .from("push_config")
        .select("public_key,subject")
        .eq("singleton", true)
        .maybeSingle());
      if (error || !configRow?.public_key) {
        return json({ ok: true, publicKey }, 200, { "cache-control": "private, no-store" });
      }
    }

    return json({ ok: true, publicKey: String(configRow.public_key) }, 200, {
      "cache-control": "private, no-store, max-age=0, must-revalidate",
    });
  } catch (e) {
    console.error("[push/config] failed:", e);
    return fail("server_error", "Device notifications are temporarily unavailable.");
  }
}
