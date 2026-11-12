import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { celebrate } from '../lib/celebrate'

interface Pill {
  id: number
  text: string
  tone: 'xp' | 'warn' | 'info' | 'ice'
}

interface Big {
  id: number
  emojis: string[]
  kicker: string
  title: string
  sub?: string
  ms: number
  burst: number
}

let nextId = 1

export function CelebrationLayer() {
  const [pills, setPills] = useState<Pill[]>([])
  /** Celebraciones a pantalla completa en cola: se muestran de a una */
  const [queue, setQueue] = useState<Big[]>([])
  const big = queue[0]

  useEffect(
    () =>
      celebrate.on((e) => {
        if (e.kind === 'levelup' || e.kind === 'payoff' || e.kind === 'achievement') {
          let item: Big
          if (e.kind === 'levelup') {
            const extras = [
              e.gotFreeze ? '+1 🧊 congelador' : '',
              e.unlocked ? `${e.unlocked} ${e.unlocked === 1 ? 'cosa nueva' : 'cosas nuevas'} en el vestidor` : '',
            ].filter(Boolean)
            item = { id: nextId++, emojis: ['🎉'], kicker: 'Subiste de nivel', title: `Nivel ${e.level}`, sub: extras.join(' · '), ms: 2800, burst: 140 }
          } else if (e.kind === 'payoff') {
            item = { id: nextId++, emojis: [e.emoji], kicker: '¡Deuda liquidada!', title: e.name, ms: 3600, burst: 220 }
          } else {
            const one = e.items.length === 1
            item = {
              id: nextId++,
              emojis: e.items.slice(0, 5).map((i) => i.emoji),
              kicker: one ? '¡Logro desbloqueado!' : `¡${e.items.length} logros desbloqueados!`,
              title: one ? e.items[0].name : e.items.map((i) => i.name).slice(0, 3).join(' · ') + (e.items.length > 3 ? '…' : ''),
              ms: one ? 2800 : 3600,
              burst: 100,
            }
          }
          setQueue((q) => [...q, item])
          return
        }
        const pill: Pill =
          e.kind === 'xp'
            ? { id: nextId++, text: `+${e.amount} XP${e.label ? ' · ' + e.label : ''}`, tone: 'xp' }
            : { id: nextId++, text: e.text, tone: e.kind === 'freeze' ? 'ice' : e.kind }
        setPills((p) => [...p, pill])
        setTimeout(() => setPills((p) => p.filter((x) => x.id !== pill.id)), e.kind === 'warn' || e.kind === 'freeze' ? 4500 : 1800)
      }),
    [],
  )

  // Al aparecer cada celebración: confeti y cierre automático.
  // Si hay más esperando, cada una dura menos para no bloquear la app varios segundos seguidos.
  const pending = queue.length
  useEffect(() => {
    if (!big) return
    confetti({ particleCount: big.burst, spread: 100, origin: { y: 0.55 }, zIndex: 100 })
    const t = setTimeout(() => setQueue((q) => (q[0]?.id === big.id ? q.slice(1) : q)), pending > 1 ? 1600 : big.ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el tiempo se fija al aparecer
  }, [big])

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
                p.tone === 'xp'
                  ? 'grad text-white'
                  : p.tone === 'warn'
                    ? 'bg-warn text-black'
                    : p.tone === 'ice'
                      ? 'bg-sky-300 text-sky-950'
                      : 'bg-card2 text-ink'
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
            onClick={() => setQueue((q) => q.slice(1))}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.3, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 160 }}
            >
              <div className="flex justify-center gap-2 text-7xl">
                {big.emojis.map((e, i) => (
                  <motion.span
                    key={i}
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 + i * 0.12, type: 'spring', damping: 9 }}
                    className={big.emojis.length > 2 ? 'text-5xl' : ''}
                  >
                    {e}
                  </motion.span>
                ))}
              </div>
              <p className="mt-3 text-sm font-bold tracking-widest text-muted uppercase">{big.kicker}</p>
              <p className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-5xl leading-tight font-black text-transparent">
                {big.title}
              </p>
              {big.sub && <p className="mt-3 font-bold text-ink/80">{big.sub}</p>}
              <p className="mt-6 text-xs text-muted">Toca para continuar</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
