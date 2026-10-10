// Lo común de las auditorías del módulo Veterinaria (SOLO DESARROLLO, en
// Huellitas; nunca Ludogteka): JWT reales de cada rol, llamadas a la API y
// el resumen final. Las usan modulos-dev, ficha-clinica-dev e
// inventario-lotes-dev.
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
export { A, URL, env };
export const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
export const B = datos.B;
export const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";

const hallazgos = [];
export const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
export const bien = (t) => console.log(`  ✔ ${t}`);
export const comprobar = (cond, titulo) => (cond ? bien(titulo) : hallazgo(titulo));
export const seccion = (t) => console.log(`── ${t}`);

/** Cliente con la llave de servidor acotado a un negocio (salta la RLS: solo para preparar y verificar). */
export const servicioEn = (negocio) =>
  createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocio } } });
export const SB = servicioEn(B);

export const cab = (token, negocio = B) => ({
  apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  "x-negocio-id": negocio,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});
export const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : ""), codigo: cuerpo?.code ?? null, pista: cuerpo?.hint ?? null };
};
export const rpc = (token, fn, args = {}, negocio = B) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });
export const get = (token, ruta, negocio = B) => llamar(`${URL}/rest/v1/${ruta}`, { headers: cab(token, negocio) });
export const post = (token, tabla, cuerpo, negocio = B) => llamar(`${URL}/rest/v1/${tabla}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(cuerpo) });
export const patch = (token, ruta, cuerpo, negocio = B) => llamar(`${URL}/rest/v1/${ruta}`, { method: "PATCH", headers: cab(token, negocio), body: JSON.stringify(cuerpo) });
export const borrar = (token, ruta, negocio = B) => llamar(`${URL}/rest/v1/${ruta}`, { method: "DELETE", headers: cab(token, negocio) });

/** Las personas de Huellitas: admin, dos recepcionistas (una con permisos y otra sin), estética, un cliente y la llave anónima. */
export async function personas() {
  const { data: recepciones } = await SB.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
  if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
  const recCon = recepciones[0].profile_id;
  const recSin = recepciones[1].profile_id;
  return {
    adminId: datos.adminB, recConId: recCon, recSinId: recSin,
    admin: await tokenDe(datos.adminB),
    recCon: await tokenDe(recCon),
    recSin: await tokenDe(recSin),
    estetica: await tokenDe(datos.esteticaB),
    cliente: await tokenDe(datos.cuentaSoloB),
    anon: null,
  };
}

export const dar = (admin, profile, permiso) => rpc(admin, "otorgar_permiso", { p_profile_id: profile, p_permiso: permiso });
export const quitar = (admin, profile, permiso) => rpc(admin, "revocar_permiso", { p_profile_id: profile, p_permiso: permiso });

/** Prende o apaga un módulo con la llave de servidor (preparar/restaurar), sin pasar por el permiso ni la confirmación. */
export async function fijarModulo(modulo, activo) {
  const r = await SB.from("negocio_modulos").select("id").eq("negocio_id", B).eq("modulo", modulo).is("deleted_at", null).maybeSingle();
  if (r.data) await SB.from("negocio_modulos").update({ activo }).eq("id", r.data.id);
  else await SB.from("negocio_modulos").insert({ negocio_id: B, modulo, activo });
}

export function terminar() {
  console.log("");
  if (hallazgos.length) {
    console.log(`✘ ${hallazgos.length} hallazgo(s):`);
    for (const h of hallazgos) console.log(`   - ${h}`);
    process.exit(1);
  }
  console.log("✔ Sin hallazgos.");
}

/** Área y unidades para armar productos clínicos de prueba. */
export async function materialClinico() {
  const { data: area } = await SB.from("areas_inventario").select("id").eq("negocio_id", B).eq("clave", "botiquin").single();
  const { data: unidades } = await SB.from("unidades_medida").select("id, clave");
  const u = (c) => unidades.find((x) => x.clave === c).id;
  return { area: area.id, pieza: u("pieza"), ml: u("ml"), litro: u("l") };
}

/** Un producto clínico de prueba hecho por la vía de siempre (RPC con el JWT del admin). */
export async function productoClinico(admin, nombre, extra = {}) {
  const m = await materialClinico();
  const r = await rpc(admin, "guardar_producto_clinico", {
    p_id: null, p_nombre: nombre, p_area_id: m.area, p_unidad_compra_id: m.litro, p_unidad_consumo_id: m.ml, p_stock_minimo: 0,
    p_dias_aviso_caducidad: 30, p_principio_activo_id: null, p_grupo_senasica: null, p_clasificacion_lgs: null,
    p_es_antimicrobiano: false, p_clasificacion_por_confirmar: false, ...extra,
  });
  if (!r.ok) throw new Error(`producto clínico «${nombre}»: ${r.mensaje}`);
  return r.cuerpo;
}

export const hoy = async (admin) => (await rpc(admin, "fecha_negocio")).cuerpo;
export const sumaDias = (fecha, dias) => new Date(new Date(`${fecha}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
