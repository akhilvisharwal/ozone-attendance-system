import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { crossfadeVariants } from "@/lib/motion";
import { LOGO_ALT, LOGO_SRC, SYSTEM_NAME } from "@/config/branding";

/**
 * Full-viewport bootstrap loader — only for initial app load, session
 * validation, and hard refresh. Never use during in-app route changes.
 * Uses static branding so it can render before SettingsProvider mounts.
 */
export function LoadingScreen({ label = `Loading ${SYSTEM_NAME}…` }: { label?: string }) {
  return (
    <motion.div
      variants={crossfadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <img
        src={LOGO_SRC}
        alt={LOGO_ALT}
        className="logo-brand__img"
        style={{ height: "3.5rem", width: "auto", maxWidth: "14rem" }}
        decoding="async"
        draggable={false}
      />
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
        <span className="text-sm">{label}</span>
      </div>
    </motion.div>
  );
}
