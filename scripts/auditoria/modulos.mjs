// Uso: node scripts/auditoria/modulos.mjs   (SOLO DESARROLLO)
//
// Módulos y planes, contra la base, con JWT reales:
//   · un negocio en plan Estética no puede usar por la API nada fuera de
//     su plan (hotel, guardería, pases, inventario, empleados, gastos,
//     reportes, contratos, recolección), y lo que sí incluye funciona;
//   · un módulo que el admin apagó se bloquea igual, y al prenderlo vuelve;
//   · el negocio no puede cambiarse de plan, darse complementos o módulos
//     de cortesía, prender un módulo fuera de su plan ni editar los planes;
//   · la llave anónima tampoco;
//   · al subirlo de plan (la plataforma), se desbloquea al instante.
// Arma (o reutiliza) el negocio "Módulos Prueba" en desarrollo. Sale con 1
// si algo que debía rechazarse pasó.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
const A = createClient(URL, env.SUPABASE_SECRET_KEY, sinSesion);

let hallazgos = 0;
const bien = (que) => console.log(`  ✔ ${que}`);
const mal = (que) => { hallazgos++; console.log(`  ✘ ${que}`); };
const exigir = (r, que) => { if (r.error) throw new Error(`${que}: ${r.error.message}`); return r.data; };
// Rechazada = error, o cero filas escritas.
const rechazada = (r) => Boolean(r.error) || (Array.isArray(r.data) && r.data.length === 0);
const debeRechazar = (r, que, patron) => {
  if (!rechazada(r)) return mal(`${que}: PASÓ`);
  if (patron && r.error && !patron.test(r.error.message)) return mal(`${que}: rechazada pero con otro motivo (${r.error.message})`);
  bien(`${que}${r.error ? ` — ${r.error.message}` : " — 0 filas"}`);
};
const debePasar = (r, que) => (r.error ? mal(`${que}: ${r.error.message}`) : bien(que));

// ── El negocio de prueba ──
let { data: neg } = await A.from("negocios").select("id").eq("slug", "modulos-prueba").is("deleted_at", null).maybeSingle();
if (!neg) neg = { id: exigir(await A.rpc("crear_negocio", { p_slug: "modulos-prueba", p_nombre: "Módulos Prueba", p_zona_horaria: "America/Mexico_City", p_ciudad: "Querétaro", p_dominio: null }), "crear negocio") };
const N = neg.id;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { ...sinSesion, global: { headers: { "x-negocio-id": N } } });
const plan = async (clave) => (await A.from("planes").select("id").eq("clave", clave).is("deleted_at", null).single()).data.id;
const ponerPlan = async (clave) => exigir(await A.from("negocios").update({ plan: "activo", plan_id: await plan(clave), complementos: [], modulos_cortesia: [], prueba_termina_at: null }).eq("id", N), "poner plan");

async function cuenta(email) {
  const { data: ya } = await A.rpc("usuario_por_email", { p_email: email });
  if (ya) return ya;
  return exigir(await A.auth.admin.createUser({ email, password: `Prueba-${crypto.randomUUID()}`, email_confirm: true }), email).user.id;
}
const admin = await cuenta("admin@modulos.prueba");
const { data: m } = await A.from("membresias").select("id").eq("negocio_id", N).eq("profile_id", admin).is("deleted_at", null).maybeSingle();
if (!m) exigir(await A.rpc("agregar_admin_negocio", { p_negocio_id: N, p_profile_id: admin }), "admin");
async function como(id) {
  const { data: u } = await A.auth.admin.getUserById(id);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const { data: s } = await createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sinSesion).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...sinSesion, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": N } } });
}
const ADM = await como(admin);
const ANON = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...sinSesion, global: { headers: { "x-negocio-id": N } } });

