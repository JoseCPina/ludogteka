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

const creados = { perro: null, reservas: [], citas: [], estancias: [], contratos: [], resenas: [], cupo: null };
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
  const encimada = await c1.rpc("portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: D, p_salida: suma(D, 1) });
  comprobar(Boolean(encimada.error), `la misma mascota encimada se rechaza («${msg(encimada).slice(0, 90)}»)`);
  const { data: tiposAlta } = await adm.rpc("tipos_contrato_de_alta", { p_tipo: "guarderia_hotel" });
  if ((tiposAlta ?? []).length) {
    comprobar((res.data?.contratos_por_firmar ?? []).length > 0, "el negocio tiene contrato de alta y quedó pendiente de firma en el mismo flujo");
    const { data: misContratos } = await c1.from("contratos").select("id, estado").eq("estado", "pendiente_firma").is("deleted_at", null);
    comprobar((misContratos ?? []).some((c) => (res.data?.contratos_por_firmar ?? []).some((x) => x.id === c.id)), "C1 lo ve entre sus contratos por firmar");
    const { data: ajenos } = await c2.from("contratos").select("id").in("id", (res.data?.contratos_por_firmar ?? []).map((x) => x.id));
    comprobar((ajenos ?? []).length === 0, "C2 no lo ve");
  } else ok("Huellitas no tiene contrato de alta para guardería/hotel: no hay contrato que generar (correcto)");
  const resC2 = await c2.rpc("portal_reservar", { p_perro: perro.id, p_servicio: guarderia.id, p_entrada: suma(D, 7), p_salida: suma(D, 8) });
  comprobar(Boolean(resC2.error) && /no es tuya/i.test(msg(resC2)), `C2 no reserva para el perro de C1 («${msg(resC2)}»)`);

  // ── 5. Pagos pendientes y pases ─────────────────────────────────────────────────────────────────────────────
  seccion("5. Pagos pendientes y pases");
  const { data: pagos1 } = await c1.rpc("mis_pagos_pendientes");
  const pagoCita = (pagos1 ?? []).find((p) => p.reserva_id === cita.data?.reserva_id);
  comprobar(Boolean(pagoCita) && Number(pagoCita.saldo) === Number(fila?.precio), `C1 ve la cuenta de su cita con saldo ${pagoCita?.saldo} (precio ${fila?.precio}) y link ${pagoCita?.link ? "vigente" : "sin pedir"}`);
  const { data: pagos2 } = await c2.rpc("mis_pagos_pendientes");
  comprobar(!(pagos2 ?? []).some((p) => p.reserva_id === cita.data?.reserva_id), "C2 no ve esa cuenta");
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
  for (const id of creados.contratos) await S.from("contratos").delete().eq("id", id);
  for (const id of creados.citas) await S.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.estancias) await S.from("estancias").delete().eq("id", id);
  for (const id of creados.reservas) await S.from("reservas").delete().eq("id", id);
  if (creados.cupo) await S.from("cupo_configuracion").delete().eq("id", creados.cupo);
  if (creados.perro) {
    await S.from("requisitos_sanitarios_aplicados").delete().eq("perro_id", creados.perro);
    await S.from("perros_evaluaciones").delete().eq("perro_id", creados.perro);
    await S.from("perros").update({ deleted_at: ahora }).eq("id", creados.perro);
  }
  await S.from("perros").update({ deleted_at: ahora }).eq("negocio_id", H).like("nombre", `F3% ${sufijo}`);
}
console.log(hallazgos.length ? `\n✘ App para dueños · Fase 3 (datos): ${hallazgos.length} hallazgo(s).` : "\n✔ App para dueños · Fase 3 (datos): todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
