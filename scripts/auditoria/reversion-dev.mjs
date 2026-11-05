// Revertir operaciones (SOLO DESARROLLO, en Huellitas; nunca Ludogteka). Migración 20261203004300; docs/revertir-operaciones.md.
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/reversion-dev.mjs
//
// Hace y deshace cada operación y comprueba que cuenta (total, cobrado, pase, saldo), cupo (ocupación del día), pase
// (días disponibles), caja (cobros, devoluciones, movimientos) y bitácora quedan como antes de la operación, y que la
// bitácora (operaciones_revertidas) guarda quién, cuándo, motivo y efectos:
//   1. check-in → deshacer (a reservada; y un walk-in por error → cancelada, que libera el lugar y devuelve el día)
//   2. check-out → deshacer (vuelve a en curso, la cuenta se reabre)
//   3. «no llegó» → deshacer (vuelve a reservada; el día del pase se vuelve a descontar; el saldo a favor desaparece)
//   4. cancelación de estancia → deshacer
//   5. cancelación de cita (con corrección de precio) → reabrir; eliminación → restaurar
//   6. finalización de cita → deshacer (el inventario regresa)
//   7. cargo cancelado → reactivar
//   8. renglón de venta cancelado → reactivar
//   9. cuenta cancelada → reabrir (vuelve a admitir cobros)
//  10. devolución → anular (deja de sumar; el cobro sigue)
//  11. permisos: recepción sin «Deshacer operaciones», estética, anónimo y otro negocio no pueden; la bitácora es inmutable
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { CONFIRMA_FUERA_HORARIO } from "../lib/fuera-horario.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const hallazgos = [];
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
const patch = (token, ruta, cuerpo) => llamar(`${URL}/rest/v1/${ruta}`, { method: "PATCH", headers: cab(token), body: JSON.stringify(cuerpo) });
const post = (token, ruta, cuerpo) => llamar(`${URL}/rest/v1/${ruta}`, { method: "POST", headers: cab(token), body: JSON.stringify(cuerpo) });
void A;

