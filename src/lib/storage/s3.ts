import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { ObjectData, StorageDriver } from "./index";

/**
 * S3-compatible cloud storage driver.
 * Works with:
 *   - AWS S3            (S3_REGION + default endpoint)
 *   - Cloudflare R2     (S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com)
 *   - Firebase/GCS      (S3_ENDPOINT=https://storage.googleapis.com + HMAC keys)
 *   - Supabase Storage  (S3_ENDPOINT from project settings, path style)
 *   - MinIO             (S3_ENDPOINT=http://host:9000)
 *
 * Env:
 *   S3_BUCKET             (required)
 *   S3_ACCESS_KEY_ID      (required)
 *   S3_SECRET_ACCESS_KEY  (required)
 *   S3_REGION             (default "auto")
 *   S3_ENDPOINT           (optional — enables path-style for non-AWS hosts)
 *   S3_PREFIX             (default "uploads/")
 */
export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

export class S3StorageDriver implements StorageDriver {
  readonly kind = "s3" as const;
  readonly bucket: string;
  readonly endpoint?: string;
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET as string;
    this.endpoint = process.env.S3_ENDPOINT || undefined;
    this.prefix = (process.env.S3_PREFIX || "uploads/").replace(/^\//, "");
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: this.endpoint,
      forcePathStyle: Boolean(this.endpoint),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
      },
    });
  }

  private key(id: string): string {
    if (!/^[0-9a-fA-F-]{6,80}(\.thumb\.webp)?$/.test(id)) {
      throw new Error(`invalid storage id: ${id}`);
    }
    return `${this.prefix}${id}`;
  }

  async put(
    id: string,
    source: Buffer | Readable,
    contentType: string,
  ): Promise<void> {
    // multipart Upload derives sizes itself — the optional size hint isn't needed
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: this.key(id),
        Body: source,
        ContentType: contentType,
        CacheControl: "private, max-age=31536000, immutable",
      },
      // multipart for large files — keeps memory flat even for 200MB uploads
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await upload.done();
  }

  async get(
    id: string,
    range?: { start: number; end: number },
  ): Promise<ObjectData | null> {
    const Key = this.key(id);
    let size: number;
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key }),
      );
      size = head.ContentLength ?? 0;
    } catch {
      return null;
    }
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    if (!res.Body) return null;
    return { size, body: res.Body as unknown as Readable };
  }

  async delete(id: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(id) }),
      );
    } catch {
      /* already gone — fine */
    }
  }
}
