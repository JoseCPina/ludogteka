// Le pone Veterinaria al negocio demo de DESARROLLO (Patitas & Co., `patitasyco`) para grabar los videos del módulo.
//
//   node scripts/demo/sembrar-veterinaria.mjs        (después de `sembrar-demo.mjs --rehacer`; idempotente)
//
// Solo desarrollo y solo el demo: se niega con otra cosa. Todo pasa por las mismas funciones y JWT reales que usa
// la app (admin, recepción y los médicos), con datos INVENTADOS. Deja:
//   · el módulo prendido, ajustes (recordatorios, el carnet reemplaza al comprobante, portal con consultas);
//   · dos médicos (Dr. Emilio Navarro y Dra. Paulina Reyes, cuentas demo.mvz / demo.mvz2, rol estética), con cédula,
//     CPA y un bloque de folios cada uno; aviso de funcionamiento y dos permisos del establecimiento;
//   · mascotas: un gato y un perro con su microchip, y dos gatos nuevos;
//   · inventario clínico: cuatro productos con lote (uno Grupo I, para el candado y el SITPV);
//   · carnet con vacunas (una por vencer), consultas firmadas del historial y citas de la agenda clínica.
// Los demás tutoriales de Veterinaria hacen lo suyo EN VIVO (hospitalizar, estimar, recetar…): aquí solo queda
// el escenario.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
if (process.argv.includes("--prod")) throw new Error("La demo de Veterinaria de los videos vive solo en desarrollo.");
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const sin = { auth: { persistSession: false, autoRefreshToken: false } };
const A = createClient(URL, env.SUPABASE_SECRET_KEY, sin);
const { data: neg } = await A.from("negocios").select("id, plan, nombre").eq("slug", "patitasyco").is("deleted_at", null).maybeSingle();
if (!neg || neg.plan !== "demo") throw new Error("No hay demo en desarrollo: node scripts/demo/sembrar-demo.mjs");
const NEG = neg.id;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { ...sin, global: { headers: { "x-negocio-id": NEG } } });
const hoy = (d = 0) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const ok = (t) => console.log(`  ✔ ${t}`);
const exigir = (r, t) => { if (r.error) throw new Error(`${t}: ${r.error.message}`); ok(t); return r.data; };

async function idPorCorreo(email) {
  const { data } = await A.rpc("usuario_por_email", { p_email: email });
  return data ?? null;
}
async function comoPersona(email) {
  const { data: link, error: e1 } = await A.auth.admin.generateLink({ type: "magiclink", email });
  if (e1) throw new Error(`generateLink ${email}: ${e1.message}`);
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sin);
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw new Error(`verifyOtp ${email}: ${error.message}`);
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...sin, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": NEG } } });
}

// El demo se graba con las cuentas desbloqueadas (como lo deja `prepararDemo`): aquí también hace falta para escribir.
await A.from("membresias").update({ solo_lectura: false }).eq("negocio_id", NEG).eq("solo_lectura", true);
const ADM = await comoPersona("demo.admin@peludesk.mx");
const REC = await comoPersona("demo.recepcion@peludesk.mx");

console.log("Veterinaria en el demo");
// 1. Módulo y ajustes.
const { data: act } = await ADM.rpc("modulos_activos");
const activos = new Set((act ?? []).map((m) => (typeof m === "string" ? m : m.clave ?? m.modulo)));
if (!activos.has("veterinaria")) exigir(await ADM.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: true, p_confirmado: true }), "módulo Veterinaria prendido");
else ok("Veterinaria ya estaba prendida");
exigir(await ADM.rpc("guardar_veterinaria_ajustes", { p_recordatorios_activos: true, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: true, p_precio_dia: 450 }), "ajustes de Veterinaria");
exigir(await ADM.rpc("guardar_veterinaria_portal", { p_expediente: true }), "portal del dueño con sus consultas");

