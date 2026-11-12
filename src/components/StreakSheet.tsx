import { motion } from 'framer-motion'
import { useData } from '../lib/data'
import { monthLabel, toDateStr, todayStr } from '../lib/format'
import { Sheet } from './ui'
import { freezesOf } from '../lib/game'

export function StreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, streak: s } = useData()
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const offset = (first.getDay() + 6) % 7 // lunes primero
  const today = todayStr()

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="text-center">
        <motion.div
          className="text-6xl"
          animate={{ scale: [1, 1.15, 1], rotate: [0, -4, 4, 0] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        >
          🔥
        </motion.div>
        <p className="mt-1 text-4xl font-black">{s.current} días</p>
        <p className="text-sm text-muted">Mejor racha: {s.best} días</p>
      </div>

      <p className="mt-6 mb-2 font-extrabold">{monthLabel(now)}</p>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="font-bold text-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <span key={'o' + i} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const ds = toDateStr(new Date(now.getFullYear(), now.getMonth(), i + 1))
          const good = s.goodDays.has(ds)
          const frozen = !good && s.frozenDays.has(ds)
          return (
            <motion.div
              key={ds}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.012 }}
              className={`grid aspect-square place-items-center rounded-xl font-bold ${
                good ? 'bg-orange-500/25 text-base' : frozen ? 'bg-sky-400/25 text-base' : 'bg-card2 text-muted'
              } ${ds === today ? 'ring-2 ring-accent' : ''}`}
            >
              {good ? '🔥' : frozen ? '🧊' : i + 1}
            </motion.div>
          )
        })}
      </div>

      <div className="mt-5 rounded-2xl bg-card2 p-4 text-sm text-muted">
        <p>
          <b className="text-ink">¿Cómo cuenta un día?</b> Registra al menos 1 movimiento
          {profile.dailyLimit ? ' y no te pases de tu límite diario' : ''}.
        </p>
        <p className="mt-2">
          🧊 Tienes <b className="text-ink">{freezesOf(profile)}</b> {freezesOf(profile) === 1 ? 'congelador' : 'congeladores'}. Si un día no cumples, usamos uno solo para salvar tu racha. Ganas uno al subir de nivel.
        </p>
      </div>
    </Sheet>
  )
}
