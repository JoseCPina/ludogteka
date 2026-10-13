// Siembra la parte VETERINARIA del negocio de demostración «Patitas & Co.» (datos INVENTADOS).
//
//   node scripts/demo/sembrar-demo-veterinaria.mjs            desarrollo (.env.local)
//   node scripts/demo/sembrar-demo-veterinaria.mjs --prod     producción (llaves leídas al vuelo del CLI)
//
// Corre DESPUÉS de sembrar-demo.mjs (que lo llama solo al final) y es repetible: primero vacía lo clínico
// (demo_vaciar_veterinaria: solo un negocio con plan demo) y vuelve a sembrarlo. Todo lo clínico pasa por las
// mismas funciones y JWT reales que usa la app (la médica firma sus consultas, recepción agenda), igual que en
// sembrar-demo.mjs; la secret key solo da de alta la cuenta de la médica y abre/cierra la «solo lectura» de las
// cuentas mientras se siembra. Nunca datos de Ludogteka ni de un cliente real; ningún teléfono real.
// Al final las cuentas del demo quedan en SOLO LECTURA y el envío automático de recordatorios, apagado.
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { claveAleatoria } from "../lib/clave.mjs";

const PROD = process.argv.includes("--prod");
const SLUG = "patitasyco";
const ZONA = "America/Mexico_City";
const EMAIL_MEDICA = "demo.veterinaria@peludesk.mx";

