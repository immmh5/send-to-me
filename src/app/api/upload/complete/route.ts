import { isAuthed } from "@/lib/auth";
import {
  assemblyBuffer,
  assemblyStream,
  discardUpload,
  getManifest,
  missingParts,
} from "@/lib/chunks";
import { ID_PATTERN } from "@/lib/limits";
import { getDriver, thumbKey } from "@/lib/storage";
import { makeThumbBuffer } from "@/lib/thumbs";
import type { StoredFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_THUMB_SOURCE_BYTES = 64 * 1024 * 1024; // thumbnails only for images ≤ 64 MB

function storageError(err: unknown): { message: string; status: number } {
  if (err instanceof Error && err.name === "MegaDriverError") {
    return { message: err.message, status: 503 };
  }
  return { message: "تعذّر الحفظ في التخزين — تحقق من إعداداته", status: 500 };
}

/**
 * POST /api/upload/complete
 * Body: { uploadId }  →  { file: StoredFile }
 * Streams the assembled parts into the storage driver (memory-flat),
 * generates a thumbnail for images, then frees the temp chunks.
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
  const uploadId = (body as { uploadId?: unknown })?.uploadId;
  if (typeof uploadId !== "string" || !ID_PATTERN.test(uploadId)) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const manifest = await getManifest(uploadId);
  if (!manifest) {
    return Response.json(
      { error: "جلسة الرفع غير موجودة أو انتهت — أعد رفع الملف" },
      { status: 410 },
    );
  }

  const missing = await missingParts(manifest);
  if (missing.length > 0) {
    return Response.json(
      { error: `أجزاء ناقصة (${missing.length}) — أكمل الرفع أولًا`, missing },
      { status: 409 },
    );
  }

  const driver = getDriver();
  const isImage = manifest.mime.startsWith("image/");

  try {
    await driver.put(
      manifest.id,
      assemblyStream(manifest),
      manifest.mime,
      manifest.size,
    );
  } catch (err) {
    // keep the parts! the client can retry "complete" without re-uploading
    const { message, status } = storageError(err);
    return Response.json({ error: message }, { status });
  }

  /* thumbnail — best effort, small images only */
  let thumb: Buffer | null = null;
  if (isImage && manifest.size <= MAX_THUMB_SOURCE_BYTES) {
    try {
      thumb = await makeThumbBuffer(await assemblyBuffer(manifest));
    } catch {
      thumb = null;
    }
    if (thumb) {
      try {
        await driver.put(thumbKey(manifest.id), thumb, "image/webp", thumb.length);
      } catch {
        /* no thumb — fine */
      }
    }
  }

  await discardUpload(uploadId);

  const file: StoredFile = {
    id: manifest.id,
    name: manifest.name,
    mime: manifest.mime,
    size: manifest.size,
  };
  return Response.json({ file }, { status: 201 });
}
