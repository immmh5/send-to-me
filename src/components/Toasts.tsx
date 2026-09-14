"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert } from "lucide-react";

export type ToastKind = "ok" | "error";
export type Toast = { id: number; message: string; kind: ToastKind };
export type PushToast = (message: string, kind?: ToastKind) => void;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(1);

  const push: PushToast = useCallback((message, kind = "ok") => {
    const id = seq.current++;
    setToasts((t) => [...t.slice(-3), { id, message, kind }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3400);
  }, []);

  return { toasts, push };
}

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className={`pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-2xl backdrop-blur-xl ${
              t.kind === "error"
                ? "border-ember-400/30 bg-ember-500/15 text-ember-300 shadow-ember-500/10"
                : "border-teal-400/25 bg-teal-400/10 text-teal-300 shadow-teal-400/10"
            }`}
          >
            {t.kind === "error" ? (
              <CircleAlert className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" />
            )}
            <span>{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
