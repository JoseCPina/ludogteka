// Recolección a domicilio ligada a la reserva (migración 20261203004100) — SOLO DESARROLLO, en Huellitas, por la API con
// JWT reales (sin navegador). Sale con 1 si algo falla.
//
//   node scripts/auditoria/recoleccion-dev.mjs
//
// Qué prueba: (1) puntos de partida y cotización (distancia guardada del cliente, dirección nueva por coordenada, km a
// mano); (2) guardar en una estancia: la fila, su cargo en cargos_aplicados y en la cuenta de la reserva; (3) la ruta
// del día la ve el personal de Huellitas y NO Ludogteka; (4) mover la estancia mueve la recolección; (5) marcar en
// camino / recogido (recepción sí, el dueño no); (6) cancelar la estancia cancela la recolección y su cargo; (7) el
// dueño cotiza y guarda solo en su cuenta (otra cuenta: 42501) y cancela la suya mientras está pendiente; (8) si se
// puede crear una cita, moverla mueve la recolección y cancelarla la cancela. Deja todo como estaba.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const como = (token, negocio = B) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": negocio } } });

const fallas = [];
const ok = (cond, texto) => { console.log(`${cond ? "  ✔" : "  ✘"} ${texto}`); if (!cond) fallas.push(texto); };
const esPermiso = (e) => e && (e.code === "42501" || /solo el personal|solo el dueño|42501/i.test(e.message ?? ""));
const dia = (d) => d.toISOString().slice(0, 10);
const hoy = new Date();
const entrada = new Date(hoy.getTime() + (60 + Math.floor(Math.random() * 200)) * 86400000);
while ([0, 6].includes(entrada.getUTCDay())) entrada.setUTCDate(entrada.getUTCDate() + 1);
const F1 = dia(entrada), F2 = dia(new Date(entrada.getTime() + 86400000)), F3 = dia(new Date(entrada.getTime() + 3 * 86400000)), F4 = dia(new Date(entrada.getTime() + 4 * 86400000));
const F5 = dia(new Date(entrada.getTime() + 10 * 86400000)), F6 = dia(new Date(entrada.getTime() + 11 * 86400000));

const creado = { reservas: [], estancias: [], citas: [], recolecciones: [], cargos: [], tarifa: null, clienteAntes: null, sucursalAntes: null };
const [ADM, REC] = await Promise.all([tokenDe(datos.adminB), tokenDe(datos.recepcionB)]).then((t) => t.map((x) => como(x)));
const DUENO = como(await tokenDe(datos.cuentaSoloB));
const { data: adminLudo } = await A.from("membresias").select("profile_id").eq("negocio_id", "10000000-0000-4000-8000-000000000001").eq("rol", "admin").is("deleted_at", null).limit(1).single();
const LUDO = como(await tokenDe(adminLudo.profile_id), "10000000-0000-4000-8000-000000000001");

