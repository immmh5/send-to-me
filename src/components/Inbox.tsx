"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Inbox as InboxGlyph,
  KeyRound,
  Loader2,
  LogOut,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import Composer from "./Composer";
import ItemCard from "./ItemCard";
import Lightbox from "./Lightbox";
import PasswordModal from "./PasswordModal";
import StorageBadge from "./StorageBadge";
import { ToastStack, useToasts } from "./Toasts";
import { arNum } from "@/lib/format";
import type { Item, StoredFile } from "@/lib/types";

type Props = {
  isDefault: boolean;
  onDefaultChanged: () => void;
  onLoggedOut: () => void;
};

function itemsWord(n: number): string {
  if (n === 1) return "عنصر";
  if (n === 2) return "عنصران";
  if (n >= 3 && n <= 10) return "عناصر";
  return "عنصرًا";
}

export default function Inbox({ isDefault, onDefaultChanged, onLoggedOut }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busyClear, setBusyClear] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: StoredFile[];
    index: number;
  } | null>(null);
  const { toasts, push } = useToasts();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/items", { cache: "no-store" });
      if (r.status === 401) {
        onLoggedOut();
        return;
      }
      if (r.ok) {
        const data = (await r.json()) as { items: Item[] };
        setItems((prev) =>
          JSON.stringify(prev) === JSON.stringify(data.items) ? prev : data.items,
        );
      }
    } catch {
      /* شبكة متقطعة — نحتفظ بالبيانات الحالية */
    } finally {
      setLoading(false);
    }
  }, [onLoggedOut]);

  useEffect(() => {
    void load();

    /* instant push updates: any send/delete on any device refreshes all others */
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/events");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type?: string };
          if (data.type === "changed") void load();
        } catch {
          /* ignore malformed events */
        }
      };
    } catch {
      /* SSE unsupported — the polling below still keeps everything in sync */
    }

    /* safety net: light polling so nothing ever goes stale */
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    const onWake = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      es?.close();
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [load]);

  const onSent = useCallback((item: Item) => {
    setItems((prev) => [item, ...prev]);
  }, []);

  const onDelete = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        const r = await fetch(`/api/items/${id}`, { method: "DELETE" });
        if (r.status === 401) {
          onLoggedOut();
          return;
        }
        if (!r.ok) {
          push("تعذّر الحذف", "error");
          void load();
          return;
        }
        push("حُذف من صندوقك");
      } catch {
        push("تعذّر الحذف", "error");
        void load();
      }
    },
    [load, onLoggedOut, push],
  );

  const clearAll = async () => {
    setBusyClear(true);
    try {
      const r = await fetch("/api/items", { method: "DELETE" });
      if (r.status === 401) {
        onLoggedOut();
        return;
      }
      if (!r.ok) throw new Error();
      setItems([]);
      setClearOpen(false);
      push("مُسح كل شيء");
    } catch {
      push("تعذّر المسح", "error");
    } finally {
      setBusyClear(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      onLoggedOut();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35 }}
      className="relative z-10"
    >
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-900/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-3">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 via-gold-400 to-ember-500 text-ink-900 shadow-[0_6px_24px_-6px] shadow-gold-500/50">
            <Send className="size-4 -scale-x-100" strokeWidth={2.4} />
          </div>
          <span className="pt-0.5 font-brand text-xl leading-none text-paper-50">
            أرسل لنفسي
          </span>

          <div className="flex-1" />

          {isDefault && (
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              className="hidden items-center gap-1.5 rounded-full border border-gold-400/30 bg-gold-400/10 px-3 py-1.5 text-[11px] font-bold text-gold-300 transition hover:bg-gold-400/20 sm:flex"
            >
              <ShieldAlert className="size-3.5" />
              كلمة المرور الافتراضية — غيّرها
            </button>
          )}

          <IconButton title="تغيير كلمة المرور" onClick={() => setPwOpen(true)}>
            <KeyRound className="size-4" />
          </IconButton>
          <IconButton
            title="مسح كل شيء"
            onClick={() => setClearOpen(true)}
            disabled={items.length === 0}
          >
            <Trash2 className="size-4" />
          </IconButton>
          <IconButton title="تسجيل الخروج" onClick={() => void logout()}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:pt-8">
        <Composer onSent={onSent} onUnauthorized={onLoggedOut} push={push} />

        {/* feed header */}
        <div className="mb-4 mt-9 flex items-end justify-between gap-2 px-1">
          <h2 className="text-sm font-bold text-paper-200">صندوقك</h2>
          <div className="flex items-center gap-2">
            <StorageBadge />
            <span className="text-[11px] text-mist-500">
              {loading
                ? "…"
                : items.length === 0
                  ? "فارغ"
                  : `${arNum(items.length)} ${itemsWord(items.length)}`}
            </span>
          </div>
        </div>

        {/* feed */}
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-3xl border border-white/5 bg-ink-800/60"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center"
          >
            <div className="grid size-14 animate-float-slow place-items-center rounded-2xl bg-ink-800 text-mist-400">
              <InboxGlyph className="size-6" />
            </div>
            <p className="mt-5 font-bold text-paper-200">صندوقك فارغ</p>
            <p className="mt-1.5 max-w-xs text-sm leading-7 text-mist-500">
              أرسل أول نص أو صورة أو ملف أو تسجيل صوتي — وسيظهر هنا فورًا، على
              كل أجهزتك.
            </p>
          </motion.div>
        ) : (
          <motion.ul layout className="space-y-4">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item, i) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  index={i}
                  onDelete={(id) => void onDelete(id)}
                  onOpenLightbox={(images, index) =>
                    setLightbox({ images, index })
                  }
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      {/* clear-all confirm */}
      <AnimatePresence>
        {clearOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="مسح كل شيء"
          >
            <button
              type="button"
              aria-label="إغلاق"
              onClick={() => !busyClear && setClearOpen(false)}
              className="absolute inset-0 bg-ink-950/70 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="card relative w-full max-w-sm rounded-3xl p-6 text-center"
            >
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-ember-500/15 text-ember-400">
                <Trash2 className="size-5" />
              </div>
              <h3 className="text-lg font-bold text-paper-50">مسح كل شيء؟</h3>
              <p className="mt-2 text-sm leading-7 text-mist-400">
                سيُحذف محتوى الصندوق كاملًا ({arNum(items.length)}{" "}
                {itemsWord(items.length)}) نهائيًا — ولا يمكن التراجع.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setClearOpen(false)}
                  disabled={busyClear}
                  className="rounded-2xl border border-white/10 py-3 text-sm font-bold text-paper-200 transition hover:bg-white/5 disabled:opacity-50"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={() => void clearAll()}
                  disabled={busyClear}
                  className="rounded-2xl bg-ember-500 py-3 text-sm font-bold text-paper-50 transition hover:bg-ember-600 active:scale-[0.98] disabled:opacity-60"
                >
                  {busyClear ? (
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  ) : (
                    "مسح نهائي"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* change password */}
      <AnimatePresence>
        {pwOpen && (
          <PasswordModal
            onClose={() => setPwOpen(false)}
            onSuccess={onDefaultChanged}
            push={push}
          />
        )}
      </AnimatePresence>

      {/* image lightbox */}
      <AnimatePresence>
        {lightbox && (
          <Lightbox
            images={lightbox.images}
            index={lightbox.index}
            onNavigate={(index) => setLightbox((lb) => (lb ? { ...lb, index } : lb))}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>

      <ToastStack toasts={toasts} />
    </motion.div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-xl border border-white/10 bg-ink-800/70 text-mist-300 transition hover:border-white/20 hover:text-paper-100 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
