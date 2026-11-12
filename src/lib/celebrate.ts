export type CelebrateEvent =
  | { kind: 'xp'; amount: number; label?: string }
  | { kind: 'levelup'; level: number }
  | { kind: 'payoff'; name: string; emoji: string }
  | { kind: 'warn'; text: string }
  | { kind: 'info'; text: string }

type Listener = (e: CelebrateEvent) => void
const listeners = new Set<Listener>()

export const celebrate = {
  emit(e: CelebrateEvent) {
    listeners.forEach((l) => l(e))
  },
  on(l: Listener) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}
