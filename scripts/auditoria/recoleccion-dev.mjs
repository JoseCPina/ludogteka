// Recolección a domicilio ligada a la reserva (migración 20261203004100) — SOLO DESARROLLO, en Huellitas, por la API con
// JWT reales (sin navegador). Sale con 1 si algo falla.
//
//   node scripts/auditoria/recoleccion-dev.mjs
// Con la app compilada y el doble de Google (lo levanta este script en el puerto 4457):
//   GOOGLE_MAPS_API_KEY=de-prueba GOOGLE_API_URL=http://127.0.0.1:4457 npm run start -- -p 3001
//
// Qué prueba: (1) puntos de partida y cotización (distancia guardada del cliente, dirección nueva por coordenada, km a
// mano); (2) guardar en una estancia: la fila, su cargo en cargos_aplicados y en la cuenta de la reserva; (3) la ruta
// del día la ve el personal de Huellitas y NO Ludogteka; (4) mover la estancia mueve la recolección; (5) marcar en
// camino / recogido (recepción sí, el dueño no); (6) cancelar la estancia cancela la recolección y su cargo; (7) el
// dueño cotiza y guarda solo en su cuenta (otra cuenta: 42501) y cancela la suya mientras está pendiente; (8) si se
// puede crear una cita, moverla mueve la recolección y cancelarla la cancela; (9) los km por dirección en la app y el
// panel: dirección guardada, nueva, inválida, muy general, lejana, caché, tope alcanzado, Google caído y km manipulados. Deja todo como estaba.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import http from "node:http";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { cookiesDe } from "./lib/huellitas-navegador.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

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
// Una ventana sin otras estancias del perro de prueba (otras auditorías dejan reservas futuras): mover la estancia no debe chocar.
let entrada;
for (let i = 0; i < 40; i++) {
  entrada = new Date(hoy.getTime() + (60 + Math.floor(Math.random() * 600)) * 86400000);
  while (entrada.getUTCDay() !== 1) entrada.setUTCDate(entrada.getUTCDate() + 1); // lunes: las fechas de la prueba (+1, +3, +4, +10, +11) caen entre semana
  const desde = dia(entrada), hasta = dia(new Date(entrada.getTime() + 12 * 86400000));
  const { count } = await SB.from("estancias").select("id", { count: "exact", head: true }).eq("perro_id", datos.perroSoloB).is("deleted_at", null).lte("fecha_entrada", hasta).gte("fecha_salida", desde);
  if (!count) break;
}
const F1 = dia(entrada), F2 = dia(new Date(entrada.getTime() + 86400000)), F3 = dia(new Date(entrada.getTime() + 3 * 86400000)), F4 = dia(new Date(entrada.getTime() + 4 * 86400000));
const F5 = dia(new Date(entrada.getTime() + 10 * 86400000)), F6 = dia(new Date(entrada.getTime() + 11 * 86400000));

