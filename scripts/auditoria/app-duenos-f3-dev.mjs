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
//      mascota encimada se rechaza (traslape); si el negocio tiene contrato de alta, queda pendiente de firma y C1 lo ve
//      (el contrato NO es requisito para reservar: migración 20261203005000).
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

const creados = { cuentas: [], clientes: [], mascotasNuevas: [], perros: [], solicitudes: [], accesos: [], perro: null, reservas: [], citas: [], estancias: [], contratos: [], resenas: [], cupo: null, ajustes: [] };
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
  comprobar(!claves(revA).includes("contrato"), "el contrato sin firmar NO es requisito (se firma después de reservar)");
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

  // Con vacunas al día no falta nada: el contrato de alta NO es requisito (migración 20261203005000); se reserva directo
  // y queda por firmar después o ahí mismo, como siempre.
  const { data: tiposSan } = await S.from("tipos_requisito_sanitario").select("id").eq("negocio_id", H).is("deleted_at", null);
  for (const t of tiposSan ?? []) await S.from("requisitos_sanitarios_aplicados").insert({ negocio_id: H, perro_id: perroBPL.id, tipo_requisito_id: t.id, fecha_aplicacion: suma(hoyH, -3), detalle: "Prueba F3" });
  const D4 = suma(D2, 28);
  const revK = await c1.rpc("portal_requisitos_reserva", argsPL(D4));
  comprobar(Array.isArray(revK.data) && revK.data.length === 0, `con evaluación y vacunas no falta nada, aunque el contrato no esté firmado (${JSON.stringify(claves(revK))}) ${msg(revK)}`);
  const { data: tiposAltaPL } = await adm.rpc("tipos_contrato_de_alta", { p_tipo: "guarderia_hotel" });
  const sinFirma = await c1.rpc("portal_reservar", { p_perro: perroBPL.id, p_servicio: guarderia.id, p_entrada: D4, p_salida: suma(D4, 1) });
  comprobar(!sinFirma.error && sinFirma.data?.estancia_id, `reservar directo sin contrato firmado SÍ se puede ${msg(sinFirma)}`);
  if (sinFirma.data?.estancia_id) { creados.estancias.push(sinFirma.data.estancia_id); creados.reservas.push(sinFirma.data.reserva_id); for (const c of sinFirma.data.contratos_por_firmar ?? []) creados.contratos.push(c.id); }
  if ((tiposAltaPL ?? []).length) comprobar((sinFirma.data?.contratos_por_firmar ?? []).length > 0, "y el contrato queda por firmar (como siempre)");
  const D5 = suma(D2, 42);
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
  // ── Solicitud de CITA: lo que bloquea una cita (pelaje sin registrar, en un servicio que cobra por pelaje) deja solicitud; el negocio lo captura y acepta ──
  seccion("«Pedir lugar»: cita de estética");
  const { data: perroDPL } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: `F3 ${sufijo} D`, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: null }).select("id").single();
  creados.perros.push(perroDPL.id);
  // En Huellitas, «Baño estético rapado» cobra por pelaje: sin pelaje, la cita no se puede y deja solicitud.
  const esteticaPL = (servicios ?? []).find((x) => x.categoria === "estetica" && /rapado/i.test(x.nombre)) ?? estetica;
  let diaCitaPL = null, horasPL = null;
  for (let d = 11; d <= 30 && !diaCitaPL; d++) {
    const fecha = suma(hoyH, d);
    const { data } = await c1.rpc("portal_horas_disponibles", { p_servicio: esteticaPL.id, p_fecha: fecha });
    if (data?.abre && (data.horas ?? []).length > 1) { diaCitaPL = fecha; horasPL = data; }
  }
  const inicioPL = horasPL?.horas?.[0]?.inicio;
  comprobar(Boolean(inicioPL), `hay una hora libre para la cita (${diaCitaPL} ${horasPL?.horas?.[0]?.hora})`);
  const argsCita = { p_perro: perroDPL.id, p_servicio: esteticaPL.id, p_entrada: null, p_salida: null, p_horas: null, p_inicio: inicioPL };
  const revCita = await c1.rpc("portal_requisitos_reserva", argsCita);
  comprobar(!revCita.error && claves(revCita).includes("pelaje"), `cita sin pelaje registrado (servicio que cobra por pelaje): lo dice (${JSON.stringify(claves(revCita))}) ${msg(revCita)}`);
  comprobar(!JSON.stringify(revCita.data ?? []).includes("contrato"), "y no pide contrato");
  const pideCita = await c1.rpc("portal_pedir_lugar", { ...argsCita, p_recoleccion: null });
  comprobar(!pideCita.error && pideCita.data?.estado === "pendiente", `deja la solicitud de cita ${msg(pideCita)}`);
  const idCita = pideCita.data?.id ?? "00000000-0000-0000-0000-000000000000";
  if (pideCita.data?.id) creados.solicitudes.push(pideCita.data.id);
  const { data: filaCita } = await S.from("solicitudes_reserva").select("tipo, inicio, fecha_entrada").eq("id", idCita).maybeSingle();
  comprobar(filaCita?.tipo === "cita" && Boolean(filaCita?.inicio) && !filaCita?.fecha_entrada, "es de tipo cita, con su hora");
  const { count: citasD } = await S.from("citas_estetica").select("id", { count: "exact", head: true }).eq("perro_id", perroDPL.id);
  comprobar(citasD === 0, "no crea la cita todavía");
  const { data: misCita } = await c1.rpc("mis_solicitudes");
  comprobar((misCita ?? []).some((x) => x.id === idCita && x.tipo === "cita"), "el dueño la ve entre sus solicitudes");
  const { data: delNegocio } = await adm.rpc("solicitudes_del_negocio", { p_solo_pendientes: true });
  comprobar((delNegocio ?? []).some((x) => x.id === idCita), "el negocio la ve en Solicitudes");
  const aceptaSinPelaje = await adm.rpc("solicitud_aceptar", { p_id: idCita, p_motivo: null });
  comprobar(Boolean(aceptaSinPelaje.error), `aceptar sin resolver el pelaje: lo dice («${msg(aceptaSinPelaje).slice(0, 70)}»)`);
  await S.from("perros").update({ pelaje_id: pelo?.id }).eq("id", perroDPL.id);
  const aceptaCita = await adm.rpc("solicitud_aceptar", { p_id: idCita, p_motivo: null });
  comprobar(!aceptaCita.error && aceptaCita.data?.estado === "aceptada" && Boolean(aceptaCita.data?.cita_id), `con el pelaje capturado, aceptar la vuelve cita ${msg(aceptaCita)}`);
  if (aceptaCita.data?.cita_id) { creados.citas.push(aceptaCita.data.cita_id); creados.reservas.push(aceptaCita.data.reserva_id); }
  const { data: citaFila } = await S.from("citas_estetica").select("empleado_id, precio, estado, inicio").eq("id", aceptaCita.data?.cita_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  comprobar(Boolean(citaFila?.empleado_id) && Number(citaFila?.precio) > 0 && Date.parse(citaFila?.inicio ?? 0) === Date.parse(inicioPL), `la cita quedó a esa hora, con quien atiende y precio ${citaFila?.precio}`);
  const { data: visitasTras } = await c1.rpc("mis_visitas");
  comprobar(JSON.stringify(visitasTras ?? []).includes(aceptaCita.data?.cita_id ?? "nunca"), "y el dueño la ve en sus visitas");
  comprobar((await avisoDe(idCita)).some((a) => /aceptaron/i.test(a.titulo)), "con su aviso «Aceptaron tu solicitud»");

  // ── Solicitud con recolección: la cotización se consume al pedir y el cargo entra a la cuenta al aceptar ──────────
  seccion("«Pedir lugar» con recolección");
  const { data: servRec } = await S.from("servicios").select("id").eq("negocio_id", H).eq("clave", "recoleccion").is("deleted_at", null).maybeSingle();
  const DIR = `Calle F3 ${sufijo} 12`;
  let idRec = null;
  if (!servRec) ok("Huellitas no tiene el servicio «Recolección a domicilio»: se omite (recoleccion-dev lo arma y lo prueba)");
  else {
    const D6 = suma(D2, 56);
    const argsRec = { p_perro: perroCPL.id, p_servicio: guarderia.id, p_entrada: D6, p_salida: suma(D6, 1), p_horas: null, p_inicio: null };
    const cot = await S.rpc("recoleccion_cotizacion_registrar", { p_cliente: C1.cliente_id, p_direccion: DIR, p_punto: "negocio", p_lat: null, p_lng: null, p_km: 4, p_origen: "estimada" });
    comprobar(!cot.error && cot.data?.cotizacion_id, `cotización registrada (4 km) ${msg(cot)}`);
    const sinCot = await c1.rpc("portal_pedir_lugar", { ...argsRec, p_recoleccion: { direccion: `Otra calle ${sufijo} 99`, punto: "negocio", hora: "09:00" } });
    comprobar(/no está cotizada/i.test(msg(sinCot)), `una dirección sin cotizar se rechaza («${msg(sinCot).slice(0, 60)}»)`);
    const pideRec = await c1.rpc("portal_pedir_lugar", { ...argsRec, p_recoleccion: { direccion: DIR, punto: "negocio", hora: "09:00", notas: "F3" } });
    comprobar(!pideRec.error && Boolean(pideRec.data?.id), `deja la solicitud con recolección ${msg(pideRec)}`);
    idRec = pideRec.data?.id ?? "00000000-0000-0000-0000-000000000000";
    if (pideRec.data?.id) creados.solicitudes.push(pideRec.data.id);
    const { data: filaRec } = await S.from("solicitudes_reserva").select("recoleccion").eq("id", idRec).maybeSingle();
    comprobar(Number(filaRec?.recoleccion?.km) === 4 && filaRec?.recoleccion?.direccion === DIR && filaRec?.recoleccion?.hora === "09:00", "con la dirección, la hora y los km de su cotización");
    const { data: cotUsada } = await S.from("recoleccion_cotizaciones").select("usada_at").eq("id", cot.data?.cotizacion_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
    comprobar(Boolean(cotUsada?.usada_at), "la cotización se consumió (un solo uso)");
    const { data: cargosAntes } = await S.from("cargos_aplicados").select("id").eq("perro_id", perroCPL.id).is("deleted_at", null);
    comprobar((cargosAntes ?? []).length === 0, "sin cargo todavía");
    const aceptaRec = await adm.rpc("solicitud_aceptar", { p_id: idRec, p_motivo: "Prueba F3: recolección" });
    comprobar(!aceptaRec.error && Boolean(aceptaRec.data?.estancia_id), `aceptar con excepción la vuelve reserva ${msg(aceptaRec)}`);
    if (aceptaRec.data?.estancia_id) { creados.estancias.push(aceptaRec.data.estancia_id); creados.reservas.push(aceptaRec.data.reserva_id); }
    const reservaRec = aceptaRec.data?.reserva_id ?? "00000000-0000-0000-0000-000000000000";
    const { data: recs } = await S.from("recolecciones").select("*").eq("reserva_id", reservaRec).is("deleted_at", null);
    comprobar((recs ?? []).length === 1 && Number(recs?.[0]?.km) === 4 && recs?.[0]?.direccion === DIR, `queda la recolección de la reserva (${recs?.length ?? 0}, ${recs?.[0]?.km} km)`);
    const { data: cargosRec } = await S.from("cargos_aplicados").select("*").eq("perro_id", perroCPL.id).is("deleted_at", null);
    comprobar((cargosRec ?? []).some((c) => /Recolección a domicilio/i.test(JSON.stringify(c))), `el cargo de recolección entró a la cuenta al aceptar (${(cargosRec ?? []).length} cargo(s))`);
    const totRec = (await adm.rpc("cuenta_totales_reserva", { p_reserva_id: reservaRec })).data;
    const t0 = Array.isArray(totRec) ? totRec[0] : totRec;
    const { data: lineasRec } = await adm.rpc("cuenta_lineas_estancia", { p_reserva_id: reservaRec });
    comprobar(JSON.stringify(lineasRec ?? []).match(/recolecci/i) && Number(t0?.total_cuenta) === (lineasRec ?? []).reduce((a, l) => a + Number(l.total), 0), `y la cuenta lo suma (total ${t0?.total_cuenta})`);
  }

  // ── Acceso compartido: C2 con acceso a la mascota de C1 revisa, cotiza y pide lugar igual que el titular ────────────
  seccion("Acceso compartido");
  const { data: acceso, error: eAcc } = await S.from("perro_accesos_compartidos").insert({ negocio_id: H, perro_id: perroCPL.id, cliente_id: C2.cliente_id, notas: "Prueba F3", updated_at: new Date().toISOString() }).select("id").single();
  if (eAcc) mal(`no se pudo dar acceso compartido: ${eAcc.message}`);
  else {
    creados.accesos.push(acceso.id);
    const D7 = suma(D2, 70);
    const argsC2 = { p_perro: perroCPL.id, p_servicio: guarderia.id, p_entrada: D7, p_salida: suma(D7, 1), p_horas: null, p_inicio: null };
    const revC2 = await c2.rpc("portal_requisitos_reserva", argsC2);
    comprobar(!revC2.error && claves(revC2).includes("evaluacion"), `C2 con acceso compartido revisa qué falta (${JSON.stringify(claves(revC2))}) ${msg(revC2)}`);
    if (servRec) {
      const DIR2 = `Calle F3 ${sufijo} 34`;
      const cotC2 = await c2.rpc("recoleccion_cotizar", { p_cliente: C2.cliente_id, p_direccion: DIR2, p_lat: null, p_lng: null, p_punto: "negocio" });
      comprobar(!cotC2.error, `C2 cotiza la recolección con su propio expediente ${msg(cotC2)}`);
      const reg2 = await S.rpc("recoleccion_cotizacion_registrar", { p_cliente: C2.cliente_id, p_direccion: DIR2, p_punto: "negocio", p_lat: null, p_lng: null, p_km: 3, p_origen: "estimada" });
      comprobar(!reg2.error, `cotización de C2 registrada (3 km) ${msg(reg2)}`);
      const pideC2 = await c2.rpc("portal_pedir_lugar", { ...argsC2, p_recoleccion: { direccion: DIR2, punto: "negocio", hora: "10:00" } });
      comprobar(!pideC2.error && Boolean(pideC2.data?.id), `C2 pide lugar con la recolección que él cotizó ${msg(pideC2)}`);
      const idC2 = pideC2.data?.id ?? "00000000-0000-0000-0000-000000000000";
      if (pideC2.data?.id) creados.solicitudes.push(pideC2.data.id);
      const { data: filaC2 } = await S.from("solicitudes_reserva").select("cliente_id, recoleccion").eq("id", idC2).maybeSingle();
      comprobar(filaC2?.cliente_id === C2.cliente_id && Number(filaC2?.recoleccion?.km) === 3, "la solicitud es de C2, con sus km");
      const cancelC2 = await c2.rpc("portal_cancelar_solicitud", { p_id: idC2 });
      comprobar(cancelC2.data?.estado === "cancelada", `y C2 la cancela ${msg(cancelC2)}`);
    } else {
      const pideC2 = await c2.rpc("portal_pedir_lugar", { ...argsC2, p_recoleccion: null });
      comprobar(!pideC2.error && Boolean(pideC2.data?.id), `C2 pide lugar para la mascota compartida ${msg(pideC2)}`);
      if (pideC2.data?.id) creados.solicitudes.push(pideC2.data.id);
    }
    await S.from("perro_accesos_compartidos").update({ deleted_at: new Date().toISOString() }).eq("id", acceso.id);
    const D8 = suma(D2, 84);
    const sinAcceso = await c2.rpc("portal_requisitos_reserva", { ...argsC2, p_entrada: D8, p_salida: suma(D8, 1) });
    comprobar(Boolean(sinAcceso.error) && /no es tuya/i.test(msg(sinAcceso)), "sin el acceso, ya no");
  }

  // Anónimo y otro negocio.
  for (const [fn, a] of [["portal_requisitos_reserva", argsPL(D2)], ["portal_pedir_lugar", { ...argsPL(D2), p_recoleccion: null }], ["mis_solicitudes", {}], ["solicitudes_del_negocio", { p_solo_pendientes: false }], ["solicitud_aceptar", { p_id: idEval, p_motivo: null }]]) {
    const r = await anonimo.rpc(fn, a);
    comprobar(Boolean(r.error), `anónimo: ${fn} rechazada`);
  }
  const anonSol = await anonimo.from("solicitudes_reserva").select("id").limit(1);
  comprobar(Boolean(anonSol.error) || (anonSol.data ?? []).length === 0, "anónimo: solicitudes_reserva sin filas");

  // ── Cliente nuevo: hacerse cliente desde la app ─────────────────────────────────────────────────────────────────
  seccion("Cliente nuevo");
  {
    const telNuevo = `4429${String(Date.now()).slice(-6)}`;
    const { data: uNuevo, error: eU } = await A.auth.admin.createUser({ email: `t${telNuevo}@telefono.ludogteka.mx`, email_confirm: true, user_metadata: { nombre_completo: `F3 Nuevo ${sufijo}` } });
    if (eU) throw new Error(`cuenta nueva: ${eU.message}`);
    const idNuevo = uNuevo.user.id;
    creados.cuentas.push(idNuevo);
    await A.from("duenos").upsert({ id: idNuevo, telefono: telNuevo, nombre: `F3 Nuevo ${sufijo}` });
    const { data: maNueva, error: eM } = await A.from("mascotas").insert({ dueno_id: idNuevo, nombre: `Nueva ${sufijo}`, especie: "perro", raza_texto: "Poodle", fecha_nacimiento: "2023-01-15", origen: "app", microchip: "NO-SE-COMPARTE" }).select("id").single();
    if (eM) throw new Error(`mascota nueva: ${eM.message}`);
    await A.from("mascotas_cartilla").insert({ mascota_id: maNueva.id, tipo: "vacuna", nombre: "Antirrábica", fecha_aplicacion: suma(hoyH, -30), fuente: "manual" });
    let Dn = suma(hoyH, 620 + Math.floor(Math.random() * 40));
    while (new Date(`${Dn}T12:00:00Z`).getUTCDay() !== 3) Dn = suma(Dn, 1);
    const pedirNuevo = (o = {}) => S.rpc("app_pedir_cliente_nuevo", { p_dueno: idNuevo, p_mascota: maNueva.id, p_servicio: guarderia.id, p_entrada: Dn, p_salida: suma(Dn, 1), p_horas: null, p_inicio: null, p_recoleccion: null, p_consentido: true, ...o });
    const tNuevo = await tokenDe(idNuevo);
    const cNuevo = enNegocio(tNuevo);
    const directoJwt = await cNuevo.rpc("app_pedir_cliente_nuevo", { p_dueno: idNuevo, p_mascota: maNueva.id, p_servicio: guarderia.id, p_entrada: Dn, p_salida: suma(Dn, 1), p_horas: null, p_inicio: null, p_recoleccion: null, p_consentido: true });
    comprobar(Boolean(directoJwt.error), "con su JWT no llama directo a la base: va por el servidor");
    const anonNuevo = await anonimo.rpc("app_pedir_cliente_nuevo", { p_dueno: idNuevo, p_mascota: maNueva.id, p_servicio: guarderia.id, p_entrada: Dn, p_salida: suma(Dn, 1), p_horas: null, p_inicio: null, p_recoleccion: null, p_consentido: true });
    comprobar(Boolean(anonNuevo.error), "la llave anónima tampoco");
    const sinConsentir = await pedirNuevo({ p_consentido: false });
    comprobar(/datos se comparten/i.test(msg(sinConsentir)), `sin confirmar qué se comparte, no se envía («${msg(sinConsentir).slice(0, 50)}»)`);
    const ajena = await pedirNuevo({ p_dueno: C2.profile_id });
    comprobar(ajena.error?.code === "42501", `con la mascota de otro dueño, no (${msg(ajena).slice(0, 40)})`);
    const yaCliente = await S.rpc("app_pedir_cliente_nuevo", { p_dueno: C1.profile_id, p_mascota: vinculo.mascota_id, p_servicio: guarderia.id, p_entrada: Dn, p_salida: suma(Dn, 1), p_horas: null, p_inicio: null, p_recoleccion: null, p_consentido: true });
    comprobar(/ya es cliente/i.test(msg(yaCliente)), `mascota ya cliente: no crea solicitud de cliente nuevo («${msg(yaCliente).slice(0, 50)}»)`);
    // Ajuste apagado.
    const recepNuevo = enNegocio(await tokenDe(datos.recepcionB));
    const recepAjuste = await recepNuevo.rpc("negocio_fijar_acepta_clientes_app", { p_acepta: false });
    comprobar(recepAjuste.error?.code === "42501", "recepción no cambia el ajuste");
    const apaga = await adm.rpc("negocio_fijar_acepta_clientes_app", { p_acepta: false });
    comprobar(!apaga.error, `el admin lo apaga ${msg(apaga)}`);
    const conApagado = await pedirNuevo();
    comprobar(/por WhatsApp/i.test(msg(conApagado)), `con el ajuste apagado no se envía («${msg(conApagado)}»)`);
    await adm.rpc("negocio_fijar_acepta_clientes_app", { p_acepta: true });

    // Rechazada.
    const uno = await pedirNuevo();
    comprobar(!uno.error && uno.data?.estado === "pendiente", `deja la solicitud ${msg(uno)}`);
    if (uno.data?.id) creados.solicitudes.push(uno.data.id);
    const { data: filaUno } = await S.from("solicitudes_reserva").select("cliente_id, perro_id, reserva_id, datos_compartidos, es_cliente_nuevo").eq("id", uno.data?.id).single();
    comprobar(filaUno?.es_cliente_nuevo && !filaUno.cliente_id && !filaUno.perro_id && !filaUno.reserva_id, "sin cliente, expediente ni reserva hasta aceptar");
    const claves = Object.keys(filaUno?.datos_compartidos?.mascota ?? {}).sort().join(",");
    comprobar(claves === "especie,especie_detalle,fecha_nacimiento,foto_path,nombre,raza", `de la mascota solo va lo acordado (${claves})`);
    comprobar(!JSON.stringify(filaUno?.datos_compartidos).includes("NO-SE-COMPARTE") && filaUno?.datos_compartidos?.cartilla?.length === 1, "ni un dato de más, y con su cartilla");
    const repetidaN = await pedirNuevo();
    comprobar(/ya pediste/i.test(msg(repetidaN)), "no se repite con la misma mascota");
    const { data: tabN } = await adm.rpc("tablero_atencion", { p_grupo: "general" });
    comprobar((tabN?.solicitudes ?? []).some((s) => s.id === uno.data?.id && s.es_cliente_nuevo && s.perro_nombre === `Nueva ${sufijo}`), "sale en «Necesita atención» como cliente nuevo, con su nombre");
    const leeNegocio = await cNuevo.from("clientes").select("id").limit(1);
    comprobar((leeNegocio.data ?? []).length === 0, "quien pide no lee clientes del negocio");
    const leeSol = await cNuevo.from("solicitudes_reserva").select("id").eq("id", uno.data?.id);
    comprobar((leeSol.data ?? []).length === 0, "ni la tabla de solicitudes");
    // Otro negocio y otro dueño.
    const { data: adminLudo } = await A.from("membresias").select("profile_id").eq("negocio_id", "10000000-0000-4000-8000-000000000001").eq("rol", "admin").is("deleted_at", null).limit(1).single();
    const ludo = enNegocio(await tokenDe(adminLudo.profile_id), "10000000-0000-4000-8000-000000000001");
    const { data: veLudo } = await ludo.rpc("solicitudes_del_negocio", { p_solo_pendientes: false });
    comprobar(!(veLudo ?? []).some((s) => s.id === uno.data?.id), "otro negocio no la ve");
    const aceptaLudo = await ludo.rpc("solicitud_aceptar", { p_id: uno.data?.id });
    comprobar(Boolean(aceptaLudo.error), "ni la acepta");
    const otroDueno = await S.rpc("app_cancelar_cliente_nuevo", { p_id: uno.data?.id, p_dueno: C2.profile_id });
    comprobar(Boolean(otroDueno.error), "otro dueño no la cancela");
    const rechazaN = await recepNuevo.rpc("solicitud_rechazar", { p_id: uno.data?.id, p_motivo: "No tenemos lugar para nuevos este mes" });
    comprobar(!rechazaN.error && rechazaN.data?.estado === "rechazada", `rechazada ${msg(rechazaN)}`);
    const avisos = async (id) => (await A.from("app_avisos").select("titulo, cuerpo").eq("dueno_id", idNuevo).eq("datos->>origen_id", id)).data ?? [];
    comprobar((await avisos(uno.data?.id)).some((a) => /no tenemos lugar/i.test(a.cuerpo)), "el dueño recibe el motivo en Avisos");
    const { count: perrosTras } = await S.from("perros").select("id", { count: "exact", head: true }).eq("nombre", `Nueva ${sufijo}`);
    comprobar(perrosTras === 0, "rechazada no crea expediente");

    // Caducada.
    const dos = await pedirNuevo();
    comprobar(!dos.error, `otra solicitud ${msg(dos)}`);
    if (dos.data?.id) {
      creados.solicitudes.push(dos.data.id);
      await S.from("solicitudes_reserva").update({ expira_at: new Date(Date.now() - 60000).toISOString() }).eq("id", dos.data.id);
      const cadN = await S.rpc("solicitudes_caducar");
      comprobar(!cadN.error, `la tarea corre ${msg(cadN)}`);
      const { data: fD } = await S.from("solicitudes_reserva").select("estado").eq("id", dos.data.id).single();
      comprobar(fD?.estado === "caducada" && (await avisos(dos.data.id)).some((a) => /caduc/i.test(a.titulo)), "caducada, con aviso al dueño");
    }

    // Aceptada: sin permiso no entra y no deja nada; con permiso crea todo y no duplica la mascota.
    const tres = await pedirNuevo();
    if (tres.data?.id) creados.solicitudes.push(tres.data.id);
    const sinPermiso = await recepNuevo.rpc("solicitud_aceptar", { p_id: tres.data?.id });
    if (sinPermiso.error) {
      comprobar(/evaluaci|requisito|vigente|falta/i.test(msg(sinPermiso)), `sin el permiso, recepción no la acepta si falta algo («${msg(sinPermiso).slice(0, 70)}»)`);
      const { count: tras } = await S.from("perros").select("id", { count: "exact", head: true }).eq("nombre", `Nueva ${sufijo}`);
      comprobar(tras === 0, "y no deja un expediente a medias");
    }
    const { count: mascotasAntes } = await A.from("mascotas").select("id", { count: "exact", head: true }).eq("dueno_id", idNuevo).is("deleted_at", null);
    const aceptaN = sinPermiso.error ? await adm.rpc("solicitud_aceptar", { p_id: tres.data?.id, p_tamano: talla?.id, p_pelaje: pelo?.id }) : sinPermiso;
    comprobar(!aceptaN.error && aceptaN.data?.estado === "aceptada" && aceptaN.data?.estancia_id, `aceptada ${msg(aceptaN)}`);
    if (aceptaN.data?.estancia_id) { creados.estancias.push(aceptaN.data.estancia_id); creados.reservas.push(aceptaN.data.reserva_id); creados.perros.push(aceptaN.data.perro_id); creados.clientes.push(aceptaN.data.cliente_id); }
    const { data: cliN } = await S.from("clientes").select("nombre, telefono").eq("id", aceptaN.data?.cliente_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
    comprobar(cliN?.telefono === telNuevo, "crea al cliente con su teléfono");
    const { data: perroN } = await S.from("perros").select("nombre, raza, raza_id, fecha_nacimiento, tamano_id, microchip").eq("id", aceptaN.data?.perro_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
    comprobar(perroN?.nombre === `Nueva ${sufijo}` && perroN?.fecha_nacimiento === "2023-01-15" && perroN?.tamano_id === talla?.id, "crea el expediente con lo compartido y la talla escogida");
    comprobar(!perroN?.microchip, "sin lo que no se compartió");
    const { data: vN, error: eVN } = await S.from("mascotas_vinculos").select("mascota_id").eq("perro_id", aceptaN.data?.perro_id ?? "00000000-0000-0000-0000-000000000000").is("deleted_at", null);
    comprobar(vN?.length === 1 && vN[0].mascota_id === maNueva.id, `liga la misma mascota de la app ${eVN?.message ?? ""}`);
    const { count: mascotasDesp } = await A.from("mascotas").select("id", { count: "exact", head: true }).eq("dueno_id", idNuevo).is("deleted_at", null);
    comprobar(mascotasAntes === 1 && mascotasDesp === 1, `la mascota global no se duplica (${mascotasAntes} → ${mascotasDesp})`);
    const { data: memN } = await S.from("membresias").select("rol, cliente_id").eq("negocio_id", H).eq("profile_id", idNuevo).is("deleted_at", null);
    comprobar(memN?.length === 1 && memN[0].rol === "cliente", "queda con su membresía de cliente");
    const { data: vincN } = await sinNegocio(tNuevo).rpc("app_mis_vinculos");
    comprobar((vincN ?? []).some((v) => v.mascota_id === maNueva.id && v.negocio_id === H), "y ya lo ve en su app como su negocio");
    const { data: kN } = await S.from("contratos").select("id, estado").eq("perro_id", aceptaN.data?.perro_id ?? "00000000-0000-0000-0000-000000000000").is("deleted_at", null);
    comprobar((kN ?? []).some((k) => k.estado === "pendiente_firma"), "con el contrato de alta pendiente");
    for (const k of kN ?? []) creados.contratos.push(k.id);
    comprobar((await avisos(tres.data?.id)).some((a) => /aceptaron/i.test(a.titulo)), "el dueño recibe «Aceptaron tu solicitud»");
    const otraMas = await pedirNuevo({ p_entrada: suma(Dn, 14), p_salida: suma(Dn, 15) });
    comprobar(/ya es cliente/i.test(msg(otraMas)), "después ya es cliente: no vuelve a pedirlo");
    const { data: dineroN } = await cNuevo.from("cargos_aplicados").select("id").limit(1);
    comprobar((dineroN ?? []).length === 0, "sin leer dinero");
    creados.mascotasNuevas.push(maNueva.id);
  }

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
  if (creados.perros.length) {
    await S.from("recolecciones").delete().in("perro_id", creados.perros);
    await S.from("cargos_aplicados").delete().in("perro_id", creados.perros);
  }
  if (creados.accesos.length) await S.from("perro_accesos_compartidos").delete().in("id", creados.accesos);
  await S.from("recoleccion_cotizaciones").delete().like("direccion_norm", `%f3 ${sufijo.toLowerCase()}%`);
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
  for (const id of creados.clientes) {
    await S.from("membresias").delete().eq("negocio_id", H).eq("cliente_id", id);
    await S.from("clientes").update({ deleted_at: ahora }).eq("id", id);
  }
  for (const id of creados.cuentas) {
    await S.from("membresias").delete().eq("negocio_id", H).eq("profile_id", id);
    await A.from("app_avisos").delete().eq("dueno_id", id);
    await S.from("recoleccion_cotizaciones").delete().eq("dueno_id", id);
    await S.from("solicitudes_reserva").update({ dueno_id: null, mascota_id: null, es_cliente_nuevo: false, deleted_at: ahora, cliente_id: C1.cliente_id, perro_id: creados.perro }).eq("dueno_id", id);
    await A.from("mascotas").delete().eq("dueno_id", id);
    await A.from("duenos").delete().eq("id", id);
    await A.auth.admin.deleteUser(id);
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
