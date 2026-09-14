"use client";

import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { arNum, fileUrl, formatBytes } from "@/lib/format";
import type { StoredFile } from "@/lib/types";

type Props = {
  images: StoredFile[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
};

export default function Lightbox({ images, index, onNavigate, onClose }: Props) {
  const current = images[index];
  const many = images.length > 1;

  const next = useCallback(
    () => onNavigate((index + 1) % images.length),
    [index, images.length, onNavigate],
  );
  const prev = useCallback(
    () => onNavigate((index - 1 + images.length) % images.length),
    [index, images.length, onNavigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowLeft") next();
      else if (many && e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [next, prev, onClose, many]);

  if (!current) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-50 flex flex-col bg-ink-950/88 backdrop-blur-2xl"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="عارض الصور"
    >
      {/* top bar */}
      <div
        className="flex items-center gap-3 px-4 py-3 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-paper-100">
            {current.name}
          </p>
          <p className="text-[11px] text-mist-500">
            {formatBytes(current.size)}
            {many && (
              <>
                {" · "}
                {arNum(index + 1)} من {arNum(images.length)}
              </>
            )}
          </p>
        </div>
        <a
          href={fileUrl(current.id, true)}
          download
          title="تحميل الصورة"
          aria-label="تحميل الصورة"
          className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-mist-300 transition hover:border-gold-400/40 hover:text-gold-300"
        >
          <Download className="size-4.5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          title="إغلاق"
          aria-label="إغلاق"
          className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-mist-300 transition hover:border-ember-400/40 hover:text-ember-300"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* stage */}
      <div className="relative grid flex-1 place-items-center overflow-hidden px-4 pb-6">
        <AnimatePresence mode="wait">
          <motion.img
            key={current.id}
            src={fileUrl(current.id)}
            alt={current.name}
            initial={{ opacity: 0, scale: 0.965 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          />
        </AnimatePresence>

        {many && (
          <>
            <NavButton side="right" label="السابق" onClick={prev}>
              <ChevronRight className="size-6" />
            </NavButton>
            <NavButton side="left" label="التالي" onClick={next}>
              <ChevronLeft className="size-6" />
            </NavButton>
          </>
        )}
      </div>
    </motion.div>
  );
}

function NavButton({
  side,
  label,
  onClick,
  children,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={`absolute top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-ink-800/70 text-paper-100 backdrop-blur-xl transition hover:scale-105 hover:border-gold-400/40 hover:text-gold-300 ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      {children}
    </button>
  );
}