// Datos mínimos: un cliente y un perro (la secret key; no es lo que se audita).
let { data: cli } = await S.from("clientes").select("id").eq("negocio_id", N).limit(1).maybeSingle();
if (!cli) cli = exigir(await S.from("clientes").insert({ negocio_id: N, nombre: "Cliente Módulos", telefono: "4420990001" }).select("id").single(), "cliente");
let { data: perro } = await S.from("perros").select("id").eq("negocio_id", N).limit(1).maybeSingle();
if (!perro) perro = exigir(await S.from("perros").insert({ negocio_id: N, cliente_id: cli.id, nombre: "Perro Módulos" }).select("id").single(), "perro");
const serv = Object.fromEntries((await S.from("servicios").select("id, clave").eq("negocio_id", N).is("deleted_at", null)).data.map((s) => [s.clave, s.id]));
const falso0 = "00000000-0000-4000-8000-000000000000";
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const manana = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const { data: reserva } = await S.from("reservas").insert({ negocio_id: N, cliente_id: cli.id }).select("id").single();

try {
  await ponerPlan("estetica");
  console.log("── Plan Estética: lo que no incluye no se usa por la API");
  const { data: mods } = await ADM.rpc("mis_modulos");
  const disp = mods.filter((x) => x.disponible).map((x) => x.clave).sort().join(",");
  if (disp === "estetica,portal") bien(`disponibles: ${disp}`); else mal(`disponibles inesperados: ${disp}`);
  const modulo = /módulo/;
  debeRechazar(await ADM.from("estancias").insert({ reserva_id: reserva.id, perro_id: perro.id, servicio_id: serv.hotel_noche, fecha_entrada: hoy, fecha_salida: manana }).select("id"), "reservar hotel", modulo);
  debeRechazar(await ADM.from("estancias").insert({ reserva_id: reserva.id, perro_id: perro.id, servicio_id: serv.guarderia_dia, fecha_entrada: hoy, fecha_salida: manana }).select("id"), "reservar guardería", modulo);
  debeRechazar(await ADM.from("bonos_clientes").insert({ cliente_id: cli.id, perro_id: perro.id, servicio_id: serv.guarderia_dia, reserva_id: reserva.id, cantidad_total: 10, cantidad_disponible: 10, precio_pagado: 1, fecha_compra: hoy }).select("id"), "vender un paquete de pases", modulo);
  const { data: area } = await S.from("areas_inventario").select("id").eq("negocio_id", N).limit(1).single();
  const { data: pieza } = await A.from("unidades_medida").select("id").eq("clave", "pieza").single();
  debeRechazar(await ADM.from("insumos").insert({ nombre: "Shampoo", area_id: area.id, unidad_compra_id: pieza.id, unidad_consumo_id: pieza.id, stock_minimo: 0, existencia_inicial: 0, requiere_caducidad: false }).select("id"), "dar de alta un insumo", modulo);
  debeRechazar(await ADM.from("equipos").insert({ nombre: "Secadora", area_id: area.id, cantidad: 1, estado: "bueno" }).select("id"), "dar de alta equipo", modulo);
  debeRechazar(await ADM.rpc("reporte_guardar", { p_perro_id: perro.id, p_respuestas: { estado_general: { opciones: ["activo"] } }, p_estado: "borrador" }), "llenar un reporte de guardería (el permiso ya no vale sin el módulo)");
  debeRechazar(await ADM.rpc("media_preparar", { p_perro_id: perro.id, p_tipo: "foto", p_mime: "image/jpeg" }), "subir una foto de un perro adentro (sin guardería ni hotel)");
  debeRechazar(await ADM.rpc("galeria_crear", { p_perro_id: perro.id, p_media_ids: [falso0], p_hash: "0".repeat(64) }), "armar una galería (sin guardería ni hotel)");
  debeRechazar(await ADM.from("reporte_config").insert({ titulo: "Otro" }).select("id"), "configurar el reporte (sin guardería ni hotel)", modulo);
  debeRechazar(await ADM.from("empleados").insert({ nombre: "Empleada", puesto: "Estilista", fecha_ingreso: hoy }).select("id"), "dar de alta un empleado", modulo);
  const { data: cat } = await S.from("categorias_gasto").select("id").eq("negocio_id", N).limit(1).single();
  debeRechazar(await ADM.rpc("registrar_gasto", { p_concepto: "Renta", p_categoria_id: cat.id, p_monto: 100, p_fecha_pago: hoy, p_metodo: "transferencia", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: null }), "registrar un gasto");
  debeRechazar(await ADM.rpc("reporte_financiero_periodo", { p_desde: hoy, p_hasta: hoy }), "ver el reporte financiero");
  debeRechazar(await ADM.rpc("reporte_utilidad_periodo", { p_desde: hoy, p_hasta: hoy }), "ver la utilidad");
  debeRechazar(await ADM.rpc("crear_tipo_contrato", { p_nombre: "Contrato X", p_categorias_servicio: [], p_titulo: "T", p_cuerpo: "C" }), "crear un tipo de contrato");
  debeRechazar(await ADM.from("tipos_contrato").insert({ nombre: "Otro", categorias_servicio: [], orden: 9 }).select("id"), "crear un tipo de contrato directo", modulo);
  debeRechazar(await ADM.rpc("crear_cargo_suelto", { p_cliente_id: cli.id, p_servicio_id: serv.recoleccion, p_cantidad: 5, p_importe: null, p_descripcion: null, p_perro_id: perro.id, p_notas: null }), "cobrar recolección a domicilio");
  // Lo que la app escribe sola (el consumo al cerrar una cita, el contrato
  // que nace de un paquete) se salta sin tronar la operación que lo causó.
  const salta = (r, que) => (r.error ? mal(`${que}: tronó (${r.error.message})`) : (r.data ?? []).length ? mal(`${que}: se escribió`) : bien(`${que}: se salta sin error`));
  const falso = "00000000-0000-4000-8000-000000000000";
  salta(await ADM.from("movimientos_inventario").insert({ insumo_id: falso, tipo: "salida_consumo", cantidad_base: 1, cita_estetica_id: falso }).select("id"), "consumo de inventario al cerrar una cita, sin inventario");
  salta(await ADM.from("contratos").insert({ perro_id: perro.id, cliente_id: cli.id, plantilla_id: falso, bono_cliente_id: falso }).select("id"), "contrato de un paquete, sin contratos");
  debePasar(await ADM.from("clientes").insert({ nombre: "Cliente nuevo", telefono: `44209${String(Date.now()).slice(-5)}` }).select("id"), "control: clientes siempre funciona");
  const act = (await ADM.rpc("modulos_activos")).data ?? [];
  if (act.includes("estetica")) bien("control: estética activa"); else mal("estética debería estar activa");

  console.log("── El negocio no se cambia de plan ni se da módulos");
  debeRechazar(await ADM.rpc("cambiar_modulo", { p_modulo: "hotel", p_activo: true }), "prender hotel (fuera del plan)", /no está en tu plan/);
  debeRechazar(await ADM.from("negocios").update({ plan_id: await plan("completo") }).eq("id", N).select("id"), "cambiarse de plan");
  debeRechazar(await ADM.from("negocios").update({ modulos_cortesia: ["hotel"] }).eq("id", N).select("id"), "darse un módulo de cortesía");
  debeRechazar(await ADM.from("negocios").update({ complementos: ["pagina_web"] }).eq("id", N).select("id"), "darse la página web");
  debeRechazar(await ADM.from("negocios").update({ web_gratis_at: new Date().toISOString() }).eq("id", N).select("id"), "darse la web gratis");
  debeRechazar(await ADM.from("negocio_modulos").insert({ modulo: "hotel", activo: true }).select("id"), "escribir negocio_modulos directo");
  debeRechazar(await ADM.from("planes").update({ precio_mensual: 1 }).eq("clave", "estetica").select("id"), "editar un plan");
  debeRechazar(await ADM.rpc("plataforma_asignar_plan", { p_negocio_id: N, p_plan_id: await plan("completo"), p_complementos: [], p_modulos_cortesia: [], p_motivo: "yo" }), "asignarse un plan por la función de la plataforma");
  debeRechazar(await ADM.rpc("plataforma_guardar_plan", { p_id: null, p_clave: "gratis", p_nombre: "Gratis", p_descripcion: null, p_tipo: "plan", p_precio_mensual: 0, p_precio_anual: 0, p_modulos: ["hotel"], p_orden: 0, p_activo: true }), "crear un plan");
  debeRechazar(await ADM.rpc("evaluar_web_gratis").then((r) => ({ error: r.data?.ganada ? null : { message: "no la ganó" }, data: r.data?.ganada ? [1] : [] })), "ganarse la web sin cumplir");

  console.log("── Llave anónima");
  debeRechazar(await ANON.rpc("cambiar_modulo", { p_modulo: "estetica", p_activo: false }), "anónimo apaga un módulo");
  debeRechazar(await ANON.from("negocio_modulos").insert({ modulo: "hotel", activo: true }).select("id"), "anónimo escribe negocio_modulos");
  debeRechazar(await ANON.rpc("plataforma_asignar_plan", { p_negocio_id: N, p_plan_id: await plan("completo"), p_complementos: [], p_modulos_cortesia: [], p_motivo: "x" }), "anónimo asigna plan");
  debeRechazar(await ANON.from("planes").update({ precio_mensual: 1 }).eq("clave", "estetica").select("id"), "anónimo edita un plan");
  debeRechazar(await ANON.rpc("mis_modulos"), "anónimo lee los módulos del negocio");

  console.log("── Apagar dentro del plan bloquea igual; prender lo regresa");
  const imp = await ADM.rpc("cambiar_modulo", { p_modulo: "portal", p_activo: false });
  debePasar(imp, "el admin apaga el portal");
  debeRechazar(await ADM.rpc("crear_invitacion_cliente", { p_cliente_id: cli.id, p_dias_vigencia: 7, p_nombre_referencia: "Prueba", p_telefono: "4420990002", p_tipo: "estetica" }), "mandar un link de alta con el portal apagado", modulo);
  debePasar(await ADM.rpc("cambiar_modulo", { p_modulo: "portal", p_activo: true }), "el admin vuelve a prender el portal");
  debePasar(await ADM.rpc("cambiar_modulo", { p_modulo: "estetica", p_activo: false }), "el admin apaga estética");
  const { data: sty } = await A.rpc("usuario_por_email", { p_email: "admin@modulos.prueba" });
  debeRechazar(await ADM.from("citas_estetica").insert({ reserva_id: reserva.id, perro_id: perro.id, servicio_id: serv.estetica_expres, empleado_id: sty, inicio: `${manana}T16:00:00-06:00` }).select("id"), "agendar estética con el módulo apagado", modulo);
  debePasar(await ADM.rpc("cambiar_modulo", { p_modulo: "estetica", p_activo: true }), "el admin vuelve a prender estética");

  console.log("── Subir de plan desbloquea al instante");
  await ponerPlan("completo");
  const act2 = (await ADM.rpc("modulos_activos")).data ?? [];
  if (["hotel", "guarderia", "inventario", "empleados", "gastos", "reportes"].every((x) => act2.includes(x))) bien("en Completo: hotel, guardería, inventario, empleados, gastos y reportes activos"); else mal(`activos en Completo: ${act2.join(",")}`);
  debePasar(await ADM.rpc("reporte_financiero_periodo", { p_desde: hoy, p_hasta: hoy }), "el reporte ya se puede ver");
} finally {
  await ponerPlan("estetica");
  await S.from("reservas").update({ deleted_at: new Date().toISOString() }).eq("id", reserva.id);
}
console.log(`\n${hallazgos ? `HALLAZGOS: ${hallazgos}` : "TODO BIEN"}`);
process.exit(hallazgos ? 1 : 0);
