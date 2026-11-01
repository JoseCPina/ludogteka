// Tiempo de las cuatro pantallas del panel en PRODUCCIÓN, solo lectura: Recepción (/recepcion), Hotel (/hotel), Agenda
// de estética (/estetica) e Inicio del panel (/admin), con el negocio de la demo (Patitas & Co.) y con Ludogteka.
//
//   node scripts/auditoria/tiempo-panel-prod.mjs [--negocios patitasyco,ludogteka] [--muestras 3] [--sin-consultas]
//
// Por pantalla: tiempo hasta los encabezados (lo que tarda el servidor en armarla: TTFB) y hasta el final del cuerpo,
// varias muestras (se reporta la mediana y la mínima). Después, el desglose: cada consulta y función de la base que
// esa pantalla pide (la misma lista que el código: layout del personal + la pantalla), medida UNA por UNA con el JWT de
// la misma persona y el encabezado del negocio, como las manda la app; se resta la ida y vuelta mínima desde aquí
// (medida con `fecha_negocio`) para quedarse con lo que cuesta la consulta en sí. Nada se escribe: solo GET a las
// páginas y lecturas por la API. Deja el detalle en <temp>/tiempo-panel-prod-<slug>.json.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { servicioSinNegocio, sesionDe, llavesProd, URL_PROD } from "../lib/prod.mjs";

// Esta medición SÍ incluye a Ludogteka (lo pidió el dueño, 31 de octubre de 2026) y es solo lectura: GET a las páginas y
// SELECT/RPC de lectura con el JWT de la persona. Por eso arma aquí sus clientes en vez de usar los de prod.mjs, que se
// niegan a tocar Ludogteka (ese candado es para lo que escribe).
const servicioLectura = (negocioId) => createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocioId } } });
const comoPersona = (token, negocioId) => createClient(URL_PROD, llavesProd().anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": negocioId } } });

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const NEGOCIOS = arg("--negocios", "patitasyco,ludogteka").split(",");
const MUESTRAS = Number(arg("--muestras", "3"));
const SIN_CONSULTAS = process.argv.includes("--sin-consultas");

const S = servicioSinNegocio();
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const ms = (x) => `${Math.round(x)} ms`;
const hoyDe = (zona) => new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const sumaDias = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);

