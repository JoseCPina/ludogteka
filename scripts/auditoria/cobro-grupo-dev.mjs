// Cobro agrupado (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/cobro-grupo-dev.mjs
//
// 1. Dos cuentas de la misma clienta pagadas juntas: efectivo, transferencia,
//    repartido en dos métodos, propina única repartida sin perder un centavo.
// 2. Pago parcial (la parte que falta queda como saldo de cada cuenta), montos
//    por cuenta editables, y nada que deje una cuenta debiendo menos de un peso.
// 3. Tarjeta manual con UN folio para todo el grupo; el folio no se repite
//    entre cobros distintos; revisada y «no recibida» operan sobre el grupo
//    (con las dos reglas: no con propina, no con devoluciones).
// 4. Rechazos: clientas distintas, cuenta de otro negocio, «Público en general»,
//    una sola cuenta, cuenta repetida, monto de más, no cuadra con los métodos,
//    sin turno, terminal a mano con proveedor, sin permiso, estética, cliente, anónimo.
// 5. Devolución sobre UNA cuenta del grupo (contra lo que esa cuenta recibió).
// 6. Orden integrada de grupo (UNA orden): verificada, se reparte; idempotente;
//    monto distinto rechazado; reembolso por cuenta; «no recibido» no aplica a un cobro integrado.
// 7. Caja: el turno cuenta cada peso una sola vez; el corte cerrado no cambia.
// 8. Centavos: el descuento por porcentaje deja pesos enteros, ningún cobro deja
//    < $1, y la corrección de plataforma (con evento y reversa).
// 9. Aislamiento y frontera.
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
const cmp = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const tAdmin = await tokenDe(datos.adminB);
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
const recSinPermiso = recepciones[1].profile_id;
const tRec = await tokenDe(recepciones[0].profile_id);
const tRecSin = await tokenDe(recSinPermiso);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);
const tLudo = await tokenDe((await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id);

const sufijo = String(Date.now()).slice(-6);
let n = 0;
const folio = (p = "GRP") => `${p}-${sufijo}${String(++n).padStart(2, "0")}`;
const clientes = [];
const nuevoCliente = async (nombre) => {
  const tel = `55${String(Date.now()).slice(-7)}${n++ % 10}`.slice(0, 10);
  const r = await SB.from("clientes").insert({ nombre: `${nombre} ${sufijo}`, telefono: tel }).select("id").single();
  if (r.error) throw new Error(`cliente de prueba: ${r.error.message}`);
  clientes.push(r.data.id);
  return r.data.id;
};
// Una cuenta con un total exacto: una venta de mostrador de concepto libre.
const cuenta = async (clienteId, precio, concepto = "Servicio de prueba") => {
  const r = await rpc(tRec, "crear_venta_mostrador", { p_cliente_id: clienteId, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba cobro agrupado" });
  if (!r.ok) throw new Error(`cuenta de prueba: ${r.mensaje}`);
  return r.cuerpo;
};
const saldo = async (reservaId) => Number((await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: reservaId })).cuerpo?.[0]?.saldo ?? NaN);
const junto = (token, partes, metodos, notas = "prueba cobro agrupado") => rpc(token, "registrar_cobro_grupo", { p_partes: partes, p_notas: notas, p_metodos: metodos });
const turnoAbierto = async () => (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;
const resumen = async (turnoId) => (await rpc(tAdmin, "resumen_turno", { p_turno_id: turnoId })).cuerpo ?? [];
const cobradoMetodo = (res, metodo) => res.filter((r) => r.metodo === metodo).reduce((a, r) => a + Number(r.cobrado) - Number(r.devuelto) + Number(r.propinas), 0);
const cobrosDe = async (grupoId) => (await SB.from("cobros").select("id, reserva_id, origen, grupo_id").eq("grupo_id", grupoId).order("created_at")).data ?? [];
const metodosDe = async (cobroId) => (await SB.from("cobro_metodos").select("metodo, monto, propina").eq("cobro_id", cobroId)).data ?? [];

try {
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "manual" });
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });
  let turno = await turnoAbierto();
  if (!turno) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba cobro agrupado" }) });
    turno = t.cuerpo?.[0];
  }
  comprobar(Boolean(turno?.id), "hay un turno abierto para cobrar");
  const cli = await nuevoCliente("Victoria");
  const otra = await nuevoCliente("Otra clienta");

  // ── 1. Pagadas juntas ──
  console.log("── 1. Dos cuentas de la misma clienta, un solo pago");
  const antesRes = await resumen(turno.id);
  const a1 = await cuenta(cli, 320, "Baño rapado");
  const a2 = await cuenta(cli, 35, "Guardería 1 hr");
  const ef = await junto(tRec, [{ reserva_id: a1, monto: 320 }, { reserva_id: a2, monto: 35 }], [{ metodo: "efectivo", monto: 355 }]);
  comprobar(ef.ok, `efectivo $355 entre las dos (${ef.mensaje || "ok"})`);
  const g1 = ef.cuerpo?.grupo_id;
  comprobar(cmp(await saldo(a1), 0) && cmp(await saldo(a2), 0), "las dos cuentas quedan en saldo 0");
  const cobros1 = await cobrosDe(g1);
  comprobar(cobros1.length === 2 && cobros1.every((c) => c.origen === "manual"), "cada cuenta conserva SU cobro (2 cobros ligados al grupo)");
  const m1 = await Promise.all(cobros1.map((c) => metodosDe(c.id)));
  comprobar(cmp(m1[0][0]?.monto, 320) && cmp(m1[1][0]?.monto, 35), "y su parte exacta del pago (320 y 35: la más antigua se llena primero)");
  const { data: grp1 } = await SB.from("cobros_grupo").select("*").eq("id", g1).single();
  comprobar(grp1 && cmp(grp1.monto_total, 355) && grp1.cliente_id === cli && grp1.turno_id === turno.id && grp1.origen === "manual", "el pago agrupado guarda total, clienta y turno");
  const ev1 = (await SB.from("cobros_grupo_eventos").select("tipo, actor").eq("grupo_id", g1)).data ?? [];
  comprobar(ev1.some((e) => e.tipo === "registrado"), "deja el evento «registrado» (auditoría)");
  const despuesRes = await resumen(turno.id);
  comprobar(cmp(cobradoMetodo(despuesRes, "efectivo") - cobradoMetodo(antesRes, "efectivo"), 355), "el turno cuenta los $355 UNA vez (no 710)");
  const det = await rpc(tRec, "cobro_grupo_detalle", { p_grupo_id: g1 });
  comprobar(det.ok && det.cuerpo?.cuentas?.length === 2 && cmp(det.cuerpo.total, 355) && /Baño rapado/.test(JSON.stringify(det.cuerpo.cuentas)), "desde el pago se ven las cuentas incluidas (detalle)");
  const gruposDe = await rpc(tRec, "cobro_grupos_de_reserva", { p_reserva_id: a2 });
  comprobar(gruposDe.ok && gruposDe.cuerpo?.includes(g1), "desde una cuenta se ve el grupo («Cobrado junto con…»)");

  // Propina única y dos métodos.
  const b1 = await cuenta(cli, 200);
  const b2 = await cuenta(cli, 100);
  const dos = await junto(tRec, [{ reserva_id: b1, monto: 200 }, { reserva_id: b2, monto: 100 }],
    [{ metodo: "efectivo", monto: 150, propina: 10 }, { metodo: "transferencia", monto: 150, propina: 21 }]);
  comprobar(dos.ok, `repartido en efectivo y transferencia con propina (${dos.mensaje || "ok"})`);
  const cb = await cobrosDe(dos.cuerpo?.grupo_id);
  const mb = await Promise.all(cb.map((c) => metodosDe(c.id)));
  const sumaPropina = mb.flat().reduce((a, m) => a + Number(m.propina), 0);
  const sumaMonto = mb.flat().reduce((a, m) => a + Number(m.monto), 0);
  comprobar(cmp(sumaPropina, 31) && cmp(sumaMonto, 300), "la propina (31) y el monto (300) suman exacto entre las cuentas: ni un centavo de más ni de menos");
  const efecB = mb.flat().filter((m) => m.metodo === "efectivo").reduce((a, m) => a + Number(m.monto), 0);
  comprobar(cmp(efecB, 150) && cmp(mb[0].reduce((a, m) => a + Number(m.monto), 0), 200), "el método se reparte en orden: la primera cuenta recibe sus 200 completos");
  const grB = (await SB.from("cobros_grupo").select("propina_total").eq("id", dos.cuerpo.grupo_id).single()).data;
  comprobar(cmp(grB.propina_total, 31), "la propina se registra UNA vez en el pago agrupado (31)");

  // ── 2. Parcial y centavos ──
  console.log("── 2. Pago parcial y saldos de menos de un peso");
  const p1 = await cuenta(cli, 200);
  const p2 = await cuenta(cli, 100);
  const parcial = await junto(tRec, [{ reserva_id: p1, monto: 200 }, { reserva_id: p2, monto: 50 }], [{ metodo: "efectivo", monto: 250 }]);
  comprobar(parcial.ok && cmp(await saldo(p1), 0) && cmp(await saldo(p2), 50), "pago parcial: la más antigua se salda y la otra queda con su saldo ($50)");
  const resto = await junto(tRec, [{ reserva_id: p2, monto: 50 }, { reserva_id: await cuenta(cli, 10), monto: 10 }], [{ metodo: "efectivo", monto: 60 }]);
  comprobar(resto.ok, "lo que faltaba se cobra después (también junto)");
  const c1 = await cuenta(cli, 100);
  const c2 = await cuenta(cli, 100);
  const centavos = await junto(tRec, [{ reserva_id: c1, monto: 100 }, { reserva_id: c2, monto: 99.3 }], [{ metodo: "efectivo", monto: 199.3 }]);
  comprobar(!centavos.ok && /menos de un peso/i.test(centavos.mensaje), `una cuenta no se queda debiendo $0.70 («${centavos.mensaje.slice(0, 70)}»)`);
  comprobar(cmp(await saldo(c1), 100) && cmp(await saldo(c2), 100), "y no se registró nada a medias");
  const demas = await junto(tRec, [{ reserva_id: c1, monto: 100 }, { reserva_id: c2, monto: 150 }], [{ metodo: "efectivo", monto: 250 }]);
  comprobar(!demas.ok && /solo debe/i.test(demas.mensaje), "no se paga a una cuenta más de lo que debe");

  // ── 3. Tarjeta manual con un solo folio ──
  console.log("── 3. Tarjeta (registro manual): un folio para todo el grupo");
  const t1 = await cuenta(cli, 320, "Baño rapado");
  const t2 = await cuenta(cli, 35, "Guardería 1 hr");
  const fol = folio("VOU");
  const tm = (extra = {}) => ({ metodo: "tarjeta_manual", monto: 355, propina: 0, folio: fol, motivo: "sin_senal", ultimos4: "4242", ...extra });
  const tj = await junto(tRec, [{ reserva_id: t1, monto: 320 }, { reserva_id: t2, monto: 35 }], [tm()]);
  comprobar(tj.ok, `un solo voucher por $355 para las dos cuentas (${tj.mensaje || "ok"})`);
  const gT = tj.cuerpo?.grupo_id;
  const { data: filasT } = await SB.from("tarjetas_manuales").select("*").eq("grupo_id", gT);
  comprobar(filasT?.length === 1 && cmp(filasT[0].monto, 355) && filasT[0].folio === fol && filasT[0].partes?.length === 2 && filasT[0].estado === "por_revisar", "queda UN registro (un folio, $355, dos partes, por revisar)");
  const dup = await junto(tRec, [{ reserva_id: await cuenta(cli, 50), monto: 50 }, { reserva_id: await cuenta(cli, 50), monto: 50 }], [tm({ monto: 100 })]);
  comprobar(!dup.ok && /ya está registrado/i.test(dup.mensaje), "el mismo folio en un cobro DISTINTO se rechaza");
  const dup1 = await rpc(tRec, "registrar_cobro", { p_reserva_id: await cuenta(cli, 50), p_notas: "x", p_metodos: [{ metodo: "tarjeta_manual", monto: 50, folio: fol, motivo: "sin_senal" }] });
  comprobar(!dup1.ok && /ya está registrado/i.test(dup1.mensaje), "y también en un cobro de una sola cuenta");
  const sinPerm = await junto(tRecSin, [{ reserva_id: await cuenta(cli, 50), monto: 50 }, { reserva_id: await cuenta(cli, 50), monto: 50 }], [tm({ monto: 100, folio: folio() })]);
  comprobar(!sinPerm.ok && /permiso/i.test(sinPerm.mensaje), "sin el permiso «Registrar tarjeta manual» no se registra");
  const revisar = await rpc(tAdmin, "tarjeta_manual_revisar", { p_tarjeta_id: filasT[0].id, p_nota: "voucher a la vista" });
  comprobar(revisar.ok, "«Revisado con voucher» opera sobre el registro del grupo");
  const porRev = (await rpc(tAdmin, "tarjetas_manuales_por_revisar", { p_historial: true })).cuerpo ?? [];
  const filaRev = porRev.find((x) => x.id === filasT[0].id);
  comprobar(filaRev && cmp(filaRev.monto, 355) && filaRev.cuentas === 2 && filaRev.grupo_id === gT, "la lista de revisión trae el registro con su total y «2 cuentas»");

  // No recibida sobre un grupo: deshace el reparto en todas las cuentas.
  const n1 = await cuenta(cli, 200);
  const n2 = await cuenta(cli, 150);
  const folN = folio("NOREC");
  const nr = await junto(tRec, [{ reserva_id: n1, monto: 200 }, { reserva_id: n2, monto: 150 }], [tm({ monto: 350, folio: folN })]);
  const tN = (await SB.from("tarjetas_manuales").select("id").eq("grupo_id", nr.cuerpo?.grupo_id).single()).data;
  comprobar(cmp(await saldo(n1), 0) && cmp(await saldo(n2), 0), "antes de marcarla, las dos cuentas están pagadas");
  const marca = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tN.id, p_motivo: "El voucher no existe en el banco" });
  comprobar(marca.ok, `«Marcar como no recibida» sobre el grupo (${marca.mensaje || "ok"})`);
  comprobar(cmp(await saldo(n1), 200) && cmp(await saldo(n2), 150), "las DOS cuentas vuelven a deber lo suyo (200 y 150)");
  comprobar((marca.cuerpo?.devoluciones ?? []).length === 2, "una devolución por cuenta, cada una por lo que esa cuenta recibió");
  const evN = (await SB.from("cobros_grupo_eventos").select("tipo").eq("grupo_id", nr.cuerpo.grupo_id)).data ?? [];
  comprobar(evN.some((e) => e.tipo === "no_recibido") && evN.some((e) => e.tipo === "registrado"), "el grupo deja «registrado» y «no_recibido» en su bitácora");
  const otra2 = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tN.id, p_motivo: "otra vez" });
  comprobar(!otra2.ok, "no se marca dos veces");
  const folN2 = folio("NOREC");
  const nrReuso = await junto(tRec, [{ reserva_id: n1, monto: 200 }, { reserva_id: n2, monto: 150 }], [tm({ monto: 350, folio: folN })]);
  comprobar(nrReuso.ok, "el folio de una «no recibida» se puede volver a usar");
  void folN2;
  // Reglas: con propina no; con devoluciones no.
  const pp1 = await cuenta(cli, 100);
  const pp2 = await cuenta(cli, 100);
  const conProp = await junto(tRec, [{ reserva_id: pp1, monto: 100 }, { reserva_id: pp2, monto: 100 }], [tm({ monto: 200, propina: 20, folio: folio() })]);
  const tProp = (await SB.from("tarjetas_manuales").select("id").eq("grupo_id", conProp.cuerpo?.grupo_id).single()).data;
  const rProp = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tProp.id, p_motivo: "con propina" });
  comprobar(!rProp.ok && /propina/i.test(rProp.mensaje), "con propina no se marca como no recibida");
  const dv1 = await cuenta(cli, 100);
  const dv2 = await cuenta(cli, 100);
  const conDev = await junto(tRec, [{ reserva_id: dv1, monto: 100 }, { reserva_id: dv2, monto: 100 }], [tm({ monto: 200, folio: folio() })]);
  const tDev = (await SB.from("tarjetas_manuales").select("id").eq("grupo_id", conDev.cuerpo?.grupo_id).single()).data;
  const cobrosDev = await cobrosDe(conDev.cuerpo?.grupo_id);

  // ── 5. Devolución sobre una cuenta del grupo ──
  console.log("── 5. Devolución sobre una cuenta del grupo");
  const masDeLoRecibido = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cobrosDev[0].id, p_motivo: "de más", p_metodos: [{ metodo: "tarjeta_manual", monto: 150 }] });
  comprobar(!masDeLoRecibido.ok, "no se devuelve más de lo que ESA cuenta recibió del pago agrupado (150 > 100)");
  const devOk = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cobrosDev[0].id, p_motivo: "Cancelaron el servicio", p_metodos: [{ metodo: "tarjeta_manual", monto: 40 }] });
  comprobar(devOk.ok && cmp(await saldo(dv1), 40) && cmp(await saldo(dv2), 0), "devolver $40 a UNA cuenta: solo esa vuelve a deber, la otra no se toca");
  const rDev = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tDev.id, p_motivo: "con devolución" });
  comprobar(!rDev.ok && /devoluciones/i.test(rDev.mensaje), "con devoluciones no se marca como no recibida (regla conservada en el grupo)");

  // ── 4. Rechazos ──
  console.log("── 4. Rechazos");
  const x1 = await cuenta(cli, 100);
  const o1 = await cuenta(otra, 100);
  const mezcla = await junto(tRec, [{ reserva_id: x1, monto: 100 }, { reserva_id: o1, monto: 100 }], [{ metodo: "efectivo", monto: 200 }]);
  comprobar(!mezcla.ok && /misma persona/i.test(mezcla.mensaje), `clientas distintas: rechazado («${mezcla.mensaje.slice(0, 70)}»)`);
  const x2 = await cuenta(cli, 100);
  const pub = (await rpc(tRec, "crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ concepto: "x", precio: 10, cantidad: 1 }], p_notas: "x" })).cuerpo;
  const pub2 = (await rpc(tRec, "crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ concepto: "y", precio: 10, cantidad: 1 }], p_notas: "x" })).cuerpo;
  const rPub = await junto(tRec, [{ reserva_id: pub, monto: 10 }, { reserva_id: pub2, monto: 10 }], [{ metodo: "efectivo", monto: 20 }]);
  comprobar(!rPub.ok && /Público en general/i.test(rPub.mensaje), "«Público en general» no se agrupa");
  const una = await junto(tRec, [{ reserva_id: x1, monto: 100 }], [{ metodo: "efectivo", monto: 100 }]);
  comprobar(!una.ok && /al menos dos/i.test(una.mensaje), "una sola cuenta no es un grupo");
  const repetida = await junto(tRec, [{ reserva_id: x1, monto: 50 }, { reserva_id: x1, monto: 50 }], [{ metodo: "efectivo", monto: 100 }]);
  comprobar(!repetida.ok && /dos veces/i.test(repetida.mensaje), "una cuenta repetida se rechaza");
  const noCuadra = await junto(tRec, [{ reserva_id: x1, monto: 100 }, { reserva_id: x2, monto: 100 }], [{ metodo: "efectivo", monto: 150 }]);
  comprobar(!noCuadra.ok && /no coincide/i.test(noCuadra.mensaje), "lo pagado tiene que cuadrar con lo repartido");
  const ludoRes = (await A.from("reservas").select("id").eq("negocio_id", LUDOGTEKA).is("deleted_at", null).limit(1).single()).data.id;
  const deOtroNegocio = await junto(tRec, [{ reserva_id: x1, monto: 100 }, { reserva_id: ludoRes, monto: 100 }], [{ metodo: "efectivo", monto: 200 }]);
  comprobar(!deOtroNegocio.ok && /no existe en este negocio/i.test(deOtroNegocio.mensaje), "una cuenta de OTRO negocio se rechaza");
  comprobar(cmp(await saldo(x1), 100), "y la cuenta buena no se tocó");
  const deMetodo = await junto(tRec, [{ reserva_id: x1, monto: 100 }, { reserva_id: x2, monto: 100 }], [{ metodo: "cheque", monto: 200 }]);
  comprobar(!deMetodo.ok && /Método de pago inválido/.test(deMetodo.mensaje), "un método que no existe se rechaza");
  for (const [quien, tok] of [["estética", tEstetica], ["el cliente", tCliente], ["la llave anónima", null]]) {
    const r = await junto(tok, [{ reserva_id: x1, monto: 100 }, { reserva_id: x2, monto: 100 }], [{ metodo: "efectivo", monto: 200 }]);
    comprobar(!r.ok, `${quien} no cobra`);
  }
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "mercadopago" });
  const termA = await junto(tRec, [{ reserva_id: x1, monto: 100 }, { reserva_id: x2, monto: 100 }], [{ metodo: "terminal", monto: 200 }]);
  comprobar(!termA.ok && /terminal conectada/i.test(termA.mensaje), "«Terminal» a mano sigue bloqueada con Mercado Pago elegido");
  const tarjConProv = await junto(tRec, [{ reserva_id: x1, monto: 100 }, { reserva_id: x2, monto: 100 }], [tm({ monto: 200, folio: folio() })]);
  comprobar(tarjConProv.ok, "pero la tarjeta manual sí (con folio)");
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "manual" });

  // ── 6. Orden integrada de grupo ──
  console.log("── 6. Orden integrada: UNA orden, se reparte al verificarse");
  const m1c = await cuenta(cli, 320, "Baño rapado");
  const m2c = await cuenta(cli, 35, "Guardería 1 hr");
  const nuevaOrden = async (cuentas, extra = {}) => {
    const total = cuentas.reduce((a, c) => a + c.monto, 0);
    const r = await SB.from("mp_ordenes").insert({
      tipo: "point", reserva_id: cuentas[0].reserva_id, monto: total, descripcion: "Cobro junto de prueba", estado: "en_terminal",
      mp_order_id: `GRP-${sufijo}-${++n}`, terminal_id: "PRUEBA", proveedor: "mercadopago", simulado: false,
      grupo_cuentas: cuentas, grupo_cliente_id: cli, ...extra,
    }).select("*").single();
    if (r.error) throw new Error(`orden de prueba: ${r.error.message}`);
    return r.data;
  };
  const orden = await nuevaOrden([{ reserva_id: m1c, monto: 320 }, { reserva_id: m2c, monto: 35 }]);
  const abiertas = (await rpc(tRec, "ordenes_abiertas_de_reservas", { p_reservas: [m1c, m2c] })).cuerpo ?? [];
  comprobar(abiertas.length === 2 && abiertas.every((o) => o.id === orden.id), "las dos cuentas figuran con la MISMA orden abierta (no hay órdenes duplicadas por cuenta)");
  const malMonto = await SB.rpc("registrar_pago_mercadopago", { p_orden_id: orden.id, p_mp_payment_id: `PAGO-${sufijo}-1`, p_monto: 300, p_installments: 1, p_mp_payment_type: "credit_card", p_evento: { verificacion: "aprobado" } });
  comprobar(Boolean(malMonto.error), "un monto distinto al de la orden no se registra");
  const sinVerif = await SB.rpc("registrar_pago_mercadopago", { p_orden_id: orden.id, p_mp_payment_id: `PAGO-${sufijo}-1`, p_monto: 355, p_installments: 1, p_mp_payment_type: "credit_card", p_evento: {} });
  comprobar(Boolean(sinVerif.error), "sin verificación contra el proveedor tampoco");
  const pago = await SB.rpc("registrar_pago_mercadopago", { p_orden_id: orden.id, p_mp_payment_id: `PAGO-${sufijo}-1`, p_monto: 355, p_installments: 1, p_mp_payment_type: "credit_card", p_evento: { verificacion: "aprobado" } });
  comprobar(!pago.error && pago.data?.registrado, `verificada: se registra (${pago.error?.message ?? "ok"})`);
  const ordenDespues = (await SB.from("mp_ordenes").select("grupo_id, cobro_id, estado").eq("id", orden.id).single()).data;
  const cobrosO = await cobrosDe(ordenDespues.grupo_id);
  comprobar(cobrosO.length === 2 && cobrosO.every((c) => c.origen === "mercadopago_point") && ordenDespues.estado === "pagada", "una orden → un grupo con un cobro por cuenta (origen mercadopago_point)");
  comprobar(cmp(await saldo(m1c), 0) && cmp(await saldo(m2c), 0), "las dos cuentas quedan pagadas con la misma orden");
  const mo = await Promise.all(cobrosO.map((c) => metodosDe(c.id)));
  comprobar(mo.every((m) => m[0]?.metodo === "terminal") && cmp(mo[0][0].monto, 320) && cmp(mo[1][0].monto, 35), "cada cuenta recibe su parte por «terminal»");
  const otraVez = await SB.rpc("registrar_pago_mercadopago", { p_orden_id: orden.id, p_mp_payment_id: `PAGO-${sufijo}-1`, p_monto: 355, p_installments: 1, p_mp_payment_type: "credit_card", p_evento: { verificacion: "aprobado" } });
  comprobar(!otraVez.error && otraVez.data?.repetido && (await cobrosDe(ordenDespues.grupo_id)).length === 2, "es idempotente: repetir el aviso no duplica nada");
  const noRecInt = await SB.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobrosO[0].id, p_motivo: "intento", p_actor: datos.adminB, p_evidencia: { mp_sin_pago_aprobado: "true" } });
  comprobar(Boolean(noRecInt.error), "un cobro integrado no se marca «no recibido» (se devuelve con el proveedor)");
  const rem = await rpc(tAdmin, "preparar_reembolso", { p_cobro_id: cobrosO[1].id, p_monto: 35, p_motivo: "Cancelaron la guardería" });
  comprobar(rem.ok && rem.cuerpo?.orden_id === orden.id, `reembolso de UNA cuenta del grupo (la guardería $35) sobre la orden del grupo (${rem.mensaje || "ok"})`);
  const remMas = await rpc(tAdmin, "preparar_reembolso", { p_cobro_id: cobrosO[1].id, p_monto: 100, p_motivo: "de más" });
  comprobar(!remMas.ok, "no se reembolsa a una cuenta más de lo que recibió (o con otro reembolso en espera)");
  // La orden de otro grupo no se liga a cuentas de otra clienta.
  const cuentaOtra = await cuenta(otra, 40);
  const ordenMala = await nuevaOrden([{ reserva_id: x1, monto: 100 }, { reserva_id: cuentaOtra, monto: 40 }]);
  const pagoMalo = await SB.rpc("registrar_pago_mercadopago", { p_orden_id: ordenMala.id, p_mp_payment_id: `PAGO-${sufijo}-2`, p_monto: 140, p_installments: 1, p_mp_payment_type: "credit_card", p_evento: { verificacion: "aprobado" } });
  comprobar(Boolean(pagoMalo.error), `una orden con cuentas de dos clientas no se reparte («${(pagoMalo.error?.message ?? "").slice(0, 60)}»)`);
  await SB.from("mp_ordenes").update({ estado: "cancelada" }).eq("id", ordenMala.id);

  // ── 7. Caja ──
  console.log("── 7. Turno, corte y reportes");
  const { data: tot } = await SB.rpc("movimientos_turno", { p_turno_id: turno.id });
  const delGrupo = (tot ?? []).filter((m) => m.grupo_id === g1 && m.tipo !== "devolucion");
  comprobar(delGrupo.length === 2 && cmp(delGrupo.reduce((a, m) => a + Number(m.monto), 0), 355), "movimientos_turno trae el grupo (por cuenta) y suma $355 una sola vez");
  const rep = await rpc(tAdmin, "reporte_financiero_periodo", { p_desde: "2020-01-01", p_hasta: "2099-12-31" });
  comprobar(rep.ok, "el reporte financiero sigue calculando con cobros agrupados");

  // ── 8. Centavos ──
  console.log("── 8. Residuo de centavos");
  const { data: cat } = await SB.from("catalogo_descuentos").select("id").is("deleted_at", null).limit(1).single();
  const bl = await cuenta(cli, 490, "Baño estético completo");
  const d53 = await rpc(tAdmin, "aplicar_descuento", { p_reserva_id: bl, p_catalogo_descuento_id: cat.id, p_tipo: "porcentaje", p_valor: 53, p_motivo_adicional: "caso Blacky" });
  const sBl = await saldo(bl);
  comprobar(d53.ok && Number.isInteger(sBl) && sBl === 230, `53 % de $490 deja $${sBl} por pagar (pesos enteros), no $230.30`);
  const fijo = await cuenta(cli, 490, "Baño estético completo");
  await rpc(tAdmin, "aplicar_descuento", { p_reserva_id: fijo, p_catalogo_descuento_id: cat.id, p_tipo: "monto_fijo", p_valor: 259.7, p_motivo_adicional: "monto con centavos" });
  const cobroCent = await rpc(tRec, "registrar_cobro", { p_reserva_id: fijo, p_notas: "x", p_metodos: [{ metodo: "efectivo", monto: 230 }] });
  comprobar(!cobroCent.ok && /menos de un peso/i.test(cobroCent.mensaje), "cobrar $230 de una cuenta de $230.30 se rechaza en lugar de dejar $0.30 para siempre");
  comprobar(cmp(await saldo(fijo), 230.3), "y la cuenta queda intacta");
  const exacto = await rpc(tRec, "registrar_cobro", { p_reserva_id: fijo, p_notas: "x", p_metodos: [{ metodo: "efectivo", monto: 230.3 }] });
  comprobar(exacto.ok && cmp(await saldo(fijo), 0), "cobrar los $230.30 exactos sí cierra la cuenta");
  // Residuo ya existente (como el de producción): lo encuentra y lo corrige la plataforma.
  const residuo = await cuenta(cli, 490, "Baño estético completo (residuo)");
  await rpc(tAdmin, "aplicar_descuento", { p_reserva_id: residuo, p_catalogo_descuento_id: cat.id, p_tipo: "monto_fijo", p_valor: 259.7, p_motivo_adicional: "monto con centavos" });
  const turnoId = (await turnoAbierto()).id;
  const insC = await SB.from("cobros").insert({ reserva_id: residuo, turno_id: turnoId, notas: "residuo de prueba" }).select("id").single();
  await SB.from("cobro_metodos").insert({ cobro_id: insC.data.id, metodo: "efectivo", monto: 230, propina: 0 });
  comprobar(cmp(await saldo(residuo), 0.3), "(prepara una cuenta con $0.30 de saldo, como la de producción)");
  const sinPermisoPlat = await rpc(tAdmin, "plataforma_saldos_centavos", { p_negocio_id: B });
  comprobar(!sinPermisoPlat.ok, "un admin de negocio no usa las funciones de la plataforma");
  const hallados = await SB.rpc("plataforma_saldos_centavos", { p_negocio_id: B });
  comprobar(!hallados.error && (hallados.data ?? []).some((f) => f.reserva_id === residuo && cmp(f.saldo, 0.3)), "la revisión de plataforma encuentra la cuenta con $0.30");
  const corr = await SB.rpc("plataforma_corregir_saldos_centavos", { p_negocio_id: B, p_reservas: [residuo], p_motivo: "prueba de corrección de centavos" });
  comprobar(!corr.error && corr.data?.cuentas?.length === 1 && cmp(await saldo(residuo), 0), `la corrección deja la cuenta en cero (${corr.error?.message ?? "ok"})`);
  const { data: evP } = await SB.from("plataforma_eventos").select("id, accion, detalle").is("negocio_id", null).eq("id", corr.data?.evento_id).single();
  comprobar(evP?.accion === "corregir_saldos_centavos" && evP.detalle?.cuentas?.[0]?.reserva_id === residuo, "queda el evento de auditoría con lo que corrigió");
  const rev = await SB.rpc("plataforma_revertir_saldos_centavos", { p_evento_id: corr.data.evento_id });
  comprobar(!rev.error && cmp(await saldo(residuo), 0.3), "la reversa devuelve la cuenta a como estaba ($0.30)");
  const rev2 = await SB.rpc("plataforma_revertir_saldos_centavos", { p_evento_id: corr.data.evento_id });
  comprobar(Boolean(rev2.error), "y no se revierte dos veces");
  await SB.rpc("plataforma_corregir_saldos_centavos", { p_negocio_id: B, p_reservas: [residuo], p_motivo: "limpieza de la prueba" });

  // Ninguna cuenta de esta prueba quedó con centavos.
  const { data: restos } = await SB.rpc("plataforma_saldos_centavos", { p_negocio_id: B });
  comprobar((restos ?? []).length === 0, "ninguna cuenta del negocio queda con un saldo de menos de un peso");

  // ── 7b. Turno cerrado ──
  console.log("── 7b. Turno cerrado");
  const viejo = (await turnoAbierto()).id;
  const cierre = await rpc(tAdmin, "cerrar_turno", { p_turno_id: viejo, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: "prueba de cobro agrupado", p_notas_cierre: "prueba" });
  comprobar(cierre.ok, `se cierra el turno (${cierre.mensaje || "ok"})`);
  const cerrado = await junto(tRec, [{ reserva_id: x1, monto: 100 }, { reserva_id: x2, monto: 100 }], [{ metodo: "efectivo", monto: 200 }]);
  comprobar(!cerrado.ok && /turno de caja abierto/i.test(cerrado.mensaje), "sin turno abierto no se cobra junto");
  const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba cobro agrupado" }) });
  comprobar(Boolean(t.cuerpo?.[0]?.id), "y al abrir otro vuelve a funcionar");

  // ── 9. Aislamiento y frontera ──
  console.log("── 9. Aislamiento");
  for (const tabla of ["cobros_grupo", "cobros_grupo_eventos"]) {
    const c = await get(tCliente, `${tabla}?select=id`);
    comprobar(!c.ok || (c.cuerpo ?? []).length === 0, `el cliente no lee ${tabla}`);
    const a = await get(null, `${tabla}?select=id`);
    comprobar(!a.ok || (a.cuerpo ?? []).length === 0, `la llave anónima no lee ${tabla}`);
    const e = await get(tEstetica, `${tabla}?select=id`);
    comprobar(!e.ok || (e.cuerpo ?? []).length === 0, `estética no lee ${tabla}`);
    const l = await get(tLudo, `${tabla}?select=id`, LUDOGTEKA);
    comprobar(l.ok && (l.cuerpo ?? []).length === 0, `Ludogteka no ve ${tabla} de Huellitas`);
    const w = await llamar(`${URL}/rest/v1/${tabla}`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ negocio_id: B }) });
    comprobar(!w.ok, `recepción no escribe ${tabla} directo`);
  }
  for (const [fn, args] of [["cobro_grupo_detalle", { p_grupo_id: g1 }], ["cobro_grupos_de_reserva", { p_reserva_id: a1 }]]) {
    const c = await rpc(tCliente, fn, args);
    comprobar(!c.ok || c.cuerpo === null || (Array.isArray(c.cuerpo) && c.cuerpo.length === 0), `el cliente no obtiene nada de ${fn}`);
    const e = await rpc(tEstetica, fn, args);
    comprobar(!e.ok || e.cuerpo === null || (Array.isArray(e.cuerpo) && e.cuerpo.length === 0), `estética no obtiene nada de ${fn}`);
    const an = await rpc(null, fn, args);
    comprobar(!an.ok, `la llave anónima no ejecuta ${fn}`);
    const lu = await rpc(tLudo, fn, args, LUDOGTEKA);
    comprobar(!lu.ok || lu.cuerpo === null || (Array.isArray(lu.cuerpo) && lu.cuerpo.length === 0), `un admin de Ludogteka no ve el grupo de Huellitas por ${fn}`);
  }
  for (const [fn, args] of [["cobro_grupo_aplicar", { p_cliente_id: cli, p_turno_id: viejo, p_partes: [], p_metodos: [], p_notas: "x", p_origen: "manual", p_actor: datos.adminB, p_manual: true, p_orden_id: null }]]) {
    const r = await rpc(tAdmin, fn, args);
    comprobar(!r.ok, `${fn} (interna) no la ejecuta nadie con sesión`);
    const an = await rpc(null, fn, args);
    comprobar(!an.ok, `${fn} (interna) no la ejecuta la llave anónima`);
  }
  const { data: fr } = await SB.rpc("auditoria_frontera");
  comprobar((fr ?? []).length === 0, "auditoria_frontera() vacía");
} finally {
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "manual" });
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });
}

console.log(`\n${hallazgos.length ? `✘ ${hallazgos.length} hallazgo(s)` : "✔ cobro agrupado: sin hallazgos"}`);
process.exit(hallazgos.length ? 1 : 0);
