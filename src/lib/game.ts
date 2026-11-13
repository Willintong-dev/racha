import type { Account, Debt, Profile, Transaction, Wardrobe } from './db'
import type { ToMain } from './finance'
import { addDays, todayStr } from './format'

// ---------------------------------------------------------------------------
// Logros
// ---------------------------------------------------------------------------

export interface GameCtx {
  txs: Transaction[]
  accounts: Account[]
  debts: Debt[]
  profile: Profile
  level: number
  streak: { current: number; best: number }
  toMain: ToMain
  today?: string
}

export interface Achievement {
  id: string
  emoji: string
  name: string
  /** Cómo se consigue (se muestra mientras está bloqueado) */
  hint: string
  xp: number
  /** Progreso actual y meta, para la barra */
  progress: (c: GameCtx) => { current: number; target: number }
}

const count = (n: number, target: number) => ({ current: Math.min(n, target), target })

/** Meses completos (anteriores al actual) con ≥5 movimientos donde ingresaste más de lo que gastaste y pagaste. */
export function greenMonths(c: GameCtx) {
  const current = (c.today ?? todayStr()).slice(0, 7)
  const months = new Map<string, { n: number; net: number }>()
  for (const t of c.txs) {
    const m = t.date.slice(0, 7)
    if (m >= current) continue
    const v = c.toMain(t.amount, t.accountId)
    const e = months.get(m) ?? { n: 0, net: 0 }
    if (t.type === 'ingreso') e.net += v
    if (t.type === 'gasto' || t.type === 'pago_deuda') e.net -= v
    if (t.type !== 'ajuste' && t.type !== 'transferencia') e.n++
    months.set(m, e)
  }
  return [...months.values()].filter((m) => m.n >= 5 && m.net > 0).length
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'primer_paso', emoji: '🪙', name: 'Primer paso', hint: 'Registra tu primer movimiento', xp: 25, progress: (c) => count(c.txs.length, 1) },
  { id: 'racha_3', emoji: '📅', name: 'Constante', hint: 'Logra una racha de 3 días', xp: 25, progress: (c) => count(c.streak.best, 3) },
  { id: 'racha_7', emoji: '🔥', name: 'Semana en llamas', hint: 'Logra una racha de 7 días', xp: 75, progress: (c) => count(c.streak.best, 7) },
  { id: 'racha_30', emoji: '🌋', name: 'Imparable', hint: 'Logra una racha de 30 días', xp: 300, progress: (c) => count(c.streak.best, 30) },
  { id: 'mov_100', emoji: '📒', name: 'Contador nato', hint: 'Registra 100 movimientos', xp: 100, progress: (c) => count(c.txs.filter((t) => t.type !== 'ajuste').length, 100) },
  { id: 'cuentas_2', emoji: '💳', name: 'Organizado', hint: 'Ten 2 cuentas o más', xp: 25, progress: (c) => count(c.accounts.filter((a) => !a.archived).length, 2) },
  {
    id: 'multimoneda', emoji: '🌍', name: 'Ciudadano del mundo', hint: 'Usa cuentas en 2 monedas distintas', xp: 50,
    progress: (c) => count(new Set(c.accounts.filter((a) => !a.archived).map((a) => a.currency)).size, 2),
  },
  { id: 'primer_pago', emoji: '📉', name: 'Al ataque', hint: 'Paga tu primera cuota de deuda', xp: 25, progress: (c) => count(c.txs.filter((t) => t.type === 'pago_deuda').length, 1) },
  { id: 'plan', emoji: '🧮', name: 'Estratega', hint: 'Aplica un plan en el simulador de deudas', xp: 50, progress: (c) => count(c.profile.debtPlan ? 1 : 0, 1) },
  { id: 'deuda_1', emoji: '🕊️', name: 'Una menos', hint: 'Liquida una deuda', xp: 150, progress: (c) => count(c.debts.filter((d) => d.balance <= 0).length, 1) },
  {
    id: 'libre', emoji: '🏆', name: 'Libre de deudas', hint: 'Liquida todas tus deudas', xp: 500,
    progress: (c) => ({ current: c.debts.filter((d) => d.balance <= 0).length, target: Math.max(c.debts.length, 1) }),
  },
  { id: 'mes_verde', emoji: '🌱', name: 'Mes en verde', hint: 'Termina un mes ganando más de lo que gastas', xp: 100, progress: (c) => count(greenMonths(c), 1) },
  { id: 'nivel_5', emoji: '⭐', name: 'Nivel 5', hint: 'Llega al nivel 5', xp: 50, progress: (c) => count(c.level, 5) },
  { id: 'nivel_10', emoji: '💎', name: 'Nivel 10', hint: 'Llega al nivel 10', xp: 150, progress: (c) => count(c.level, 10) },
]

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)

