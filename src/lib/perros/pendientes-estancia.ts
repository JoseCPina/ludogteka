import type { SupabaseClient } from "@supabase/supabase-js";

// Qué le falta a cada perro para guardería u hotel. Sale entero de
// pendientes_para_estancia() en la base, que usa las mismas reglas que el
// trigger de estancias y la vista de contratos: aquí no se decide nada,
// solo se agrupa por perro.
export type PendienteEstancia = {
  clave: string;
  etiqueta: string;
  grupo: "bloquea" | "condicion" | "expediente" | "contrato";
  bloquea: boolean;
  tipoContratoId: string | null;
  contratoPendienteId: string | null;
};

export async function cargarPendientesEstancia(
  supabase: SupabaseClient,
  perroIds: string[]
): Promise<Map<string, PendienteEstancia[]>> {
  const porPerro = new Map<string, PendienteEstancia[]>();
  if (perroIds.length === 0) return porPerro;
  const { data } = await supabase.rpc("pendientes_para_estancia", { p_perro_ids: perroIds });
  for (const fila of (data ?? []) as {
    perro_id: string;
    clave: string;
    etiqueta: string;
    grupo: PendienteEstancia["grupo"];
    bloquea: boolean;
    tipo_contrato_id: string | null;
    contrato_pendiente_id: string | null;
  }[]) {
    const lista = porPerro.get(fila.perro_id) ?? [];
    lista.push({
      clave: fila.clave,
      etiqueta: fila.etiqueta,
      grupo: fila.grupo,
      bloquea: fila.bloquea,
      tipoContratoId: fila.tipo_contrato_id,
      contratoPendienteId: fila.contrato_pendiente_id,
    });
    porPerro.set(fila.perro_id, lista);
  }
  return porPerro;
}

// Los campos que se capturan en el formulario de "capturar ahora": la
// talla (que bloquea) y los datos del expediente. Lo demás (vacunas,
// evaluación, contrato) tiene su propia sección en el expediente.
export function camposPorCapturar(pendientes: PendienteEstancia[]): string[] {
  return pendientes
    .filter((p) => p.clave === "talla" || p.clave.startsWith("campo:"))
    .map((p) => (p.clave === "talla" ? "tamano_id" : p.clave.slice("campo:".length)));
}
