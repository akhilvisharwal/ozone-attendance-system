import { motion } from "motion/react";
import { crossfadeVariants } from "@/lib/motion";

export function LoadingScreen() {
  return (
    <motion.div
      variants={crossfadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex h-screen items-center justify-center bg-slate-50"
    >
      <div className="relative h-10 w-10">
        {/* Track ring */}
        <svg className="h-10 w-10" viewBox="0 0 40 40" fill="none">
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke="currentColor"
            strokeWidth="3"
            className="text-slate-200"
          />
        </svg>
        {/* Spinning arc */}
        <svg
          className="absolute inset-0 h-10 w-10 animate-spin"
          viewBox="0 0 40 40"
          fill="none"
          style={{ animationDuration: "700ms", animationTimingFunction: "linear" }}
        >
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="28 72"
            strokeDashoffset="0"
            className="text-brand-600"
          />
        </svg>
      </div>
    </motion.div>
  );
}
