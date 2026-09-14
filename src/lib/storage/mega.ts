import type { Readable, Writable } from "node:stream";
import { Storage as MegaStorageClass } from "megajs";
import type { MutableFile, Storage as MegaStorage } from "megajs";
import type { ObjectData, StorageDriver } from "./index";

/**
 * MEGA.nz driver — uses a regular MEGA account (free 20 GB) via megajs.
 *
 * Env:
 *   MEGA_EMAIL     account email (required)
 *   MEGA_PASSWORD  account password (required)
 *   MEGA_FOLDER    folder name inside the account (default "send-to-self")
 *
 * Hardened against MEGA's anti-abuse system:
 *  - The login session is cached for the whole process lifetime
 *    (one login per cold start, not per request).
 *  - A login failure arms a CIRCUIT BREAKER: no fresh login attempts for a
 *    cooldown window. Repeated email+password logins from a datacenter IP are
 *    exactly what makes MEGA lock accounts ("malicious login detected").
 *  - Errors are classified into actionable Arabic messages (locked account,
 *    full storage, exhausted transfer quota, expired session, …).
 *
 * Tip: keeping the host awake (ping /api/health every ~10 min) means fewer
 * cold starts → fewer logins → less lock risk. For zero lock risk, switch
 * STORAGE_DRIVER to "s3" (e.g. Cloudflare R2) — API keys, no account logins.
 */

export function isMegaConfigured(): boolean {
  return Boolean(process.env.MEGA_EMAIL && process.env.MEGA_PASSWORD);
}

const FOLDER_NAME = process.env.MEGA_FOLDER || "send-to-self";
const ID_PATTERN = /^[0-9a-fA-F-]{6,80}(\.thumb\.webp)?$/;
const LOGIN_COOLDOWN_MS = 5 * 60 * 1000;

type UploadHandle = Writable & { complete: Promise<MutableFile> };

export class MegaDriverError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MegaDriverError";
    this.code = code;
  }
}

type MegaGlobal = typeof globalThis & {
  __stsMegaStorage?: Promise<MegaStorage> | null;
  __stsMegaFolder?: Promise<MutableFile> | null;
  __stsMegaBlockedUntil?: number;
  __stsMegaLastError?: string | null;
  __stsMegaReady?: boolean;
};

const g = globalThis as MegaGlobal;

/* ---------------- error classification ---------------- */

function textOf(err: unknown): string {
  if (err instanceof Error) return `${err.message} ${err.name}`;
  return String(err);
}

/** Maps raw megajs errors to actionable Arabic messages. */
function classify(err: unknown): MegaDriverError {
  const t = textOf(err);
  if (/EBLOCKED|-16\b|locked/i.test(t)) {
    return new MegaDriverError(
      "blocked",
      "حساب MEGA مقفل حمايةً — سوِ إعادة تعيين كلمة المرور من إيميلك، ثم حدّث قيمة MEGA_PASSWORD في صفحة Environment على الاستضافة",
    );
  }
  if (/EACCESS|-11\b/.test(t) && !/session/i.test(t)) {
    return new MegaDriverError(
      "credentials",
      "بيانات دخول MEGA غير صحيحة — راجع MEGA_EMAIL و MEGA_PASSWORD في إعدادات الاستضافة",
    );
  }
  if (/EOVERQUOTA|-17\b/i.test(t)) {
    return new MegaDriverError(
      "storage-full",
      "مساحة حساب MEGA ممتلئة — احذف ملفات قديمة من الحساب، أو انتقل إلى تخزين S3/R2",
    );
  }
  if (/EAGAIN|-18\b/i.test(t)) {
    return new MegaDriverError(
      "quota",
      "كوتة نقل MEGA المجانية استُنفدت مؤقتًا (نحو ٥ جيجابايت كل ٦ ساعات) — أعد المحاولة لاحقًا، أو فعّل STORAGE_DRIVER=s3 مع Cloudflare R2",
    );
  }
  if (/ESID|-9\b|session expired|sessionid/i.test(t)) {
    return new MegaDriverError("session", "انتهت جلسة MEGA — تُعاد المحاولة تلقائيًا");
  }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|network|socket/i.test(t)) {
    return new MegaDriverError(
      "network",
      "تعذّر الوصول إلى خوادم MEGA — مشكلة شبكة مؤقتة، أعد المحاولة",
    );
  }
  return new MegaDriverError("unknown", `خطأ من MEGA: ${t.slice(0, 160)}`);
}

function isSessionError(err: unknown): boolean {
  const t = textOf(err);
  return /ESID|-9\b|session expired|sessionid/i.test(t);
}

/* ---------------- status (for /api/health) ---------------- */

export type MegaStatus = {
  state: "connecting" | "ready" | "cooldown" | "idle";
  message: string | null;
  cooldownSec: number;
};

export function megaStatus(): MegaStatus {
  const blockedUntil = g.__stsMegaBlockedUntil ?? 0;
  const cooldownSec = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
  return {
    state: g.__stsMegaReady
      ? "ready"
      : cooldownSec > 0
        ? "cooldown"
        : g.__stsMegaStorage
          ? "connecting"
          : "idle",
    message: g.__stsMegaLastError ?? null,
    cooldownSec,
  };
}