async function medirPagina(base, ruta, cookies) {
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const tiempos = [];
  for (let i = 0; i < MUESTRAS; i++) {
    const t0 = performance.now();
    const r = await fetch(base + ruta, { headers: { cookie, accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
    const tHead = performance.now() - t0;
    const html = await r.text();
    const tTotal = performance.now() - t0;
    tiempos.push({ status: r.status, head: tHead, total: tTotal, bytes: html.length, vercel: r.headers.get("x-vercel-id") ?? "", cache: r.headers.get("x-vercel-cache") ?? "" });
  }
  return tiempos;
}

// Las consultas de cada pantalla, tal como las pide el código (nombre → cómo pedirla). `c` es el cliente de la persona.
function consultasDe({ rol, hoy, modulos }) {
  const esAdmin = rol === "admin";
  const vet = modulos.includes("veterinaria");
  const layout = {
    "auth getUser (middleware y sesión)": null, // se mide aparte, con la API de Auth
    "rpc acceso_de_sesion (middleware)": (c) => c.rpc("acceso_de_sesion"),
    "rpc current_rol": (c) => c.rpc("current_rol"),
    "rpc mi_cliente_id": (c) => c.rpc("mi_cliente_id"),
    "rpc nombre_de_persona": (c, u) => c.rpc("nombre_de_persona", { p_profile: u, p_vacio: null }),
    "rpc modulos_activos": (c) => c.rpc("modulos_activos"),
    "rpc mis_permisos": (c) => c.rpc("mis_permisos"),
    ...(vet ? { "rpc acceso_veterinaria": (c) => c.rpc("acceso_veterinaria"), "rpc es_medico_veterinario": (c) => c.rpc("es_medico_veterinario") } : {}),
    "rpc negocio_publico (marca del layout)": (c) => c.rpc("negocio_publico"),
    "rpc mis_negocios": (c) => c.rpc("mis_negocios"),
    "tutoriales (videos del menú)": (c) => c.from("tutoriales").select("slug, rutas").is("deleted_at", null).limit(200),
    "rpc negocio_escribible": (c) => c.rpc("negocio_escribible"),
    "rpc estado_cobro": (c) => c.rpc("estado_cobro"),
    "rpc fecha_negocio": (c) => c.rpc("fecha_negocio"),
  };
  const columnas = "estancia_id, reserva_id, perro_id, perro_nombre, categoria, servicio_nombre";
  const tableroDia = {
    "llegadas_hoy": (c) => c.from("llegadas_hoy").select(columnas).order("perro_nombre"),
    "salidas_hoy": (c) => c.from("salidas_hoy").select(columnas).order("perro_nombre"),
    "quienes_estan_adentro": (c) => c.from("quienes_estan_adentro").select(columnas).order("perro_nombre"),
    "rpc calendario_ocupacion (hoy)": (c) => c.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hoy }),
    "citas_estetica (ayer a mañana)": (c) => c.from("citas_estetica").select("id, inicio, estado, empleado_id, updated_at, perros(nombre), servicio_nombre, servicios!citas_estetica_servicio_id_fkey(nombre)").is("deleted_at", null).gte("inicio", sumaDias(hoy, -1)).lt("inicio", sumaDias(hoy, 2)).order("inicio").order("id").limit(1000),
    "rpc listar_cuentas_sin_vincular": (c) => c.rpc("listar_cuentas_sin_vincular").order("id").limit(1000),
    "rpc minutos_retraso_cierre": (c) => c.rpc("minutos_retraso_cierre", { p_fecha: hoy }),
    "estancias próximas (7 días)": (c) => c.from("estancias").select("id, perro_id, fecha_entrada, reserva_id, created_at, perros(nombre, evaluacion_comportamiento_fecha)").in("estado", ["reservada", "confirmada"]).is("deleted_at", null).gte("fecha_entrada", hoy).lte("fecha_entrada", sumaDias(hoy, 7)).order("fecha_entrada").order("id").limit(1000),
    "turnos_caja abierto": (c) => c.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).limit(1),
    "requisitos_sanitarios_propuestos": (c) => c.from("requisitos_sanitarios_propuestos").select("id, created_at").eq("estado", "pendiente").is("deleted_at", null).order("created_at").order("id"),
    "turnos_caja último": (c) => c.from("turnos_caja").select("id, cerrado_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(1),
    "contratos_por_atender": (c) => c.from("contratos_por_atender").select("contrato_id, situacion, espera_desde").order("contrato_id"),
    "rpc estilistas_asignables": (c) => c.rpc("estilistas_asignables"),
    "rpc listar_personal_estetica": (c) => c.rpc("listar_personal_estetica"),
    "rpc citas_en_ausencia": (c) => c.rpc("citas_en_ausencia"),
    "perros_bajas pendientes": (c) => c.from("perros_bajas").select("id, perro_id, perro_nombre, motivo, created_at").eq("tipo", "solicitud").eq("resultado", "pendiente").is("deleted_at", null).order("created_at").limit(50),
    "rpc evaluacion_exigida": (c) => c.rpc("evaluacion_exigida"),
    "rpc cuentas_abiertas_json (120 días; saldos de salidas)": (c) => c.rpc("cuentas_abiertas_json", { p_dias: 120 }),
    "rpc razas_sin_grupo": (c) => c.rpc("razas_sin_grupo"),
    "rpc razas_propuestas_sin_grupo": (c) => c.rpc("razas_propuestas_sin_grupo"),
    "rpc gastos_por_atender": (c) => c.rpc("gastos_por_atender").order("id").limit(1000),
    ...(vet ? { "rpc veterinaria_atencion": (c) => c.rpc("veterinaria_atencion"), "rpc inventario_clinico_alertas": (c) => c.rpc("inventario_clinico_alertas"), "rpc permisos_establecimiento_por_vencer": (c) => c.rpc("permisos_establecimiento_por_vencer") } : {}),
    "rpc wa_fallos_atencion": (c) => c.rpc("wa_fallos_atencion"),
    "recordatorios_mensajes por atender": (c) => c.from("recordatorios_mensajes").select("tipo, created_at").is("deleted_at", null).is("atendido_at", null).neq("tipo", "baja").order("created_at").limit(200),
    "recordatorios_wa pausados (count)": (c) => c.from("recordatorios_wa").select("id", { count: "exact", head: true }).eq("estado", "pausado").is("deleted_at", null),
    "rpc reembolsos_por_atender": (c) => c.rpc("reembolsos_por_atender").order("id").limit(1000),
    "conciliacion_terminal abiertas": (c) => c.from("conciliacion_terminal").select("id, tipo, monto, detectada_at").is("resuelta_at", null).neq("tipo", "pago_ajeno").order("detectada_at").order("id").limit(1000),
    "mp_ordenes por confirmar": (c) => c.from("mp_ordenes").select("id, monto, created_at").eq("estado", "por_confirmar").is("deleted_at", null).order("created_at").order("id").limit(1000),
    ...(esAdmin ? { "rpc tarjetas_manuales_por_revisar": (c) => c.rpc("tarjetas_manuales_por_revisar", { p_historial: false }).order("id").limit(1000), "rpc tarjetas_manuales_atencion": (c) => c.rpc("tarjetas_manuales_atencion") } : {}),
    "rpc ajustes_servicio_por_atender": (c) => c.rpc("ajustes_servicio_por_atender").order("correccion_id").limit(1000),
    "rpc cfdi_atencion": (c) => c.rpc("cfdi_atencion"),
    "rpc extras_listar (hoy)": (c) => c.rpc("extras_listar", { p_fecha: hoy, p_estancia: null, p_solo_traslados: false }),
  };
  const hotel = {
    "llegadas_hoy (hotel)": (c) => c.from("llegadas_hoy").select(columnas).eq("categoria", "hotel").order("perro_nombre"),
    "salidas_hoy (hotel)": (c) => c.from("salidas_hoy").select(columnas).eq("categoria", "hotel").order("perro_nombre"),
    "quienes_estan_adentro (hotel)": (c) => c.from("quienes_estan_adentro").select(columnas).eq("categoria", "hotel").order("perro_nombre"),
    "rpc calendario_ocupacion (14 días)": (c) => c.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: sumaDias(hoy, 13) }),
    "estancias atrasadas (hotel)": (c) => c.from("estancias").select("id, reserva_id, fecha_entrada, updated_at, perros(nombre), servicios!inner(nombre, categoria)").is("deleted_at", null).is("hora_entrada_real", null).in("estado", ["reservada", "confirmada"]).lt("fecha_entrada", hoy).eq("servicios.categoria", "hotel").order("fecha_entrada").order("id").limit(21),
  };
  const estetica = {
    "rpc listar_personal_estetica": (c) => c.rpc("listar_personal_estetica"),
    "citas_estetica (semana)": (c) => c.from("citas_estetica").select("id, inicio, estado, fuera_de_horario, empleado_id, perros(nombre), servicio_nombre, servicios!citas_estetica_servicio_id_fkey(nombre)").is("deleted_at", null).gte("inicio", sumaDias(hoy, -1)).lt("inicio", sumaDias(hoy, 8)).order("inicio").order("id").limit(1000),
    "perros sin raza de catálogo (count)": (c) => c.from("perros").select("id", { count: "exact", head: true }).is("deleted_at", null).is("raza_id", null),
    "rpc citas_en_ausencia": (c) => c.rpc("citas_en_ausencia"),
    "recordatorios_wa de las citas": (c) => c.from("recordatorios_wa").select("ref_id, estado, respuesta, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
  };
  const ocupacion = {
    "rpc ocupacion_del_dia (hoy, diurno)": (c) => c.rpc("ocupacion_del_dia", { p_fecha: hoy, p_solo_hotel: false }),
    "rpc ocupacion_del_dia (hoy, hotel)": (c) => c.rpc("ocupacion_del_dia", { p_fecha: hoy, p_solo_hotel: true }),
    "rpc resolver_cupo_configuracion (hoy)": (c) => c.rpc("resolver_cupo_configuracion", { p_fecha: hoy }),
    "rpc calendario_ocupacion (1 día)": (c) => c.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: hoy }),
    "rpc calendario_ocupacion (3 días)": (c) => c.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: sumaDias(hoy, 2) }),
    "rpc calendario_ocupacion (14 días)": (c) => c.rpc("calendario_ocupacion", { p_desde: hoy, p_hasta: sumaDias(hoy, 13) }),
    "estancias vivas (count)": (c) => c.from("estancias").select("id", { count: "exact", head: true }).is("deleted_at", null),
    "rpc is_staff": (c) => c.rpc("is_staff"),
  };
  const admin = {
    "sucursales (ubicación)": (c) => c.from("sucursales").select("direccion, lat").is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle(),
    "rpc resolver_cupo_configuracion": (c) => c.rpc("resolver_cupo_configuracion"),
    ...(esAdmin ? { "rpc maps_consumo_mes": (c) => c.rpc("maps_consumo_mes"), "rpc mi_cobro": (c) => c.rpc("mi_cobro"), "rpc listar_cuentas": (c) => c.rpc("listar_cuentas").order("id").limit(1000), "rpc resolver_tope_descuento_recepcion": (c) => c.rpc("resolver_tope_descuento_recepcion"), "rpc evaluar_web_gratis": (c) => c.rpc("evaluar_web_gratis") } : {}),
    "rpc horario_semana_vigente": (c) => c.rpc("horario_semana_vigente"),
    "horario_semana (updated_at)": (c) => c.from("horario_semana").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    "negocio_perfil": (c) => c.from("negocio_perfil").select("direccion").is("deleted_at", null).maybeSingle(),
    "servicios (huecos de tarifa)": (c) => c.from("servicios").select("id, nombre, categoria").is("deleted_at", null).limit(500),
    "grupos_raza": (c) => c.from("grupos_raza").select("id, nombre, depende_tamano, depende_pelaje, pelajes_permitidos").is("deleted_at", null).order("orden"),
    "tamanos_categoria": (c) => c.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    "tipos_pelaje": (c) => c.from("tipos_pelaje").select("id, etiqueta, clave").is("deleted_at", null).order("orden"),
    "tarifas_vigentes": (c) => c.from("tarifas_vigentes").select("servicio_id, grupo_raza_id, tamano_id, pelaje_id").limit(2000),
  };
  return { layout, tableroDia, hotel, estetica, admin, ocupacion };
}

