"use client";

import type { StoredFile } from "@/lib/types";

/**
 * Client-side resumable chunked uploader.
 *
 * start → parts (8 MB, 3 in parallel, retried) → complete.
 * - Never holds more than a few slices in memory → GB files are fine.
 * - On network failure the caller can simply re-run uploadFileChunked():
 *   the GET resume handshake skips parts already stored on the server.
 */

export class SendError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "SendError";
    this.status = status;
  }
}

type StartResponse = { uploadId: string; chunkSize: number };
type PartInfo = { index: number; size: number };

const CONCURRENCY = 3;
const RETRIES = 3;

async function readError(res: Response, fallback: string): Promise<SendError> {
  try {
    const data = (await res.json()) as { error?: string };
    return new SendError(data.error || fallback, res.status);
  } catch {
    return new SendError(fallback, res.status);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function putPartOnce(
  uploadId: string,
  index: number,
  blob: Blob,
  onBytes: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/upload/part?uploadId=${encodeURIComponent(uploadId)}&index=${index}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      onBytes(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = "فشل رفع جزء من الملف";
      try {
        const data = JSON.parse(xhr.responseText) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* keep fallback */
      }
      reject(new SendError(message, xhr.status));
    };
    xhr.onerror = () => reject(new SendError("انقطع الاتصال أثناء الرفع", 0));
    xhr.send(blob);
  });
}

async function putPart(
  uploadId: string,
  index: number,
  blob: Blob,
  onBytes: (loaded: number) => void,
): Promise<void> {
  let last: SendError = new SendError("تعذّر الرفع");
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      // report this attempt's own bytes only
      await putPartOnce(uploadId, index, blob, onBytes);
      return;
    } catch (err) {
      last = err instanceof SendError ? err : new SendError("تعذّر الرفع");
      if (last.status === 401 || last.status === 410) throw last; // no point retrying
      await sleep(700 * attempt);
    }
  }
  throw last;
}

/**
 * Uploads one File through the chunked pipeline.
 * onProgress receives a fraction 0..1 (weighted by real bytes).
 */
export async function uploadFileChunked(
  file: File,
  onProgress?: (frac: number) => void,
): Promise<StoredFile> {
  /* 1 — open session */
  const startRes = await fetch("/api/upload/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }),
  });
  if (!startRes.ok) {
    throw await readError(startRes, "تعذّر بدء الرفع");
  }
  const { uploadId, chunkSize } = (await startRes.json()) as StartResponse;

  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
  const expected = (i: number) =>
    Math.max(0, Math.min(chunkSize, file.size - i * chunkSize));

  /* 2 — resume handshake: skip parts the server already has */
  let received = new Map<number, number>();
  try {
    const st = await fetch(
      `/api/upload/part?uploadId=${encodeURIComponent(uploadId)}`,
      { cache: "no-store" },
    );
    if (st.ok) {
      const data = (await st.json()) as { received: PartInfo[] };
      received = new Map(data.received.map((p) => [p.index, p.size]));
    }
  } catch {
    /* fresh upload then */
  }

  const queued: number[] = [];
  const state: { loaded: number; done: boolean }[] = [];
  let alreadyDone = 0;
  for (let i = 0; i < totalChunks; i++) {
    const valid = received.get(i) === expected(i);
    state[i] = { loaded: valid ? expected(i) : 0, done: valid };
    if (valid) alreadyDone += expected(i);
    else queued.push(i);
  }

  const report = () => {
    if (!onProgress) return;
    const sum = state.reduce((acc, s) => acc + s.loaded, 0);
    onProgress(Math.min(1, sum / file.size));
  };
  report();

  /* 3 — worker pool over remaining chunks */
  if (queued.length > 0) {
    let cursor = 0;
    const worker = async () => {
      while (cursor < queued.length) {
        const i = queued[cursor++];
        const blob = file.slice(i * chunkSize, i * chunkSize + chunkSize);
        await putPart(uploadId, i, blob, (loaded) => {
          state[i].loaded = loaded;
          report();
        });
        state[i].loaded = expected(i);
        state[i].done = true;
        report();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queued.length) }, worker),
    );
  }
  void alreadyDone;

  /* 4 — finalize: server streams parts into the storage driver */
  const doneRes = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId }),
  });
  if (!doneRes.ok) {
    throw await readError(doneRes, "تعذّر حفظ الملف في التخزين");
  }
  const { file: stored } = (await doneRes.json()) as { file: StoredFile };
  return stored;
}
