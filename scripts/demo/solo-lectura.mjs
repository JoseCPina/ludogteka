// Estado del solo lectura de las cuentas del visitante del demo («Ver demo»: CUENTAS_DEMO).
//
//   node scripts/demo/solo-lectura.mjs [--prod] [--cerrar]
//
// Sin --cerrar solo lee y sale con 1 si alguna cuenta de CUENTAS_DEMO tiene escritura.
// Con --cerrar las deja en solo lectura (un UPDATE de `membresias.solo_lectura`, nada más).
// Lo usan los sembradores y el corredor de tutoriales al terminar, aunque fallen
// (`cerrarCuentasDemo`), y se puede correr a mano. Producción: llave leída al vuelo del CLI.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { conectar } from "../tutoriales/lib/db.mjs";

const ARCHIVO = fileURLToPath(new URL("../../src/lib/demo/cuentas.ts", import.meta.url));

/** Los correos de CUENTAS_DEMO, leídos del mismo archivo que usa «Ver demo» (una sola fuente). */
export function correosDemo() {
  const txt = fs.readFileSync(ARCHIVO, "utf8");
  const bloque = txt.split("export const CUENTAS_DEMO")[1]?.split("} as const")[0] ?? "";
  return [...bloque.matchAll(/email:\s*"([^"]+)"/g)].map((m) => m[1]);
}

async function usuariosPorCorreo(cliente, correos) {
  const res = new Map();
  for (let pagina = 1; pagina <= 20 && res.size < correos.length; pagina++) {
    const { data, error } = await cliente.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) if (correos.includes(u.email)) res.set(u.email, u.id);
    if (data.users.length < 1000) break;
  }
  return res;
}

/** Estado (y, con `cerrar`, cierre) del solo lectura de las cuentas del visitante en el negocio demo. */
export async function cuentasDemo(cliente, { cerrar = false } = {}) {
  const { data: neg, error } = await cliente.from("negocios").select("id").eq("slug", "patitasyco").eq("plan", "demo").maybeSingle();
  if (error || !neg) throw new Error(`No encontré el negocio demo (patitasyco): ${error?.message ?? "sin fila"}`);
  const correos = correosDemo();
  const ids = await usuariosPorCorreo(cliente, correos);
  const filas = [];
  for (const correo of correos) {
    const id = ids.get(correo);
    if (!id) { filas.push({ correo, estado: "sin cuenta" }); continue; }
    if (cerrar) {
      const u = await cliente.from("membresias").update({ solo_lectura: true }).eq("negocio_id", neg.id).eq("profile_id", id).is("deleted_at", null);
      if (u.error) throw new Error(`cerrar ${correo}: ${u.error.message}`);
    }
    const { data: ms, error: e2 } = await cliente.from("membresias").select("solo_lectura").eq("negocio_id", neg.id).eq("profile_id", id).is("deleted_at", null);
    if (e2) throw new Error(`leer ${correo}: ${e2.message}`);
    const abierta = (ms ?? []).some((m) => m.solo_lectura === false);
    filas.push({ correo, estado: !ms?.length ? "sin membresía" : abierta ? "ABIERTA (escribe)" : "solo lectura" });
  }
  return { negocioId: neg.id, filas };
}

/** Cierra las cuentas del visitante; nunca lanza (se usa en `finally` y en los manejadores de error). */
export async function cerrarCuentasDemo(cliente) {
  try {
    const r = await cuentasDemo(cliente, { cerrar: true });
    const abiertas = r.filas.filter((f) => f.estado.startsWith("ABIERTA"));
    if (abiertas.length) console.warn(`  ⚠ No se pudieron cerrar: ${abiertas.map((f) => f.correo).join(", ")}`);
    return abiertas.length === 0;
  } catch (e) {
    console.warn(`  ⚠ No pude cerrar las cuentas del visitante: ${e.message}`);
    return false;
  }
}

if (process.argv[1]?.endsWith("solo-lectura.mjs")) {
  const prod = process.argv.includes("--prod");
  const cerrar = process.argv.includes("--cerrar");
  const c = conectar(prod);
  const r = await cuentasDemo(c.cliente, { cerrar });
  console.log(`${prod ? "PRODUCCIÓN" : "Desarrollo"} · negocio demo · cuentas del visitante${cerrar ? " (después de cerrar)" : ""}`);
  for (const f of r.filas) console.log(`  ${f.estado.startsWith("ABIERTA") ? "✘" : "✔"} ${f.correo.padEnd(40)} ${f.estado}`);
  process.exit(r.filas.some((f) => f.estado.startsWith("ABIERTA")) ? 1 : 0);
}

/**
 * Red de seguridad de un script que abre cuentas del visitante para escribir: si revienta
 * (error, Ctrl+C, proceso terminado), las deja en solo lectura antes de salir. Se llama
 * UNA vez, justo después de crear el cliente de servicio. El cierre normal del final
 * del script sigue igual; esto cubre cuando nunca llega.
 */
export function cerrarAlFallar(cliente) {
  let cerrando = false;
  const salir = async (texto, codigo) => {
    if (cerrando) return;
    cerrando = true;
    console.error(texto);
    await cerrarCuentasDemo(cliente);
    process.exit(codigo);
  };
  process.on("uncaughtException", (e) => salir(e?.stack ?? String(e), 1));
  process.on("unhandledRejection", (e) => salir(e?.stack ?? String(e), 1));
  for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => salir(`Interrumpido (${senal}): cierro las cuentas del visitante.`, 130));
}
