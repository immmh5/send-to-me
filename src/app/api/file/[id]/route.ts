import { Readable } from "node:stream";
import { isAuthed } from "@/lib/auth";
import { getDriver, thumbKey } from "@/lib/storage";
import { findFile } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return Response.json({ error: "الملف غير موجود" }, { status: 404 });
}

function disposition(download: boolean, name: string): string {
  const encoded = encodeURIComponent(name).replace(/'/g, "%27");
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const IMMUTABLE = "private, max-age=31536000, immutable";

function toWeb(body: Readable): ReadableStream {
  return Readable.toWeb(body) as unknown as ReadableStream;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed(req))) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) return notFound();

  const found = await findFile(id);
  if (!found) return notFound();

  const url = new URL(req.url);
  const driver = getDriver();

  /* --- fast WebP thumbnail for image feeds --- */
  if (url.searchParams.get("thumb") === "1") {
    const thumb = await driver.get(thumbKey(id));
    if (thumb) {
      return new Response(toWeb(thumb.body), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(thumb.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": IMMUTABLE,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    /* no thumbnail — fall through to the original */
  }

  const download = url.searchParams.get("download") === "1";

  /* --- resolve total size with a cheap full-range probe --- */
  const head = await driver.get(id);
  if (!head) return notFound();
  head.body.destroy();
  const size = head.size;

  const headers = new Headers({
    "Content-Type": found.file.mime || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": IMMUTABLE,
    "Content-Disposition": disposition(download, found.file.name),
    "X-Content-Type-Options": "nosniff",
  });

  if (size === 0) {
    headers.set("Content-Length", "0");
    return new Response(null, { status: 200, headers });
  }

  let start = 0;
  let end = size - 1;
  let status = 200;

  /* --- HTTP Range (smooth seeking for audio/video) --- */
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/i.exec(range);
    if (m) {
      const s = m[1] === "" ? NaN : parseInt(m[1], 10);
      const e = m[2] === "" ? NaN : parseInt(m[2], 10);
      if (!Number.isNaN(s) && s < size) {
        start = s;
        end = Number.isNaN(e) ? size - 1 : Math.min(e, size - 1);
        status = 206;
      } else if (Number.isNaN(s) && !Number.isNaN(e) && e > 0) {
        start = Math.max(0, size - e);
        end = size - 1;
        status = 206;
      }
    }
    if (status === 206) {
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
  }

  const obj = await driver.get(id, { start, end });
  if (!obj) return notFound();

  headers.set("Content-Length", String(end - start + 1));
  return new Response(toWeb(obj.body), { status, headers });
}
