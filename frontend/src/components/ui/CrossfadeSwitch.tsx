import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Variants } from "motion/react";
import { crossfadeVariants } from "@/lib/motion";

/**
 * Crossfades between children whenever `state` changes — used to smooth out
 * abrupt swaps like `loading ? <Spinner /> : <Content />` or tab switches.
 */
export function CrossfadeSwitch({
  state,
  children,
  className,
  variants = crossfadeVariants,
}: {
  state: string | number | boolean;
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={String(state)}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
