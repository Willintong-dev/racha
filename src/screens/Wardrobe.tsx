import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import { useData } from '../lib/data'
import { db } from '../lib/db'
import { AVATARS } from '../lib/catalog'
import { isUnlocked, unlockLabel, WARDROBE, type Slot, type WardrobeItem } from '../lib/game'
import { celebrate } from '../lib/celebrate'
import { Avatar, Page } from '../components/ui'

type Tab = 'base' | Slot
const TABS: { id: Tab; label: string }[] = [
  { id: 'base', label: 'Personaje' },
  { id: 'bg', label: 'Fondo' },
  { id: 'hat', label: 'Accesorio' },
  { id: 'frame', label: 'Marco' },
  { id: 'pet', label: 'Mascota' },
]
/** El ítem "vacío" de cada ranura (quitar) */
const NONE: Record<Slot, string> = { bg: 'bg_base', hat: 'hat_none', frame: 'frame_none', pet: 'pet_none' }

export function Wardrobe() {
  const { profile, userId, level } = useData()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('base')
  const look = profile.wardrobe ?? {}
  const unlockedCount = WARDROBE.filter((w) => isUnlocked(w, level.level, profile.achievements)).length

  const equip = async (item: WardrobeItem) => {
    if (!isUnlocked(item, level.level, profile.achievements)) {
      celebrate.emit({ kind: 'info', text: `🔒 Se desbloquea con ${unlockLabel(item)}` })
      return
    }
    navigator.vibrate?.(10)
    const value = item.id === NONE[item.slot] ? undefined : item.id
    await db.profiles.update(userId, { wardrobe: { ...look, [item.slot]: value } })
  }

  return (
    <Page>
      <button type="button" onClick={() => navigate('/perfil')} className="-ml-2 p-2 text-muted" aria-label="Volver">
        <ArrowLeft />
      </button>

      <div className="flex flex-col items-center">
        <motion.div
          key={JSON.stringify(look) + profile.avatar}
          initial={{ scale: 0.85, rotate: -4 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 9, stiffness: 180 }}
          className="py-8"
        >
          <Avatar index={profile.avatar} size={140} look={look} />
        </motion.div>
        <h1 className="text-2xl font-black">Vestidor</h1>
        <p className="text-sm text-muted">
          {unlockedCount} de {WARDROBE.length} desbloqueados · sube de nivel y gana logros para más
        </p>
      </div>

      <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold transition-colors ${tab === t.id ? 'bg-accent text-white' : 'bg-card2 text-muted'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="mt-4 grid grid-cols-3 gap-3"
        >
          {tab === 'base'
            ? AVATARS.map((_, i) => (
                <Tile
                  key={i}
                  selected={profile.avatar === i}
                  onClick={() => db.profiles.update(userId, { avatar: i })}
                  preview={<Avatar index={i} size={56} look={{ ...look, hat: undefined, pet: undefined }} />}
                  label={['Zorro', 'Panda', 'Rana', 'Tigre', 'Pingüino', 'Unicornio'][i]}
                />
              ))
            : WARDROBE.filter((w) => w.slot === tab).map((item) => {
                const unlocked = isUnlocked(item, level.level, profile.achievements)
                const selected = (look[item.slot] ?? NONE[item.slot]) === item.id
                return (
                  <Tile
                    key={item.id}
                    selected={selected}
                    locked={!unlocked}
                    lockLabel={unlockLabel(item)}
                    onClick={() => equip(item)}
                    label={item.name}
                    preview={<Avatar index={profile.avatar} size={56} look={{ [item.slot]: item.id }} />}
                  />
                )
              })}
        </motion.div>
      </AnimatePresence>
    </Page>
  )
}

function Tile({
  preview,
  label,
  selected,
  locked,
  lockLabel,
  onClick,
}: {
  preview: React.ReactNode
  label: string
  selected?: boolean
  locked?: boolean
  lockLabel?: string
  onClick: () => void
}) {
  return (
    <motion.div
      role="button"
      tabIndex={0}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`relative flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 px-2 pt-5 pb-3 text-center ${
        selected ? 'border-accent bg-accent/15' : 'border-line bg-card'
      }`}
    >
      <div className={`pointer-events-none ${locked ? 'opacity-30 grayscale' : ''}`}>{preview}</div>
      <p className={`text-xs font-extrabold ${locked ? 'text-muted' : ''}`}>{label}</p>
      {locked && (
        <>
          <span className="absolute top-2 right-2 text-muted">
            <Lock size={14} />
          </span>
          <p className="-mt-1 text-[10px] leading-tight font-bold text-muted">{lockLabel}</p>
        </>
      )}
      {selected && <span className="absolute top-2 left-2 text-xs">✓</span>}
    </motion.div>
  )
}
