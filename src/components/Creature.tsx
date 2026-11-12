import type { ReactNode } from 'react'

/**
 * Personajes en SVG con principios de "shape language" + volumen 2.5D:
 *  - Solo 3 formas base: rectángulos redondeados, medios círculos y triángulos redondeados. Nada puntiagudo.
 *  - ~15 formas por personaje, vista de frente, pocos colores, sin contornos.
 *  - Cabeza grande, cuerpo pequeño, ojos grandes (rect. redondeado), pies flotantes.
 *  - 2.5D: cada volumen lleva luz arriba-izquierda y sombra abajo (gradientes), la cabeza
 *    proyecta sombra sobre el cuerpo y hay sombra difusa en el suelo.
 *
 * Animaciones con CSS (clases .cr-* en index.css, transform-box: fill-box) para que cada parte gire
 * alrededor de su propio punto en cualquier navegador.
 *
 * Esqueleto común (viewBox 0 0 120 120): cabeza x26–94 y16–76, ojos y≈46, cuerpo y72–102,
 * hombros en (41,76) y (79,76), pies flotando en y≈106, suelo y≈117.
 */

const INK = '#2b2340'

// ---------------------------------------------------------------------------
// Formas base y volumen
// ---------------------------------------------------------------------------

/** Medio círculo con la base plana abajo (cúpula). */
const dome = (cx: number, y: number, r: number) => `M${cx - r} ${y} A${r} ${r} 0 0 1 ${cx + r} ${y} Z`
/** Medio círculo con la base plana arriba (cuenco). */
const bowl = (cx: number, y: number, r: number) => `M${cx - r} ${y} A${r} ${r} 0 0 0 ${cx + r} ${y} Z`

/** Triángulo redondeado: relleno + trazo del mismo color con uniones redondas. */
function RTri({ d, fill, r = 6 }: { d: string; fill: string; r?: number }) {
  return <path d={d} fill={fill} stroke={fill} strokeWidth={r} strokeLinejoin="round" />
}

/** Dibuja las formas (sin `fill` propio) con color + sombra inferior + brillo superior → volumen 2.5D. */
function Vol({ fill, children, shine = true }: { fill: string; children: ReactNode; shine?: boolean }) {
  return (
    <>
      <g fill={fill}>{children}</g>
      <g fill="url(#crShade)">{children}</g>
      {shine && <g fill="url(#crShine)">{children}</g>}
    </>
  )
}

