// Tarifas de un negocio de prueba recién creado (SOLO DESARROLLO).
// `crear_negocio` copia la configuración del modelo (servicios, grupos de raza…) pero NO sus precios, y las
// estancias de prueba piden precio ("Falta el precio de «Guardería (día completo)»"). Se copian las tarifas
// vivas del modelo (Ludogteka de desarrollo) a los servicios del negocio por su clave, y los grupos de raza
// por la suya. Idempotente: si el negocio ya tiene alguna tarifa viva no toca nada.
import { createClient } from "@supabase/supabase-js";
import { URL, env } from "../sesiones-dev.mjs";

const en = (negocio) =>
  createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocio } } });

export async function copiarTarifasBase(destinoId, origenId = "10000000-0000-4000-8000-000000000001") {
  if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
  const D = en(destinoId);
  const O = en(origenId);
  const { count } = await D.from("tarifas").select("id", { count: "exact", head: true }).eq("negocio_id", destinoId).is("deleted_at", null);
  if (count) return { copiadas: 0, motivo: "ya tenía tarifas" };

  const claves = async (cli, id, tabla) => {
    const { data, error } = await cli.from(tabla).select("id, clave").eq("negocio_id", id).is("deleted_at", null);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    return new Map(data.map((f) => [f.clave, f.id]));
  };
  const servOrigen = await claves(O, origenId, "servicios");
  const servDestino = await claves(D, destinoId, "servicios");
  const grupoOrigen = await claves(O, origenId, "grupos_raza");
  const grupoDestino = await claves(D, destinoId, "grupos_raza");
  const mapa = (origen, destino) => new Map([...origen].filter(([c]) => destino.has(c)).map(([c, id]) => [id, destino.get(c)]));
  const sMap = mapa(servOrigen, servDestino);
  const gMap = mapa(grupoOrigen, grupoDestino);

  const { data: filas, error } = await O.from("tarifas").select("*").eq("negocio_id", origenId).is("deleted_at", null);
  if (error) throw new Error(`tarifas: ${error.message}`);
  const nuevas = [];
  for (const f of filas) {
    const servicio_id = sMap.get(f.servicio_id);
    if (!servicio_id) continue;
    if (f.grupo_raza_id && !gMap.get(f.grupo_raza_id)) continue;
    const { id, created_at, updated_at, deleted_at, created_by, negocio_id, ...resto } = f; // eslint-disable-line no-unused-vars
    nuevas.push({ ...resto, servicio_id, grupo_raza_id: f.grupo_raza_id ? gMap.get(f.grupo_raza_id) : null, negocio_id: destinoId });
  }
  for (let i = 0; i < nuevas.length; i += 50) {
    const r = await D.from("tarifas").insert(nuevas.slice(i, i + 50));
    if (r.error) throw new Error(`copiar tarifas: ${r.error.message}`);
  }
  // Precio por día de la semana (p. ej. guardería en sábado), si el modelo lo tiene.
  let dias = 0;
  const { data: porDia } = await O.from("tarifas_dia_semana").select("*").eq("negocio_id", origenId).is("deleted_at", null);
  for (const f of porDia ?? []) {
    const servicio_id = sMap.get(f.servicio_id);
    if (!servicio_id) continue;
    const { id, created_at, updated_at, deleted_at, created_by, negocio_id, ...resto } = f; // eslint-disable-line no-unused-vars
    const r = await D.from("tarifas_dia_semana").insert({ ...resto, servicio_id, negocio_id: destinoId });
    if (!r.error) dias++;
  }
  return { copiadas: nuevas.length, porDia: dias };
}
