import { motion, type Transition } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Personajes dibujados en SVG con un "esqueleto" común (viewBox 0 0 120 120):
 * cabeza centrada en (60,54) r≈30, ojos ~y57, cuerpo en (60,92), suelo en y≈113.
 * Como todos comparten las mismas medidas, los accesorios caen siempre sobre la cabeza o los ojos.
 */

const DARK = '#1f1630'

interface Species {
  head: string
  body: string
  belly: string
  limbs: string
  /** Centros de los ojos */
  eyes: [number, number, number, number]
  /** Ojos con esclerótica blanca (panda, rana) */
  scleraR?: number
  /** Cuánto subir/bajar los sombreros respecto a la coronilla estándar (y=24) */
  hatDy?: number
  ears?: ReactNode
  face?: ReactNode
  /** Dibujo extra sobre la cabeza (cuerno, melena…) — se oculta si lleva sombrero */
  crown?: ReactNode
  tail?: ReactNode
  /** Forma de la cabeza si no es un círculo */
  headShape?: ReactNode
  mouth?: 'smile' | 'beak' | 'wide'
}

const SPECIES: Species[] = [
  // 0 · Zorro
  {
    head: '#f28c38', body: '#f28c38', belly: '#fff4e6', limbs: '#3b2416', eyes: [49, 57, 71, 57],
    ears: (
      <>
        <path d="M36 38 L30 10 L54 28 Z" fill="#f28c38" />
        <path d="M37 33 L33 15 L48 27 Z" fill="#3b2416" />
        <path d="M84 38 L90 10 L66 28 Z" fill="#f28c38" />
        <path d="M83 33 L87 15 L72 27 Z" fill="#3b2416" />
      </>
    ),
    face: (
      <>
        <path d="M33 58 Q60 46 87 58 Q84 84 60 85 Q36 84 33 58 Z" fill="#fff4e6" />
        <ellipse cx="60" cy="65" rx="3.2" ry="2.4" fill="#2b1a12" />
      </>
    ),
    tail: (
      <>
        <path d="M78 100 Q112 98 108 70 Q106 58 96 64 Q100 84 76 92 Z" fill="#f28c38" />
        <path d="M108 70 Q106 58 96 64 Q99 70 106 76 Z" fill="#fff4e6" />
      </>
    ),
  },
  // 1 · Panda
  {
    head: '#ffffff', body: '#ffffff', belly: '#f1f1f6', limbs: '#2a2a35', eyes: [49, 57, 71, 57], scleraR: 4.2,
    ears: (
      <>
        <circle cx="37" cy="30" r="10" fill="#2a2a35" />
        <circle cx="83" cy="30" r="10" fill="#2a2a35" />
      </>
    ),
    face: (
      <>
        <ellipse cx="48" cy="57" rx="8" ry="10" transform="rotate(-28 48 57)" fill="#2a2a35" />
        <ellipse cx="72" cy="57" rx="8" ry="10" transform="rotate(28 72 57)" fill="#2a2a35" />
        <ellipse cx="60" cy="67" rx="3.4" ry="2.4" fill="#2a2a35" />
      </>
    ),
  },
  // 2 · Rana
  {
    head: '#6cc04a', body: '#6cc04a', belly: '#d8f5b8', limbs: '#4fa233', eyes: [44, 34, 76, 34], scleraR: 7, hatDy: -10, mouth: 'wide',
    headShape: (
      <>
        <ellipse cx="60" cy="58" rx="33" ry="26" fill="#6cc04a" />
        <circle cx="44" cy="35" r="12" fill="#6cc04a" />
        <circle cx="76" cy="35" r="12" fill="#6cc04a" />
      </>
    ),
  },
  // 3 · Tigre
  {
    head: '#f59e0b', body: '#f59e0b', belly: '#fff7ed', limbs: '#f59e0b', eyes: [49, 56, 71, 56],
    ears: (
      <>
        <circle cx="37" cy="31" r="9" fill="#f59e0b" />
        <circle cx="37" cy="31" r="5" fill="#ffd6a5" />
        <circle cx="83" cy="31" r="9" fill="#f59e0b" />
        <circle cx="83" cy="31" r="5" fill="#ffd6a5" />
      </>
    ),
    face: (
      <>
        <ellipse cx="60" cy="68" rx="14" ry="10" fill="#fff7ed" />
        <g stroke="#3b2416" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M53 27 Q55 32 53 37" />
          <path d="M60 25 L60 36" />
          <path d="M67 27 Q65 32 67 37" />
          <path d="M31 52 L38 54" />
          <path d="M31 60 L37 60" />
          <path d="M89 52 L82 54" />
          <path d="M89 60 L83 60" />
        </g>
        <path d="M56 63 L64 63 L60 67 Z" fill="#f472b6" />
      </>
    ),
    tail: <path d="M80 100 Q104 104 104 84 Q104 76 98 78" fill="none" stroke="#f59e0b" strokeWidth="7" strokeLinecap="round" />,
  },
  // 4 · Pingüino
  {
    head: '#2e3a59', body: '#2e3a59', belly: '#ffffff', limbs: '#f59e0b', eyes: [50, 55, 70, 55], mouth: 'beak',
    face: <path d="M60 38 C50 26 32 36 36 56 C38 72 52 80 60 80 C68 80 82 72 84 56 C88 36 70 26 60 38 Z" fill="#ffffff" />,
  },
  // 5 · Unicornio
  {
    head: '#fbf7ff', body: '#fbf7ff', belly: '#f3e8ff', limbs: '#c4b5fd', eyes: [49, 57, 71, 57],
    ears: (
      <>
        <path d="M38 36 L34 16 L52 28 Z" fill="#fbf7ff" />
        <path d="M39 32 L37 21 L47 28 Z" fill="#f9a8d4" />
        <path d="M82 36 L86 16 L68 28 Z" fill="#fbf7ff" />
        <path d="M81 32 L83 21 L73 28 Z" fill="#f9a8d4" />
      </>
    ),
    face: (
      <>
        <circle cx="34" cy="44" r="8" fill="#f9a8d4" />
        <circle cx="31" cy="56" r="7" fill="#c4b5fd" />
        <circle cx="33" cy="67" r="6" fill="#93c5fd" />
      </>
    ),
    crown: (
      <>
        <circle cx="48" cy="27" r="7" fill="#c4b5fd" />
        <circle cx="72" cy="27" r="7" fill="#93c5fd" />
        <path d="M55 28 L60 3 L65 28 Z" fill="#facc15" />
        <path d="M57 20 L63 18 M58 13 L62 12" stroke="#ca8a04" strokeWidth="1.5" />
      </>
    ),
    tail: (
      <>
        <circle cx="86" cy="96" r="7" fill="#f9a8d4" />
        <circle cx="93" cy="90" r="6" fill="#c4b5fd" />
        <circle cx="97" cy="82" r="5" fill="#93c5fd" />
      </>
    ),
  },
]