/** Logros cumplidos que aún no están desbloqueados. "libre" exige haber tenido al menos una deuda. */
export function newlyEarned(c: GameCtx) {
  const have = c.profile.achievements ?? {}
  return ACHIEVEMENTS.filter((a) => {
    if (have[a.id]) return false
    if (a.id === 'libre' && c.debts.length === 0) return false
    const p = a.progress(c)
    return p.current >= p.target
  })
}

// ---------------------------------------------------------------------------
// Vestidor
// ---------------------------------------------------------------------------

export type Slot = 'bg' | 'hat' | 'frame' | 'pet'

export interface WardrobeItem {
  id: string
  slot: Slot
  name: string
  /** Emoji del accesorio o mascota; para fondos y marcos, una muestra */
  emoji?: string
  /** Fondo: degradado CSS. Marco: color(es) del anillo */
  style?: string
  unlock: { level: number } | { achievement: string }
}

export const WARDROBE: WardrobeItem[] = [
  // Fondos
  { id: 'bg_base', slot: 'bg', name: 'Original', unlock: { level: 1 } },
  { id: 'bg_atardecer', slot: 'bg', name: 'Atardecer', style: 'linear-gradient(135deg,#f97316,#db2777)', unlock: { level: 2 } },
  { id: 'bg_oceano', slot: 'bg', name: 'Océano', style: 'linear-gradient(135deg,#0ea5e9,#1e3a8a)', unlock: { level: 3 } },
  { id: 'bg_bosque', slot: 'bg', name: 'Bosque', style: 'linear-gradient(135deg,#22c55e,#14532d)', unlock: { achievement: 'mes_verde' } },
  { id: 'bg_galaxia', slot: 'bg', name: 'Galaxia', style: 'radial-gradient(circle at 30% 30%,#a855f7,#1e1b4b 70%)', unlock: { level: 5 } },
  { id: 'bg_aurora', slot: 'bg', name: 'Aurora', style: 'linear-gradient(135deg,#34d399,#6366f1,#ec4899)', unlock: { level: 8 } },
  { id: 'bg_oro', slot: 'bg', name: 'Oro', style: 'linear-gradient(135deg,#fde047,#ca8a04)', unlock: { achievement: 'libre' } },
  // Accesorios
  { id: 'hat_none', slot: 'hat', name: 'Nada', unlock: { level: 1 } },
  { id: 'hat_gorra', slot: 'hat', name: 'Gorra', emoji: '🧢', unlock: { level: 2 } },
  { id: 'hat_gafas', slot: 'hat', name: 'Gafas de sol', emoji: '🕶️', unlock: { level: 3 } },
  { id: 'hat_moño', slot: 'hat', name: 'Moño', emoji: '🎀', unlock: { achievement: 'racha_3' } },
  { id: 'hat_sombrero', slot: 'hat', name: 'Sombrero', emoji: '🎩', unlock: { level: 4 } },
  { id: 'hat_birrete', slot: 'hat', name: 'Birrete', emoji: '🎓', unlock: { achievement: 'mov_100' } },
  { id: 'hat_vikingo', slot: 'hat', name: 'Casco', emoji: '⛑️', unlock: { achievement: 'primer_pago' } },
  { id: 'hat_corona', slot: 'hat', name: 'Corona', emoji: '👑', unlock: { level: 10 } },
  // Marcos
  { id: 'frame_none', slot: 'frame', name: 'Simple', unlock: { level: 1 } },
  { id: 'frame_plata', slot: 'frame', name: 'Plata', style: '#cbd5e1', unlock: { level: 3 } },
  { id: 'frame_fuego', slot: 'frame', name: 'Fuego', style: '#f97316,#facc15,#ef4444', unlock: { achievement: 'racha_7' } },
  { id: 'frame_oro', slot: 'frame', name: 'Oro', style: '#facc15', unlock: { level: 6 } },
  { id: 'frame_arcoiris', slot: 'frame', name: 'Arcoíris', style: '#ef4444,#f97316,#facc15,#22c55e,#3b82f6,#a855f7', unlock: { level: 9 } },
  { id: 'frame_diamante', slot: 'frame', name: 'Diamante', style: '#67e8f9,#a5b4fc,#f0abfc', unlock: { achievement: 'nivel_10' } },
  // Mascotas
  { id: 'pet_none', slot: 'pet', name: 'Ninguna', unlock: { level: 1 } },
  { id: 'pet_pollito', slot: 'pet', name: 'Pollito', emoji: '🐣', unlock: { level: 2 } },
  { id: 'pet_perro', slot: 'pet', name: 'Perrito', emoji: '🐶', unlock: { level: 4 } },
  { id: 'pet_gato', slot: 'pet', name: 'Gatito', emoji: '🐱', unlock: { level: 5 } },
  { id: 'pet_buho', slot: 'pet', name: 'Búho sabio', emoji: '🦉', unlock: { achievement: 'plan' } },
  { id: 'pet_paloma', slot: 'pet', name: 'Paloma', emoji: '🕊️', unlock: { achievement: 'deuda_1' } },
  { id: 'pet_dragon', slot: 'pet', name: 'Dragón', emoji: '🐉', unlock: { achievement: 'racha_30' } },
]

