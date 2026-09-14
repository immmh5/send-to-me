import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { isAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUNDLE_PATH = "data/send-to-self-source.tar.gz";

/**
 * Authenticated download of the project source bundle (no .env, no data/),
 * so the owner can fetch the code and push it to their own GitHub/Render.
 */
export async function GET(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }
  try {
    const info = await stat(BUNDLE_PATH);
    const stream = createReadStream(BUNDLE_PATH);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(info.size),
        "Content-Disposition": 'attachment; filename="send-to-self-source.tar.gz"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "حزمة المصدر غير موجودة — أنشئها بأمر tar أولاً" },
      { status: 404 },
    );
  }
}
