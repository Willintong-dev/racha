import { motion } from 'framer-motion'

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className="flex flex-col items-center gap-3"
      >
        <motion.img
          src="/icon.svg"
          alt=""
          className="h-24 w-24"
          animate={{ rotate: [0, -6, 6, 0], scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        />
        <p className="text-2xl font-black tracking-tight">Racha</p>
      </motion.div>
    </div>
  )
}
