import { motion, type Transition } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Personajes en SVG construidos con principios de "shape language":
 *  - Solo 3 formas base: rectángulos redondeados, medios círculos y triángulos redondeados.
 *  - Nada puntiagudo (los triángulos se redondean con un trazo del mismo color y uniones redondas).
 *  - ~15 formas por personaje, vista plana de frente, colores planos y pocos colores, sin contornos.
 *  - Proporciones exageradas: cabeza grande (rect. redondeado), cuerpo pequeño, ojos grandes que no son píldoras.
 *  - Detalles flotantes: pies separados del cuerpo, cachetes sueltos.
 *
 * Esqueleto común (viewBox 0 0 120 120): cabeza x26–94 y16–76, ojos y≈46, cuerpo y74–102,
 * pies flotando en y≈107, suelo y≈117. Los accesorios se anclan a la coronilla (y=16) o a los ojos.
 */

const INK = '#2b2340'

// ---------------------------------------------------------------------------
// Formas base
// ---------------------------------------------------------------------------

/** Medio círculo con la base plana abajo (cúpula). */
const dome = (cx: number, y: number, r: number) => `M${cx - r} ${y} A${r} ${r} 0 0 1 ${cx + r} ${y} Z`
/** Medio círculo con la base plana arriba (cuenco). */
const bowl = (cx: number, y: number, r: number) => `M${cx - r} ${y} A${r} ${r} 0 0 0 ${cx + r} ${y} Z`

/** Triángulo redondeado: relleno + trazo del mismo color con uniones redondas. */
function RTri({ d, fill, r = 6 }: { d: string; fill: string; r?: number }) {
  return <path d={d} fill={fill} stroke={fill} strokeWidth={r} strokeLinejoin="round" />
}

// ---------------------------------------------------------------------------
// Especies
// ---------------------------------------------------------------------------

interface Species {
  name: string
  head: string
  body: string
  belly: string
  arms: string
  feet: string
  /** Centros de los ojos */
  eyes: [number, number, number, number]
  /** 'dark' = ojos grandes oscuros con brillo; 'white' = blanco + pupila (rana, panda) */
  eyeStyle?: 'dark' | 'white'
  /** Desplazamiento vertical de los sombreros respecto a la coronilla estándar */
  hatDy?: number
  ears?: ReactNode
  /** Cabeza propia (si no es el rectángulo redondeado estándar) */
  headShape?: ReactNode
  /** Marcas de la cara (máscara, manchas, rayas) — debajo de los ojos */
  face?: ReactNode
  /** Hocico + nariz (encima de la máscara) */
  snout?: ReactNode
  /** Sobre la cabeza (cuerno, melena) — se oculta con sombrero */
  crown?: ReactNode
  tail?: ReactNode
  mouth?: 'smile' | 'wide' | 'none'
}

const HEAD = <rect x="26" y="16" width="68" height="60" rx="26" />

