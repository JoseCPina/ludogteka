// Conteos de /plataforma y borrado de un negocio de prueba (desarrollo).
//
//   node scripts/auditoria/plataforma-negocios-dev.mjs
//
// 1. Conteos: el demo (plan 'demo') y los suspendidos no suman en «En prueba»
//    (helpers de src/lib/plataforma/metricas.ts, contra los datos reales de
//    plataforma_negocios()).
// 2. Borrado por la función de la plataforma:
//    · guardas: demo, Ludogteka, un negocio activo con plan, uno con cobros
//      reales, nombre mal escrito, anónimo y un admin de negocio → rechazados;
//    · un negocio de prueba con datos, archivos en Storage, credenciales en
//      Vault, clientes y perros se borra completo POR EL SCRIPT (Storage,
//      Vault, base, Auth), uno suspendido por la función con sesión de
//      plataforma, y la bitácora queda;
//    · nada de los demás negocios cambia (conteo de filas por tabla) y
//      auditoria_frontera() sale vacía.
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, sesion, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const ok = (c, si, no) => (c ? bien(si) : hallazgo(no));
const LUDO = "10000000-0000-4000-8000-000000000001";
const sufijo = String(Date.now()).slice(-6);

const personas = [];
async function persona(etiqueta) {
  const { data, error } = await A.auth.admin.createUser({ email: `aud-neg-${etiqueta}-${sufijo}@auditoria.invalid`, email_confirm: true, password: `Aud-${sufijo}-x!` });
  if (error) throw error;
  personas.push(data.user.id);
  return data.user.id;
}
async function negocio(etiqueta, i) {
  const p = await persona(etiqueta);
  const tel = `55${sufijo}${i}0`.slice(0, 10);
  const { data, error } = await A.rpc("registrar_negocio_prueba", { p_nombre: `Aud Borrar ${etiqueta} ${sufijo}`, p_ciudad: "Ciudad de México", p_telefono: tel, p_ip: `10.9.${i}.${sufijo.slice(-2)}`, p_persona_id: p, p_modelo: LUDO, p_dias: 15 });
  if (error) throw new Error(`registrar_negocio_prueba: ${error.message}`);
  const f = Array.isArray(data) ? data[0] : data;
  return { id: f.negocio_id, slug: f.slug, nombre: `Aud Borrar ${etiqueta} ${sufijo}`, persona: p, telefono: tel };
}

// Conteo de filas por tabla con negocio_id, sin el negocio dado.
const spec = await (await fetch(`${URL}/rest/v1/`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } })).json();
const TABLAS = Object.entries(spec.definitions).filter(([, d]) => d.properties?.negocio_id).map(([t]) => t);
const crudo = (ruta, extra = {}) => fetch(`${URL}/rest/v1/${ruta}`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "x-negocio-id": LUDO, ...extra } });
async function conteoOtros(excluir) {
  const r = {};
  for (const t of TABLAS) {
    const x = await crudo(`${t}?negocio_id=not.in.(${excluir.join(",")})&select=id`, { Prefer: "count=exact", Range: "0-0" });
    r[t] = Number((x.headers.get("content-range") ?? "").split("/")[1] ?? 0);
  }
  return r;
}
async function filasDe(id) {
  const out = {};
  for (const t of TABLAS) {
    const x = await crudo(`${t}?negocio_id=eq.${id}&select=id`, { Prefer: "count=exact", Range: "0-0" });
    const n = Number((x.headers.get("content-range") ?? "").split("/")[1] ?? 0);
    if (n) out[t] = n;
  }
  return out;
}

