import { authenticate } from "./_lib/supabase";
import { originAllowed } from "./_lib/env";
import { fail } from "./_lib/http";

export const config = { runtime: "edge" };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type NotificationRow = {
  id: string;
  created_at: string;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  is_read?: boolean | null;
  year_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_route?: string | null;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return fail("invalid_request", "Method GET not allowed.", { allow: "GET" });
  if (!originAllowed(req)) return fail("forbidden", "Request origin not allowed.");

  const ctx = await authenticate(req);
  if (!ctx) return fail("unauthenticated", "Your session has expired. Please sign in again.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const write = (value: string) => {
        if (!closed) controller.enqueue(encoder.encode(value));
      };
      const close = () => {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
      };

      try {
        write(`retry: 1000\\n\\n`);

        const { data: initial } = await ctx.db
          .from("notifications")
          .select("id,created_at")
          .eq("profile_id", ctx.userId)
          .order("created_at", { ascending: false })
          .limit(100);

        const known = new Set<string>((initial ?? []).map((n: { id: unknown }) => String(n.id)));
        let lastHeartbeat = Date.now();

        while (!closed && !req.signal.aborted) {
          const { data, error } = await ctx.db
            .from("notifications")
            .select("id,created_at,type,title,body,is_read,year_id,target_type,target_id,target_route")
            .eq("profile_id", ctx.userId)
            .order("created_at", { ascending: false })
            .limit(100);

          if (error) {
            write(`event: error\\ndata: ${JSON.stringify({ message: "Notification stream temporarily unavailable." })}\\n\\n`);
            await sleep(1500);
            continue;
          }

          const rows = (data ?? []) as NotificationRow[];
          const fresh = rows.filter((n: NotificationRow) => !known.has(String(n.id)));
          for (const n of fresh.reverse()) {
            known.add(String(n.id));
            write(`event: notification\\ndata: ${JSON.stringify(n)}\\n\\n`);
          }

          if (known.size > 200) {
            const keep = new Set(rows.map((n: NotificationRow) => String(n.id)));
            for (const id of known) if (!keep.has(id)) known.delete(id);
          }

          if (Date.now() - lastHeartbeat >= 15000) {
            write(`: heartbeat\\n\\n`);
            lastHeartbeat = Date.now();
          }

          await sleep(1000);
        }
      } catch {
        // Client disconnects and platform stream shutdowns are normal here.
      } finally {
        close();
      }
    },
    cancel() {
      // `req.signal` is the canonical disconnect signal for the edge runtime.
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store, max-age=0, must-revalidate",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
    },
  });
}
