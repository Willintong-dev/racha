import type { AccountType } from './db'

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  kind: 'gasto' | 'ingreso'
}

export const CATEGORIES: Category[] = [
  { id: 'comida', name: 'Comida', emoji: '🍔', color: '#f97316', kind: 'gasto' },
  { id: 'transporte', name: 'Transporte', emoji: '🚌', color: '#3b82f6', kind: 'gasto' },
  { id: 'cafe', name: 'Café', emoji: '☕', color: '#b45309', kind: 'gasto' },
  { id: 'mercado', name: 'Mercado', emoji: '🛒', color: '#22c55e', kind: 'gasto' },
  { id: 'hogar', name: 'Hogar', emoji: '🏠', color: '#14b8a6', kind: 'gasto' },
  { id: 'arriendo', name: 'Arriendo', emoji: '🔑', color: '#0d9488', kind: 'gasto' },
  { id: 'servicios', name: 'Servicios', emoji: '💡', color: '#eab308', kind: 'gasto' },
  { id: 'suscripciones', name: 'Suscripciones', emoji: '📺', color: '#e11d48', kind: 'gasto' },
  { id: 'seguros', name: 'Seguros', emoji: '🛡️', color: '#0284c7', kind: 'gasto' },
  { id: 'salud', name: 'Salud', emoji: '💊', color: '#ef4444', kind: 'gasto' },
  { id: 'ocio', name: 'Ocio', emoji: '🎮', color: '#a855f7', kind: 'gasto' },
  { id: 'compras', name: 'Compras', emoji: '🛍️', color: '#ec4899', kind: 'gasto' },
  { id: 'educacion', name: 'Educación', emoji: '📚', color: '#6366f1', kind: 'gasto' },
  { id: 'otros_g', name: 'Otros', emoji: '📦', color: '#64748b', kind: 'gasto' },
  { id: 'salario', name: 'Salario', emoji: '💼', color: '#22c55e', kind: 'ingreso' },
  { id: 'freelance', name: 'Freelance', emoji: '💻', color: '#10b981', kind: 'ingreso' },
  { id: 'ventas', name: 'Ventas', emoji: '🏷️', color: '#84cc16', kind: 'ingreso' },
  { id: 'regalo', name: 'Regalo', emoji: '🎁', color: '#f472b6', kind: 'ingreso' },
  { id: 'intereses', name: 'Intereses', emoji: '📈', color: '#06b6d4', kind: 'ingreso' },
  { id: 'otros_i', name: 'Otros', emoji: '💰', color: '#64748b', kind: 'ingreso' },
]

type Kind = Category['kind']

/** El "Otros" de cada tipo: es el respaldo de cualquier categoría desconocida o borrada. */
export const otrosOf = (kind: Kind): Category => CATEGORIES.find((c) => c.id === (kind === 'gasto' ? 'otros_g' : 'otros_i'))!
export const isOtros = (id?: string) => id === 'otros_g' || id === 'otros_i'

/**
 * Único lugar para traducir un id de categoría a su nombre/emoji/color.
 * Busca primero en las categorías propias del usuario y luego en el catálogo.
 * Ids desconocidos (p. ej. una categoría propia que se borró) caen en "Otros" del tipo indicado.
 */
export function categoryOf(id: string | undefined, custom?: Category[], kind: Kind = 'gasto'): Category {
  return custom?.find((c) => c.id === id) ?? CATEGORIES.find((c) => c.id === id) ?? otrosOf(kind)
}

/** Categorías de un tipo para el selector: las del catálogo y las propias, con "Otros" siempre al final. */
export function categoriesFor(kind: Kind, custom?: Category[]): Category[] {
  return [
    ...CATEGORIES.filter((c) => c.kind === kind && !isOtros(c.id)),
    ...(custom ?? []).filter((c) => c.kind === kind),
    otrosOf(kind),
  ]
}