export const itemById = (id?: string) => WARDROBE.find((w) => w.id === id)

const SLOTS: Slot[] = ['bg', 'hat', 'frame', 'pet']

/**
 * Ropa del avatar a prueba de datos raros (nube, filas del ranking de otros jugadores):
 * solo se quedan los ids del catálogo que corresponden a su ranura. Cualquier otra cosa
 * ("__proto__", objetos, números, ids desconocidos) se descarta.
 */
export function cleanWardrobe(w: unknown): Wardrobe | undefined {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return undefined
  const out: Wardrobe = {}
  for (const slot of SLOTS) {
    const id: unknown = Object.prototype.hasOwnProperty.call(w, slot) ? (w as Record<string, unknown>)[slot] : undefined
    if (typeof id === 'string' && id.length <= 40 && itemById(id)?.slot === slot) out[slot] = id
  }
  return out
}

export function isUnlocked(item: WardrobeItem, level: number, achievements?: Record<string, number>) {
  return 'level' in item.unlock ? level >= item.unlock.level : !!achievements?.[item.unlock.achievement]
}

export function unlockLabel(item: WardrobeItem) {
  if ('level' in item.unlock) return `Nivel ${item.unlock.level}`
  return `Logro: ${achievementById(item.unlock.achievement)?.name ?? item.unlock.achievement}`
}

/** Ítems que se desbloquean exactamente al llegar a un nivel (para anunciarlos al subir). */
export const itemsForLevel = (level: number) => WARDROBE.filter((w) => 'level' in w.unlock && w.unlock.level === level)

// ---------------------------------------------------------------------------
// Congeladores de racha
// ---------------------------------------------------------------------------

export const FREEZE_MAX = 3
export const freezesOf = (p: Profile) => p.freezes ?? 1

/**
 * Si ayer (y quizá antes) no cumpliste, pero venías con racha, decide qué días salvar con congeladores.
 * Devuelve los días a congelar, o [] si no hay racha que salvar o no alcanzan los congeladores.
 * `isGood(día)` = el día cumplió por sí mismo.
 */
export function daysToFreeze(isGood: (d: string) => boolean, frozen: Set<string>, available: number, today = todayStr()) {
  if (available <= 0) return []
  const gap: string[] = []
  let d = addDays(today, -1)
  while (!isGood(d) && !frozen.has(d)) {
    gap.push(d)
    if (gap.length > available) return [] // hueco demasiado grande: la racha ya se perdió
    d = addDays(d, -1)
  }
  // Solo vale la pena si antes del hueco había racha
  return gap.length > 0 && (isGood(d) || frozen.has(d)) ? gap : []
}
