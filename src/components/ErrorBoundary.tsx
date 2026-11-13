import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Qué mostrar si algo de adentro se rompe. Por defecto, la pantalla "Algo salió mal". */
  fallback?: (reset: () => void) => ReactNode
  /** Si cambia (p. ej. la ruta), se vuelve a intentar mostrar el contenido */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

/**
 * Atrapa errores de renderizado para que un dato raro no deje la app en blanco.
 * Tiene que ser un componente de clase: React no tiene hooks para esto.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[Racha] Error en la interfaz', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return this.props.fallback ? this.props.fallback(this.reset) : <CrashScreen />
  }
}

const home = () => {
  const base = import.meta.env.BASE_URL || '/'
  window.location.assign(base)
}

/** Pantalla amable cuando algo se rompió: recargar o volver al inicio. Sin dependencias de la app. */
export function CrashScreen() {
  return (
    <div role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-6xl" aria-hidden>
        😵
      </div>
      <h1 className="mt-4 text-2xl font-black">Algo salió mal</h1>
      <p className="mt-2 text-sm text-muted">
        Tuvimos un problema mostrando esta pantalla. Tus datos están a salvo en este dispositivo. Recarga para intentarlo de nuevo.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="grad mt-6 w-full rounded-2xl py-4 text-base font-extrabold text-white shadow-lg shadow-accent/30"
      >
        Recargar
      </button>
      <button type="button" onClick={home} className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-muted">
        Volver al inicio
      </button>
    </div>
  )
}
