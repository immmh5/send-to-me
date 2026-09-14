import { isAuthed } from "@/lib/auth";
import { expectedChunkSize, getManifest, listParts, savePart } from "@/lib/chunks";
import { CHUNK_SIZE, ID_PATTERN } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/upload/part?uploadId=…&index=…  (body = raw chunk bytes ≤ 8 MB)
 * Stores one chunk. Idempotent — re-sending a chunk just overwrites it.
 *
 * GET /api/upload/part?uploadId=…  →  { received: [{index,size}] , chunkSize }
 * Resume handshake: the client skips parts already stored server-side.
 */
export async function GET(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const url = new URL(req.url);
  const uploadId = url.searchParams.get("uploadId") ?? "";
  if (!ID_PATTERN.test(uploadId)) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  }
  const manifest = await getManifest(uploadId);
  if (!manifest) {
    return Response.json(
      { error: "جلسة الرفع غير موجودة أو انتهت" },
      { status: 410 },
    );
  }
  const received = (await listParts(uploadId)).filter(
    (p) => p.size === expectedChunkSize(manifest, p.index),
  );
  return Response.json({ received, chunkSize: CHUNK_SIZE });
}

export async function PUT(req: Request) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const url = new URL(req.url);
  const uploadId = url.searchParams.get("uploadId") ?? "";
  const index = Number(url.searchParams.get("index") ?? "-1");
  if (!ID_PATTERN.test(uploadId) || !Number.isInteger(index)) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  // one chunk at a time in memory (≤ 8 MB) — never the whole file
  let buf: Buffer;
  try {
    buf = Buffer.from(await req.arrayBuffer());
  } catch {
    return Response.json({ error: "تعذّرت قراءة الجزء" }, { status: 400 });
  }
  if (buf.length > CHUNK_SIZE) {
    return Response.json({ error: "الجزء أكبر من المسموح" }, { status: 413 });
  }

  const result = await savePart(uploadId, index, buf);
  if (!result.ok) {
    const status = /غير موجودة/.test(result.reason)
      ? 410
      : /غير مطابق|غير صالح/.test(result.reason)
        ? 400
        : 500;
    return Response.json({ error: result.reason }, { status });
  }
  return Response.json({ ok: true, index });
}
