/** Arabic-Indic digits number formatting (٣٫٥ etc.) */
export function arNum(n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString("ar-EG", opts);
}

const BYTE_UNITS = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "٠ بايت";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const str =
    unit === 0
      ? arNum(Math.round(value))
      : value.toLocaleString("ar-EG", { maximumFractionDigits: 1 });
  return `${str} ${BYTE_UNITS[unit]}`;
}

const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
const dtf = new Intl.DateTimeFormat("ar", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  if (abs < 45_000) return "الآن";
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(diff / 3_600_000);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(diff / 86_400_000);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  return dtf.format(t);
}

export function absoluteTime(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : dtf.format(t);
}

export type FileKind = "image" | "video" | "audio" | "other";

export function kindOf(mime: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}

export function fileUrl(id: string, download = false, thumb = false): string {
  if (thumb) return `/api/file/${encodeURIComponent(id)}?thumb=1`;
  return `/api/file/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}
