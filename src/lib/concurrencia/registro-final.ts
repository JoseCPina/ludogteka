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

/** Cómo quedó cada registro que la pantalla mandó en `control.versiones` (vacío sin control), más los de `otros`. */
export async function registrosFinales(supabase: SupabaseClient, control?: ControlVersion | null, otros: RegistroPedido[] = []): Promise<RegistroFinal[]> {
  const desdeControl = (control?.versiones ?? []).filter((v) => v?.t && v?.i).map((v) => ({ t: v.t, i: v.i }));
  return registrosDe(supabase, [...desdeControl, ...otros]);
}

/**
 * QA S41: lo que una acción cambió y que la pantalla tiene que pintar al recibir la respuesta. Toda acción del servidor
 * que cambia estado lo devuelve: `return { error: null, registros: await registrosDe(supabase, [{ t: "estancias", i: id }]) }`
 * (lo exige `scripts/auditoria/acciones-registro-final.mjs`). Un tipo de `LECTURAS` se lee como allí; cualquier otra
 * tabla se lee por `id` con la sesión de quien guarda (la RLS decide qué ve). Lo clínico no se lee directo: la acción
 * pasa en `datos` lo que ya sabe (`{ estado: "firmada" }`) y aquí solo se toma su versión. Un id vacío no se pide.
 */
export type RegistroPedido = { t: string; i: string | null | undefined; datos?: Record<string, unknown> };

export async function registrosDe(supabase: SupabaseClient, pedidos: RegistroPedido[]): Promise<RegistroFinal[]> {
  const vistos = new Map<string, RegistroPedido>();
  for (const p of pedidos) {
    if (!p?.t || !p.i) continue;
    const k = `${p.t}:${p.i}`;
    const previo = vistos.get(k);
    vistos.set(k, previo ? { ...previo, datos: { ...(previo.datos ?? {}), ...(p.datos ?? {}) } } : p);
  }
  // Los que se leen por id (una tabla cualquiera, o de LECTURAS por id) van juntos: una consulta por tabla y bloque.
  const porTabla = new Map<string, string[]>();
  for (const p of vistos.values()) {
    const l = LECTURAS[p.t];
    if (l && !("fila" in l && l.por === "id")) continue;
    const tabla = l && "fila" in l ? l.fila : p.t;
    porTabla.set(tabla, [...(porTabla.get(tabla) ?? []), p.i as string]);
  }
  const leidosPorId = new Map<string, Record<string, unknown>>();
  await Promise.all(
    [...porTabla.entries()].flatMap(([tabla, ids]) =>
      Array.from({ length: Math.ceil(ids.length / BLOQUE) }, (_, k) => ids.slice(k * BLOQUE, (k + 1) * BLOQUE)).map(async (bloque) => {
        const { data } = await supabase.from(tabla).select("*").in("id", bloque);
        for (const fila of (data ?? []) as Record<string, unknown>[]) leidosPorId.set(`${tabla}:${fila.id}`, fila);
      })
    )
  ).catch(() => null);

  const leidos = await Promise.all(
    [...vistos.values()].map(async (p) => {
      const l = LECTURAS[p.t];
      let r: RegistroFinal | null = null;
      if (l && !("fila" in l && l.por === "id")) {
        r = await leer(supabase, p.t, p.i as string).catch(() => null);
      } else {
        const fila = leidosPorId.get(`${l && "fila" in l ? l.fila : p.t}:${p.i}`);
        r = fila ? { t: p.t, i: p.i as string, version: (fila.updated_at as string | null) ?? (fila.created_at as string | null) ?? null, datos: fila } : null;
      }
      if (!p.datos) return r;
      // Lo que la acción ya sabe gana sobre lo leído (y basta si no se pudo leer: la versión es la de ahora).
      return { t: p.t, i: p.i as string, version: r?.version ?? new Date().toISOString(), datos: { ...(r?.datos ?? {}), ...p.datos } };
    })
  );
  return leidos.filter((r): r is RegistroFinal => r !== null);
}

// Cuántos ids por consulta (la URL tiene tope de largo; ver leerTodoPorIds).
const BLOQUE = 100;
