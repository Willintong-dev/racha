import { AnimatePresence, motion } from 'framer-motion'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useOutlet } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AuthProvider, useAuth } from './lib/auth'
import { DataProvider } from './lib/data'
import { SyncProvider } from './lib/syncProvider'
import { db } from './lib/db'
import { CelebrationLayer } from './components/CelebrationLayer'
import { QuickAddProvider } from './components/QuickAdd'
import { TabBar } from './components/TabBar'
import { Splash } from './screens/Splash'
import { Welcome } from './screens/Welcome'
import { AuthForm } from './screens/AuthForm'
import { Onboarding } from './screens/Onboarding'
import { Home } from './screens/Home'
import { Movements } from './screens/Movements'
import { Accounts } from './screens/Accounts'
import { AccountDetail } from './screens/AccountDetail'
import { Debts } from './screens/Debts'
import { DebtDetail } from './screens/DebtDetail'
import { DebtSimulator } from './screens/DebtSimulator'
import { Profile } from './screens/Profile'
import { Wardrobe } from './screens/Wardrobe'
import { Achievements } from './screens/Achievements'
import { Ranking } from './screens/Ranking'
import { GameEngine } from './components/GameEngine'
import { ErrorBoundary } from './components/ErrorBoundary'

function AppLayout() {
  const location = useLocation()
  const outlet = useOutlet()
  return (
    <DataProvider>
      <QuickAddProvider>
        <div className="mx-auto min-h-dvh max-w-md pb-32">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {/* Si una pantalla se rompe, la barra de abajo sigue viva; al cambiar de ruta se reintenta */}
              <ErrorBoundary resetKey={location.pathname}>{outlet}</ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
        <TabBar />
        <GameEngine />
      </QuickAddProvider>
    </DataProvider>
  )
}

function Root() {
  const { user, loading } = useAuth()
  // Guardamos el uid junto al perfil para no usar un resultado viejo justo después de iniciar sesión
  const res = useLiveQuery(
    async () => ({ uid: user?.id, profile: user ? ((await db.profiles.get(user.id)) ?? null) : null }),
    [user?.id],
  )

  if (loading || (user && (!res || res.uid !== user.id))) return <Splash />

  if (!user) {
    return (
      <Routes>
        <Route path="/bienvenida" element={<Welcome />} />
        <Route path="/registro" element={<AuthForm kind="registro" />} />
        <Route path="/login" element={<AuthForm kind="login" />} />
        <Route path="*" element={<Navigate to="/bienvenida" replace />} />
      </Routes>
    )
  }

  if (!res?.profile?.onboarded) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="movimientos" element={<Movements />} />
        <Route path="cuentas" element={<Accounts />} />
        <Route path="cuentas/:id" element={<AccountDetail />} />
        <Route path="deudas" element={<Debts />} />
        <Route path="deudas/simulador" element={<DebtSimulator />} />
        <Route path="deudas/:id" element={<DebtDetail />} />
        <Route path="perfil" element={<Profile />} />
        <Route path="perfil/vestidor" element={<Wardrobe />} />
        <Route path="perfil/logros" element={<Achievements />} />
        <Route path="perfil/ranking" element={<Ranking />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    // Última red: cualquier error de renderizado muestra "Algo salió mal" en vez de una pantalla en blanco
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <SyncProvider>
            <Root />
          </SyncProvider>
          <CelebrationLayer />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
