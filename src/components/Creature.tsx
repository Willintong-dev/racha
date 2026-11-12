import type { ReactNode } from 'react'

/**
 * Personajes en SVG con principios de "shape language" + volumen 2.5D:
 *  - Solo 3 formas base: rectángulos redondeados, medios círculos y triángulos redondeados. Nada puntiagudo.
 *  - ~15 formas por personaje, vista de frente, pocos colores, sin contornos.
 *  - Cabeza grande (cada especie con SU tamaño), cuerpo pequeño, ojos grandes, pies flotantes.
 *  - 2.5D: luz arriba-izquierda y sombra abajo en cada volumen, sombra de la cabeza sobre el cuerpo y en el suelo.
 *
 * Los ACCESORIOS no son dibujos fijos escalados: se calculan a partir de la cabeza de cada especie
 * (`head`: x, y, ancho). La gorra y el casco envuelven la parte de arriba de la cabeza y las orejas salen
 * por delante; sombrero de copa, corona y birrete se apoyan en la coronilla con un ancho proporcional.
 *
 * Animaciones con CSS (clases .cr-* en index.css, transform-box: fill-box).
 * viewBox de referencia 0 0 120 120: cuerpo y72–102, pies y≈106, suelo y≈117.
 */

const INK = '#2b2340'

// ---------------------------------------------------------------------------
// Formas base y volumen
// ---------------------------------------------------------------------------

/** Medio círculo con la base plana abajo (cúpula). */
const dome = (cx: number, y: number, r: number) => `M${cx - r} ${y} A${r} ${r} 0 0 1 ${cx + r} ${y} Z`
/** Media elipse con la base plana abajo. */
const domeE = (cx: number, y: number, rx: number, ry: number) => `M${cx - rx} ${y} A${rx} ${ry} 0 0 1 ${cx + rx} ${y} Z`
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

/** Gradientes compartidos (ids idénticos en todos los avatares). */
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

/** Caja de la cabeza: cada especie es más o menos cabezona. */
interface HeadBox {
  x: number
  y: number
  w: number
  h: number
  rx: number
}

interface Species {
  name: string
  head: HeadBox
  headColor: string
  body: string
  belly: string
  arms: string
  feet: string
  /** Centros de los ojos */
  eyes: [number, number, number, number]
  /** 'dark' = ojos grandes oscuros con brillo; 'white' = blanco + pupila */
  eyeStyle?: 'dark' | 'white'
  /** Tamaño de los ojos blancos (1 = normal) */
  eyeScale?: number
  /** Geometría de la cabeza SIN fill (si no es el rectángulo redondeado de `head`) */
  headGeo?: ReactNode
  /**
   * Cómo lleva gorra/casco: 'cover' = le envuelve la parte de arriba de la cabeza;
   * 'sit' = va pequeño encima (rana: si la cubriera, le taparía los ojos).
   */
  capMode?: 'cover' | 'sit'
  /** Zona donde se apoyan los sombreros si no es la cabeza (rana: entre las cúpulas de los ojos) */
  hatZone?: { cx: number; top: number; w: number }
  /** Inclinación de los sombreros (grados) */
  tilt?: number
  /** Dónde va el moño */
  bow: [number, number]
  ears?: ReactNode
  face?: ReactNode
  snout?: ReactNode
  /** Melena sobre la cabeza — se oculta con sombrero cerrado */
  crown?: ReactNode
  /** Cuerno — con la corona sale por el centro */
  horn?: ReactNode
  tail?: ReactNode
  mouth?: 'smile' | 'wide' | 'none'
  /** Desplazamiento de los cachetes [hacia afuera, hacia abajo] (panda: que no caigan sobre las manchas) */
  cheeks?: [number, number]
}