async function medirConsultas(lista, c, uid, base) {
  const salida = [];
  for (const [nombre, fn] of Object.entries(lista)) {
    if (!fn) continue;
    let mejor = Infinity, filas = null, error = null;
    for (let i = 0; i < 2; i++) {
      const t0 = performance.now();
      const r = await fn(c, uid);
      const t = performance.now() - t0;
      if (r.error) { error = r.error.message; break; }
      mejor = Math.min(mejor, t);
      filas = Array.isArray(r.data) ? r.data.length : r.count ?? (r.data == null ? 0 : 1);
    }
    salida.push({ nombre, ms: error ? null : Math.max(0, mejor - base), bruto: error ? null : mejor, filas, error });
  }
  return salida;
}

const resumen = {};
for (const slug of NEGOCIOS) {
  const { data: negocio } = await S.from("negocios").select("id, slug, nombre, zona_horaria, dominio, url_publica").eq("slug", slug).maybeSingle();
  if (!negocio) { console.log(`No encontré el negocio ${slug}`); continue; }
  const base = negocio.url_publica?.replace(/\/$/, "") || (negocio.dominio ? `https://${negocio.dominio}` : `https://${slug}.peludesk.mx`);
  const dominioCookie = new URL(base).hostname;
  const N = servicioLectura(negocio.id);
  // Los módulos activos como los ve la app (`modulos_activos`: plan + lo que el admin prendió), con la sesión del admin.
  const { data: mAdmin } = await N.from("membresias").select("profile_id").eq("negocio_id", negocio.id).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1);
  const sAdmin = mAdmin?.length ? await sesionDe(mAdmin[0].profile_id, dominioCookie) : null;
  const modulos = sAdmin ? (((await comoPersona(sAdmin.token, negocio.id).rpc("modulos_activos")).data ?? []).map(String)) : [];
  const hoy = hoyDe(negocio.zona_horaria);
  console.log(`\n══ ${negocio.nombre} (${slug}) · ${base} · módulos: ${modulos.join(", ")} ══`);
  resumen[slug] = { base, modulos, roles: {} };
  for (const rol of ["recepcion", "admin"]) {
    const { data: m } = await N.from("membresias").select("profile_id").eq("negocio_id", negocio.id).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1);
    if (!m?.length) { console.log(`  · sin ${rol}`); continue; }
    const s = await sesionDe(m[0].profile_id, dominioCookie);
    const paginas = rol === "admin" ? ["/admin", "/recepcion", "/hotel", "/estetica"] : ["/recepcion", "/hotel", "/estetica"];
    console.log(`\n  ── ${rol} ──`);
    const porPagina = {};
    for (const ruta of paginas) {
      if (ruta === "/hotel" && !modulos.includes("hotel")) continue;
      if (ruta === "/estetica" && !modulos.includes("estetica")) continue;
      const t = await medirPagina(base, ruta, s.cookies);
      const head = t.map((x) => x.head), total = t.map((x) => x.total);
      porPagina[ruta] = { status: t[0].status, headMediana: mediana(head), headMin: Math.min(...head), totalMediana: mediana(total), bytes: t[0].bytes, muestras: t };
      console.log(`  ${ruta.padEnd(11)} ${String(t[0].status).padEnd(4)} servidor (TTFB) mediana ${ms(mediana(head)).padStart(8)} · mín ${ms(Math.min(...head)).padStart(8)} · total ${ms(mediana(total)).padStart(8)} · ${Math.round(t[0].bytes / 1024)} KB · ${t[0].vercel.split("::").slice(0, 2).join("::")}`);
    }
    resumen[slug].roles[rol] = { paginas: porPagina };
    if (SIN_CONSULTAS) continue;
    // Desglose por consulta, como la misma persona.
    const c = comoPersona(s.token, negocio.id);
    const uid = m[0].profile_id;
    const bases = [];
    for (let i = 0; i < 4; i++) { const t0 = performance.now(); await c.rpc("fecha_negocio"); bases.push(performance.now() - t0); }
    const ida = Math.min(...bases);
    // Auth getUser: lo que paga el middleware y otra vez la sesión del layout.
    const tAuth = [];
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); await fetch(`${URL_PROD}/auth/v1/user`, { headers: { Authorization: `Bearer ${s.token}`, apikey: llavesProd().anon } }).catch(() => null); tAuth.push(performance.now() - t0); }
    console.log(`  ida y vuelta mínima desde aquí: ${ms(ida)} · auth getUser: ${ms(Math.min(...tAuth))} (bruto)`);
    const listas = consultasDe({ rol, hoy, modulos });
    const grupos = { layout: listas.layout, recepcion: listas.tableroDia, hotel: listas.hotel, estetica: listas.estetica, admin: listas.admin, ocupacion: listas.ocupacion };
    resumen[slug].roles[rol].ida = ida;
    resumen[slug].roles[rol].auth = Math.min(...tAuth);
    resumen[slug].roles[rol].consultas = {};
    for (const [grupo, lista] of Object.entries(grupos)) {
      if (grupo === "hotel" && !modulos.includes("hotel")) continue;
      if (grupo === "estetica" && !modulos.includes("estetica")) continue;
      if (grupo === "admin" && rol !== "admin") continue;
      const r = await medirConsultas(lista, c, uid, ida);
      resumen[slug].roles[rol].consultas[grupo] = r;
      const ok = r.filter((x) => x.ms != null);
      const suma = ok.reduce((a, x) => a + x.ms, 0);
      console.log(`  · ${grupo}: ${ok.length} consultas · suma ${ms(suma)} (sin la ida y vuelta) · las más lentas: ${[...ok].sort((a, b) => b.ms - a.ms).slice(0, 5).map((x) => `${x.nombre} ${ms(x.ms)}${x.filas != null ? ` [${x.filas}]` : ""}`).join(" · ")}`);
      for (const x of r.filter((x) => x.error)) console.log(`      ! ${x.nombre}: ${x.error}`);
    }
  }
  fs.writeFileSync(path.join(os.tmpdir(), `tiempo-panel-prod-${slug}.json`), JSON.stringify(resumen[slug], null, 1));
}
console.log(`\nDetalle en ${path.join(os.tmpdir(), "tiempo-panel-prod-<slug>.json")}`);
