// App para dueños · Fase 3 · capa de datos (SOLO DESARROLLO, en Huellitas; sin pantalla y sin servidor: todo por la API
// con JWT reales). docs/app-duenos/FASE-3.md · migración 20261203001700.
//
//   node scripts/auditoria/app-duenos-f3-dev.mjs
//
// Con dos clientes de Huellitas con cuenta (C1 dueño, C2 otro dueño) y la llave anónima:
//   1. Vínculo: un perro nuevo de C1 aparece en app_mis_vinculos de C1 (y no en el de C2).
//   2. Horas libres y pedir cita: las horas salen del horario del negocio; C1 pide una y queda con precio y quien atiende;
//      la segunda del mismo día se rechaza (doble); C2 no puede pedirla para el perro de C1; con todo el personal ocupado a
//      esa hora, «ya se ocupó».
//   3. Confirmar en un toque: C1 confirma su cita; otra vez, «ya estaba confirmada»; C2, rechazado.
//   4. Reservar con cupo real: la disponibilidad dice el cupo; con cupo 0 ese día se rechaza; con cupo, se crea; la misma
//      mascota encimada se rechaza (traslape); si el negocio tiene contrato de alta, queda pendiente de firma y C1 lo ve.
//   5. Pagos pendientes: la cita con precio sale con su saldo para C1 y no para C2; pases sin lo que se pagó.
//   6. Reseña verificada: sobre la cita reservada, «cuando termine»; finalizada, sí; repetida, no; C2, no; C2 no la lee;
//      resenas_de_negocio la cuenta.
//   7. Aislamiento: C1 con el encabezado de otro negocio no ve ni puede nada; el anónimo nada.
// Lo que crea se da de baja al terminar (perro, reservas, citas, estancias, contratos pendientes, reseñas, cupo de prueba).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, NEGOCIO as LUDOGTEKA_DEV, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const ok = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? ok(t) : mal(t));
const seccion = (t) => console.log(`\n── ${t}`);
const sufijo = `F3-${Date.now().toString(36).slice(-5)}`;

const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const H = datos.B;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const enNegocio = (token, negocio = H) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": negocio } } });
const sinNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const anonimo = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const zonaH = (await S.from("negocios").select("zona_horaria").eq("id", H).single()).data?.zona_horaria ?? "America/Mexico_City";
const hoyH = (await S.rpc("fecha_negocio")).data;
const suma = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);

// Dos dueños con cuenta en Huellitas.
const { data: miembros } = await S.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).order("created_at").limit(40);
// Dueños con pocas mascotas (hay un cliente de pruebas con más de 1,000: app_mis_vinculos se pagina y el perro nuevo quedaría fuera).
const duenos = [];
for (const m of miembros ?? []) {
  const { data: c } = await S.from("clientes").select("id, nombre, telefono").eq("id", m.cliente_id).is("deleted_at", null).maybeSingle();
  const { count } = await S.from("perros").select("id", { count: "exact", head: true }).eq("cliente_id", m.cliente_id).is("deleted_at", null);
  if (c && (count ?? 0) <= 5) duenos.push({ ...m, nombre: c.nombre });
  if (duenos.length >= 2) break;
}
if (duenos.length < 2) throw new Error("Huellitas necesita dos clientes con cuenta.");
const [C1, C2] = duenos;
const t1 = await tokenDe(C1.profile_id);
const t2 = await tokenDe(C2.profile_id);
const c1 = enNegocio(t1), c2 = enNegocio(t2), a1 = sinNegocio(t1), a2 = sinNegocio(t2);
console.log(`Huellitas ${H.slice(0, 8)} · C1 ${C1.nombre} · C2 ${C2.nombre} · hoy ${hoyH} (${zonaH})`);

