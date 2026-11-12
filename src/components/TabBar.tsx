import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, List, Plus, TrendingDown, Wallet } from 'lucide-react'
import { useQuickAdd } from './QuickAdd'

const LEFT = [
  { to: '/', icon: Home, label: 'Inicio' },
  { to: '/movimientos', icon: List, label: 'Movimientos' },
]
const RIGHT = [
  { to: '/cuentas', icon: Wallet, label: 'Cuentas' },
  { to: '/deudas', icon: TrendingDown, label: 'Deudas' },
]

function Tab({ to, icon: Icon, label }: (typeof LEFT)[number]) {
  return (
    <NavLink to={to} end={to === '/'} className="relative flex flex-1 flex-col items-center gap-0.5 py-2">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="tab-pill"
              className="absolute inset-x-2 inset-y-1 rounded-2xl bg-accent/15"
              transition={{ type: 'spring', damping: 26, stiffness: 380 }}
            />
          )}
          <Icon size={22} className={`relative ${isActive ? 'text-accent' : 'text-muted'}`} strokeWidth={isActive ? 2.6 : 2} />
          <span className={`relative text-[10px] font-bold ${isActive ? 'text-ink' : 'text-muted'}`}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function TabBar() {
  const quickAdd = useQuickAdd()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center px-2">
        {LEFT.map((t) => (
          <Tab key={t.to} {...t} />
        ))}
        <div className="flex flex-1 justify-center">
          <motion.button
            type="button"
            aria-label="Registrar movimiento"
            onClick={() => quickAdd()}
            whileTap={{ scale: 0.85, rotate: 90 }}
            whileHover={{ scale: 1.05 }}
            className="grad -mt-7 grid h-16 w-16 place-items-center rounded-full text-white shadow-xl shadow-accent/40 ring-4 ring-bg"
          >
            <Plus size={32} strokeWidth={3} />
          </motion.button>
        </div>
        {RIGHT.map((t) => (
          <Tab key={t.to} {...t} />
        ))}
      </div>
    </nav>
  )
}
