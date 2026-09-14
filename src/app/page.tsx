"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send } from "lucide-react";
import Background from "@/components/Background";
import Inbox from "@/components/Inbox";
import LoginScreen from "@/components/LoginScreen";
import type { SessionInfo } from "@/lib/types";

type Stage = "loading" | "login" | "app";

export default function Page() {
  const [stage, setStage] = useState<Stage>("loading");
  const [isDefault, setIsDefault] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/session", { cache: "no-store" });
      const info = (await r.json()) as SessionInfo;
      setIsDefault(info.isDefault);
      setStage(info.authed ? "app" : "login");
    } catch {
      setStage("login");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="relative min-h-dvh">
      <Background />
      <AnimatePresence mode="wait">
        {stage === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 grid min-h-dvh place-items-center"
          >
            <div className="grid size-16 animate-float-slow place-items-center rounded-2xl bg-gradient-to-br from-gold-400 to-ember-500 text-ink-900 shadow-[0_12px_48px_-12px] shadow-gold-500/50">
              <Send className="size-7 -scale-x-100" />
            </div>
          </motion.div>
        )}

        {stage === "login" && (
          <LoginScreen
            key="login"
            isDefault={isDefault}
            onSuccess={() => setStage("app")}
          />
        )}

        {stage === "app" && (
          <Inbox
            key="app"
            isDefault={isDefault}
            onDefaultChanged={() => setIsDefault(false)}
            onLoggedOut={() => void refresh()}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
