"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, HardDrive } from "lucide-react";

type Health = {
  ok: boolean;
  storage?: {
    kind?: string;
    state?: string;
    message?: string | null;
  };
};

/**
 * Tiny storage-status pill next to the feed header.
 * Shows at a glance where your bytes live — and, critically, turns red the
 * moment MEGA gets locked/limited instead of failing uploads silently.
 */
export default function StorageBadge() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const data = (await r.json()) as Health;
        if (alive) setHealth(data);
      } catch {
        if (alive) setHealth(null);
      }
    };
    void load();
    const tick = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, []);

  if (!health?.storage?.kind) return null;

  const { kind, state, message } = health.storage;

  let cls = "border-white/10 bg-ink-800/70 text-mist-400";
  let Icon = Cloud;
  let label = "تخزين";
  let pulse = false;

  if (kind === "s3") {
    cls = "border-teal-400/20 bg-teal-400/10 text-teal-300";
    label = "تخزين سحابي";
  } else if (kind === "local") {
    cls = "border-gold-400/20 bg-gold-400/10 text-gold-300";
    Icon = HardDrive;
    label = "قرص محلي";
  } else if (kind === "mega") {
    if (state === "ready") {
      cls = "border-teal-400/20 bg-teal-400/10 text-teal-300";
      label = "MEGA متصل";
    } else if (state === "cooldown") {
      cls = "border-ember-400/30 bg-ember-500/10 text-ember-300";
      Icon = CloudOff;
      label = "MEGA متعذّر";
      pulse = true;
    } else {
      label = "MEGA";
    }
  }

  return (
    <span
      title={message ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${cls}`}
    >
      <span
        className={`inline-block size-1.5 rounded-full bg-current ${pulse ? "pulse-dot" : ""}`}
      />
      <Icon className="size-3" />
      {label}
    </span>
  );
}
