// QA S39 (N138): el registro como quedó después de guardar, para devolverlo en la respuesta de la acción. Lo usan las
// acciones del servidor que guardan con control de versión: `registros: await registrosFinales(supabase, control)`.
// Solo servidor (se llama con la sesión de quien guarda: la RLS decide qué ve).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ControlVersion, RegistroFinal } from "./tipos";

type Lectura =
  | { fila: string; por: "id" | "negocio_id" }
  // Lo clínico no se lee directo (su lectura va por funciones): solo su versión, de `version_registro_vet`.
  | { soloVersionVet: true }
  // Conjuntos que se guardan como filas nuevas: su versión es la más reciente de sus filas.
  | { conjunto: { tabla: string; col: string; fecha: "updated_at" | "created_at" }[] };

// Cada tipo de registro con control de versión (lo que la pantalla manda en `versiones[].t`).
const LECTURAS: Record<string, Lectura> = {
  estancias: { fila: "estancias", por: "id" },
  reservas: { fila: "reservas", por: "id" },
  citas_estetica: { fila: "citas_estetica", por: "id" },
  vet_citas: { soloVersionVet: true },
  vet_consultas: { soloVersionVet: true },
  cargos_aplicados: { fila: "cargos_aplicados", por: "id" },
  clientes: { fila: "clientes", por: "id" },
  perros: { fila: "perros", por: "id" },
  carnet_vacunas: { fila: "carnet_vacunas", por: "id" },
  servicios: { fila: "servicios", por: "id" },
  insumos: { fila: "insumos", por: "id" },
  empleados: { fila: "empleados", por: "id" },
  permisos_staff: { fila: "permisos_staff", por: "id" },
  negocio_perfil: { fila: "negocio_perfil", por: "id" },
  negocio_politicas: { fila: "negocio_politicas", por: "negocio_id" },
  veterinaria_ajustes: { fila: "veterinaria_ajustes", por: "negocio_id" },
  clientes_notas_internas: { conjunto: [{ tabla: "clientes_notas_internas", col: "cliente_id", fecha: "updated_at" }] },
  horario_semana: { conjunto: [{ tabla: "horario_semana", col: "negocio_id", fecha: "updated_at" }] },
  // Una fila por vigencia: la versión es la de la más reciente.
  cupo_configuracion: { conjunto: [{ tabla: "cupo_configuracion", col: "negocio_id", fecha: "updated_at" }] },
  horario_empleado: { conjunto: [{ tabla: "empleados_horario", col: "empleado_id", fecha: "updated_at" }] },
  esquemas_empleado: { conjunto: [{ tabla: "esquemas_pago", col: "empleado_id", fecha: "updated_at" }] },
  precios_servicio: {
    conjunto: [
      { tabla: "tarifas", col: "servicio_id", fecha: "created_at" },
      { tabla: "tarifas_dia_semana", col: "servicio_id", fecha: "created_at" },
    ],
  },
};

async function leer(supabase: SupabaseClient, t: string, i: string): Promise<RegistroFinal | null> {
  const l = LECTURAS[t];
  if (!l) return null;
  if ("soloVersionVet" in l) {
    const { data, error } = await supabase.rpc("version_registro_vet", { p_tabla: t, p_id: i });
    return error || !data ? null : { t, i, version: data as string, datos: null };
  }
  if ("fila" in l) {
    const { data } = await supabase.from(l.fila).select("*").eq(l.por, i).limit(1).maybeSingle();
    if (!data) return null;
    const datos = data as Record<string, unknown>;
    return { t, i, version: (datos.updated_at as string | null) ?? null, datos };
  }
  const fechas = await Promise.all(
    l.conjunto.map(async (c) => {
      const { data } = await supabase.from(c.tabla).select(c.fecha).eq(c.col, i).order(c.fecha, { ascending: false }).limit(1).maybeSingle();
      return ((data as Record<string, string> | null)?.[c.fecha] as string | undefined) ?? "";
    })
  );
  return { t, i, version: fechas.sort().at(-1) || "-infinity", datos: null };
}

/** Cómo quedó cada registro que la pantalla mandó en `control.versiones` (vacío sin control). */
export async function registrosFinales(supabase: SupabaseClient, control?: ControlVersion | null): Promise<RegistroFinal[]> {
  const vistos = new Set<string>();
  const pedidos = (control?.versiones ?? []).filter((v) => v?.t && v?.i && !vistos.has(`${v.t}:${v.i}`) && vistos.add(`${v.t}:${v.i}`));
  const leidos = await Promise.all(pedidos.map((v) => leer(supabase, v.t, v.i).catch(() => null)));
  return leidos.filter((r): r is RegistroFinal => r !== null);
}