try {
  // ── Datos de prueba (y cómo estaban) ─────────────────────────────────────────────────────────────────────────────
  const { data: servRec } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "recoleccion").is("deleted_at", null).single();
  const { data: tarifas } = await SB.from("tarifas").select("id").eq("servicio_id", servRec.id).is("deleted_at", null);
  if (!(tarifas ?? []).length) {
    const t = await SB.from("tarifas").insert({ negocio_id: B, servicio_id: servRec.id, precio: 12, vigencia_desde: "2026-01-01", cantidad_desde: 1 }).select("id").single();
    if (t.error) throw new Error("tarifa de prueba: " + t.error.message);
    creado.tarifa = t.data.id;
  }
  // Huellitas puede no tener sucursal (ni ubicación): se le pone una de prueba y se deja como estaba al terminar.
  let { data: suc } = await SB.from("sucursales").select("id, lat, lng, direccion").eq("negocio_id", B).is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle();
  if (!suc) {
    const s = await SB.from("sucursales").insert({ negocio_id: B, nombre: "Local de prueba (recolección)", direccion: "Local de prueba 1", lat: 22.1565, lng: -100.9855, activo: true }).select("id, lat, lng, direccion").single();
    if (s.error) throw new Error("sucursal de prueba: " + s.error.message);
    suc = s.data;
    creado.sucursalCreada = suc.id;
  } else {
    creado.sucursalAntes = { id: suc.id, lat: suc.lat, lng: suc.lng, direccion: suc.direccion };
    if (suc.lat == null) await SB.from("sucursales").update({ lat: 22.1565, lng: -100.9855, direccion: suc.direccion ?? "Local de prueba" }).eq("id", suc.id);
  }
  const { data: cli } = await SB.from("clientes").select("id, direccion, direccion_lat, direccion_lng, distancia_base_km, distancia_calculada_at, distancia_ajustada_manualmente").eq("id", datos.clienteSoloB).single();
  creado.clienteAntes = cli;
  await SB.from("clientes").update({ direccion: "Calle de Prueba Recolección 123", direccion_lat: 22.17, direccion_lng: -101.0, distancia_base_km: 4.5 }).eq("id", cli.id);
  const { data: servDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();

  async function reservaConEstancia(f1, f2) {
    // Como admin (su JWT): la excepción sanitaria y de comportamiento la autoriza admin, no el servicio.
    const r = await ADM.from("reservas").insert({ cliente_id: cli.id, notas: "Prueba de recolección" }).select("id").single();
    if (r.error) throw new Error("reserva: " + r.error.message);
    creado.reservas.push(r.data.id);
    const e = await ADM.from("estancias").insert({
      negocio_id: B, reserva_id: r.data.id, perro_id: datos.perroSoloB, servicio_id: servDia.id, fecha_entrada: f1, fecha_salida: f2,
      bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "prueba de recolección", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "prueba de recolección",
    }).select("id").single();
    if (e.error) throw new Error("estancia: " + e.error.message);
    creado.estancias.push(e.data.id);
    return { reservaId: r.data.id, estanciaId: e.data.id };
  }

  // ── 1. Puntos de partida y cotización ────────────────────────────────────────────────────────────────────────────
  console.log("\n── 1. Puntos de partida y cotización");
  const { data: puntos } = await ADM.rpc("recoleccion_puntos_partida");
  ok(puntos?.negocio?.lat != null, `el local está ubicado (${puntos?.negocio?.direccion ?? "—"})`);
  const c1 = await ADM.rpc("recoleccion_cotizar", { p_cliente: cli.id, p_direccion: "Calle de Prueba Recolección 123", p_lat: null, p_lng: null, p_punto: "negocio" });
  ok(!c1.error && c1.data?.origen_km === "guardada" && Number(c1.data?.km) === 4.5, `dirección guardada: usa su distancia (${c1.data?.km} km, ${c1.data?.origen_km}) ${c1.error?.message ?? ""}`);
  ok(Number(c1.data?.precio) === Number(c1.data?.precio_km) * 5, `precio = tarifa por km × km redondeado hacia arriba (${c1.data?.precio_km} × 5 = ${c1.data?.precio})`);
  const c2 = await ADM.rpc("recoleccion_cotizar", { p_cliente: cli.id, p_direccion: "Otra calle 45", p_lat: 22.2, p_lng: -101.05, p_punto: "negocio" });
  ok(!c2.error && c2.data?.origen_km === "calculada" && Number(c2.data?.km) > 0, `dirección nueva con coordenada: km calculados (${c2.data?.km} km)`);
  const c3 = await ADM.rpc("recoleccion_cotizar", { p_cliente: cli.id, p_direccion: "Otra calle 45", p_lat: null, p_lng: null, p_punto: "negocio" });
  ok(!c3.error && c3.data?.km == null && c3.data?.precio_km != null, "dirección nueva sin coordenada: km nulos (a mano) pero con la tarifa por km");
  const cLudo = await LUDO.rpc("recoleccion_cotizar", { p_cliente: cli.id, p_direccion: "x", p_lat: null, p_lng: null, p_punto: "negocio" });
  ok(Boolean(cLudo.error), `Ludogteka no cotiza para un cliente de Huellitas (${cLudo.error?.message?.slice(0, 60) ?? "¡lo dejó!"})`);

  // ── 2. Guardar en una estancia: fila, cargo y cuenta ─────────────────────────────────────────────────────────────
  console.log("\n── 2. Guardar en una estancia");
  const { reservaId, estanciaId } = await reservaConEstancia(F1, F2);
  const g = await REC.rpc("recoleccion_guardar", { p_reserva: reservaId, p_estancia: estanciaId, p_cita: null, p_fecha: null, p_hora: "08:30", p_direccion: "Calle de Prueba Recolección 123", p_lat: 22.17, p_lng: -101.0, p_punto: "negocio", p_km: 4.5, p_notas: "Portón negro", p_guardar_direccion: false });
  ok(!g.error && g.data?.id, `recepción la guarda (${g.error?.message ?? g.data?.id?.slice(0, 8)})`);
  const rec = g.data;
  if (rec?.id) creado.recolecciones.push(rec.id);
  if (rec?.cargo_id) creado.cargos.push(rec.cargo_id);
  ok(rec?.fecha === F1 && rec?.hora_estimada?.startsWith("08:30") && Number(rec?.km) === 4.5, `fecha = la entrada (${rec?.fecha}), hora ${rec?.hora_estimada}, ${rec?.km} km`);
  const { data: cargo } = await SB.from("cargos_aplicados").select("id, estancia_id, reserva_id, cantidad, precio, cancelado, descripcion").eq("id", rec?.cargo_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  ok(cargo && cargo.estancia_id === estanciaId && cargo.cantidad === 5 && !cargo.cancelado, `el cargo está en cargos_aplicados de la estancia (${cargo?.cantidad} km × ${cargo?.precio})`);
  ok(Number(rec?.precio) === Number(cargo?.precio) * Number(cargo?.cantidad), `precio de la recolección = precio del cargo × cantidad (${rec?.precio})`);
  const { data: lineas } = await ADM.rpc("cuenta_lineas_reserva", { p_reserva_id: reservaId });
  ok(JSON.stringify(lineas ?? []).includes("Recolección"), "la cuenta de la reserva lista la línea de recolección");
  const dup = await REC.rpc("recoleccion_guardar", { p_reserva: reservaId, p_estancia: estanciaId, p_cita: null, p_fecha: null, p_hora: null, p_direccion: "Calle de Prueba Recolección 123", p_lat: null, p_lng: null, p_punto: "negocio", p_km: 4.5, p_notas: null, p_guardar_direccion: false });
  ok(Boolean(dup.error), `una segunda recolección viva en la misma estancia se rechaza (${dup.error?.message?.slice(0, 50) ?? "¡la dejó!"})`);

  // ── 3. La ruta del día: Huellitas sí, Ludogteka no ──────────────────────────────────────────────────────────────
  console.log("\n── 3. La ruta del día");
  const { data: diaAdm } = await ADM.rpc("recolecciones_dia", { p_fecha: F1 });
  ok((diaAdm ?? []).some((f) => f.id === rec?.id && f.perro_nombre && f.distancia_recta_km != null), `admin de Huellitas la ve en recolecciones_dia con perro y distancia (${(diaAdm ?? []).find((f) => f.id === rec?.id)?.distancia_recta_km} km en línea recta)`);
  const { data: diaRec } = await REC.rpc("recolecciones_dia", { p_fecha: F1 });
  ok((diaRec ?? []).some((f) => f.id === rec?.id), "recepción de Huellitas también");
  const { data: diaLudo } = await LUDO.rpc("recolecciones_dia", { p_fecha: F1 });
  const { data: selLudo } = await LUDO.from("recolecciones").select("id").eq("id", rec?.id);
  ok(!(diaLudo ?? []).some((f) => f.id === rec?.id) && (selLudo ?? []).length === 0, "Ludogteka no la ve (ni en la función ni en la tabla)");
  const { data: selDueno } = await DUENO.from("recolecciones").select("id").eq("id", rec?.id);
  const { data: misRec } = await DUENO.rpc("mis_recolecciones");
  ok((selDueno ?? []).length === 0 && (misRec ?? []).some((f) => f.id === rec?.id && !("precio" in f)), "el dueño no lee la tabla, pero mis_recolecciones se la da sin precio");

  // ── 4. Mover la estancia mueve la recolección ───────────────────────────────────────────────────────────────────
  console.log("\n── 4. Mover la estancia");
  const mv = await ADM.from("estancias").update({ fecha_entrada: F3, fecha_salida: F4 }).eq("id", estanciaId);
  const { data: movida } = await SB.from("recolecciones").select("fecha, estado").eq("id", rec?.id).single();
  ok(!mv.error && movida?.fecha === F3, `la recolección sigue a la estancia (${movida?.fecha}) ${mv.error?.message ?? ""}`);

  // ── 5. Marcar: recepción sí, el dueño no ────────────────────────────────────────────────────────────────────────
  console.log("\n── 5. Marcar");
  const m1 = await DUENO.rpc("recoleccion_marcar", { p_id: rec?.id, p_estado: "en_camino" });
  ok(esPermiso(m1.error), `el dueño no marca (${m1.error?.message?.slice(0, 50) ?? "¡lo dejó!"})`);
  const m2 = await REC.rpc("recoleccion_marcar", { p_id: rec?.id, p_estado: "en_camino" });
  ok(!m2.error && m2.data?.estado === "en_camino" && m2.data?.salio_at, "recepción: en camino (con la hora de salida)");
  const m3 = await REC.rpc("recoleccion_marcar", { p_id: rec?.id, p_estado: "recogido" });
  ok(!m3.error && m3.data?.estado === "recogido" && m3.data?.recogido_at, "recepción: recogido");

  // ── 6. Cancelar la estancia cancela la recolección y su cargo ───────────────────────────────────────────────────
  console.log("\n── 6. Cancelar la estancia");
  const cx0 = await ADM.from("estancias").update({ estado: "cancelada", motivo_cancelacion: "prueba de recolección" }).eq("id", estanciaId);
  ok(!cx0.error, `la estancia se cancela ${cx0.error?.message ?? ""}`);
  const { data: tras } = await SB.from("recolecciones").select("estado, motivo_cancelacion").eq("id", rec?.id).single();
  const { data: cargoTras } = await SB.from("cargos_aplicados").select("cancelado, motivo_cancelacion").eq("id", rec?.cargo_id).single();
  ok(tras?.estado === "cancelada" && /estancia/i.test(tras?.motivo_cancelacion ?? ""), `recolección cancelada con motivo («${tras?.motivo_cancelacion}»)`);
  ok(cargoTras?.cancelado === true, `su cargo quedó cancelado («${cargoTras?.motivo_cancelacion}»)`);

  // ── 7. El dueño: solo su cuenta ─────────────────────────────────────────────────────────────────────────────────
  console.log("\n── 7. El dueño desde la app");
  const cd = await DUENO.rpc("recoleccion_cotizar", { p_cliente: cli.id, p_direccion: "Calle de Prueba Recolección 123", p_lat: null, p_lng: null, p_punto: "negocio" });
  ok(!cd.error && Number(cd.data?.km) === 4.5, `cotiza para su cuenta (${cd.data?.km} km) ${cd.error?.message ?? ""}`);
  const { data: otroCliente } = await SB.from("clientes").select("id").eq("negocio_id", B).neq("id", cli.id).is("deleted_at", null).limit(1).single();
  const cOtro = await DUENO.rpc("recoleccion_cotizar", { p_cliente: otroCliente.id, p_direccion: "x", p_lat: null, p_lng: null, p_punto: "negocio" });
  ok(esPermiso(cOtro.error), `no cotiza para otra cuenta (${cOtro.error?.message?.slice(0, 50) ?? "¡lo dejó!"})`);
  const segunda = await reservaConEstancia(F5, F6);
  const gd = await DUENO.rpc("recoleccion_guardar", { p_reserva: segunda.reservaId, p_estancia: segunda.estanciaId, p_cita: null, p_fecha: null, p_hora: "09:00", p_direccion: "Calle de Prueba Recolección 123", p_lat: 22.17, p_lng: -101.0, p_punto: "negocio", p_km: 4.5, p_notas: null, p_guardar_direccion: true });
  ok(!gd.error && gd.data?.id, `guarda en su propia reserva (${gd.error?.message ?? "ok"})`);
  if (gd.data?.id) { creado.recolecciones.push(gd.data.id); creado.cargos.push(gd.data.cargo_id); }
  const { data: cliTras } = await SB.from("clientes").select("direccion").eq("id", cli.id).single();
  ok(cliTras?.direccion === "Calle de Prueba Recolección 123", "p_guardar_direccion del dueño no reescribe la ficha (solo el personal)");
  const { data: reservaAjena } = await SB.from("reservas").select("id").eq("negocio_id", B).eq("cliente_id", otroCliente.id).is("deleted_at", null).limit(1).maybeSingle();
  if (reservaAjena) {
    const ga = await DUENO.rpc("recoleccion_guardar", { p_reserva: reservaAjena.id, p_estancia: null, p_cita: null, p_fecha: F1, p_hora: null, p_direccion: "Calle ajena 1", p_lat: null, p_lng: null, p_punto: "negocio", p_km: 2, p_notas: null, p_guardar_direccion: false });
    ok(esPermiso(ga.error), `no guarda en una reserva ajena (${ga.error?.message?.slice(0, 50) ?? "¡lo dejó!"})`);
  }
  const cx = await DUENO.rpc("recoleccion_cancelar", { p_id: gd.data?.id, p_motivo: "ya no la necesito" });
  ok(!cx.error && cx.data?.estado === "cancelada", `cancela la suya mientras está pendiente (${cx.error?.message ?? "ok"})`);
  const { data: cargoDueno } = await SB.from("cargos_aplicados").select("cancelado").eq("id", gd.data?.cargo_id).maybeSingle();
  ok(cargoDueno?.cancelado === true, "y su cargo salió de la cuenta");

  // ── 8. Cita (si se puede crear una): moverla y cancelarla ────────────────────────────────────────────────────────
  console.log("\n── 8. Cita de estética");
  const { data: servEst } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "estetica").is("deleted_at", null).limit(1).maybeSingle();
  const rCita = await ADM.from("reservas").insert({ cliente_id: cli.id, notas: "Prueba de recolección (cita)" }).select("id").single();
  if (rCita.data) creado.reservas.push(rCita.data.id);
  const inicio = `${F1}T16:00:00Z`;
  const cita = servEst && rCita.data ? await ADM.from("citas_estetica").insert({ reserva_id: rCita.data.id, perro_id: datos.perroSoloB, servicio_id: servEst.id, inicio, estado: "reservada" }).select("id, inicio").single() : { error: { message: "sin servicio de estética" } };
  if (cita.error) {
    console.log(`  (cita no probada: ${cita.error.message.slice(0, 90)})`);
  } else {
    creado.citas.push(cita.data.id);
    const gc = await REC.rpc("recoleccion_guardar", { p_reserva: rCita.data.id, p_estancia: null, p_cita: cita.data.id, p_fecha: null, p_hora: null, p_direccion: "Calle de Prueba Recolección 123", p_lat: 22.17, p_lng: -101.0, p_punto: "negocio", p_km: 4.5, p_notas: null, p_guardar_direccion: false });
    ok(!gc.error && gc.data?.cita_id === cita.data.id && gc.data?.fecha === F1, `recolección de la cita: fecha y hora de la cita (${gc.data?.fecha} ${gc.data?.hora_estimada}) ${gc.error?.message ?? ""}`);
    if (gc.data?.id) { creado.recolecciones.push(gc.data.id); creado.cargos.push(gc.data.cargo_id); }
    const { data: cargoCita } = await SB.from("cargos_aplicados").select("estancia_id, reserva_id").eq("id", gc.data?.cargo_id).maybeSingle();
    ok(cargoCita && cargoCita.estancia_id === null && cargoCita.reserva_id === rCita.data.id, "su cargo es un cargo suelto de la cuenta de la cita");
    const mc = await ADM.rpc("reprogramar_cita_estetica", { p_cita_id: cita.data.id, p_inicio: `${F3}T17:00:00Z`, p_motivo: "prueba de recolección" });
    if (mc.error) console.log("  (no se pudo mover la cita:", mc.error.message.slice(0, 80), ")");
    const { data: recCita } = await SB.from("recolecciones").select("fecha, hora_estimada").eq("id", gc.data?.id).single();
    ok(recCita?.fecha === F3, `reprogramar la cita mueve la recolección (${recCita?.fecha} ${recCita?.hora_estimada})`);
    const cc = await ADM.rpc("cancelar_cita_estetica", { p_cita_id: cita.data.id, p_motivo: "prueba de recolección", p_no_llego: false });
    if (cc.error) console.log("  (no se pudo cancelar la cita:", cc.error.message.slice(0, 80), ")");
    const { data: recCita2 } = await SB.from("recolecciones").select("estado").eq("id", gc.data?.id).single();
    ok(recCita2?.estado === "cancelada", "cancelar la cita cancela la recolección");
  }

  // ── Llave anónima pelada ─────────────────────────────────────────────────────────────────────────────────────────
  console.log("\n── Llave anónima pelada");
  const ANON = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
  for (const [fn, args] of [["recoleccion_cotizar", { p_cliente: cli.id, p_direccion: "x", p_lat: null, p_lng: null, p_punto: "negocio" }], ["recolecciones_dia", { p_fecha: F1 }], ["recoleccion_puntos_partida", {}], ["mis_recolecciones", {}]]) {
    const r = await ANON.rpc(fn, args);
    ok(r.error?.code === "42501", `${fn}: ${r.error?.code ?? "¡respondió!"}`);
  }
  const anonSel = await ANON.from("recolecciones").select("id").limit(1);
  ok(Boolean(anonSel.error) || (anonSel.data ?? []).length === 0, "la tabla no se lee con la llave anónima");
} finally {
  // ── Todo como estaba ────────────────────────────────────────────────────────────────────────────────────────────
  const ahora = new Date().toISOString();
  if (creado.recolecciones.length) await SB.from("recolecciones").update({ deleted_at: ahora }).in("id", creado.recolecciones);
  if (creado.cargos.length) await SB.from("cargos_aplicados").update({ deleted_at: ahora }).in("id", creado.cargos.filter(Boolean));
  if (creado.citas.length) await SB.from("citas_estetica").update({ estado: "cancelada", deleted_at: ahora }).in("id", creado.citas);
  if (creado.estancias.length) await SB.from("estancias").update({ estado: "cancelada", deleted_at: ahora }).in("id", creado.estancias);
  if (creado.reservas.length) await SB.from("reservas").update({ deleted_at: ahora }).in("id", creado.reservas);
  if (creado.tarifa) await SB.from("tarifas").delete().eq("id", creado.tarifa);
  if (creado.clienteAntes) { const { id, ...resto } = creado.clienteAntes; await SB.from("clientes").update(resto).eq("id", id); }
  if (creado.sucursalCreada) await SB.from("sucursales").delete().eq("id", creado.sucursalCreada);
  else if (creado.sucursalAntes?.lat == null && creado.sucursalAntes?.id) await SB.from("sucursales").update({ lat: null, lng: null, direccion: creado.sucursalAntes.direccion }).eq("id", creado.sucursalAntes.id);
  console.log("\n  · datos de prueba dados de baja y la ficha del cliente como estaba");
}

console.log(`\n${fallas.length === 0 ? "TODO BIEN" : `FALLAS: ${fallas.length}`}`);
for (const f of fallas) console.log("  -", f);
if (fallas.length) process.exit(1);
