import { isAuthed } from "@/lib/auth";
import { TooManySessionsError, startUpload } from "@/lib/chunks";
import { CHUNK_SIZE, MAX_FILE_BYTES, MAX_FILE_MB, cleanName } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/upload/start
 * Body: { name, mime, size }  →  { uploadId, chunkSize }
 * Opens a resumable chunked-upload session for one file.
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

  const { name, mime, size } = (body ?? {}) as {
    name?: unknown;
    mime?: unknown;
    size?: unknown;
  };
  const cleanMime =
    (typeof mime === "string" ? mime : "").split(";")[0].toLowerCase() ||
    "application/octet-stream";

  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return Response.json({ error: "حجم الملف غير صالح" }, { status: 400 });
  }
  if (size > MAX_FILE_BYTES) {
    return Response.json(
      { error: `الحد الأقصى للملف ${MAX_FILE_MB} ميجابايت` },
      { status: 413 },
    );
  }

  try {
    const manifest = await startUpload(
      cleanName(typeof name === "string" ? name : "ملف"),
      cleanMime,
      size,
    );
    return Response.json(
      { uploadId: manifest.id, chunkSize: CHUNK_SIZE },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof TooManySessionsError) {
      return Response.json({ error: err.message }, { status: 429 });
    }
    return Response.json({ error: "تعذّر بدء الرفع" }, { status: 500 });
  }
}