function conexion() {
  if (PROD) {
    const keys = JSON.parse(execSync("node node_modules/supabase/dist/supabase.js projects api-keys --project-ref xdsxjhytggpsgrmfuuff -o json", { encoding: "utf8" }));
    const jwt = (n) => keys.find((k) => k.name === n && String(k.api_key).startsWith("eyJ"))?.api_key;
    return { url: "https://xdsxjhytggpsgrmfuuff.supabase.co", secreta: jwt("service_role"), anon: jwt("anon") };
  }
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error(".env.local no apunta a desarrollo.");
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, secreta: env.SUPABASE_SECRET_KEY, anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}
const C = conexion();
if (!C.secreta || !C.anon) throw new Error("No se pudieron leer las llaves.");
const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
const A = createClient(C.url, C.secreta, sinSesion);
const exigir = (r, que) => { if (r.error) throw new Error(`${que}: ${r.error.message}`); return r.data; };
const ok = (t) => console.log(`  ✔ ${t}`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
const dia = (n) => { const d = new Date(`${HOY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const inst = (f, hhmm) => new Date(`${f}T${hhmm}:00-06:00`).toISOString();

console.log(`Sembrando Veterinaria en el demo (${PROD ? "PRODUCCIÓN" : "desarrollo"})`);
const { data: neg } = await A.from("negocios").select("id, plan").eq("slug", SLUG).is("deleted_at", null).maybeSingle();
if (!neg) throw new Error("No existe el demo: primero sembrar-demo.mjs.");
if (neg.plan !== "demo") throw new Error("Ese negocio no es un demo: no se toca.");
const NEG = neg.id;
const S = createClient(C.url, C.secreta, { ...sinSesion, global: { headers: { "x-negocio-id": NEG } } });

// ── Cuentas ──
const tokens = new Map();
async function tokenDe(id) {
  if (tokens.has(id)) return tokens.get(id);
  for (let intento = 0; intento < 8; intento++) {
    const { data: u } = await A.auth.admin.getUserById(id);
    const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
    const { data: s, error } = await createClient(C.url, C.anon, sinSesion).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (!error) { tokens.set(id, s.session.access_token); return s.session.access_token; }
    if (error.status !== 429) throw error;
    await espera(20_000);
  }
  throw new Error("Auth sigue limitando");
}
const como = async (id) => createClient(C.url, C.anon, { ...sinSesion, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": NEG } } });
const idDe = async (email) => exigir(await A.rpc("usuario_por_email", { p_email: email }), `buscar ${email}`);

let medicaId = await idDe(EMAIL_MEDICA);
if (!medicaId) {
  medicaId = exigir(await A.auth.admin.createUser({ email: EMAIL_MEDICA, password: claveAleatoria(), email_confirm: true, user_metadata: { nombre_completo: "Dra. Valeria Montes" } }), "crear la cuenta de la médica").user.id;
}
await A.from("profiles").update({ nombre_completo: "Dra. Valeria Montes" }).eq("id", medicaId);
const tieneMembresia = (await A.from("membresias").select("rol").eq("profile_id", medicaId).eq("negocio_id", NEG).is("deleted_at", null).maybeSingle()).data;
if (!tieneMembresia) exigir(await S.rpc("asignar_rol_staff", { p_user_id: medicaId, p_rol: "estetica", p_nombre_completo: "Dra. Valeria Montes" }), "rol de la médica");
const adminId = await idDe("demo.admin@peludesk.mx");
const recepId = await idDe("demo.recepcion@peludesk.mx");
const cuentas = [adminId, recepId, medicaId];
// Mientras se siembra, las cuentas pueden escribir; al final vuelven a solo lectura.
exigir(await S.from("membresias").update({ solo_lectura: false }).eq("negocio_id", NEG).in("profile_id", cuentas), "abrir cuentas");
let terminado = false;
try {
  const ADM = await como(adminId), REC = await como(recepId), MED = await como(medicaId);

  // ── Vaciar lo clínico anterior ──
  const borrado = exigir(await S.rpc("demo_vaciar_veterinaria", { p_negocio_id: NEG }), "demo_vaciar_veterinaria");
  console.log("  vaciado:", borrado.map((b) => `${b.tabla} ${b.borradas}`).join(", ") || "nada");

  // ── Módulo, médica y ajustes ──
  exigir(await ADM.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: true, p_confirmado: true }), "prender Veterinaria");
  const medicoId = exigir(await ADM.rpc("guardar_medico_veterinario", { p_profile_id: medicaId, p_cedula: "DEMO-0000000", p_cpa: "DEMO-CPA-0001" }), "designar a la médica");
  exigir(await ADM.rpc("guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: true, p_precio_dia: 450 }), "ajustes");
  exigir(await ADM.rpc("guardar_veterinaria_portal", { p_expediente: true }), "portal del dueño");
  ok("Veterinaria prendida, médica designada (cédula de ejemplo)");

  // ── Clientes y mascotas ──
  const { data: tallas } = await A.from("tamanos_categoria").select("id, clave").is("deleted_at", null);
  const talla = (c) => tallas.find((t) => t.clave === c)?.id ?? null;
  const GENTE = [
    { nombre: "Mariana Ruiz (ejemplo)", telefono: "4420000301", mascotas: [
      { nombre: "Canela", especie: "perro", raza: "Labrador", sexo: "hembra", nacio: "2019-05-12", talla: "grande", peso: 27.8, chip: "985112000000101", est: true },
      { nombre: "Kiwi", especie: "gato", raza: "Doméstico de pelo corto", sexo: "macho", nacio: "2022-02-03", talla: "chico", peso: 4.6, chip: "985112000000102", est: true } ] },
    { nombre: "Tomás Beltrán (ejemplo)", telefono: "4420000302", mascotas: [
      { nombre: "Rocco", especie: "perro", raza: "Schnauzer", sexo: "macho", nacio: "2020-09-21", talla: "mediano", peso: 9.4, chip: "985112000000103", est: false } ] },
    { nombre: "Paola Cervantes (ejemplo)", telefono: "4420000303", mascotas: [
      { nombre: "Luna", especie: "gato", raza: "Siamés", sexo: "hembra", nacio: "2023-07-30", talla: "chico", peso: 3.9, chip: null, est: false } ] },
  ];
  const M = {}; // nombre → id
  for (const g of GENTE) {
    let { data: cli } = await A.from("clientes").select("id").eq("negocio_id", NEG).eq("telefono", g.telefono).is("deleted_at", null).maybeSingle();
    if (!cli) cli = exigir(await REC.from("clientes").insert({ nombre: g.nombre, telefono: g.telefono }).select("id").single(), `cliente ${g.nombre}`);
    for (const p of g.mascotas) {
      let { data: pe } = await A.from("perros").select("id").eq("negocio_id", NEG).eq("cliente_id", cli.id).eq("nombre", p.nombre).is("deleted_at", null).maybeSingle();
      if (!pe) {
        pe = exigir(await ADM.from("perros").insert({ cliente_id: cli.id, nombre: p.nombre, especie: p.especie, raza: p.raza, sexo: p.sexo, fecha_nacimiento: p.nacio, tamano_id: talla(p.talla), esterilizado: p.est, microchip: p.chip }).select("id").single(), `mascota ${p.nombre}`);
        await ADM.from("pesos_registrados").insert({ perro_id: pe.id, peso_kg: p.peso, fecha: dia(-20) });
      }
      M[p.nombre] = pe.id;
    }
  }
  ok(`${GENTE.length} clientes y ${Object.keys(M).length} mascotas (perros y gatos)`);

  // ── Inventario clínico con lotes ──
  const { data: areas } = await ADM.from("areas_inventario").select("id, nombre").is("deleted_at", null);
  const area = areas.find((a) => /botiqu|cl[ií]nic|farmac/i.test(a.nombre)) ?? areas[0];
  const { data: unidades } = await A.from("unidades_medida").select("id, etiqueta");
  const unidad = (n) => unidades.find((u) => u.etiqueta.toLowerCase() === n)?.id;
  const { data: principios } = await ADM.from("principios_activos").select("*").is("deleted_at", null);
  const PRODUCTOS = [
    { nombre: "Ketamina 10 % (anestésico)", p: /^ketamina/i, lote: "KET-24-017", cad: dia(400) },
    { nombre: "Enrofloxacina 5 % (antibiótico)", p: /^enrofloxacina/i, lote: "ENR-24-052", cad: dia(380) },
    { nombre: "Probiótico oral para mascotas", p: /probi[óo]ticos/i, lote: "PRO-25-003", cad: dia(300) },
    { nombre: "Vacuna séxtuple canina", p: null, lote: "SEX-25-118", cad: dia(150) },
    { nombre: "Vacuna triple felina", p: null, lote: "TRF-25-064", cad: dia(170) },
    { nombre: "Vacuna antirrábica", p: null, lote: "RAB-25-209", cad: dia(210) },
  ];
  const prod = {};
  for (const x of PRODUCTOS) {
    const pa = x.p ? principios.find((q) => x.p.test(q.nombre)) : null;
    let { data: ya } = await A.from("insumos").select("id").eq("negocio_id", NEG).eq("nombre", x.nombre).is("deleted_at", null).maybeSingle();
    const id = ya?.id ?? exigir(await ADM.rpc("guardar_producto_clinico", { p_id: null, p_nombre: x.nombre, p_area_id: area.id, p_unidad_compra_id: unidad("litro"), p_unidad_consumo_id: unidad("mililitro"), p_stock_minimo: 20, p_dias_aviso_caducidad: 60, p_principio_activo_id: pa?.id ?? null, p_grupo_senasica: pa?.grupo_senasica ?? null, p_clasificacion_lgs: pa?.clasificacion_lgs ?? null, p_es_antimicrobiano: pa?.es_antimicrobiano ?? false, p_clasificacion_por_confirmar: false }), `producto ${x.nombre}`);
    exigir(await ADM.rpc("registrar_lote_entrada", { p_insumo_id: id, p_codigo: x.lote, p_caducidad: x.cad, p_cantidad_compra: 0.25 }), `lote ${x.lote}`);
    prod[x.lote] = id;
  }
  ok(`${PRODUCTOS.length} productos con lote (controlados, antibiótico y vacunas)`);
  const loteDe = async (insumo) => (await A.from("insumo_lotes").select("id").eq("negocio_id", NEG).eq("insumo_id", insumo).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.id ?? null;

  // ── Carnet de vacunación ──
  const VACUNAS = [
    [M.Canela, "Séxtuple canina", prod["SEX-25-118"], "SEX-25-118", dia(-340), dia(25)],
    [M.Canela, "Antirrábica", prod["RAB-25-209"], "RAB-25-209", dia(-340), dia(25)],
    [M.Kiwi, "Triple felina", prod["TRF-25-064"], "TRF-25-064", dia(-200), dia(165)],
    [M.Rocco, "Séxtuple canina", prod["SEX-25-118"], "SEX-25-118", dia(-30), dia(335)],
    [M.Luna, "Triple felina", prod["TRF-25-064"], "TRF-25-064", dia(-10), dia(355)],
  ];
  for (const [perro, bio, insumo, lote, fecha, prox] of VACUNAS) {
    exigir(await MED.rpc("registrar_vacuna", { p_perro_id: perro, p_biologico: bio, p_tipo_requisito_id: null, p_insumo_id: insumo, p_lote_id: await loteDe(insumo), p_lote_texto: lote, p_laboratorio: "Laboratorio de ejemplo", p_fecha: fecha, p_proxima: prox, p_medico_id: medicoId, p_dosis: "1 mL", p_notas: null, p_descontar: true }), `vacuna ${bio}`);
  }
  ok(`${VACUNAS.length} vacunas en carnets (la de Canela vence pronto)`);

  // ── Agenda clínica ──
  const CITAS = [
    // Si ya pasó la hora de hoy, la base rechaza la cita («Esa hora ya pasó»): pasa a mañana.
    [M.Kiwi, "consulta", dia(new Date(inst(dia(0), "16:00")) > Date.now() + 3600000 ? 0 : 1), "16:00", "Revisión por estornudos"],
    [M.Luna, "vacuna", dia(1), "10:00", "Refuerzo de vacuna"],
    [M.Rocco, "seguimiento", dia(1), "12:30", "Control tras gastroenteritis"],
    [M.Canela, "consulta", dia(2), "11:00", "Revisión de oídos"],
  ];
  for (const [perro, tipo, fecha, hora, motivo] of CITAS) {
    exigir(await REC.rpc("vet_agendar_cita", { p_perro: perro, p_tipo: tipo, p_medico: medicoId, p_inicia: inst(fecha, hora), p_duracion_min: null, p_motivo: motivo }), `cita de ${motivo}`);
  }
  ok(`${CITAS.length} citas clínicas`);

  // ── Consultas: dos firmadas y una en borrador ──
  async function consulta(perro, datos, firmar) {
    const id = exigir(await MED.rpc("vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: medicoId }), "consulta iniciada");
    exigir(await MED.rpc("vet_consulta_guardar", { p_id: id, p_datos: datos }), "consulta redactada");
    if (firmar) exigir(await MED.rpc("vet_consulta_firmar", { p_id: id }), "consulta firmada");
    return id;
  }
  const cConsulta = await consulta(M.Canela, { motivo: "Sacude la cabeza y se rasca la oreja izquierda", anamnesis: "Desde hace 4 días. Come y bebe normal. Sin fiebre.", exploracion: "Conducto auditivo izquierdo con eritema y cerumen oscuro. Dolor leve a la palpación.", plan: "Limpieza ótica y gotas cada 12 horas por 7 días. Revisión en una semana.", peso_kg: 27.8, temperatura_c: 38.6, diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis externa", tipo: "definitivo", nota: "" }] }, true);
  await consulta(M.Rocco, { motivo: "Vómito y diarrea desde ayer", anamnesis: "Comió algo en el parque. Decaído, con poco apetito.", exploracion: "Deshidratación leve. Abdomen sensible, sin masas.", plan: "Dieta blanda 3 días, probiótico y suero oral. Vigilar cada 6 horas.", peso_kg: 9.4, temperatura_c: 39.1, diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Gastroenteritis aguda", tipo: "definitivo", nota: "" }] }, true);
  await consulta(M.Luna, { motivo: "Revisión de rutina", anamnesis: "Sin molestias. Vive en interiores.", plan: "" }, false);
  ok("2 consultas firmadas y 1 en borrador");

  // ── Receta simple (de la consulta de Canela) ──
  exigir(await MED.rpc("vet_receta_emitir", { p_perro: M.Canela, p_consulta: cConsulta, p_lineas: [{ insumo_id: prod["ENR-24-052"], producto: null, dosis: "1 mL", dosis_cantidad: 1, via: "Ótica", frecuencia: "Cada 12 horas", frecuencia_horas: 12, duracion_dias: 7 }], p_diagnostico: "Otitis externa", p_observaciones: "Limpiar el oído antes de aplicar." }), "receta");
  ok("receta simple emitida");

  // ── Hospitalizado: Rocco, con medicación y monitoreo ──
  const hosp = exigir(await MED.rpc("hospitalizar_ingresar", { p_perro_id: M.Rocco, p_medico_id: medicoId, p_motivo: "Gastroenteritis con deshidratación", p_ubicacion: "Jaula 2", p_deposito: 500, p_precio_dia: 450 }), "ingreso");
  const hospId = hosp?.id ?? hosp;
  exigir(await MED.rpc("hospitalizar_indicar_medicacion", { p_hosp: hospId, p_producto: "Enrofloxacina 5 %", p_insumo_id: prod["ENR-24-052"], p_dosis: "0.4 mL", p_via: "SC", p_frecuencia_horas: 12, p_primera_dosis: new Date(Date.now() + 2 * 3600000).toISOString(), p_num_dosis: 6, p_precio_dosis: 60, p_indicaciones: "Aplicar con alimento", p_medico_id: medicoId }), "medicación");
  exigir(await MED.rpc("hospitalizar_monitorear", { p_hosp: hospId, p_temperatura: 38.8, p_peso: 9.3, p_fc: 118, p_fr: 28, p_notas: "Mejor ánimo. Tomó agua sin vomitar." }), "monitoreo");
  ok("1 mascota hospitalizada con hoja de medicación");

  // ── Estimado enviado (Luna: esterilización) ──
  const est = exigir(await MED.rpc("vet_estimado_guardar", { p_id: null, p_perro: M.Luna, p_consulta: null, p_cita: null, p_tipo: "cirugia", p_titulo: "Esterilización de Luna", p_notas: "Incluye anestesia, medicación y collar isabelino.", p_vigente_hasta: dia(20), p_medico: medicoId, p_lineas: [
    { tipo: "servicio", descripcion: "Consulta preoperatoria", cantidad: 1, unidad: "pieza", precio_min: 300, precio_max: 400 },
    { tipo: "procedimiento", descripcion: "Ovariohisterectomía", cantidad: 1, precio_min: 1800, precio_max: 2500 },
    { tipo: "insumo", descripcion: "Sutura y material", cantidad: 1, unidad: "pieza", precio_min: 150, precio_max: 220 },
  ] }), "estimado");
  const estId = est?.id ?? est;
  exigir(await MED.rpc("vet_estimado_enviar", { p_id: estId, p_token_hash: crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex") }), "estimado enviado");
  ok("1 estimado enviado al dueño");
  terminado = true;
} finally {
  // Las cuentas del demo vuelven a solo lectura SIEMPRE, aunque algo haya fallado a la mitad.
  await S.from("membresias").update({ solo_lectura: true }).eq("negocio_id", NEG).in("profile_id", cuentas);
  if (!terminado) console.log("  ✘ la siembra no terminó; las cuentas quedaron en solo lectura");
}
console.log(`\nListo: Veterinaria en el demo (entrar por /demo/entrar/veterinaria).`);