export const SPECIES_NAMES = ['Zorro', 'Panda', 'Rana', 'Tigre', 'Pingüino', 'Unicornio']

const loop = (duration: number, extra: Partial<Transition> = {}): Transition => ({ repeat: Infinity, duration, ease: 'easeInOut', ...extra })
const box = (origin: string) => ({ transformBox: 'fill-box' as const, transformOrigin: origin })

/** Personaje completo (como <g>, para usar dentro de un <svg viewBox> de 120×120). */
export function Character({ species, hat, happy = 0, still }: { species: number; hat?: string; happy?: number; still?: boolean }) {
  const s = SPECIES[species] ?? SPECIES[0]
  const [lx, ly, rx, ry] = s.eyes
  const wearsHat = !!hat && hat !== 'hat_gafas' && hat !== 'hat_moño'
  const isHappy = happy > 0
  const anim = !still

  return (
    <motion.g
      key={happy}
      // Al tocar: salto con estiramiento
      initial={isHappy ? { y: 0 } : false}
      animate={isHappy ? { y: [0, -16, 0, -5, 0] } : undefined}
      transition={{ duration: 0.7 }}
    >
      {/* Sombra en el suelo */}
      <motion.ellipse
        cx="60" cy="114" rx="24" ry="3.5" fill="#000" opacity="0.22"
        animate={anim ? { scaleX: [1, 0.94, 1] } : undefined}
        transition={loop(2.6)}
        style={box('center')}
      />
      {/* Todo el cuerpo flota un poco */}
      <motion.g animate={anim ? { y: [0, -1.8, 0] } : undefined} transition={loop(2.6)}>
        {s.tail && (
          <motion.g animate={anim ? { rotate: [0, 10, 0, -4, 0] } : undefined} transition={loop(1.6, { repeatDelay: 0.8 })} style={box('0% 100%')}>
            {s.tail}
          </motion.g>
        )}
        {/* Pies */}
        <ellipse cx="49" cy="110" rx="7.5" ry="4" fill={s.limbs} />
        <ellipse cx="71" cy="110" rx="7.5" ry="4" fill={s.limbs} />
        {/* Cuerpo que respira */}
        <motion.g animate={anim ? { scaleY: [1, 1.035, 1] } : undefined} transition={loop(2.6)} style={box('50% 100%')}>
          <ellipse cx="60" cy="92" rx="23" ry="20" fill={s.body} />
          <ellipse cx="60" cy="96" rx="14" ry="13" fill={s.belly} />
        </motion.g>
        {/* Brazos: saludan al estar feliz */}
        <motion.ellipse
          cx="38" cy="90" rx="6" ry="9.5" fill={species === 1 ? '#2a2a35' : s.body}
          stroke="rgba(0,0,0,.08)"
          animate={isHappy ? { rotate: [20, -40, 20] } : { rotate: 20 }}
          transition={{ duration: 0.6 }}
          style={box('70% 20%')}
        />
        <motion.ellipse
          cx="82" cy="90" rx="6" ry="9.5" fill={species === 1 ? '#2a2a35' : s.body}
          stroke="rgba(0,0,0,.08)"
          animate={isHappy ? { rotate: [-20, 40, -20] } : { rotate: -20 }}
          transition={{ duration: 0.6 }}
          style={box('30% 20%')}
        />

        {/* Cabeza */}
        <g>
          {s.ears && (
            <motion.g animate={anim ? { rotate: [0, -5, 0, 4, 0] } : undefined} transition={loop(1.2, { repeatDelay: 3.5 })} style={box('50% 100%')}>
              {s.ears}
            </motion.g>
          )}
          {s.headShape ?? <circle cx="60" cy="54" r="30" fill={s.head} />}
          {s.face}
          {!wearsHat && s.crown}

          {/* Mejillas */}
          <ellipse cx={lx - 7} cy={ly + 9} rx="5" ry="3" fill="#ff7aa2" opacity="0.45" />
          <ellipse cx={rx + 7} cy={ry + 9} rx="5" ry="3" fill="#ff7aa2" opacity="0.45" />

          {/* Ojos: parpadean; felices = ^ ^ */}
          {isHappy ? (
            <g stroke={DARK} strokeWidth="2.6" strokeLinecap="round" fill="none">
              <path d={`M${lx - 4.5} ${ly + 1.5} Q${lx} ${ly - 4} ${lx + 4.5} ${ly + 1.5}`} />
              <path d={`M${rx - 4.5} ${ry + 1.5} Q${rx} ${ry - 4} ${rx + 4.5} ${ry + 1.5}`} />
            </g>
          ) : (
            <motion.g
              animate={anim ? { scaleY: [1, 1, 0.1, 1] } : undefined}
              transition={{ repeat: Infinity, duration: 4.2, times: [0, 0.92, 0.96, 1] }}
              style={box('center')}
            >
              {s.scleraR && (
                <>
                  <circle cx={lx} cy={ly} r={s.scleraR} fill="#fff" />
                  <circle cx={rx} cy={ry} r={s.scleraR} fill="#fff" />
                </>
              )}
              <circle cx={lx} cy={ly} r={s.scleraR ? s.scleraR * 0.62 : 4.6} fill={DARK} />
              <circle cx={rx} cy={ry} r={s.scleraR ? s.scleraR * 0.62 : 4.6} fill={DARK} />
              <circle cx={lx + 1.5} cy={ly - 1.6} r="1.6" fill="#fff" />
              <circle cx={rx + 1.5} cy={ry - 1.6} r="1.6" fill="#fff" />
            </motion.g>
          )}

          {/* Boca */}
          {s.mouth === 'beak' ? (
            <path d="M54 63 L66 63 L60 70 Z" fill="#f59e0b" />
          ) : s.mouth === 'wide' ? (
            <path d={isHappy ? 'M44 64 Q60 82 76 64 Z' : 'M44 66 Q60 78 76 66'} stroke={DARK} strokeWidth="2.4" strokeLinecap="round" fill={isHappy ? '#7a2e3a' : 'none'} />
          ) : (
            <path
              d={isHappy ? 'M55 69 Q60 77 65 69 Z' : 'M56 70 Q60 73.5 64 70'}
              stroke={DARK} strokeWidth="2" strokeLinecap="round" fill={isHappy ? '#7a2e3a' : 'none'}
            />
          )}

          {hat && <Hat id={hat} dy={s.hatDy ?? 0} eyes={s.eyes} />}
        </g>
      </motion.g>
    </motion.g>
  )
}

