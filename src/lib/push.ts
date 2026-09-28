import { useEffect, useState } from "react";
import { csrfToken } from "./http";

const DISABLED_PREFIX = "sms_push_disabled:";

export type DevicePushPermission = NotificationPermission | "unsupported";

export function isDevicePushSupported(): boolean {
  return typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function devicePushPermission(): DevicePushPermission {
  if (!isDevicePushSupported()) return "unsupported";
  return Notification.permission;
}

function disabledKey(userId: string) {
  return `${DISABLED_PREFIX}${userId}`;
}

function isOptedOut(userId: string) {
  try { return localStorage.getItem(disabledKey(userId)) === "1"; } catch { return false; }
}

function clearOptOut(userId: string) {
  try { localStorage.removeItem(disabledKey(userId)); } catch { /* best effort */ }
}

function encodeApplicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True when the browser subscription was created with exactly this VAPID public key. */
function subscribedWithKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = encodeApplicationServerKey(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function getPublicKey(): Promise<string> {
  const res = await fetch("/api/push/config", { credentials: "same-origin", cache: "no-store" });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok || typeof payload.publicKey !== "string") {
    throw new Error(payload?.error?.message ?? "Push notifications are not configured.");
  }
  return payload.publicKey;
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const token = csrfToken();
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  if (!endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("The device push subscription is incomplete.");

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-csrf-token": token } : {}),
    },
    body: JSON.stringify({
      subscription: {
        endpoint,
        expirationTime: json.expirationTime ?? null,
        keys: json.keys,
      },
      userAgent: navigator.userAgent.slice(0, 500),
    }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    throw Object.assign(new Error(payload?.error?.message ?? "Couldn't register this device."), { status: res.status });
  }
}

async function postUnsubscribe(endpoint: string): Promise<void> {
  const token = csrfToken();
  const res = await fetch("/api/push/unsubscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-csrf-token": token } : {}),
    },
    body: JSON.stringify({ endpoint }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "Couldn't disconnect this device.");
}

async function registerAndSubscribe(forceFresh = false): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const publicKey = await getPublicKey();
  const existing = await registration.pushManager.getSubscription();
  // Reuse only a subscription made with the CURRENT server key. A key mismatch
  // makes every push fail silently; a forced refresh is how we leave an endpoint
  // that the server has registered to a different account.
  if (existing && !forceFresh && subscribedWithKey(existing, publicKey)) return existing;
  if (existing) await existing.unsubscribe().catch(() => false);
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: encodeApplicationServerKey(publicKey),
  });
}

/**
 * Subscribes this browser and registers it for the signed-in user. If the server
 * refuses because this endpoint already belongs to another account (same browser,
 * different login), mint a brand-new endpoint and register that instead. The
 * server-side ownership rule stays strict; we never ask it to reassign endpoints.
 */
async function subscribeAndSave(): Promise<void> {
  let subscription = await registerAndSubscribe();
  try {
    await saveSubscription(subscription);
  } catch (error) {
    if ((error as { status?: number }).status !== 403) throw error;
    subscription = await registerAndSubscribe(true);
    await saveSubscription(subscription);
  }
}

/** Silently restores an already-approved device subscription. Never prompts. */
export async function syncGrantedDevicePush(userId: string): Promise<void> {
  if (!isDevicePushSupported() || isOptedOut(userId) || Notification.permission !== "granted") return;
  await subscribeAndSave();
}

/** Prompts only from the explicit Enable button. */
export async function enableDevicePush(userId: string): Promise<void> {
  if (!isDevicePushSupported()) throw new Error("This browser does not support device notifications.");
  clearOptOut(userId);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "Device notifications are blocked in this browser." : "Device notification permission was not granted.");
  }
  await subscribeAndSave();
}

export async function detachDevicePush(): Promise<void> {
  if (!isDevicePushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await postUnsubscribe(subscription.endpoint);
  } finally {
    // Even if the server call failed, never leave this endpoint in the browser:
    // the next person to sign in here would otherwise inherit it.
    await subscription.unsubscribe().catch(() => false);
  }
}

export async function disableDevicePush(userId: string): Promise<void> {
  if (!isDevicePushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/") ?? await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await postUnsubscribe(subscription.endpoint);
    await subscription.unsubscribe().catch(() => false);
  }
  try { localStorage.setItem(disabledKey(userId), "1"); } catch { /* best effort */ }
}

export function useDevicePush(userId: string | null) {
  const [permission, setPermission] = useState<DevicePushPermission>(() => devicePushPermission());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(devicePushPermission());
    if (!userId || !isDevicePushSupported() || isOptedOut(userId) || Notification.permission !== "granted") return;
    void syncGrantedDevicePush(userId).catch((error) => console.warn("[push] background sync failed:", error));
  }, [userId]);

  const enable = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await enableDevicePush(userId);
      setPermission(Notification.permission);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await disableDevicePush(userId);
      setPermission(Notification.permission);
    } finally {
      setBusy(false);
    }
  };

  return {
    supported: isDevicePushSupported(),
    permission,
    enabled: permission === "granted" && !!userId && !isOptedOut(userId),
    busy,
    enable,
    disable,
  };
}