const creados = { perros: [], solicitudes: [], perro: null, reservas: [], citas: [], estancias: [], contratos: [], resenas: [], cupo: null, ajustes: [] };
const msg = (r) => r.error?.message ?? "";
try {
  // ── 1. Perro nuevo de C1 (raza con precio en Huellitas: Poodle chico de pelo medio) y su vínculo ───────────────
  seccion("1. Vínculo");
  const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: pelo } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
  const { data: raza } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const { data: perro, error: eP } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: `F3 ${sufijo}`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id").single();
  if (eP) throw new Error(`perro: ${eP.message}`);
  creados.perro = perro.id;
  const { data: v1 } = await a1.rpc("app_mis_vinculos");
  const vinculo = (v1 ?? []).find((v) => v.perro_id === perro.id);
  comprobar(Boolean(vinculo), "el perro nuevo de C1 aparece en app_mis_vinculos de C1 (con su mascota de la app)");
  const { data: v2 } = await a2.rpc("app_mis_vinculos");
  comprobar(!(v2 ?? []).some((v) => v.perro_id === perro.id), "y no en el de C2");
  comprobar(Boolean(vinculo?.mascota_id), `la mascota de la app existe (${vinculo?.mascota_id?.slice(0, 8) ?? "sin mascota"})`);

  // ── 2. Horas libres y pedir cita ────────────────────────────────────────────────────────────────────────────
  seccion("2. Horas libres y pedir cita");
  const { data: servicios } = await S.from("servicios").select("id, nombre, categoria, unidad, duracion_minutos").eq("negocio_id", H).is("deleted_at", null);
  const estetica = (servicios ?? []).find((s) => s.categoria === "estetica" && /ba[ñn]o/i.test(s.nombre)) ?? (servicios ?? []).find((s) => s.categoria === "estetica");
  const guarderia = (servicios ?? []).find((s) => s.categoria === "guarderia" && s.unidad !== "hora") ?? (servicios ?? []).find((s) => s.categoria === "guarderia");
  comprobar(Boolean(estetica) && Boolean(guarderia), `Huellitas ofrece estética («${estetica?.nombre}») y guardería («${guarderia?.nombre}»)`);
  // Un día que abre, de aquí a 10 días (sábado y domingo pueden no abrir).
  let diaCita = null, horas = null;
  for (let d = 1; d <= 10 && !diaCita; d++) {
    const fecha = suma(hoyH, d);
    const { data, error } = await c1.rpc("portal_horas_disponibles", { p_servicio: estetica.id, p_fecha: fecha });
    if (error) { mal(`portal_horas_disponibles: ${error.message}`); break; }
    if (data?.abre && (data.horas ?? []).length > 0) { diaCita = fecha; horas = data; }
  }
  comprobar(Boolean(diaCita), `hay un día con horas libres (${diaCita}: ${horas?.horas?.length ?? 0} bloques de ${horas?.duracion_minutos} min, desde ${horas?.horas?.[0]?.hora})`);
  // Migración 20261203001800: ninguna hora le da la vuelta a la medianoche (todas el MISMO día y dentro del horario).
  const { data: cfgDia } = await S.rpc("resolver_cupo_configuracion", { p_fecha: diaCita });
  const cfgH = Array.isArray(cfgDia) ? cfgDia[0] : cfgDia;
  const min = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
  const fueraDeDia = (horas?.horas ?? []).filter((h) => new Intl.DateTimeFormat("en-CA", { timeZone: zonaH }).format(new Date(h.inicio)) !== diaCita || min(h.hora) < min(cfgH.hora_apertura) || min(h.hora) + horas.duracion_minutos > min(cfgH.hora_cierre));
  comprobar(fueraDeDia.length === 0, `todas las horas caen ese día, entre ${String(cfgH?.hora_apertura).slice(0, 5)} y ${String(cfgH?.hora_cierre).slice(0, 5)} (fuera: ${fueraDeDia.map((h) => h.hora).join(", ") || "ninguna"})`);
  const tarde = new Date(new Date(horas.horas[0].inicio).getTime() + (23 * 60 + 30 - min(horas.horas[0].hora)) * 60000).toISOString();
  const deNoche = await c1.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: tarde });
  if (deNoche.data?.cita_id) { creados.citas.push(deNoche.data.cita_id); creados.reservas.push(deNoche.data.reserva_id); }
  comprobar(Boolean(deNoche.error) && /fuera del horario/i.test(msg(deNoche)), `una cita a las 23:30 (cruza la medianoche) se rechaza («${msg(deNoche) || "se creó"}»)`);
  const inicio = horas?.horas?.[0]?.inicio;
  const anonHoras = await anonimo.rpc("portal_horas_disponibles", { p_servicio: estetica.id, p_fecha: diaCita });
  comprobar(Boolean(anonHoras.error), `el anónimo no ve horas (${anonHoras.status})`);
  const otro = await c2.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: inicio });
  comprobar(Boolean(otro.error) && /no es tuya/i.test(msg(otro)), `C2 no puede pedir cita para el perro de C1 («${msg(otro)}»)`);
  const cita = await c1.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: inicio });
  comprobar(!cita.error && cita.data?.cita_id, `C1 pide la cita: ${cita.error ? msg(cita) : `${cita.data.servicio_nombre} · $${cita.data.precio} · atiende ${cita.data.atiende} · ${cita.data.estado}`}`);
  if (cita.data?.cita_id) { creados.citas.push(cita.data.cita_id); creados.reservas.push(cita.data.reserva_id); }
  const { data: fila } = await S.from("citas_estetica").select("empleado_id, precio, estado, reserva_id").eq("id", cita.data?.cita_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  comprobar(Boolean(fila?.empleado_id) && Number(fila?.precio) > 0 && fila?.estado === "reservada", `la cita quedó con quien atiende, precio ${fila?.precio} y estado reservada`);
  const doble = await c1.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: horas.horas[1]?.inicio ?? inicio });
  comprobar(Boolean(doble.error) && /ya tiene una cita ese día/i.test(msg(doble)), `la segunda cita el mismo día se rechaza («${msg(doble)}»)`);
  // Con todo el personal ocupado a una hora, esa hora ya no sale ni se puede pedir (otro perro de C1 para no chocar con la regla del día).
  const { data: perroB } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: `F3b ${sufijo}`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id").single();
  // La última hora libre del día (lejos de la cita de C1), ocupada para TODO el personal con perros de C2 que sí tienen
  // talla y pelaje (si no, el precio no se resuelve y la cita no se crea).
  const horaLlena = horas.horas[horas.horas.length - 1].inicio;
  const { data: personal } = await S.from("membresias").select("profile_id").eq("negocio_id", H).is("deleted_at", null).in("rol", ["estetica", "admin"]);
  for (const [i, p] of (personal ?? []).entries()) {
    const { data: perroRelleno } = await S.from("perros").insert({ negocio_id: H, cliente_id: C2.cliente_id, nombre: `F3r${i} ${sufijo}`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id").single();
    const r = await S.from("reservas").insert({ negocio_id: H, cliente_id: C2.cliente_id }).select("id").single();
    if (r.data && perroRelleno) {
      creados.reservas.push(r.data.id);
      const c = await S.from("citas_estetica").insert({ negocio_id: H, reserva_id: r.data.id, perro_id: perroRelleno.id, servicio_id: estetica.id, empleado_id: p.profile_id, inicio: horaLlena }).select("id").single();
      if (c.data) creados.citas.push(c.data.id); else console.log(`    · no se pudo ocupar a ${p.profile_id.slice(0, 8)}: ${c.error?.message}`);
    }
  }
  const { data: horas2 } = await c1.rpc("portal_horas_disponibles", { p_servicio: estetica.id, p_fecha: diaCita });
  comprobar(!(horas2?.horas ?? []).some((h) => h.inicio === horaLlena), "con todo el personal ocupado, esa hora ya no sale en las libres");
  const llena = await c1.rpc("portal_pedir_cita", { p_perro: perroB.id, p_servicio: estetica.id, p_inicio: horaLlena });
  if (llena.data?.cita_id) { creados.citas.push(llena.data.cita_id); creados.reservas.push(llena.data.reserva_id); }
  comprobar(Boolean(llena.error) && /ya se ocupó/i.test(msg(llena)), `y pedirla se rechaza («${msg(llena) || "se creó: " + JSON.stringify(llena.data).slice(0, 80)}»)`);

  // ── 3. Confirmar en un toque ────────────────────────────────────────────────────────────────────────────────
  seccion("3. Confirmar en un toque");
  const { data: visitas } = await c1.rpc("mis_visitas");
  comprobar((visitas ?? []).some((v) => v.id === cita.data?.cita_id && v.estado === "reservada"), "mis_visitas de C1 trae la cita reservada");
  const confC2 = await c2.rpc("portal_confirmar_visita", { p_tipo: "estetica", p_id: cita.data?.cita_id });
  comprobar(Boolean(confC2.error), `C2 no la confirma («${msg(confC2)}»)`);
  const conf = await c1.rpc("portal_confirmar_visita", { p_tipo: "estetica", p_id: cita.data?.cita_id });
  comprobar(!conf.error && conf.data?.estado === "confirmada", `C1 la confirma en un toque (${conf.error ? msg(conf) : conf.data.estado})`);
  const conf2 = await c1.rpc("portal_confirmar_visita", { p_tipo: "estetica", p_id: cita.data?.cita_id });
  comprobar(Boolean(conf2.error) && /ya estaba confirmada/i.test(msg(conf2)), `otra vez: «${msg(conf2)}»`);

  // ── 4. Reservar con cupo real ───────────────────────────────────────────────────────────────────────────────
  seccion("4. Reservar guardería con cupo real");
  // Requisitos en regla para el perro: evaluación de comportamiento y todos los requisitos sanitarios del negocio.
  const adminTok = await tokenDe(datos.adminB);
  const adm = enNegocio(adminTok);
  await adm.rpc("marcar_evaluacion_comportamiento", { p_perro_id: perro.id, p_fecha: hoyH, p_notas: "prueba F3" });
  const { data: tipos } = await S.from("tipos_requisito_sanitario").select("id").eq("negocio_id", H).is("deleted_at", null);
  for (const t of tipos ?? []) await S.from("requisitos_sanitarios_aplicados").insert({ negocio_id: H, perro_id: perro.id, tipo_requisito_id: t.id, fecha_aplicacion: suma(hoyH, -3), detalle: "Prueba F3" });
  // Un día lejano que abre (miércoles).
  let D = suma(hoyH, 400 + Math.floor(Math.random() * 100));
  while (new Date(`${D}T12:00:00Z`).getUTCDay() !== 3) D = suma(D, 1);
  const disp = await c1.rpc("portal_disponibilidad_estancia", { p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) });
  comprobar(!disp.error && disp.data?.dias?.length === 1, `la disponibilidad dice el cupo del ${D}: ${disp.error ? msg(disp) : JSON.stringify(disp.data.dias[0])}`);
  // Reservar directo exige el contrato de alta firmado; «Firmar aquí» lo deja listo.
  const prep = await c1.rpc("portal_preparar_contratos", { p_perro: perro.id });
  const contratosPrep = prep.data ?? [];
  for (const k of contratosPrep) {
    creados.contratos.push(k.id);
    const f = await S.from("contratos").update({ estado: "firmado_papel", storage_path: "prueba/f3.pdf", hash_pdf: "prueba", fecha_firma: new Date().toISOString(), subido_por: datos.adminB }).eq("id", k.id);
    if (f.error) mal(`firmar en papel: ${f.error.message}`);
  }
  // Cupo 0 ese día: una configuración de cupo que empieza ese día (y se quita al terminar).
  const { data: cupoHoy } = await adm.rpc("resolver_cupo_configuracion", { p_fecha: D });
  const cfg = Array.isArray(cupoHoy) ? cupoHoy[0] : cupoHoy;
  const { data: cfgFila } = await S.from("cupo_configuracion").select("hora_cierre, hora_apertura").eq("negocio_id", H).is("deleted_at", null).order("vigencia_desde", { ascending: false }).limit(1).maybeSingle();
  const cero = await S.from("cupo_configuracion").insert({ negocio_id: H, vigencia_desde: D, cupo_diurno: 0, cupo_nocturno: 0, hora_cierre: cfgFila?.hora_cierre ?? "19:00", ...(cfgFila?.hora_apertura ? { hora_apertura: cfgFila.hora_apertura } : {}), base_direccion: cfg?.base_direccion ?? null, base_lat: cfg?.base_lat ?? null, base_lng: cfg?.base_lng ?? null, telefono_recepcion: cfg?.telefono_recepcion ?? null }).select("id").single();
  if (cero.error) console.log(`    · no se pudo poner cupo 0 (${cero.error.message}); se salta la prueba de «sin cupo»`);
  else {
    creados.cupo = cero.data.id;
    const disp0 = await c1.rpc("portal_disponibilidad_estancia", { p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) });
    comprobar(disp0.data?.hay_cupo === false, `con cupo 0, la disponibilidad dice que no hay (${JSON.stringify(disp0.data?.dias?.[0])})`);
    const sinCupo = await c1.rpc("portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) });
    comprobar(Boolean(sinCupo.error) && /cupo/i.test(msg(sinCupo)), `reservar sin cupo se rechaza («${msg(sinCupo)}»)`);
    await S.from("cupo_configuracion").delete().eq("id", cero.data.id);
    creados.cupo = null;
  }
  const res = await c1.rpc("portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) });
  comprobar(!res.error && res.data?.estancia_id, `con cupo, C1 reserva: ${res.error ? msg(res) : `${res.data.categoria} ${res.data.fecha_entrada}→${res.data.fecha_salida} · $${res.data.precio_total} · contratos por firmar ${res.data.contratos_por_firmar.length}`}`);
  if (res.data?.estancia_id) { creados.estancias.push(res.data.estancia_id); creados.reservas.push(res.data.reserva_id); for (const c of res.data.contratos_por_firmar) creados.contratos.push(c.id); }
  // Una sola fuente (migración 20261203001900): el total que la app le dice al dueño es el de la cuenta del panel
  // (cuenta_totales_reserva, sobre cuenta_lineas_estancia), no precio × noches. La corrección de precio va en la sección 5.
  if (res.data?.reserva_id) {
    const panel = (await adm.rpc("cuenta_totales_reserva", { p_reserva_id: res.data.reserva_id })).data;
    const p0 = Array.isArray(panel) ? panel[0] : panel;
    const { data: lineasR } = await adm.rpc("cuenta_lineas_estancia", { p_reserva_id: res.data.reserva_id });
    const sumaLineas = (lineasR ?? []).reduce((s, l) => s + Number(l.total), 0);
    comprobar(Number(res.data.precio_total) === Number(p0?.total_cuenta) && Number(p0?.total_cuenta) === sumaLineas && Number(res.data.saldo) === Number(p0?.saldo), `el total de la app (${res.data.precio_total}, saldo ${res.data.saldo}) es el del panel (${p0?.total_cuenta}, saldo ${p0?.saldo}) y el de cuenta_lineas_estancia (${sumaLineas})`);
  }
  const encimada = await c1.rpc("portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) });
  comprobar(Boolean(encimada.error), `la misma mascota encimada se rechaza («${msg(encimada).slice(0, 90)}»)`);
  const { data: tiposAlta } = await adm.rpc("tipos_contrato_de_alta", { p_tipo: "guarderia_hotel" });
  if ((tiposAlta ?? []).length) {
    comprobar(contratosPrep.length > 0, "el negocio tiene contrato de alta: «Firmar aquí» lo deja listo antes de reservar");
    const { data: misContratos } = await c1.from("contratos").select("id, estado").in("id", contratosPrep.map((x) => x.id)).is("deleted_at", null);
    comprobar((misContratos ?? []).length === contratosPrep.length, "C1 ve su contrato");
    const { data: ajenos } = await c2.from("contratos").select("id").in("id", contratosPrep.map((x) => x.id));
    comprobar((ajenos ?? []).length === 0, "C2 no lo ve");
  } else ok("Huellitas no tiene contrato de alta para guardería/hotel: no hay contrato que generar (correcto)");
  const resC2 = await c2.rpc("portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: suma(D, 7), p_salida: suma(D, 8) });
  comprobar(Boolean(resC2.error) && /no es tuya/i.test(msg(resC2)), `C2 no reserva para el perro de C1 («${msg(resC2)}»)`);

  // ── «Pedir lugar»: un requisito nunca es una pared ──────────────────────────────────────────────────────────────
  seccion("«Pedir lugar»");
  const { data: perroBPL, error: ePB } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: `F3 ${sufijo} B`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id").single();
  if (ePB) throw new Error(`perro B: ${ePB.message}`);
  creados.perros.push(perroBPL.id);
  let D2 = suma(hoyH, 520 + Math.floor(Math.random() * 40));
  while (new Date(`${D2}T12:00:00Z`).getUTCDay() !== 3) D2 = suma(D2, 1);
  const argsPL = (entrada) => ({ p_perro: perroBPL.id, p_servicio: guarderia.id, p_entrada: entrada, p_salida: suma(entrada, 1), p_horas: null, p_inicio: null });
  const claves = (r) => (r.data ?? []).map((m) => m.clave);
  const revA = await c1.rpc("portal_requisitos_reserva", argsPL(D2));
  comprobar(!revA.error && claves(revA).includes("evaluacion"), `sin evaluación: lo dice (${JSON.stringify(claves(revA))}) ${msg(revA)}`);
  comprobar(claves(revA).includes("contrato"), "sin contrato firmado: lo dice");
  const conVacuna = (revA.data ?? []).filter((m) => m.clave === "sanitario");
  comprobar(conVacuna.length > 0 && conVacuna.every((m) => m.dato), `sin vacunas: dice cuál falta (${conVacuna.map((m) => m.dato).join(", ")})`);
  const directoPL = await c1.rpc("portal_reservar", { p_perro: perroBPL.id, p_servicio: guarderia.id, p_entrada: D2, p_salida: suma(D2, 1) });
  comprobar(Boolean(directoPL.error), `reservar directo sigue rechazado («${msg(directoPL).slice(0, 70)}»)`);
  const cupoAntes = (await c1.rpc("portal_disponibilidad_estancia", { p_servicio: guarderia.id, p_entrada: D2, p_salida: suma(D2, 1) })).data?.dias?.[0]?.ocupado;

  const pideEval = await c1.rpc("portal_pedir_lugar", { ...argsPL(D2), p_recoleccion: null });
  comprobar(!pideEval.error && pideEval.data?.estado === "pendiente", `por evaluación: deja la solicitud ${msg(pideEval)}`);
  const idEval = pideEval.data?.id;
  if (idEval) creados.solicitudes.push(idEval);
  const { count: estanciasB } = await S.from("estancias").select("id", { count: "exact", head: true }).eq("perro_id", perroBPL.id);
  comprobar(estanciasB === 0, "no crea estancia");
  const { count: cargosB } = await S.from("cargos_aplicados").select("id", { count: "exact", head: true }).eq("perro_id", perroBPL.id);
  comprobar(cargosB === 0, "no cobra nada");
  const cupoDespues = (await c1.rpc("portal_disponibilidad_estancia", { p_servicio: guarderia.id, p_entrada: D2, p_salida: suma(D2, 1) })).data?.dias?.[0]?.ocupado;
  comprobar(cupoAntes === cupoDespues, `no ocupa cupo (${cupoAntes} → ${cupoDespues})`);
  const repetidaPL = await c1.rpc("portal_pedir_lugar", { ...argsPL(D2), p_recoleccion: null });
  comprobar(Boolean(repetidaPL.error), `la misma solicitud no se repite («${msg(repetidaPL).slice(0, 50)}»)`);
  const deC2 = await c2.rpc("portal_pedir_lugar", { ...argsPL(suma(D2, 7)), p_recoleccion: null });
  comprobar(Boolean(deC2.error) && /no es tuya/i.test(msg(deC2)), "otro dueño no pide lugar para esa mascota");
  const { data: misC1 } = await c1.rpc("mis_solicitudes");
  const { data: misC2 } = await c2.rpc("mis_solicitudes");
  comprobar((misC1 ?? []).some((s) => s.id === idEval) && !(misC2 ?? []).some((s) => s.id === idEval), "cada dueño ve solo las suyas");
  comprobar(!JSON.stringify(misC1 ?? []).match(/precio|monto|total|saldo/i), "sin montos en lo que ve el dueño");
  const tablaDueno = await c1.from("solicitudes_reserva").select("id").eq("id", idEval);
  comprobar((tablaDueno.data ?? []).length === 0, "el dueño no lee la tabla");
  const noDueno = await c1.rpc("solicitud_aceptar", { p_id: idEval, p_motivo: null });
  comprobar(noDueno.error?.code === "42501", `el dueño no se la aceptaPL (${noDueno.error?.code ?? "¡lo dejó!"})`);
  const recepPL = enNegocio(await tokenDe(datos.recepcionB));

  // Lo ve el negocio.
  const { data: tabGeneral } = await adm.rpc("tablero_atencion", { p_grupo: "general" });
  comprobar((tabGeneral?.solicitudes ?? []).some((s) => s.id === idEval), "sale en «Necesita atención»");
  const sinMotivo = await adm.rpc("solicitud_aceptar", { p_id: idEval, p_motivo: null });
  comprobar(Boolean(sinMotivo.error), `«Aceptar» sin resolver lo que falta: lo dice («${msg(sinMotivo).slice(0, 70)}»)`);
  const agendaPL = await adm.rpc("solicitud_agendar_evaluacion", { p_id: idEval, p_cuando: new Date(Date.now() + 10 * 86400000).toISOString() });
  comprobar(!agendaPL.error && agendaPL.data?.evaluacion_agendada_at && Date.parse(agendaPL.data.expira_at) > Date.now() + 12 * 86400000, `agendar la evaluación extiende la caducidad ${msg(agendaPL)}`);
  const avisoDe = async (id) => (await A.from("app_avisos").select("titulo, cuerpo, datos").eq("dueno_id", C1.profile_id).eq("datos->>origen_id", id)).data ?? [];
  comprobar((await avisoDe(idEval)).some((a) => /evaluaci/i.test(a.titulo)), "el dueño recibe el aviso de su evaluación");

  // Aceptar con excepción: reserva normal, con los motivos en la estancia.
  const aceptaPL = await adm.rpc("solicitud_aceptar", { p_id: idEval, p_motivo: "Prueba: ya la conozco" });
  comprobar(!aceptaPL.error && aceptaPL.data?.estado === "aceptada" && aceptaPL.data?.estancia_id, `aceptar con excepción la vuelve reserva ${msg(aceptaPL)}`);
  if (aceptaPL.data?.estancia_id) { creados.estancias.push(aceptaPL.data.estancia_id); creados.reservas.push(aceptaPL.data.reserva_id); }
  const { data: estB } = await S.from("estancias").select("estado, bloqueo_comportamiento_superado, motivo_excepcion_comportamiento, bloqueo_sanitario_superado").eq("id", aceptaPL.data?.estancia_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  comprobar(estB?.bloqueo_comportamiento_superado && estB?.bloqueo_sanitario_superado && /conozco/.test(estB?.motivo_excepcion_comportamiento ?? ""), "con su excepción y su motivo en la estancia");
  comprobar((await avisoDe(idEval)).some((a) => /aceptaron/i.test(a.titulo)), "el dueño recibe «Aceptaron tu solicitud» en Avisos, con push pendiente");
  const otraVezPL = await adm.rpc("solicitud_aceptar", { p_id: idEval, p_motivo: "otra" });
  comprobar(Boolean(otraVezPL.error), "no se aceptaPL dos veces");

  // Por vacuna: ya con evaluación.
  await adm.rpc("marcar_evaluacion_comportamiento", { p_perro_id: perroBPL.id, p_fecha: hoyH, p_notas: "prueba F3" });
  const D3 = suma(D2, 14);
  const revV = await c1.rpc("portal_requisitos_reserva", argsPL(D3));
  comprobar(claves(revV).includes("sanitario") && !claves(revV).includes("evaluacion"), `por vacuna: ya solo falta lo sanitario (${JSON.stringify(claves(revV))})`);
  const pideVac = await c1.rpc("portal_pedir_lugar", { ...argsPL(D3), p_recoleccion: null });
  comprobar(!pideVac.error, `por vacuna: deja la solicitud ${msg(pideVac)}`);
  if (pideVac.data?.id) creados.solicitudes.push(pideVac.data.id);
  const sinMotivoRechazo = await recepPL.rpc("solicitud_rechazar", { p_id: pideVac.data?.id, p_motivo: " " });
  comprobar(Boolean(sinMotivoRechazo.error), "rechazar pide motivo");
  const rechazoPL = await recepPL.rpc("solicitud_rechazar", { p_id: pideVac.data?.id, p_motivo: "Esa semana cerramos por remodelación" });
  comprobar(!rechazoPL.error && rechazoPL.data?.estado === "rechazada", `recepción la rechaza ${msg(rechazoPL)}`);
  const { data: misTras } = await c1.rpc("mis_solicitudes");
  comprobar((misTras ?? []).find((s) => s.id === pideVac.data?.id)?.motivo_rechazo?.includes("remodelación"), "el dueño ve el motivo");
  comprobar((await avisoDe(pideVac.data?.id)).some((a) => /remodelación/.test(a.cuerpo)), "y le llega el aviso con el motivo");

  // Por contrato: con vacunas al día, solo falta firmar. Firmado, se reserva directo.
  const { data: tiposSan } = await S.from("tipos_requisito_sanitario").select("id").eq("negocio_id", H).is("deleted_at", null);
  for (const t of tiposSan ?? []) await S.from("requisitos_sanitarios_aplicados").insert({ negocio_id: H, perro_id: perroBPL.id, tipo_requisito_id: t.id, fecha_aplicacion: suma(hoyH, -3), detalle: "Prueba F3" });
  const D4 = suma(D2, 28);
  const revK = await c1.rpc("portal_requisitos_reserva", argsPL(D4));
  comprobar(JSON.stringify(claves(revK)) === JSON.stringify(["contrato"]), `por contrato: solo falta firmar (${JSON.stringify(claves(revK))}) ${msg(revK)}`);
  const sinFirma = await c1.rpc("portal_reservar", { p_perro: perroBPL.id, p_servicio: guarderia.id, p_entrada: D4, p_salida: suma(D4, 1) });
  comprobar(/firmar el contrato/i.test(msg(sinFirma)), `reservar sin firmar se rechaza («${msg(sinFirma).slice(0, 60)}»)`);
  const pideK = await c1.rpc("portal_pedir_lugar", { ...argsPL(D4), p_recoleccion: null });
  comprobar(!pideK.error, `por contrato: deja la solicitud ${msg(pideK)}`);
  if (pideK.data?.id) creados.solicitudes.push(pideK.data.id);
  // Aceptada sin excepción (el contrato no la necesita): queda reserva y contrato por firmar.
  const aceptaK = await recepPL.rpc("solicitud_aceptar", { p_id: pideK.data?.id, p_motivo: null });
  comprobar(!aceptaK.error && aceptaK.data?.estancia_id, `recepción la aceptaPL sin excepción ${msg(aceptaK)}`);
  if (aceptaK.data?.estancia_id) { creados.estancias.push(aceptaK.data.estancia_id); creados.reservas.push(aceptaK.data.reserva_id); }
  const preparados = await c1.rpc("portal_preparar_contratos", { p_perro: perroBPL.id });
  comprobar(!preparados.error && (preparados.data ?? []).length > 0, `«Firmar aquí» deja el contrato listo (${(preparados.data ?? []).length}) ${msg(preparados)}`);
  for (const k of preparados.data ?? []) {
    creados.contratos.push(k.id);
    const f = await S.from("contratos").update({ estado: "firmado_papel", storage_path: "prueba/f3.pdf", hash_pdf: "prueba", fecha_firma: new Date().toISOString(), subido_por: datos.adminB }).eq("id", k.id);
    if (f.error) mal(`firmar en papel: ${f.error.message}`);
  }
  const D5 = suma(D2, 42);
  const yaLibre = await c1.rpc("portal_requisitos_reserva", argsPL(D5));
  comprobar(Array.isArray(yaLibre.data) && yaLibre.data.length === 0, `con todo al corriente no falta nada (${JSON.stringify(yaLibre.data)}) ${msg(yaLibre)}`);
  const nadaQuePedir = await c1.rpc("portal_pedir_lugar", { ...argsPL(D5), p_recoleccion: null });
  comprobar(Boolean(nadaQuePedir.error) && /reservar directo/i.test(msg(nadaQuePedir)), "y no deja pedir lugar: reserva directo");
  const { count: simuladas } = await S.from("estancias").select("id", { count: "exact", head: true }).eq("perro_id", perroBPL.id).eq("fecha_entrada", D5);
  comprobar(simuladas === 0, "revisar no dejó nada guardado");

  // Caducidad: a los 3 días, sola, con aviso; ya no se puede aceptar.
  const { data: perroCPL } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: `F3 ${sufijo} C`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id").single();
  creados.perros.push(perroCPL.id);
  const pideC = await c1.rpc("portal_pedir_lugar", { p_perro: perroCPL.id, p_servicio: guarderia.id, p_entrada: D3, p_salida: suma(D3, 1), p_horas: null, p_inicio: null, p_recoleccion: null });
  comprobar(!pideC.error, `otra solicitud ${msg(pideC)}`);
  if (pideC.data?.id) {
    creados.solicitudes.push(pideC.data.id);
    const horasFaltan = (Date.parse(pideC.data.expira_at) - Date.now()) / 3600000;
    comprobar(horasFaltan > 71 && horasFaltan <= 72, `caduca a los 3 días (${horasFaltan.toFixed(1)} h)`);
    const anonCad = await anonimo.rpc("solicitudes_caducar");
    comprobar(Boolean(anonCad.error), "la llave anónima no corre la caducidad");
    const admCad = await adm.rpc("solicitudes_caducar");
    comprobar(Boolean(admCad.error), "ni alguien con sesión");
    await S.from("solicitudes_reserva").update({ expira_at: new Date(Date.now() - 60000).toISOString() }).eq("id", pideC.data.id);
    const vencida = await adm.rpc("solicitud_aceptar", { p_id: pideC.data.id, p_motivo: "tarde" });
    comprobar(/caduc/i.test(msg(vencida)), `una vencida ya no se aceptaPL («${msg(vencida)}»)`);
    const cadPL = await S.rpc("solicitudes_caducar");
    comprobar(!cadPL.error && Number(cadPL.data) >= 1, `la tarea la caduca (${cadPL.data}) ${msg(cadPL)}`);
    const { data: filaC } = await S.from("solicitudes_reserva").select("estado").eq("id", pideC.data.id).single();
    comprobar(filaC?.estado === "caducada", "queda caducada");
    comprobar((await avisoDe(pideC.data.id)).some((a) => /caduc/i.test(a.titulo)), "y el dueño recibe el aviso");
  }
  // Anónimo y otro negocio.
  for (const [fn, a] of [["portal_requisitos_reserva", argsPL(D2)], ["portal_pedir_lugar", { ...argsPL(D2), p_recoleccion: null }], ["mis_solicitudes", {}], ["solicitudes_del_negocio", { p_solo_pendientes: false }], ["solicitud_aceptar", { p_id: idEval, p_motivo: null }]]) {
    const r = await anonimo.rpc(fn, a);
    comprobar(Boolean(r.error), `anónimo: ${fn} rechazada`);
  }
  const anonSol = await anonimo.from("solicitudes_reserva").select("id").limit(1);
  comprobar(Boolean(anonSol.error) || (anonSol.data ?? []).length === 0, "anónimo: solicitudes_reserva sin filas");

  // ── 5. Pagos pendientes y pases ─────────────────────────────────────────────────────────────────────────────
  seccion("5. Pagos pendientes y pases");
  const { data: pagos1 } = await c1.rpc("mis_pagos_pendientes");
  const pagoCita = (pagos1 ?? []).find((p) => p.reserva_id === cita.data?.reserva_id);
  comprobar(Boolean(pagoCita) && Number(pagoCita.saldo) === Number(fila?.precio), `C1 ve la cuenta de su cita con saldo ${pagoCita?.saldo} (precio ${fila?.precio}) y link ${pagoCita?.link ? "vigente" : "sin pedir"}`);
  const { data: pagos2 } = await c2.rpc("mis_pagos_pendientes");
  comprobar(!(pagos2 ?? []).some((p) => p.reserva_id === cita.data?.reserva_id), "C2 no ve esa cuenta");
  // Una sola fuente: con una corrección de precio en la cuenta de la cita, «Por pagar» de la app sigue al panel al centavo.
  {
    const { data: lineasC } = await adm.rpc("cuenta_lineas_estancia", { p_reserva_id: cita.data?.reserva_id });
    const linea = (lineasC ?? []).find((l) => l.tipo === "estetica");
    const nuevo = Math.max(1, Math.round(Number(linea?.total ?? 0) / 2));
    const aj = linea ? await S.from("cuenta_ajustes_precio").insert({ negocio_id: H, reserva_id: cita.data.reserva_id, linea_tipo: "estetica", linea_id: linea.origen_id, concepto: linea.descripcion, monto: nuevo - Number(linea.total), precio_antes: Number(linea.total), precio_despues: nuevo, motivo: "Prueba de una sola fuente F3" }).select("id").single() : { error: { message: "sin línea de la cita" } };
    if (aj.error) mal(`no se pudo poner la corrección de precio (${aj.error.message})`);
    else {
      creados.ajustes.push(aj.data.id);
      const t = (await adm.rpc("cuenta_totales_reserva", { p_reserva_id: cita.data.reserva_id })).data;
      const panel = Array.isArray(t) ? t[0] : t;
      const enApp = ((await c1.rpc("mis_pagos_pendientes")).data ?? []).find((x) => x.reserva_id === cita.data.reserva_id);
      comprobar(Boolean(enApp) && Number(enApp.saldo) === Number(panel?.saldo) && Number(panel?.saldo) === nuevo, `con una corrección de precio (${linea.total} → ${nuevo}), «Por pagar» de la app (${enApp?.saldo}) = panel (${panel?.saldo})`);
    }
  }
  const pases = await c1.rpc("mis_pases");
  comprobar(!pases.error && Array.isArray(pases.data) && !JSON.stringify(pases.data).includes("precio_pagado"), `mis_pases responde (${pases.data?.length ?? 0}) sin lo que se pagó`);
  const anonPagos = await anonimo.rpc("mis_pagos_pendientes");
  comprobar(Boolean(anonPagos.error) || (Array.isArray(anonPagos.data) && anonPagos.data.length === 0), `el anónimo no ve pagos (${anonPagos.status})`);

  // ── 6. Reseña verificada ────────────────────────────────────────────────────────────────────────────────────
  seccion("6. Reseña verificada");
  const antes = await c1.rpc("portal_resenar", { p_tipo: "estetica", p_id: cita.data?.cita_id, p_estrellas: 5, p_texto: "Antes de tiempo" });
  comprobar(Boolean(antes.error) && /cuando la visita termine/i.test(msg(antes)), `sobre una cita sin terminar: «${msg(antes)}»`);
  // La cita se da por terminada (como lo haría el negocio).
  const fin = await S.from("citas_estetica").update({ estado: "en_curso" }).eq("id", cita.data?.cita_id);
  const fin2 = fin.error ? fin : await S.from("citas_estetica").update({ estado: "finalizada" }).eq("id", cita.data?.cita_id);
  if (fin2.error) console.log(`    · no se pudo finalizar la cita (${fin2.error.message})`);
  const resC2r = await c2.rpc("portal_resenar", { p_tipo: "estetica", p_id: cita.data?.cita_id, p_estrellas: 1, p_texto: "no es mía" });
  comprobar(Boolean(resC2r.error), `C2 no opina de la cita de C1 («${msg(resC2r)}»)`);
  const rese = await c1.rpc("portal_resenar", { p_tipo: "estetica", p_id: cita.data?.cita_id, p_estrellas: 5, p_texto: `Muy bien ${sufijo}` });
  comprobar(!rese.error && rese.data?.id, `C1 opina de su cita terminada (${rese.error ? msg(rese) : rese.data.estrellas + " estrellas"})`);
  if (rese.data?.id) creados.resenas.push(rese.data.id);
  const repetida = await c1.rpc("portal_resenar", { p_tipo: "estetica", p_id: cita.data?.cita_id, p_estrellas: 4 });
  comprobar(Boolean(repetida.error) && /ya opinaste/i.test(msg(repetida)), `repetida: «${msg(repetida)}»`);
  const { data: mias } = await c1.from("resenas").select("id, estrellas, texto");
  comprobar((mias ?? []).some((r) => r.id === rese.data?.id), "C1 lee su reseña por la tabla");
  const { data: ajenas } = await c2.from("resenas").select("id").eq("id", rese.data?.id ?? "00000000-0000-0000-0000-000000000000");
  comprobar((ajenas ?? []).length === 0, "C2 no la lee");
  const resumen = await c1.rpc("resenas_de_negocio", { p_negocio: H });
  comprobar(Number(resumen.data?.total) >= 1 && (resumen.data?.ultimas ?? []).some((u) => (u.texto ?? "").includes(sufijo)), `resenas_de_negocio la cuenta (total ${resumen.data?.total}, promedio ${resumen.data?.promedio})`);
  const anonRes = await anonimo.rpc("resenas_de_negocio", { p_negocio: H });
  comprobar(Boolean(anonRes.error), `el anónimo no llama resenas_de_negocio (${anonRes.status}; la página pública la pedirá el servidor)`);
  // El personal puede contestar, no cambiar las estrellas.
  const resp = await adm.from("resenas").update({ respuesta: "¡Gracias!" }).eq("id", rese.data?.id).select("respuesta").maybeSingle();
  comprobar(!resp.error && resp.data?.respuesta === "¡Gracias!", `el admin contesta la reseña (${resp.error?.message ?? "ok"})`);
  const pisar = await adm.from("resenas").update({ estrellas: 1 }).eq("id", rese.data?.id);
  comprobar(Boolean(pisar.error), `pero no cambia las estrellas («${pisar.error?.message?.slice(0, 70)}»)`);

  // ── 7. Aislamiento entre negocios y anónimo ─────────────────────────────────────────────────────────────────
  seccion("7. Aislamiento");
  const otroNeg = enNegocio(t1, LUDOGTEKA_DEV);
  const { data: visOtro } = await otroNeg.rpc("mis_visitas");
  comprobar(!(visOtro ?? []).some((v) => v.id === cita.data?.cita_id), "con el encabezado de otro negocio, C1 no ve su cita de Huellitas");
  const pedirOtro = await otroNeg.rpc("portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: inicio });
  comprobar(Boolean(pedirOtro.error), `ni puede pedir ahí una cita con su perro de Huellitas («${msg(pedirOtro).slice(0, 60)}»)`);
  for (const [fn, args] of [["portal_confirmar_visita", { p_tipo: "estetica", p_id: cita.data?.cita_id }], ["portal_pedir_cita", { p_perro: perro.id, p_servicio: estetica.id, p_inicio: inicio }], ["portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) }], ["portal_resenar", { p_tipo: "estetica", p_id: cita.data?.cita_id, p_estrellas: 5 }], ["mis_pases", {}], ["mis_reportes_enviados", { p_perro: perro.id }]]) {
    const r = await anonimo.rpc(fn, args);
    comprobar(Boolean(r.error) || (Array.isArray(r.data) && r.data.length === 0), `anónimo: ${fn} ${r.error ? "rechazada " + r.status : "vacía"}`);
  }
  const { data: anonRese } = await anonimo.from("resenas").select("id").limit(1);
  comprobar(!anonRese || anonRese.length === 0, "anónimo: resenas sin filas");
} finally {
  // Limpieza (lo que creó esta corrida; nada más).
  const ahora = new Date().toISOString();
  for (const id of creados.resenas) await S.from("resenas").delete().eq("id", id);
  if (creados.solicitudes.length) {
    await S.from("solicitudes_reserva").update({ reserva_id: null, estancia_id: null, cita_id: null }).in("id", creados.solicitudes);
    await A.from("app_avisos").delete().in("datos->>origen_id", creados.solicitudes);
    await S.from("solicitudes_reserva").update({ deleted_at: ahora, estado: "cancelada" }).in("id", creados.solicitudes);
  }
  for (const id of creados.ajustes) await S.from("cuenta_ajustes_precio").delete().eq("id", id);
  for (const id of creados.contratos) await S.from("contratos").delete().eq("id", id);
  for (const id of creados.citas) await S.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.estancias) await S.from("estancias").delete().eq("id", id);
  for (const id of creados.reservas) await S.from("reservas").delete().eq("id", id);
  if (creados.cupo) await S.from("cupo_configuracion").delete().eq("id", creados.cupo);
  for (const id of creados.perros) {
    await S.from("contratos").delete().eq("perro_id", id);
    await S.from("requisitos_sanitarios_aplicados").delete().eq("perro_id", id);
    await S.from("perros_evaluaciones").delete().eq("perro_id", id);
    await S.from("perros").update({ deleted_at: ahora }).eq("id", id);
  }
  if (creados.perro) {
    await S.from("requisitos_sanitarios_aplicados").delete().eq("perro_id", creados.perro);
    await S.from("perros_evaluaciones").delete().eq("perro_id", creados.perro);
    await S.from("perros").update({ deleted_at: ahora }).eq("id", creados.perro);
  }
  await S.from("perros").update({ deleted_at: ahora }).eq("negocio_id", H).like("nombre", `F3% ${sufijo}`);
}
console.log(hallazgos.length ? `\n✘ App para dueños · Fase 3 (datos): ${hallazgos.length} hallazgo(s).` : "\n✔ App para dueños · Fase 3 (datos): todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
