// La forma de la matriz de tarifas de un servicio, en un solo lugar.
//
// Vive aquí y no dentro del componente porque hay dos pantallas que
// necesitan la MISMA respuesta y tienen que coincidir: la matriz, que
// dibuja una celda por combinación, y la lista de servicios, que cuenta
// cuántas de esas celdas están sin capturar para poder avisar. Si cada
// una derivara las combinaciones por su cuenta, el aviso diría "2 sin
// tarifa" y la matriz mostraría tres huecos, que es peor que no avisar.

export type OpcionDimension = { id: string; etiqueta: string; clave?: string };

// Los pelajes que entran a la matriz de un grupo que cobra por pelaje (el
// mestizo): corto, medio y largo. «Rizado» no tiene celda: un perro rizado de
// ese grupo pide excepción, como cualquier combinación sin precio.
export const PELAJES_DE_MATRIZ = ["corto", "medio", "largo"];

export type GrupoRaza = {
  id: string;
  nombre: string;
  depende_tamano: boolean;
  // Cobra también por pelaje (talla × pelaje): el grupo «Mestizo / sin raza».
  depende_pelaje?: boolean;
};

export type DimensionesServicio = {
  depende_grupo_raza: boolean;
  depende_tamano: boolean;
  depende_pelaje: boolean;
  depende_cantidad: boolean;
};

export type Catalogos = {
  grupos: GrupoRaza[];
  tamanos: OpcionDimension[];
  pelajes: OpcionDimension[];
};

export type CeldaVigente = {
  grupo_raza_id: string | null;
  precio_pelo_maltratado?: number | null;
  tamano_id: string | null;
  pelaje_id: string | null;
  cantidad_desde: number;
  cantidad_hasta: number | null;
  precio: number | null;
  no_aplica: boolean;
  // Precio que el sistema calculó por proporción y nadie ha confirmado.
  calculado?: boolean;
};

// Una fila de la matriz. Cuando el servicio cotiza por grupo de raza, la
// fila es (grupo, talla) y no solo (talla): el tamaño lo pide el GRUPO,
// no el servicio — el de pelo corto se cobra por talla y los otros seis
// tienen un precio único. Es exactamente lo que hace validar_cita_estetica
// al resolver el precio, así que la matriz enseña las mismas celdas que
// la base va a buscar.
export type FilaMatriz = {
  key: string;
  grupo_raza_id: string | null;
  tamano_id: string | null;
  // Solo en los grupos que cobran por pelaje: el pelaje de esta fila.
  pelaje_id: string | null;
  etiqueta: string;
  sub: string | null;
};

export type TramoMatriz = { key: string; desde: number; hasta: number | null };

export const SIN_DIMENSION: OpcionDimension = { id: "", etiqueta: "—" };

export function claveCelda(
  desde: number,
  hasta: number | null,
  grupoId: string | null,
  tamanoId: string | null,
  pelajeId: string | null
): string {
  return `${desde}|${hasta ?? ""}|${grupoId ?? ""}|${tamanoId ?? ""}|${pelajeId ?? ""}`;
}