const creados = [];
const { data: admins } = await A.from("plataforma_admins").select("profile_id").limit(1);
const P = await sesion(admins[0].profile_id);
try {
  // ───────── 1. Conteos
  console.log("\n1. «En prueba» sin demo ni suspendidos");
  const { cuentaEnPruebas, cuentaEnTotales, esDemo } = await import("../../src/lib/plataforma/metricas.ts").catch(() => ({}));
  const A1 = await negocio("conteo", 1);
  creados.push(A1);
  const { data: lista } = await P.rpc("plataforma_negocios");
  ok(Array.isArray(lista) && lista.some((n) => n.id === A1.id), "plataforma_negocios devuelve el negocio de prueba", "plataforma_negocios no lo devuelve");
  const demo = lista.find((n) => n.plan === "demo");
  ok(demo, "hay un negocio demo (plan 'demo') en la lista, visible", "no hay demo en desarrollo");
  const reglaPrueba = (n) => n.plan === "prueba" && n.activo && n.plan !== "demo";
  const antes = lista.filter(reglaPrueba).length;
  await A.from("negocios").update({ activo: false }).eq("id", A1.id);
  const { data: lista2 } = await P.rpc("plataforma_negocios");
  ok(lista2.filter(reglaPrueba).length === antes - 1, "suspender un negocio en prueba lo saca de «En prueba»", "suspendido sigue contando en prueba");
  ok(!lista2.filter(reglaPrueba).some((n) => n.plan === "demo"), "el demo nunca cuenta en «En prueba»", "el demo cuenta en prueba");
  if (cuentaEnPruebas) {
    const veredicto = lista2.filter(cuentaEnPruebas).length === lista2.filter(reglaPrueba).length && !cuentaEnTotales({ plan: "demo" }) && esDemo({ plan: "demo" }) && !cuentaEnPruebas({ plan: "prueba", activo: false });
    ok(veredicto, "los helpers de metricas.ts dan lo mismo que la regla", "metricas.ts no coincide con la regla");
  } else console.log("  · (metricas.ts no se importa desde Node sin transpilar: la regla se cubre arriba y con tsc)");
  const { data: alm } = await A.rpc("plataforma_almacenamiento_reportes");
  ok(alm?.every((f) => typeof f.plan === "string"), "plataforma_almacenamiento_reportes trae el plan de cada negocio", "almacenamiento sin plan");
  const { data: maps } = await P.rpc("plataforma_maps_consumo", { p_mes: new Date().toISOString().slice(0, 10) });
  ok(maps?.every((f) => typeof f.plan === "string"), "plataforma_maps_consumo trae el plan", "maps sin plan");
  const { data: cobros } = await P.rpc("plataforma_cobros");
  ok(cobros?.every((f) => typeof f.plan === "string"), "plataforma_cobros trae el plan", "cobros sin plan");

  // ───────── 2. Borrado
  console.log("\n2. Guardas del borrado");
  const X = await negocio("completo", 2);
  const Y = await negocio("suspendido", 3);
  const Z = await negocio("cobros", 4);
  creados.push(X, Y, Z);
  const intentar = async (cli, id, nombre) => {
    const r = await cli.rpc("plataforma_eliminar_negocio", { p_negocio_id: id, p_confirmacion: nombre });
    return r.error ? r.error.message : null;
  };
  const { data: negDemo } = await A.from("negocios").select("id, nombre").eq("plan", "demo").limit(1).maybeSingle();
  ok(/demostración/.test((await intentar(A, negDemo.id, negDemo.nombre)) ?? ""), "el demo no se borra", "el demo se pudo borrar");
  ok(/exento|casa/.test((await intentar(A, LUDO, "Ludogteka")) ?? ""), "Ludogteka no se borra", "Ludogteka se pudo borrar");
  const { data: hue } = await A.from("negocios").select("id, nombre").eq("slug", "huellitas").maybeSingle();
  if (hue) ok(/en prueba o suspendido/.test((await intentar(A, hue.id, hue.nombre)) ?? ""), "un negocio activo con plan no se borra", "un negocio activo se pudo borrar");
  ok(/nombre del negocio/.test((await intentar(A, X.id, "otro nombre")) ?? ""), "con el nombre mal escrito no se borra", "borró con confirmación errónea");
  // Cobros reales: un pago de suscripción pagado.
  const pago = await A.from("pagos_suscripcion").insert({ negocio_id: Z.id, stripe_invoice_id: `in_aud_${sufijo}`, estado: "pagado", monto_centavos: 10000, modo: "test", pagado_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (pago.error) console.log("  · no pude insertar el pago de prueba:", pago.error.message);
  ok(/cobros reales/.test((await intentar(A, Z.id, Z.nombre)) ?? ""), "con un pago de suscripción pagado no se borra", "borró un negocio con cobros reales");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  ok(Boolean(await intentar(anon, X.id, X.nombre)), "la llave anónima no puede", "anónimo pudo borrar");
  const comoAdminDeNegocio = await sesion(X.persona);
  ok(/Solo la administración|permission denied/.test((await intentar(comoAdminDeNegocio, X.id, X.nombre)) ?? ""), "una persona de negocio (no plataforma) no puede", "una cuenta de negocio pudo borrar");
  ok(Boolean((await comoAdminDeNegocio.rpc("plataforma_negocio_a_borrar", { p_negocio_id: X.id })).error), "tampoco ve el manifiesto", "una cuenta de negocio vio el manifiesto");

  console.log("\n3. Un negocio de prueba con datos se borra completo (por el script)");
  // Datos, archivos y credenciales en X.
  const cli = await A.from("clientes").insert({ negocio_id: X.id, nombre: "Cliente de prueba", telefono: `PRUEBA-${sufijo}`, updated_at: new Date().toISOString() }).select("id").single();
  ok(!cli.error, "cliente de prueba creado", `no se creó el cliente: ${cli.error?.message}`);
  if (cli.data) await A.from("perros").insert({ negocio_id: X.id, cliente_id: cli.data.id, nombre: "Firulais", updated_at: new Date().toISOString() });
  const subir = async (bucket, ruta) => (await A.storage.from(bucket).upload(ruta, Buffer.from("archivo de prueba"), { contentType: "text/plain", upsert: true })).error;
  ok(!(await subir("gastos-comprobantes", `${X.id}/gastos/aud.txt`)), "archivo en gastos-comprobantes", "no subió a gastos-comprobantes");
  ok(!(await subir("negocios-publico", `${X.id}/logo-aud.txt`)), "archivo en negocios-publico", "no subió a negocios-publico");
  if (cli.data) ok(!(await subir("perros-archivos", `${cli.data.id}/perro/aud.txt`)), "archivo en perros-archivos ({cliente}/…)", "no subió a perros-archivos");
  const conNegocio = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": X.id } } });
  const sec = await conNegocio.rpc("integracion_guardar_secreto", { p_proveedor: "mercadopago", p_secreto: `{"access_token":"APP-AUD-${sufijo}"}` });
  ok(!sec.error, "credencial de Mercado Pago guardada en Vault", `no se guardó la credencial: ${sec.error?.message}`);
  const { data: filasX } = await A.from("integraciones_cobro").select("secreto_id").eq("negocio_id", X.id).maybeSingle();
  const secretoId = filasX?.secreto_id;
  const fx = await filasDe(X.id);
  ok(Object.keys(fx).length >= 8, `X tiene filas en ${Object.keys(fx).length} tablas antes de borrar`, "X casi no tiene datos");
  const otrosAntes = await conteoOtros([X.id]);

  // Revisión sin --aplicar: no borra.
  const revisar = spawnSync(process.execPath, ["scripts/plataforma/eliminar-negocio.mjs", X.slug, "--telefono", X.telefono], { encoding: "utf8" });
  ok(revisar.status === 0 && /no se borró nada/.test(revisar.stdout), "el script sin --aplicar solo revisa", `la revisión falló: ${revisar.stdout}${revisar.stderr}`);
  ok(Object.keys(await filasDe(X.id)).length === Object.keys(fx).length, "…y no tocó nada", "la revisión borró algo");
  // Teléfono equivocado: se niega.
  const mal = spawnSync(process.execPath, ["scripts/plataforma/eliminar-negocio.mjs", X.slug, "--telefono", "5500000000", "--aplicar"], { encoding: "utf8" });
  ok(mal.status !== 0 && /no es el esperado/.test(mal.stderr), "con otro teléfono se niega (guarda de identidad)", "borró con el teléfono equivocado");
  ok(Object.keys(await filasDe(X.id)).length === Object.keys(fx).length, "…y no tocó nada", "con teléfono equivocado borró");
  // Slug repetido o inexistente.
  const nada = spawnSync(process.execPath, ["scripts/plataforma/eliminar-negocio.mjs", `no-existe-${sufijo}`, "--telefono", X.telefono, "--aplicar"], { encoding: "utf8" });
  ok(nada.status !== 0, "un slug que no existe se niega", "borró un slug inexistente");

  const borrar = spawnSync(process.execPath, ["scripts/plataforma/eliminar-negocio.mjs", X.slug, "--telefono", X.telefono, "--aplicar"], { encoding: "utf8" });
  console.log(borrar.stdout.split("\n").map((l) => `    ${l}`).join("\n"));
  ok(borrar.status === 0, "el script terminó bien", `el script falló: ${borrar.stderr}`);
  ok(Object.keys(await filasDe(X.id)).length === 0, "ninguna tabla conserva filas de X", "quedaron filas de X");
  ok(!(await A.from("negocios").select("id").eq("id", X.id).maybeSingle()).data, "el negocio ya no existe", "el negocio sigue");
  const restante = await A.storage.from("gastos-comprobantes").list(`${X.id}/gastos`);
  ok((restante.data ?? []).length === 0, "Storage: su carpeta quedó vacía", "quedaron archivos en gastos-comprobantes");
  const publico = await A.storage.from("negocios-publico").list(X.id);
  ok((publico.data ?? []).length === 0, "Storage: negocios-publico vacío", "quedaron archivos en negocios-publico");
  if (cli.data) ok(((await A.storage.from("perros-archivos").list(`${cli.data.id}/perro`)).data ?? []).length === 0, "Storage: perros-archivos vacío", "quedaron archivos en perros-archivos");
  if (secretoId) {
    const r = spawnSync(process.execPath, ["scripts/.dev-sql.mjs", `select count(*) n from vault.secrets where id='${secretoId}'`], { encoding: "utf8" });
    ok(/"n": "?0"?/.test(r.stdout), "Vault: la credencial se desvinculó", `la credencial sigue en Vault: ${r.stdout}`);
  }
  const { data: auth } = await A.auth.admin.getUserById(X.persona);
  ok(!auth?.user, "su cuenta de Auth (sin otro negocio) se borró", "la cuenta de Auth sigue");
  const { data: ev } = await P.from("plataforma_eventos").select("accion, negocio_id, detalle").eq("accion", "eliminar_negocio").order("created_at", { ascending: false }).limit(1);
  ok(ev?.[0]?.detalle?.slug === X.slug && ev[0].negocio_id === null, "plataforma_eventos guardó el borrado (slug, filas, teléfonos)", "no hay evento del borrado");
  const otrosDespues = await conteoOtros([X.id]);
  const cambios = Object.keys(otrosAntes).filter((t) => otrosAntes[t] !== otrosDespues[t] && !["plataforma_eventos", "registros_prueba"].includes(t));
  ok(cambios.length === 0, "los conteos de todos los demás negocios no cambiaron", `cambiaron los conteos de: ${cambios.join(", ")}`);
  const { data: frontera } = await A.rpc("auditoria_frontera");
  ok((frontera ?? []).length === 0, "auditoria_frontera() vacía", `auditoria_frontera: ${JSON.stringify(frontera)}`);

  console.log("\n4. Un negocio suspendido, por la función con sesión de plataforma");
  await A.from("negocios").update({ activo: false }).eq("id", Y.id);
  const { data: lm } = await P.rpc("plataforma_negocio_a_borrar", { p_negocio_id: Y.id });
  ok(lm?.negocio?.slug === Y.slug, "la plataforma ve el manifiesto", "la plataforma no ve el manifiesto");
  const mal2 = await intentar(P, Y.id, "no es");
  ok(/nombre del negocio/.test(mal2 ?? ""), "pide el nombre exacto", "no pidió el nombre");
  const bien2 = await P.rpc("plataforma_eliminar_negocio", { p_negocio_id: Y.id, p_confirmacion: Y.nombre });
  ok(!bien2.error && bien2.data?.negocio?.slug === Y.slug, "la plataforma borra el suspendido", `no borró: ${bien2.error?.message}`);
  ok(!(await A.from("negocios").select("id").eq("id", Y.id).maybeSingle()).data, "…y ya no existe", "el suspendido sigue");
  const { data: ev2 } = await P.from("plataforma_eventos").select("accion, detalle").eq("accion", "eliminar_negocio").order("created_at", { ascending: false }).limit(1);
  ok(ev2?.[0]?.detalle?.via === "sesion", "el evento dice que fue con sesión de plataforma", "el evento no dice la vía");
  void tokenDe;
} finally {
  for (const n of creados) {
    await A.from("pagos_suscripcion").delete().eq("negocio_id", n.id);
    await A.rpc("plataforma_eliminar_negocio", { p_negocio_id: n.id, p_confirmacion: n.nombre });
  }
  for (const p of personas) await A.auth.admin.deleteUser(p);
}
console.log(hallazgos.length ? `\n${hallazgos.length} hallazgo(s).` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