const SPECIES: Species[] = [
  // 0 · Zorro — naranja, máscara blanca, orejas triangulares
  {
    name: 'Zorro', head: '#ff8a3d', body: '#ff8a3d', belly: '#fff3e3', arms: '#e46f22', feet: '#5b2e1a', eyes: [47, 46, 73, 46],
    ears: (
      <>
        <RTri d="M30 30 L34 6 L52 20 Z" fill="#ff8a3d" />
        <RTri d="M35 23 L37 12 L45 19 Z" fill="#5b2e1a" r={4} />
        <RTri d="M90 30 L86 6 L68 20 Z" fill="#ff8a3d" />
        <RTri d="M85 23 L83 12 L75 19 Z" fill="#5b2e1a" r={4} />
      </>
    ),
    face: <path d="M26 50 Q43 48 60 58 Q77 48 94 50 L94 50 Q94 76 68 76 L52 76 Q26 76 26 50 Z" fill="#fff3e3" />,
    snout: <RTri d="M56 58 L64 58 L60 63 Z" fill={INK} r={4} />,
    tail: (
      <>
        <path d="M78 96 Q108 100 106 72 Q104 62 94 66 Q98 86 76 88 Z" fill="#ff8a3d" />
        <path d={dome(100, 74, 7)} transform="rotate(-20 100 74)" fill="#fff3e3" />
      </>
    ),
  },
  // 1 · Panda — blanco y negro, ojos blancos sobre manchas
  {
    name: 'Panda', head: '#ffffff', body: '#2f2f3a', belly: '#ffffff', arms: '#2f2f3a', feet: '#2f2f3a', eyes: [47, 47, 73, 47], eyeStyle: 'white',
    ears: (
      <>
        <circle cx="33" cy="20" r="11" fill="#2f2f3a" />
        <circle cx="87" cy="20" r="11" fill="#2f2f3a" />
      </>
    ),
    face: (
      <>
        <rect x="37" y="37" width="20" height="23" rx="10" transform="rotate(-18 47 48)" fill="#2f2f3a" />
        <rect x="63" y="37" width="20" height="23" rx="10" transform="rotate(18 73 48)" fill="#2f2f3a" />
      </>
    ),
    snout: <RTri d="M56 60 L64 60 L60 64 Z" fill="#2f2f3a" r={4} />,
  },
  // 2 · Rana — cabeza ancha, ojos en cúpulas
  {
    name: 'Rana', head: '#58c25b', body: '#58c25b', belly: '#d9f7c4', arms: '#43a447', feet: '#43a447', eyes: [41, 26, 79, 26], eyeStyle: 'white', hatDy: -6, mouth: 'wide',
    headShape: (
      <>
        <rect x="20" y="28" width="80" height="48" rx="24" fill="#58c25b" />
        <circle cx="41" cy="27" r="14" fill="#58c25b" />
        <circle cx="79" cy="27" r="14" fill="#58c25b" />
      </>
    ),
  },
  // 3 · Tigre — orejas en cúpula, rayas como triángulos redondeados
  {
    name: 'Tigre', head: '#ffa62b', body: '#ffa62b', belly: '#fff3e0', arms: '#f28c00', feet: '#f28c00', eyes: [47, 45, 73, 45],
    ears: (
      <>
        <path d={dome(35, 24, 11)} fill="#ffa62b" />
        <path d={dome(35, 24, 6)} fill="#ffe0b2" />
        <path d={dome(85, 24, 11)} fill="#ffa62b" />
        <path d={dome(85, 24, 6)} fill="#ffe0b2" />
      </>
    ),
    face: (
      <>
        <RTri d="M54 17 L66 17 L60 30 Z" fill="#4a2a12" r={4} />
        <rect x="26" y="40" width="10" height="3.6" rx="1.8" fill="#4a2a12" />
        <rect x="26" y="47" width="7" height="3.6" rx="1.8" fill="#4a2a12" />
        <rect x="84" y="40" width="10" height="3.6" rx="1.8" fill="#4a2a12" />
        <rect x="87" y="47" width="7" height="3.6" rx="1.8" fill="#4a2a12" />
      </>
    ),
    snout: (
      <>
        <path d={bowl(60, 55, 14)} fill="#fff3e0" />
        <RTri d="M56 56 L64 56 L60 60 Z" fill="#ff6f91" r={4} />
      </>
    ),
    tail: (
      <>
        <path d="M80 98 Q104 102 104 80" fill="none" stroke="#ffa62b" strokeWidth="8" strokeLinecap="round" />
        <path d="M100 86 L108 84" stroke="#4a2a12" strokeWidth="3.5" strokeLinecap="round" />
      </>
    ),
  },
  // 4 · Pingüino — máscara blanca, pico triangular redondeado
  {
    name: 'Pingüino', head: '#33415c', body: '#33415c', belly: '#ffffff', arms: '#2a3650', feet: '#ff9f1c', eyes: [48, 45, 72, 45],
    face: (
      <>
        <rect x="32" y="28" width="56" height="44" rx="20" fill="#ffffff" />
        <path d={dome(60, 30, 10)} fill="#33415c" />
      </>
    ),
    snout: <RTri d="M54 56 L66 56 L60 63 Z" fill="#ff9f1c" r={5} />,
    mouth: 'none',
  },
  // 5 · Unicornio — lila claro, melena de círculos, cuerno triangular redondeado
  {
    name: 'Unicornio', head: '#f7f1ff', body: '#f7f1ff', belly: '#ece0ff', arms: '#e6dcff', feet: '#b9a7f5', eyes: [47, 47, 73, 47],
    ears: (
      <>
        <RTri d="M32 30 L36 10 L50 22 Z" fill="#f7f1ff" />
        <RTri d="M37 24 L39 15 L45 21 Z" fill="#ffadd6" r={3} />
        <RTri d="M88 30 L84 10 L70 22 Z" fill="#f7f1ff" />
        <RTri d="M83 24 L81 15 L75 21 Z" fill="#ffadd6" r={3} />
      </>
    ),
    face: (
      <>
        <circle cx="28" cy="34" r="8" fill="#ffadd6" />
        <circle cx="25" cy="48" r="7" fill="#c3b1ff" />
        <circle cx="27" cy="61" r="6" fill="#9cd2ff" />
      </>
    ),
    crown: (
      <>
        <RTri d="M55 18 L60 -2 L65 18 Z" fill="#ffd23f" r={4} />
        <circle cx="47" cy="17" r="6" fill="#c3b1ff" />
        <circle cx="73" cy="17" r="6" fill="#9cd2ff" />
      </>
    ),
    tail: (
      <>
        <circle cx="86" cy="96" r="7" fill="#ffadd6" />
        <circle cx="94" cy="89" r="6" fill="#c3b1ff" />
        <circle cx="99" cy="81" r="5" fill="#9cd2ff" />
      </>
    ),
  },
]

