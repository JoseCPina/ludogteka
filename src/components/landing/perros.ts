import type { StaticImageData } from "next/image";
import galleta from "./fotos/perros/galleta.webp";
import dasha from "./fotos/perros/dasha.webp";
import rusher from "./fotos/perros/rusher.webp";
import zuki from "./fotos/perros/zuki.webp";
import simon from "./fotos/perros/simon.webp";
import malinois from "./fotos/perros/malinois.webp";
import granDanes from "./fotos/perros/gran-danes.webp";
import miel from "./fotos/perros/miel.webp";
import tricolor from "./fotos/perros/tricolor.webp";

// Los perros de la landing: clientes reales de Ludogteka, recortados de
// sus fotos (sin fondo) para asomarse en las tarjetas como en la lona de
// la camioneta. Los nombres son los que trae la lona; el que no aparece
// ahí va sin hueso hasta que el negocio nos diga cómo se llama.
export type PerroLanding = {
  foto: StaticImageData;
  nombre?: string;
  alt: string;
  // Qué tan alto sale en su tarjeta: los de cuerpo entero sobresalen más
  // que los de busto.
  altoEnTarjeta: string;
};

type ClavePerro = "galleta" | "dasha" | "rusher" | "zuki" | "simon" | "malinois" | "granDanes" | "miel" | "tricolor";

export const PERROS: Record<ClavePerro, PerroLanding> = {
  galleta: {
    foto: galleta,
    nombre: "Galleta",
    alt: "Galleta, pitbull blanco con café y chaleco de mezclilla, sonriendo",
    altoEnTarjeta: "h-[120%]",
  },
  dasha: {
    foto: dasha,
    nombre: "Dasha",
    alt: "Dasha, perrita color miel con bandana verde, sentada y sonriendo",
    altoEnTarjeta: "h-[121%]",
  },
  rusher: {
    foto: rusher,
    nombre: "Rusher",
    alt: "Rusher, husky de ojos azules, echado y atento",
    altoEnTarjeta: "h-[112%]",
  },
  zuki: {
    foto: zuki,
    nombre: "Zuki",
    alt: "Zuki, perrito negro con café y suéter, con la boca abierta de felicidad",
    altoEnTarjeta: "h-[110%]",
  },
  simon: {
    foto: simon,
    nombre: "Simón",
    alt: "Simón, bóxer atigrado, mirando hacia arriba con la boca abierta",
    altoEnTarjeta: "h-[119%]",
  },
  malinois: {
    foto: malinois,
    alt: "Pastor belga malinois con bandana rosa, sentado, con la lengua de fuera",
    altoEnTarjeta: "h-[121%]",
  },
  granDanes: {
    foto: granDanes,
    alt: "Gran danés negro de cuerpo entero, parado y tranquilo",
    altoEnTarjeta: "h-[120%]",
  },
  miel: {
    foto: miel,
    alt: "Perro color miel con collar verde, sentado y atento",
    altoEnTarjeta: "h-[120%]",
  },
  tricolor: {
    foto: tricolor,
    alt: "Perro tricolor negro, café y blanco, sentado mirando hacia arriba",
    altoEnTarjeta: "h-[118%]",
  },
};
