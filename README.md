# 🔥 Racha

App de finanzas personales (PWA) para registrar ingresos y gastos en segundos, manejar varias cuentas y monedas, salir de deudas y subir de nivel con buenos hábitos.

## Qué hace hoy (Fase 1)

- **Registro rápido:** monto → categoría → ✓. Desliza el monto para cambiar entre gasto e ingreso.
- **Varias cuentas y monedas:** una cuenta principal (nómina), transferencias entre cuentas (no cuentan como gasto ni ingreso) y tasas de cambio aprendidas de tus transferencias.
- **Límite diario sugerido:** (ingreso − cuotas de deudas − gastos fijos − ahorro) ÷ 30. Los gastos fijos no cuentan contra el límite.
- **Racha y niveles:** un día cuenta si registras algo y no te pasas del límite. Cada movimiento da XP.
- **Funciona sin internet:** los datos viven en el dispositivo (IndexedDB).

## Próximas fases

2. Deudas: pagar cuotas con un toque y simulador Avalancha vs Bola de nieve.
3. Logros, vestidor del avatar y congeladores de racha.
4. Ranking opcional de salud financiera (solo puntajes, nunca montos) y sincronización en la nube.

## Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Para probar en el celular, usa la URL "Network" que muestra Vite (mismo Wi-Fi).

### Login con Supabase (opcional)

Sin configuración, la app funciona en **modo local**: las cuentas de usuario y los datos quedan solo en ese navegador. Para login real y Google:

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. Copia `.env.example` como `.env.local` y pega la URL y la anon key del proyecto.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Framer Motion · Dexie (IndexedDB) · Supabase Auth · vite-plugin-pwa