export function filasDeMatriz(
  servicio: DimensionesServicio,
  catalogos: Pick<Catalogos, "grupos" | "tamanos"> & { pelajes?: OpcionDimension[] }
): FilaMatriz[] {
  if (servicio.depende_grupo_raza) {
    const filas: FilaMatriz[] = [];
    const pelajesMatriz = (catalogos.pelajes ?? []).filter((p) => !p.clave || PELAJES_DE_MATRIZ.includes(p.clave));
    for (const grupo of catalogos.grupos) {
      if (grupo.depende_pelaje) {
        const tallas = grupo.depende_tamano ? catalogos.tamanos : [null];
        for (const tamano of tallas) {
          for (const pelaje of pelajesMatriz) {
            filas.push({
              key: `${grupo.id}|${tamano?.id ?? ""}|${pelaje.id}`,
              grupo_raza_id: grupo.id,
              tamano_id: tamano?.id ?? null,
              pelaje_id: pelaje.id,
              etiqueta: grupo.nombre,
              sub: [tamano?.etiqueta, `pelo ${pelaje.etiqueta.toLowerCase()}`].filter(Boolean).join(" · "),
            });
          }
        }
      } else if (grupo.depende_tamano) {
        for (const tamano of catalogos.tamanos) {
          filas.push({
            key: `${grupo.id}|${tamano.id}`,
            grupo_raza_id: grupo.id,
            tamano_id: tamano.id,
            pelaje_id: null,
            etiqueta: grupo.nombre,
            sub: tamano.etiqueta,
          });
        }
      } else {
        filas.push({
          key: `${grupo.id}|`,
          grupo_raza_id: grupo.id,
          tamano_id: null,
          pelaje_id: null,
          etiqueta: grupo.nombre,
          sub: null,
        });
      }
    }
    return filas;
  }

  if (servicio.depende_tamano) {
    return catalogos.tamanos.map((t) => ({
      key: `|${t.id}`,
      grupo_raza_id: null,
      tamano_id: t.id,
      pelaje_id: null,
      etiqueta: t.etiqueta,
      sub: null,
    }));
  }

  return [{ key: "|", grupo_raza_id: null, tamano_id: null, pelaje_id: null, etiqueta: "—", sub: null }];
}

export function columnasDeMatriz(
  servicio: DimensionesServicio,
  pelajes: OpcionDimension[]
): OpcionDimension[] {
  return servicio.depende_pelaje ? pelajes : [SIN_DIMENSION];
}

// Los tramos de cantidad no salen de un catálogo: los inventa quien
// captura. Se derivan de lo que ya está capturado para que al abrir la
// matriz aparezcan los tramos reales del servicio y no uno vacío.
export function tramosDeMatriz(
  servicio: DimensionesServicio,
  vigentes: CeldaVigente[]
): TramoMatriz[] {
  if (!servicio.depende_cantidad) {
    return [{ key: "unico", desde: 1, hasta: null }];
  }
  const vistos = new Map<string, TramoMatriz>();
  for (const v of vigentes) {
    const key = `${v.cantidad_desde}|${v.cantidad_hasta ?? ""}`;
    if (!vistos.has(key)) vistos.set(key, { key, desde: v.cantidad_desde, hasta: v.cantidad_hasta });
  }
  const lista = Array.from(vistos.values()).sort((a, b) => a.desde - b.desde);
  return lista.length > 0 ? lista : [{ key: "tramo-1", desde: 1, hasta: null }];
}

export function etiquetaTramo(t: { desde: number; hasta: number | null }): string {
  return t.hasta ? `${t.desde}–${t.hasta}` : `${t.desde}+`;
}

export function etiquetaFila(fila: FilaMatriz): string {
  return fila.sub ? `${fila.etiqueta} · ${fila.sub}` : fila.etiqueta;
}

// Cuántas celdas de este servicio no tienen nada capturado. Ni precio ni
// "no aplica": el hueco de verdad, el que hace que una cita no se pueda
// reservar y nadie se entere hasta que el cliente está en el mostrador.
export function contarSinTarifa(
  servicio: DimensionesServicio,
  catalogos: Catalogos,
  vigentes: CeldaVigente[]
): number {
  const capturadas = new Set(
    vigentes.map((v) =>
      claveCelda(v.cantidad_desde, v.cantidad_hasta, v.grupo_raza_id, v.tamano_id, v.pelaje_id)
    )
  );
  let faltan = 0;
  for (const tramo of tramosDeMatriz(servicio, vigentes)) {
    for (const fila of filasDeMatriz(servicio, catalogos)) {
      for (const col of columnasDeMatriz(servicio, catalogos.pelajes)) {
        const clave = claveCelda(
          tramo.desde,
          tramo.hasta,
          fila.grupo_raza_id,
          fila.tamano_id,
          fila.pelaje_id ?? (col.id || null)
        );
        if (!capturadas.has(clave)) faltan += 1;
      }
    }
  }
  return faltan;
}
