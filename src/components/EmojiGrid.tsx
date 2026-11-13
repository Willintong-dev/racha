import { motion } from 'framer-motion'
import { CUSTOM_EMOJI_GROUPS } from '../lib/catalog'

/** Cuadrícula de íconos agrupados (categorías propias, gastos fijos, deudas…) */
export function EmojiGrid({ value, onPick }: { value: string; onPick: (emoji: string) => void }) {
  return (
    <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
      {CUSTOM_EMOJI_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-0.5 text-[10px] font-bold tracking-wider text-muted uppercase">{g.label}</p>
          <div className="grid grid-cols-8 gap-1">
            {g.emojis.map((e) => (
              <motion.button
                key={e}
                type="button"
                whileTap={{ scale: 0.8 }}
                onClick={() => onPick(e)}
                aria-label={`Ícono ${e}`}
                className={`grid aspect-square place-items-center rounded-xl text-xl ${value === e ? 'bg-accent/30 ring-2 ring-accent' : ''}`}
              >
                {e}
              </motion.button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