/** Gradientes compartidos (mismos ids en todos los avatares: son idénticos, no importa cuál use el navegador). */
function Defs() {
  return (
    <defs>
      <linearGradient id="crShade" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0.45" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.22" />
      </linearGradient>
      <radialGradient id="crShine" cx="0.3" cy="0.22" r="0.6">
        <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="crGround">
        <stop offset="0" stopColor="#000" stopOpacity="0.38" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

// ---------------------------------------------------------------------------
// Especies
// ---------------------------------------------------------------------------

/**
 * Ajuste de accesorios por especie:
 * y/s/tilt = dónde apoya la base del sombrero, su escala e inclinación (los sombreros van ENTRE las orejas),
 * bow = dónde va el moño (base de la oreja), temples = hasta dónde llegan las patillas de las gafas.
 */
interface Fit {
  y: number
  s: number
  tilt: number
  bow: [number, number]
  temples: [number, number]
}

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
  /** Cómo le quedan los accesorios a esta especie */
  fit: Fit
  ears?: ReactNode
  /** Geometría de la cabeza SIN fill (si no es el rectángulo redondeado estándar) */
  headGeo?: ReactNode
  /** Marcas de la cara (máscara, manchas, rayas) — debajo de los ojos */
  face?: ReactNode
  /** Hocico + nariz (encima de la máscara) */
  snout?: ReactNode
  /** Sobre la cabeza (melena) — se oculta con sombrero cerrado */
  crown?: ReactNode
  /** Cuerno: con la corona (abierta) sale por el centro, delante */
  horn?: ReactNode
  tail?: ReactNode
  mouth?: 'smile' | 'wide' | 'none'
}

const HEAD = <rect x="26" y="16" width="68" height="60" rx="26" />

const SPECIES: Species[] = [
  // 0 · Zorro
  {
    name: 'Zorro', head: '#ff8a3d', body: '#ff8a3d', belly: '#fff3e3', arms: '#f27a2a', feet: '#5b2e1a', eyes: [47, 46, 73, 46],
    fit: { y: 22, s: 0.86, tilt: -6, bow: [75, 19], temples: [27, 93] },
    ears: (
      <>
        <RTri d="M30 30 L34 6 L52 20 Z" fill="#f27a2a" />
        <RTri d="M35 23 L37 12 L45 19 Z" fill="#5b2e1a" r={4} />
        <RTri d="M90 30 L86 6 L68 20 Z" fill="#f27a2a" />
        <RTri d="M85 23 L83 12 L75 19 Z" fill="#5b2e1a" r={4} />
      </>
    ),
    face: <path d="M26 50 Q43 48 60 58 Q77 48 94 50 Q94 76 68 76 L52 76 Q26 76 26 50 Z" fill="#fff3e3" />,
    snout: <RTri d="M56 58 L64 58 L60 63 Z" fill={INK} r={4} />,
    tail: (
      <>
        <path d="M78 96 Q108 100 106 72 Q104 62 94 66 Q98 86 76 88 Z" fill="#f27a2a" />
        <path d={dome(100, 74, 7)} transform="rotate(-20 100 74)" fill="#fff3e3" />
      </>
    ),
  },
  // 1 · Panda
  {
    name: 'Panda', head: '#ffffff', body: '#2f2f3a', belly: '#ffffff', arms: '#2f2f3a', feet: '#2f2f3a', eyes: [47, 47, 73, 47], eyeStyle: 'white',
    fit: { y: 19, s: 0.9, tilt: -6, bow: [79, 21], temples: [27, 93] },
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
  // 2 · Rana
  {
    name: 'Rana', head: '#58c25b', body: '#58c25b', belly: '#d9f7c4', arms: '#4bb04e', feet: '#3f9a43', eyes: [41, 26, 79, 26], eyeStyle: 'white', mouth: 'wide',
    fit: { y: 16, s: 0.84, tilt: -5, bow: [91, 24], temples: [22, 98] },
    headGeo: (
      <>
        <rect x="20" y="28" width="80" height="48" rx="24" />
        <circle cx="41" cy="27" r="14" />
        <circle cx="79" cy="27" r="14" />
      </>
    ),
  },
  // 3 · Tigre
  {
    name: 'Tigre', head: '#ffa62b', body: '#ffa62b', belly: '#fff3e0', arms: '#f59a1c', feet: '#e88a00', eyes: [47, 45, 73, 45],
    fit: { y: 20, s: 0.9, tilt: -6, bow: [80, 20], temples: [27, 93] },
    ears: (
      <>
        <path d={dome(35, 24, 11)} fill="#f59a1c" />
        <path d={dome(35, 24, 6)} fill="#ffe0b2" />
        <path d={dome(85, 24, 11)} fill="#f59a1c" />
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
        <path d="M80 98 Q104 102 104 80" fill="none" stroke="#f59a1c" strokeWidth="8" strokeLinecap="round" />
        <path d="M100 86 L108 84" stroke="#4a2a12" strokeWidth="3.5" strokeLinecap="round" />
      </>
    ),
  },
  // 4 · Pingüino
  {
    name: 'Pingüino', head: '#33415c', body: '#33415c', belly: '#ffffff', arms: '#2a3650', feet: '#ff9f1c', eyes: [48, 45, 72, 45],
    fit: { y: 20, s: 1.1, tilt: -8, bow: [80, 20], temples: [27, 93] },
    face: (
      <>
        <rect x="32" y="28" width="56" height="44" rx="20" fill="#ffffff" />
        <path d={dome(60, 30, 10)} fill="#33415c" />
      </>
    ),
    snout: <RTri d="M54 56 L66 56 L60 63 Z" fill="#ff9f1c" r={5} />,
    mouth: 'none',
  },
  // 5 · Unicornio
  {
    name: 'Unicornio', head: '#f7f1ff', body: '#f7f1ff', belly: '#ece0ff', arms: '#ebe1ff', feet: '#b9a7f5', eyes: [47, 47, 73, 47],
    fit: { y: 20, s: 0.86, tilt: -6, bow: [84, 25], temples: [27, 93] },
    ears: (
      <>
        <RTri d="M32 30 L36 10 L50 22 Z" fill="#efe6ff" />
        <RTri d="M37 24 L39 15 L45 21 Z" fill="#ffadd6" r={3} />
        <RTri d="M88 30 L84 10 L70 22 Z" fill="#efe6ff" />
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
        <circle cx="47" cy="17" r="6" fill="#c3b1ff" />
        <circle cx="73" cy="17" r="6" fill="#9cd2ff" />
      </>
    ),
    horn: (
      <>
        <RTri d="M55 18 L60 -2 L65 18 Z" fill="#fff4d6" r={4} />
        <path d="M56.5 12 L63.5 10 M57.5 5.5 L62.5 4" stroke="#ff9cc8" strokeWidth="1.8" strokeLinecap="round" />
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

/** Personaje completo (como <g>, dentro de un <svg> con viewBox que contenga 0 0 120 120). */
export function Character({ species, hat, happy = 0, still }: { species: number; hat?: string; happy?: number; still?: boolean }) {
  const s = SPECIES[species] ?? SPECIES[0]
  const [lx, ly, rx, ry] = s.eyes
  // Gafas, moño y corona (abierta) dejan ver cuerno y melena; los demás sombreros los tapan
  const wearsHat = !!hat && hat !== 'hat_gafas' && hat !== 'hat_moño' && hat !== 'hat_corona'
  const isHappy = happy > 0

  return (
    <g className={`cr${still ? ' cr-still' : ''}`}>
      <Defs />
      {/* Sombra difusa en el suelo */}
      <ellipse className="cr-shadow" cx="60" cy="116" rx="27" ry="5" fill="url(#crGround)" />

      {/* key: cada toque reinicia el salto */}
      <g key={happy} className={isHappy ? 'cr-jump' : undefined}>
        {/* Pies flotantes */}
        <g className="cr-feet">
          <Vol fill={s.feet}>
            <path d={bowl(50, 106, 7)} />
            <path d={bowl(70, 106, 7)} />
          </Vol>
        </g>

        <g className="cr-bob">
          {s.tail && <g className="cr-tail">{s.tail}</g>}

          {/* Brazos: dos bracitos quietos a los lados, asomando detrás del cuerpo */}
          <Vol fill={s.arms}>
            <rect x="33" y="78" width="10" height="17" rx="5" />
            <rect x="77" y="78" width="10" height="17" rx="5" />
          </Vol>

          {/* Cuerpo pequeño + barriga */}
          <g className="cr-breathe">
            <Vol fill={s.body}>
              <rect x="39" y="72" width="42" height="30" rx="14" />
            </Vol>
            <Vol fill={s.belly} shine={false}>
              <path d={dome(60, 102, 13)} />
            </Vol>
          </g>
          {/* La cabeza proyecta sombra sobre el cuerpo */}
          <ellipse cx="60" cy="76" rx="21" ry="4" fill="#000" opacity="0.16" />

          {/* Cabeza grande con volumen */}
          {s.ears && <g className="cr-ears">{s.ears}</g>}
          <Vol fill={s.head}>{s.headGeo ?? HEAD}</Vol>
          {s.face}
          {!wearsHat && s.crown}
          {!wearsHat && hat !== 'hat_corona' && s.horn}

          {/* Cachetes flotantes */}
          <rect x={lx - 13} y={ly + 9} width="9" height="5" rx="2.5" fill="#ff7a9c" opacity="0.5" />
          <rect x={rx + 4} y={ry + 9} width="9" height="5" rx="2.5" fill="#ff7a9c" opacity="0.5" />

          {/* Ojos grandes (rect. redondeados); parpadean. Felices = arcos */}
          {isHappy ? (
            <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
              <path d={`M${lx - 5} ${ly + 2} Q${lx} ${ly - 5} ${lx + 5} ${ly + 2}`} />
              <path d={`M${rx - 5} ${ry + 2} Q${rx} ${ry - 5} ${rx + 5} ${ry + 2}`} />
            </g>
          ) : (
            <g className="cr-blink">
              {s.eyeStyle === 'white' ? (
                <>
                  <rect x={lx - 7.5} y={ly - 8} width="15" height="16" rx="7" fill="#fff" />
                  <rect x={rx - 7.5} y={ry - 8} width="15" height="16" rx="7" fill="#fff" />
                  <rect x={lx - 3} y={ly - 4.5} width="8" height="10" rx="4" fill={INK} />
                  <rect x={rx - 5} y={ry - 4.5} width="8" height="10" rx="4" fill={INK} />
                  <circle cx={lx + 2.6} cy={ly - 2} r="1.7" fill="#fff" />
                  <circle cx={rx + 0.6} cy={ry - 2} r="1.7" fill="#fff" />
                </>
              ) : (
                <>
                  <rect x={lx - 5.5} y={ly - 7.5} width="11" height="15" rx="5" fill={INK} />
                  <rect x={rx - 5.5} y={ry - 7.5} width="11" height="15" rx="5" fill={INK} />
                  <circle cx={lx + 1.8} cy={ly - 3} r="2.4" fill="#fff" />
                  <circle cx={rx + 1.8} cy={ry - 3} r="2.4" fill="#fff" />
                  <circle cx={lx - 1.6} cy={ly + 3.4} r="1.1" fill="#fff" />
                  <circle cx={rx - 1.6} cy={ry + 3.4} r="1.1" fill="#fff" />
                </>
              )}
            </g>
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

          {hat && <Hat id={hat} fit={s.fit} eyes={s.eyes} />}
          {/* Con la corona (abierta) el cuerno sale por el centro, delante */}
          {hat === 'hat_corona' && s.horn}
        </g>
      </g>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Accesorios (dibujados para una coronilla en y=30 y escalados al ancho de la cabeza)
// ---------------------------------------------------------------------------

function Hat({ id, fit, eyes }: { id: string; fit: Fit; eyes: [number, number, number, number] }) {
  const [lx, ly, rx, ry] = eyes
  // Lleva la base del sombrero (dibujada en 60,30) al punto de apoyo de la especie, con su escala e inclinación
  const onHead = `translate(60 ${fit.y}) rotate(${fit.tilt}) scale(${fit.s}) translate(-60 -30)`
  // Sombra de contacto sobre la cabeza: el sombrero se ve apoyado, no pegado encima
  const contact = (
    <ellipse cx="60" cy={fit.y + 1.5} rx={21 * fit.s} ry="3.2" fill="#000" opacity="0.2" transform={`rotate(${fit.tilt} 60 ${fit.y})`} />
  )
  const worn = (art: ReactNode) => (
    <>
      {contact}
      <g transform={onHead}>{art}</g>
    </>
  )
  switch (id) {
    case 'hat_gorra':
      return (
        worn(<>
          <Vol fill="#3d8bff">
            <path d={dome(60, 31, 23)} />
          </Vol>
          <path d="M60 8 L60 31" stroke="#2b6fe0" strokeWidth="2" />
          <Vol fill="#2b6fe0" shine={false}>
            <rect x="56" y="27" width="46" height="7" rx="3.5" />
          </Vol>
          <circle cx="60" cy="8" r="3" fill="#2b6fe0" />
        </>)
      )
    case 'hat_sombrero':
      return (
        worn(<>
          <Vol fill="#2b2340">
            <rect x="44" y="2" width="32" height="27" rx="5" />
          </Vol>
          <rect x="44" y="19" width="32" height="6" fill="#ff4d6d" />
          <Vol fill="#3a3152" shine={false}>
            <rect x="33" y="26" width="54" height="7" rx="3.5" />
          </Vol>
        </>)
      )
    case 'hat_corona':
      return (
        worn(<>
          <RTri d="M41 30 L42 13 L51 22 L60 7 L69 22 L78 13 L79 30 Z" fill="#ffd23f" r={5} />
          <path d="M40 24 L80 24 L80 31 L40 31 Z" fill="url(#crShade)" />
          <circle cx="60" cy="24" r="3.4" fill="#ff4d6d" />
          <circle cx="48" cy="26" r="2.4" fill="#3d8bff" />
          <circle cx="72" cy="26" r="2.4" fill="#2ec27e" />
          <g className="cr-sparkle">
            <RTri d="M88 8 L90 14 L96 16 L90 18 L88 24 L86 18 L80 16 L86 14 Z" fill="#fff3a6" r={1.5} />
          </g>
        </>)
      )
    case 'hat_moño':
      return (
        <g transform={`translate(${fit.bow[0]} ${fit.bow[1]}) rotate(18) scale(0.8) translate(-80 -30)`}>
          <RTri d="M80 30 L68 22 L68 38 Z" fill="#ff5fa2" r={6} />
          <RTri d="M80 30 L92 22 L92 38 Z" fill="#ff5fa2" r={6} />
          <rect x="76.5" y="26" width="7" height="8" rx="3.5" fill="#d93d82" />
        </g>
      )
    case 'hat_birrete':
      return (
        worn(<>
          <Vol fill="#2b2340" shine={false}>
            <rect x="44" y="22" width="32" height="12" rx="5" />
          </Vol>
          <RTri d="M30 20 L60 9 L90 20 L60 30 Z" fill="#3a3152" r={4} />
          <circle cx="60" cy="19" r="2.2" fill="#ffd23f" />
          <g className="cr-tassel">
            <path d="M60 19 L84 23 L84 34" stroke="#ffd23f" strokeWidth="2" fill="none" strokeLinecap="round" />
            <rect x="81" y="33" width="6" height="9" rx="2.5" fill="#ffd23f" />
          </g>
        </>)
      )
    case 'hat_vikingo':
      return (
        worn(<>
          <Vol fill="#ffc62b">
            <path d={dome(60, 32, 25)} />
          </Vol>
          <rect x="56" y="7" width="8" height="25" rx="3" fill="#f2a900" />
          <Vol fill="#f2a900" shine={false}>
            <rect x="31" y="29" width="58" height="7" rx="3.5" />
          </Vol>
        </>)
      )
    case 'hat_gafas':
      return (
        <g>
          <rect x={fit.temples[0]} y={ly - 3} width={lx - 10 - fit.temples[0] + 2} height="3.2" rx="1.6" fill="#2b2340" />
          <rect x={rx + 8} y={ry - 3} width={fit.temples[1] - rx - 8} height="3.2" rx="1.6" fill="#2b2340" />
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
    <g className={`cr${still ? ' cr-still' : ''}`}>
      <Defs />
      <ellipse cx="20" cy="40" rx="11" ry="2.6" fill="url(#crGround)" />
      <g className="cr-pet">
        {art}
      </g>
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
      <Vol fill="#ffd93d">
        <rect x="9" y="8" width="22" height="25" rx="11" />
      </Vol>
      <path d="M17 8 Q19 3 21 7" stroke="#ffd93d" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {petEyes(17)}
      <RTri d="M18 22 L22 22 L20 25 Z" fill="#ff9f1c" r={2.5} />
      <path d="M7 24 L12 21 L16 25 L20 21 L24 25 L28 21 L33 24 L33 26 Q33 34 20 34 Q7 34 7 26 Z" fill="#fffaf0" />
    </>
  ),
  pet_perro: (
    <>
      {petFeet('#b07a45')}
      <Vol fill="#e9c896">
        <rect x="11" y="24" width="18" height="11" rx="5.5" />
      </Vol>
      <Vol fill="#e9c896">
        <rect x="8" y="6" width="24" height="21" rx="10" />
      </Vol>
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
      <Vol fill="#a3acbd">
        <rect x="11" y="24" width="18" height="11" rx="5.5" />
      </Vol>
      <RTri d="M10 12 L11 3 L18 8 Z" fill="#a3acbd" r={3} />
      <RTri d="M30 12 L29 3 L22 8 Z" fill="#a3acbd" r={3} />
      <Vol fill="#a3acbd">
        <rect x="8" y="6" width="24" height="21" rx="10" />
      </Vol>
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
      <Vol fill="#a86b32">
        <rect x="7" y="5" width="26" height="30" rx="12" />
      </Vol>
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
      <Vol fill="#ffffff">
        <rect x="8" y="16" width="26" height="18" rx="9" />
      </Vol>
      <Vol fill="#ffffff">
        <rect x="6" y="6" width="16" height="16" rx="7" />
      </Vol>
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
      <Vol fill="#2ec27e">
        <rect x="7" y="5" width="26" height="30" rx="12" />
      </Vol>
      <path d={dome(20, 35, 9)} fill="#c8f7d8" />
      {petEyes(15)}
      <rect x="16.5" y="22" width="2" height="1.6" rx="0.8" fill="#155d35" />
      <rect x="21.5" y="22" width="2" height="1.6" rx="0.8" fill="#155d35" />
    </>
  ),
}
