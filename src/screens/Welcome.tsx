import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { BigButton } from '../components/ui'

const SLIDES = [
  { emoji: '⚡', title: 'Registra en 3 toques', text: 'Monto, categoría, listo. Sin formularios eternos.' },
  { emoji: '🎯', title: 'Mata tus deudas', text: 'Te decimos qué pagar primero y cuándo quedas libre.' },
  { emoji: '🏆', title: 'Sube de nivel', text: 'Cada buen día suma a tu racha y mejora tu avatar.' },
]

export function Welcome() {
  const [i, setI] = useState(0)
  const navigate = useNavigate()
  const go = (n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n)))

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <div className="flex items-center gap-2">
        <img src="/icon.svg" alt="" className="h-9 w-9" />
        <span className="text-xl font-black">Racha</span>
      </div>

      <motion.div
        className="flex flex-1 cursor-grab touch-pan-y flex-col items-center justify-center text-center select-none"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50) go(i + 1)
          else if (info.offset.x > 50) go(i - 1)
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="text-8xl"
              animate={{ y: [0, -12, 0], rotate: [0, 4, -4, 0] }}
              transition={{ repeat: Infinity, duration: 2.6 }}
            >
              {SLIDES[i].emoji}
            </motion.div>
            <h1 className="mt-8 text-3xl font-black">{SLIDES[i].title}</h1>
            <p className="mx-auto mt-3 max-w-72 text-lg text-muted">{SLIDES[i].text}</p>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="mb-8 flex justify-center gap-2">
        {SLIDES.map((_, n) => (
          <motion.button
            key={n}
            type="button"
            aria-label={`Slide ${n + 1}`}
            onClick={() => setI(n)}
            className="h-2.5 rounded-full"
            animate={{ width: n === i ? 28 : 10, background: n === i ? '#8b5cf6' : '#2a2a42' }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <BigButton onClick={() => navigate('/registro')}>Crear cuenta</BigButton>
        <BigButton variant="ghost" onClick={() => navigate('/login')}>
          Iniciar sesión
        </BigButton>
      </div>
    </div>
  )
}
