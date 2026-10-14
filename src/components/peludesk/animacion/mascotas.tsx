import type { CSSProperties } from "react";

/**
 * Las mascotas de PeluDesk, una por módulo, dibujadas en SVG (sin imágenes).
 * Parpadean, mueven orejas y cola, y cada pocos segundos cambian de expresión
 * (sonrisa → carita feliz con la boca abierta → cabeza ladeada). Todo es CSS
 * (peludesk-animaciones.css) y se apaga con «reducir movimiento».
 *   recepcion    → Toby, beagle de orejas largas
 *   hotel        → Nube, bichón esponjoso
 *   estetica     → Mimi, poodle con moño
 *   veterinaria  → Michi, gatito con estetoscopio
 */
export type TipoMascota = "recepcion" | "hotel" | "estetica" | "veterinaria";

export const NOMBRE_MASCOTA: Record<TipoMascota, string> = {
  recepcion: "Toby",
  hotel: "Nube",
  estetica: "Mimi",
  veterinaria: "Michi",
};

const TINTA = "#2b2a33";

function Ojos({ x1, x2, y, r = 3.8 }: { x1: number; x2: number; y: number; r?: number }) {
  return (
    <>
      <g className="pd-m-normal">
        <g className="pd-m-parp">
          <circle cx={x1} cy={y} r={r} fill={TINTA} />
          <circle cx={x2} cy={y} r={r} fill={TINTA} />
          <circle cx={x1 + 1.3} cy={y - 1.4} r={1.2} fill="#fff" />
          <circle cx={x2 + 1.3} cy={y - 1.4} r={1.2} fill="#fff" />
        </g>
      </g>
      <g className="pd-m-feliz" fill="none" stroke={TINTA} strokeWidth={2.8} strokeLinecap="round">
        <path d={`M${x1 - 5} ${y + 1.5} q5 -7.5 10 0`} />
        <path d={`M${x2 - 5} ${y + 1.5} q5 -7.5 10 0`} />
      </g>
    </>
  );
}

function Boca({ x, y, ancho = 16 }: { x: number; y: number; ancho?: number }) {
  const m = ancho / 2;
  return (
    <>
      <path className="pd-m-normal" d={`M${x - m} ${y} q${m} 7 ${ancho} 0`} fill="none" stroke={TINTA} strokeWidth={2.4} strokeLinecap="round" />
      <g className="pd-m-feliz">
        <path d={`M${x - m} ${y - 1} q${m} 14 ${ancho} 0 z`} fill="#b23c31" />
        <path d={`M${x - m + 3.5} ${y + 5.5} q${m - 3.5} 6 ${ancho - 7} 0 q-${m - 3.5} -3 -${ancho - 7} 0z`} fill="#f28c82" />
      </g>
    </>
  );
}

function Toby() {
  return (
    <>
      <path className="pd-m-cola" d="M88 100 q20 -4 18 -28" fill="none" stroke="#a9744a" strokeWidth={8} strokeLinecap="round" />
      <ellipse cx={60} cy={102} rx={30} ry={22} fill="#d9a066" />
      <ellipse cx={60} cy={106} rx={15} ry={16} fill="#fff3df" />
      <path d="M36 86 q24 12 48 0 l-1.5 8 q-22.5 11 -45 0z" fill="#4b3f72" />
      <circle cx={60} cy={96} r={4.2} fill="#f5b85c" />
      <g className="pd-m-cabeza">
        <ellipse className="pd-m-oreja-i" cx={31} cy={58} rx={11} ry={21} fill="#8a5a36" transform="rotate(10 31 58)" />
        <ellipse className="pd-m-oreja-d" cx={89} cy={58} rx={11} ry={21} fill="#8a5a36" transform="rotate(-10 89 58)" />
        <circle cx={60} cy={52} r={29} fill="#d9a066" />
        <path d="M60 24 q-9 12 -2 26 h4 q7 -14 -2 -26z" fill="#fff3df" />
        <ellipse cx={60} cy={63} rx={17} ry={16} fill="#fff3df" />
        <Ojos x1={48} x2={72} y={50} />
        <ellipse cx={60} cy={60} rx={6.4} ry={4.6} fill={TINTA} />
        <Boca x={60} y={68} />
      </g>
    </>
  );
}

function Nube() {
  const fluff = "#fbf9ff";
  const borde = "#d6cdec";
  return (
    <>
      <circle className="pd-m-cola" cx={96} cy={96} r={11} fill={fluff} stroke={borde} strokeWidth={2} />
      <ellipse cx={60} cy={101} rx={29} ry={21} fill={fluff} stroke={borde} strokeWidth={2} />
      <path d="M38 87 q22 11 44 0 l-1.5 7 q-20.5 10 -41 0z" fill="#a7d8c8" />
      <circle cx={60} cy={95} r={4} fill="#4b3f72" />
      <g className="pd-m-cabeza">
        <g className="pd-m-oreja-i">
          <circle cx={33} cy={54} r={15} fill={fluff} stroke={borde} strokeWidth={2} />
        </g>
        <g className="pd-m-oreja-d">
          <circle cx={87} cy={54} r={15} fill={fluff} stroke={borde} strokeWidth={2} />
        </g>
        <circle cx={60} cy={50} r={27} fill={fluff} stroke={borde} strokeWidth={2} />
        <circle cx={46} cy={31} r={11} fill={fluff} stroke={borde} strokeWidth={2} />
        <circle cx={60} cy={26} r={12} fill={fluff} stroke={borde} strokeWidth={2} />
        <circle cx={74} cy={31} r={11} fill={fluff} stroke={borde} strokeWidth={2} />
        <circle cx={60} cy={50} r={25} fill={fluff} />
        <Ojos x1={49} x2={71} y={50} r={3.6} />
        <ellipse cx={60} cy={59} rx={5.6} ry={4.2} fill={TINTA} />
        <Boca x={60} y={66} ancho={14} />
      </g>
    </>
  );
}

