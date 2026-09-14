"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  Download,
  File as FileGlyph,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Trash2,
} from "lucide-react";
import {
  absoluteTime,
  arNum,
  fileUrl,
  formatBytes,
  kindOf,
  relativeTime,
} from "@/lib/format";
import type { Item, StoredFile } from "@/lib/types";

const URL_SPLIT = /(https?:\/\/[^\s<>"'()]+|www\.[^\s<>"'()]+)/g;
const LINKISH = /^(https?:\/\/|www\.)/i;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_SPLIT);
  return (
    <>
      {parts.map((p, i) =>
        LINKISH.test(p) ? (
          <a
            key={i}
            href={p.startsWith("http") ? p : `https://${p}`}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-gold-300 underline decoration-gold-300/40 underline-offset-4 transition hover:decoration-gold-300"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function iconFor(file: StoredFile) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const kind = kindOf(file.mime);
  if (kind === "image") return FileImage;
  if (kind === "video") return FileVideo;
  if (kind === "audio") return FileAudio;
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) return FileArchive;
  if (["pdf", "txt", "md", "doc", "docx", "rtf", "odt"].includes(ext))
    return FileText;
  return FileGlyph;
}

export function typeLabel(item: Item): string {
  const n = item.files.length;
  if (n === 0) return "نص";
  const kinds = new Set(item.files.map((f) => kindOf(f.mime)));
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (k === "image") return n > 1 ? `${arNum(n)} صور` : "صورة";
    if (k === "video") return n > 1 ? `${arNum(n)} فيديو` : "فيديو";
    if (k === "audio") return "صوت";
  }
  return n > 1 ? `${arNum(n)} ملفات` : "ملف";
}

type Props = {
  item: Item;
  index: number;
  onDelete: (id: string) => void;
  onOpenLightbox: (images: StoredFile[], index: number) => void;
};

export default function ItemCard({
  item,
  index,
  onDelete,
  onOpenLightbox,
}: Props) {
  const images = item.files.filter((f) => kindOf(f.mime) === "image");
  const videos = item.files.filter((f) => kindOf(f.mime) === "video");
  const audios = item.files.filter((f) => kindOf(f.mime) === "audio");
  const others = item.files.filter((f) => kindOf(f.mime) === "other");

  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const copy = async () => {
    if (!item.text) return;
    try {
      await navigator.clipboard.writeText(item.text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = item.text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const imageCols =
    images.length === 1
      ? "grid-cols-1"
      : images.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.16 } }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 27,
        delay: Math.min(index * 0.045, 0.35),
      }}
      className="card group overflow-hidden rounded-3xl p-4 sm:p-5"
    >
      {/* meta row */}
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full border border-white/10 bg-ink-800/80 px-2.5 py-1 text-[10px] font-bold text-gold-300/90">
          {typeLabel(item)}
        </span>
        <span
          className="text-[11px] text-mist-500"
          title={absoluteTime(item.createdAt)}
        >
          {relativeTime(item.createdAt)}
        </span>
        <div className="flex-1" />

        {item.text && (
          <button
            type="button"
            onClick={copy}
            title="نسخ النص"
            aria-label="نسخ النص"
            className="grid size-8 place-items-center rounded-lg text-mist-500 transition hover:bg-white/5 hover:text-gold-300 max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            {copied ? (
              <Check className="size-4 text-teal-300" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            confirming ? onDelete(item.id) : setConfirming(true)
          }
          title={confirming ? "اضغط مرة أخرى للتأكيد" : "حذف"}
          aria-label="حذف العنصر"
          className={`grid h-8 place-items-center rounded-lg px-1.5 text-xs font-bold transition max-sm:opacity-100 sm:group-hover:opacity-100 ${
            confirming
              ? "gap-1 bg-ember-500/15 text-ember-300 sm:opacity-100"
              : "text-mist-500 hover:bg-white/5 hover:text-ember-400 sm:opacity-0"
          }`}
        >
          <Trash2 className="size-4" />
          {confirming && <span>تأكيد؟</span>}
        </button>
      </div>

      {/* text */}
      {item.text && (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-8 text-paper-100">
          <Linkified text={item.text} />
        </p>
      )}

      {/* images */}
      {images.length > 0 && (
        <div className={`mt-3 grid ${imageCols} gap-2`}>
          {images.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpenLightbox(images, i)}
              className={`group/img relative overflow-hidden rounded-2xl border border-white/5 bg-ink-800 ${
                images.length === 1 ? "max-h-[420px]" : "aspect-[4/3] sm:aspect-square"
              }`}
              aria-label={`فتح ${f.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(f.id, false, true)}
                alt={f.name}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition duration-500 group-hover/img:scale-[1.04]"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/40 to-transparent opacity-0 transition group-hover/img:opacity-100" />
            </button>
          ))}
        </div>
      )}

      {/* videos */}
      {videos.map((f) => (
        <div key={f.id} className="mt-3">
          <video
            controls
            playsInline
            preload="metadata"
            src={fileUrl(f.id)}
            className="max-h-[420px] w-full rounded-2xl border border-white/5 bg-black"
          />
          <Caption file={f} />
        </div>
      ))}

      {/* audio */}
      {audios.map((f) => {
        const Icon = iconFor(f);
        return (
          <div
            key={f.id}
            className="mt-3 rounded-2xl border border-white/5 bg-ink-800/70 p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-xs text-mist-400">
              <Icon className="size-4 text-teal-300" />
              <span className="truncate font-medium text-paper-200">{f.name}</span>
              <span className="shrink-0">{formatBytes(f.size)}</span>
            </div>
            <audio controls preload="metadata" src={fileUrl(f.id)} className="h-9 w-full" />
          </div>
        );
      })}

      {/* other files */}
      {others.length > 0 && (
        <ul className="mt-3 space-y-2">
          {others.map((f) => {
            const Icon = iconFor(f);
            return (
              <li key={f.id}>
                <a
                  href={fileUrl(f.id, true)}
                  download
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-ink-800/70 px-3.5 py-3 transition hover:border-gold-400/25 hover:bg-ink-750"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-700 text-gold-300">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-paper-100">
                      {f.name}
                    </span>
                    <span className="text-[11px] text-mist-500">
                      {formatBytes(f.size)}
                    </span>
                  </span>
                  <Download className="size-4 shrink-0 text-mist-500" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </motion.article>
  );
}

function Caption({ file }: { file: StoredFile }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 px-1 text-[11px] text-mist-500">
      <span className="truncate">{file.name}</span>
      <span className="shrink-0">{formatBytes(file.size)}</span>
      <a
        href={fileUrl(file.id, true)}
        download
        className="mr-auto shrink-0 rounded-md p-1 transition hover:bg-white/5 hover:text-gold-300"
        title="تحميل"
        aria-label={`تحميل ${file.name}`}
      >
        <Download className="size-3.5" />
      </a>
    </div>
  );
}
