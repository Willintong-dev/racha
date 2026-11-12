import { useEffect, useRef } from 'react'
import { useData } from '../lib/data'
import { applyFreezes, unlockAchievements } from '../lib/actions'
import { daysToFreeze, freezesOf, newlyEarned } from '../lib/game'
import { addDays, todayStr } from '../lib/format'

/**
 * Componente sin interfaz: vigila los datos y
 * 1) salva la racha con congeladores si ayer no cumpliste (solo si venías con racha),
 * 2) desbloquea los logros que ya se cumplieron.
 * Los candados `busy` evitan disparar la misma acción dos veces mientras la base de datos se actualiza.
 */
export function GameEngine() {
  const { userId, profile, txs, accounts, debts, streak, level, toMain } = useData()
  const freezing = useRef(false)
  const unlocking = useRef(false)

  useEffect(() => {
    if (freezing.current) return
    const days = daysToFreeze(streak.isGood, streak.frozenDays, freezesOf(profile))
    if (!days.length) return
    // Racha resultante: desde ayer hacia atrás contando días buenos y congelados (+ hoy si ya cumpliste)
    const kept = new Set([...streak.frozenDays, ...days])
    let n = streak.todayDone ? 1 : 0
    for (let d = addDays(todayStr(), -1); streak.isGood(d) || kept.has(d); d = addDays(d, -1)) n++
    freezing.current = true
    applyFreezes(userId, days, n).finally(() => {
      freezing.current = false
    })
  }, [streak, profile, userId])

  useEffect(() => {
    if (unlocking.current) return
    const earned = newlyEarned({ txs, accounts, debts, profile, level: level.level, streak, toMain })
    if (!earned.length) return
    unlocking.current = true
    unlockAchievements(userId, earned).finally(() => {
      unlocking.current = false
    })
  }, [txs, accounts, debts, profile, level, streak, toMain, userId])

  return null
}
