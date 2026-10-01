/**
 * Íconos propios del reporte de comportamiento (dibujados para PeluDesk, en
 * trazo redondeado sobre una cuadrícula de 48). Los usa la web y la tarjeta
 * (como data URI dentro de satori). La plantilla de cada negocio guarda solo
 * la CLAVE del ícono; el dibujo vive aquí.
 */
type Trazo = { c: string; g: number };

const L = ({ c, g }: Trazo) => `fill="none" stroke="${c}" stroke-width="${g}" stroke-linecap="round" stroke-linejoin="round"`;
const R = ({ c }: Trazo) => `fill="${c}" stroke="none"`;
const SUAVE = ({ c }: Trazo) => `fill="${c}" fill-opacity="0.14" stroke="none"`;

// Cara redonda de fondo.
const cara = (t: Trazo) => `<circle cx="24" cy="24" r="19" ${SUAVE(t)}/><circle cx="24" cy="24" r="19" ${L(t)}/>`;
const ojos = (t: Trazo) => `<circle cx="17.5" cy="21" r="2" ${R(t)}/><circle cx="30.5" cy="21" r="2" ${R(t)}/>`;

const DIBUJOS: Record<string, { etiqueta: string; dibujo: (t: Trazo) => string }> = {
  cara_muy_tranquilo: {
    etiqueta: "Cara muy tranquila",
    dibujo: (t) => `${cara(t)}<path d="M13.5 22q4 4 8 0M26.5 22q4 4 8 0" ${L(t)}/><path d="M18 30q6 5 12 0" ${L(t)}/>`,
  },
  cara_relajado: {
    etiqueta: "Cara relajada",
    dibujo: (t) => `${cara(t)}${ojos(t)}<path d="M17 29q7 6 14 0" ${L(t)}/>`,
  },
  cara_activo: {
    etiqueta: "Cara activa",
    dibujo: (t) => `${cara(t)}${ojos(t)}<path d="M15.5 28q8.5 11 17 0z" ${R(t)}/>`,
  },
  cara_muy_energetico: {
    etiqueta: "Cara muy energética",
    dibujo: (t) =>
      `${cara(t)}<path d="M13.5 22q4-6 8 0M26.5 22q4-6 8 0" ${L(t)}/><path d="M14.5 27q9.5 13 19 0z" ${R(t)}/><path d="M21 35q3-4 6 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  cara_nervioso: {
    etiqueta: "Cara nerviosa",
    dibujo: (t) =>
      `${cara(t)}${ojos(t)}<path d="M12.5 15l7 2.5M35.5 15l-7 2.5" ${L(t)}/><path d="M16.5 32q2.4-3 4.8 0t4.8 0 4.4 0" ${L(t)}/>`,
  },
  cara_sensible: {
    etiqueta: "Cara sensible",
    dibujo: (t) =>
      `${cara(t)}${ojos(t)}<path d="M12.5 17.5l7-2.5M35.5 17.5l-7-2.5" ${L(t)}/><path d="M18 33q6-5 12 0" ${L(t)}/>`,
  },
  carita_feliz: {
    etiqueta: "Carita feliz",
    dibujo: (t) =>
      `<circle cx="24" cy="24" r="19" ${SUAVE(t)}/><circle cx="24" cy="24" r="19" ${L(t)}/><circle cx="17.5" cy="20" r="2.2" ${R(t)}/><circle cx="30.5" cy="20" r="2.2" ${R(t)}/><path d="M14 27q10 12 20 0" ${L(t)}/>`,
  },
  pelota: {
    etiqueta: "Pelota",
    dibujo: (t) =>
      `<circle cx="24" cy="24" r="18" ${L(t)}/><path d="M10 12q12 12 0 24M38 12q-12 12 0 24M6.5 24h35" ${L(t)}/>`,
  },
  pelota_tenis: {
    etiqueta: "Pelota de tenis",
    dibujo: (t) => `<circle cx="24" cy="24" r="18" ${L(t)}/><path d="M9 14q9 10 0 20M39 14q-9 10 0 20" ${L(t)}/>`,
  },
  arbol: {
    etiqueta: "Árbol (senderismo)",
    dibujo: (t) => `<path d="M24 5l-9 13h5l-9 12h26l-9-12h5z" ${L(t)}/><path d="M24 30v12" ${L(t)}/>`,
  },
  alberca: {
    etiqueta: "Alberca",
    dibujo: (t) =>
      `<path d="M16 6v24M30 6v24M16 13h14M16 21h14" ${L(t)}/><path d="M5 34q4.5-4 9 0t9 0 9 0 9 0M5 41q4.5-4 9 0t9 0 9 0 9 0" ${L(t)}/>`,
  },
  agua: {
    etiqueta: "Agua",
    dibujo: (t) => `<path d="M5 16q4.5-4 9 0t9 0 9 0 9 0M5 26q4.5-4 9 0t9 0 9 0 9 0M5 36q4.5-4 9 0t9 0 9 0 9 0" ${L(t)}/>`,
  },
  nariz: {
    etiqueta: "Nariz (olfato)",
    dibujo: (t) =>
      `<path d="M19 6c1 9-1 17-7 24-3 3 0 7 5 5 3-1 4-3 7-3s4 2 7 3c5 2 8-2 5-5-6-7-8-15-7-24" ${L(t)}/><circle cx="18" cy="38" r="0.1" ${L(t)}/>`,
  },
  perro_durmiendo: {
    etiqueta: "Perro durmiendo",
    dibujo: (t) =>
      `<path d="M5 38v-5q0-8 9-8h14q9 0 9 8v5z" ${L(t)}/><circle cx="35" cy="22" r="7" ${L(t)}/><path d="M29.5 17q-4 4-1.5 10" ${L(t)}/><path d="M33 22q2 2 4 0" ${L(t)}/><path d="M5 33q-3-3 0-7" ${L(t)}/>`,
  },
  perro_alerta: {
    etiqueta: "Perro alerta",
    dibujo: (t) =>
      `<circle cx="24" cy="18" r="9" ${L(t)}/><path d="M17 11l-6 4 1 9M31 11l6 4-1 9" ${L(t)}/><circle cx="20.5" cy="17" r="1.5" ${R(t)}/><circle cx="27.5" cy="17" r="1.5" ${R(t)}/><circle cx="24" cy="21.5" r="1.6" ${R(t)}/><path d="M14 44V34q0-6 10-6t10 6v10" ${L(t)}/>`,
  },
  zzz: {
    etiqueta: "Zzz (dormir)",
    dibujo: (t) => `<path d="M8 15h11L8 29h11M25 8h9L25 18h9M38 3h6l-6 7h6" ${L(t)}/>`,
  },
  birrete: {
    etiqueta: "Birrete (entrenamiento)",
    dibujo: (t) => `<path d="M24 9l20 9-20 9L4 18z" ${L(t)}/><path d="M13 23v10q11 7 22 0V23M44 18v11" ${L(t)}/>`,
  },
  rompecabezas: {
    etiqueta: "Rompecabezas",
    dibujo: (t) => `<path d="M10 12h9a4.5 4.5 0 1 1 9 0h9v9a4.5 4.5 0 1 0 0 9v9h-9a4.5 4.5 0 1 0-9 0h-9V30a4.5 4.5 0 1 1 0-9z" ${L(t)}/>`,
  },
  hueso: {
    etiqueta: "Hueso",
    dibujo: (t) =>
      `<rect x="13" y="19" width="22" height="10" rx="2" ${R(t)}/><circle cx="12" cy="17" r="5.2" ${R(t)}/><circle cx="12" cy="31" r="5.2" ${R(t)}/><circle cx="36" cy="17" r="5.2" ${R(t)}/><circle cx="36" cy="31" r="5.2" ${R(t)}/>`,
  },
  huella: {
    etiqueta: "Huella",
    dibujo: (t) =>
      `<ellipse cx="24" cy="32" rx="10" ry="8" ${R(t)}/><circle cx="10.5" cy="23" r="4.8" ${R(t)}/><circle cx="19.5" cy="13.5" r="4.8" ${R(t)}/><circle cx="28.5" cy="13.5" r="4.8" ${R(t)}/><circle cx="37.5" cy="23" r="4.8" ${R(t)}/>`,
  },
  estrella: {
    etiqueta: "Estrella",
    dibujo: (t) =>
      `<path d="M24 5l5.6 11.6 12.7 1.7-9.3 8.8 2.3 12.6L24 33.8 12.7 40.7 15 28.1l-9.3-8.8 12.7-1.7z" fill="${t.c}" stroke="${t.c}" stroke-width="2.4" stroke-linejoin="round"/>`,
  },
  plato: {
    etiqueta: "Plato de comida",
    dibujo: (t) => `<path d="M4 27h40q-1 12-11 14H15Q5 39 4 27z" ${L(t)}/><path d="M12 27q2-11 12-11t12 11" ${L(t)}/><path d="M24 16v-3" ${L(t)}/>`,
  },
  luna: {
    etiqueta: "Luna",
    dibujo: (t) =>
      `<path d="M30 7a17 17 0 1 0 11 27A15 15 0 0 1 30 7z" ${L(t)}/><path d="M36 9l1.2 3 3 1.2-3 1.2L36 17.4l-1.2-3.2-3-1.2 3-1.2zM42 20l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" ${R(t)}/>`,
  },
  portapapeles: {
    etiqueta: "Portapapeles",
    dibujo: (t) => `<rect x="10" y="9" width="28" height="34" rx="4" ${L(t)}/><rect x="17" y="5" width="14" height="8" rx="2.5" ${L(t)}/><path d="M17 23h14M17 30h14M17 37h8" ${L(t)}/>`,
  },
  corazon: {
    etiqueta: "Corazón",
    dibujo: (t) => `<path d="M24 41S7 31 7 19a8.5 8.5 0 0 1 17-2 8.5 8.5 0 0 1 17 2c0 12-17 22-17 22z" ${L(t)}/>`,
  },
  gota: {
    etiqueta: "Gota de agua",
    dibujo: (t) => `<path d="M24 5C16 17 11 24 11 30a13 13 0 0 0 26 0c0-6-5-13-13-25z" ${L(t)}/><path d="M18 31q1 5 6 6" ${L(t)}/>`,
  },
  advertencia: {
    etiqueta: "Advertencia",
    dibujo: (t) =>
      `<path d="M24 6l20 36H4z" fill="${t.c}" fill-opacity="0.2" stroke="${t.c}" stroke-width="${t.g}" stroke-linejoin="round"/><path d="M24 19v11" ${L(t)}/><circle cx="24" cy="36" r="1.9" ${R(t)}/>`,
  },
  estetoscopio: {
    etiqueta: "Estetoscopio (seguimiento)",
    dibujo: (t) =>
      `<path d="M10 5v12a8 8 0 0 0 16 0V5M7 5h6M23 5h6" ${L(t)}/><path d="M18 25v8a9 9 0 0 0 18 0v-4" ${L(t)}/><circle cx="36" cy="24" r="4.5" ${L(t)}/>`,
  },
  sol: {
    etiqueta: "Sol",
    dibujo: (t) => `<circle cx="24" cy="24" r="8" ${L(t)}/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M10.5 37.5l4.2-4.2M33.3 14.7l4.2-4.2" ${L(t)}/>`,
  },
  casa: {
    etiqueta: "Casa",
    dibujo: (t) => `<path d="M6 23L24 7l18 16M11 20v21h26V20" ${L(t)}/><path d="M20 41V29h8v12" ${L(t)}/>`,
  },
  reloj: {
    etiqueta: "Reloj",
    dibujo: (t) => `<circle cx="24" cy="24" r="18" ${L(t)}/><path d="M24 12v12l8 5" ${L(t)}/>`,
  },
  medalla: {
    etiqueta: "Medalla",
    dibujo: (t) => `<circle cx="24" cy="29" r="12" ${L(t)}/><path d="M16 5l6 13M32 5l-6 13M24 23l2 4 4.4.6-3.2 3 .8 4.4-4-2.2-4 2.2.8-4.4-3.2-3 4.4-.6z" ${L(t)}/>`,
  },
};

export const CATALOGO_ICONOS: { clave: string; etiqueta: string }[] = Object.entries(DIBUJOS).map(([clave, v]) => ({ clave, etiqueta: v.etiqueta }));

export function existeIcono(nombre: string | null | undefined): boolean {
  return Boolean(nombre && DIBUJOS[nombre]);
}

/** Markup SVG del ícono (48×48, escala al tamaño de quien lo ponga). */
export function iconoSvg(nombre: string | null | undefined, opciones: { color: string; grosor?: number }): string {
  const d = nombre ? DIBUJOS[nombre] : undefined;
  if (!d) return "";
  const cuerpo = d.dibujo({ c: opciones.color, g: opciones.grosor ?? 2.6 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%">${cuerpo}</svg>`;
}

/** Para <img src> (satori no sale a buscar nada: va incrustado). */
export function iconoDataUri(nombre: string | null | undefined, opciones: { color: string; grosor?: number }): string | null {
  const svg = iconoSvg(nombre, opciones);
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
}
