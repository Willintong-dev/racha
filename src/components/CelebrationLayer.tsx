import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { celebrate } from '../lib/celebrate'

interface Pill {
  id: number
  text: string
  tone: 'xp' | 'warn' | 'info'
}

let nextId = 1

export function CelebrationLayer() {
  const [pills, setPills] = useState<Pill[]>([])
  /** Celebración a pantalla completa (subir de nivel, liquidar una deuda). Si llegan dos, se muestra la última. */
  const [big, setBig] = useState<{ id: number; emoji: string; kicker: string; title: string } | null>(null)

  useEffect(
    () =>
      celebrate.on((e) => {
        if (e.kind === 'levelup' || e.kind === 'payoff') {
          const id = nextId++
          setBig(
            e.kind === 'levelup'
              ? { id, emoji: '🎉', kicker: 'Subiste de nivel', title: `Nivel ${e.level}` }
              : { id, emoji: e.emoji, kicker: '¡Deuda liquidada!', title: e.name },
          )
          confetti({ particleCount: e.kind === 'payoff' ? 220 : 140, spread: e.kind === 'payoff' ? 120 : 90, origin: { y: 0.55 }, zIndex: 100 })
          if (e.kind === 'payoff') setTimeout(() => confetti({ particleCount: 120, spread: 100, origin: { y: 0.4 }, zIndex: 100 }), 400)
          setTimeout(() => setBig((b) => (b?.id === id ? null : b)), e.kind === 'payoff' ? 3600 : 2600)
          return
        }
        const pill: Pill =
          e.kind === 'xp'
            ? { id: nextId++, text: `+${e.amount} XP${e.label ? ' · ' + e.label : ''}`, tone: 'xp' }
            : { id: nextId++, text: e.text, tone: e.kind }
        setPills((p) => [...p, pill])
        setTimeout(() => setPills((p) => p.filter((x) => x.id !== pill.id)), e.kind === 'warn' ? 4500 : 1800)
      }),
    [],
  )

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {pills.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.9 }}
              className={`max-w-sm rounded-full px-4 py-2 text-center text-sm font-extrabold shadow-xl ${
                p.tone === 'xp' ? 'grad text-white' : p.tone === 'warn' ? 'bg-warn text-black' : 'bg-card2 text-ink'
              }`}
            >
              {p.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {big && (
          <motion.div
            key={big.id}
            className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transitionEnd: { display: 'none' } }}
            onClick={() => setBig(null)}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.3, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 160 }}
            >
              <div className="text-7xl">{big.emoji}</div>
              <p className="mt-3 text-sm font-bold tracking-widest text-muted uppercase">{big.kicker}</p>
              <p className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-6xl font-black text-transparent">
                {big.title}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
