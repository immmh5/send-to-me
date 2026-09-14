import type { Readable } from "node:stream";
import { LocalStorageDriver } from "./local";
import { MegaStorageDriver, isMegaConfigured } from "./mega";
import { S3StorageDriver, isS3Configured } from "./s3";

/**
 * Every stored object is addressed by a plain id:
 *   <fileId>                original bytes
 *   <fileId>.thumb.webp     generated thumbnail (images only)
 * The driver decides where those ids physically live.
 */
export function thumbKey(fileId: string): string {
  return `${fileId}.thumb.webp`;
}

export type ObjectData = {
  /** total object size in bytes (ignores the requested range) */
  size: number;
  body: Readable;
};

export interface StorageDriver {
  readonly kind: "local" | "s3" | "mega";
  /**
   * Stores an object. `size` (total bytes) lets streaming drivers avoid
   * buffering the whole payload — always pass it when known.
   */
  put(
    id: string,
    source: Buffer | Readable,
    contentType: string,
    size?: number,
  ): Promise<void>;
  get(
    id: string,
    range?: { start: number; end: number },
  ): Promise<ObjectData | null>;
  delete(id: string): Promise<void>;
}

export type { StorageDriver as Driver };

const g = globalThis as typeof globalThis & {
  __stsStorageDriver?: StorageDriver | null;
};

/**
 * Driver selection (first match wins):
 *  1. STORAGE_DRIVER=mega|s3|local   explicit override
 *  2. MEGA_EMAIL + MEGA_PASSWORD     → MEGA.nz (free 20 GB account)
 *  3. S3_BUCKET + S3 keys            → S3-compatible (AWS / R2 / GCS / MinIO / Supabase)
 *  4. fallback                       → local disk (VPS fine, serverless ephemeral)
 */
export function getDriver(): StorageDriver {
  if (g.__stsStorageDriver) return g.__stsStorageDriver;

  const forced = (process.env.STORAGE_DRIVER || "").toLowerCase();
  let driver: StorageDriver;

  if (forced === "mega" || (!forced && isMegaConfigured())) {
    if (!isMegaConfigured()) {
      console.warn("[storage] STORAGE_DRIVER=mega but MEGA_EMAIL/MEGA_PASSWORD are missing");
    }
    driver = new MegaStorageDriver();
    console.info(`[storage] using MEGA driver (folder=${process.env.MEGA_FOLDER || "send-to-self"})`);
  } else if (forced === "s3" || (!forced && isS3Configured())) {
    const s3 = new S3StorageDriver();
    console.info(
      `[storage] using S3-compatible driver (bucket=${s3.bucket}, endpoint=${s3.endpoint ?? "aws"})`,
    );
    driver = s3;
  } else {
    if (forced && forced !== "local") {
      console.warn(`[storage] unknown STORAGE_DRIVER="${forced}" — using local disk`);
    }
    if (!forced) {
      console.warn(
        "[storage] no cloud storage env found (MEGA_*/S3_*) — using local disk. " +
          "On serverless hosts local files are wiped on restart.",
      );
    }
    driver = new LocalStorageDriver();
  }

  g.__stsStorageDriver = driver;
  return driver;
}
