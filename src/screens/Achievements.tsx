import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useData } from '../lib/data'
import { ACHIEVEMENTS, WARDROBE, type GameCtx } from '../lib/game'
import { Page } from '../components/ui'

export function Achievements() {
  const { profile, txs, accounts, debts, level, streak, toMain } = useData()
  const navigate = useNavigate()
  const ctx: GameCtx = { txs, accounts, debts, profile, level: level.level, streak, toMain }
  const have = profile.achievements ?? {}
  const done = ACHIEVEMENTS.filter((a) => have[a.id])
  // Desbloqueados primero (más recientes arriba), luego bloqueados por cercanía a completarse
  const sorted = [
    ...done.sort((a, b) => have[b.id] - have[a.id]),
    ...ACHIEVEMENTS.filter((a) => !have[a.id]).sort((a, b) => {
      const pa = a.progress(ctx)
      const pb = b.progress(ctx)
      return pb.current / pb.target - pa.current / pa.target
    }),
  ]

  return (
    <Page>
      <button type="button" onClick={() => navigate('/perfil')} className="-ml-2 p-2 text-muted" aria-label="Volver">
        <ArrowLeft />
      </button>
      <h1 className="text-2xl font-black">Logros</h1>
      <p className="text-sm text-muted">
        {done.length} de {ACHIEVEMENTS.length} · cada logro da XP y algunos desbloquean ropa para tu avatar
      </p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="grad h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${(done.length / ACHIEVEMENTS.length) * 100}%` }}
          transition={{ type: 'spring', damping: 20, stiffness: 60 }}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {sorted.map((a, i) => {
          const unlocked = !!have[a.id]
          const p = a.progress(ctx)
          const reward = WARDROBE.find((w) => 'achievement' in w.unlock && w.unlock.achievement === a.id)
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              className={`flex flex-col items-center rounded-3xl p-4 text-center ${unlocked ? 'bg-gradient-to-br from-accent/25 to-accent2/15' : 'bg-card'}`}
            >
              <motion.div
                className={`text-5xl ${unlocked ? '' : 'opacity-30 grayscale'}`}
                animate={unlocked ? { rotate: [0, -6, 6, 0] } : undefined}
                transition={{ repeat: Infinity, repeatDelay: 3 + i * 0.3, duration: 0.6 }}
              >
                {a.emoji}
              </motion.div>
              <p className={`mt-2 text-sm font-black ${unlocked ? '' : 'text-muted'}`}>{a.name}</p>
              <p className="text-[11px] leading-tight text-muted">{a.hint}</p>
              {unlocked ? (
                <p className="mt-2 text-[11px] font-bold text-good">
                  ✓ {new Date(have[a.id]).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              ) : (
                <div className="mt-2 w-full">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(p.current / p.target) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] font-bold text-muted">
                    {p.current}/{p.target}
                  </p>
                </div>
              )}
              <p className="mt-1 text-[10px] font-bold text-accent">
                +{a.xp} XP{reward ? ` · ${reward.emoji ?? '🎨'} ${reward.name}` : ''}
              </p>
            </motion.div>
          )
        })}
      </div>
    </Page>
  )
}
