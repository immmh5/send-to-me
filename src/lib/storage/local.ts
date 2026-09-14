import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ObjectData, StorageDriver } from "./index";

function dir(): string {
  // custom dir via env, else statically scoped to the project subfolder
  return process.env.STORAGE_DIR || path.join(process.cwd(), "data", "uploads");
}

/** Disk-backed driver — still perfect for a VPS with persistent storage. */
export class LocalStorageDriver implements StorageDriver {
  readonly kind = "local" as const;

  private resolve(id: string): string {
    // ids are generated uuids / "<uuid>.thumb.webp" — never let a path escape
    if (!/^[0-9a-fA-F-]{6,80}(\.thumb\.webp)?$/.test(id)) {
      throw new Error(`invalid storage id: ${id}`);
    }
    if (process.env.STORAGE_DIR) return path.join(process.env.STORAGE_DIR, id);
    return path.join(process.cwd(), "data", "uploads", id);
  }

  async put(id: string, source: Buffer | Readable): Promise<void> {
    // `size` is irrelevant on disk — the stream itself knows when it ends
    await mkdir(dir(), { recursive: true });
    const dest = this.resolve(id);
    if (Buffer.isBuffer(source)) {
      await writeFile(dest, source);
    } else {
      await pipeline(source, createWriteStream(dest));
    }
  }

  async get(
    id: string,
    range?: { start: number; end: number },
  ): Promise<ObjectData | null> {
    let dest: string;
    try {
      dest = this.resolve(id);
    } catch {
      return null;
    }
    let size: number;
    try {
      size = (await stat(dest)).size;
    } catch {
      return null;
    }
    const body = createReadStream(dest, {
      start: range ? Math.min(range.start, Math.max(size - 1, 0)) : 0,
      end: range ? Math.min(range.end, size - 1) : size - 1,
    });
    return { size, body };
  }

  async delete(id: string): Promise<void> {
    try {
      await unlink(this.resolve(id));
    } catch {
      /* already gone — fine */
    }
  }
}
