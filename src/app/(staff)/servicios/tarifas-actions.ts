"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FilaTarifaGuardar = {
  cantidad_desde: number;
  cantidad_hasta: number | null;
  tamano_id: string | null;
  pelaje_id: string | null;
  precio: number | null;
  no_aplica: boolean;
};

export type EstadoGuardarTarifas = { error: string | null; ok?: boolean };

function etiquetaTramo(f: { cantidad_desde: number; cantidad_hasta: number | null }): string {
  return f.cantidad_hasta ? `${f.cantidad_desde}-${f.cantidad_hasta}` : `${f.cantidad_desde}+`;
}

function seTraslapan(
  a: { cantidad_desde: number; cantidad_hasta: number | null },
  b: { cantidad_desde: number; cantidad_hasta: number | null }
): boolean {
  const aHasta = a.cantidad_hasta ?? Infinity;
  const bHasta = b.cantidad_hasta ?? Infinity;
  return a.cantidad_desde <= bHasta && b.cantidad_desde <= aHasta;
}

// Traslape dentro del mismo lote que se está guardando (misma
// tamano_id/pelaje_id): agrupado así porque el traslape solo importa
// dentro de la misma combinación — dos tramos de tamaños distintos nunca
// compiten entre sí. Un traslape contra un tramo VIEJO que no se está
// tocando en este guardado lo atrapa la restricción de la base (EXCLUDE),
// que se traduce más abajo si llega a pasar.
function validarTraslapes(filas: FilaTarifaGuardar[]): string | null {
  const porGrupo = new Map<string, FilaTarifaGuardar[]>();
  for (const f of filas) {
    const key = `${f.tamano_id ?? ""}|${f.pelaje_id ?? ""}`;
    const lista = porGrupo.get(key) ?? [];
    lista.push(f);
    porGrupo.set(key, lista);
  }
  for (const lista of porGrupo.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (seTraslapan(lista[i], lista[j])) {
          return `El tramo ${etiquetaTramo(lista[i])} se traslapa con el tramo ${etiquetaTramo(
            lista[j]
          )}. Ajusta los rangos antes de guardar.`;
        }
      }
    }
  }
  return null;
}

export async function guardarTarifas(
  servicioId: string,
  vigenciaDesde: string,
  filas: FilaTarifaGuardar[]
): Promise<EstadoGuardarTarifas> {
  if (!vigenciaDesde) return { error: "Elige la fecha de vigencia." };
  if (filas.length === 0) return { error: "No hay cambios que guardar." };

  const errorTraslape = validarTraslapes(filas);
  if (errorTraslape) return { error: errorTraslape };

  const supabase = await createSupabaseServerClient();
  const filasInsert = filas.map((f) => ({
    servicio_id: servicioId,
    tamano_id: f.tamano_id,
    pelaje_id: f.pelaje_id,
    cantidad_desde: f.cantidad_desde,
    cantidad_hasta: f.cantidad_hasta,
    vigencia_desde: vigenciaDesde,
    precio: f.no_aplica ? null : f.precio,
    no_aplica: f.no_aplica,
  }));

  const { error } = await supabase.from("tarifas").insert(filasInsert);

  if (error) {
    if (error.code === "23P01") {
      return {
        error:
          "Dos de los tramos que capturaste se traslapan en cantidad para el mismo tamaño/pelaje. Revisa los rangos e intenta de nuevo.",
      };
    }
    return { error: "No pudimos guardar las tarifas. Intenta de nuevo." };
  }

  revalidatePath(`/servicios/${servicioId}/tarifas`);
  return { error: null, ok: true };
}
