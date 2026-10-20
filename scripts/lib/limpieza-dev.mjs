// Ninguna auditoría deja negocios, cuentas ni bitácoras en DESARROLLO (20 de octubre de 2026).
//
// Uso, al arrancar la auditoría (antes de crear nada):
//
//   import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
//   limpiarAlTerminar({ prefijos: ["bot-prueba-"], bitacoras: ["wa_mensajes", "wa_hilos"] });
//
// Al terminar —bien, con error, con process.exit(), con una excepción sin atrapar o con
// Ctrl+C— borra lo que ESTA corrida creó:
//   · los negocios cuyo slug empieza con uno de `prefijos` y se crearon después de arrancar
//     (nunca uno de CONSERVAR), en cascada y con sus archivos de Storage;
//   · las cuentas de Auth creadas después de arrancar que se quedaron sin ningún negocio
//     (nunca la administración de la plataforma ni una cuenta @peludesk.mx);
//   · las filas de `bitacoras` (tablas de la plataforma o de un negocio) creadas después de arrancar.
//
// Borra por la API de gestión de desarrollo (SUPABASE_ACCESS_TOKEN, como migrar-dev.mjs). Sin
// ese token intenta plataforma_eliminar_negocio con la llave de servidor y, si una guarda de la
// base lo impide, dice qué quedó y que se corra `node scripts/db/limpiar-dev.mjs --aplicar`.
// Solo actúa si .env.local apunta a desarrollo.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { CONSERVAR, sqlBorrarNegocios } from "../db/negocios-dev.mjs";

const DEV = "sgfolltpvktbsiisfuzq";
let registrado = null;

function entorno() {
  try {
    return Object.fromEntries(
      fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
    );
  } catch {
    return {};
  }
}

/** Borra lo que creó esta corrida. Devuelve un resumen; nunca lanza. */
export async function limpiarCorrida({ desde, prefijos = [], bitacoras = [], log = (t) => console.log(t) }) {
  const env = entorno();
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(DEV) || !env.SUPABASE_SECRET_KEY) return { omitido: "no es desarrollo" };
  const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const desdeIso = new Date(desde.getTime() - 5000).toISOString();
  const resumen = { negocios: 0, cuentas: 0, filas: 0, quedaron: [] };
  try {
    // 1. Negocios de esta corrida (sucursales primero: apuntan a su principal).
    let negocios = [];
    if (prefijos.length) {
      const { data } = await A.from("negocios").select("id, slug, nombre, principal_id").gte("created_at", desdeIso).limit(1000);
      negocios = (data ?? [])
        .filter((n) => prefijos.some((p) => n.slug.startsWith(p)) && !CONSERVAR.includes(n.slug))
        .sort((a, b) => Number(!a.principal_id) - Number(!b.principal_id));
    }
    if (negocios.length) {
      const ids = negocios.map((n) => n.id);
      // Archivos de Storage: {negocio}/… y, en perros-archivos, {cliente}/….
      const { data: clientes } = await A.from("clientes").select("id").in("negocio_id", ids).limit(5000);
      const raices = [...ids, ...(clientes ?? []).map((c) => c.id)];
      for (const bucket of ["reportes-archivos", "gastos-comprobantes", "soporte-capturas", "negocios-publico", "perros-archivos", "veterinaria-archivos", "cfdi-archivos", "dictados-audio"]) {
        for (const raiz of raices) {
          const nombres = await listarTodo(A, bucket, raiz);
          for (let i = 0; i < nombres.length; i += 100) await A.storage.from(bucket).remove(nombres.slice(i, i + 100));
        }
      }
      if (process.env.SUPABASE_ACCESS_TOKEN) {
        const { clienteApi } = await import("../nube/migraciones-api.mjs");
        const cli = await clienteApi(DEV);
        for (let i = 0; i < ids.length; i += 20) await cli.sql(sqlBorrarNegocios(ids.slice(i, i + 20)), 300000);
        resumen.negocios = ids.length;
      } else {
        for (const n of negocios) {
          const { error } = await A.rpc("plataforma_eliminar_negocio", { p_negocio_id: n.id, p_confirmacion: n.nombre });
          if (error) resumen.quedaron.push(`${n.slug} (${error.message.slice(0, 80)})`); else resumen.negocios++;
        }
      }
    }
    // 2. Bitácoras que esta corrida escribió.
    for (const t of bitacoras) {
      const { count } = await A.from(t).delete({ count: "exact" }).gte("created_at", desdeIso);
      resumen.filas += count ?? 0;
    }
    // 3. Cuentas nuevas que se quedaron sin ningún negocio.
    const { data: lista } = await A.auth.admin.listUsers({ perPage: 1000 });
    const nuevas = (lista?.users ?? []).filter((u) => u.created_at >= desdeIso && !(u.email ?? "").endsWith("@peludesk.mx"));
    if (nuevas.length) {
      const idsU = nuevas.map((u) => u.id);
      const { data: miembros } = await A.from("membresias").select("profile_id").in("profile_id", idsU).is("deleted_at", null);
      const { data: plat } = await A.from("plataforma_admins").select("profile_id").in("profile_id", idsU);
      const conAlgo = new Set([...(miembros ?? []), ...(plat ?? [])].map((r) => r.profile_id));
      for (const u of nuevas.filter((u) => !conAlgo.has(u.id))) {
        const { error } = await A.auth.admin.deleteUser(u.id);
        if (!error) resumen.cuentas++;
      }
    }
  } catch (e) {
    resumen.quedaron.push(`error: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
  }
  log(`  (limpieza de la corrida: ${resumen.negocios} negocios, ${resumen.cuentas} cuentas, ${resumen.filas} filas de bitácora${resumen.quedaron.length ? `; quedaron: ${resumen.quedaron.join(", ")} → node scripts/db/limpiar-dev.mjs --aplicar` : ""})`);
  return resumen;
}

async function listarTodo(A, bucket, prefijo) {
  const fuera = [];
  const { data } = await A.storage.from(bucket).list(prefijo, { limit: 1000 });
  for (const o of data ?? []) {
    const ruta = `${prefijo}/${o.name}`;
    if (o.id) fuera.push(ruta); else fuera.push(...(await listarTodo(A, bucket, ruta)));
  }
  return fuera;
}

/**
 * Registra la limpieza para cuando la auditoría termine, pase lo que pase. Una sola vez por
 * proceso (si se llama dos veces, junta los prefijos y las bitácoras).
 */
export function limpiarAlTerminar({ prefijos = [], bitacoras = [] } = {}) {
  if (registrado) {
    registrado.prefijos.push(...prefijos);
    registrado.bitacoras.push(...bitacoras);
    return;
  }
  registrado = { desde: new Date(), prefijos: [...prefijos], bitacoras: [...bitacoras], hecho: null };
  const salirReal = process.exit.bind(process);
  const limpiar = () => (registrado.hecho ??= limpiarCorrida(registrado));
  // process.exit() no espera nada asíncrono: se intercepta, se limpia y luego se sale.
  process.exit = (codigo) => {
    limpiar().finally(() => salirReal(codigo ?? process.exitCode ?? 0));
  };
  process.once("beforeExit", () => { limpiar(); });
  for (const senal of ["SIGINT", "SIGTERM"]) process.once(senal, () => { limpiar().finally(() => salirReal(130)); });
  process.once("uncaughtException", (e) => { console.error(e); limpiar().finally(() => salirReal(1)); });
  process.once("unhandledRejection", (e) => { console.error(e); limpiar().finally(() => salirReal(1)); });
}
