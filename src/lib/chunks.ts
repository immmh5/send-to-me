import crypto from "node:crypto";
import { readdir, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { CHUNK_SIZE, ID_PATTERN } from "@/lib/limits";

/**
 * Resumable chunked-upload session manager.
 *
 * A file is uploaded slice-by-slice (≤ 8 MB each) into a temp folder on the
 * server; once every part is present, the parts are streamed — one at a time —
 * straight into the storage driver (MEGA / S3 / disk). Memory stays flat no
 * matter how large the original file is, which is what makes GB-sized uploads
 * possible on small hosts like Render's free tier.
 *
 * Sessions live on local disk (os.tmpdir) + an in-memory index. Abandoned
 * sessions are swept after TTL. Designed for single-instance hosts.
 */

const ROOT = path.join(os.tmpdir(), "sts-chunks");
const TTL_MS = 2 * 60 * 60 * 1000; // 2 h
const MAX_ACTIVE = 12;

export type Manifest = {
  /** upload id — also becomes the final storage object id */
  id: string;
  name: string;
  mime: string;
  size: number;
  totalChunks: number;
  createdAt: number;
};

export class TooManySessionsError extends Error {
  constructor() {
    super("رفعات كثيرة بالتزامن — انتظر اكتمال بعضها ثم أعد المحاولة");
  }
}

const g = globalThis as typeof globalThis & {
  __stsChunkSessions?: Map<string, number>;
  __stsChunkSweepAt?: number;
};
const sessions = (g.__stsChunkSessions ??= new Map<string, number>());

function dirOf(id: string): string {
  return path.join(ROOT, id);
}
function manifestPath(id: string): string {
  return path.join(dirOf(id), "manifest.json");
}
export function partPath(id: string, index: number): string {
  return path.join(dirOf(id), `part-${String(index).padStart(5, "0")}`);
}

/** Removes sessions older than TTL (runs at most once per 10 min). */
export async function sweepStale(): Promise<void> {
  const now = Date.now();
  if ((g.__stsChunkSweepAt ?? 0) > now - 10 * 60 * 1000) return;
  g.__stsChunkSweepAt = now;
  let entries: string[] = [];
  try {
    entries = await readdir(ROOT);
  } catch {
    return; // root doesn't exist yet
  }
  for (const id of entries) {
    if (!ID_PATTERN.test(id)) continue;
    try {
      const info = await stat(dirOf(id));
      if (now - info.mtimeMs > TTL_MS) {
        sessions.delete(id);
        await rm(dirOf(id), { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  }
}

export async function startUpload(
  name: string,
  mime: string,
  size: number,
): Promise<Manifest> {
  await sweepStale();
  if (sessions.size >= MAX_ACTIVE) throw new TooManySessionsError();

  const id = crypto.randomUUID();
  const manifest: Manifest = {
    id,
    name,
    mime,
    size,
    totalChunks: Math.max(1, Math.ceil(size / CHUNK_SIZE)),
    createdAt: Date.now(),
  };
  await mkdir(dirOf(id), { recursive: true });
  await writeFile(manifestPath(id), JSON.stringify(manifest), "utf8");
  sessions.set(id, Date.now());
  return manifest;
}

export async function getManifest(id: string): Promise<Manifest | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    const raw = await readFile(manifestPath(id), "utf8");
    const m = JSON.parse(raw) as Manifest;
    return typeof m.size === "number" && m.id === id ? m : null;
  } catch {
    return null;
  }
}

/** Exact expected byte size of chunk `index`. */
export function expectedChunkSize(m: Manifest, index: number): number {
  const start = index * CHUNK_SIZE;
  return Math.max(0, Math.min(CHUNK_SIZE, m.size - start));
}

export async function savePart(
  id: string,
  index: number,
  data: Buffer,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const m = await getManifest(id);
  if (!m) return { ok: false, reason: "جلسة الرفع غير موجودة أو انتهت — أعد المحاولة" };
  if (index < 0 || index >= m.totalChunks) {
    return { ok: false, reason: "رقم جزء غير صالح" };
  }
  const expected = expectedChunkSize(m, index);
  if (data.length !== expected) {
    return { ok: false, reason: `حجم الجزء غير مطابق (متوقع ${expected} وصل ${data.length})` };
  }
  await writeFile(partPath(id, index), data);
  sessions.set(id, Date.now());
  return { ok: true };
}

/** Lists received parts with their sizes — used by the client to resume. */
export async function listParts(
  id: string,
): Promise<{ index: number; size: number }[]> {
  const m = await getManifest(id);
  if (!m) return [];
  const out: { index: number; size: number }[] = [];
  try {
    const entries = await readdir(dirOf(id));
    for (const e of entries) {
      const match = /^part-(\d{5})$/.exec(e);
      if (!match) continue;
      const index = parseInt(match[1], 10);
      try {
        const info = await stat(path.join(dirOf(id), e));
        out.push({ index, size: info.size });
      } catch {
        /* skip */
      }
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => a.index - b.index);
}

export async function missingParts(m: Manifest): Promise<number[]> {
  const received = new Map((await listParts(m.id)).map((p) => [p.index, p.size]));
  const missing: number[] = [];
  for (let i = 0; i < m.totalChunks; i++) {
    if (received.get(i) !== expectedChunkSize(m, i)) missing.push(i);
  }
  return missing;
}

/**
 * Streams the assembled file — one ≤8 MB part in memory at a time —
 * straight into the storage driver.
 */
export function assemblyStream(m: Manifest): Readable {
  async function* parts(): AsyncGenerator<Buffer> {
    for (let i = 0; i < m.totalChunks; i++) {
      yield await readFile(partPath(m.id, i));
    }
  }
  return Readable.from(parts());
}

/** Whole file as a Buffer — only call for thumbnails (size ≤ 64 MB). */
export async function assemblyBuffer(m: Manifest): Promise<Buffer> {
  const bufs: Buffer[] = [];
  for (let i = 0; i < m.totalChunks; i++) {
    bufs.push(await readFile(partPath(m.id, i)));
  }
  return Buffer.concat(bufs);
}

export async function discardUpload(id: string): Promise<void> {
  sessions.delete(id);
  if (!ID_PATTERN.test(id)) return;
  await rm(dirOf(id), { recursive: true, force: true }).catch(() => undefined);
}
