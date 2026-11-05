// Pases y saldos a favor fantasma (SOLO DESARROLLO, en Huellitas; nunca Ludogteka). Migración 20261203004200.
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/pases-no-llego-dev.mjs
//
// 1. Una estancia cubierta con pase que se marca «No llegó» devuelve su día (como cancelar): el saldo del pase sube, queda
//    la fila «devolucion» en el libro y la cuenta queda en $0 (no −$350 «a favor»); «Necesita atención» no la lista.
// 2. Cancelar sigue devolviendo el día (regresión).
// 3. Una corrección de precio muere con su línea: al cancelar la cita, la corrección queda anulada con motivo y la cuenta
//    no se queda con «Corrección de precio: −$60» → saldo a favor. Igual al marcar «no llegó» una estancia con corrección.
// 4. cuenta_linea_viva / cuenta_lineas_reserva: una corrección cuya línea está cancelada no suma aunque siga sin anular.
// 5. Nada de esto crea ni borra cobros, devoluciones ni movimientos de caja.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { CONFIRMA_FUERA_HORARIO } from "../lib/fuera-horario.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
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
const rpc = (token, fn, args = {}) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token), body: JSON.stringify(args) });
const tAdmin = await tokenDe(datos.adminB);
const tRec = await tokenDe(datos.recepcionB);
const hoy = (await rpc(tAdmin, "fecha_negocio")).cuerpo;
const suma = (dias) => new Date(new Date(`${hoy}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const MARCA = `pases-no-llego-${String(Date.now()).slice(-6)}`;
void A;

// Catálogo: guardería de día, pase de 10 días (el mismo de ajuste-pases-dev), estética.
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
const { data: estetica } = await SB.from("servicios").select("id, nombre").eq("negocio_id", B).eq("categoria", "estetica").is("deleted_at", null).order("orden").limit(1).maybeSingle();
let turno = (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;
if (!turno) turno = (await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: MARCA }) })).cuerpo?.[0];
comprobar(Boolean(turno?.id), "hay un turno abierto (para vender el pase)");

let nPerro = 0;
// Con talla y pelaje: el precio de estética de Huellitas depende de ellos.
const { data: talla } = await SB.from("tamanos_categoria").select("id").order("orden", { ascending: true }).limit(1).maybeSingle();
const { data: pelaje } = await SB.from("tipos_pelaje").select("id").limit(1).maybeSingle();
const nuevoPerro = async () => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `NoLlego ${MARCA} ${++nPerro}`, tamano_id: talla?.id ?? null, pelaje_id: pelaje?.id ?? null }).select("id, nombre, cliente_id").single();
  if (r.error) throw new Error(`perro de prueba: ${r.error.message}`);
  return r.data;
};
async function crearEstancia(perro) {
  const reserva = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: perro.cliente_id }) });
  const rid = reserva.cuerpo?.[0]?.id;
  if (!rid) throw new Error(`reserva: ${reserva.mensaje}`);
  let ultimo = null;
  for (let d = 0; d <= 20; d++) {
    const e = await llamar(`${URL}/rest/v1/estancias`, {
      method: "POST", headers: cab(tAdmin),
      body: JSON.stringify({ reserva_id: rid, perro_id: perro.id, servicio_id: guarderiaDia.id, fecha_entrada: suma(d), fecha_salida: suma(d + 1), estado: "reservada", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: `Prueba ${MARCA}`, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: `Prueba ${MARCA}` }),
    });
    const id = e.cuerpo?.[0]?.id;
    if (id) return { id, rid, dia: suma(d) };
    ultimo = e.mensaje;
    if (!/cupo|cerrad|no abre|d[ií]a/i.test(String(ultimo))) break;
  }
  throw new Error(`estancia: ${ultimo}`);
}
const totales = async (rid) => { const r = await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: rid }); return Array.isArray(r.cuerpo) ? r.cuerpo[0] : r.cuerpo; };
const pase = async (id) => (await SB.from("bonos_clientes").select("cantidad_disponible").eq("id", id).single()).data;
const movs = async (itemId) => (await SB.from("movimientos_bono").select("tipo, cantidad, motivo").eq("item_id", itemId).order("created_at")).data ?? [];
const aFavor = async () => ((await rpc(tAdmin, "cuentas_saldo_a_favor", { p_dias: 60 })).cuerpo ?? []).map((c) => c.reserva_id);
const foto = async () => {
  const [cobros, devs, mov] = await Promise.all([
    SB.from("cobros").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("devoluciones").select("id", { count: "exact", head: true }).eq("negocio_id", B),
    SB.from("movimientos_caja").select("id", { count: "exact", head: true }).eq("negocio_id", B),
  ]);
  return `${cobros.count}/${devs.count}/${mov.count}`;
};
const creadas = [];

try {
  console.log("── 1. «No llegó» devuelve el día del pase y la cuenta no queda a favor");
  const perro1 = await nuevoPerro();
  const venta = await rpc(tRec, "comprar_bono", { p_perro_id: perro1.id, p_servicio_id: catalogo.id, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: 800, propina: 0 }] });
  if (!venta.ok) throw new Error(`comprar_bono: ${venta.mensaje}`);
  const bonoId = venta.cuerpo;
  const antesCaja = await foto();
  const e1 = await crearEstancia(perro1);
  creadas.push(e1);
  const ap = await rpc(tRec, "aplicar_bono_a_estancia", { p_estancia_id: e1.id });
  comprobar(ap.ok && ap.cuerpo?.aplicado === true && ap.cuerpo?.restantes === 9, `la estancia queda cubierta con el pase (quedan ${ap.cuerpo?.restantes})`);
  const t0 = await totales(e1.rid);
  comprobar(Math.abs(Number(t0.saldo)) < 0.005 && Number(t0.total_bono) > 0, `cuenta con pase: total ${t0.total_cuenta}, pase ${t0.total_bono}, saldo ${t0.saldo}`);
  const noLlego = await llamar(`${URL}/rest/v1/estancias?id=eq.${e1.id}`, { method: "PATCH", headers: cab(tRec), body: JSON.stringify({ estado: "no_llego" }) });
  comprobar(noLlego.ok && noLlego.cuerpo?.[0]?.estado === "no_llego", `recepción la marca «no llegó» (${noLlego.mensaje || "ok"})`);
  comprobar((await pase(bonoId)).cantidad_disponible === 10, "el día regresó al pase (10 de 10)");
  const m1 = await movs(e1.id);
  comprobar(m1.length === 2 && m1[1].tipo === "devolucion" && /no llegó/.test(m1[1].motivo ?? ""), `queda la devolución en el libro con motivo («${m1[1]?.motivo}»)`);
  const t1 = await totales(e1.rid);
  comprobar(Number(t1.total_cuenta) === 0 && Number(t1.total_bono) === 0 && Math.abs(Number(t1.saldo)) < 0.005, `la cuenta queda en cero (total ${t1.total_cuenta}, pase ${t1.total_bono}, saldo ${t1.saldo}), no «a favor»`);
  comprobar(!(await aFavor()).includes(e1.rid), "«Necesita atención» no la lista como saldo a favor");
  comprobar((await foto()) === antesCaja, "no se crearon cobros, devoluciones ni movimientos de caja");

  console.log("── 2. Cancelar sigue devolviendo el día");
  const e2 = await crearEstancia(perro1);
  creadas.push(e2);
  const ap2 = await rpc(tRec, "aplicar_bono_a_estancia", { p_estancia_id: e2.id });
  comprobar(ap2.ok && ap2.cuerpo?.aplicado === true, "otra estancia con el pase");
  const canc = await llamar(`${URL}/rest/v1/estancias?id=eq.${e2.id}`, { method: "PATCH", headers: cab(tRec), body: JSON.stringify({ estado: "cancelada", motivo_cancelacion: MARCA }) });
  comprobar(canc.ok && (await pase(bonoId)).cantidad_disponible === 10, "cancelar devuelve el día (10 de 10)");

  console.log("── 3. La corrección de precio muere con su línea");
  if (!estetica) {
    hallazgo("Huellitas no tiene servicio de estética para la prueba de la cita");
  } else {
    const perro3 = await nuevoPerro();
    const r3 = await SB.from("reservas").insert({ negocio_id: B, cliente_id: perro3.cliente_id }).select("id").single();
    const inicio = new Date(`${suma(1)}T16:00:00Z`).toISOString();
    const c3 = await SB.from("citas_estetica").insert({ negocio_id: B, reserva_id: r3.data.id, perro_id: perro3.id, servicio_id: estetica.id, inicio, precio: 450, precio_base: 450, servicio_nombre: estetica.nombre }).select("id, precio").single();
    if (c3.error) {
      hallazgo(`no se pudo crear la cita de prueba: ${c3.error.message}`);
    } else {
      const tc0 = await totales(r3.data.id);
      const precioLinea = Number(tc0.total_cuenta);
      const corr = await rpc(tAdmin, "corregir_precio_cuenta", { p_reserva_id: r3.data.id, p_linea_tipo: "estetica", p_linea_id: c3.data.id, p_precio_nuevo: Math.max(1, precioLinea - 60), p_motivo: `Se cobra como poodle (${MARCA})` });
      comprobar(corr.ok && Math.abs(Number(corr.cuerpo?.diferencia) + 60) < 0.005, `corrección de −$60 sobre la cita (${corr.mensaje || "ok"})`);
      const ajusteId = corr.cuerpo?.ajuste_id;
      const cancelar = await rpc(tAdmin, "cancelar_cita_estetica", { p_cita_id: c3.data.id, p_motivo: `Se reagenda en otra cuenta (${MARCA})`, p_no_llego: false });
      comprobar(cancelar.ok, `la cita se cancela (${cancelar.mensaje || "ok"})`);
      const aj = (await SB.from("cuenta_ajustes_precio").select("deleted_at, anulada_motivo, anulada_por").eq("id", ajusteId).single()).data;
      comprobar(Boolean(aj?.deleted_at) && /se canceló/.test(aj?.anulada_motivo ?? "") && aj?.anulada_por === datos.adminB, `la corrección quedó anulada con motivo y quién («${aj?.anulada_motivo?.slice(0, 60)}»)`);
      const tc1 = await totales(r3.data.id);
      comprobar(Number(tc1.total_cuenta) === 0 && Math.abs(Number(tc1.saldo)) < 0.005, `la cuenta queda en cero (total ${tc1.total_cuenta}, saldo ${tc1.saldo}), no −$60 «a favor»`);
      comprobar(!(await aFavor()).includes(r3.data.id), "«Necesita atención» no la lista");
      // Lo mismo con una estancia suelta corregida y marcada «no llegó».
      const e4 = await crearEstancia(perro3);
      creadas.push(e4);
      const te0 = await totales(e4.rid);
      const corrE = await rpc(tAdmin, "corregir_precio_cuenta", { p_reserva_id: e4.rid, p_linea_tipo: "estancia", p_linea_id: e4.id, p_precio_nuevo: Number(te0.total_cuenta) + 90, p_motivo: `Talla grande (${MARCA})` });
      comprobar(corrE.ok, `corrección de +$90 sobre la estancia (${corrE.mensaje || "ok"})`);
      const nl = await llamar(`${URL}/rest/v1/estancias?id=eq.${e4.id}`, { method: "PATCH", headers: cab(tRec), body: JSON.stringify({ estado: "no_llego" }) });
      const ajE = (await SB.from("cuenta_ajustes_precio").select("deleted_at, anulada_motivo").eq("id", corrE.cuerpo?.ajuste_id).single()).data;
      const te1 = await totales(e4.rid);
      comprobar(nl.ok && Boolean(ajE?.deleted_at) && /no llegó/.test(ajE?.anulada_motivo ?? "") && Number(te1.total_cuenta) === 0, `«no llegó» anula la corrección de la estancia y la cuenta queda en cero (total ${te1.total_cuenta})`);

      console.log("── 4. cuenta_linea_viva: una corrección sin anular de una línea cancelada no suma");
      const huerfana = await SB.from("cuenta_ajustes_precio").insert({ negocio_id: B, reserva_id: r3.data.id, linea_tipo: "estetica", linea_id: c3.data.id, concepto: `Huérfana ${MARCA}`, monto: -60, precio_antes: 450, precio_despues: 390, precio_original: 450, motivo: MARCA, hecha_por: datos.adminB, created_by: datos.adminB }).select("id").single();
      if (huerfana.error) hallazgo(`no se pudo sembrar la corrección huérfana: ${huerfana.error.message}`);
      else {
        const viva = await rpc(tAdmin, "cuenta_linea_viva", { p_linea_tipo: "estetica", p_linea_id: c3.data.id });
        comprobar(viva.ok && viva.cuerpo === false, "cuenta_linea_viva dice que la cita cancelada no está viva");
        const lineas = (await rpc(tAdmin, "cuenta_lineas_reserva", { p_reserva_id: r3.data.id })).cuerpo ?? [];
        comprobar(!lineas.some((l) => l.tipo === "ajuste"), "cuenta_lineas_reserva no la suma");
        await SB.from("cuenta_ajustes_precio").update({ deleted_at: new Date().toISOString(), anulada_motivo: `Prueba ${MARCA}` }).eq("id", huerfana.data.id);
      }
    }
  }
  console.log("── 5. Caja intacta");
  comprobar((await foto()) === antesCaja, "cobros, devoluciones y movimientos de caja: iguales a los de antes de las pruebas (menos la venta del pase)");
} finally {
  // Las estancias de prueba que siguen reservadas se cancelan para no ocupar cupo en Huellitas.
  for (const e of creadas) await SB.from("estancias").update({ estado: "cancelada", motivo_cancelacion: `Prueba ${MARCA}` }).eq("id", e.id).in("estado", ["reservada", "confirmada"]);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ TODO BIEN");
process.exit(hallazgos.length ? 1 : 0);
