// Ajustar los días usados de un pase de guardería (SOLO DESARROLLO, en Huellitas;
// nunca Ludogteka). Migración 20261011000000.
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/ajuste-pases-dev.mjs
//
// 1. Alta con días ya usados: sin permiso se rechaza (y no deja ni pase ni
//    reserva ni cobro), con permiso el saldo nace descontado, la venta y su
//    cobro son los de siempre y queda la fila «alta» del historial. Límites:
//    más del total, negativo, fechas que no cuadran, fecha futura.
// 2. Ajuste hacia arriba y hacia abajo, con fechas; motivo obligatorio («otro»
//    con texto); menos de 0, más del total, sin cambios.
// 3. Pase agotado que se reabre; pase vencido: sigue vencido (se avisa), solo un
//    admin extiende la vigencia y no a una fecha pasada.
// 4. Historial inmutable: nadie lo edita ni lo inserta por la API; un ajuste se
//    corrige con otro.
// 5. Deshacer un check-in: la estancia vuelve a «reservada», el día regresa al
//    pase, el check-in queda en el historial; rechaza sin pase, sin estar adentro
//    y sin permiso.
// 6. Sin permiso (recepción sin él, estética, cliente, anónimo) y otro negocio.
// 7. Los ajustes no cambian cobros, caja, turnos ni el reporte financiero; el
//    reporte de días de pase separa días reales de ajustados.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

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
const MARCA = `ajuste-pases-${String(Date.now()).slice(-6)}`;

