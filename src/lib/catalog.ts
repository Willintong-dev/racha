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

export const catById = (id?: string) => CATEGORIES.find((c) => c.id === id)

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
}

export const DEBT_PRESETS: MonthlyPreset[] = [
  { name: 'Tarjeta de crédito', emoji: '💳' },
  { name: 'Préstamo', emoji: '🏦' },
  { name: 'Carro o moto', emoji: '🚗' },
  { name: 'Hipoteca', emoji: '🏠' },
  { name: 'Crédito de estudio', emoji: '🎓' },
  { name: 'Otra deuda', emoji: '📄' },
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
  { name: 'Otro', emoji: '📌' },
]

export const AVATARS = [
  { emoji: '🦊', from: '#f97316', to: '#facc15' },
  { emoji: '🐼', from: '#64748b', to: '#e2e8f0' },
  { emoji: '🐸', from: '#16a34a', to: '#a3e635' },
  { emoji: '🐯', from: '#ea580c', to: '#fbbf24' },
  { emoji: '🐧', from: '#0ea5e9', to: '#818cf8' },
  { emoji: '🦄', from: '#ec4899', to: '#a78bfa' },
]