const tAdmin = await tokenDe(datos.adminB);
const { data: recepciones } = await SB.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
const recCon = recepciones[0].profile_id;
const recSin = recepciones[1].profile_id;
await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recCon, p_permiso: "revertir_operaciones" });
await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSin, p_permiso: "revertir_operaciones" });
const tRec = await tokenDe(recCon);
const tRecSin = await tokenDe(recSin);
const tEstetica = await tokenDe(datos.esteticaB);
const hoy = (await rpc(tAdmin, "fecha_negocio")).cuerpo;
const suma = (dias) => new Date(new Date(`${hoy}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const MARCA = `reversion-${String(Date.now()).slice(-6)}`;
const MOTIVO = `Prueba ${MARCA}: se hizo por error`;

// ── Catálogo ──────────────────────────────────────────────────────────────────────────────────────────────────
const { data: guarderiaDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
let { data: catalogo } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "aud_pase_10").is("deleted_at", null).maybeSingle();
if (!catalogo) {
  const ins = await SB.from("servicios").insert({
    negocio_id: B, clave: "aud_pase_10", nombre: "Pase 10 días (prueba)", categoria: "bono", unidad: "dia", depende_grupo_raza: false, depende_tamano: false,
    depende_pelaje: false, depende_cantidad: false, servicio_incluido_id: guarderiaDia.id, ilimitado: false, monto_libre: false, cantidad_incluida: 10, vigencia_dias: 30, orden: 99,
  }).select("id").single();
  if (ins.error) throw new Error(`servicio de pase: ${ins.error.message}`);
  catalogo = ins.data;
  await SB.from("tarifas").insert({ negocio_id: B, servicio_id: catalogo.id, precio: 800, no_aplica: false, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: suma(-30) });
}
const { data: estetica } = await SB.from("servicios").select("id, nombre").eq("negocio_id", B).eq("categoria", "estetica").is("deleted_at", null).order("orden").limit(1).maybeSingle();
const { data: cargosCatalogo } = await SB.from("servicios").select("id, nombre, monto_libre").eq("negocio_id", B).eq("categoria", "cargo").is("deleted_at", null).order("orden");
const { data: talla } = await SB.from("tamanos_categoria").select("id").order("orden", { ascending: true }).limit(1).maybeSingle();
const { data: pelaje } = await SB.from("tipos_pelaje").select("id").limit(1).maybeSingle();
let turno = (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;
if (!turno) turno = (await post(tRec, "turnos_caja", { fondo_inicial: 100, notas_apertura: MARCA })).cuerpo?.[0];
comprobar(Boolean(turno?.id), "hay un turno abierto");

let nPerro = 0;
const nuevoPerro = async () => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Rev ${MARCA} ${++nPerro}`, tamano_id: talla?.id ?? null, pelaje_id: pelaje?.id ?? null }).select("id, nombre, cliente_id").single();
  if (r.error) throw new Error(`perro de prueba: ${r.error.message}`);
  return r.data;
};
const creadas = [];
async function crearEstancia(perro, extra = {}) {
  const reserva = await post(tAdmin, "reservas", { cliente_id: perro.cliente_id });
  const rid = reserva.cuerpo?.[0]?.id;
  if (!rid) throw new Error(`reserva: ${reserva.mensaje}`);
  let ultimo = null;
  for (let d = 0; d <= 20; d++) {
    const e = await post(tAdmin, "estancias", { reserva_id: rid, perro_id: perro.id, servicio_id: guarderiaDia.id, fecha_entrada: suma(d), fecha_salida: suma(d + 1), estado: "reservada", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: `Prueba ${MARCA}`, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: `Prueba ${MARCA}`, ...extra });
    const id = e.cuerpo?.[0]?.id;
    if (id) { const est = { id, rid, dia: suma(d), perro }; creadas.push(est); return est; }
    ultimo = e.mensaje;
    if (!/cupo|cerrad|no abre|d[ií]a/i.test(String(ultimo))) break;
  }
  throw new Error(`estancia: ${ultimo}`);
}
const estanciaFila = async (id) => (await SB.from("estancias").select("*").eq("id", id).single()).data;
const totales = async (rid) => { const r = await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: rid }); const t = Array.isArray(r.cuerpo) ? r.cuerpo[0] : r.cuerpo; return { total: Number(t.total_cuenta), cobrado: Number(t.total_cobrado), pase: Number(t.total_bono), devuelto: Number(t.total_devuelto), saldo: Number(t.saldo) }; };
const ocupacion = async (fecha) => (await rpc(tAdmin, "ocupacion_del_dia", { p_fecha: fecha, p_solo_hotel: false, p_excluir: null })).cuerpo;
const paseDisp = async (id) => (await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", id).single()).data?.cantidad_disponible;
const caja = async () => {
  const [c, d, m] = await Promise.all([
    SB.from("cobro_metodos").select("monto").eq("negocio_id", B).order("id").range(0, 4999),
    SB.from("devoluciones").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("movimientos_caja").select("id", { count: "exact", head: true }).eq("negocio_id", B),
  ]);
  return `${(c.data ?? []).reduce((a, x) => a + Number(x.monto), 0)}/${d.count}/${m.count}`;
};
const bitacoraDe = async (registroId) => (await SB.from("operaciones_revertidas").select("*").eq("registro_id", registroId).order("created_at")).data ?? [];
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const foto = async (est, bonoId) => ({ cuenta: await totales(est.rid), ocupacion: await ocupacion(est.dia), pase: bonoId ? await paseDisp(bonoId) : null, caja: await caja() });
const checkin = (token, id) => patch(token, `estancias?id=eq.${id}`, { estado: "en_curso", entregado_por_nombre: "Dueño (prueba)", entregado_por_telefono: "4421234567", ...CONFIRMA_FUERA_HORARIO });
const checkout = (token, id) => patch(token, `estancias?id=eq.${id}`, { estado: "finalizada", recogido_por_nombre: "Dueño (prueba)", recogido_por_es_dueno: true, checkout_fuera_horario: "confirmado" });

try {
  // Un perro con pase y una estancia de hoy (o del primer día con cupo) cubierta con el pase.
  const perro = await nuevoPerro();
  const venta = await rpc(tRec, "comprar_bono", { p_perro_id: perro.id, p_servicio_id: catalogo.id, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: 800, propina: 0 }] });
  if (!venta.ok) throw new Error(`comprar_bono: ${venta.mensaje}`);
  const bonoId = venta.cuerpo;

  console.log("── 1. Check-in → deshacer");
  const e1 = await crearEstancia(perro);
  comprobar((await rpc(tRec, "aplicar_bono_a_estancia", { p_estancia_id: e1.id })).cuerpo?.aplicado === true, "estancia reservada y cubierta con el pase (9 de 10)");
  const f1 = await foto(e1, bonoId);
  const ci = await checkin(tRec, e1.id);
  comprobar(ci.ok, `recepción hace el check-in (${ci.mensaje || "ok"})`);
  const sinMotivo = await rpc(tRec, "revertir_checkin_estancia", { p_estancia: e1.id, p_motivo: "no" });
  comprobar(!sinMotivo.ok && /motivo/i.test(sinMotivo.mensaje), "sin motivo se rechaza");
  const u1 = await rpc(tRec, "revertir_checkin_estancia", { p_estancia: e1.id, p_motivo: MOTIVO });
  comprobar(u1.ok && u1.cuerpo?.estado === "reservada", `recepción con el permiso deshace el check-in (${u1.mensaje || "ok"})`);
  const e1d = await estanciaFila(e1.id);
  comprobar(e1d.estado === "reservada" && e1d.hora_entrada_real === null && e1d.entregado_por_nombre === "Dueño (prueba)", "la estancia volvió a «reservada», sin hora de entrada (quién entregó queda en la fila y en la bitácora)");
  comprobar(igual(await foto(e1, bonoId), f1), "cuenta, cupo, pase y caja quedaron como antes del check-in (el pase sigue cubriendo la reserva)");
  const b1 = await bitacoraDe(e1.id);
  comprobar(b1.length === 1 && b1[0].tipo === "checkin_estancia" && b1[0].motivo === MOTIVO && b1[0].hecha_por === recCon && b1[0].antes?.hora_entrada_real && b1[0].reserva_id === e1.rid, "bitácora: quién, cuándo, motivo, el check-in guardado y la reserva");
  // Walk-in por error: se cancela y libera el lugar; el día del pase regresa.
  comprobar((await checkin(tRec, e1.id)).ok, "se vuelve a hacer el check-in");
  const u1c = await rpc(tRec, "revertir_checkin_estancia", { p_estancia: e1.id, p_motivo: MOTIVO, p_destino: "cancelada" });
  comprobar(u1c.ok && u1c.cuerpo?.estado === "cancelada", `deshacer como walk-in por error cancela la estancia (${u1c.mensaje || "ok"})`);
  comprobar((await paseDisp(bonoId)) === 10 && (await ocupacion(e1.dia)) === f1.ocupacion - 1 && (await totales(e1.rid)).total === 0, "…libera el lugar, devuelve el día al pase y la cuenta queda en cero");

  console.log("── 2. Check-out → deshacer");
  const e2 = await crearEstancia(perro);
  comprobar((await checkin(tRec, e2.id)).ok, "estancia en curso (sin pase, paga el día)");
  const f2 = await foto(e2, bonoId);
  const co = await checkout(tRec, e2.id);
  comprobar(co.ok, `check-out (${co.mensaje || "ok"})`);
  const u2 = await rpc(tRec, "revertir_checkout_estancia", { p_estancia: e2.id, p_motivo: MOTIVO });
  comprobar(u2.ok && u2.cuerpo?.estado === "en_curso", `deshacer la salida (${u2.mensaje || "ok"})`);
  const e2d = await estanciaFila(e2.id);
  comprobar(e2d.estado === "en_curso" && e2d.hora_salida_real === null && e2d.recogido_por_nombre === null && e2d.hora_entrada_real, "volvió a «en curso»: sin salida ni quién recogió, con su entrada");
  comprobar(igual(await foto(e2, bonoId), f2), "cuenta, cupo, pase y caja como antes de la salida");
  comprobar((await bitacoraDe(e2.id)).some((b) => b.tipo === "checkout_estancia" && b.antes?.recogido_por_nombre === "Dueño (prueba)"), "bitácora con la salida guardada");
  comprobar((await checkout(tRec, e2.id)).ok, "se puede volver a dar la salida");

  console.log("── 3. «No llegó» → deshacer (con pase: el saldo a favor fantasma desaparece)");
  const e3 = await crearEstancia(perro);
  comprobar((await rpc(tRec, "aplicar_bono_a_estancia", { p_estancia_id: e3.id })).cuerpo?.aplicado === true, "reservada con pase");
  const f3 = await foto(e3, bonoId);
  comprobar((await patch(tRec, `estancias?id=eq.${e3.id}`, { estado: "no_llego" })).ok, "se marca «no llegó»");
  const e3n = await estanciaFila(e3.id);
  comprobar(e3n.cancelada_por === recCon && Boolean(e3n.cancelada_at), "«no llegó» deja quién y cuándo");
  const u3 = await rpc(tRec, "reabrir_estancia", { p_estancia: e3.id, p_motivo: MOTIVO });
  comprobar(u3.ok && u3.cuerpo?.estado === "reservada", `deshacer «no llegó» (${u3.mensaje || "ok"})`);
  comprobar(igual(await foto(e3, bonoId), f3), `cuenta, cupo, pase y caja como antes (pase ${await paseDisp(bonoId)}, saldo ${(await totales(e3.rid)).saldo})`);
  comprobar((await bitacoraDe(e3.id)).some((b) => b.tipo === "no_llego_estancia" && b.efectos.some((x) => x.tipo === "pase")), "bitácora: no_llego_estancia con el pase vuelto a aplicar");

  console.log("── 4. Cancelación de estancia → deshacer");
  const f4 = await foto(e3, bonoId);
  comprobar((await patch(tRec, `estancias?id=eq.${e3.id}`, { estado: "cancelada", motivo_cancelacion: MARCA })).ok && (await paseDisp(bonoId)) === f4.pase + 1, "cancelada: el día regresó al pase");
  const u4 = await rpc(tRec, "reabrir_estancia", { p_estancia: e3.id, p_motivo: MOTIVO });
  comprobar(u4.ok && igual(await foto(e3, bonoId), f4), `deshacer la cancelación deja todo como antes (${u4.mensaje || "ok"})`);
  comprobar((await bitacoraDe(e3.id)).filter((b) => b.tipo === "cancelacion_estancia").length === 1, "bitácora: cancelacion_estancia");

  console.log("── 5. Cita cancelada (con corrección de precio) → reabrir; eliminada → restaurar");
  let citaId = null, rCita = null;
  if (!estetica) hallazgo("Huellitas no tiene servicio de estética");
  else {
    const perro5 = await nuevoPerro();
    rCita = (await SB.from("reservas").insert({ negocio_id: B, cliente_id: perro5.cliente_id }).select("id").single()).data.id;
    const c5 = await SB.from("citas_estetica").insert({ negocio_id: B, reserva_id: rCita, perro_id: perro5.id, servicio_id: estetica.id, empleado_id: datos.esteticaB, inicio: new Date(`${suma(2)}T16:00:00Z`).toISOString(), precio: 450, precio_base: 450, servicio_nombre: estetica.nombre }).select("id").single();
    if (c5.error) hallazgo(`no se pudo crear la cita: ${c5.error.message}`);
    else {
      citaId = c5.data.id;
      const t0 = await totales(rCita);
      const corr = await rpc(tAdmin, "corregir_precio_cuenta", { p_reserva_id: rCita, p_linea_tipo: "estetica", p_linea_id: citaId, p_precio_nuevo: t0.total - 60, p_motivo: `Poodle (${MARCA})` });
      comprobar(corr.ok, "corrección de −$60 sobre la cita");
      const f5 = await totales(rCita);
      comprobar((await rpc(tAdmin, "cancelar_cita_estetica", { p_cita_id: citaId, p_motivo: `Prueba ${MARCA}`, p_no_llego: false })).ok, "cita cancelada");
      comprobar((await totales(rCita)).total === 0, "la cuenta queda en cero (la corrección murió con la línea)");
      const u5 = await rpc(tRec, "reabrir_cita", { p_cita: citaId, p_motivo: MOTIVO });
      comprobar(u5.ok, `reabrir la cita (${u5.mensaje || "ok"})`);
      const c5d = (await SB.from("citas_estetica").select("estado, deleted_at").eq("id", citaId).single()).data;
      comprobar(c5d.estado === "reservada" && igual(await totales(rCita), f5), `vuelve a «reservada» con su corrección (saldo ${(await totales(rCita)).saldo} = ${f5.saldo})`);
      const cambios = (await SB.from("citas_estetica_cambios").select("tipo, motivo").eq("cita_id", citaId).order("created_at")).data ?? [];
      comprobar(cambios.some((x) => x.tipo === "reversion" && x.motivo === MOTIVO), "queda en el historial de la cita (tipo reversion)");
      const el = await rpc(tAdmin, "eliminar_cita_estetica", { p_cita_id: citaId, p_motivo: `Duplicada ${MARCA}` });
      comprobar(el.ok, `cita eliminada (${el.mensaje || "ok"})`);
      const u5b = await rpc(tRec, "reabrir_cita", { p_cita: citaId, p_motivo: MOTIVO });
      const c5e = (await SB.from("citas_estetica").select("estado, deleted_at").eq("id", citaId).single()).data;
      comprobar(u5b.ok && c5e.deleted_at === null && c5e.estado === "reservada", `restaurar la cita eliminada (${u5b.mensaje || "ok"})`);
    }
  }

  console.log("── 6. Finalización de cita → deshacer (inventario)");
  if (citaId) {
    const ini = await patch(tAdmin, `citas_estetica?id=eq.${citaId}`, { estado: "en_curso", entregado_por_nombre: "Dueño (prueba)" });
    comprobar(ini.ok, `cita iniciada (${ini.mensaje || "ok"})`);
    const f6 = await totales(rCita);
    const fin = await rpc(tAdmin, "finalizar_cita_con_consumo", { p_cita_id: citaId, p_recogido_por_nombre: "Dueño (prueba)", p_recogido_por_telefono: null, p_recogido_por_es_dueno: true, p_ajustes: [] });
    comprobar(fin.ok, `cita finalizada (${fin.mensaje || "ok"})`);
    const salidas = (await SB.from("movimientos_inventario").select("id").eq("cita_estetica_id", citaId).eq("tipo", "salida_consumo")).data?.length ?? 0;
    const u6 = await rpc(tRec, "revertir_finalizacion_cita", { p_cita: citaId, p_motivo: MOTIVO });
    comprobar(u6.ok, `deshacer la finalización (${u6.mensaje || "ok"})`);
    const c6 = (await SB.from("citas_estetica").select("estado, recogido_por_nombre").eq("id", citaId).single()).data;
    const regresos = (await SB.from("movimientos_inventario").select("id").eq("cita_estetica_id", citaId).eq("tipo", "ajuste_positivo")).data?.length ?? 0;
    comprobar(c6.estado === "en_curso" && c6.recogido_por_nombre === null && regresos === salidas && igual(await totales(rCita), f6), `vuelve a «en curso», el inventario regresa (${salidas} consumo(s) → ${regresos} ajuste(s)) y la cuenta no cambia`);
  }

  console.log("── 7. Cargo cancelado → reactivar");
  let cargoId = null;
  for (const s of cargosCatalogo ?? []) {
    const r = await post(tAdmin, "cargos_aplicados", { estancia_id: e2.id, servicio_id: s.id, cantidad: 1, ...(s.monto_libre ? { precio: 120, descripcion: `Prueba ${MARCA}` } : {}) });
    if (r.ok && r.cuerpo?.[0]?.id) { cargoId = r.cuerpo[0].id; break; }
  }
  if (!cargoId) hallazgo("no se pudo aplicar un cargo de prueba (Huellitas sin cargo con tarifa)");
  else {
    const f7 = await totales(e2.rid);
    comprobar((await patch(tAdmin, `cargos_aplicados?id=eq.${cargoId}`, { cancelado: true, motivo_cancelacion: `Prueba ${MARCA}` })).ok && (await totales(e2.rid)).total < f7.total, "cargo cancelado: la cuenta bajó");
    const directo = await patch(tAdmin, `cargos_aplicados?id=eq.${cargoId}`, { cancelado: false });
    comprobar(!directo.ok, "no se reactiva con un UPDATE directo");
    const u7 = await rpc(tRec, "reactivar_cargo", { p_cargo: cargoId, p_motivo: MOTIVO });
    comprobar(u7.ok && igual(await totales(e2.rid), f7), `reactivar el cargo deja la cuenta como antes (${u7.mensaje || "ok"})`);
    const g = (await SB.from("cargos_aplicados").select("cancelado, cancelado_por, motivo_cancelacion").eq("id", cargoId).single()).data;
    comprobar(!g.cancelado && g.cancelado_por === null && g.motivo_cancelacion === null, "el cargo quedó activo y limpio (lo cancelado queda en la bitácora)");
  }

  console.log("── 8. Renglón de venta cancelado → reactivar");
  const v8 = await rpc(tRec, "crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto: `Concepto ${MARCA}`, precio: 75, cantidad: 2 }], p_notas: MARCA });
  comprobar(v8.ok, `venta de mostrador (${v8.mensaje || "ok"})`);
  if (v8.ok) {
    const rVenta = v8.cuerpo;
    const f8 = await totales(rVenta);
    const renglon = (await SB.from("ventas_mostrador").select("id").eq("reserva_id", rVenta).single()).data;
    comprobar((await rpc(tRec, "cancelar_venta_mostrador", { p_venta_id: renglon.id, p_motivo: `Prueba ${MARCA}` })).ok && (await totales(rVenta)).total === 0, "renglón cancelado: la cuenta en cero");
    const u8 = await rpc(tRec, "reactivar_venta_mostrador", { p_venta: renglon.id, p_motivo: MOTIVO });
    comprobar(u8.ok && igual(await totales(rVenta), f8), `reactivar el renglón deja la cuenta como antes (${u8.mensaje || "ok"})`);
  }

  console.log("── 9. Cuenta cancelada → reabrir");
  if (citaId && rCita) {
    const fin2 = await rpc(tAdmin, "finalizar_cita_con_consumo", { p_cita_id: citaId, p_recogido_por_nombre: "Dueño (prueba)", p_recogido_por_telefono: null, p_recogido_por_es_dueno: true, p_ajustes: [] });
    comprobar(fin2.ok, "la cita se vuelve a finalizar (para tener saldo por cobrar)");
    const f9 = await totales(rCita);
    const canc = await rpc(tAdmin, "cancelar_cuenta", { p_reserva_id: rCita, p_motivo: "error_captura", p_motivo_texto: null, p_cancelar_cita: false });
    comprobar(canc.ok, `cuenta cancelada (${canc.mensaje || "ok"})`);
    const cobroEnCancelada = await rpc(tRec, "registrar_cobro", { p_reserva_id: rCita, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: 10 }] });
    comprobar(!cobroEnCancelada.ok && /cancelada/.test(cobroEnCancelada.mensaje), "cancelada no admite cobros");
    const u9 = await rpc(tRec, "reabrir_cuenta", { p_reserva: rCita, p_motivo: MOTIVO });
    comprobar(u9.ok && igual(await totales(rCita), f9), `reabrir la cuenta (${u9.mensaje || "ok"})`);
    const info = (await rpc(tAdmin, "cuenta_para_cancelar", { p_reserva_id: rCita })).cuerpo;
    comprobar(!info?.cancelada, "cuenta_para_cancelar ya no la ve cancelada");
    const abiertas = (await rpc(tAdmin, "cuentas_abiertas", { p_dias: 30 })).cuerpo ?? [];
    comprobar(abiertas.some((c) => c.reserva_id === rCita), "vuelve a salir en cuentas abiertas");
    const cc = (await SB.from("cuentas_canceladas").select("deleted_at, reabierta_por, reabierta_motivo").eq("reserva_id", rCita).single()).data;
    comprobar(Boolean(cc.deleted_at) && cc.reabierta_por === recCon && cc.reabierta_motivo === MOTIVO, "la cancelación queda marcada como reabierta (quién y por qué), no borrada");

    console.log("── 10. Devolución → anular");
    const cobro = await rpc(tRec, "registrar_cobro", { p_reserva_id: rCita, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: f9.saldo }] });
    comprobar(cobro.ok, `cobro de ${f9.saldo} (${cobro.mensaje || "ok"})`);
    const f10 = await totales(rCita);
    const cajaAntes = await caja();
    const dev = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cobro.cuerpo, p_motivo: `Prueba ${MARCA}`, p_metodos: [{ metodo: "efectivo", monto: 50 }] });
    comprobar(dev.ok && (await totales(rCita)).devuelto === 50, `devolución de $50 (${dev.mensaje || "ok"})`);
    const u10 = await rpc(tRec, "anular_devolucion", { p_devolucion: dev.cuerpo, p_motivo: MOTIVO });
    comprobar(u10.ok && igual(await totales(rCita), f10), `anular la devolución deja la cuenta como antes (${u10.mensaje || "ok"})`);
    const resumen = (await rpc(tAdmin, "resumen_turno", { p_turno_id: turno.id })).cuerpo;
    comprobar(resumen !== null, "resumen_turno responde (la devolución anulada ya no suma)");
    const d = dev.ok ? (await SB.from("devoluciones").select("deleted_at, anulada_por, anulada_motivo").eq("id", dev.cuerpo).single()).data : null;
    comprobar(Boolean(d?.deleted_at) && d?.anulada_por === recCon && d?.anulada_motivo === MOTIVO, "la devolución queda marcada anulada, no borrada");
    void cajaAntes;
  }

  console.log("── 11. Permisos y bitácora inmutable");
  const sinPermiso = await rpc(tRecSin, "reabrir_cuenta", { p_reserva: rCita ?? e2.rid, p_motivo: MOTIVO });
  comprobar(!sinPermiso.ok && /Deshacer operaciones/.test(sinPermiso.mensaje), "recepción sin el permiso no puede");
  const est = await rpc(tEstetica, "revertir_checkout_estancia", { p_estancia: e2.id, p_motivo: MOTIVO });
  comprobar(!est.ok, "estética no puede");
  const anon = await rpc(null, "revertir_checkout_estancia", { p_estancia: e2.id, p_motivo: MOTIVO });
  comprobar(!anon.ok, "la llave anónima no puede");
  const otro = await rpc(tAdmin, "revertir_checkout_estancia", { p_estancia: e2.id, p_motivo: MOTIVO }, LUDOGTEKA);
  comprobar(!otro.ok, "desde otro negocio no se encuentra");
  const [fila] = await bitacoraDe(e2.id);
  const upd = await patch(tAdmin, `operaciones_revertidas?id=eq.${fila.id}`, { motivo: "editado" });
  const del = await llamar(`${URL}/rest/v1/operaciones_revertidas?id=eq.${fila.id}`, { method: "DELETE", headers: cab(tAdmin) });
  const sigue = (await SB.from("operaciones_revertidas").select("motivo").eq("id", fila.id).single()).data;
  comprobar((!upd.ok || upd.cuerpo?.length === 0) && (!del.ok || sigue?.motivo === MOTIVO) && sigue?.motivo === MOTIVO, "la bitácora no se edita ni se borra");
  const lectura = await rpc(tRec, "operaciones_revertidas_de_reserva", { p_reserva: e2.rid });
  comprobar(lectura.ok && lectura.cuerpo.length >= 1 && lectura.cuerpo[0].hecha_por_nombre, "operaciones_revertidas_de_reserva la enseña con el nombre de quien la hizo");
  const lecturaEst = await rpc(tEstetica, "operaciones_revertidas_de_reserva", { p_reserva: e2.rid });
  comprobar(lecturaEst.ok && lecturaEst.cuerpo.length === 0, "estética no la lee");
} finally {
  for (const e of creadas) await SB.from("estancias").update({ estado: "cancelada", motivo_cancelacion: `Prueba ${MARCA}` }).eq("id", e.id).in("estado", ["reservada", "confirmada"]);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ TODO BIEN");
process.exit(hallazgos.length ? 1 : 0);
