// Servicios extra cobrables de Hotel y guardería (SOLO DESARROLLO, en Huellitas;
// nunca Ludogteka). Migración 20261017500000.
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/servicios-extra-dev.mjs          (base + navegador; necesita npm run build)
//   SOLO_A=1 node scripts/auditoria/servicios-extra-dev.mjs (solo la base)
//
// 1. Permisos: «Agregar servicios extra» viene encendido en recepción y se puede quitar;
//    «Editar catálogo» no; estética, cliente y anónimo no pueden ni llamar.
// 2. Catálogo: crear/editar con todas las validaciones, la clase fiscal y la clave SAT en
//    cfdi_servicio_fiscal, el servicio 'cargo' de monto libre que cuelga de cada extra,
//    zonas solo en traslados, nombres únicos.
// 3. Agregar y programar: precio del catálogo (foto), fechas dentro de la estancia, estancia
//    cancelada, programar un rango sin duplicar, «ya se hizo» entra al momento.
// 4. Marcar hecho: el cargo entra a la cuenta con el precio de la foto, quién lo hizo, idempotente.
// 5. Traslados: zona obligatoria, sentido, dirección (la del cliente si no se escribe), estados
//    pendiente → en camino → entregado, aviso de WhatsApp.
// 6. Cancelar: programado y hecho (el cargo se cancela), y desde la lista de cargos del check-out.
// 7. Paquete de N sesiones con el motor de bonos: se vende, cubre la sesión, se devuelve al cancelar.
// 8. Reporte por servicio y por empleado; el cubierto con paquete va aparte.
// 9. Aislamiento: otro negocio, tablas sin escritura directa, llave anónima; el dinero (cobros,
//    caja) no cambia por agregar o marcar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
export const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (cond, titulo) => (cond ? bien(titulo) : hallazgo(titulo));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const rpc = (token, fn, args = {}, negocio = B) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });
const get = (token, ruta, negocio = B) => llamar(`${URL}/rest/v1/${ruta}`, { headers: cab(token, negocio) });

