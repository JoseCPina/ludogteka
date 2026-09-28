// Uso: node scripts/auditoria/integraciones.mjs
// SOLO DESARROLLO. Integraciones por negocio (28 de septiembre de 2026):
// que ningún negocio alcance las credenciales, la elección de proveedor, los
// cobros integrados ni el consumo de Google Maps de otro; que nadie sin
// sesión llegue a nada; que la simulación no pueda dar por pagado un cobro
// de un negocio real; y que solo el admin elija con qué se cobra.
// JWT real de cada rol de Ludogteka + llave anónima + secret key con el
// encabezado de otro negocio. Sale con 1 si encuentra algo.
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, NEGOCIO, sesion, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const hallazgo = (t) => {
  hallazgos.push(t);
  console.log(`  ✘ ${t}`);
};
const bien = (t) => console.log(`  ✔ ${t}`);

const { data: nB } = await A.from("negocios").select("id, slug").eq("slug", "huellitas").single();
const B = nB.id;
const conNegocio = (id, llave = env.SUPABASE_SECRET_KEY) =>
  createClient(URL, llave, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": id } } });
const servicioA = conNegocio(NEGOCIO);
const servicioB = conNegocio(B);
const anon = conNegocio(NEGOCIO, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const persona = async (rol) =>
  (await A.from("membresias").select("profile_id").eq("negocio_id", NEGOCIO).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id;
const roles = {};
const tokens = {};
const tambienEnB = new Set();
for (const rol of ["admin", "recepcion", "estetica", "cliente"]) {
  const id = await persona(rol);
  roles[rol] = await sesion(id);
  tokens[rol] = await tokenDe(id);
  // Una persona que TAMBIÉN es de Huellitas ve lo de Huellitas con su
  // encabezado, y está bien: para la suplantación no cuenta.
  const { data: enB } = await A.from("membresias").select("id").eq("profile_id", id).eq("negocio_id", B).is("deleted_at", null);
  if (enB?.length) tambienEnB.add(rol);
}

// Estado previo de Ludogteka para dejarlo como estaba.
const { data: filasAntes } = await A.from("integraciones_cobro").select("id").eq("negocio_id", NEGOCIO);
const idsAntes = new Set((filasAntes ?? []).map((f) => f.id));

console.log("\n1. Credenciales en Vault: solo el servidor, solo las del negocio de la petición");
{
  const secretoB = `secreto-de-huellitas-${Date.now()}`;
  const g = await servicioB.rpc("integracion_guardar_secreto", { p_proveedor: "clip", p_secreto: secretoB });
  if (g.error) hallazgo(`el servidor no pudo guardar en Vault: ${g.error.message}`);
  const desdeA = await servicioA.rpc("integracion_leer_secreto", { p_proveedor: "clip" });
  if (desdeA.data === secretoB) hallazgo("con el encabezado de Ludogteka se leyó el secreto de Huellitas");
  else bien("la secret key con el encabezado de otro negocio no alcanza el secreto");
  const propio = await servicioB.rpc("integracion_leer_secreto", { p_proveedor: "clip" });
  if (propio.data !== secretoB) hallazgo("el negocio no pudo leer su propio secreto");
  for (const [rol, cli] of [...Object.entries(roles), ["anónimo", anon]]) {
    for (const fn of ["integracion_leer_secreto", "integracion_borrar_secreto"]) {
      const r = await cli.rpc(fn, { p_proveedor: "clip" });
      if (!r.error) hallazgo(`${rol} pudo llamar ${fn}`);
    }
    const r = await cli.rpc("integracion_guardar_secreto", { p_proveedor: "clip", p_secreto: "x" });
    if (!r.error) hallazgo(`${rol} pudo llamar integracion_guardar_secreto`);
  }
  bien("ningún rol ni la llave anónima llama a las funciones de Vault");
  await servicioB.rpc("integracion_borrar_secreto", { p_proveedor: "clip" });
  if ((await servicioB.rpc("integracion_leer_secreto", { p_proveedor: "clip" })).data) hallazgo("el secreto no se borró");
  await A.from("integraciones_cobro").delete().eq("negocio_id", B).eq("proveedor", "clip");
}

console.log("\n2. integraciones_cobro, integraciones_oauth y maps_consultas por la API");
{
  // Una fila de Huellitas que nadie de Ludogteka debe ver.
  await A.from("integraciones_cobro").insert({ negocio_id: B, proveedor: "mercadopago", elegida: true, estado: "conectada", cuenta_id: "AUDIT-B", updated_at: new Date().toISOString() });
  for (const [rol, cli] of Object.entries(roles)) {
    const r = await cli.from("integraciones_cobro").select("id, negocio_id, proveedor");
    if (r.error && ["admin", "recepcion", "estetica"].includes(rol)) hallazgo(`${rol} no pudo leer con qué cobra su negocio: ${r.error.message}`);
    if ((r.data ?? []).some((f) => f.negocio_id !== NEGOCIO)) hallazgo(`${rol} ve integraciones de otro negocio`);
    if (rol === "cliente" && (r.data ?? []).length) hallazgo("el cliente ve con qué cobra el negocio");
    const s = await cli.from("integraciones_cobro").select("secreto_id");
    if (!s.error) hallazgo(`${rol} puede pedir secreto_id`);
    const w = await cli.from("integraciones_cobro").select("webhook_token_hash");
    if (!w.error) hallazgo(`${rol} puede pedir webhook_token_hash`);
    const c = await cli.from("integraciones_cobro").select("cuenta_id");
    if (!c.error) hallazgo(`${rol} puede pedir cuenta_id`);
    const o = await cli.from("integraciones_oauth").select("id, verificador");
    if (!o.error && (o.data ?? []).length) hallazgo(`${rol} lee intentos de OAuth`);
    const ins = await cli.from("integraciones_cobro").insert({ proveedor: "clip" });
    if (!ins.error) hallazgo(`${rol} insertó en integraciones_cobro sin RPC`);
    const upd = await cli.from("integraciones_cobro").update({ estado: "conectada" }).eq("negocio_id", NEGOCIO).select("id");
    if (!upd.error && (upd.data ?? []).length) hallazgo(`${rol} cambió integraciones_cobro sin RPC`);
  }
  for (const [rol] of Object.entries(roles)) {
    if (tambienEnB.has(rol)) {
      console.log(`  · ${rol}: la misma persona también es de Huellitas; no cuenta para la suplantación`);
      continue;
    }
    const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${tokens[rol]}`, "x-negocio-id": B } },
    });
    const r = await cli.from("integraciones_cobro").select("id, negocio_id");
    if ((r.data ?? []).length) hallazgo(`${rol} de Ludogteka con el encabezado de Huellitas ve sus integraciones`);
  }
  bien("cada rol ve solo lo de su negocio, sin columnas sensibles, y no escribe sin RPC");
  const an = await anon.from("integraciones_cobro").select("id");
  if (!an.error && (an.data ?? []).length) hallazgo("la llave anónima lee integraciones_cobro");
  const anM = await anon.from("maps_consultas").select("id");
  if (!anM.error && (anM.data ?? []).length) hallazgo("la llave anónima lee maps_consultas");
  bien("la llave anónima no lee nada");
  await A.from("integraciones_cobro").delete().eq("negocio_id", B).eq("cuenta_id", "AUDIT-B");
}

console.log("\n3. Solo el admin elige con qué cobra el negocio");
{
  for (const [rol, cli] of [...Object.entries(roles), ["anónimo", anon]]) {
    const r = await cli.rpc("elegir_proveedor_cobro", { p_proveedor: "clip" });
    if (rol === "admin" ? r.error : !r.error) hallazgo(`elegir_proveedor_cobro como ${rol}: ${r.error ? r.error.message : "PASÓ"}`);
  }
  const { data: elegida } = await A.from("integraciones_cobro").select("proveedor").eq("negocio_id", NEGOCIO).eq("elegida", true);
  if (elegida?.[0]?.proveedor !== "clip") hallazgo("la elección del admin no quedó");
  else bien("admin sí; recepción, estética, cliente y anónimo no");
  // Se deja como estaba.
  await A.from("integraciones_cobro").delete().eq("negocio_id", NEGOCIO).not("id", "in", `(${[...idsAntes].join(",") || "00000000-0000-0000-0000-000000000000"})`);
}

console.log("\n4. La simulación no da por pagado un cobro de un negocio real");
{
  const { data: reserva } = await A.from("reservas").select("id").eq("negocio_id", NEGOCIO).limit(1).single();
  const { data: orden } = await A.from("mp_ordenes")
    .insert({ negocio_id: NEGOCIO, tipo: "point", reserva_id: reserva.id, monto: 10, estado: "en_terminal", simulado: true, mp_order_id: `AUDIT-SIM-${Date.now()}`, updated_at: new Date().toISOString() })
    .select("id")
    .single();
  const r = await servicioA.rpc("registrar_pago_mercadopago", { p_orden_id: orden.id, p_mp_payment_id: null, p_monto: 10, p_installments: 1, p_mp_payment_type: null, p_evento: null });
  if (!r.error) hallazgo("un cobro SIMULADO quedó registrado en Ludogteka (negocio real)");
  else bien(`Ludogteka rechaza el cobro simulado: «${r.error.message}»`);
  // Y desde otro negocio la orden ni se ve.
  const cruzado = await servicioB.rpc("registrar_pago_mercadopago", { p_orden_id: orden.id, p_mp_payment_id: "AUDIT", p_monto: 10, p_installments: 1, p_mp_payment_type: null, p_evento: null });
  if (!cruzado.error) hallazgo("con el encabezado de Huellitas se registró el pago de una orden de Ludogteka");
  else bien("con el encabezado de otro negocio, la orden no existe");
  for (const [rol, cli] of [...Object.entries(roles), ["anónimo", anon]]) {
    const x = await cli.rpc("registrar_pago_mercadopago", { p_orden_id: orden.id, p_mp_payment_id: null, p_monto: 10, p_installments: 1, p_mp_payment_type: null, p_evento: null });
    if (!x.error) hallazgo(`${rol} registró un pago integrado`);
  }
  await A.from("mp_ordenes").delete().eq("id", orden.id);
}

console.log("\n5. Google Maps: tope por negocio");
{
  const antes = (await A.from("negocios").select("maps_consultas_mes").eq("id", NEGOCIO).single()).data.maps_consultas_mes;
  for (const [rol, cli] of [["cliente", roles.cliente], ["anónimo", anon]]) {
    const r = await cli.rpc("maps_reservar_consulta", { p_tipo: "geocodificar" });
    if (!r.error) hallazgo(`${rol} apartó una consulta de Maps`);
  }
  const creadas = [];
  const r1 = await roles.recepcion.rpc("maps_reservar_consulta", { p_tipo: "geocodificar" });
  if (r1.error || !r1.data?.permitida) hallazgo(`recepción no pudo apartar una consulta: ${r1.error?.message ?? JSON.stringify(r1.data)}`);
  const usadas = r1.data?.usadas ?? 0;
  // Tope = lo usado: la siguiente se niega.
  await A.from("negocios").update({ maps_consultas_mes: usadas }).eq("id", NEGOCIO);
  const r2 = await roles.recepcion.rpc("maps_reservar_consulta", { p_tipo: "ruta" });
  if (r2.data?.permitida) hallazgo("se pasó del tope de Maps");
  else bien(`al llegar al tope (${usadas}) la consulta se niega: la pantalla pide los km a mano`);
  await A.from("negocios").update({ maps_consultas_mes: antes }).eq("id", NEGOCIO);
  const { data: ultimas } = await A.from("maps_consultas").select("id").eq("negocio_id", NEGOCIO).order("created_at", { ascending: false }).limit(1);
  creadas.push(...(ultimas ?? []).map((f) => f.id));
  await A.from("maps_consultas").delete().in("id", creadas);
  // Nadie del negocio cambia su propio tope.
  const t = await roles.admin.from("negocios").update({ maps_consultas_mes: 99999 }).eq("id", NEGOCIO).select("id");
  if (!t.error && (t.data ?? []).length) hallazgo("el admin del negocio se subió su tope de Maps");
  else bien("el tope solo lo cambia la plataforma");
  for (const [rol, cli] of [...Object.entries(roles), ["anónimo", anon]]) {
    for (const [fn, args] of [["plataforma_maps_consumo", { p_mes: "2026-09-01" }], ["plataforma_maps_tope_negocio", { p_negocio_id: NEGOCIO, p_tope: 1, p_motivo: "x" }], ["plataforma_maps_tope_plan", { p_plan_id: NEGOCIO, p_tope: 1 }]]) {
      const r = await cli.rpc(fn, args);
      if (!r.error) hallazgo(`${rol} llamó ${fn}`);
    }
    const c = await cli.rpc("maps_consumo_mes");
    if (rol === "admin" ? c.error : !c.error) hallazgo(`maps_consumo_mes como ${rol}: ${c.error ? c.error.message : "PASÓ"}`);
  }
  bien("el consumo del negocio lo ve su admin; el de todos, solo la plataforma");
}

console.log("\n6. Ubicación para recolección: con el permiso «Configuración del negocio»");
{
  const { data: suc } = await A.from("sucursales").select("direccion, lat, lng").eq("negocio_id", NEGOCIO).is("deleted_at", null).order("activo", { ascending: false }).limit(1).single();
  const args = { p_direccion: suc.direccion, p_lat: suc.lat, p_lng: suc.lng, p_base_direccion: null, p_base_lat: null, p_base_lng: null };
  const { data: permisos } = await roles.recepcion.rpc("mis_permisos");
  const recepConPermiso = (permisos ?? []).includes("configuracion_negocio");
  for (const [rol, cli] of [...Object.entries(roles), ["anónimo", anon]]) {
    const r = await cli.rpc("guardar_ubicacion_negocio", args);
    const debe = rol === "admin" || (rol === "recepcion" && recepConPermiso);
    if (debe ? r.error : !r.error) hallazgo(`guardar_ubicacion_negocio como ${rol}: ${r.error ? r.error.message : "PASÓ"}`);
  }
  bien(`admin sí${recepConPermiso ? " (y recepción, que tiene el permiso)" : ""}; los demás y el anónimo no`);
}

console.log("\n7. auditoria_frontera()");
{
  const { data } = await A.rpc("auditoria_frontera");
  if ((data ?? []).length) hallazgo(`auditoria_frontera trae ${data.length}: ${JSON.stringify(data.slice(0, 5))}`);
  else bien("vacía");
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