let limpiarDireccion = async () => {};
let topeAntes;
const inicioPrueba = new Date().toISOString();
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
  const argsDueno = { p_reserva: segunda.reservaId, p_estancia: segunda.estanciaId, p_cita: null, p_fecha: null, p_hora: "09:00", p_direccion: "Calle de Prueba Recolección 123", p_lat: 22.17, p_lng: -101.0, p_punto: "negocio", p_km: 4.5, p_notas: null, p_guardar_direccion: true };
  const sinCotizar = await DUENO.rpc("recoleccion_guardar", argsDueno);
  ok(esPermiso(sinCotizar.error), `sin cotizar, el dueño no guarda km que él mandó (${sinCotizar.error?.message?.slice(0, 50) ?? "¡lo dejó!"})`);
  const reg = await SB.rpc("recoleccion_cotizacion_registrar", { p_cliente: cli.id, p_direccion: argsDueno.p_direccion, p_punto: argsDueno.p_punto ?? "negocio", p_lat: 22.111, p_lng: -100.222, p_km: 6.5, p_origen: "ruta" });
  ok(!reg.error, `el servidor registra la cotización ${reg.error?.message ?? ""}`);
  const manipulada = await DUENO.rpc("recoleccion_guardar", { ...argsDueno, p_km: 0.1 });
  ok(esPermiso(manipulada.error), `km manipulados (0.1 contra 6.5 cotizados): se rechaza (${manipulada.error?.message?.slice(0, 50) ?? "¡lo dejó!"})`);
  const gd = await DUENO.rpc("recoleccion_guardar", { ...argsDueno, p_km: 6.5, p_lat: 1, p_lng: 1 });
  ok(!gd.error && Number(gd.data?.lat) === 22.111, `con los km de su cotización sí, y las coordenadas son las cotizadas, no las que mandó (${gd.data?.lat ?? gd.error?.message})`);
  const reusada = await DUENO.rpc("recoleccion_guardar", { ...argsDueno, p_km: 6.5, p_estancia: null, p_fecha: F5 });
  ok(esPermiso(reusada.error), `una cotización no sirve dos veces (${reusada.error?.message?.slice(0, 50) ?? "¡lo dejó!"})`);
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

  // ── 9. Km por dirección: app y panel, con un doble de Google ───────────────────────────
  console.log("\n── 9. Km por dirección (doble de Google)");
  const PUERTO = Number(process.env.PUERTO_APP ?? 3001);
  const HOST_APP = `app.localhost:${PUERTO}`;
  const pedir = (host, ruta, cuerpo, token) => new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: "POST", headers: { host, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (s) => {
      let t = "";
      s.on("data", (d) => (t += d));
      s.on("end", () => { try { res({ status: s.statusCode, json: JSON.parse(t) }); } catch { res({ status: s.statusCode, json: null, cuerpo: t }); } });
    });
    r.on("error", rej);
    r.end(JSON.stringify(cuerpo));
  });
  const api = (accion, args = [], token = null) => pedir(HOST_APP, `/api/movil/${accion}`, { args }, token);
  const origen = { lat: Number(puntos.negocio.lat), lng: Number(puntos.negocio.lng) };
  const llamadas = { geocode: 0, ruta: 0, inversa: 0 };
  let googleCaido = false;
  const hash = (t) => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
  const doble = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const j = (status, o) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      const u = new globalThis.URL(req.url, "http://doble");
      if (u.pathname.endsWith("/geocode/json")) {
        if (u.searchParams.get("latlng")) { llamadas.inversa++; return j(200, { status: "OK", results: [{ formatted_address: "Av. Propuesta 77, Centro" }] }); }
        llamadas.geocode++;
        const d = u.searchParams.get("address") ?? "";
        if (/inexistente/i.test(d)) return j(200, { status: "ZERO_RESULTS", results: [] });
        const lejos = /lejana/i.test(d);
        return j(200, { status: "OK", results: [{ types: /colonia general/i.test(d) ? ["neighborhood", "political"] : ["street_address"], geometry: { location_type: /colonia general/i.test(d) ? "APPROXIMATE" : "ROOFTOP", location: { lat: origen.lat + (lejos ? 5 : 0.05 + hash(d.toLowerCase()) / 100000), lng: origen.lng } } }] });
      }
      if (u.pathname.endsWith(":computeRoutes")) {
        llamadas.ruta++;
        if (googleCaido) return j(500, {});
        const destino = JSON.parse(b).destination.location.latLng;
        return j(200, { routes: [{ distanceMeters: Math.abs(destino.latitude - origen.lat) > 1 ? 700000 : 9100 }] });
      }
      j(404, {});
    });
  });
  await new Promise((r) => doble.listen(4457, "127.0.0.1", r));

  // El dueño de la app: un cliente de Huellitas con cuenta y con una mascota ligada a su expediente.
  const { data: miembros } = await SB.from("membresias").select("profile_id, cliente_id").eq("negocio_id", B).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).limit(40);
  let C = null, tokenC = null, mascotaC = null;
  for (const mem of miembros ?? []) {
    const { data: fila } = await SB.from("clientes").select("id, telefono, direccion, direccion_lat, direccion_lng, distancia_base_km, distancia_calculada_at, distancia_ajustada_manualmente").eq("id", mem.cliente_id).is("deleted_at", null).maybeSingle();
    const { data: ms } = await A.from("mascotas").select("id").eq("dueno_id", mem.profile_id).is("deleted_at", null);
    if (!fila?.telefono || !ms?.length) continue;
    const t = await tokenDe(mem.profile_id);
    for (const x of ms) {
      const r = await api("direccionGuardada", [B, x.id], t);
      if (r.status === 200 && !r.json?.error) { C = { ...mem, fila }; tokenC = t; mascotaC = x.id; break; }
    }
    if (C) break;
  }
  if (!C) throw new Error("No hay un dueño de Huellitas con mascota ligada: corre app-duenos-dev.mjs. ¿Está arrancada la app con el doble?");
  const antesC = C.fila;
  const borrarCotizaciones = () => SB.from("recoleccion_cotizaciones").delete().eq("negocio_id", B).eq("cliente_id", C.cliente_id);
  limpiarDireccion = async () => {
    await borrarCotizaciones();
    await SB.from("maps_geocodificaciones").delete().eq("negocio_id", B);
    await SB.from("maps_rutas").delete().eq("negocio_id", B);
    await SB.from("maps_consultas").delete().eq("negocio_id", B).gte("created_at", inicioPrueba);
    const { id, telefono, ...resto } = antesC;
    void telefono;
    await SB.from("clientes").update(resto).eq("id", id);
    if (topeAntes !== undefined) await SB.from("negocios").update({ maps_consultas_mes: topeAntes }).eq("id", B);
    await new Promise((r) => doble.close(r));
  };
  await borrarCotizaciones();
  await SB.from("maps_geocodificaciones").delete().eq("negocio_id", B);
  await SB.from("maps_rutas").delete().eq("negocio_id", B);
  const cotizaApp = (dir, lat = null, lng = null) => api("cotizarRecoleccion", [B, mascotaC, dir, lat, lng, "negocio"], tokenC);
  const sello = String(Date.now()).slice(-7);

  await SB.from("clientes").update({ direccion: "Calle Guardada 12", direccion_lat: 22.17, direccion_lng: -101.0, distancia_base_km: 4.5 }).eq("id", C.cliente_id);
  // «Cliente no encontrado»: el dueño con mascota cotiza; el que no tiene expediente, o lo tiene dado de baja, lo sabe claro.
  const cConMascota = await cotizaApp("Calle Guardada 12");
  ok(cConMascota.status === 200 && !cConMascota.json?.error && cConMascota.json?.datos?.km != null, `dueño con mascota en el negocio: cotiza (${cConMascota.json?.datos?.km} km) ${cConMascota.json?.error ?? ""}`);
  const { data: otrasMascotas } = await A.from("mascotas").select("id").neq("dueno_id", C.profile_id).is("deleted_at", null).limit(1);
  const cSinMascota = await api("cotizarRecoleccion", [B, otrasMascotas[0].id, "Calle Guardada 12", null, null, "negocio"], tokenC);
  ok(/no tiene expediente/i.test(cSinMascota.json?.error ?? ""), `dueño sin esa mascota en el negocio: «${cSinMascota.json?.error}»`);
  await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", C.cliente_id);
  const cBaja = await api("cotizarRecoleccion", [B, mascotaC, "Calle Guardada 12", null, null, "negocio"], tokenC);
  await SB.from("clientes").update({ deleted_at: null }).eq("id", C.cliente_id);
  ok(Boolean(cBaja.json?.error) && !/cliente no encontrado/i.test(cBaja.json.error), `dueño con expediente dado de baja: ya no sale «Cliente no encontrado» («${cBaja.json?.error}»)`);
  const dg = await api("direccionGuardada", [B, mascotaC], tokenC);
  ok(dg.json?.direccion === "Calle Guardada 12", `la app lee su dirección guardada (${dg.json?.direccion ?? dg.json?.error})`);
  let n0 = { ...llamadas };
  const q1 = await cotizaApp("Calle Guardada 12");
  ok(q1.json?.datos?.origen_km === "guardada" && Number(q1.json?.datos?.km) === 4.5 && llamadas.geocode === n0.geocode && llamadas.ruta === n0.ruta, `dirección guardada: su distancia, sin gastar en Google (${q1.json?.datos?.km} km) ${q1.json?.error ?? ""}`);

  n0 = { ...llamadas };
  const DIR = `Av. Nueva ${sello}, Centro`;
  const q2 = await cotizaApp(DIR, 40, -3); // el celular dice que está en Madrid: no cuenta.
  ok(q2.json?.datos?.origen_km === "ruta" && Number(q2.json?.datos?.km) === 9.1 && Number(q2.json?.datos?.cantidad) === 10, `dirección nueva: km por ruta (${q2.json?.datos?.km} km, ${q2.json?.datos?.origen_km}) y la ubicación mandada no cuenta ${q2.json?.error ?? ""}`);
  ok(llamadas.geocode === n0.geocode + 1 && llamadas.ruta === n0.ruta + 1, `una geocodificación y una ruta (${llamadas.geocode - n0.geocode} y ${llamadas.ruta - n0.ruta})`);
  n0 = { ...llamadas };
  const q3 = await cotizaApp(`  av. NUEVA   ${sello},  centro `);
  ok(Number(q3.json?.datos?.km) === 9.1 && llamadas.geocode === n0.geocode && llamadas.ruta === n0.ruta, `la misma dirección otra vez sale de la caché, sin llamar a Google (${q3.json?.datos?.km} km)`);
  const { count: filasGeo } = await SB.from("maps_geocodificaciones").select("id", { count: "exact", head: true }).eq("negocio_id", B);
  const { count: filasRuta } = await SB.from("maps_rutas").select("id", { count: "exact", head: true }).eq("negocio_id", B);
  ok(filasGeo >= 1 && filasRuta >= 1, `la caché quedó guardada (${filasGeo} direcciones, ${filasRuta} rutas)`);

  const q4 = await cotizaApp(`Calle Inexistente ${sello}`);
  ok(Boolean(q4.json?.error) && !q4.json?.datos, `dirección inválida: se rechaza («${q4.json?.error}»)`);
  const q5 = await cotizaApp(`Colonia General ${sello}`);
  ok(Boolean(q5.json?.error) && !q5.json?.datos, `dirección muy general: se rechaza («${q5.json?.error}»)`);
  const q6 = await cotizaApp(`Calle Lejana ${sello}`);
  ok(/60 km/.test(q6.json?.error ?? ""), `más de 60 km: se rechaza («${q6.json?.error}»)`);
  const u1 = await api("direccionDeMiUbicacion", [B, mascotaC, 22.2, -101.1], tokenC);
  ok(u1.json?.direccion === "Av. Propuesta 77, Centro", `«¿Usar donde estás ahora?» propone una dirección (${u1.json?.direccion ?? u1.json?.error})`);
  const { count: conUbic } = await SB.from("recoleccion_cotizaciones").select("id", { count: "exact", head: true }).eq("cliente_id", C.cliente_id).eq("direccion_norm", "av. propuesta 77, centro");
  ok(conUbic === 0, "proponerla no cotiza ni cobra: falta que la confirme");

  // km manipulados por las dos puertas del portal, con el JWT del dueño.
  const DUENO_C = como(tokenC);
  const { data: perroC } = await SB.from("perros").select("id").eq("cliente_id", C.cliente_id).is("deleted_at", null).limit(1).single();
  const { data: servEstC } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "estetica").is("deleted_at", null).limit(1).single();
  const sinQ = await DUENO_C.rpc("portal_pedir_cita_con_recoleccion", { p_perro: perroC.id, p_servicio: servEstC.id, p_inicio: `${F1}T16:00:00Z`, p_recoleccion: { direccion: `Calle Sin Cotizar ${sello}`, km: 0.01, lat: origen.lat, lng: origen.lng, punto: "negocio" } });
  ok(Boolean(sinQ.error) && /cotizada/i.test(sinQ.error.message), `pedir cita con una dirección sin cotizar y km de 0.01: se rechaza (${sinQ.error?.message?.slice(0, 60) ?? "¡lo dejó!"})`);
  const { data: citasFantasma } = await SB.from("citas_estetica").select("id").eq("perro_id", perroC.id).gte("inicio", `${F1}T00:00:00Z`).lte("inicio", `${F1}T23:59:59Z`).is("deleted_at", null);
  ok((citasFantasma ?? []).length === 0, "y no quedó una cita a medias");

  // Límite por dueño: 30 intentos al día, también de direcciones que no existen.
  await SB.from("recoleccion_cotizaciones").insert(Array.from({ length: 30 }, (_, i) => ({ negocio_id: B, cliente_id: C.cliente_id, direccion_norm: `intento ${i}`, punto: "negocio", km: 0, origen: "intento", expira_at: new Date(Date.now() - 3600_000).toISOString() })));
  n0 = { ...llamadas };
  const q7 = await cotizaApp(`Calle Limite ${sello}`);
  ok(Boolean(q7.json?.error) && llamadas.geocode === n0.geocode, `con 30 intentos en el día ya no se gasta en Google («${q7.json?.error}»)`);
  await borrarCotizaciones();

  // Google caído: línea recta × 1.3.
  googleCaido = true;
  const q8 = await cotizaApp(`Calle Caida ${sello}`);
  googleCaido = false;
  ok(q8.json?.datos?.origen_km === "estimada" && Number(q8.json?.datos?.km) > 0 && Number(q8.json?.datos?.km) < 9, `si Google falla: línea recta × 1.3 (${q8.json?.datos?.km} km, ${q8.json?.datos?.origen_km}) ${q8.json?.error ?? ""}`);

  // Panel, en pantalla: ruta, inválida con km a mano y, con el tope, el aviso.
  const nav = await abrirNavegador();
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies((await cookiesDe(datos.recepcionB)).cookies);
    const p = await ctx.newPage();
    p.setDefaultTimeout(30000);
    p.setDefaultNavigationTimeout(90000);
    const abrirCaja = async () => {
      await p.goto(`http://huellitas.localhost:${PUERTO}/hotel/nueva?cliente=${C.cliente_id}`, { waitUntil: "load" });
      const caja = p.locator("[data-incluir-recoleccion]");
      await caja.waitFor();
      await caja.locator("button").first().click();
      await p.locator("[data-recoleccion-campos]").waitFor();
      await p.waitForTimeout(2500);
      const otra = caja.getByText("Otra dirección");
      if (await otra.count()) await otra.click();
      return caja;
    };
    const cotizaPanel = async (caja, dir) => {
      await caja.getByLabel("Calle, número y colonia").fill(dir);
      await caja.locator("[data-cotizar-recoleccion]").click();
      await p.waitForTimeout(3500);
    };
    let caja = await abrirCaja();
    await cotizaPanel(caja, `Panel Nueva ${sello}, Centro`);
    const t1 = await caja.locator("[data-recoleccion-resumen]").innerText().catch(() => "");
    ok(/9\.1 km/.test(t1) && /por ruta/.test(t1), `panel, dirección nueva: «${t1.replace(/\s+/g, " ").slice(0, 70)}»`);
    await cotizaPanel(caja, `Calle Inexistente Panel ${sello}`);
    ok((await caja.getByLabel("Kilómetros de ida (a mano)").count()) > 0, "panel, dirección inválida: pide los km a mano");

    const { data: negH } = await SB.from("negocios").select("maps_consultas_mes").eq("id", B).single();
    topeAntes = negH.maps_consultas_mes;
    const { count: usadas } = await SB.from("maps_consultas").select("id", { count: "exact", head: true }).eq("negocio_id", B).eq("mes", `${new Date().toISOString().slice(0, 7)}-01`).neq("tipo", "pagina").is("deleted_at", null);
    const pone = await SB.from("negocios").update({ maps_consultas_mes: usadas ?? 0 }).eq("id", B).select("maps_consultas_mes").single();
    ok(!pone.error && pone.data?.maps_consultas_mes === (usadas ?? 0), `tope de la prueba puesto en lo ya usado (${usadas}) ${pone.error?.message ?? ""}`);
    n0 = { ...llamadas };
    const q9 = await cotizaApp(`Calle Tope ${sello}`);
    ok(q9.json?.datos?.origen_km === "estimada" && Number(q9.json?.datos?.km) < 9 && llamadas.ruta === n0.ruta, `tope alcanzado, en la app: línea recta × 1.3, sin consultar la ruta (${q9.json?.datos?.km} km) ${q9.json?.error ?? ""}`);
    caja = await abrirCaja();
    await cotizaPanel(caja, `Panel Tope ${sello}, Centro`);
    const cuerpo = await caja.innerText();
    ok(/línea recta/.test(cuerpo) && /consultas de Google Maps/.test(cuerpo), "tope alcanzado, en el panel: lo dice y marca los km como estimados");
    const { data: tab } = await ADM.rpc("tablero_atencion", { p_grupo: "dinero" });
    ok(tab?.maps_tope?.tope === (usadas ?? 0), `«Necesita atención» del admin trae el aviso (${JSON.stringify(tab?.maps_tope ?? tab?.fallos ?? null)})`);
    const { data: tabRec } = await REC.rpc("tablero_atencion", { p_grupo: "dinero" });
    ok(!tabRec?.maps_tope, "recepción no lo recibe (es de quien administra el plan)");
    const ctxAdm = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctxAdm.addCookies((await cookiesDe(datos.adminB)).cookies);
    const pa = await ctxAdm.newPage();
    await pa.goto(`http://huellitas.localhost:${PUERTO}/admin`, { waitUntil: "load", timeout: 90000 });
    await pa.waitForTimeout(6000);
    ok(/consultas de Google Maps del mes/.test(await pa.locator("body").innerText()), "el admin lo ve en su Inicio, en «Necesita atención»");
    await SB.from("negocios").update({ maps_consultas_mes: topeAntes }).eq("id", B);
  } finally {
  await limpiarDireccion();
    await nav.close();
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
