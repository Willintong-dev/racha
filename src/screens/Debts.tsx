import { motion } from 'framer-motion'
import { Page } from '../components/ui'

export function Debts() {
  return (
    <Page>
      <h1 className="text-2xl font-black">Deudas</h1>
      <div className="mt-16 flex flex-col items-center text-center">
        <motion.div className="text-7xl" animate={{ rotate: [0, -8, 8, 0], y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.5 }}>
          🚧
        </motion.div>
        <p className="mt-4 text-xl font-black">Llega en la Fase 2</p>
        <p className="mt-2 max-w-72 text-muted">
          Registrar deudas, pagar cuotas con un toque y el simulador Avalancha vs Bola de nieve.
        </p>
      </div>
    </Page>
  )
}
