"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import type { PushToast } from "./Toasts";

type Props = {
  onClose: () => void;
  onSuccess: () => void;
  push: PushToast;
};

export default function PasswordModal({ onClose, onSuccess, push }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next.length < 4) {
      setError("كلمة المرور الجديدة قصيرة — ٤ أحرف على الأقل");
      return;
    }
    if (next !== confirm) {
      setError("الكلمتان الجديدتان غير متطابقتين");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      if (r.ok) {
        push("تم تغيير كلمة المرور");
        onSuccess();
        onClose();
        return;
      }
      const data = (await r.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "تعذّر التغيير");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-2xl border border-white/10 bg-ink-800/80 px-4 py-3 text-sm text-paper-100 placeholder:text-mist-600 focus:border-gold-400/50 focus:outline-none";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تغيير كلمة المرور"
    >
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
      />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="card relative w-full max-w-sm rounded-3xl p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-gold-400/15 text-gold-300">
            <KeyRound className="size-5" />
          </span>
          <div className="flex-1">
            <h3 className="text-base font-bold text-paper-50">
              تغيير كلمة المرور
            </h3>
            <p className="text-xs text-mist-500">
              من يعرف الكلمة الجديدة يدخل الصندوق
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid size-9 place-items-center rounded-xl text-mist-500 transition hover:bg-white/5 hover:text-paper-100"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            type={show ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="كلمة المرور الحالية"
            autoComplete="current-password"
            autoFocus
            className={field}
          />
          <input
            type={show ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="كلمة المرور الجديدة"
            autoComplete="new-password"
            className={field}
          />
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="تأكيد كلمة المرور الجديدة"
            autoComplete="new-password"
            className={field}
          />
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-mist-400">
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            className="size-4 accent-gold-500"
          />
          <span className="flex items-center gap-1.5">
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            إظهار الكلمات
          </span>
        </label>

        {error && (
          <p className="mt-3 text-sm font-medium text-ember-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="mt-5 w-full rounded-2xl bg-gradient-to-l from-gold-300 to-gold-500 py-3 text-sm font-bold text-ink-900 shadow-[0_8px_30px_-8px] shadow-gold-500/50 transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="mx-auto size-4 animate-spin" /> : "حفظ التغيير"}
        </button>
      </motion.form>
    </motion.div>
  );
}