// 2. Los dos médicos.
const MEDICOS = [
  { clave: "mvz", email: "demo.mvz@peludesk.mx", nombre: "Dr. Emilio Navarro", cedula: "1234567", cpa: "CPA-001-DEMO", folios: [1, 50] },
  { clave: "mvz2", email: "demo.mvz2@peludesk.mx", nombre: "Dra. Paulina Reyes", cedula: "7654321", cpa: "CPA-002-DEMO", folios: [101, 150] },
];
const med = {};
for (const m of MEDICOS) {
  let id = await idPorCorreo(m.email);
  if (!id) {
    const r = await A.auth.admin.createUser({ email: m.email, password: `Demo-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: m.nombre } });
    if (r.error) throw new Error(`crear ${m.email}: ${r.error.message}`);
    id = r.data.user.id;
  }
  const { data: mem } = await S.from("membresias").select("rol").eq("profile_id", id).eq("negocio_id", NEG).is("deleted_at", null).maybeSingle();
  if (!mem) exigir(await S.rpc("asignar_rol_staff", { p_user_id: id, p_rol: "estetica", p_nombre_completo: m.nombre }), `${m.nombre}: cuenta de personal`);
  await A.from("membresias").update({ solo_lectura: false }).eq("negocio_id", NEG).eq("profile_id", id);
  let { data: mv } = await S.from("medicos_veterinarios").select("id").eq("negocio_id", NEG).eq("profile_id", id).is("deleted_at", null).maybeSingle();
  if (!mv) { exigir(await ADM.rpc("guardar_medico_veterinario", { p_profile_id: id, p_cedula: m.cedula, p_cpa: m.cpa }), `${m.nombre}: designado médico veterinario`); mv = (await S.from("medicos_veterinarios").select("id").eq("negocio_id", NEG).eq("profile_id", id).is("deleted_at", null).single()).data; }
  const { data: bloques } = await S.from("medico_folios").select("id").eq("negocio_id", NEG).eq("medico_id", mv.id).is("deleted_at", null);
  if (!bloques?.length) exigir(await ADM.rpc("asignar_folios_medico", { p_medico_id: mv.id, p_prefijo: "", p_desde: m.folios[0], p_hasta: m.folios[1], p_usados_previos: 0, p_nota: "Bloque de ejemplo" }), `${m.nombre}: folios ${m.folios[0]} al ${m.folios[1]}`);
  med[m.clave] = { profile: id, medico: mv.id, api: await comoPersona(m.email) };
}

// 3. Establecimiento (aviso de funcionamiento y dos permisos, uno por vencer).
{
  const { data: est } = await S.from("negocio_establecimiento").select("negocio_id").eq("negocio_id", NEG).maybeSingle();
  if (!est) exigir(await ADM.rpc("guardar_establecimiento", { p_aviso: "AF-DEMO-2026-0001", p_aviso_fecha: hoy(-300), p_mvra_medico_id: med.mvz.medico, p_mvra_nombre: null, p_mvra_cedula: null, p_notas: null }), "aviso de funcionamiento");
  const { data: per } = await S.from("establecimiento_permisos").select("id").eq("negocio_id", NEG).is("deleted_at", null);
  if (!per?.length) {
    exigir(await ADM.rpc("guardar_permiso_establecimiento", { p_id: null, p_tipo: "Licencia sanitaria", p_numero: "LS-DEMO-0456", p_autoridad: "Secretaría de Salud estatal", p_nivel: "estatal", p_emision: hoy(-200), p_vencimiento: hoy(165), p_aviso_dias: 60, p_notas: null }), "permiso: licencia sanitaria");
    exigir(await ADM.rpc("guardar_permiso_establecimiento", { p_id: null, p_tipo: "Registro de manejo de residuos", p_numero: "RR-DEMO-0789", p_autoridad: "SEMARNAT", p_nivel: "federal", p_emision: hoy(-340), p_vencimiento: hoy(25), p_aviso_dias: 60, p_notas: null }), "permiso: residuos (por vencer)");
  }
}

// 4. Mascotas: se suman un gato y un perro con microchip, y dos gatos a clientes que ya tiene el demo.
const { data: clientes } = await S.from("clientes").select("id, nombre").eq("negocio_id", NEG).eq("publico_general", false).is("deleted_at", null).order("created_at").limit(6);
const { data: tallas } = await A.from("tamanos_categoria").select("id, clave").is("deleted_at", null);
const talla = (c) => tallas.find((t) => t.clave === c)?.id ?? null;
const NUEVAS = [
  { dueno: 0, nombre: "Michi", especie: "gato", raza: null, sexo: "hembra", nacio: "2022-06-10", talla: "chico", peso: 4.2, microchip: "985112345678901" },
  { dueno: 1, nombre: "Nube", especie: "gato", raza: null, sexo: "hembra", nacio: "2023-01-20", talla: "chico", peso: 3.8, microchip: null },
  { dueno: 2, nombre: "Tigre", especie: "gato", raza: null, sexo: "macho", nacio: "2021-09-05", talla: "chico", peso: 5.1, microchip: null },
  { dueno: 3, nombre: "Bruno", especie: "perro", raza: "Labrador", sexo: "macho", nacio: "2020-02-02", talla: "grande", peso: 29.5, microchip: "985112345678902" },
];
const id = {};
for (const p of NUEVAS) {
  const cli = clientes[p.dueno];
  let { data: pe } = await S.from("perros").select("id").eq("negocio_id", NEG).eq("cliente_id", cli.id).eq("nombre", p.nombre).is("deleted_at", null).maybeSingle();
  if (!pe) {
    const fila = { cliente_id: cli.id, nombre: p.nombre, especie: p.especie, raza: p.raza, sexo: p.sexo, fecha_nacimiento: p.nacio, tamano_id: talla(p.talla), esterilizado: true, microchip: p.microchip };
    pe = exigir(await ADM.from("perros").insert(fila).select("id").single(), `${p.especie} ${p.nombre} (de ${cli.nombre})`);
    await ADM.from("pesos_registrados").insert({ perro_id: pe.id, peso_kg: p.peso, fecha: hoy(-2) });
  }
  id[p.nombre] = pe.id;
}

// 5. Inventario clínico: cuatro productos con lote (uno Grupo I).
const { data: areas } = await ADM.from("areas_inventario").select("id, nombre").is("deleted_at", null);
const area = areas.find((a) => /botiqu|cl[ií]nic/i.test(a.nombre)) ?? areas[0];
const { data: unidades } = await S.from("unidades_medida").select("id, etiqueta");
const unidad = (n) => unidades.find((u) => u.etiqueta.toLowerCase() === n)?.id;
const { data: principios } = await A.from("principios_activos").select("*").is("deleted_at", null);
const PRODUCTOS = [
  { nombre: "Ketamina 10 % (anestésico)", p: /^ketamina/i, lote: "KET-2026-01", litros: 0.5, cad: 420 },
  { nombre: "Enrofloxacina 5 % (antibiótico)", p: /^enrofloxacina/i, lote: "ENR-2026-01", litros: 0.5, cad: 300 },
  { nombre: "Meloxicam 0.5 % (antiinflamatorio)", p: /^meloxicam/i, lote: "MEL-2026-01", litros: 0.25, cad: 45 },
  { nombre: "Probiótico oral", p: /probi[óo]ticos/i, lote: "PRO-2026-01", litros: 0.5, cad: 500 },
];
for (const x of PRODUCTOS) {
  const pa = principios.find((q) => x.p.test(q.nombre));
  let { data: ya } = await S.from("insumos").select("id").eq("negocio_id", NEG).eq("nombre", x.nombre).is("deleted_at", null).maybeSingle();
  if (!ya) {
    const pid = exigir(await ADM.rpc("guardar_producto_clinico", { p_id: null, p_nombre: x.nombre, p_area_id: area.id, p_unidad_compra_id: unidad("litro"), p_unidad_consumo_id: unidad("mililitro"), p_stock_minimo: 50, p_dias_aviso_caducidad: 60, p_principio_activo_id: pa?.id ?? null, p_grupo_senasica: pa?.grupo_senasica ?? null, p_clasificacion_lgs: pa?.clasificacion_lgs ?? null, p_es_antimicrobiano: pa?.es_antimicrobiano ?? false, p_clasificacion_por_confirmar: false }), `producto ${x.nombre}`);
    exigir(await ADM.rpc("registrar_lote_entrada", { p_insumo_id: pid, p_codigo: x.lote, p_caducidad: hoy(x.cad), p_cantidad_compra: x.litros }), `lote ${x.lote}`);
  }
}

// 6. Carnet: vacunas (una con la próxima dosis dentro de 5 días, para el recordatorio).
const V = med.mvz.api;
const VACUNAS = [
  { perro: "Bruno", bio: "Séxtuple canina", lote: "SEX-2026-01", fecha: hoy(-360), prox: hoy(5) },
  { perro: "Bruno", bio: "Antirrábica", lote: "RAB-2026-02", fecha: hoy(-20), prox: hoy(345) },
  { perro: "Michi", bio: "Triple felina", lote: "TRF-2026-01", fecha: hoy(-30), prox: hoy(335) },
];
for (const v of VACUNAS) {
  const { data: ya } = await S.from("carnet_vacunas").select("id").eq("negocio_id", NEG).eq("perro_id", id[v.perro]).eq("biologico", v.bio).is("anulada_at", null).maybeSingle();
  if (!ya) exigir(await V.rpc("registrar_vacuna", { p_perro_id: id[v.perro], p_biologico: v.bio, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: v.lote, p_laboratorio: "Laboratorio de ejemplo", p_fecha: v.fecha, p_proxima: v.prox, p_medico_id: med.mvz.medico, p_dosis: "1 mL", p_notas: null, p_descontar: false }), `vacuna ${v.bio} de ${v.perro}`);
}

// 7. Historial: dos consultas firmadas (una por cada médico).
const HISTORIAL = [
  { perro: "Bruno", medico: "mvz", datos: { motivo: "Chequeo anual", anamnesis: "Sin molestias. Come y bebe normal. Paseos diarios.", plan: "Vacunas al día. Control de peso en 6 meses.", peso_kg: 29.5, temperatura_c: 38.5, diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Control de rutina", tipo: "definitivo", nota: "" }] } },
  { perro: "Michi", medico: "mvz2", datos: { motivo: "Vómito ocasional", anamnesis: "Dos vómitos esta semana, sin diarrea. Apetito normal.", plan: "Dieta suave tres días y probiótico. Revisión si repite.", peso_kg: 4.2, temperatura_c: 38.6, diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Gastritis leve", tipo: "presuntivo", nota: "" }] } },
];
for (const h of HISTORIAL) {
  const { data: ya } = await S.from("vet_consultas").select("id").eq("negocio_id", NEG).eq("perro_id", id[h.perro]).eq("estado", "firmada").maybeSingle();
  if (ya) continue;
  const api = med[h.medico].api;
  const cid = exigir(await api.rpc("vet_consulta_iniciar", { p_perro: id[h.perro], p_cita: null, p_tipo: "consulta", p_medico: med[h.medico].medico }), `consulta de ${h.perro} iniciada`);
  exigir(await api.rpc("vet_consulta_guardar", { p_id: cid, p_datos: h.datos }), `consulta de ${h.perro} redactada`);
  exigir(await api.rpc("vet_consulta_firmar", { p_id: cid }), `consulta de ${h.perro} firmada`);
}

// 8. Agenda clínica: tres citas por venir con los dos médicos (la lectura previa evita duplicar).
const { data: citas } = await S.from("vet_citas").select("id").eq("negocio_id", NEG).is("deleted_at", null).limit(1);
if (!citas?.length) {
  const a = (dias, h, m) => { const d = new Date(Date.now() + dias * 86400000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
  const CITAS = [
    { perro: "Tigre", tipo: "consulta", inicia: a(1, 16), medico: "mvz" },
    { perro: "Nube", tipo: "vacuna", inicia: a(1, 17), medico: "mvz2" },
    { perro: "Bruno", tipo: "seguimiento", inicia: a(2, 15), medico: "mvz" },
  ];
  for (const c of CITAS) exigir(await REC.rpc("vet_agendar_cita", { p_perro: id[c.perro], p_tipo: c.tipo, p_inicia: c.inicia, p_medico: med[c.medico].medico }), `cita de ${c.perro} (${c.tipo})`);
}
console.log("\nListo: Veterinaria prendida en el demo con 2 médicos, 4 productos con lote, vacunas, 2 consultas firmadas y 3 citas.");