/** Íconos para las categorías propias, agrupados para encontrarlos rápido */
export const CUSTOM_EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Comida y salidas', emojis: ['🍕', '☕', '🍺', '🍷', '🍰', '🎮', '🎬', '🎵'] },
  { label: 'Cuidado personal', emojis: ['💅', '💄', '💇', '🧴', '🪒', '👗', '👟', '💍'] },
  { label: 'Casa y familia', emojis: ['🏠', '🐶', '🐱', '👶', '🎁', '🔧', '🌱', '❤️'] },
  { label: 'Salud y estudio', emojis: ['💊', '🦷', '🏋️', '⚽', '📚', '🎓', '📱', '💻'] },
  { label: 'Transporte y viajes', emojis: ['🚗', '⛽', '🚕', '🚌', '✈️', '🏖️', '⛪', '⭐'] },
  { label: 'Plata', emojis: ['🧾', '💳', '💼', '🏷️', '💵', '🪙', '🏦', '📈'] },
]
export const CUSTOM_EMOJIS = CUSTOM_EMOJI_GROUPS.flatMap((g) => g.emojis)
/** Colores que se asignan solos a las categorías propias */
export const CUSTOM_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#10b981', '#3b82f6', '#d946ef', '#84cc16', '#fb923c', '#0ea5e9']
export const CUSTOM_NAME_MAX = 20

/**
 * Categoría de gasto para un gasto fijo inventado ("Otro"): si ya hay una con ese nombre
 * (del catálogo o propia, sin importar mayúsculas) se reusa; si no, se arma una propia nueva.
 * `isNew` indica que hay que guardarla en el perfil.
 */
export function categoryForName(name: string, emoji: string, custom: Category[], newId: string): { cat: Category; isNew: boolean } {
  const clean = name.trim().slice(0, CUSTOM_NAME_MAX)
  const key = clean.toLocaleLowerCase()
  const same = [...CATEGORIES.filter((c) => !isOtros(c.id)), ...custom].find((c) => c.kind === 'gasto' && c.name.toLocaleLowerCase() === key)
  if (same) return { cat: same, isNew: false }
  return {
    cat: { id: newId, name: clean, emoji, color: CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length], kind: 'gasto' },
    isNew: true,
  }
}

export const ACCOUNT_TYPES: Record<AccountType, { label: string; emoji: string; color: string }> = {
  banco: { label: 'Banco', emoji: '🏦', color: '#6366f1' },
  efectivo: { label: 'Efectivo', emoji: '💵', color: '#16a34a' },
  ahorro: { label: 'Ahorro', emoji: '🐷', color: '#db2777' },
  digital: { label: 'Billetera digital', emoji: '📱', color: '#0891b2' },
}

export interface MonthlyPreset {
  name: string
  emoji: string
  categoryId?: string
  /** "Otro"/"Otra deuda": el usuario le pone nombre e ícono */
  custom?: boolean
  /** Ejemplo para el campo de nombre de un preset `custom` */
  placeholder?: string
}

export const DEBT_PRESETS: MonthlyPreset[] = [
  { name: 'Tarjeta de crédito', emoji: '💳' },
  { name: 'Préstamo', emoji: '🏦' },
  { name: 'Vehículo', emoji: '🚗' },
  { name: 'Hipoteca', emoji: '🏠' },
  { name: 'Crédito de estudio', emoji: '🎓' },
  { name: 'Otra deuda', emoji: '📄', custom: true, placeholder: '¿Cuál? Ej: Préstamo de mi tía' },
]

export const FIXED_PRESETS: MonthlyPreset[] = [
  { name: 'Arriendo', emoji: '🔑', categoryId: 'arriendo' },
  { name: 'Servicios', emoji: '💡', categoryId: 'servicios' },
  { name: 'Internet y celular', emoji: '🌐', categoryId: 'servicios' },
  { name: 'Mercado', emoji: '🛒', categoryId: 'mercado' },
  { name: 'Netflix, Spotify…', emoji: '📺', categoryId: 'suscripciones' },
  { name: 'Transporte', emoji: '🚌', categoryId: 'transporte' },
  { name: 'Seguros', emoji: '🛡️', categoryId: 'seguros' },
  { name: 'Gimnasio', emoji: '🏋️', categoryId: 'suscripciones' },
  { name: 'Otro', emoji: '📌', custom: true, placeholder: '¿Qué pagas? Ej: Uñas' },
]

export const AVATARS = [
  { emoji: '🦊', from: '#f97316', to: '#facc15' },
  { emoji: '🐼', from: '#64748b', to: '#e2e8f0' },
  { emoji: '🐸', from: '#16a34a', to: '#a3e635' },
  { emoji: '🐯', from: '#ea580c', to: '#fbbf24' },
  { emoji: '🐧', from: '#0ea5e9', to: '#818cf8' },
  { emoji: '🦄', from: '#ec4899', to: '#a78bfa' },
]
