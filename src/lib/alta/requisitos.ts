import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Los requisitos sanitarios que el alta por link le pide al perro.
 *
 * Salen de la configuración del negocio (tipos_requisito_sanitario
 * obligatorios) y solo se piden cuando el negocio tiene guardería u hotel
 * prendidos y el link es de ese flujo: a quien viene dos horas a bañar a
 * su perro no se le revisa el carnet, y un negocio solo de estética no
 * tiene a qué pedirlos. Lo que el dueño sube queda PROPUESTO (lo confirma
 * recepción); mientras no haya una aplicación real, el perro sigue «sin
 * registro» y la base no le deja reservar guardería ni hotel.
 */
export type TipoRequisitoAlta = {
  id: string;
  clave: string;
  etiqueta: string;
  categoria: "vacuna" | "desparasitacion";
  vigencia_meses: number;
};

export type EstadoRequisitoAlta = "sin_registro" | "vencida" | "por_vencer" | "vigente";

/** El estado de UN requisito de UN perro, como se le enseña al dueño. */
export type RequisitoDePerro = TipoRequisitoAlta & {
  estado: EstadoRequisitoAlta;
  // Ya mandó un comprobante de esto y recepción no lo ha revisado.
  en_revision: boolean;
};

/** Lo que el dueño deja en el formulario para un requisito: fecha y archivo. */
export type ComprobanteCapturado = { fecha: string; archivo: File | null };

export const MODULOS_CON_REQUISITOS = ["guarderia", "hotel"] as const;

export function cubierto(r: { estado: EstadoRequisitoAlta; en_revision: boolean }): boolean {
  return r.estado === "vigente" || r.estado === "por_vencer" || r.en_revision;
}

/**
 * Los tipos obligatorios del negocio, o null si este flujo/negocio no los
 * pide. `admin` es el cliente con la secret key del negocio (la pantalla
 * del alta no tiene sesión); solo lee catálogo y configuración.
 */
export async function cargarRequisitosAlta(
  admin: SupabaseClient,
  negocioId: string,
  pideExpediente: boolean
): Promise<TipoRequisitoAlta[] | null> {
  if (!pideExpediente) return null;
  const { data: modulos } = await admin.rpc("modulos_activos");
  const activos = (modulos as string[] | null) ?? [];
  if (!MODULOS_CON_REQUISITOS.some((m) => activos.includes(m))) return null;
  const { data } = await admin
    .from("tipos_requisito_sanitario")
    .select("id, clave, etiqueta, categoria, vigencia_meses")
    .eq("negocio_id", negocioId)
    .eq("obligatoria", true)
    .is("deleted_at", null)
    .order("orden");
  return ((data ?? []) as TipoRequisitoAlta[]).length ? (data as TipoRequisitoAlta[]) : null;
}

/**
 * El estado de cada requisito para cada perro que ya existe (complemento
 * y pantalla final): lo que dice la vista de estado más las propuestas que
 * esperan revisión. Con la secret key, así que se filtra el negocio a mano.
 */
export async function estadoRequisitosDePerros(
  admin: SupabaseClient,
  negocioId: string,
  tipos: TipoRequisitoAlta[],
  perroIds: string[]
): Promise<Record<string, RequisitoDePerro[]>> {
  const salida: Record<string, RequisitoDePerro[]> = {};
  if (!perroIds.length || !tipos.length) return salida;
  const tipoIds = tipos.map((t) => t.id);
  const [{ data: estados }, { data: propuestas }] = await Promise.all([
    admin
      .from("perro_requisitos_sanitarios_estado")
      .select("perro_id, tipo_requisito_id, estado")
      .in("perro_id", perroIds)
      .in("tipo_requisito_id", tipoIds),
    admin
      .from("requisitos_sanitarios_propuestos")
      .select("perro_id, tipo_requisito_id")
      .eq("negocio_id", negocioId)
      .in("perro_id", perroIds)
      .eq("estado", "pendiente")
      .is("deleted_at", null),
  ]);
  for (const perroId of perroIds) {
    salida[perroId] = tipos.map((t) => {
      const fila = (estados ?? []).find((e) => e.perro_id === perroId && e.tipo_requisito_id === t.id);
      return {
        ...t,
        estado: ((fila?.estado as EstadoRequisitoAlta | undefined) ?? "sin_registro"),
        en_revision: (propuestas ?? []).some((p) => p.perro_id === perroId && p.tipo_requisito_id === t.id),
      };
    });
  }
  return salida;
}