/** Accesorios, dibujados sobre la coronilla estándar (y≈24) o sobre los ojos. */
function Hat({ id, dy, eyes }: { id: string; dy: number; eyes: [number, number, number, number] }) {
  const [lx, ly, rx, ry] = eyes
  switch (id) {
    case 'hat_gorra':
      return (
        <g transform={`translate(0 ${dy}) rotate(-8 60 30)`}>
          <path d="M37 31 Q37 6 60 6 Q83 6 83 31 Z" fill="#3b82f6" />
          <path d="M60 6 L60 31 M48 9 Q46 20 47 31 M72 9 Q74 20 73 31" stroke="#2563eb" strokeWidth="1.3" fill="none" />
          <path d="M58 30 Q88 25 104 33 Q90 39 60 35 Z" fill="#1d4ed8" />
          <circle cx="60" cy="6" r="2.6" fill="#1e3a8a" />
        </g>
      )
    case 'hat_sombrero':
      return (
        <g transform={`translate(0 ${dy}) rotate(-6 60 28)`}>
          <rect x="43" y="0" width="34" height="28" rx="3" fill="#111827" />
          <rect x="43" y="19" width="34" height="6" fill="#dc2626" />
          <ellipse cx="60" cy="28" rx="27" ry="5" fill="#1f2937" />
        </g>
      )
    case 'hat_corona':
      return (
        <g transform={`translate(0 ${dy})`}>
          <path d="M40 31 L41 12 L51 22 L60 5 L69 22 L79 12 L80 31 Z" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="60" cy="24" r="3.2" fill="#ef4444" />
          <circle cx="48" cy="27" r="2.2" fill="#3b82f6" />
          <circle cx="72" cy="27" r="2.2" fill="#22c55e" />
          <motion.path
            d="M86 10 L88 15 L93 17 L88 19 L86 24 L84 19 L79 17 L84 15 Z" fill="#fef08a"
            animate={{ scale: [0, 1, 0], rotate: [0, 90] }} transition={loop(1.8, { repeatDelay: 1 })} style={box('center')}
          />
        </g>
      )
    case 'hat_moño':
      return (
        <g transform={`translate(0 ${dy})`}>
          <ellipse cx="73" cy="27" rx="8" ry="6" transform="rotate(-25 73 27)" fill="#ec4899" />
          <ellipse cx="89" cy="27" rx="8" ry="6" transform="rotate(25 89 27)" fill="#ec4899" />
          <circle cx="81" cy="28" r="3.6" fill="#be185d" />
        </g>
      )
    case 'hat_birrete':
      return (
        <g transform={`translate(0 ${dy})`}>
          <path d="M44 25 L44 33 Q60 39 76 33 L76 25 Z" fill="#111827" />
          <path d="M28 20 L60 7 L92 20 L60 32 Z" fill="#1f2937" />
          <circle cx="60" cy="19" r="2" fill="#facc15" />
          <motion.g animate={{ rotate: [-8, 10, -8] }} transition={loop(2.2)} style={{ transformBox: 'view-box', transformOrigin: '60px 19px' }}>
            <path d="M60 19 L85 23 L85 36" stroke="#facc15" strokeWidth="1.8" fill="none" />
            <path d="M82 35 L88 35 L87 43 L83 43 Z" fill="#facc15" />
          </motion.g>
        </g>
      )
    case 'hat_vikingo':
      return (
        <g transform={`translate(0 ${dy})`}>
          <path d="M35 33 Q35 6 60 6 Q85 6 85 33 Z" fill="#facc15" />
          <rect x="56" y="6" width="8" height="27" fill="#eab308" />
          <ellipse cx="60" cy="33" rx="29" ry="4.5" fill="#ca8a04" />
        </g>
      )
    case 'hat_gafas':
      return (
        <g>
          <rect x={lx - 9} y={ly - 6.5} width="18" height="12" rx="5" fill="#111827" />
          <rect x={rx - 9} y={ry - 6.5} width="18" height="12" rx="5" fill="#111827" />
          <path d={`M${lx + 9} ${ly - 1} L${rx - 9} ${ry - 1}`} stroke="#111827" strokeWidth="2.5" />
          <path d={`M${lx - 6} ${ly - 3} L${lx - 1} ${ly - 3} M${rx - 6} ${ry - 3} L${rx - 1} ${ry - 3}`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        </g>
      )
    default:
      return null
  }
}

/** Mascotas (como <g> de 40×40). Dan saltitos con un poco de aplastamiento. */
export function Pet({ id, still }: { id: string; still?: boolean }) {
  const art = PETS[id]
  if (!art) return null
  return (
    <g>
      <ellipse cx="20" cy="39" rx="10" ry="2" fill="#000" opacity="0.2" />
      <motion.g
        animate={still ? undefined : { y: [0, -5, 0, 0], scaleY: [1, 1.04, 0.94, 1] }}
        transition={{ repeat: Infinity, duration: 1.4, times: [0, 0.35, 0.7, 1], repeatDelay: 1.2 }}
        style={box('50% 100%')}
      >
        {art}
      </motion.g>
    </g>
  )
}

const eyes = (y = 18, x1 = 15.5, x2 = 24.5) => (
  <>
    <circle cx={x1} cy={y} r="2" fill={DARK} />
    <circle cx={x2} cy={y} r="2" fill={DARK} />
    <circle cx={x1 + 0.7} cy={y - 0.7} r="0.7" fill="#fff" />
    <circle cx={x2 + 0.7} cy={y - 0.7} r="0.7" fill="#fff" />
  </>
)

const PETS: Record<string, ReactNode> = {
  pet_pollito: (
    <>
      <path d="M14 8 Q16 3 19 7 Q21 2 23 7" stroke="#facc15" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="20" r="11" fill="#fde047" />
      {eyes(18)}
      <path d="M17.5 22 L22.5 22 L20 25.5 Z" fill="#f97316" />
      <path d="M7 25 L11 21 L15 26 L20 21 L25 26 L29 21 L33 25 Q33 37 20 37 Q7 37 7 25 Z" fill="#fffbeb" stroke="#e7e5e4" strokeWidth="0.8" />
    </>
  ),
  pet_perro: (
    <>
      <ellipse cx="20" cy="33" rx="9" ry="5.5" fill="#e7c9a0" />
      <circle cx="20" cy="19" r="12" fill="#e7c9a0" />
      <ellipse cx="8.5" cy="19" rx="4.5" ry="9" transform="rotate(18 8.5 19)" fill="#8b5a2b" />
      <ellipse cx="31.5" cy="19" rx="4.5" ry="9" transform="rotate(-18 31.5 19)" fill="#8b5a2b" />
      <ellipse cx="20" cy="24" rx="6" ry="4.5" fill="#fff7ed" />
      {eyes(17)}
      <ellipse cx="20" cy="22" rx="2.2" ry="1.6" fill={DARK} />
      <path d="M18.5 26 Q20 29 21.5 26 Z" fill="#f472b6" />
    </>
  ),
  pet_gato: (
    <>
      <ellipse cx="20" cy="33" rx="9" ry="5.5" fill="#9ca3af" />
      <path d="M9 14 L10 3 L18 10 Z M31 14 L30 3 L22 10 Z" fill="#9ca3af" />
      <circle cx="20" cy="19" r="12" fill="#9ca3af" />
      {eyes(18)}
      <path d="M18.6 22 L21.4 22 L20 23.6 Z" fill="#f472b6" />
      <path d="M7 21 L14 22 M7 25 L14 24 M33 21 L26 22 M33 25 L26 24" stroke="#4b5563" strokeWidth="0.8" />
    </>
  ),
  pet_buho: (
    <>
      <path d="M9 10 L11 2 L16 8 Z M31 10 L29 2 L24 8 Z" fill="#92400e" />
      <ellipse cx="20" cy="22" rx="13" ry="15" fill="#a16207" />
      <ellipse cx="20" cy="27" rx="8" ry="9" fill="#fde68a" />
      <circle cx="14.5" cy="16" r="5" fill="#fff" stroke="#facc15" strokeWidth="1.5" />
      <circle cx="25.5" cy="16" r="5" fill="#fff" stroke="#facc15" strokeWidth="1.5" />
      {eyes(16, 14.5, 25.5)}
      <path d="M18 20 L22 20 L20 24 Z" fill="#f97316" />
    </>
  ),
  pet_paloma: (
    <>
      <path d="M30 26 L38 22 L36 30 Z" fill="#e5e7eb" />
      <ellipse cx="21" cy="26" rx="12" ry="9" fill="#ffffff" />
      <circle cx="14" cy="16" r="8" fill="#ffffff" />
      <ellipse cx="24" cy="25" rx="6" ry="4" fill="#e5e7eb" />
      <circle cx="12" cy="15" r="1.8" fill={DARK} />
      <path d="M6 16 L2 18 L6 19 Z" fill="#f97316" />
    </>
  ),
  pet_dragon: (
    <>
      <path d="M6 18 L0 8 L12 14 Z M34 18 L40 8 L28 14 Z" fill="#a855f7" />
      <path d="M13 7 L14 1 L17 6 Z M27 7 L26 1 L23 6 Z" fill="#facc15" />
      <circle cx="20" cy="21" r="13" fill="#22c55e" />
      <ellipse cx="20" cy="27" rx="7.5" ry="6" fill="#bbf7d0" />
      {eyes(17)}
      <circle cx="18" cy="23" r="0.9" fill="#14532d" />
      <circle cx="22" cy="23" r="0.9" fill="#14532d" />
    </>
  ),
}
