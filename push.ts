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

function encodeApplicationServerKey(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
  if (!res.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "Couldn't register this device.");
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

async function registerAndSubscribe(): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  const publicKey = await getPublicKey();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: encodeApplicationServerKey(publicKey),
  });
}

/** Silently restores an already-approved device subscription. Never prompts. */
export async function syncGrantedDevicePush(userId: string): Promise<void> {
  if (!isDevicePushSupported() || isOptedOut(userId) || Notification.permission !== "granted") return;
  const subscription = await registerAndSubscribe();
  await saveSubscription(subscription);
}

/** Prompts only from the explicit Enable button. */
export async function enableDevicePush(userId: string): Promise<void> {
  if (!isDevicePushSupported()) throw new Error("This browser does not support device notifications.");
  clearOptOut(userId);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "Device notifications are blocked in this browser." : "Device notification permission was not granted.");
  }
  const subscription = await registerAndSubscribe();
  await saveSubscription(subscription);
}

export async function detachDevicePush(): Promise<void> {
  if (!isDevicePushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await postUnsubscribe(subscription.endpoint);
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
