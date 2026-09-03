// Shared Motion variants. Import alongside `m` and `AnimatePresence` from 'motion/react'.

/** Page-level enter/exit for route transitions. Use with <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit"> inside an <AnimatePresence mode="wait">. */
export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
};

/** Stagger a list of children. Put staggerContainer on the parent and staggerItem on each child. */
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const staggerItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};