const SPECIES: Species[] = [
  // 0 · Zorro — cabeza mediana
  {
    name: 'Zorro', head: { x: 28, y: 18, w: 64, h: 58, rx: 25 },
    headColor: '#ff8a3d', body: '#ff8a3d', belly: '#fff3e3', arms: '#f27a2a', feet: '#5b2e1a', eyes: [47, 47, 73, 47],
    bow: [80, 22],
    ears: (
      <>
        <RTri d="M31 33 L34 7 L53 21 Z" fill="#f27a2a" />
        <RTri d="M36 25 L37 13 L46 20 Z" fill="#5b2e1a" r={4} />
        <RTri d="M89 33 L86 7 L67 21 Z" fill="#f27a2a" />
        <RTri d="M84 25 L83 13 L74 20 Z" fill="#5b2e1a" r={4} />
      </>
    ),
    face: <path d="M28 52 Q44 49 60 59 Q76 49 92 52 Q92 76 68 76 L52 76 Q28 76 28 52 Z" fill="#fff3e3" />,
    snout: <RTri d="M56 59 L64 59 L60 64 Z" fill={INK} r={4} />,
    tail: (
      <>
        <path d="M78 96 Q108 100 106 72 Q104 62 94 66 Q98 86 76 88 Z" fill="#f27a2a" />
        <path d={dome(100, 74, 7)} transform="rotate(-20 100 74)" fill="#fff3e3" />
      </>
    ),
  },
  // 1 · Panda — cabezón y redondo
  {
    name: 'Panda', head: { x: 22, y: 17, w: 76, h: 60, rx: 30 },
    headColor: '#ffffff', body: '#2f2f3a', belly: '#ffffff', arms: '#2f2f3a', feet: '#2f2f3a', eyes: [46, 46.5, 74, 46.5], eyeStyle: 'white', eyeScale: 0.58, cheeks: [3, 4],
    bow: [84, 21],
    ears: (
      <>
        <circle cx="31" cy="22" r="11" fill="#2f2f3a" />
        <circle cx="89" cy="22" r="11" fill="#2f2f3a" />
      </>
    ),
    // Manchas: gotas inclinadas — finas arriba junto al puente de la nariz, más llenas abajo hacia afuera;
    // el ojo va en la parte de arriba de la gota
    face: (
      <g fill="#2f2f3a">
        <ellipse cx="44" cy="50" rx="6.5" ry="11.5" transform="rotate(26 44 50)" />
        <circle cx="42.4" cy="53.6" r="6.9" />
        <ellipse cx="76" cy="50" rx="6.5" ry="11.5" transform="rotate(-26 76 50)" />
        <circle cx="77.6" cy="53.6" r="6.9" />
      </g>
    ),
    snout: <RTri d="M56 61 L64 61 L60 65 Z" fill="#2f2f3a" r={4} />,
  },
  // 2 · Rana — cabeza ancha y baja, ojos en cúpulas
  {
    name: 'Rana', head: { x: 20, y: 28, w: 80, h: 48, rx: 24 },
    headColor: '#58c25b', body: '#58c25b', belly: '#d9f7c4', arms: '#4bb04e', feet: '#3f9a43', eyes: [41, 26, 79, 26], eyeStyle: 'white', mouth: 'wide',
    capMode: 'sit', hatZone: { cx: 60, top: 15, w: 44 }, tilt: -4,
    bow: [92, 23],
    headGeo: (
      <>
        <rect x="20" y="28" width="80" height="48" rx="24" />
        <circle cx="41" cy="27" r="14" />
        <circle cx="79" cy="27" r="14" />
      </>
    ),
  },
  // 3 · Tigre — cabezón y ancho
  {
    name: 'Tigre', head: { x: 23, y: 17, w: 74, h: 59, rx: 28 },
    headColor: '#ffa62b', body: '#ffa62b', belly: '#fff3e0', arms: '#f59a1c', feet: '#e88a00', eyes: [47, 46, 73, 46],
    bow: [84, 22],
    ears: (
      <>
        <path d={dome(34, 26, 11)} fill="#f59a1c" />
        <path d={dome(34, 26, 6)} fill="#ffe0b2" />
        <path d={dome(86, 26, 11)} fill="#f59a1c" />
        <path d={dome(86, 26, 6)} fill="#ffe0b2" />
      </>
    ),
    face: (
      <>
        <RTri d="M54 18 L66 18 L60 30 Z" fill="#4a2a12" r={4} />
        <rect x="23" y="41" width="10" height="3.6" rx="1.8" fill="#4a2a12" />
        <rect x="23" y="48" width="7" height="3.6" rx="1.8" fill="#4a2a12" />
        <rect x="87" y="41" width="10" height="3.6" rx="1.8" fill="#4a2a12" />
        <rect x="90" y="48" width="7" height="3.6" rx="1.8" fill="#4a2a12" />
      </>
    ),
    snout: (
      <>
        <path d={bowl(60, 56, 14)} fill="#fff3e0" />
        <RTri d="M56 57 L64 57 L60 61 Z" fill="#ff6f91" r={4} />
      </>
    ),
    tail: (
      <>
        <path d="M80 98 Q104 102 104 80" fill="none" stroke="#f59a1c" strokeWidth="8" strokeLinecap="round" />
        <path d="M100 86 L108 84" stroke="#4a2a12" strokeWidth="3.5" strokeLinecap="round" />
      </>
    ),
  },
  // 4 · Pingüino — el menos cabezón
  {
    name: 'Pingüino', head: { x: 31, y: 21, w: 58, h: 55, rx: 24 },
    headColor: '#33415c', body: '#33415c', belly: '#ffffff', arms: '#2a3650', feet: '#ff9f1c', eyes: [49, 47, 71, 47], tilt: -8,
    bow: [80, 25],
    face: (
      <>
        <rect x="35" y="32" width="50" height="40" rx="18" fill="#ffffff" />
        <path d={dome(60, 34, 9)} fill="#33415c" />
      </>
    ),
    snout: <RTri d="M55 57 L65 57 L60 63 Z" fill="#ff9f1c" r={5} />,
    mouth: 'none',
  },
  // 5 · Unicornio — cabeza mediana-alta
  {
    name: 'Unicornio', head: { x: 28, y: 17, w: 64, h: 59, rx: 26 },
    headColor: '#f7f1ff', body: '#f7f1ff', belly: '#ece0ff', arms: '#ebe1ff', feet: '#b9a7f5', eyes: [47, 47, 73, 47],
    bow: [86, 26],
    ears: (
      <>
        <RTri d="M33 31 L36 11 L50 22 Z" fill="#efe6ff" />
        <RTri d="M38 25 L39 16 L45 21 Z" fill="#ffadd6" r={3} />
        <RTri d="M87 31 L84 11 L70 22 Z" fill="#efe6ff" />
        <RTri d="M82 25 L81 16 L75 21 Z" fill="#ffadd6" r={3} />
      </>
    ),
    face: (
      <>
        <circle cx="30" cy="35" r="8" fill="#ffadd6" />
        <circle cx="27" cy="49" r="7" fill="#c3b1ff" />
        <circle cx="29" cy="62" r="6" fill="#9cd2ff" />
      </>
    ),
    crown: (
      <>
        <circle cx="47" cy="18" r="6" fill="#c3b1ff" />
        <circle cx="73" cy="18" r="6" fill="#9cd2ff" />
      </>
    ),
    horn: (
      <>
        <RTri d="M55 19 L60 -1 L65 19 Z" fill="#fff4d6" r={4} />
        <path d="M56.5 13 L63.5 11 M57.5 6.5 L62.5 5" stroke="#ff9cc8" strokeWidth="1.8" strokeLinecap="round" />
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

/** Accesorios que envuelven la cabeza (las orejas salen por agujeros) */
const COVERING = new Set(['hat_gorra', 'hat_vikingo'])

/** Medidas de gorra/casco para una especie: ancho, base (borde) y alto de la cúpula. */
function capGeometry(s: Species) {
  const h = s.head
  const z = s.hatZone ?? { cx: h.x + h.w / 2, top: h.y, w: h.w }
  const sit = s.capMode === 'sit'
  const cw = sit ? z.w : z.w + 2
  const base = sit ? z.top + 6 : z.top + h.h * 0.27
  const domeH = sit ? z.w * 0.42 : base - z.top + 4
  return { cx: z.cx, cw, base, domeH, sit }
}

/** Personaje completo (como <g>, dentro de un <svg> con viewBox que contenga 0 0 120 120). */
export function Character({ species, hat, happy = 0, still }: { species: number; hat?: string; happy?: number; still?: boolean }) {
  const s = SPECIES[species] ?? SPECIES[0]
  const [lx, ly, rx, ry] = s.eyes
  const h = s.head
  // Gafas, moño y corona (abierta) dejan ver cuerno y melena; los demás sombreros los tapan
  const wearsHat = !!hat && hat !== 'hat_gafas' && hat !== 'hat_moño' && hat !== 'hat_corona'
  const covers = !!hat && COVERING.has(hat) && s.capMode !== 'sit'
  const isHappy = happy > 0
  const k = s.eyeScale ?? 1
  const [cdx, cdy] = s.cheeks ?? [0, 0]

  return (
    <g className={`cr${still ? ' cr-still' : ''}`}>
      <Defs />
      <ellipse className="cr-shadow" cx="60" cy="116" rx="27" ry="5" fill="url(#crGround)" />

      <g key={happy} className={isHappy ? 'cr-jump' : undefined}>
        <g className="cr-feet">
          <Vol fill={s.feet}>
            <path d={bowl(50, 106, 7)} />
            <path d={bowl(70, 106, 7)} />
          </Vol>
        </g>

        <g className="cr-bob">
          {s.tail && <g className="cr-tail">{s.tail}</g>}

          {/* Bracitos quietos a los lados */}
          <Vol fill={s.arms}>
            <rect x="33" y="78" width="10" height="17" rx="5" />
            <rect x="77" y="78" width="10" height="17" rx="5" />
          </Vol>

          <g className="cr-breathe">
            <Vol fill={s.body}>
              <rect x="39" y="72" width="42" height="30" rx="14" />
            </Vol>
            <Vol fill={s.belly} shine={false}>
              <path d={dome(60, 102, 13)} />
            </Vol>
          </g>
          <ellipse cx="60" cy="76" rx="21" ry="4" fill="#000" opacity="0.16" />

          {/* Cabeza */}
          {s.ears && !covers && <g className="cr-ears">{s.ears}</g>}
          <Vol fill={s.headColor}>{s.headGeo ?? <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={h.rx} />}</Vol>
          {s.face}
          {!wearsHat && s.crown}
          {!wearsHat && hat !== 'hat_corona' && s.horn}

          <rect x={lx - 13 - cdx} y={ly + 9 + cdy} width="9" height="5" rx="2.5" fill="#ff7a9c" opacity="0.5" />
          <rect x={rx + 4 + cdx} y={ry + 9 + cdy} width="9" height="5" rx="2.5" fill="#ff7a9c" opacity="0.5" />

          {isHappy ? (
            <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
              <path d={`M${lx - 5} ${ly + 2} Q${lx} ${ly - 5} ${lx + 5} ${ly + 2}`} />
              <path d={`M${rx - 5} ${ry + 2} Q${rx} ${ry - 5} ${rx + 5} ${ry + 2}`} />
            </g>
          ) : (
            <g className="cr-blink">
              {s.eyeStyle === 'white' ? (
                <>
                  <rect x={lx - 7.5 * k} y={ly - 8 * k} width={15 * k} height={16 * k} rx={7 * k} fill="#fff" />
                  <rect x={rx - 7.5 * k} y={ry - 8 * k} width={15 * k} height={16 * k} rx={7 * k} fill="#fff" />
                  <rect x={lx - 3 * k} y={ly - 4.5 * k} width={8 * k} height={10 * k} rx={4 * k} fill={INK} />
                  <rect x={rx - 5 * k} y={ry - 4.5 * k} width={8 * k} height={10 * k} rx={4 * k} fill={INK} />
                  <circle cx={lx + 2.6 * k} cy={ly - 2 * k} r={1.7 * k} fill="#fff" />
                  <circle cx={rx + 0.6 * k} cy={ry - 2 * k} r={1.7 * k} fill="#fff" />
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

          {s.mouth === 'wide' ? (
            <path
              d={isHappy ? 'M44 56 Q60 74 76 56 Z' : 'M46 58 Q60 68 74 58'}
              stroke={INK} strokeWidth="3" strokeLinecap="round" fill={isHappy ? '#8c2f45' : 'none'}
            />
          ) : s.mouth === 'none' ? null : isHappy ? (
            <path d="M54 67 Q60 76 66 67 Z" fill="#8c2f45" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          ) : (
            <path d="M55 67 Q57.5 70 60 67 Q62.5 70 65 67" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          )}

          {hat && <Hat id={hat} s={s} />}
          {/* Gorra y casco envuelven la cabeza: delante solo se ve la parte de la oreja que sobresale
              por encima de la gorra (como si saliera por un agujero); la base queda escondida debajo */}
          {covers && s.ears && (
            <>
              <defs>
                <clipPath id={`crEarClip${species}`}>
                  <rect x="-20" y="-40" width="160" height={capGeometry(s).base - capGeometry(s).domeH * 0.55 + 40} />
                </clipPath>
              </defs>
              <g clipPath={`url(#crEarClip${species})`}>
                <g className="cr-ears">{s.ears}</g>
              </g>
            </>
          )}
          {hat === 'hat_corona' && s.horn}
        </g>
      </g>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Accesorios: calculados a partir de la cabeza de cada especie
// ---------------------------------------------------------------------------

/**
 * Visera de gorra vista de frente: media luna (borde de arriba poco curvo, de abajo más curvo)
 * con puntas redondeadas. y = borde superior en los extremos, d = grosor en el centro,
 * te = grosor en las puntas, sag = cuánto baja el borde superior en el centro.
 */
const capBrim = (cx: number, y: number, w: number, d: number, te: number, sag: number) => {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  return `M${x0} ${y} Q${cx} ${y + 2 * sag} ${x1} ${y} A${te / 2} ${te / 2} 0 0 1 ${x1} ${y + te} Q${cx} ${y + te + 2 * (sag + d - te)} ${x0} ${y + te} A${te / 2} ${te / 2} 0 0 1 ${x0} ${y} Z`
}

function Hat({ id, s }: { id: string; s: Species }) {
  const h = s.head
  const [lx, ly, rx, ry] = s.eyes
  // Zona de apoyo: centro, coronilla y ancho de la cabeza (o la zona especial de la rana)
  const z = s.hatZone ?? { cx: h.x + h.w / 2, top: h.y, w: h.w }
  const { cx, top, w } = z
  const tilt = s.tilt ?? -6
  const sit = s.capMode === 'sit'

  switch (id) {
    // ----- Envuelven la cabeza -----
    case 'hat_gorra':
    case 'hat_vikingo': {
      if (id === 'hat_gorra' && !sit) {
        // Gorra puesta (vista de frente): copa que abraza la cabeza con costuras hacia el botón
        // y visera en media luna que sale hacia nosotros bajo la frente de la copa.
        const { cw, base, domeH } = capGeometry(s)
        const ct = base - domeH * 1.15
        const r = cw / 2
        const bw = cw * 0.72
        const bc = cx + cw * 0.04
        return (
          <g>
            {/* Sombra de la visera sobre la frente */}
            <path d={capBrim(bc, base + 4.5, bw * 0.9, 4.5, 3, 3.5)} fill="#000" opacity="0.18" />
            <Vol fill="#3d8bff">
              <path d={`M${cx - r} ${base + 1} C${cx - r} ${ct + domeH * 0.3} ${cx - r * 0.62} ${ct} ${cx} ${ct} C${cx + r * 0.62} ${ct} ${cx + r} ${ct + domeH * 0.3} ${cx + r} ${base + 1} Q${cx} ${base + 5} ${cx - r} ${base + 1} Z`} />
            </Vol>
            {/* Costuras de los gajos */}
            <g stroke="#2b6fe0" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85">
              <path d={`M${cx} ${ct + 2} Q${cx - r * 0.36} ${ct + domeH * 0.35} ${cx - r * 0.42} ${base + 2}`} />
              <path d={`M${cx} ${ct + 2} Q${cx + r * 0.36} ${ct + domeH * 0.35} ${cx + r * 0.42} ${base + 2}`} />
            </g>
            <circle cx={cx} cy={ct + 1.5} r="3.2" fill="#2b6fe0" />
            <Vol fill="#2b6fe0" shine={false}>
              <path d={capBrim(bc, base - 1.5, bw, 9, 3.5, 3.5)} />
            </Vol>
          </g>
        )
      }
      // Casco (y gorrita pequeña de la rana, modo 'sit')
      const helmet = id === 'hat_vikingo'
      // Si envuelve: cubre el ancho completo de la cabeza y baja hasta ~1/4 de su alto
      const { cw, base, domeH } = capGeometry(s)
      const main = helmet ? '#ffc62b' : '#3d8bff'
      const dark = helmet ? '#f2a900' : '#2b6fe0'
      return (
        <g transform={sit ? `rotate(${tilt} ${cx} ${base})` : undefined}>
          {/* Sombra del borde sobre la frente */}
          <rect x={cx - cw / 2 + 4} y={base} width={cw - 8} height="4" rx="2" fill="#000" opacity="0.16" />
          <Vol fill={main}>
            <path d={domeE(cx, base, cw / 2, domeH)} />
          </Vol>
          {helmet ? (
            <>
              <rect x={cx - 4} y={base - domeH} width="8" height={domeH} rx="3" fill={dark} />
              <Vol fill={dark} shine={false}>
                <rect x={cx - cw / 2 - 4} y={base - 3} width={cw + 8} height="7" rx="3.5" />
              </Vol>
            </>
          ) : (
            <>
              <path d={`M${cx} ${base - domeH} L${cx} ${base}`} stroke={dark} strokeWidth="2" />
              <circle cx={cx} cy={base - domeH} r="3" fill={dark} />
              {/* Visera hacia un lado */}
              <Vol fill={dark} shine={false}>
                <rect x={cx - 2} y={base - 4} width={cw * 0.66} height="7.5" rx="3.75" />
              </Vol>
            </>
          )}
        </g>
      )
    }
    // ----- Se apoyan en la coronilla -----
    case 'hat_sombrero': {
      const base = top + 7
      const bw = w * 0.78
      const cw = w * 0.5
      const ch = w * 0.44
      return (
        <g transform={`rotate(${tilt} ${cx} ${base})`}>
          <ellipse cx={cx} cy={base + 2} rx={bw * 0.42} ry="3.2" fill="#000" opacity="0.2" />
          <Vol fill="#2b2340">
            <rect x={cx - cw / 2} y={base - ch} width={cw} height={ch} rx="5" />
          </Vol>
          <rect x={cx - cw / 2} y={base - 11} width={cw} height="5.5" fill="#ff4d6d" />
          <Vol fill="#3a3152" shine={false}>
            <rect x={cx - bw / 2} y={base - 4} width={bw} height="7.5" rx="3.75" />
          </Vol>
        </g>
      )
    }
    case 'hat_corona': {
      const base = top + 9
      const cw = w * 0.6
      const ch = w * 0.3
      const x0 = cx - cw / 2
      const x1 = cx + cw / 2
      return (
        <g transform={`rotate(${tilt * 0.6} ${cx} ${base})`}>
          <ellipse cx={cx} cy={base + 1.5} rx={cw * 0.45} ry="3" fill="#000" opacity="0.2" />
          <RTri
            d={`M${x0} ${base} L${x0} ${base - ch * 0.75} L${cx - cw / 4} ${base - ch * 0.4} L${cx} ${base - ch} L${cx + cw / 4} ${base - ch * 0.4} L${x1} ${base - ch * 0.75} L${x1} ${base} Z`}
            fill="#ffd23f" r={5}
          />
          <rect x={x0 - 1} y={base - 6} width={cw + 2} height="7" rx="3" fill="url(#crShade)" />
          <circle cx={cx} cy={base - 4} r="3.2" fill="#ff4d6d" />
          <circle cx={x0 + cw * 0.18} cy={base - 3} r="2.2" fill="#3d8bff" />
          <circle cx={x1 - cw * 0.18} cy={base - 3} r="2.2" fill="#2ec27e" />
          <g className="cr-sparkle">
            <RTri d={`M${x1 + 7} ${base - ch - 2} L${x1 + 9} ${base - ch + 3} L${x1 + 14} ${base - ch + 5} L${x1 + 9} ${base - ch + 7} L${x1 + 7} ${base - ch + 12} L${x1 + 5} ${base - ch + 7} L${x1} ${base - ch + 5} L${x1 + 5} ${base - ch + 3} Z`} fill="#fff3a6" r={1.5} />
          </g>
        </g>
      )
    }
    case 'hat_birrete': {
      const base = top + 9
      const sw = w * 0.56
      const bw = w * 0.98
      return (
        <g transform={`rotate(${tilt * 0.6} ${cx} ${base})`}>
          <ellipse cx={cx} cy={base + 1.5} rx={sw * 0.5} ry="3" fill="#000" opacity="0.2" />
          <Vol fill="#2b2340" shine={false}>
            <rect x={cx - sw / 2} y={base - 11} width={sw} height="13" rx="5" />
          </Vol>
          <RTri d={`M${cx - bw / 2} ${base - 12} L${cx} ${base - 22} L${cx + bw / 2} ${base - 12} L${cx} ${base - 3} Z`} fill="#3a3152" r={4} />
          <circle cx={cx} cy={base - 12.5} r="2.2" fill="#ffd23f" />
          <g className="cr-tassel">
            <path d={`M${cx} ${base - 12.5} L${cx + bw * 0.4} ${base - 9} L${cx + bw * 0.4} ${base + 2}`} stroke="#ffd23f" strokeWidth="2" fill="none" strokeLinecap="round" />
            <rect x={cx + bw * 0.4 - 3} y={base + 1} width="6" height="9" rx="2.5" fill="#ffd23f" />
          </g>
        </g>
      )
    }
    // ----- Cara -----
    case 'hat_moño': {
      const [bx, by] = s.bow
      return (
        <g transform={`translate(${bx} ${by}) rotate(18) scale(0.8) translate(-80 -30)`}>
          <RTri d="M80 30 L68 22 L68 38 Z" fill="#ff5fa2" r={6} />
          <RTri d="M80 30 L92 22 L92 38 Z" fill="#ff5fa2" r={6} />
          <rect x="76.5" y="26" width="7" height="8" rx="3.5" fill="#d93d82" />
        </g>
      )
    }
    case 'hat_gafas': {
      // Patillas hasta los lados de la cabeza de esta especie
      const left = sit ? 21 : h.x + 1
      const right = sit ? 99 : h.x + h.w - 1
      return (
        <g>
          <rect x={left} y={ly - 3} width={lx - 10 - left + 2} height="3.2" rx="1.6" fill="#2b2340" />
          <rect x={rx + 8} y={ry - 3} width={right - rx - 8} height="3.2" rx="1.6" fill="#2b2340" />
          <rect x={lx - 10} y={ly - 8} width="20" height="16" rx="7" fill="#2b2340" />
          <rect x={rx - 10} y={ry - 8} width="20" height="16" rx="7" fill="#2b2340" />
          <rect x={lx + 9} y={ly - 2.5} width={rx - lx - 18} height="3.5" rx="1.75" fill="#2b2340" />
          <rect x={lx - 6} y={ly - 5} width="6" height="2.6" rx="1.3" fill="#fff" opacity="0.6" />
          <rect x={rx - 6} y={ry - 5} width="6" height="2.6" rx="1.3" fill="#fff" opacity="0.6" />
        </g>
      )
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Mascotas (como <g> de 40×40)
// ---------------------------------------------------------------------------

export function Pet({ id, still }: { id: string; still?: boolean }) {
  const art = PETS[id]
  if (!art) return null
  return (
    <g className={`cr${still ? ' cr-still' : ''}`}>
      <Defs />
      <ellipse cx="20" cy="40" rx="11" ry="2.6" fill="url(#crGround)" />
      <g className="cr-pet">{art}</g>
    </g>
  )
}

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
