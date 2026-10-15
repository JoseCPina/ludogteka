// /caja/turno con volumen (SOLO DESARROLLO). Negocio DESECHABLE (nunca Huellitas ni Ludogteka).
//
//   node scripts/auditoria/caja-turno-volumen-dev.mjs sembrar [archivo]   crea el negocio, abre un turno y lo llena con 1,049 cobros
//   node scripts/auditoria/caja-turno-volumen-dev.mjs medir [archivo]     tiempos de la base y de la pantalla (390 y 1280 px; necesita `next start` en el 3001)
//   node scripts/auditoria/caja-turno-volumen-dev.mjs borrar [archivo]    borra el negocio desechable completo
//
// Sirve para medir antes y después de tocar movimientos_turno / resumen_turno / la pantalla. Mide la pantalla con
// la sesión de la admin del negocio desechable; la meta es < 1.5 s hasta ver «Movimientos de este turno» con más de 1,000 cobros.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const REF = "sgfolltpvktbsiisfuzq";
const [modo, archivoArg] = process.argv.slice(2);
const ARCHIVO = archivoArg ?? `${process.env.TEMP ?? "."}/caja-turno-volumen.json`;
const N_COBROS = 1049;
const PRECIO = 10;
const LUDO = "10000000-0000-4000-8000-000000000001"; // solo es el MODELO de configuración
async function enParalelo(tareas, maximo = 10) {
  const r = new Array(tareas.length);
  let s = 0;
  await Promise.all(Array.from({ length: maximo }, async () => { for (;;) { const i = s++; if (i >= tareas.length) return; r[i] = await tareas[i](); } }));
  return r;
}