export const SPECIES_NAMES = SPECIES.map((s) => s.name)

const loop = (duration: number, extra: Partial<Transition> = {}): Transition => ({ repeat: Infinity, duration, ease: 'easeInOut', ...extra })
const box = (origin: string) => ({ transformBox: 'fill-box' as const, transformOrigin: origin })

/** Personaje completo (como <g>, dentro de un <svg> con viewBox que contenga 0 0 120 120). */
export function Character({ species, hat, happy = 0, still }: { species: number; hat?: string; happy?: number; still?: boolean }) {
  const s = SPECIES[species] ?? SPECIES[0]
  const [lx, ly, rx, ry] = s.eyes
  const wearsHat = !!hat && hat !== 'hat_gafas' && hat !== 'hat_moño'
  const isHappy = happy > 0
  const anim = !still

  return (
    <motion.g
      key={happy}
      initial={isHappy ? { y: 0 } : false}
      animate={isHappy ? { y: [0, -16, 0, -5, 0] } : undefined}
      transition={{ duration: 0.7 }}
    >
      {/* Sombra suave */}
      <motion.ellipse
        cx="60" cy="117" rx="22" ry="3" fill="#000" opacity="0.2"
        animate={anim ? { scaleX: [1, 0.92, 1] } : undefined} transition={loop(2.6)} style={box('center')}
      />

      {/* Pies flotantes: se mueven un poco desfasados del cuerpo */}
      <motion.g animate={anim ? { y: [0, -1, 0] } : undefined} transition={loop(2.6, { delay: 0.15 })}>
        <path d={bowl(50, 106, 7)} fill={s.feet} />
        <path d={bowl(70, 106, 7)} fill={s.feet} />
      </motion.g>

      <motion.g animate={anim ? { y: [0, -2.2, 0] } : undefined} transition={loop(2.6)}>
        {s.tail && (
          <motion.g animate={anim ? { rotate: [0, 9, 0, -4, 0] } : undefined} transition={loop(1.6, { repeatDelay: 0.8 })} style={box('0% 100%')}>
            {s.tail}
          </motion.g>
        )}

        {/* Cuerpo pequeño (rect. redondeado) + barriga (cúpula) */}
        <motion.g animate={anim ? { scaleY: [1, 1.04, 1] } : undefined} transition={loop(2.6)} style={box('50% 100%')}>
          <rect x="39" y="72" width="42" height="30" rx="14" fill={s.body} />
          <path d={dome(60, 102, 13)} fill={s.belly} />
        </motion.g>

        {/* Brazos: pastillas cortas; saludan al estar feliz */}
        <motion.rect
          x="31" y="78" width="10" height="17" rx="5" fill={s.arms}
          animate={isHappy ? { rotate: [25, -50, 25] } : { rotate: 25 }} transition={{ duration: 0.6 }} style={box('80% 15%')}
        />
        <motion.rect
          x="79" y="78" width="10" height="17" rx="5" fill={s.arms}
          animate={isHappy ? { rotate: [-25, 50, -25] } : { rotate: -25 }} transition={{ duration: 0.6 }} style={box('20% 15%')}
        />

        {/* Cabeza grande */}
        {s.ears && (
          <motion.g animate={anim ? { rotate: [0, -4, 0, 3, 0] } : undefined} transition={loop(1.2, { repeatDelay: 3.5 })} style={box('50% 100%')}>
            {s.ears}
          </motion.g>
        )}
        {s.headShape ?? <g fill={s.head}>{HEAD}</g>}
        {s.face}
        {!wearsHat && s.crown}

        {/* Cachetes flotantes */}
        <rect x={lx - 13} y={ly + 9} width="9" height="5" rx="2.5" fill="#ff7a9c" opacity="0.5" />
        <rect x={rx + 4} y={ry + 9} width="9" height="5" rx="2.5" fill="#ff7a9c" opacity="0.5" />

        {/* Ojos grandes (rect. redondeados, no píldoras). Parpadean; felices = arcos */}
        {isHappy ? (
          <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
            <path d={`M${lx - 5} ${ly + 2} Q${lx} ${ly - 5} ${lx + 5} ${ly + 2}`} />
            <path d={`M${rx - 5} ${ry + 2} Q${rx} ${ry - 5} ${rx + 5} ${ry + 2}`} />
          </g>
        ) : (
          <motion.g
            animate={anim ? { scaleY: [1, 1, 0.1, 1] } : undefined}
            transition={{ repeat: Infinity, duration: 4.2, times: [0, 0.92, 0.96, 1] }}
            style={box('center')}
          >
            {s.eyeStyle === 'white' ? (
              <>
                <rect x={lx - 7.5} y={ly - 8} width="15" height="16" rx="7" fill="#fff" />
                <rect x={rx - 7.5} y={ry - 8} width="15" height="16" rx="7" fill="#fff" />
                <rect x={lx - 3} y={ly - 4.5} width="8" height="10" rx="4" fill={INK} />
                <rect x={rx - 5} y={ry - 4.5} width="8" height="10" rx="4" fill={INK} />
                <circle cx={lx + 2.6} cy={ly - 2} r="1.6" fill="#fff" />
                <circle cx={rx + 0.6} cy={ry - 2} r="1.6" fill="#fff" />
              </>
            ) : (
              <>
                <rect x={lx - 5.5} y={ly - 7.5} width="11" height="15" rx="5" fill={INK} />
                <rect x={rx - 5.5} y={ry - 7.5} width="11" height="15" rx="5" fill={INK} />
                <circle cx={lx + 1.8} cy={ly - 3} r="2.3" fill="#fff" />
                <circle cx={rx + 1.8} cy={ry - 3} r="2.3" fill="#fff" />
                <circle cx={lx - 1.6} cy={ly + 3.4} r="1" fill="#fff" />
                <circle cx={rx - 1.6} cy={ry + 3.4} r="1" fill="#fff" />
              </>
            )}
          </motion.g>
        )}

        {s.snout}

        {/* Boca */}
        {s.mouth === 'wide' ? (
          <path
            d={isHappy ? 'M44 56 Q60 74 76 56 Z' : 'M46 58 Q60 68 74 58'}
            stroke={INK} strokeWidth="3" strokeLinecap="round" fill={isHappy ? '#8c2f45' : 'none'}
          />
        ) : s.mouth === 'none' ? null : isHappy ? (
          <path d="M54 66 Q60 75 66 66 Z" fill="#8c2f45" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        ) : (
          <path d="M55 66 Q57.5 69 60 66 Q62.5 69 65 66" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        )}

        {hat && <Hat id={hat} dy={s.hatDy ?? 0} eyes={s.eyes} />}
      </motion.g>
    </motion.g>
  )
}

