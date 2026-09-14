import { isAuthed } from "@/lib/auth";
import { MAX_FILES, MAX_TEXT, ID_PATTERN, cleanName } from "@/lib/limits";
import { createItem } from "@/lib/store";
import type { StoredFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/upload  (JSON)
 * Body: { text?: string, files?: StoredFile[] }
 *
 * Finalizes an inbox item. The heavy lifting already happened —
 * files arrive via the resumable chunked pipeline
 * (/api/upload/start → /part → /complete), so this route never touches
 * raw bytes and stays instant. Text-only sends skip the pipeline entirely.
 */
export async function POST(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const { text, files } = (body ?? {}) as {
    text?: unknown;
    files?: unknown;
  };

  const cleanText =
    typeof text === "string" ? text.slice(0, MAX_TEXT).trim() : "";

  const stored: StoredFile[] = [];
  if (Array.isArray(files)) {
    if (files.length > MAX_FILES) {
      return Response.json(
        { error: `الحد الأقصى ${MAX_FILES} ملفًا في المرة الواحدة` },
        { status: 400 },
      );
    }
    for (const f of files) {
      if (!f || typeof f !== "object") continue;
      const { id, name, mime, size } = f as Record<string, unknown>;
      if (
        typeof id !== "string" ||
        !ID_PATTERN.test(id) ||
        id.endsWith(".thumb.webp") ||
        typeof size !== "number" ||
        !Number.isFinite(size) ||
        size <= 0
      ) {
        continue;
      }
      stored.push({
        id,
        name: cleanName(typeof name === "string" ? name : "ملف"),
        mime:
          (typeof mime === "string" ? mime : "").split(";")[0].toLowerCase() ||
          "application/octet-stream",
        size,
      });
    }
  }

  if (cleanText.length === 0 && stored.length === 0) {
    return Response.json({ error: "لا يوجد شيء للإرسال" }, { status: 400 });
  }

  const item = await createItem(cleanText, stored);
  return Response.json({ item }, { status: 201 });
}
