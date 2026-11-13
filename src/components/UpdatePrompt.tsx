import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Cada cuánto preguntar al servidor si hay un service worker nuevo */
const CHECK_EVERY_MS = 30 * 60 * 1000

/**
 * Registra el service worker y avisa cuando hay una versión nueva desplegada.
 * Vive en main.tsx (no en App) para que los arneses que montan <App/> no dependan
 * del módulo virtual de vite-plugin-pwa.
 */
export function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      const check = async () => {
        // Sin red o con el SW instalándose, no tiene sentido preguntar
        if (registration.installing || !navigator.onLine) return
        try {
          // Evita que una caché HTTP intermedia devuelva el sw.js viejo
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
          if (res.status === 200) await registration.update()
        } catch {
          /* sin conexión: se reintenta en la próxima revisión */
        }
      }
      setInterval(check, CHECK_EVERY_MS)
      // En el celular la PWA vuelve del segundo plano sin recargar: revisar al volver a verla
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void check()
      })
    },
  })

  const show = needRefresh && !dismissed

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-[70] flex justify-center px-4">
      <AnimatePresence>
        {show && (
          <motion.div
            key="update"
            role="status"
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9, transitionEnd: { display: 'none' } }}
            transition={{ type: 'spring', damping: 18, stiffness: 240 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-card2 py-2.5 pr-2.5 pl-4 shadow-xl shadow-black/40"
          >
            <p className="flex-1 text-sm leading-snug font-bold text-ink">🚀 Hay una versión nueva de Racha</p>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-full px-2 py-1.5 text-xs font-bold text-muted"
            >
              Luego
            </button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => void updateServiceWorker(true)}
              className="grad rounded-full px-4 py-2 text-sm font-extrabold text-white shadow-lg shadow-accent/30"
            >
              Actualizar
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