// ---------------------------------------------------------------------------
// Accesorios (dibujados para una coronilla en y=30 y escalados al ancho de la cabeza)
// ---------------------------------------------------------------------------

function Hat({ id, dy, eyes }: { id: string; dy: number; eyes: [number, number, number, number] }) {
  const [lx, ly, rx, ry] = eyes
  // Lleva la base del sombrero (y=30) a la coronilla (y=22) y lo agranda al ancho de la cabeza
  const onHead = `translate(0 ${dy - 8}) translate(60 30) scale(1.22) translate(-60 -30)`
  switch (id) {
    case 'hat_gorra':
      return (
        <g transform={`${onHead} rotate(-8 60 30)`}>
          <path d={dome(60, 31, 23)} fill="#3d8bff" />
          <path d="M60 8 L60 31" stroke="#2b6fe0" strokeWidth="2" />
          <rect x="56" y="27" width="46" height="7" rx="3.5" fill="#2b6fe0" />
          <circle cx="60" cy="8" r="3" fill="#2b6fe0" />
        </g>
      )
    case 'hat_sombrero':
      return (
        <g transform={`${onHead} rotate(-6 60 28)`}>
          <rect x="44" y="2" width="32" height="27" rx="5" fill="#2b2340" />
          <rect x="44" y="19" width="32" height="6" fill="#ff4d6d" />
          <rect x="33" y="26" width="54" height="7" rx="3.5" fill="#3a3152" />
        </g>
      )
    case 'hat_corona':
      return (
        <g transform={onHead}>
          <RTri d="M41 30 L42 13 L51 22 L60 7 L69 22 L78 13 L79 30 Z" fill="#ffd23f" r={5} />
          <circle cx="60" cy="24" r="3.4" fill="#ff4d6d" />
          <circle cx="48" cy="26" r="2.4" fill="#3d8bff" />
          <circle cx="72" cy="26" r="2.4" fill="#2ec27e" />
          <motion.g animate={{ scale: [0, 1, 0], rotate: [0, 90] }} transition={loop(1.8, { repeatDelay: 1 })} style={box('center')}>
            <RTri d="M88 8 L90 14 L96 16 L90 18 L88 24 L86 18 L80 16 L86 14 Z" fill="#fff3a6" r={1.5} />
          </motion.g>
        </g>
      )
    case 'hat_moño':
      return (
        <g transform={`translate(0 ${dy - 8})`}>
          <RTri d="M80 30 L68 22 L68 38 Z" fill="#ff5fa2" r={6} />
          <RTri d="M80 30 L92 22 L92 38 Z" fill="#ff5fa2" r={6} />
          <rect x="76.5" y="26" width="7" height="8" rx="3.5" fill="#d93d82" />
        </g>
      )
    case 'hat_birrete':
      return (
        <g transform={onHead}>
          <rect x="44" y="22" width="32" height="12" rx="5" fill="#2b2340" />
          <RTri d="M30 20 L60 9 L90 20 L60 30 Z" fill="#3a3152" r={4} />
          <circle cx="60" cy="19" r="2.2" fill="#ffd23f" />
          <motion.g animate={{ rotate: [-8, 10, -8] }} transition={loop(2.2)} style={{ transformBox: 'view-box', transformOrigin: '60px 19px' }}>
            <path d="M60 19 L84 23 L84 34" stroke="#ffd23f" strokeWidth="2" fill="none" strokeLinecap="round" />
            <rect x="81" y="33" width="6" height="9" rx="2.5" fill="#ffd23f" />
          </motion.g>
        </g>
      )
    case 'hat_vikingo':
      return (
        <g transform={onHead}>
          <path d={dome(60, 32, 25)} fill="#ffc62b" />
          <rect x="56" y="7" width="8" height="25" rx="3" fill="#f2a900" />
          <rect x="31" y="29" width="58" height="7" rx="3.5" fill="#f2a900" />
        </g>
      )
    case 'hat_gafas':
      return (
        <g>
          <rect x={lx - 10} y={ly - 8} width="20" height="16" rx="7" fill="#2b2340" />
          <rect x={rx - 10} y={ry - 8} width="20" height="16" rx="7" fill="#2b2340" />
          <rect x={lx + 9} y={ly - 2.5} width={rx - lx - 18} height="3.5" rx="1.75" fill="#2b2340" />
          <rect x={lx - 6} y={ly - 5} width="6" height="2.6" rx="1.3" fill="#fff" opacity="0.6" />
          <rect x={rx - 6} y={ry - 5} width="6" height="2.6" rx="1.3" fill="#fff" opacity="0.6" />
        </g>
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Mascotas (como <g> de 40×40): mismas reglas — formas redondeadas, ojos grandes, pies flotantes
// ---------------------------------------------------------------------------

export function Pet({ id, still }: { id: string; still?: boolean }) {
  const art = PETS[id]
  if (!art) return null
  return (
    <g>
      <ellipse cx="20" cy="40" rx="9" ry="1.8" fill="#000" opacity="0.2" />
      <motion.g
        animate={still ? undefined : { y: [0, -5, 0, 0], scaleY: [1, 1.05, 0.94, 1] }}
        transition={{ repeat: Infinity, duration: 1.4, times: [0, 0.35, 0.7, 1], repeatDelay: 1.2 }}
        style={box('50% 100%')}
      >
        {art}
      </motion.g>
    </g>
  )
}

/** Ojos de mascota: rectángulos redondeados oscuros con brillo */
const petEyes = (y = 18, x1 = 15, x2 = 25) => (
  <>
    <rect x={x1 - 2.4} y={y - 3.2} width="4.8" height="6.4" rx="2.2" fill={INK} />
    <rect x={x2 - 2.4} y={y - 3.2} width="4.8" height="6.4" rx="2.2" fill={INK} />
    <circle cx={x1 + 0.8} cy={y - 1.3} r="1" fill="#fff" />
    <circle cx={x2 + 0.8} cy={y - 1.3} r="1" fill="#fff" />
  </>
)
const petFeet = (c: string) => (
  <>
    <path d={bowl(15.5, 35.5, 3.2)} fill={c} />
    <path d={bowl(24.5, 35.5, 3.2)} fill={c} />
  </>
)

const PETS: Record<string, ReactNode> = {
  pet_pollito: (
    <>
      {petFeet('#ff9f1c')}
      <rect x="9" y="8" width="22" height="25" rx="11" fill="#ffd93d" />
      <path d="M17 8 Q19 3 21 7" stroke="#ffd93d" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {petEyes(17)}
      <RTri d="M18 22 L22 22 L20 25 Z" fill="#ff9f1c" r={2.5} />
      <path d="M7 24 L12 21 L16 25 L20 21 L24 25 L28 21 L33 24 L33 26 Q33 34 20 34 Q7 34 7 26 Z" fill="#fffaf0" />
    </>
  ),
  pet_perro: (
    <>
      {petFeet('#b07a45')}
      <rect x="11" y="24" width="18" height="11" rx="5.5" fill="#e9c896" />
      <rect x="8" y="6" width="24" height="21" rx="10" fill="#e9c896" />
      <rect x="3" y="8" width="8" height="15" rx="4" transform="rotate(14 7 15)" fill="#9b6233" />
      <rect x="29" y="8" width="8" height="15" rx="4" transform="rotate(-14 33 15)" fill="#9b6233" />
      {petEyes(15)}
      <path d={bowl(20, 20, 5.5)} fill="#fff4e3" />
      <rect x="17.8" y="19.2" width="4.4" height="3" rx="1.5" fill={INK} />
    </>
  ),
  pet_gato: (
    <>
      {petFeet('#7d8597')}
      <rect x="11" y="24" width="18" height="11" rx="5.5" fill="#a3acbd" />
      <RTri d="M10 12 L11 3 L18 8 Z" fill="#a3acbd" r={3} />
      <RTri d="M30 12 L29 3 L22 8 Z" fill="#a3acbd" r={3} />
      <rect x="8" y="6" width="24" height="21" rx="10" fill="#a3acbd" />
      {petEyes(15)}
      <RTri d="M18.8 20 L21.2 20 L20 21.6 Z" fill="#ff7a9c" r={1.5} />
      <rect x="4" y="20" width="7" height="1.4" rx="0.7" fill="#5b6273" />
      <rect x="29" y="20" width="7" height="1.4" rx="0.7" fill="#5b6273" />
    </>
  ),
  pet_buho: (
    <>
      {petFeet('#ff9f1c')}
      <RTri d="M10 9 L11 3 L16 7 Z" fill="#8d5a2b" r={3} />
      <RTri d="M30 9 L29 3 L24 7 Z" fill="#8d5a2b" r={3} />
      <rect x="7" y="5" width="26" height="30" rx="12" fill="#a86b32" />
      <path d={dome(20, 35, 9)} fill="#ffe2a8" />
      <rect x="9" y="10" width="10" height="11" rx="5" fill="#fff" />
      <rect x="21" y="10" width="10" height="11" rx="5" fill="#fff" />
      {petEyes(15.5, 14.5, 25.5)}
      <RTri d="M18.5 21 L21.5 21 L20 24 Z" fill="#ff9f1c" r={2} />
    </>
  ),
  pet_paloma: (
    <>
      {petFeet('#ff8fa3')}
      <RTri d="M30 24 L38 19 L37 30 Z" fill="#dfe4ee" r={3} />
      <rect x="8" y="16" width="26" height="18" rx="9" fill="#ffffff" />
      <rect x="6" y="6" width="16" height="16" rx="7" fill="#ffffff" />
      <rect x="18" y="21" width="12" height="7" rx="3.5" fill="#dfe4ee" />
      <rect x="10.6" y="11" width="4" height="5.4" rx="2" fill={INK} />
      <RTri d="M6 14 L2 16 L6 17.5 Z" fill="#ff9f1c" r={2} />
    </>
  ),
  pet_dragon: (
    <>
      {petFeet('#1e9e57')}
      <RTri d="M7 16 L1 8 L11 12 Z" fill="#a66bff" r={3} />
      <RTri d="M33 16 L39 8 L29 12 Z" fill="#a66bff" r={3} />
      <RTri d="M13 7 L14 2 L17 6 Z" fill="#ffd23f" r={2} />
      <RTri d="M27 7 L26 2 L23 6 Z" fill="#ffd23f" r={2} />
      <rect x="7" y="5" width="26" height="30" rx="12" fill="#2ec27e" />
      <path d={dome(20, 35, 9)} fill="#c8f7d8" />
      {petEyes(15)}
      <rect x="16.5" y="22" width="2" height="1.6" rx="0.8" fill="#155d35" />
      <rect x="21.5" y="22" width="2" height="1.6" rx="0.8" fill="#155d35" />
    </>
  ),
}
