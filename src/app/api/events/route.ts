import { isAuthed } from "@/lib/auth";
import { sseClients } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let sender: ((chunk: string) => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      sender = safeEnqueue;
      sseClients.add(safeEnqueue);
      safeEnqueue("retry: 3000\n\n");
      safeEnqueue(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          /* stream closing */
        }
      }, 20_000);

      req.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        if (sender) sseClients.delete(sender);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (sender) sseClients.delete(sender);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
