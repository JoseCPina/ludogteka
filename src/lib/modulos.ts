// Guardería y hotel son UN solo modelo de datos (tabla `estancias`) y DOS
// módulos en la navegación. El staff no los piensa como "reservas": los
// piensa como dos servicios distintos, con su propia lista de quién llega
// hoy, su propio check-in y su propia agenda de reservas.
//
// Lo que NO se parte es el cupo: los dos comparten el mismo espacio
// físico. Por eso cada módulo muestra la ocupación de TODA la casa, no
// solo la suya — si guardería mostrara 10/35 ignorando a los perros de
// hotel, recepción sobrevendería sin enterarse. Ver
// `reservas/modulo/tabla-ocupacion.tsx`.
export type CategoriaEstancia = "guarderia" | "hotel";

export type ModuloEstancia = {
  categoria: CategoriaEstancia;
  etiqueta: string;
  base: string;
  /** Cómo se llama una visita en este módulo, para los textos de la UI. */
  visita: string;
  descripcion: string;
};

export const MODULOS: Record<CategoriaEstancia, ModuloEstancia> = {
  guarderia: {
    categoria: "guarderia",
    etiqueta: "Guardería",
    base: "/guarderia",
    visita: "día de guardería",
    descripcion: "Perros por día, sin pasar la noche.",
  },
  hotel: {
    categoria: "hotel",
    etiqueta: "Hotel",
    base: "/hotel",
    visita: "estancia de hotel",
    descripcion: "Perros que se quedan a dormir.",
  },
};

export const MODULOS_LISTA: ModuloEstancia[] = [MODULOS.guarderia, MODULOS.hotel];

export function moduloDeCategoria(categoria: string | null | undefined): ModuloEstancia | null {
  if (categoria === "guarderia" || categoria === "hotel") return MODULOS[categoria];
  return null;
}

// Para los enlaces de "volver" de las pantallas compartidas (check-in de
// una estancia, detalle de una serie): el módulo al que pertenece un
// registro se deduce de SU PROPIA categoría, no de un parámetro en la URL
// que se pueda perder al recargar o al llegar por un enlace pegado.
export function baseDeCategoria(categoria: string | null | undefined): string {
  return moduloDeCategoria(categoria)?.base ?? "/reservas";
}
