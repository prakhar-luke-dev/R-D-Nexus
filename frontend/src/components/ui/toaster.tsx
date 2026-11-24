"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToasts } from "@/lib/toast";

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[200] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {items.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertCircle : Info;
          const color = t.kind === "success" ? "text-ok" : t.kind === "error" ? "text-danger" : "text-info";
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              className="pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border border-border-strong bg-surface-2/95 px-3.5 py-2.5 text-sm shadow-xl shadow-black/40 backdrop-blur"
              role="status"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
              <span className="text-text">{t.message}</span>
              <button className="ml-1 text-faint hover:text-text" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
