import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { Logo } from "@/components/Logo";
import { SYSTEM_NAME } from "@/config/branding";
import { crossfadeVariants } from "@/lib/motion";

export function LoadingScreen({ label = `Loading ${SYSTEM_NAME}…` }: { label?: string }) {
  return (
    <motion.div
      variants={crossfadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4"
    >
      <Logo variant="hero" />
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </motion.div>
  );
}