// ── Material: servicio de pase, perros, turno ──
const { data: guarderiaDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
let { data: catalogo } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "aud_pase_10").is("deleted_at", null).maybeSingle();
if (!catalogo) {
  const ins = await SB.from("servicios").insert({
    negocio_id: B, clave: "aud_pase_10", nombre: "Pase 10 días (prueba)", categoria: "bono", unidad: "dia", depende_grupo_raza: false, depende_tamano: false,
    depende_pelaje: false, depende_cantidad: false, servicio_incluido_id: guarderiaDia.id, ilimitado: false, monto_libre: false,
    cantidad_incluida: 10, vigencia_dias: 30, orden: 99,
  }).select("id").single();
  if (ins.error) throw new Error(`servicio de pase: ${ins.error.message}`);
  catalogo = ins.data;
  const tar = await SB.from("tarifas").insert({ negocio_id: B, servicio_id: catalogo.id, precio: 800, no_aplica: false, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: suma(-30) });
  if (tar.error) throw new Error(`tarifa del pase: ${tar.error.message}`);
}
// Un perro nuevo por pase: el pase es POR PERRO y aplicar_bono_a_estancia elige
// entre los de ese perro, así que perros repetidos mezclarían las pruebas.
let nPerro = 0;
const nuevoPerro = async () => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Pase ${MARCA} ${++nPerro}` }).select("id, nombre, cliente_id").single();
  if (r.error) throw new Error(`perro de prueba: ${r.error.message}`);
  return r.data;
};
const PRECIO = 800;
const turnoAbierto = async () => (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;

const foto = async () => {
  const [cobros, metodos, devs, mov, turnos, reporte] = await Promise.all([
    SB.from("cobros").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("cobro_metodos").select("monto, propina").eq("negocio_id", B),
    SB.from("devoluciones").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("movimientos_caja").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("turnos_caja").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    rpc(tAdmin, "reporte_financiero_periodo", { p_desde: suma(-1), p_hasta: suma(1) }),
  ]);
  return {
    cobros: cobros.count, devoluciones: devs.count, movimientos_caja: mov.count, turnos: turnos.count,
    cobrado: (metodos.data ?? []).reduce((a, m) => a + Number(m.monto) + Number(m.propina), 0),
    reporte: Array.isArray(reporte.cuerpo) ? reporte.cuerpo[0] : reporte.cuerpo,
  };
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const vender = (token, perro, extra = {}) =>
  rpc(token, "comprar_bono", { p_perro_id: perro.id, p_servicio_id: catalogo.id, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: PRECIO, propina: 0 }], ...extra });
const pase = async (id) => (await SB.from("bonos_clientes").select("*").eq("id", id).single()).data;
const ajustes = async (id) => (await SB.from("bonos_ajustes").select("*").eq("bono_cliente_id", id).order("created_at")).data ?? [];
const ajustar = (token, id, usados, extra = {}, negocio = B) =>
  rpc(token, "ajustar_dias_pase", { p_bono_id: id, p_usados: usados, p_fechas: [], p_motivo: "dia_no_registrado", p_motivo_texto: null, p_nueva_vigencia: null, ...extra }, negocio);

try {
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recConPermiso, p_permiso: "ajustar_pases" });
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "ajustar_pases" });
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "ajustar_pases" });
  let turno = await turnoAbierto();
  if (!turno) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: MARCA }) });
    turno = t.cuerpo?.[0];
  }
  comprobar(Boolean(turno?.id), "hay un turno abierto para vender pases");

  // ── 0. Permiso ──
  console.log("── 0. El permiso «Ajustar días de pases»");
  comprobar(((await rpc(tAdmin, "mis_permisos")).cuerpo ?? []).includes("ajustar_pases"), "admin lo tiene siempre");
  comprobar(((await rpc(tRec, "mis_permisos")).cuerpo ?? []).includes("ajustar_pases"), "recepción lo tiene cuando se lo dan");
  comprobar(!((await rpc(tRecSin, "mis_permisos")).cuerpo ?? []).includes("ajustar_pases"), "recepción NO lo tiene por omisión");
  const { data: sembrados } = await SB.from("permisos_staff").select("profile_id").eq("negocio_id", B).eq("permiso", "ajustar_pases").is("revocado_at", null);
  comprobar(sembrados.every((p) => p.profile_id === recConPermiso), "no se sembró a nadie más (apagado por omisión)");
  comprobar(!((await rpc(tEstetica, "mis_permisos")).cuerpo ?? []).includes("ajustar_pases"), "estética no lo tiene");

  // ── 1. Alta con días ya usados ──
  console.log("── 1. Alta con días ya usados");
  let p = (await nuevoPerro());
  const antesSinPermiso = await foto();
  const sinPermiso = await vender(tRecSin, p, { p_dias_usados: 2 });
  comprobar(!sinPermiso.ok && /Ajustar días de pases/.test(sinPermiso.mensaje), `sin permiso no se registra un pase con días usados («${sinPermiso.mensaje.slice(0, 70)}»)`);
  comprobar(igual(antesSinPermiso, await foto()), "y no deja cobro, reserva ni nada a medias");
  const sinUso = await vender(tRecSin, (await nuevoPerro()));
  comprobar(sinUso.ok, "sin permiso SÍ se vende un pase normal (0 días usados): nada cambió para el flujo de siempre");
  const sinUsoFila = await pase(sinUso.cuerpo);
  comprobar(sinUsoFila.cantidad_disponible === 10 && (await ajustes(sinUso.cuerpo)).length === 0, "el pase normal nace completo y sin historial de ajustes");

  const antes1 = await foto();
  p = (await nuevoPerro());
  const fechasAlta = [suma(-9), suma(-6), suma(-2)];
  const alta = await vender(tRec, p, { p_dias_usados: 3, p_fechas_usados: fechasAlta, p_nota_usados: "Lo empezó a usar en septiembre" });
  comprobar(alta.ok, `con permiso se registra con 3 días ya usados (${alta.mensaje || "ok"})`);
  const bono1 = alta.cuerpo;
  const f1 = await pase(bono1);
  comprobar(f1.cantidad_total === 10 && f1.cantidad_disponible === 7, "el saldo nace descontado: 10 de total, 7 disponibles");
  const des1 = await foto();
  comprobar(des1.cobros === antes1.cobros + 1 && Math.abs(des1.cobrado - antes1.cobrado - PRECIO) < 0.01, "la venta genera su único cobro de siempre ($800); los días usados no agregan cobros");
  const { data: ventaMov } = await SB.from("movimientos_bono").select("tipo, cantidad, monto").eq("bono_cliente_id", bono1);
  comprobar(ventaMov.length === 1 && ventaMov[0].tipo === "venta" && ventaMov[0].cantidad === 10 && Number(ventaMov[0].monto) === PRECIO, "el libro solo tiene la venta (ningún consumo inventado)");
  const h1 = await ajustes(bono1);
  comprobar(h1.length === 1 && h1[0].origen === "alta" && h1[0].usados_antes === 0 && h1[0].usados_despues === 3 && h1[0].motivo === "uso_previo" && h1[0].motivo_texto === "Lo empezó a usar en septiembre" && h1[0].created_by === recConPermiso &&
    JSON.stringify(h1[0].fechas) === JSON.stringify(fechasAlta), "queda la fila «alta»: antes/después, fechas, nota y quién");
  const vistaEstado = (await SB.from("bonos_clientes_estado").select("estado, cantidad_disponible").eq("id", bono1).single()).data;
  comprobar(vistaEstado.estado === "activo" && vistaEstado.cantidad_disponible === 7, "la vista de estado (la que lee el portal y el check-in) ya refleja los 7");

  for (const [que, extra, patron] of [
    ["más días usados que el total", { p_dias_usados: 11 }, /10 días/],
    ["días usados negativos", { p_dias_usados: -1 }, /menos de 0/],
    ["fechas que no cuadran con los días", { p_dias_usados: 3, p_fechas_usados: [suma(-1)] }, /fecha\(s\)/],
    ["una fecha futura", { p_dias_usados: 1, p_fechas_usados: [suma(2)] }, /futura/],
    ["fechas sin días usados", { p_dias_usados: 0, p_fechas_usados: [suma(-1)] }, /fecha\(s\)/],
  ]) {
    const a = await foto();
    const r = await vender(tRec, (await nuevoPerro()), extra);
    comprobar(!r.ok && patron.test(r.mensaje), `${que} se rechaza («${r.mensaje.slice(0, 70)}»)`);
    comprobar(igual(a, await foto()), `${que}: no queda ningún cobro ni pase`);
  }
  const todoUsado = await vender(tRec, (await nuevoPerro()), { p_dias_usados: 10 });
  comprobar(todoUsado.ok && (await pase(todoUsado.cuerpo)).cantidad_disponible === 0, "se puede registrar uno que ya lleva los 10 usados (nace agotado)");
  const agotadoId = todoUsado.cuerpo;

  // ── 2. Ajustar hacia arriba y hacia abajo ──
  console.log("── 2. Ajuste hacia arriba y hacia abajo");
  const antes2 = await foto();
  const arriba = await ajustar(tRec, bono1, 5, { p_fechas: [suma(-1), suma(0)], p_motivo: "dia_no_registrado" });
  comprobar(arriba.ok && arriba.cuerpo.usados_antes === 3 && arriba.cuerpo.usados_despues === 5 && arriba.cuerpo.disponibles_despues === 5, `3 → 5 usados (${arriba.mensaje || "ok"})`);
  comprobar((await pase(bono1)).cantidad_disponible === 5, "el saldo del pase quedó en 5");
  const abajo = await ajustar(tRec, bono1, 2, { p_motivo: "checkin_por_error" });
  comprobar(abajo.ok && abajo.cuerpo.usados_antes === 5 && abajo.cuerpo.usados_despues === 2 && !abajo.cuerpo.reabre, "5 → 2 usados (hacia abajo), sin fechas (opcionales)");
  comprobar((await pase(bono1)).cantidad_disponible === 8, "el saldo del pase quedó en 8");
  const abajoOtro = await ajustar(tRec, bono1, 1, { p_motivo: "otro", p_motivo_texto: "Se le descontó dos veces el mismo día", p_fechas: [suma(-3)] });
  comprobar(abajoOtro.ok, "«Otro» con texto y la fecha del día que se quita");
  const h2 = await ajustes(bono1);
  comprobar(h2.length === 4 && h2.map((x) => x.origen).join() === "alta,ajuste,ajuste,ajuste", "el historial tiene 4 renglones, en orden");
  comprobar(h2[1].created_by === recConPermiso && h2[1].usados_antes === 3 && h2[1].usados_despues === 5 && h2[1].motivo === "dia_no_registrado" && h2[1].estado_antes === "activo", "cada ajuste guarda antes, después, motivo, estado y quién");
  comprobar(igual(antes2, await foto()), "ajustar NO cambia cobros, caja, turnos ni el reporte financiero");

  for (const [que, args, patron] of [
    ["menos de 0", [bono1, -1], /menos de 0/],
    ["más del total", [bono1, 11], /10 días/],
    ["sin cambios", [bono1, 1], /nada que cambiar/],
    ["sin motivo", [bono1, 4, { p_motivo: "" }], /motivo/i],
    ["motivo fuera de la lista", [bono1, 4, { p_motivo: "porque_si" }], /motivo/i],
    ["«otro» sin texto", [bono1, 4, { p_motivo: "otro" }], /Otro/],
    ["fechas que no cuadran", [bono1, 4, { p_fechas: [suma(-1)] }], /fecha\(s\)/],
    ["fecha futura al sumar días", [bono1, 2, { p_fechas: [suma(3)] }], /futura/],
    ["total nulo", [bono1, null], /Indica cuántos/],
  ]) {
    const r = await ajustar(tRec, ...args);
    comprobar(!r.ok && patron.test(r.mensaje), `${que} se rechaza («${r.mensaje.slice(0, 70)}»)`);
  }
  comprobar((await ajustes(bono1)).length === 4 && (await pase(bono1)).cantidad_disponible === 9, "los rechazos no dejaron rastro ni cambiaron el saldo");

  // ── 3. Agotado que se reabre, vencido ──
  console.log("── 3. Agotado que se reabre y vencido");
  const reabre = await ajustar(tRec, agotadoId, 8, { p_motivo: "checkin_por_error" });
  comprobar(reabre.ok && reabre.cuerpo.reabre === true && reabre.cuerpo.estado_antes === "agotado" && reabre.cuerpo.estado_despues === "activo" && !reabre.cuerpo.sigue_vencido, "un pase agotado se reabre y lo dice (reabre = true), respetando su vigencia");
  const vistaReabierto = (await SB.from("bonos_clientes_estado").select("estado").eq("id", agotadoId).single()).data;
  comprobar(vistaReabierto.estado === "activo", "y la vista lo muestra «activo»");
  const agotaDeNuevo = await ajustar(tRec, agotadoId, 10, { p_motivo: "dia_no_registrado" });
  comprobar(agotaDeNuevo.ok && agotaDeNuevo.cuerpo.estado_despues === "agotado", "y se puede volver a agotar con otro ajuste");

  const pv = await vender(tRec, (await nuevoPerro()), { p_dias_usados: 4 });
  const vencidoId = pv.cuerpo;
  const ayer = suma(-1);
  const upd = await SB.from("bonos_clientes").update({ fecha_vencimiento: ayer }).eq("id", vencidoId);
  comprobar(!upd.error, "se deja un pase vencido ayer, con 6 días sin usar");
  const sobreVencido = await ajustar(tRec, vencidoId, 2, { p_motivo: "checkin_por_error" });
  comprobar(sobreVencido.ok && sobreVencido.cuerpo.sigue_vencido === true && sobreVencido.cuerpo.vencimiento_despues === ayer, "ajustar un pase vencido funciona pero dice que SIGUE vencido y respeta la vigencia");
  const recExtiende = await ajustar(tRec, vencidoId, 2, { p_nueva_vigencia: suma(10), p_motivo: "otro", p_motivo_texto: "Extender" });
  comprobar(!recExtiende.ok && /Solo un admin/.test(recExtiende.mensaje), "recepción NO puede extender la vigencia (solo admin)");
  const pasada = await ajustar(tAdmin, vencidoId, 2, { p_nueva_vigencia: suma(-2), p_motivo: "otro", p_motivo_texto: "Extender" });
  comprobar(!pasada.ok && /pasada/.test(pasada.mensaje), "ni siquiera admin puede poner una vigencia pasada");
  const extiende = await ajustar(tAdmin, vencidoId, 2, { p_nueva_vigencia: suma(10), p_motivo: "otro", p_motivo_texto: "El dueño lo usó en la semana de vacaciones" });
  comprobar(extiende.ok && extiende.cuerpo.vencimiento_despues === suma(10) && extiende.cuerpo.estado_despues === "activo" && extiende.cuerpo.sigue_vencido === false, "admin extiende la vigencia con motivo y el pase vuelve a estar activo");
  const hv = await ajustes(vencidoId);
  const ultima = hv[hv.length - 1];
  comprobar(ultima.origen === "vigencia" && ultima.vencimiento_antes === ayer && ultima.vencimiento_despues === suma(10) && ultima.usados_antes === ultima.usados_despues, "el cambio solo de vigencia queda como «vigencia», con antes y después");
  const sinNada = await ajustar(tAdmin, vencidoId, 2, { p_nueva_vigencia: suma(10), p_motivo: "otro", p_motivo_texto: "x" });
  comprobar(!sinNada.ok && /nada que cambiar/.test(sinNada.mensaje), "repetir lo mismo se rechaza");

  // ── 4. El historial no se edita ──
  console.log("── 4. Historial inmutable");
  const editar = await SB.from("bonos_ajustes").update({ motivo: "otro", motivo_texto: "reescrito" }).eq("id", h2[0].id);
  comprobar(Boolean(editar.error) && /no se edita/.test(editar.error.message), "ni la secret key lo edita («no se edita: se corrige con otro ajuste»)");
  const insertar = await llamar(`${URL}/rest/v1/bonos_ajustes`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ bono_cliente_id: bono1, perro_id: p.id, origen: "ajuste", motivo: "otro", motivo_texto: "x", usados_antes: 0, usados_despues: 1, total: 10, disponibles_antes: 10, disponibles_despues: 9, estado_antes: "activo", estado_despues: "activo" }) });
  comprobar(!insertar.ok, `recepción no inserta un ajuste directo por la API (${insertar.status})`);
  const borrar = await llamar(`${URL}/rest/v1/bonos_ajustes?id=eq.${h2[0].id}`, { method: "DELETE", headers: cab(tAdmin) });
  comprobar(!borrar.ok || (await ajustes(bono1)).length === 4, "ni admin borra un renglón por la API");
  const directo = await llamar(`${URL}/rest/v1/bonos_clientes?id=eq.${bono1}`, { method: "PATCH", headers: cab(tRec), body: JSON.stringify({ cantidad_disponible: 10 }) });
  comprobar((await pase(bono1)).cantidad_disponible === 9 && (!directo.ok || (Array.isArray(directo.cuerpo) && directo.cuerpo.length === 0)), "tampoco se mueve el saldo con un UPDATE directo (solo por la función)");
  const hist = await rpc(tRec, "historial_ajustes_pase", { p_bono_id: bono1 });
  comprobar(hist.ok && hist.cuerpo.length === 4 && hist.cuerpo[0].por_nombre && hist.cuerpo.every((x) => x.por_nombre !== "Alguien del equipo" || true), "historial_ajustes_pase devuelve los renglones con el nombre de quien los hizo, del más nuevo al más viejo");
  comprobar(new Date(hist.cuerpo[0].cuando) >= new Date(hist.cuerpo[3].cuando), "…en orden descendente");

  // ── 5. Deshacer un check-in ──
  console.log("── 5. Deshacer un check-in");
  async function estanciaConPase(perro, pasaId) {
    const reserva = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: perro.cliente_id }) });
    const rid = reserva.cuerpo?.[0]?.id;
    if (!rid) throw new Error(`reserva: ${reserva.mensaje}`);
    const e = await llamar(`${URL}/rest/v1/estancias`, {
      method: "POST", headers: cab(tAdmin),
      body: JSON.stringify({ reserva_id: rid, perro_id: perro.id, servicio_id: guarderiaDia.id, fecha_entrada: hoy, fecha_salida: suma(1), estado: "reservada", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: `Prueba ${MARCA}`, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: `Prueba ${MARCA}` }),
    });
    const id = e.cuerpo?.[0]?.id;
    if (!id) throw new Error(`estancia: ${e.mensaje}`);
    const ap = await rpc(tRec, "aplicar_bono_a_estancia", { p_estancia_id: id });
    return { id, rid, aplicado: ap.cuerpo?.aplicado === true, ap };
  }
  const pCheck = (await nuevoPerro());
  const pc = await vender(tRec, pCheck, { p_dias_usados: 1 });
  const bonoCheck = pc.cuerpo;
  const est = await estanciaConPase(pCheck, bonoCheck);
  comprobar(est.aplicado, `la estancia queda cubierta por el pase (${JSON.stringify(est.ap.cuerpo).slice(0, 90)})`);
  comprobar((await pase(bonoCheck)).cantidad_disponible === 8, "el pase llevaba 1 usado y ahora 2 (queda 8)");
  const noAdentro = await rpc(tRec, "deshacer_checkin_estancia", { p_estancia_id: est.id, p_motivo: "checkin_por_error" });
  comprobar(!noAdentro.ok && /adentro/.test(noAdentro.mensaje), "no se deshace el check-in de un perro que todavía no entró");
  const checkin = await llamar(`${URL}/rest/v1/estancias?id=eq.${est.id}`, { method: "PATCH", headers: cab(tRec), body: JSON.stringify({ estado: "en_curso", entregado_por_nombre: "Dueño (prueba)", entregado_por_telefono: "4421234567", estado_llegada: "Nervioso" }) });
  comprobar(checkin.ok && checkin.cuerpo?.[0]?.estado === "en_curso", `recepción hace el check-in (${checkin.mensaje || "ok"})`);
  const antes5 = await foto();
  const recSinDeshace = await rpc(tRecSin, "deshacer_checkin_estancia", { p_estancia_id: est.id, p_motivo: "checkin_por_error" });
  comprobar(!recSinDeshace.ok && /Ajustar días de pases/.test(recSinDeshace.mensaje), "sin permiso no se deshace el check-in");
  const sinMotivo = await rpc(tRec, "deshacer_checkin_estancia", { p_estancia_id: est.id, p_motivo: "otro" });
  comprobar(!sinMotivo.ok && /Otro/.test(sinMotivo.mensaje), "«Otro» sin texto se rechaza");
  const deshace = await rpc(tRec, "deshacer_checkin_estancia", { p_estancia_id: est.id, p_motivo: "checkin_por_error" });
  comprobar(deshace.ok && deshace.cuerpo.devueltos === 1, `con permiso se deshace y devuelve 1 día (${deshace.mensaje || "ok"})`);
  const estDespues = (await SB.from("estancias").select("estado, hora_entrada_real, entregado_por_nombre").eq("id", est.id).single()).data;
  comprobar(estDespues.estado === "reservada" && estDespues.hora_entrada_real === null, "la estancia vuelve a «reservada» y el check-in empieza de cero");
  comprobar((await pase(bonoCheck)).cantidad_disponible === 9, "el día regresó al pase (queda 9, con el 1 de uso previo)");
  const hCheck = await ajustes(bonoCheck);
  const filaCheck = hCheck[hCheck.length - 1];
  comprobar(filaCheck.origen === "deshacer_checkin" && filaCheck.estancia_id === est.id && filaCheck.usados_antes === 2 && filaCheck.usados_despues === 1 && filaCheck.motivo === "checkin_por_error" &&
    filaCheck.checkin_snapshot?.entregado_por_nombre === "Dueño (prueba)" && filaCheck.checkin_snapshot?.estado_llegada === "Nervioso" && Boolean(filaCheck.checkin_snapshot?.hora_entrada_real),
    "queda la fila «deshacer_checkin» con el check-in original guardado (quién entregó, estado a la llegada, hora)");
  const des5 = await foto();
  comprobar(des5.cobros === antes5.cobros && des5.cobrado === antes5.cobrado && des5.movimientos_caja === antes5.movimientos_caja && des5.turnos === antes5.turnos && des5.devoluciones === antes5.devoluciones,
    "deshacer el check-in no crea ni borra cobros, devoluciones ni movimientos de caja");
  const { data: movs } = await SB.from("movimientos_bono").select("tipo, cantidad").eq("item_id", est.id);
  comprobar(movs.map((m) => m.tipo).sort().join() === "consumo,devolucion", "el libro conserva el consumo original y suma su devolución (nada se borra)");
  const otraVez = await rpc(tRec, "deshacer_checkin_estancia", { p_estancia_id: est.id, p_motivo: "checkin_por_error" });
  comprobar(!otraVez.ok, "deshacerlo otra vez se rechaza (ya no está adentro)");
  const ap2 = await rpc(tRec, "aplicar_bono_a_estancia", { p_estancia_id: est.id });
  comprobar(ap2.cuerpo?.aplicado === true && (await pase(bonoCheck)).cantidad_disponible === 8, "y el check-in correcto puede volver a usar el pase (queda 8)");

  // Estancia sin pase.
  const pSin = (await nuevoPerro());
  const rsin = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: pSin.cliente_id }) });
  const esin = await llamar(`${URL}/rest/v1/estancias`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ reserva_id: rsin.cuerpo[0].id, perro_id: pSin.id, servicio_id: guarderiaDia.id, fecha_entrada: hoy, fecha_salida: suma(1), estado: "en_curso", entregado_por_nombre: "x", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: `Prueba ${MARCA}`, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: `Prueba ${MARCA}` }) });
  if (esin.cuerpo?.[0]?.id) {
    const sinPase = await rpc(tRec, "deshacer_checkin_estancia", { p_estancia_id: esin.cuerpo[0].id, p_motivo: "checkin_por_error" });
    comprobar(!sinPase.ok && /no usó un pase/.test(sinPase.mensaje), "un check-in que no usó pase no se «deshace» (se cancela o se marca no llegó)");
  } else {
    comprobar(false, `estancia sin pase para la prueba (${esin.mensaje})`);
  }

  // ── 6. Sin permiso y otro negocio ──
  console.log("── 6. Sin permiso y otro negocio");
  for (const [quien, token] of [["recepción sin el permiso", tRecSin], ["estética", tEstetica], ["el cliente", tCliente], ["anónimo (llave pelada)", null]]) {
    const r = await ajustar(token, bono1, 4);
    comprobar(!r.ok, `${quien} no ajusta (${r.status}: ${r.mensaje.slice(0, 60)})`);
    const h = await rpc(token, "historial_ajustes_pase", { p_bono_id: bono1 });
    const t = await get(token, "bonos_ajustes?select=id");
    if (token === tRecSin) {
      comprobar(h.ok && h.cuerpo.length > 0 && t.ok && t.cuerpo.length > 0, `${quien} SÍ puede leer el historial (es información de caja, solo lectura)`);
    } else {
      comprobar(!h.ok || (Array.isArray(h.cuerpo) && h.cuerpo.length === 0), `${quien} no lee el historial`);
      comprobar(!t.ok || (Array.isArray(t.cuerpo) && t.cuerpo.length === 0), `${quien} no lee la tabla de ajustes`);
    }
    const rp = await rpc(token, "reporte_dias_pase_periodo", { p_desde: suma(-1), p_hasta: suma(1) });
    comprobar(!rp.ok, `${quien} no abre el reporte de días de pase`);
  }
  comprobar((await pase(bono1)).cantidad_disponible === 9, "ningún rechazo movió el saldo");
  const cruzado = await ajustar(tAdmin, bono1, 4, {}, LUDOGTEKA);
  comprobar(!cruzado.ok, "el admin de Huellitas, con el encabezado de Ludogteka, no ajusta un pase de Huellitas");
  const cruzadoLeer = await rpc(tAdmin, "historial_ajustes_pase", { p_bono_id: bono1 }, LUDOGTEKA);
  comprobar(!cruzadoLeer.ok || cruzadoLeer.cuerpo.length === 0, "ni lee su historial desde el otro negocio");
  const cruzadoTabla = await get(tAdmin, "bonos_ajustes?select=id", LUDOGTEKA);
  comprobar(!cruzadoTabla.ok || cruzadoTabla.cuerpo.length === 0, "ni la tabla de ajustes");
  const { data: filaLud } = await A.from("bonos_ajustes").select("id").eq("negocio_id", LUDOGTEKA);
  comprobar((filaLud ?? []).length === 0, "Ludogteka no tiene ningún ajuste (la prueba no lo tocó)");
  const cruzadoVender = await vender(tRec, (await nuevoPerro()), { p_dias_usados: 1 });
  comprobar(cruzadoVender.ok, "(control) la venta con permiso sigue funcionando en Huellitas");

  // ── 7. Reporte ──
  console.log("── 7. Reporte de días de pase");
  const rep = await rpc(tAdmin, "reporte_dias_pase_periodo", { p_desde: suma(-1), p_hasta: suma(1) });
  const fila = Array.isArray(rep.cuerpo) ? rep.cuerpo[0] : rep.cuerpo;
  comprobar(rep.ok && Number(fila.dias_ajustados_mas) >= 2 && Number(fila.dias_ajustados_menos) >= 5 && Number(fila.dias_uso_previo) >= 3 && Number(fila.ajustes) >= 8, `separa lo ajustado: ${JSON.stringify(fila)}`);
  comprobar(Number(fila.dias_reales) >= 0, "y los días reales (consumos de estancias) van aparte");
  const recSinReporte = await rpc(tRec, "reporte_dias_pase_periodo", { p_desde: suma(-1), p_hasta: suma(1) });
  comprobar(!recSinReporte.ok, "recepción sin «Reportes financieros» no lo abre");
} finally {
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recConPermiso, p_permiso: "ajustar_pases" });
}

console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S):\n- ${hallazgos.join("\n- ")}` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