/* ---------------- session management ---------------- */

function login(): Promise<MegaStorage> {
  const blockedUntil = g.__stsMegaBlockedUntil ?? 0;
  if (blockedUntil > Date.now()) {
    const mins = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 60000));
    return Promise.reject(
      new MegaDriverError(
        "cooldown",
        g.__stsMegaLastError ??
          `محاولات دخول MEGA متوقفة مؤقتًا — أعد المحاولة بعد ${mins} دقيقة`,
      ),
    );
  }
  if (g.__stsMegaStorage) return g.__stsMegaStorage;

  const email = process.env.MEGA_EMAIL as string;
  const password = process.env.MEGA_PASSWORD as string;
  const storage = new MegaStorageClass({
    email,
    password,
    keepalive: true,
    userAgent: "send-to-self/1.0 (+mega.nz)",
  });

  g.__stsMegaStorage = storage.ready
    .then((ready) => {
      g.__stsMegaReady = true;
      g.__stsMegaLastError = null;
      console.info(`[storage] MEGA login ok (${(ready as MegaStorage).email ?? email})`);
      return ready as unknown as MegaStorage;
    })
    .catch((err) => {
      g.__stsMegaStorage = null;
      g.__stsMegaReady = false;
      const classified = classify(err);
      g.__stsMegaLastError = classified.message;
      /* circuit breaker — repeated logins = account lock risk */
      g.__stsMegaBlockedUntil = Date.now() + LOGIN_COOLDOWN_MS;
      console.error(`[storage] MEGA login failed (${classified.code}): ${classified.message}`);
      void storage.close().catch(() => undefined);
      throw classified;
    });

  return g.__stsMegaStorage;
}

function relogin(): Promise<MegaStorage> {
  // honour the cooldown even for forced relogins
  if ((g.__stsMegaBlockedUntil ?? 0) > Date.now()) {
    return login(); // rejects with the cooldown error
  }
  g.__stsMegaStorage = null;
  g.__stsMegaFolder = null;
  g.__stsMegaReady = false;
  return login();
}

function findFolder(storage: MegaStorage): Promise<MutableFile> {
  if (g.__stsMegaFolder) return g.__stsMegaFolder;
  g.__stsMegaFolder = (async (): Promise<MutableFile> => {
    const existing = storage.root.children?.find(
      (c) => c.directory && c.name === FOLDER_NAME,
    );
    if (existing) return existing;
    console.info(`[storage] creating MEGA folder "${FOLDER_NAME}"`);
    return storage.mkdir(FOLDER_NAME);
  })().catch((err: unknown) => {
    g.__stsMegaFolder = null;
    throw classify(err);
  });
  return g.__stsMegaFolder;
}

function findNode(folder: MutableFile, id: string): MutableFile | undefined {
  return folder.children?.find((f) => !f.directory && f.name === id);
}

/* ---------------- driver ---------------- */

export class MegaStorageDriver implements StorageDriver {
  readonly kind = "mega" as const;

  /** Runs an op against MEGA, retrying once with a fresh login on session expiry. */
  private async withFolder<T>(
    fn: (folder: MutableFile, storage: MegaStorage) => Promise<T>,
  ): Promise<T> {
    const storage = await login();
    try {
      return await fn(await findFolder(storage), storage);
    } catch (err) {
      if (!isSessionError(err)) {
        throw err instanceof MegaDriverError ? err : classify(err);
      }
      g.__stsMegaReady = false;
      const fresh = await relogin();
      return fn(await findFolder(fresh), fresh);
    }
  }

  async put(
    id: string,
    source: Buffer | Readable,
    _contentType: string,
    size?: number,
  ): Promise<void> {
    if (!ID_PATTERN.test(id)) throw new Error(`invalid storage id: ${id}`);
    await this.withFolder(async (folder) => {
      const opts: { name: string; size?: number } = { name: id };
      if (typeof size === "number" && size >= 0) opts.size = size;
      const handle = folder.upload(
        opts,
        Buffer.isBuffer(source) ? source : undefined,
      ) as unknown as UploadHandle;
      if (!Buffer.isBuffer(source)) source.pipe(handle);
      await handle.complete;
    });
  }

  async get(
    id: string,
    range?: { start: number; end: number },
  ): Promise<ObjectData | null> {
    if (!ID_PATTERN.test(id)) return null;
    return this.withFolder(async (folder) => {
      const node = findNode(folder, id);
      if (!node) return null;
      let size = node.size;
      if (typeof size !== "number") {
        await node.loadAttributes();
        size = node.size;
      }
      // megajs uses inclusive [start, end], exactly like HTTP Range
      const body = node.download(range ? { start: range.start, end: range.end } : {});
      return { size: typeof size === "number" ? size : 0, body };
    });
  }

  async delete(id: string): Promise<void> {
    if (!ID_PATTERN.test(id)) return;
    try {
      await this.withFolder(async (folder) => {
        const node = findNode(folder, id);
        if (node) await node.delete(true);
      });
    } catch {
      /* already gone — fine */
    }
  }
}
