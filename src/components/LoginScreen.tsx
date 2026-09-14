"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, LockKeyhole, Send, Sparkles } from "lucide-react";

type Props = {
  isDefault: boolean;
  onSuccess: () => void;
};

export default function LoginScreen({ isDefault, onSuccess }: Props) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        onSuccess();
        return;
      }
      const data = (await r.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "تعذّر الدخول");
      setShake((s) => s + 1);
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setShake((s) => s + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 py-12"
    >
      <div className="w-full max-w-sm text-center">
        {/* brand mark */}
        <div className="mx-auto mb-7 grid size-16 animate-float-slow place-items-center rounded-[1.35rem] bg-gradient-to-br from-gold-300 via-gold-400 to-ember-500 text-ink-900 shadow-[0_16px_56px_-12px] shadow-gold-500/50">
          <Send className="size-7 -scale-x-100" strokeWidth={2.2} />
        </div>

        <h1 className="font-brand text-[2.9rem] leading-tight text-paper-50">
          أرسل لنفسي
        </h1>
        <p className="mt-3 text-sm leading-8 text-mist-400">
          نصوص، صور، ملفات، فيديو وصوت —
          <br />
          من أي جهاز، إلى صندوق واحد.
        </p>

        <motion.div
          key={shake}
          animate={shake > 0 ? { x: [0, -12, 12, -7, 7, 0] } : { x: 0 }}
          transition={{ duration: 0.42 }}
        >
          <form onSubmit={submit} className="card mt-9 rounded-3xl p-5">
            <label
              htmlFor="password"
              className="mb-3 block text-right text-xs font-semibold text-mist-400"
            >
              كلمة المرور
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-mist-500" />
              <input
                id="password"
                autoFocus
                autoComplete="current-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••"
                className="w-full rounded-2xl border border-white/10 bg-ink-800/80 py-3.5 pl-12 pr-12 text-center text-lg tracking-[0.25em] text-paper-100 placeholder:text-mist-600 focus:border-gold-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-mist-500 transition hover:bg-white/5 hover:text-paper-200"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {error && (
              <p className="mt-3 text-sm font-medium text-ember-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="mt-5 w-full rounded-2xl bg-gradient-to-l from-gold-300 to-gold-500 py-3.5 text-[15px] font-bold text-ink-900 shadow-[0_10px_36px_-10px] shadow-gold-500/60 transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="mx-auto size-5 animate-spin" />
              ) : (
                "دخول"
              )}
            </button>
          </form>
        </motion.div>

        {isDefault && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-gold-400/25 bg-gold-400/[0.07] px-4 py-3 text-xs leading-6 text-gold-200">
            <Sparkles className="size-4 shrink-0" />
            <span>
              كلمة المرور الافتراضية:{" "}
              <code className="rounded bg-ink-800 px-1.5 py-0.5 font-bold tracking-widest text-gold-300">
                12345
              </code>{" "}
              — غيّرها من الداخل
            </span>
          </div>
        )}

        <p className="mt-10 text-[11px] text-mist-600">
          بدون حسابات · كلمة مرور واحدة · ملفاتك محفوظة لك وحدك
        </p>
      </div>
    </motion.div>
  );
}
