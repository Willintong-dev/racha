import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, AnimatePresence, motion, useDragControls } from 'framer-motion'
import { avatarIndex, AVATARS } from '../lib/catalog'
import type { Wardrobe } from '../lib/db'
import { cleanWardrobe, itemById } from '../lib/game'
import { money } from '../lib/format'
import { Character, Pet } from './Creature'

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-4 pt-[calc(env(safe-area-inset-top)+16px)] ${className}`}>{children}</div>
}

/**
 * Avatar: el animalito dibujado (SVG) con su ropa puesta, sobre un fondo circular con marco.
 * Los accesorios van SOBRE el personaje (cabeza / ojos) porque todos comparten el mismo esqueleto.
 * Al tocarlo salta y sonríe. `still` desactiva las animaciones (miniaturas).
 */
export function Avatar({
  index,
  size = 48,
  onClick,
  look: rawLook,
  still,
}: {
  index: number
  size?: number
  onClick?: () => void
  look?: Wardrobe
  still?: boolean
}) {
  const [happy, setHappy] = useState(0)
  // El índice y la ropa pueden venir de la nube o de otro jugador: se validan contra el catálogo
  const species = avatarIndex(index)
  const look = cleanWardrobe(rawLook)
  const a = AVATARS[species]
  const bg = itemById(look?.bg)?.style ?? `linear-gradient(135deg, ${a.from}, ${a.to})`
  const frame = itemById(look?.frame)?.style
  const pet = look?.pet
  const ring = Math.max(2, size * 0.05)

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={() => {
        setHappy((h) => h + 1)
        navigator.vibrate?.(12)
        onClick?.()
      }}
      aria-label="Tu avatar"
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size }}
    >
      {/* Marco: anillo de color (o degradado giratorio si tiene varios colores) */}
      {frame ? (
        <motion.span
          className="absolute rounded-full"
          style={{ inset: -ring, background: frame.includes(',') ? `conic-gradient(${frame},${frame.split(',')[0]})` : frame }}
          animate={frame.includes(',') && !still ? { rotate: 360 } : undefined}
          transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
        />
      ) : (
        <span className="absolute inset-0 rounded-full ring-2 ring-white/15" />
      )}
      <span className="absolute inset-0 rounded-full shadow-lg" style={{ background: bg }} />
      <svg viewBox="-8 -12 136 136" className="pointer-events-none absolute inset-0 overflow-visible" width={size} height={size}>
        <g transform={pet ? 'translate(-7 0)' : undefined}>
          <Character species={species} hat={look?.hat} happy={happy} still={still} />
        </g>
        {pet && (
          <g transform="translate(84 76)">
            <Pet id={pet} still={still} />
          </g>
        )}
      </svg>
    </motion.button>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  const controls = useDragControls()
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transitionEnd: { display: 'none' } }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-md flex-col rounded-t-[28px] border-t border-white/10 bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, i) => {
              if (i.offset.y > 100 || i.velocity.y > 500) onClose()
            }}
          >
            <div className="flex cursor-grab touch-none justify-center pt-3 pb-2" onPointerDown={(e) => controls.start(e)}>
              <div className="h-1.5 w-12 rounded-full bg-white/20" />
            </div>
            {title && <h2 className="px-5 pb-2 text-lg font-extrabold">{title}</h2>}
            <div className="no-scrollbar overflow-y-auto px-5 pb-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function AnimatedMoney({
  value,
  className,
  sign,
  currency,
}: {
  value: number
  className?: string
  sign?: boolean
  currency?: string
}) {
  const [display, setDisplay] = useState(value)
  const current = useRef(value)
  useEffect(() => {
    const c = animate(current.current, value, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (v) => {
        current.current = v
        setDisplay(v)
      },
    })
    return () => c.stop()
  }, [value])
  return <span className={className}>{money(Math.round(display * 100) / 100, { sign, currency })}</span>
}

export function Ring({
  value,
  max,
  size = 120,
  stroke = 12,
  color,
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  color: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct), stroke: color }}
          transition={{ type: 'spring', damping: 20, stiffness: 80 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function XpBar({ into, needed, className = '' }: { into: number; needed: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-white/10 ${className}`}>
      <motion.div
        className="grad h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${(into / needed) * 100}%` }}
        transition={{ type: 'spring', damping: 20, stiffness: 90 }}
      />
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  color,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  color?: string
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition-colors ${
        active ? 'border-transparent text-white' : 'border-line bg-card2 text-ink/80'
      }`}
      style={active ? { background: color ?? 'var(--color-accent)' } : undefined}
    >
      {children}
    </motion.button>
  )
}

export function BigButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
}) {
  const styles = {
    primary: 'grad text-white shadow-lg shadow-accent/30',
    ghost: 'bg-card2 text-ink border border-line',
    danger: 'bg-bad/15 text-bad border border-bad/30',
  }[variant]
  return (
    <motion.button
      type={type}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl py-4 text-base font-extrabold transition-opacity disabled:opacity-40 ${styles}`}
    >
      {children}
    </motion.button>
  )
}

export function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
  const press = (k: string) => {
    navigator.vibrate?.(8)
    if (k === 'del') return onChange(value.slice(0, -1))
    if (k === '.') {
      if (value.includes('.')) return
      return onChange((value || '0') + '.')
    }
    if (value.includes('.') && value.split('.')[1].length >= 2) return
    if (value.replace('.', '').length >= 12) return
    onChange(value === '0' ? k : value + k)
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <motion.button
          key={k}
          type="button"
          whileTap={{ scale: 0.88, backgroundColor: 'rgba(139,92,246,.35)' }}
          onClick={() => press(k)}
          className="h-14 rounded-2xl bg-card2 text-2xl font-extrabold"
        >
          {k === 'del' ? '⌫' : k === '.' ? ',' : k}
        </motion.button>
      ))}
    </div>
  )
}

export function Empty({ emoji, title, text }: { emoji: string; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <motion.div
        className="text-5xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
      >
        {emoji}
      </motion.div>
      <p className="mt-3 font-extrabold">{title}</p>
      {text && <p className="mt-1 max-w-64 text-sm text-muted">{text}</p>}
    </div>
  )
}