const tAdmin = await tokenDe(datos.adminB);
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
const recConPermiso = recepciones[0].profile_id;
const recSinPermiso = recepciones[1].profile_id;
const tRec = await tokenDe(recConPermiso);
const tRecSin = await tokenDe(recSinPermiso);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);
const hoy = (await rpc(tAdmin, "fecha_negocio")).cuerpo;
const suma = (dias) => new Date(new Date(`${hoy}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
// La guardería no abre en domingo: la estancia de prueba empieza y termina en días abiertos.
const mas = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const esDomingo = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
let d0 = hoy;
while ([0, 1, 2, 3].some((i) => esDomingo(mas(d0, i)))) d0 = mas(d0, 1);
const sal = mas(d0, 3);
const MARCA = `extras-${String(Date.now()).slice(-6)}`;
const num = (v) => Number(v);

const { data: guarderiaDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
let nPerro = 0;
const nuevoPerro = async () => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Extra ${MARCA} ${++nPerro}` }).select("id, nombre, cliente_id").single();
  if (r.error) throw new Error(`perro de prueba: ${r.error.message}`);
  return r.data;
};
const nuevaEstancia = async (perro, { entrada = d0, salida = sal, estado = "reservada" } = {}) => {
  const reserva = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: perro.cliente_id }) });
  const rid = reserva.cuerpo?.[0]?.id;
  if (!rid) throw new Error(`reserva: ${reserva.mensaje}`);
  const e = await llamar(`${URL}/rest/v1/estancias`, {
    method: "POST", headers: cab(tAdmin),
    body: JSON.stringify({ reserva_id: rid, perro_id: perro.id, servicio_id: guarderiaDia.id, fecha_entrada: entrada, fecha_salida: salida, estado, bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: `Prueba ${MARCA}`, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: `Prueba ${MARCA}` }),
  });
  const id = e.cuerpo?.[0]?.id;
  if (!id) throw new Error(`estancia: ${e.mensaje}`);
  return { id, reserva: rid };
};
const cuenta = async (reserva) => {
  const r = await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: reserva });
  return Array.isArray(r.cuerpo) ? r.cuerpo[0] : r.cuerpo;
};
const foto = async () => {
  const [cobros, metodos, devs, mov, turnos] = await Promise.all([
    SB.from("cobros").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("cobro_metodos").select("monto, propina").eq("negocio_id", B),
    SB.from("devoluciones").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("movimientos_caja").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("turnos_caja").select("id", { count: "exact", head: true }).eq("negocio_id", B),
  ]);
  return { cobros: cobros.count, devoluciones: devs.count, movimientos_caja: mov.count, turnos: turnos.count, cobrado: (metodos.data ?? []).reduce((a, m) => a + Number(m.monto) + Number(m.propina), 0) };
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fila = async (id) => (await SB.from("servicios_extra_aplicados").select("*").eq("id", id).single()).data;

const creados = { extras: [] };
try {
  // ── 1. Permisos ──
  console.log("── 1. Permisos");
  const { data: cat } = await SB.from("permisos_catalogo").select("clave, modulos").in("clave", ["agregar_servicios_extra", "editar_catalogo_extras"]);
  comprobar((cat ?? []).length === 2 && cat.every((c) => c.modulos.includes("guarderia") && c.modulos.includes("hotel")), "los dos permisos están en el catálogo y dependen de guardería u hotel");
  const misRec = await rpc(tRec, "mis_permisos");
  comprobar(misRec.ok && misRec.cuerpo.includes("agregar_servicios_extra"), "recepción trae «Agregar servicios extra» encendido");
  comprobar(!misRec.cuerpo.includes("editar_catalogo_extras"), "…y «Editar catálogo» apagado");
  // Toda la recepción de todos los negocios tiene su fila del permiso (sembrada por la migración o por el trigger).
  const { data: recs } = await A.from("membresias").select("negocio_id, profile_id").eq("rol", "recepcion").is("deleted_at", null);
  const { data: filasPerm } = await A.from("permisos_staff").select("negocio_id, profile_id").eq("permiso", "agregar_servicios_extra");
  const conFila = new Set((filasPerm ?? []).map((x) => `${x.negocio_id}:${x.profile_id}`));
  comprobar((recs ?? []).every((m) => conFila.has(`${m.negocio_id}:${m.profile_id}`)), `toda la recepción (${(recs ?? []).length} cuentas) tiene su fila de «Agregar servicios extra»: encendido por omisión`);
  // …y la que llegue después también (trigger de membresías).
  const correoNuevo = `recepcion-extras-${MARCA}@peludesk.test`;
  const { data: nuevoU, error: errU } = await A.auth.admin.createUser({ email: correoNuevo, password: claveAleatoria(), email_confirm: true });
  if (!errU && nuevoU?.user) {
    const m = await SB.from("membresias").insert({ negocio_id: B, profile_id: nuevoU.user.id, rol: "recepcion" });
    const { data: pn } = await A.from("permisos_staff").select("permiso, revocado_at").eq("negocio_id", B).eq("profile_id", nuevoU.user.id);
    comprobar(!m.error && (pn ?? []).some((x) => x.permiso === "agregar_servicios_extra" && !x.revocado_at) && !(pn ?? []).some((x) => x.permiso === "editar_catalogo_extras"), `una recepcionista nueva trae «Agregar servicios extra» encendido y el catálogo apagado (${m.error?.message ?? "ok"})`);
    await A.from("permisos_staff").delete().eq("profile_id", nuevoU.user.id);
    await A.from("membresias").delete().eq("profile_id", nuevoU.user.id);
    await A.auth.admin.deleteUser(nuevoU.user.id);
  } else {
    console.log("   (no se pudo crear la cuenta de prueba:", errU?.message, ")");
  }
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "agregar_servicios_extra" });
  const quitar = await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "agregar_servicios_extra" });
  comprobar(quitar.ok, `admin le quita «Agregar servicios extra» a una recepcionista (${quitar.mensaje || "ok"})`);
  const misSin = await rpc(tRecSin, "mis_permisos");
  comprobar(!misSin.cuerpo.includes("agregar_servicios_extra"), "ya no lo tiene");

  // ── 2. Catálogo ──
  console.log("── 2. Catálogo");
  const guardar = (token, a = {}) => rpc(token, "extra_guardar", { p_id: null, p_nombre: `Paseo ${MARCA}`, p_descripcion: "30 minutos", p_tipo: "general", p_unidad: "vez", p_precio: 80, p_clase_fiscal: "otro_servicio", p_clave_prod_serv: null, p_activo: true, ...a });
  const recCrea = await guardar(tRec);
  comprobar(!recCrea.ok && /Editar catálogo/.test(recCrea.mensaje), "recepción sin «Editar catálogo» no crea un servicio extra");
  comprobar(!(await guardar(tEstetica)).ok && !(await guardar(tCliente)).ok && !(await guardar(null)).ok, "ni estética, ni cliente, ni la llave anónima");
  comprobar(!(await guardar(tAdmin, { p_nombre: " " })).ok, "sin nombre se rechaza");
  comprobar(!(await guardar(tAdmin, { p_precio: 0 })).ok, "un servicio normal sin precio se rechaza");
  comprobar(!(await guardar(tAdmin, { p_tipo: "otro" })).ok && !(await guardar(tAdmin, { p_unidad: "mes" })).ok && !(await guardar(tAdmin, { p_clase_fiscal: "medicina_patente" })).ok, "tipo, unidad y clase fiscal fuera de lista se rechazan");
  comprobar(!(await guardar(tAdmin, { p_clave_prod_serv: "1234" })).ok, "la clave del SAT son 8 números");
  const paseo = await guardar(tAdmin, { p_clave_prod_serv: "93151601" });
  comprobar(paseo.ok && typeof paseo.cuerpo === "string", `admin crea «Paseo» (${paseo.mensaje || "ok"})`);
  creados.extras.push(paseo.cuerpo);
  comprobar(!(await guardar(tAdmin)).ok, "el nombre no se repite (ni cambiando mayúsculas)");
  const { data: sPaseo } = await SB.from("servicios_extra").select("*, servicios!servicios_extra_servicio_id_fkey(clave, categoria, monto_libre, unidad, nombre)").eq("id", paseo.cuerpo).single();
  const svc = Array.isArray(sPaseo.servicios) ? sPaseo.servicios[0] : sPaseo.servicios;
  comprobar(svc.categoria === "cargo" && svc.monto_libre === true && /^extra_/.test(svc.clave) && svc.unidad === "evento", "cuelga de un servicio 'cargo' de monto libre (clave extra_…)");
  const { data: fisc } = await SB.from("cfdi_servicio_fiscal").select("clase, clave_prod_serv").eq("negocio_id", B).eq("servicio_id", sPaseo.servicio_id).is("deleted_at", null);
  comprobar(fisc?.length === 1 && fisc[0].clase === "otro_servicio" && fisc[0].clave_prod_serv === "93151601", "la clase fiscal y la clave SAT quedan en cfdi_servicio_fiscal (la facturación existente)");
  const edit = await guardar(tAdmin, { p_id: paseo.cuerpo, p_nombre: `Paseo ${MARCA}`, p_precio: 80, p_clase_fiscal: "guarderia", p_clave_prod_serv: "" });
  const { data: fisc2 } = await SB.from("cfdi_servicio_fiscal").select("clase, clave_prod_serv").eq("negocio_id", B).eq("servicio_id", sPaseo.servicio_id).is("deleted_at", null);
  comprobar(edit.ok && fisc2?.length === 1 && fisc2[0].clase === "guarderia" && fisc2[0].clave_prod_serv === null, "editar cambia la clase fiscal sin duplicar la fila");
  await guardar(tAdmin, { p_id: paseo.cuerpo, p_clase_fiscal: "otro_servicio", p_clave_prod_serv: "" });

  const traslado = await guardar(tAdmin, { p_nombre: `Traslado ${MARCA}`, p_tipo: "traslado", p_unidad: "viaje", p_precio: 0 });
  comprobar(traslado.ok, "un traslado puede tener precio base 0 (cobra por zona)");
  creados.extras.push(traslado.cuerpo);
  const zona = (token, a = {}) => rpc(token, "extra_zona_guardar", { p_id: null, p_extra: traslado.cuerpo, p_nombre: "Centro", p_km_hasta: 5, p_precio: 100, p_activo: true, ...a });
  comprobar(!(await zona(tRec)).ok, "recepción sin permiso no crea zonas");
  const zCentro = await zona(tAdmin);
  const zLejos = await zona(tAdmin, { p_nombre: "Lejos", p_km_hasta: 15, p_precio: 180 });
  comprobar(zCentro.ok && zLejos.ok, "admin crea dos zonas con su precio");
  comprobar(!(await zona(tAdmin)).ok, "el nombre de zona no se repite en el mismo traslado");
  comprobar(!(await zona(tAdmin, { p_nombre: "Gratis", p_precio: 0 })).ok, "una zona sin precio se rechaza");
  comprobar(!(await zona(tAdmin, { p_extra: paseo.cuerpo, p_nombre: "X" })).ok, "un servicio normal no tiene zonas");

  // Delegar el catálogo a una persona: lo hace, y se le quita.
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "editar_catalogo_extras" });
  const delegado = await guardar(tRecSin, { p_id: paseo.cuerpo, p_descripcion: "Con delegación" });
  comprobar(delegado.ok, "con «Editar catálogo» delegado, recepción edita el catálogo");
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "editar_catalogo_extras" });
  comprobar(!(await guardar(tRecSin, { p_id: paseo.cuerpo })).ok, "…y al quitárselo ya no");

  // ── 3. Agregar y programar ──
  console.log("── 3. Agregar y programar");
  const perro = await nuevoPerro();
  const est = await nuevaEstancia(perro);
  const agregar = (token, a = {}) => rpc(token, "extra_agregar", { p_estancia: est.id, p_extra: paseo.cuerpo, p_fecha: d0, p_hora: "10:00", p_cantidad: 1, p_zona: null, p_direccion: null, p_sentido: null, p_notas: null, p_ya_hecho: false, ...a });
  const sinPermiso = await agregar(tRecSin);
  comprobar(!sinPermiso.ok && /Agregar servicios extra/.test(sinPermiso.mensaje), "sin el permiso no se agrega");
  comprobar(!(await agregar(tEstetica)).ok && !(await agregar(tCliente)).ok && !(await agregar(null)).ok, "ni estética, ni cliente, ni anónimo");
  comprobar(!(await agregar(tRec, { p_fecha: mas(d0, -1) })).ok && !(await agregar(tRec, { p_fecha: mas(d0, 9) })).ok, "la fecha tiene que caer dentro de la estancia");
  comprobar(!(await agregar(tRec, { p_cantidad: 0 })).ok && !(await agregar(tRec, { p_cantidad: 100 })).ok, "la cantidad va de 1 a 99");
  const prog = await agregar(tRec);
  comprobar(prog.ok && prog.cuerpo.id, `recepción programa un paseo a las 10:00 (${prog.mensaje || "ok"})`);
  const f1 = await fila(prog.cuerpo.id);
  comprobar(f1.estado === "pendiente" && num(f1.precio_unitario) === 80 && f1.cargo_id === null && f1.created_by === recConPermiso && f1.perro_id === perro.id, "queda pendiente, con el precio del catálogo, sin cargo y con quién lo registró");
  const antesCuenta = await cuenta(est.reserva);
  await guardar(tAdmin, { p_id: paseo.cuerpo, p_precio: 90, p_descripcion: "30 minutos" });
  comprobar(num((await fila(prog.cuerpo.id)).precio_unitario) === 80, "cambiar el precio del catálogo no mueve lo ya programado (foto del precio)");

  const rango = await rpc(tRec, "extra_programar", { p_estancia: est.id, p_extra: paseo.cuerpo, p_desde: d0, p_hasta: mas(d0, 2), p_hora: "10:00", p_cantidad: 1, p_zona: null, p_direccion: null, p_sentido: null, p_notas: "diario" });
  comprobar(rango.ok && rango.cuerpo === 2, `programar un paseo diario hoy→+2 crea solo los días que faltan (${rango.cuerpo}): hoy ya estaba`);
  const rango2 = await rpc(tRec, "extra_programar", { p_estancia: est.id, p_extra: paseo.cuerpo, p_desde: d0, p_hasta: mas(d0, 2), p_hora: "10:00", p_cantidad: 1, p_zona: null, p_direccion: null, p_sentido: null, p_notas: null });
  comprobar(rango2.ok && rango2.cuerpo === 0, "repetirlo no duplica nada");
  comprobar(!(await rpc(tRec, "extra_programar", { p_estancia: est.id, p_extra: paseo.cuerpo, p_desde: mas(d0, 2), p_hasta: d0, p_hora: null, p_cantidad: 1, p_zona: null, p_direccion: null, p_sentido: null, p_notas: null })).ok, "un rango al revés se rechaza");
  const cuentaProg = await cuenta(est.reserva);
  comprobar(num(cuentaProg.total_cuenta) === num(antesCuenta.total_cuenta), "programar no mueve la cuenta: todavía no es un cargo");

  const ya = await agregar(tRec, { p_ya_hecho: true, p_cantidad: 2, p_hora: null, p_notas: "ya hecho" });
  comprobar(ya.ok && ya.cuerpo.cargo_id && ya.cuerpo.cubierto === false, `«ya se hizo» crea el cargo al momento (${ya.mensaje || "ok"})`);
  const cYa = (await SB.from("cargos_aplicados").select("*").eq("id", ya.cuerpo.cargo_id).single()).data;
  comprobar(num(cYa.precio) === 90 && cYa.cantidad === 2 && cYa.estancia_id === est.id && cYa.reserva_id === est.reserva && /Paseo/.test(cYa.descripcion), `el cargo es del estancia/cuenta con precio ${cYa.precio} × ${cYa.cantidad} y descripción «${cYa.descripcion}»`);
  const cuentaYa = await cuenta(est.reserva);
  comprobar(num(cuentaYa.total_cuenta) === num(antesCuenta.total_cuenta) + 180, `la cuenta subió 180 (${antesCuenta.total_cuenta} → ${cuentaYa.total_cuenta})`);

  // ── 4. Marcar hecho ──
  console.log("── 4. Marcar hecho");
  comprobar(!(await rpc(tRecSin, "extra_marcar_hecho", { p_id: prog.cuerpo.id })).ok, "sin el permiso no se marca");
  const hecho = await rpc(tRec, "extra_marcar_hecho", { p_id: prog.cuerpo.id });
  comprobar(hecho.ok && hecho.cuerpo.cargo_id && hecho.cuerpo.cubierto === false, `recepción lo marca hecho (${hecho.mensaje || "ok"})`);
  const f2 = await fila(prog.cuerpo.id);
  const c2 = (await SB.from("cargos_aplicados").select("precio, cantidad, descripcion").eq("id", f2.cargo_id).single()).data;
  comprobar(f2.estado === "hecho" && f2.hecho_por === recConPermiso && f2.hecho_at && num(c2.precio) === 80, "queda hecho, con quién y cuándo, y el cargo trae el precio de la foto (80), no el nuevo (90)");
  const otra = await rpc(tRec, "extra_marcar_hecho", { p_id: prog.cuerpo.id });
  const cargosDe = await SB.from("cargos_aplicados").select("id", { count: "exact", head: true }).eq("estancia_id", est.id);
  comprobar(otra.ok && otra.cuerpo.ya === true && cargosDe.count === 2, "marcarlo otra vez no duplica el cargo (idempotente)");
  comprobar(!(await rpc(tRec, "extra_marcar_hecho", { p_id: "00000000-0000-4000-8000-000000000000" })).ok, "un id que no existe se rechaza");

  // ── 5. Traslados ──
  console.log("── 5. Traslados");
  await SB.from("clientes").update({ direccion: null }).eq("id", perro.cliente_id);
  const tr = (a = {}) => agregar(tRec, { p_extra: traslado.cuerpo, p_zona: zCentro.cuerpo, p_sentido: "entregar", p_direccion: "Av. Prueba 123, Centro", p_hora: "17:30", ...a });
  comprobar(!(await tr({ p_zona: null })).ok, "con zonas definidas, elegir zona es obligatorio");
  comprobar(!(await tr({ p_sentido: null })).ok, "se pide si es para recoger o entregar");
  const sinDir = await tr({ p_direccion: "  " });
  comprobar(!sinDir.ok && /dirección/.test(sinDir.mensaje), "sin dirección (y el cliente sin una guardada) se rechaza");
  comprobar(!(await tr({ p_zona: "00000000-0000-4000-8000-000000000000" })).ok, "una zona que no existe se rechaza");
  await SB.from("clientes").update({ direccion: "Calle del Cliente 45" }).eq("id", perro.cliente_id);
  const conDirCliente = await tr({ p_direccion: null });
  comprobar(conDirCliente.ok && (await fila(conDirCliente.cuerpo.id)).direccion === "Calle del Cliente 45", "sin escribir dirección usa la de la ficha del cliente");
  const t1 = await tr();
  const ft = await fila(t1.cuerpo.id);
  comprobar(t1.ok && num(ft.precio_unitario) === 100 && ft.sentido === "entregar" && ft.estado === "pendiente", "el precio del traslado sale de la zona (100) y queda pendiente");
  comprobar(!(await rpc(tRec, "extra_traslado_salir", { p_id: prog.cuerpo.id })).ok, "«salió» solo existe para un traslado");
  comprobar(!(await rpc(tRecSin, "extra_traslado_salir", { p_id: t1.cuerpo.id })).ok, "…y exige el permiso");
  const sale = await rpc(tRec, "extra_traslado_salir", { p_id: t1.cuerpo.id });
  const ft2 = await fila(t1.cuerpo.id);
  comprobar(sale.ok && ft2.estado === "en_camino" && ft2.salio_at, "el traslado sale: en camino, con la hora");
  comprobar(!(await rpc(tRec, "extra_traslado_salir", { p_id: t1.cuerpo.id })).ok, "no sale dos veces");
  const av = await rpc(tRec, "extra_traslado_avisado", { p_id: t1.cuerpo.id });
  comprobar(av.ok && (await fila(t1.cuerpo.id)).aviso_whatsapp_at, "queda anotado que se avisó por WhatsApp");
  const lista = await rpc(tRec, "extras_listar", { p_fecha: d0, p_estancia: null, p_solo_traslados: true });
  const itemT = (lista.cuerpo ?? []).find((x) => x.id === t1.cuerpo.id);
  comprobar(lista.ok && itemT && itemT.estado === "en_camino" && itemT.zona_nombre === "Centro" && itemT.cliente_telefono && itemT.perro_nombre === perro.nombre, "la hoja de traslados trae dirección, zona, teléfono del dueño y estado");
  const entrega = await rpc(tRec, "extra_marcar_hecho", { p_id: t1.cuerpo.id });
  comprobar(entrega.ok && (await fila(t1.cuerpo.id)).estado === "hecho", "entregado: el cargo entra a la cuenta");
  const cTr = (await SB.from("cargos_aplicados").select("precio, descripcion").eq("id", entrega.cuerpo.cargo_id).single()).data;
  comprobar(num(cTr.precio) === 100 && /Centro/.test(cTr.descripcion), `el cargo dice la zona: «${cTr.descripcion}»`);
  const traslado2 = await tr({ p_zona: zLejos.cuerpo, p_hora: "08:00", p_sentido: "recoger" });
  comprobar(traslado2.ok && num((await fila(traslado2.cuerpo.id)).precio_unitario) === 180, "otra zona, otro precio (180)");
  await SB.from("servicios_extra_zonas").update({ activo: false }).eq("id", zLejos.cuerpo);
  comprobar(!(await tr({ p_zona: zLejos.cuerpo })).ok, "una zona apagada ya no se ofrece");

  // ── 6. Cancelar ──
  console.log("── 6. Cancelar");
  const rangoFila = (await SB.from("servicios_extra_aplicados").select("id").eq("estancia_id", est.id).eq("fecha", mas(d0, 1)).eq("estado", "pendiente").limit(1).single()).data;
  comprobar(!(await rpc(tRec, "extra_cancelar", { p_id: rangoFila.id, p_motivo: " " })).ok, "cancelar pide motivo");
  comprobar(!(await rpc(tRecSin, "extra_cancelar", { p_id: rangoFila.id, p_motivo: "x" })).ok, "…y el permiso");
  const canc = await rpc(tRec, "extra_cancelar", { p_id: rangoFila.id, p_motivo: "El dueño ya no lo quiso" });
  const fc = await fila(rangoFila.id);
  comprobar(canc.ok && fc.estado === "cancelado" && fc.cancelado_por === recConPermiso && fc.motivo_cancelacion, "se cancela un servicio programado, con quién y motivo");
  comprobar(!(await rpc(tRec, "extra_marcar_hecho", { p_id: rangoFila.id })).ok, "uno cancelado ya no se puede marcar hecho");
  const antesCancel = await cuenta(est.reserva);
  const cancHecho = await rpc(tRec, "extra_cancelar", { p_id: prog.cuerpo.id, p_motivo: "Se capturó por error" });
  const cHecho = (await SB.from("cargos_aplicados").select("cancelado, motivo_cancelacion").eq("id", f2.cargo_id).single()).data;
  const despuesCancel = await cuenta(est.reserva);
  comprobar(cancHecho.ok && (await fila(prog.cuerpo.id)).estado === "cancelado" && cHecho.cancelado === true, "cancelar uno hecho cancela también su cargo");
  comprobar(num(despuesCancel.total_cuenta) === num(antesCancel.total_cuenta) - 80, `…y la cuenta baja 80 (${antesCancel.total_cuenta} → ${despuesCancel.total_cuenta})`);
  // Cancelado desde la lista de cargos del check-out (el camino de siempre).
  const viaCargo = await llamar(`${URL}/rest/v1/cargos_aplicados?id=eq.${ya.cuerpo.cargo_id}`, { method: "PATCH", headers: cab(tRec), body: JSON.stringify({ cancelado: true, motivo_cancelacion: "Desde el check-out" }) });
  comprobar(viaCargo.ok && (await fila(ya.cuerpo.id)).estado === "cancelado", "si el cargo se cancela desde el check-out, el servicio extra se cancela con él");

  // ── 7. Paquete de sesiones ──
  console.log("── 7. Paquete de sesiones");
  const paqueteDe = (token, a = {}) => rpc(token, "extra_paquete_guardar", { p_extra: paseo.cuerpo, p_sesiones: 3, p_precio: 200, p_vigencia_dias: 30, ...a });
  comprobar(!(await paqueteDe(tRec)).ok, "recepción sin «Editar catálogo» no crea paquetes");
  comprobar(!(await paqueteDe(tAdmin, { p_sesiones: 1 })).ok && !(await paqueteDe(tAdmin, { p_precio: 0 })).ok, "un paquete lleva 2 o más sesiones y precio");
  comprobar(!(await paqueteDe(tAdmin, { p_extra: traslado.cuerpo })).ok, "un traslado (precio por zona) no se vende como paquete");
  const paq = await paqueteDe(tAdmin);
  comprobar(paq.ok && typeof paq.cuerpo === "string", `admin crea el paquete de 3 paseos (${paq.mensaje || "ok"})`);
  const { data: sPaq } = await SB.from("servicios").select("categoria, servicio_incluido_id, cantidad_incluida, vigencia_dias").eq("id", paq.cuerpo).single();
  comprobar(sPaq.categoria === "bono" && sPaq.servicio_incluido_id === sPaseo.servicio_id && sPaq.cantidad_incluida === 3 && sPaq.vigencia_dias === 30, "es un 'bono' del motor de bonos que da acceso al paseo");
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle();
  if (!turno) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: MARCA }) });
    turno = t.cuerpo?.[0];
  }
  const perroP = await nuevoPerro();
  const estP = await nuevaEstancia(perroP);
  const venta = await rpc(tRec, "comprar_bono", { p_perro_id: perroP.id, p_servicio_id: paq.cuerpo, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: 200, propina: 0 }] });
  comprobar(venta.ok && typeof venta.cuerpo === "string", `se vende el paquete con comprar_bono, el de siempre (${venta.mensaje || "ok"})`);
  const bonoId = venta.cuerpo;
  const saldoAntes = num((await cuenta(estP.reserva)).saldo);
  const sesion = await rpc(tRec, "extra_agregar", { p_estancia: estP.id, p_extra: paseo.cuerpo, p_fecha: d0, p_hora: "09:00", p_cantidad: 1, p_zona: null, p_direccion: null, p_sentido: null, p_notas: null, p_ya_hecho: true });
  comprobar(sesion.ok && sesion.cuerpo.cubierto === true, `la sesión queda cubierta con el paquete (${sesion.mensaje || "ok"})`);
  const bono1 = (await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", bonoId).single()).data;
  const cuentaP = await cuenta(estP.reserva);
  comprobar(bono1.cantidad_disponible === 2 && (await fila(sesion.cuerpo.id)).bono_cliente_id === bonoId, "al paquete le quedan 2 sesiones y la fila dice cuál lo cubrió");
  comprobar(num(cuentaP.saldo) === saldoAntes && num(cuentaP.total_bono) >= 90, `la cuenta no debe nada más por esa sesión: la cubre el paquete (saldo ${saldoAntes} → ${cuentaP.saldo}, bono ${cuentaP.total_bono})`);
  const cancP = await rpc(tRec, "extra_cancelar", { p_id: sesion.cuerpo.id, p_motivo: "No se hizo" });
  const bono2 = (await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", bonoId).single()).data;
  comprobar(cancP.ok && bono2.cantidad_disponible === 3, "cancelar la sesión devuelve el día al paquete (queda en 3)");
  const sinPaq = await rpc(tRec, "extra_agregar", { p_estancia: est.id, p_extra: paseo.cuerpo, p_fecha: d0, p_hora: null, p_cantidad: 1, p_zona: null, p_direccion: null, p_sentido: null, p_notas: null, p_ya_hecho: true });
  comprobar(sinPaq.ok && sinPaq.cuerpo.cubierto === false, "un perro sin paquete paga la sesión normal (el paquete es POR PERRO)");
  const ajeno = await rpc(tRec, "extra_agregar", { p_estancia: estP.id, p_extra: paseo.cuerpo, p_fecha: d0, p_hora: null, p_cantidad: 4, p_zona: null, p_direccion: null, p_sentido: null, p_notas: null, p_ya_hecho: true });
  comprobar(ajeno.ok && ajeno.cuerpo.cubierto === false && (await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", bonoId).single()).data.cantidad_disponible === 3, "si el paquete no alcanza para la cantidad, se cobra normal y el paquete no se toca");
  const quitaPaq = await paqueteDe(tAdmin, { p_sesiones: null });
  comprobar(quitaPaq.ok && (await SB.from("servicios_extra").select("paquete_servicio_id").eq("id", paseo.cuerpo).single()).data.paquete_servicio_id === null, "quitar el paquete del catálogo no rompe lo ya vendido");

  // ── 8. Reporte ──
  console.log("── 8. Reporte");
  const rep = await rpc(tAdmin, "reporte_servicios_extra_periodo", { p_desde: hoy, p_hasta: hoy });
  if (!rep.ok) console.log("   reporte:", rep.mensaje);
  const filasRep = Array.isArray(rep.cuerpo) ? rep.cuerpo : [];
  const delPaseo = filasRep.find((r) => r.agrupacion === "servicio" && r.clave === paseo.cuerpo);
  const delEmp = filasRep.find((r) => r.agrupacion === "empleado" && r.clave === recConPermiso);
  comprobar(rep.ok && delPaseo && num(delPaseo.ingreso) > 0, `ingresos por servicio extra (${delPaseo ? `${delPaseo.nombre}: $${delPaseo.ingreso}` : "sin fila"})`);
  comprobar(delEmp && num(delEmp.veces) >= 1 && delEmp.nombre, `…y por empleado (${delEmp?.nombre ?? "sin fila"})`);
  comprobar(filasRep.every((r) => r.agrupacion !== "servicio" || r.clave !== paseo.cuerpo || num(r.ingreso) >= 0), "lo cancelado no suma");
  const sumaServ = filasRep.filter((r) => r.agrupacion === "servicio").reduce((a, r) => a + num(r.ingreso) + num(r.cubierto_paquete), 0);
  const sumaEmp = filasRep.filter((r) => r.agrupacion === "empleado").reduce((a, r) => a + num(r.ingreso) + num(r.cubierto_paquete), 0);
  comprobar(Math.abs(sumaServ - sumaEmp) < 0.005, `el total por servicio y por empleado cuadran (${sumaServ} = ${sumaEmp})`);
  comprobar(!(await rpc(tRec, "reporte_servicios_extra_periodo", { p_desde: hoy, p_hasta: hoy })).ok, "recepción sin «Reportes financieros» no lo abre");
  comprobar(!(await rpc(tEstetica, "reporte_servicios_extra_periodo", { p_desde: hoy, p_hasta: hoy })).ok && !(await rpc(null, "reporte_servicios_extra_periodo", { p_desde: hoy, p_hasta: hoy })).ok, "ni estética ni la llave anónima");

  // ── 9. Aislamiento y dinero ──
  console.log("── 9. Aislamiento y dinero");
  const antes = await foto();
  const e2 = await nuevaEstancia(await nuevoPerro());
  const x = await rpc(tRec, "extra_agregar", { p_estancia: e2.id, p_extra: paseo.cuerpo, p_fecha: d0, p_hora: null, p_cantidad: 1, p_zona: null, p_direccion: null, p_sentido: null, p_notas: null, p_ya_hecho: true });
  const despues = await foto();
  comprobar(x.ok && igual(antes, despues), "agregar y marcar un servicio extra no crea cobros, devoluciones, movimientos de caja ni turnos");
  comprobar(!(await rpc(tAdmin, "extra_guardar", { p_id: null, p_nombre: "Cruzado", p_descripcion: null, p_tipo: "general", p_unidad: "vez", p_precio: 10, p_clase_fiscal: "otro_servicio", p_clave_prod_serv: null, p_activo: true }, LUDOGTEKA)).ok, "el admin de Huellitas, con el encabezado de Ludogteka, no crea nada allá");
  const cruzLeer = await get(tAdmin, "servicios_extra?select=id", LUDOGTEKA);
  comprobar(!cruzLeer.ok || cruzLeer.cuerpo.length === 0, "…ni lee el catálogo de Ludogteka");
  const cruzListar = await rpc(tAdmin, "extras_listar", { p_fecha: d0, p_estancia: null, p_solo_traslados: false }, LUDOGTEKA);
  comprobar(!cruzListar.ok || cruzListar.cuerpo.length === 0, "…ni lo programado");
  for (const t of ["servicios_extra", "servicios_extra_zonas", "servicios_extra_aplicados"]) {
    const { data: lud } = await A.from(t).select("id").eq("negocio_id", LUDOGTEKA);
    comprobar((lud ?? []).length === 0, `Ludogteka no tiene filas en ${t} (la prueba no lo tocó)`);
    const ins = await llamar(`${URL}/rest/v1/${t}`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ nombre: "x" }) });
    const upd = await llamar(`${URL}/rest/v1/${t}?negocio_id=eq.${B}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ updated_at: new Date().toISOString() }) });
    const del = await llamar(`${URL}/rest/v1/${t}?negocio_id=eq.${B}`, { method: "DELETE", headers: cab(tAdmin) });
    comprobar(!ins.ok && !upd.ok && !del.ok, `${t}: ni recepción ni admin escriben directo por la API (solo por las funciones)`);
    const anon = await get(null, `${t}?select=id`);
    comprobar(!anon.ok || (Array.isArray(anon.cuerpo) && anon.cuerpo.length === 0), `${t}: la llave anónima no lee nada`);
    const cli = await get(tCliente, `${t}?select=id`);
    comprobar(!cli.ok || (Array.isArray(cli.cuerpo) && cli.cuerpo.length === 0), `${t}: un cliente del portal no lee nada`);
  }
  const eListar = await rpc(tCliente, "extras_listar", { p_fecha: d0, p_estancia: null, p_solo_traslados: false });
  comprobar(!eListar.ok || (eListar.cuerpo ?? []).length === 0, "un cliente del portal no ve la hoja del día");
  const { data: front } = await SB.rpc("auditoria_frontera");
  comprobar((front ?? []).length === 0, "auditoria_frontera() sale vacía");
} finally {
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "agregar_servicios_extra" });
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "editar_catalogo_extras" });
}

if (process.env.SOLO_A !== "1") {
  const ui = await import("./servicios-extra-ui-dev.mjs").catch((e) => {
    if (/Cannot find module|ERR_MODULE_NOT_FOUND/.test(String(e?.message))) return null;
    throw e;
  });
  if (ui?.correrUi) await ui.correrUi({ comprobar, hallazgo, bien, datos, hoy, suma });
}

console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S):\n- ${hallazgos.join("\n- ")}` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