function Mimi() {
  const pelo = "#f3c3a5";
  const sombra = "#e5a987";
  return (
    <>
      <g className="pd-m-cola">
        <path d="M88 98 q12 -6 14 -20" fill="none" stroke={sombra} strokeWidth={5} strokeLinecap="round" />
        <circle cx={103} cy={72} r={9} fill={pelo} />
      </g>
      <ellipse cx={60} cy={102} rx={27} ry={21} fill={pelo} />
      <path d="M40 88 q20 10 40 0 l-1.5 7 q-18.5 9 -37 0z" fill="#f28c82" />
      <circle cx={43} cy={118} r={7} fill={sombra} />
      <circle cx={77} cy={118} r={7} fill={sombra} />
      <g className="pd-m-cabeza">
        <g className="pd-m-oreja-i">
          <ellipse cx={34} cy={58} rx={11} ry={19} fill={sombra} />
          <circle cx={32} cy={76} r={9} fill={sombra} />
        </g>
        <g className="pd-m-oreja-d">
          <ellipse cx={86} cy={58} rx={11} ry={19} fill={sombra} />
          <circle cx={88} cy={76} r={9} fill={sombra} />
        </g>
        <circle cx={60} cy={52} r={24} fill={pelo} />
        <circle cx={60} cy={26} r={14} fill={pelo} />
        <circle cx={47} cy={33} r={9} fill={pelo} />
        <circle cx={73} cy={33} r={9} fill={pelo} />
        <ellipse cx={60} cy={62} rx={13} ry={11} fill="#ffe6d3" />
        <Ojos x1={50} x2={70} y={50} r={3.4} />
        <ellipse cx={60} cy={58} rx={5.2} ry={3.8} fill={TINTA} />
        <Boca x={60} y={65} ancho={12} />
        <g transform="translate(78 24) rotate(18)">
          <path d="M0 0 l-15 -9 v18z" fill="#f28c82" />
          <path d="M0 0 l15 -9 v18z" fill="#f28c82" />
          <circle r={4.4} fill="#b23c31" />
        </g>
      </g>
    </>
  );
}

function Michi() {
  const pelo = "#b9bdcc";
  return (
    <>
      <path className="pd-m-cola" d="M86 104 q26 -2 20 -34 q-2 -8 -9 -6" fill="none" stroke="#8f94a8" strokeWidth={9} strokeLinecap="round" />
      <ellipse cx={60} cy={103} rx={28} ry={21} fill={pelo} />
      <ellipse cx={60} cy={108} rx={14} ry={14} fill="#eef0f6" />
      <path d="M40 86 q-3 18 14 22" fill="none" stroke="#4b3f72" strokeWidth={3} strokeLinecap="round" />
      <path d="M80 86 q3 18 -14 22" fill="none" stroke="#4b3f72" strokeWidth={3} strokeLinecap="round" />
      <circle cx={60} cy={110} r={6.5} fill="#a7d8c8" stroke="#4b3f72" strokeWidth={2.6} />
      <g className="pd-m-cabeza">
        <g className="pd-m-oreja-i">
          <path d="M33 44 L36 14 L58 32z" fill={pelo} />
          <path d="M39 38 L40 24 L51 33z" fill="#f4b8b8" />
        </g>
        <g className="pd-m-oreja-d">
          <path d="M87 44 L84 14 L62 32z" fill={pelo} />
          <path d="M81 38 L80 24 L69 33z" fill="#f4b8b8" />
        </g>
        <ellipse cx={60} cy={53} rx={29} ry={26} fill={pelo} />
        <path d="M52 29 q8 6 16 0 M56 27 l1 8 M64 27 l-1 8" fill="none" stroke="#8f94a8" strokeWidth={2.4} strokeLinecap="round" />
        <ellipse cx={60} cy={62} rx={12} ry={9} fill="#eef0f6" />
        <Ojos x1={47} x2={73} y={51} r={4.4} />
        <path d="M56.5 58 h7 l-3.5 4z" fill="#f28c82" />
        <path className="pd-m-normal" d="M60 62 q-3 5 -8 3 M60 62 q3 5 8 3" fill="none" stroke={TINTA} strokeWidth={2.2} strokeLinecap="round" />
        <path className="pd-m-feliz" d="M52 64 q8 11 16 0z" fill="#b23c31" />
        <g stroke="#8f94a8" strokeWidth={1.6} strokeLinecap="round">
          <path d="M36 60 l-15 -3 M36 64 l-15 3 M84 60 l15 -3 M84 64 l15 3" />
        </g>
      </g>
    </>
  );
}

const DIBUJOS: Record<TipoMascota, () => React.JSX.Element> = { recepcion: Toby, hotel: Nube, estetica: Mimi, veterinaria: Michi };

/** `retraso` en segundos desfasa sus movimientos para que no latan todas a la vez. */
export function Mascota({ tipo, tamano = 64, retraso = 0, className = "", titulo }: { tipo: TipoMascota; tamano?: number; retraso?: number; className?: string; titulo?: string }) {
  const Dibujo = DIBUJOS[tipo];
  return (
    <svg
      viewBox="0 0 120 124"
      width={tamano}
      height={Math.round((tamano * 124) / 120)}
      className={`pd-m shrink-0 ${className}`}
      style={{ "--d": `${retraso}s` } as CSSProperties}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <Dibujo />
    </svg>
  );
}