if (modo === "sembrar") {
  const sufijo = String(Date.now()).slice(-7);
  const MARCA = `CTV${sufijo}`;
  const personas = [];
  const persona = async (etiqueta) => {
    const { data, error } = await A.auth.admin.createUser({ email: `aud-ctv-${etiqueta}-${sufijo}@auditoria.invalid`, email_confirm: true, password: claveAleatoria(), user_metadata: { nombre_completo: `${etiqueta} ${MARCA}` } });
    if (error) throw new Error(`crear ${etiqueta}: ${error.message}`);
    personas.push(data.user.id);
    return data.user.id;
  };
  const idAdmin = await persona("admin");
  const idRecep = await persona("recepcion");
  const telefono = `55${sufijo.slice(-6)}09`;
  const ip = `10.78.${Number(sufijo.slice(-6, -3)) % 250}.${Number(sufijo.slice(-3)) % 250}`;
  const nombre = `Aud CajaTurno ${sufijo}`;
  const { data, error } = await A.rpc("registrar_negocio_prueba", { p_nombre: nombre, p_ciudad: "Ciudad de México", p_telefono: telefono, p_ip: ip, p_persona_id: idAdmin, p_modelo: LUDO, p_dias: 15 });
  if (error) throw new Error(`registrar_negocio_prueba: ${error.message}`);
  const f = Array.isArray(data) ? data[0] : data;
  const estado = { id: f.negocio_id, slug: f.slug, nombre, telefono, idAdmin, idRecep, personas, marca: MARCA };
  writeFileSync(ARCHIVO, JSON.stringify(estado)); // antes de seguir: si algo falla, se puede borrar
  const H = estado.id;
  const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
  const rol = await SB.rpc("asignar_rol_staff", { p_user_id: idRecep, p_rol: "recepcion", p_nombre_completo: `Recepción ${MARCA}` });
  if (rol.error) throw new Error(`asignar_rol_staff: ${rol.error.message}`);
  const recJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(idRecep)}`, "x-negocio-id": H } } });
  const ab = await recJ.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: MARCA, abierto_por: idRecep, estado: "abierto" });
  if (ab.error) throw new Error(`abrir turno: ${ab.error.message}`);
  const filasClientes = Array.from({ length: 200 }, (_, i) => ({ nombre: `${MARCA} cliente ${String(i + 1).padStart(3, "0")}`, telefono: `55${String(i).padStart(4, "0")}${sufijo.slice(-4)}` }));
  const cl = await SB.from("clientes").insert(filasClientes).select("id");
  if (cl.error) throw new Error(`clientes: ${cl.error.message}`);
  const ids = cl.data.map((c) => c.id);
  const reservas = await enParalelo(Array.from({ length: N_COBROS }, (_, i) => async () => {
    const r = await recJ.rpc("crear_venta_mostrador", { p_cliente_id: ids[i % ids.length], p_lineas: [{ concepto: `${MARCA} venta ${i}`, precio: PRECIO, cantidad: 1 }], p_notas: MARCA });
    if (r.error) throw new Error(`crear_venta_mostrador: ${r.error.message}`);
    return r.data;
  }));
  await enParalelo(reservas.map((reserva, i) => async () => {
    const r = await recJ.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: MARCA, p_metodos: [{ metodo: i % 4 === 0 ? "transferencia" : "efectivo", monto: PRECIO }] });
    if (r.error) throw new Error(`registrar_cobro: ${r.error.message}`);
  }));
  console.log(`✔ negocio «${nombre}» (${estado.slug}) con ${N_COBROS} cobros en su turno. Estado en ${ARCHIVO}`);
} else if (modo === "medir") {
  const e = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  const H = e.id;
  const adminJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(e.idAdmin)}`, "x-negocio-id": H } } });
  const turno = (await adminJ.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;
  const t = async (f) => { const a = performance.now(); const r = await f(); return [Math.round(performance.now() - a), r]; };
  console.log("── Base (sesión de admin, 3 corridas)");
  for (let i = 0; i < 3; i++) {
    const [ms1, r1] = await t(() => adminJ.rpc("movimientos_turno", { p_turno_id: turno.id }));
    const [ms2, r2] = await t(() => adminJ.rpc("resumen_turno", { p_turno_id: turno.id }));
    const [ms3] = await t(() => adminJ.rpc("movimientos_turno_pagina", { p_turno_id: turno.id, p_limite: 50, p_desplazamiento: 0 }).then((r) => r, () => null));
    console.log(`  movimientos_turno ${ms1} ms (${(r1.data ?? []).length} filas, tope 1,000) · resumen_turno ${ms2} ms (${(r2.data ?? []).length} filas) · movimientos_turno_pagina(50) ${ms3} ms`);
  }
  console.log("── Pantalla /caja/turno");
  const { abrirNavegador } = await import("../lib/navegador.mjs");
  const { data: u } = await A.auth.admin.getUserById(e.idAdmin);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombreCookie = `sb-${REF}-auth-token`;
  const cookies = (trozos.length === 1 ? [[nombreCookie, valor]] : trozos.map((x, i) => [`${nombreCookie}.${i}`, x])).map(([name, value]) => ({ name, value, domain: `${e.slug}.localhost`, path: "/" }));
  const navegador = await abrirNavegador();
  try {
    for (const [ancho, alto] of [[390, 844], [1280, 900]]) {
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto } });
      await ctx.addCookies(cookies);
      const pag = await ctx.newPage();
      pag.setDefaultTimeout(120_000);
      const base = `http://${e.slug}.localhost:3001`;
      await pag.goto(`${base}/caja`, { waitUntil: "load" }); // calienta compilación y sesión
      const tiempos = [];
      for (let i = 0; i < 3; i++) {
        const a = Date.now();
        await pag.goto(`${base}/caja/turno`, { waitUntil: "commit" });
        await pag.getByText("Movimientos de este turno").first().waitFor();
        await pag.waitForLoadState("load");
        tiempos.push(Date.now() - a);
      }
      const filas = await pag.locator("tbody tr").count();
      console.log(`  ${ancho} px: ${tiempos.map((x) => `${x} ms`).join(", ")} (mediana ${[...tiempos].sort((x, y) => x - y)[1]} ms) · ${filas} filas en la tabla`);
      await ctx.close();
    }
  } finally {
    await navegador.close();
  }
} else if (modo === "borrar") {
  const e = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  const b = spawnSync(process.execPath, ["scripts/plataforma/eliminar-negocio.mjs", e.slug, "--telefono", e.telefono, "--aplicar"], { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  console.log(b.status === 0 ? `✔ «${e.slug}» borrado` : `✘ ${b.stderr || b.stdout}`);
  for (const id of e.personas) await A.auth.admin.deleteUser(id).catch(() => {});
} else {
  console.log("Uso: sembrar | medir | borrar [archivo]");
}
