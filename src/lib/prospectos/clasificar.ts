// Clasificación de prospectos con IA: el giro real y si el negocio es del giro de PeluDesk o se descarta
// (adiestramiento, refugio, farmacia, escuela de grooming, tienda sin servicio…). Conservador: con duda, se queda.
// Sin imports de valores: la llamada a la IA llega como parámetro (ver ia.ts).

import type { LlamarIA } from "./ia";

export type ParaClasificar = {
  id: string;
  nombre: string;
  tipos: string[];
  calificacion: number | null;
  resenas: number | null;
  web: string | null;
  resumen_web: string | null;
  direccion: string | null;
};

export type Servicio = "guarderia" | "hotel" | "estetica" | "veterinaria";
export type Clasificacion = { id: string; servicios: Servicio[]; es_del_giro: boolean; motivo: string };

export const SISTEMA_CLASIFICAR = `Clasificas negocios de México que salieron en Google Maps al buscar guarderías caninas, hoteles para perros, estéticas caninas y veterinarias. PeluDesk es un sistema para negocios que dan ESTOS servicios a mascotas:
- guarderia: cuidan perros durante el día (daycare, guardería, kínder canino).
- hotel: hospedaje de mascotas por noche (hotel, pensión, estancia, resort canino).
- estetica: baño, corte y arreglo de mascotas (estética, grooming, spa canino), también a domicilio.
- veterinaria: atención médica (clínica, hospital, consultorio veterinario, médico veterinario a domicilio).

Por cada negocio di qué servicios de esos da (puede ser más de uno) y si es del giro.
NO es del giro (es_del_giro = false) si su negocio principal es otra cosa y no da ninguno de los cuatro: adiestramiento o entrenamiento canino sin hospedaje ni guardería, refugio, asociación o adopción, farmacia veterinaria sin consulta, tienda de mascotas o de alimento y accesorios sin estética ni consulta, escuela o academia de grooming, criadero o venta de cachorros, club canino, laboratorio, funeraria o crematorio de mascotas, transporte de mascotas, paseadores, o un negocio que no tiene que ver con mascotas.
Una tienda o farmacia que además tiene estética o consultorio SÍ es del giro (con ese servicio). Un adiestramiento con pensión SÍ es del giro (hotel).
Si los datos no alcanzan para estar seguro, es_del_giro = true y escoge el servicio que más se parezca a su nombre o a la búsqueda. El motivo va en español, corto (máximo 15 palabras), y dice por qué; si se descarta, dice qué es (por ejemplo «Adiestramiento canino, sin guardería ni hotel»).`;

const HERRAMIENTA = {
  name: "clasificacion",
  description: "Devuelve la clasificación de cada negocio de la lista, uno por id.",
  input_schema: {
    type: "object",
    properties: {
      negocios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            servicios: { type: "array", items: { type: "string", enum: ["guarderia", "hotel", "estetica", "veterinaria"] } },
            es_del_giro: { type: "boolean" },
            motivo: { type: "string" },
          },
          required: ["id", "servicios", "es_del_giro", "motivo"],
        },
      },
    },
    required: ["negocios"],
  },
};

const VALIDOS = new Set<Servicio>(["guarderia", "hotel", "estetica", "veterinaria"]);

/** El giro que se guarda: uno de los cuatro, o «mixto» si da dos o más. */
export function giroDeServicios(servicios: Servicio[], respaldo: string): string {
  const u = [...new Set(servicios.filter((s) => VALIDOS.has(s)))];
  if (u.length === 0) return respaldo;
  return u.length === 1 ? u[0] : "mixto";
}

export async function clasificarLote(lista: ParaClasificar[], llamar: LlamarIA, modelo?: string): Promise<Clasificacion[]> {
  if (lista.length === 0) return [];
  const usuario = lista
    .map((p) =>
      [
        `id: ${p.id}`,
        `nombre: ${p.nombre}`,
        p.tipos.length ? `categorías de Google: ${p.tipos.join(", ")}` : null,
        p.resenas != null ? `reseñas: ${p.resenas}${p.calificacion != null ? ` (calificación ${p.calificacion})` : ""}` : null,
        p.web ? `web: ${p.web}` : null,
        p.resumen_web ? `lo que dice su web: ${p.resumen_web.slice(0, 400)}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
  const r = (await llamar({ sistema: SISTEMA_CLASIFICAR, usuario: `Clasifica estos ${lista.length} negocios:\n\n${usuario}`, herramienta: HERRAMIENTA, modelo, maxTokens: 200 + lista.length * 90 })) as {
    negocios?: { id?: string; servicios?: string[]; es_del_giro?: boolean; motivo?: string }[];
  };
  const ids = new Set(lista.map((p) => p.id));
  // A veces el modelo manda la lista como texto JSON en vez de arreglo: se lee igual; si no se entiende, lote vacío.
  let negocios: unknown = r.negocios ?? [];
  if (typeof negocios === "string") {
    try {
      negocios = JSON.parse(negocios);
    } catch {
      negocios = [];
    }
  }
  return (Array.isArray(negocios) ? (negocios as NonNullable<typeof r.negocios>) : [])
    .filter((n) => n.id && ids.has(n.id) && typeof n.es_del_giro === "boolean")
    .map((n) => ({
      id: n.id!,
      servicios: (n.servicios ?? []).filter((s): s is Servicio => VALIDOS.has(s as Servicio)),
      es_del_giro: n.es_del_giro!,
      motivo: (n.motivo ?? "").trim().slice(0, 200) || (n.es_del_giro ? "Del giro" : "No es del giro"),
    }));
}
