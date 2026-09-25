// Siembra el negocio de DEMOSTRACIÓN "Patitas & Co." (patitasyco).
//
//   node scripts/demo/sembrar-demo.mjs              desarrollo (.env.local)
//   node scripts/demo/sembrar-demo.mjs --prod       producción (llaves leídas al vuelo del CLI)
//   … --rehacer                                     vacía el demo (demo_vaciar) y lo vuelve a sembrar
//
// Todo lo operativo pasa por la app tal como la usa el negocio: JWT real
// de cada persona (recepción reserva, cobra y abre turno; la estilista
// cierra sus citas; el dueño firma su contrato desde su cuenta), con los
// triggers y las validaciones de la base. La secret key solo se usa para
// lo que la app no hace desde una pantalla: dar de alta el negocio y las
// cuentas, subir fotos, y fechar en el pasado lo que la base fecha con
// now() (cobros, turnos, asistencias, firmas), para que el demo tenga un
// mes de historia en vez de todo ocurrido hoy.
//
// Al final todas las cuentas del demo quedan en SOLO LECTURA: quien entra
// desde "Ver demo" explora, no escribe.
//
// Datos: scripts/demo/datos.mjs (todos inventados). Fotos: scripts/demo/fotos.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { generarPdfContrato } from "../../src/lib/contratos/generar-pdf.ts";
import { resolverPlantilla } from "../../src/lib/contratos/plantilla.ts";
import * as D from "./datos.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.argv.includes("--prod");
const REHACER = process.argv.includes("--rehacer");
const MODELO = "10000000-0000-4000-8000-000000000001"; // de donde crear_negocio copia la configuración base
const BUCKET = "perros-archivos";
const IP_FIRMA = "203.0.113.24"; // rango de documentación (RFC 5737): no es de nadie

// ── Conexión ──
function conexion() {
  if (PROD) {
    const keys = JSON.parse(execSync("node node_modules/supabase/dist/supabase.js projects api-keys --project-ref xdsxjhytggpsgrmfuuff -o json", { encoding: "utf8" }));
    const jwt = (nombre) => keys.find((k) => k.name === nombre && String(k.api_key).startsWith("eyJ"))?.api_key;
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
console.log(`Sembrando el demo en ${PROD ? "PRODUCCIÓN" : "desarrollo"}${REHACER ? " (rehacer)" : ""}`);

// ── Fechas (hora del centro de México, sin horario de verano desde 2022) ──
const ZONA = D.NEGOCIO.zona;
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
const AHORA_MIN = (() => { const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: ZONA, hour12: false }).split(":").map(Number); return h * 60 + m; })();
const dia = (n, base = HOY) => { const d = new Date(`${base}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (f) => new Date(`${f}T12:00:00Z`).getUTCDay();
const inst = (f, hhmm) => new Date(`${f}T${hhmm}:00-06:00`).toISOString();
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const meses = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const INICIO_MES = `${HOY.slice(0, 8)}01`;
// La historia cubre el mes anterior completo: la utilidad del mes se compara con él.
const HISTORIA = Math.round((Date.parse(HOY) - Date.parse(meses(INICIO_MES, -1))) / 86_400_000);

// Aleatorio con semilla: el demo sale igual cada vez que se siembra el mismo día.
let semilla = [...HOY].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
const azar = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

const exigir = (r, que) => { if (r.error) throw new Error(`${que}: ${r.error.message}`); return r.data; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Negocio ──
let { data: neg } = await A.from("negocios").select("id, plan").eq("slug", D.NEGOCIO.slug).is("deleted_at", null).maybeSingle();
if (neg && !REHACER) throw new Error(`El demo ya existe (${neg.id}). Para volver a sembrarlo: --rehacer.`);
if (neg) {
  if (neg.plan !== "demo") throw new Error("El negocio con ese slug no es un demo: no se toca.");
  // Las fotos y PDFs del demo viven bajo la carpeta de cada cliente.
  const { data: previos } = await A.from("clientes").select("id").eq("negocio_id", neg.id);
  for (const c of previos ?? []) await borrarCarpeta(c.id);
  const borrado = exigir(await createClient(C.url, C.secreta, { ...sinSesion, global: { headers: { "x-negocio-id": neg.id } } }).rpc("demo_vaciar", { p_negocio_id: neg.id }), "demo_vaciar");
  console.log("vaciado:", borrado.filter((b) => b.borradas > 0).map((b) => `${b.tabla} ${b.borradas}`).join(", "));
} else {
  const id = exigir(await A.rpc("crear_negocio", { p_slug: D.NEGOCIO.slug, p_nombre: D.NEGOCIO.nombre, p_zona_horaria: ZONA, p_ciudad: D.NEGOCIO.ciudad, p_dominio: null, p_modelo: MODELO }), "crear_negocio");
  neg = { id };
  exigir(await A.from("negocios").update({ plan: "demo", marca: { nombre_corto: D.NEGOCIO.nombre, color: D.NEGOCIO.color } }).eq("id", id), "plan demo");
  console.log("negocio creado", id);
}
const NEG = neg.id;
const S = createClient(C.url, C.secreta, { ...sinSesion, global: { headers: { "x-negocio-id": NEG } } });
const deNeg = (tabla, sel = "id") => S.from(tabla).select(sel).eq("negocio_id", NEG);

async function borrarCarpeta(prefijo) {
  const { data } = await A.storage.from(BUCKET).list(prefijo, { limit: 1000 });
  for (const f of data ?? []) {
    const ruta = `${prefijo}/${f.name}`;
    if (f.id) await A.storage.from(BUCKET).remove([ruta]);
    else await borrarCarpeta(ruta);
  }
}

// La base arranca la configuración copiada "desde hoy": el demo tiene
// historia, así que el cupo y el tope de descuentos valen desde antes.
exigir(await S.from("cupo_configuracion").update({ vigencia_desde: dia(-120), cupo_diurno: 20, cupo_nocturno: 8 }).eq("negocio_id", NEG).is("deleted_at", null), "cupo");
exigir(await S.from("configuracion_descuentos").update({ vigencia_desde: dia(-120) }).eq("negocio_id", NEG).is("deleted_at", null), "descuentos");

// ── Cuentas y sesiones ──
async function cuenta(email, nombre) {
  const { data: existente } = await A.rpc("usuario_por_email", { p_email: email });
  const id = existente ?? exigir(await A.auth.admin.createUser({ email, password: `Demo-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: nombre } }), `crear ${email}`).user.id;
  // El nombre que ve la app en el encabezado y en la agenda.
  exigir(await A.from("profiles").update({ nombre_completo: nombre }).eq("id", id), `nombre ${email}`);
  return id;
}
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
async function membresia(id) {
  return (await A.from("membresias").select("rol").eq("profile_id", id).eq("negocio_id", NEG).is("deleted_at", null).maybeSingle()).data;
}

const P = {}; // clave → { id (cuenta), empleado, ... }
for (const p of D.PERSONAL) {
  P[p.clave] = { ...p };
  if (!p.email) continue;
  const id = await cuenta(p.email, p.nombre);
  P[p.clave].id = id;
  if (!(await membresia(id))) {
    if (p.rol === "admin") exigir(await A.rpc("agregar_admin_negocio", { p_negocio_id: NEG, p_profile_id: id }), "admin");
    else exigir(await S.rpc("asignar_rol_staff", { p_user_id: id, p_rol: p.rol, p_nombre_completo: p.nombre }), `rol ${p.clave}`);
  }
  // Una corrida anterior las dejó en solo lectura: se abren mientras se siembra.
  exigir(await S.from("membresias").update({ solo_lectura: false }).eq("profile_id", id).eq("negocio_id", NEG), "abrir cuenta");
}
const ADM = await como(P.admin.id);
const REC = await como(P.recepcion.id);
const EST = { estetica: await como(P.estetica.id), estetica2: await como(P.estetica2.id) };

// ── Catálogo de referencia ──
const porClave = (filas) => Object.fromEntries(filas.map((f) => [f.clave, f]));
const servicios = porClave(exigir(await deNeg("servicios", "id, clave, nombre, categoria, vigencia_dias, duracion_minutos").is("deleted_at", null), "servicios"));
const tamanos = porClave(exigir(await A.from("tamanos_categoria").select("id, clave").is("deleted_at", null), "tamaños"));
const pelajes = porClave(exigir(await A.from("tipos_pelaje").select("id, clave").is("deleted_at", null), "pelajes"));
const grupos = porClave(exigir(await deNeg("grupos_raza", "id, clave, depende_tamano").is("deleted_at", null), "grupos"));
const requisitos = porClave(exigir(await deNeg("tipos_requisito_sanitario", "id, clave, vigencia_meses").is("deleted_at", null), "requisitos"));
const alertas = porClave(exigir(await deNeg("catalogo_alertas", "id, clave").is("deleted_at", null), "alertas"));
const areas = porClave(exigir(await deNeg("areas_inventario", "id, clave").is("deleted_at", null), "áreas"));
const categoriasGasto = porClave(exigir(await deNeg("categorias_gasto", "id, clave").is("deleted_at", null), "categorías de gasto"));
const unidades = porClave(exigir(await A.from("unidades_medida").select("id, clave, equivalencia_en_base"), "unidades"));
const tiposContrato = Object.fromEntries(exigir(await deNeg("tipos_contrato", "id, nombre").is("deleted_at", null), "tipos de contrato").map((t) => [t.nombre, t.id]));
const razas = exigir(await A.from("razas").select("id, nombre, es_desconocida").is("deleted_at", null), "razas");
const razaDe = (nombre) => razas.find((r) => r.nombre.toLowerCase() === nombre.toLowerCase()) ?? razas.find((r) => r.es_desconocida);
const grupoDeRaza = Object.fromEntries(exigir(await deNeg("razas_grupo", "raza_id, grupo_raza_id").is("deleted_at", null), "razas por grupo")
  .map((rg) => [rg.raza_id, Object.values(grupos).find((g) => g.id === rg.grupo_raza_id)?.clave]));

// ── Paquetes de guardería (crear_negocio no copia los bonos) ──
for (const b of D.BONOS) {
  if (servicios[b.clave]) continue;
  const fila = exigir(await ADM.from("servicios").insert({
    clave: b.clave, nombre: b.nombre, categoria: "bono", unidad: "dia", depende_grupo_raza: false, depende_tamano: false,
    depende_pelaje: false, depende_cantidad: false, servicio_incluido_id: servicios.guarderia_dia.id, ilimitado: b.ilimitado,
    monto_libre: false, cantidad_incluida: b.cantidad_incluida, vigencia_dias: b.vigencia_dias, orden: b.orden,
  }).select("id, clave, nombre, categoria, vigencia_dias, duracion_minutos").single(), `bono ${b.clave}`);
  servicios[b.clave] = fila;
}

// ── Tarifas ──
const VIG = dia(-120);
const tarifas = [];
const t = (clave, precio, extra = {}) => tarifas.push({ servicio_id: servicios[clave].id, precio, no_aplica: precio === null, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: VIG, ...extra });
t("guarderia_hora", D.PRECIOS.guarderia_hora);
t("guarderia_dia", D.PRECIOS.guarderia_dia);
for (const [talla, precio] of Object.entries(D.PRECIOS.hotel_noche)) t("hotel_noche", precio, { tamano_id: tamanos[talla].id });
t("recoleccion", D.PRECIOS.recoleccion);
for (const [clave, precio] of Object.entries(D.PRECIOS.bonos)) t(clave, precio);
const ESTETICA = ["estetica_estetico", "estetica_rapado", "estetica_expres"];
for (const [grupo, precios] of Object.entries(D.PRECIOS.estetica)) {
  const filas = Array.isArray(precios) ? [[null, precios]] : Object.entries(precios).map(([talla, p]) => [tamanos[talla].id, p]);
  for (const [tamanoId, [completo, rapado, expres]] of filas) {
    ESTETICA.forEach((clave, i) => {
      const precio = [completo, rapado, expres][i];
      t(clave, precio, {
        grupo_raza_id: grupos[grupo].id,
        tamano_id: tamanoId,
        precio_pelo_maltratado: clave === "estetica_estetico" && precio !== null ? precio + D.PRECIOS.pelo_maltratado_extra : null,
      });
    });
  }
}
for (const f of tarifas) if (f.no_aplica) f.precio = null;
exigir(await ADM.from("tarifas").insert(tarifas), "tarifas");
console.log(`tarifas: ${tarifas.length}`);

// ── Plantillas de contrato ──
for (const [tipo, p] of Object.entries(D.PLANTILLAS)) {
  if (!tiposContrato[tipo]) continue;
  exigir(await ADM.rpc("publicar_plantilla", { p_tipo_contrato_id: tiposContrato[tipo], p_titulo: p.titulo, p_cuerpo: p.cuerpo, p_requiere_refirma: false }), `plantilla ${tipo}`);
}

// ── Empleados, horarios y esquemas de pago ──
for (const p of D.PERSONAL.filter((x) => x.clave !== "admin")) { // la dueña no es empleada
  const ingreso = p.clave === "estetica2" ? dia(-200) : p.clave === "limpieza" ? dia(-150) : dia(-420);
  const e = exigir(await ADM.from("empleados").insert({
    nombre: p.nombre, puesto: p.puesto, fecha_ingreso: ingreso, telefono: p.telefono, profile_id: P[p.clave].id ?? null,
    emergencia_nombre: "Contacto de ejemplo", emergencia_telefono: "4420000999", emergencia_parentesco: "Familiar",
  }).select("id").single(), `empleado ${p.nombre}`);
  P[p.clave].empleado = e.id;
  P[p.clave].ingreso = ingreso;
  if (p.horario) exigir(await ADM.rpc("guardar_horario_empleado", { p_empleado_id: e.id, p_dias: D.HORARIOS[p.horario] }), `horario ${p.nombre}`);
  if (p.pago) {
    exigir(await ADM.from("esquemas_pago").insert({
      empleado_id: e.id, vigente_desde: ingreso, sueldo_monto: p.pago.sueldo_monto ?? null, sueldo_periodicidad: p.pago.sueldo_periodicidad ?? null,
      pago_por_dia: p.pago.pago_por_dia ?? null, con_comision: Boolean(p.pago.con_comision), comision_tipo: p.pago.comision_tipo ?? null,
      comision_valor: p.pago.comision_valor ?? null, recibe_propinas: Boolean(p.pago.recibe_propinas),
    }), `esquema ${p.nombre}`);
  }
}

// ── Inventario: proveedores, consumibles (con compras y consumo), recetas, equipo ──
// Compras y salidas de inventario, fechadas: la base las fecha con now().
async function comprar(insumoId, proveedor, cantidad, costo, fecha, que) {
  exigir(await ADM.rpc("registrar_entrada_compra", { p_insumo_id: insumoId, p_proveedor_id: proveedor, p_cantidad_compra: cantidad, p_costo_unitario: costo, p_fecha_caducidad: null }), `compra ${que}`);
  const { data: mov } = await S.from("movimientos_inventario").select("id").eq("negocio_id", NEG).eq("insumo_id", insumoId).eq("tipo", "entrada_compra").order("created_at", { ascending: false }).limit(1).single();
  exigir(await S.from("movimientos_inventario").update({ created_at: inst(fecha, "11:00") }).eq("id", mov.id), "fechar compra");
  exigir(await S.from("compras_insumos").update({ created_at: inst(fecha, "11:00") }).eq("movimiento_id", mov.id), "fechar compra");
}
async function salida(insumoId, cantidad, tipo, motivo, fecha, que) {
  if (!(cantidad > 0)) return;
  const id = exigir(await REC.rpc("registrar_salida", { p_insumo_id: insumoId, p_cantidad_consumo: cantidad, p_tipo: tipo, p_motivo: motivo }), `salida ${que}`);
  const mov = typeof id === "string" ? id : null;
  if (mov) exigir(await S.from("movimientos_inventario").update({ created_at: inst(fecha, "18:00") }).eq("id", mov), "fechar salida");
}

const proveedores = [];
for (const pr of D.PROVEEDORES) proveedores.push(exigir(await ADM.from("proveedores").insert(pr).select("id").single(), "proveedor").id);
const insumos = {};
for (const [nombre, area, uCompra, uConsumo, minimo, compras, consumido] of D.INSUMOS) {
  const eq = unidades[uConsumo].equivalencia_en_base;
  const i = exigir(await ADM.from("insumos").insert({
    nombre, area_id: areas[area].id, unidad_compra_id: unidades[uCompra].id, unidad_consumo_id: unidades[uConsumo].id,
    stock_minimo: minimo * eq, existencia_inicial: 0, requiere_caducidad: false,
  }).select("id").single(), `insumo ${nombre}`);
  insumos[nombre] = i.id;
  const proveedor = area === "estetica" ? proveedores[0] : area === "guarderia_hotel" ? proveedores[1] : area === "limpieza" ? proveedores[2] : null;
  for (const [cantidad, costo] of compras) await comprar(i.id, proveedor, cantidad, costo, dia(-HISTORIA - 3), nombre);
  // Lo que se gasta sin receta (croquetas, limpieza): repartido entre los dos meses.
  if (consumido > 0 && !D.RECETAS.estetica_estetico.some(([n]) => n === nombre)) {
    const mitad = Math.round(consumido * 0.45);
    await salida(i.id, mitad, "consumo", null, dia(14, meses(INICIO_MES, -1)), nombre);
    await salida(i.id, consumido - mitad, "consumo", null, dia(-5), nombre);
  }
}
// Una merma para que el reporte la tenga.
await salida(insumos["Croquetas adulto (bulto 20 kg)"], 1500, "merma", "Bulto abierto se humedeció", dia(-10), "merma");
for (const [servicio, lineas] of Object.entries(D.RECETAS)) {
  for (const talla of Object.values(tamanos)) {
    for (const [nombre, cantidad] of lineas) {
      const eq = unidades[D.INSUMOS.find((x) => x[0] === nombre)[3]].equivalencia_en_base;
      exigir(await ADM.from("recetas_consumo").insert({ servicio_id: servicios[servicio].id, tamano_id: talla.id, insumo_id: insumos[nombre], cantidad_consumo: ["ml", "g"].includes(D.INSUMOS.find((x) => x[0] === nombre)[3]) ? cantidad * eq * (talla.clave === "grande" ? 1.5 : talla.clave === "mediano" ? 1.2 : 1) : cantidad * eq }), `receta ${servicio}`);
    }
  }
}
for (const [nombre, area, cantidad, estado, frecuencia, que, hace, nota] of D.EQUIPOS) {
  exigir(await ADM.from("equipos").insert({
    nombre, area_id: areas[area].id, cantidad, estado, frecuencia_mantenimiento_dias: frecuencia, que_mantenimiento: que,
    ultimo_mantenimiento: hace === null ? null : dia(-hace), notas: nota ?? null,
  }), `equipo ${nombre}`);
}
console.log(`inventario: ${D.INSUMOS.length} consumibles, ${D.EQUIPOS.length} equipos`);

// ── Clientes, perros, fotos, vacunas, alertas, evaluaciones ──
const PERROS = [];
const CLIENTES = [];
for (const [ci, c] of D.CLIENTES.entries()) {
  const cli = exigir(await REC.from("clientes").insert({ nombre: c.nombre, telefono: c.telefono, email: c.email ?? null, consentimiento_imagen: ci % 3 !== 2 }).select("id").single(), `cliente ${c.nombre}`);
  const cliente = { ...c, id: cli.id, perros: [] };
  CLIENTES.push(cliente);
  for (const p of c.perros) {
    const vet = D.VETERINARIOS[ci % 2];
    const raza = razaDe(D_FOTO(p.foto).raza);
    const fila = exigir(await REC.from("perros").insert({
      cliente_id: cli.id, nombre: p.nombre, raza_id: raza.id, raza: raza.es_desconocida ? "Mestizo" : raza.nombre, fecha_nacimiento: p.nacio, sexo: p.sexo,
      esterilizado: p.esterilizado, tamano_id: tamanos[p.talla].id, pelaje_id: pelajes[D.PELAJE[D_FOTO(p.foto).raza] ?? "corto"].id, temperamento_notas: p.temperamento ?? null,
      alimentacion_notas: p.alimentacion ?? "Sus croquetas de casa, dos veces al día.",
      contacto_emergencia_nombre: "Contacto de ejemplo", contacto_emergencia_telefono: `44200009${String(ci).padStart(2, "0")}`,
      veterinario_nombre: vet.nombre, veterinario_telefono: vet.telefono, veterinario_clinica: vet.clinica,
      autorizacion_medica_notas: "Puede recibir atención de urgencia con su veterinario.", tope_gasto_autorizado: p.usos.includes("H") ? 2500 : null,
    }).select("id").single(), `perro ${p.nombre}`);
    const ruta = `${cli.id}/${fila.id}/perfil/${p.foto}.jpg`;
    exigir(await A.storage.from(BUCKET).upload(ruta, fs.readFileSync(path.join(AQUI, "fotos", `${p.foto}.jpg`)), { contentType: "image/jpeg", upsert: true }), `foto ${p.nombre}`);
    exigir(await REC.from("perros").update({ foto_path: ruta }).eq("id", fila.id), `foto_path ${p.nombre}`);
    const perro = { ...p, id: fila.id, cliente, grupo: grupoDeRaza[raza.id] ?? "pelo_corto" };
    cliente.perros.push(perro);
    PERROS.push(perro);
    if ((p.usos.includes("G") || p.usos.includes("H")) && !p.nueva) {
      exigir(await ADM.rpc("marcar_evaluacion_comportamiento", { p_perro_id: fila.id, p_fecha: dia(-60 - ci), p_notas: "Convive bien en grupo." }), `evaluación ${p.nombre}`);
    }
    if (p.alerta) exigir(await REC.from("perro_alertas").insert({ perro_id: fila.id, alerta_id: alertas[p.alerta[0]].id, notas: p.alerta[1], activa: true }), `alerta ${p.nombre}`);
  }
}
function D_FOTO(id) {
  const lista = JSON.parse(fs.readFileSync(path.join(AQUI, "fotos", "fotos.json"), "utf8"));
  return lista.find((f) => f.id === id);
}
const perro = (nombre) => PERROS.find((p) => p.nombre === nombre);

// Vacunas. Las que deben verse vencidas se capturan vigentes y se vencen
// DESPUÉS de la historia (la base revisa el estado de hoy al reservar, y el
// perro sí estuvo al día cuando vino).
async function vacunas(p, soloVencidas) {
  if (p.vacunas === "sin_registro") return;
  const especial = typeof p.vacunas === "object" ? p.vacunas : {};
  for (const req of Object.values(requisitos)) {
    const estado = especial[req.clave] ?? "vigente";
    if (soloVencidas) {
      if (estado !== "vencida") continue;
      exigir(await S.from("requisitos_sanitarios_aplicados").update({ fecha_aplicacion: meses(dia(-4), -req.vigencia_meses) }).eq("perro_id", p.id).eq("tipo_requisito_id", req.id), `vencer ${p.nombre}`);
      continue;
    }
    const vence = estado === "vence_pronto" ? dia(8) : dia(Math.min(35 + Math.floor(azar() * 150), req.vigencia_meses * 30 - 5));
    const aplicada = meses(vence, -req.vigencia_meses);
    exigir(await REC.from("requisitos_sanitarios_aplicados").insert({ perro_id: p.id, tipo_requisito_id: req.id, fecha_aplicacion: aplicada, vigencia_meses_aplicado: req.vigencia_meses, detalle: req.clave === "antirrabica" ? "Aplicada en su clínica" : null }), `vacuna ${p.nombre}`);
  }
}
for (const p of PERROS) await vacunas(p, false);
console.log(`clientes: ${CLIENTES.length}, perros: ${PERROS.length}`);

// ── Cuentas del portal (dueños que firman en línea) ──
const telefonoACorreo = (tel) => `t${tel}@telefono.ludogteka.mx`;
for (const c of CLIENTES) {
  const conFirma = c.perros.some((p) => (p.usos.includes("G") || p.usos.includes("H")) && !p.nueva) || c.portal;
  if (!conFirma) continue;
  c.cuenta = await cuenta(telefonoACorreo(c.telefono), c.nombre);
  if (!(await membresia(c.cuenta))) exigir(await S.rpc("vincular_membresia_cliente", { p_user_id: c.cuenta, p_cliente_id: c.id }), `vincular ${c.nombre}`);
  exigir(await S.from("membresias").update({ solo_lectura: false }).eq("profile_id", c.cuenta).eq("negocio_id", NEG), "abrir cuenta cliente");
}

// ── Contratos: generar y firmar ──
const firmaPng = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120"><path d="M20 80 C 60 20, 90 110, 130 60 S 190 30, 210 75 S 280 95, 340 40" fill="none" stroke="#1f2a44" stroke-width="4" stroke-linecap="round"/></svg>`)).png().toBuffer();
async function firmar(contratoId, cliente, fecha, papel = false) {
  const DUENO = papel ? REC : await como(cliente.cuenta);
  const { data: con } = await S.from("contratos").select("id, perro_id, cliente_id, plantillas_contrato(titulo, cuerpo)").eq("id", contratoId).single();
  const campos = exigir(await DUENO.rpc("resolver_campos_de_contrato", { p_contrato_id: contratoId }), "campos del contrato");
  const pdf = await generarPdfContrato({
    titulo: resolverPlantilla(con.plantillas_contrato.titulo, campos),
    cuerpo: resolverPlantilla(con.plantillas_contrato.cuerpo, campos),
    firma: papel ? undefined : { pngBytes: firmaPng, firmanteNombre: cliente.nombre, fechaHoraTexto: `${fecha.split("-").reverse().join("/")} 10:12`, lugarHora: D.NEGOCIO.ciudad, ip: IP_FIRMA },
  });
  const hash = crypto.createHash("sha256").update(pdf).digest("hex");
  const ruta = `${con.cliente_id}/${con.perro_id}/contrato/${con.id}.pdf`;
  exigir(await A.storage.from(BUCKET).upload(ruta, pdf, { contentType: "application/pdf", upsert: true }), "subir contrato");
  if (papel) exigir(await REC.rpc("subir_contrato_papel", { p_contrato_id: contratoId, p_storage_path: ruta, p_hash_pdf: hash }), "contrato en papel");
  else exigir(await DUENO.rpc("finalizar_firma_contrato", { p_contrato_id: contratoId, p_storage_path: ruta, p_hash_pdf: hash, p_ip: IP_FIRMA }), "firmar");
  exigir(await S.from("contratos").update({ fecha_firma: inst(fecha, "10:12"), created_at: inst(dia(-1, fecha), "17:30") }).eq("id", contratoId), "fechar firma");
}
async function generar(p, tipo) {
  return exigir(await REC.rpc("generar_contrato", { p_perro_id: p.id, p_tipo_contrato_id: tiposContrato[tipo] }), `contrato ${tipo} ${p.nombre}`);
}
const idContrato = (r) => (typeof r === "string" ? r : r?.id ?? r?.[0]?.id ?? r?.contrato_id);
let firmados = 0;
for (const p of PERROS) {
  if (!(p.usos.includes("G") || p.usos.includes("H") || p.nueva)) continue;
  const general = idContrato(await generar(p, "Contrato general"));
  if (p.nueva) { exigir(await S.from("contratos").update({ created_at: inst(dia(-4), "12:05") }).eq("id", general), "fechar pendiente"); continue; }
  await firmar(general, p.cliente, dia(-HISTORIA - 5 - (firmados % 20)), Boolean(p.papel));
  firmados++;
  // El de guardería de quien viene por día suelto (a quien compra paquete se le genera al comprarlo).
  if (p.usos.includes("G") && !p.bono) { await firmar(idContrato(await generar(p, "Contrato de guardería")), p.cliente, dia(-HISTORIA - 3 - (firmados % 20))); firmados++; }
  if (p.usos.includes("H") || p.usos.includes("G")) {
    const hotel = idContrato(await generar(p, "Contrato de hotel"));
    if (p.contratoHotelPendiente) exigir(await S.from("contratos").update({ created_at: inst(dia(-2), "16:40") }).eq("id", hotel), "fechar pendiente");
    else { await firmar(hotel, p.cliente, dia(-HISTORIA - 4 - (firmados % 20))); firmados++; }
  }
}
console.log(`contratos firmados: ${firmados}`);

// ── La historia: un turno por día, guardería, hotel, estética y cobros ──
const G = PERROS.filter((p) => p.usos.includes("G"));
const E_ = PERROS.filter((p) => p.usos.includes("E") || p.usos.includes("G"));
// Un día que cae en domingo (cerrado) se recorre al lunes.
const habil = (n) => (dow(dia(n)) === 0 ? n + 1 : n);
const HOTEL = [
  // [perro, entra (días desde hoy), sale]
  ["Max", -21, -16], ["Oreo", -12, -9], ["Simba", -19, -17], ["Mochi", -9, -7], ["Oreo", -6, -4], ["Thor", -15, -13],
  ["Thor", -3, 2], ["Max", -1, 1], ["Mochi", -2, 0], ["Oreo", 0, 3], ["Rocco", 5, 8], ["Luna", 9, 12], ["Mochi", 6, 8],
].map(([p, a, b]) => [p, a > 0 || a < -3 ? habil(a) : a, b > 0 || b < -3 ? habil(b) : b]);
for (const p of PERROS) if (p.bono) p.bonoHace = -habil(-p.bonoHace);
const RESERVAS_DIA = []; // reservas cerradas en el día, para cobrarlas
const bonoVendido = {};

async function reservaDe(cliente, notas = null) {
  return exigir(await REC.from("reservas").insert({ cliente_id: cliente.id, notas }).select("id").single(), "reserva").id;
}
async function estancia(reserva, p, servicio, entra, sale, extra = {}) {
  return exigir(await REC.from("estancias").insert({ reserva_id: reserva, perro_id: p.id, servicio_id: servicios[servicio].id, fecha_entrada: entra, fecha_salida: sale, ...extra }).select("id").single(), `estancia ${p.nombre} ${entra}`).id;
}
async function checkin(id, p, fecha, hora) {
  exigir(await REC.from("estancias").update({ estado: "en_curso", entregado_por_nombre: p.cliente.nombre, hora_entrada_real: inst(fecha, hora), estado_llegada: "Llega bien, con su correa." }).eq("id", id), "check-in");
}
async function checkout(id, p, fecha, hora) {
  exigir(await REC.from("estancias").update({ estado: "finalizada", recogido_por_nombre: p.cliente.nombre, recogido_por_es_dueno: true, hora_salida_real: inst(fecha, hora) }).eq("id", id), "check-out");
}
async function cobrar(reserva, fecha, hora, metodo, propina = 0) {
  const [tot] = exigir(await REC.rpc("cuenta_totales_reserva", { p_reserva_id: reserva }), "totales");
  const saldo = Number(tot?.saldo ?? 0);
  if (saldo <= 0) return 0;
  exigir(await REC.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: null, p_metodos: [{ metodo, monto: saldo, propina }] }), "cobro");
  const { data: c } = await S.from("cobros").select("id").eq("reserva_id", reserva).order("created_at", { ascending: false }).limit(1).single();
  exigir(await S.from("cobros").update({ created_at: inst(fecha, hora) }).eq("id", c.id), "fechar cobro");
  exigir(await S.from("cobro_metodos").update({ created_at: inst(fecha, hora) }).eq("cobro_id", c.id), "fechar métodos");
  return saldo;
}
const metodoAlAzar = () => { const x = azar(); return x < 0.45 ? "terminal" : x < 0.8 ? "efectivo" : "transferencia"; };

// Citas: la estilista de cada una y su hora. Luis no viene lunes y entra a las 11.
function agendaDelDia(fecha, cuantas) {
  const sabado = dow(fecha) === 6;
  const libres = { estetica: sabado ? 600 : 540, estetica2: sabado ? 600 : 660 };
  const fin = sabado ? 840 : 1080;
  const citas = [];
  const usados = new Set();
  for (let k = 0; k < cuantas; k++) {
    const quien = dow(fecha) === 1 ? "estetica" : k % 2 === 0 ? "estetica" : "estetica2";
    let p;
    for (let intento = 0; intento < 20 && (!p || usados.has(p.nombre)); intento++) p = elegir(E_);
    if (usados.has(p.nombre)) continue;
    let servicio = p.talla === "grande" && azar() < 0.4 ? "estetica_expres" : elegir(["estetica_estetico", "estetica_estetico", "estetica_rapado", "estetica_expres"]);
    // El rapado no aplica a los de pelo corto (no tiene precio en su grupo).
    if (servicio === "estetica_rapado" && ["pelo_corto", "pastor_corto"].includes(p.grupo)) servicio = "estetica_estetico";
    const dur = servicios[servicio].duracion_minutos ?? 60;
    if (libres[quien] + dur > fin) continue;
    usados.add(p.nombre);
    citas.push({ p, quien, servicio, inicio: libres[quien], dur });
    libres[quien] += dur + 15;
  }
  return citas;
}
async function cita(p, quien, servicio, fecha, inicioMin) {
  const reserva = await reservaDe(p.cliente);
  const r = await REC.from("citas_estetica").insert({ reserva_id: reserva, perro_id: p.id, servicio_id: servicios[servicio].id, empleado_id: P[quien].id, inicio: inst(fecha, hhmm(inicioMin)), pelo_maltratado: false }).select("id").single();
  if (r.error) { console.log(`  (cita omitida: ${p.nombre} ${fecha} — ${r.error.message})`); return null; }
  return { id: r.data.id, reserva };
}
async function cerrarCita(c, p, quien, fecha, finMin) {
  exigir(await REC.from("citas_estetica").update({ estado: "en_curso", entregado_por_nombre: p.cliente.nombre }).eq("id", c.id), "iniciar cita");
  exigir(await EST[quien].rpc("finalizar_cita_con_consumo", { p_cita_id: c.id, p_recogido_por_nombre: p.cliente.nombre, p_recogido_por_telefono: null, p_recogido_por_es_dueno: true, p_ajustes: [] }), "finalizar cita");
  exigir(await S.from("movimientos_inventario").update({ created_at: inst(fecha, hhmm(finMin)) }).eq("negocio_id", NEG).gte("created_at", new Date(Date.now() - 60_000).toISOString()).eq("tipo", "salida_consumo"), "fechar consumo");
}

let turnoAbierto = null;
async function abrirTurno(fecha) {
  const t = exigir(await REC.from("turnos_caja").insert({ fondo_inicial: 800, notas_apertura: null }).select("id").single(), "abrir turno");
  exigir(await S.from("turnos_caja").update({ abierto_at: inst(fecha, dow(fecha) === 6 ? "09:45" : "08:45"), created_at: inst(fecha, "08:45") }).eq("id", t.id), "fechar turno");
  turnoAbierto = t.id;
}
async function cerrarTurno(fecha) {
  const previo = exigir(await REC.rpc("cerrar_turno", { p_turno_id: turnoAbierto, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: null }), "esperado del turno")[0];
  if (!previo.cerrado) {
    exigir(await REC.rpc("cerrar_turno", { p_turno_id: turnoAbierto, p_conteo_efectivo: previo.esperado_efectivo, p_conteo_terminal: previo.esperado_terminal, p_conteo_transferencia: previo.esperado_transferencia, p_explicacion_diferencias: null, p_notas_cierre: null }), "cerrar turno");
  }
  const cierre = inst(fecha, dow(fecha) === 6 ? "14:20" : "19:15");
  exigir(await S.from("turnos_caja").update({ cerrado_at: cierre }).eq("id", turnoAbierto), "fechar cierre");
  exigir(await S.from("cortes_caja").update({ created_at: cierre }).eq("turno_id", turnoAbierto), "fechar corte");
  turnoAbierto = null;
}
async function aplicarBono(estanciaId, fecha, hora) {
  const r = await REC.rpc("aplicar_bono_a_estancia", { p_estancia_id: estanciaId });
  if (r.error) return;
  exigir(await S.from("movimientos_bono").update({ created_at: inst(fecha, hora) }).eq("item_id", estanciaId), "fechar consumo de bono");
}
async function venderBono(p, fecha) {
  const b = D.BONOS.find((x) => x.clave === p.bono);
  exigir(await REC.rpc("comprar_bono", { p_perro_id: p.id, p_servicio_id: servicios[b.clave].id, p_notas: null, p_metodos: [{ metodo: "transferencia", monto: D.PRECIOS.bonos[b.clave] }] }), `bono ${p.nombre}`);
  const { data: bono } = await S.from("bonos_clientes").select("id, reserva_id").eq("negocio_id", NEG).eq("perro_id", p.id).order("created_at", { ascending: false }).limit(1).single();
  exigir(await S.from("bonos_clientes").update({ fecha_compra: fecha, fecha_vencimiento: dia(b.vigencia_dias, fecha), created_at: inst(fecha, "09:20") }).eq("id", bono.id), "fechar bono");
  exigir(await S.from("movimientos_bono").update({ created_at: inst(fecha, "09:20") }).eq("bono_cliente_id", bono.id).eq("tipo", "venta"), "fechar venta de bono");
  const { data: cob } = await S.from("cobros").select("id").eq("reserva_id", bono.reserva_id);
  for (const c of cob ?? []) {
    exigir(await S.from("cobros").update({ created_at: inst(fecha, "09:20") }).eq("id", c.id), "fechar cobro de bono");
    exigir(await S.from("cobro_metodos").update({ created_at: inst(fecha, "09:20") }).eq("cobro_id", c.id), "fechar métodos de bono");
  }
  bonoVendido[p.nombre] = fecha;
  // Comprar un paquete genera el contrato de guardería: el dueño lo firma ese día.
  const { data: con } = await S.from("contratos").select("id").eq("perro_id", p.id).eq("bono_cliente_id", bono.id).eq("estado", "pendiente_firma").maybeSingle();
  if (con) await firmar(con.id, p.cliente, fecha);
}

const hotelActivo = new Map(); // perro → { reserva, estancia, sale }
for (let n = -HISTORIA; n <= 0; n++) {
  const fecha = dia(n);
  if (dow(fecha) === 0) continue;
  const hoy = n === 0;
  await abrirTurno(fecha);
  const cobrarLuego = []; // [reserva, hora, método, propina]

  // Paquetes que se venden este día.
  for (const p of PERROS.filter((x) => x.bono && -x.bonoHace === n)) await venderBono(p, fecha);

  // Hotel: llegadas y salidas.
  for (const [nombre, entra, sale] of HOTEL) {
    const p = perro(nombre);
    if (entra === n) {
      const reserva = await reservaDe(p.cliente);
      const id = await estancia(reserva, p, "hotel_noche", fecha, dia(sale - entra, fecha));
      if (!hoy) await checkin(id, p, fecha, "10:30");
      hotelActivo.set(`${nombre}${entra}`, { reserva, id, sale, p });
    }
  }
  for (const [clave, h] of hotelActivo) {
    if (h.sale !== n) continue;
    if (hoy) continue; // la salida de hoy queda pendiente: cuenta abierta en caja
    await checkout(h.id, h.p, fecha, "12:10");
    cobrarLuego.push([h.reserva, "12:15", metodoAlAzar(), 0]);
    hotelActivo.delete(clave);
  }

  // Guardería: los perros frecuentes (el sábado vienen menos).
  const roster = G.filter(() => azar() < (dow(fecha) === 6 ? 0.3 : 0.7));
  for (const [i, p] of roster.entries()) {
    if ([...hotelActivo.values()].some((h) => h.p === p)) continue;
    const reserva = await reservaDe(p.cliente);
    const porHora = p.nombre === "Kiwi";
    const id = await estancia(reserva, p, porHora ? "guarderia_hora" : "guarderia_dia", fecha, dia(1, fecha), porHora ? { horas: 4 } : {});
    const tieneBono = p.bono && bonoVendido[p.nombre] && bonoVendido[p.nombre] <= fecha;
    if (tieneBono) await aplicarBono(id, fecha, "08:50");
    const llega = hhmm(510 + i * 9);
    if (hoy) {
      if (i < roster.length - 2 || roster.length < 4) await checkin(id, p, fecha, llega);
      continue; // se cobran al recogerlos: hoy quedan con saldo
    }
    await checkin(id, p, fecha, llega);
    await checkout(id, p, fecha, porHora ? hhmm(510 + i * 9 + 230) : hhmm(1020 + i * 7));
    cobrarLuego.push([reserva, hhmm(1025 + i * 7), metodoAlAzar(), 0]);
  }

  // Estética.
  const agenda = agendaDelDia(fecha, dow(fecha) === 6 ? 3 : 4 + Math.floor(azar() * 3));
  for (const c of agenda) {
    const creada = await cita(c.p, c.quien, c.servicio, fecha, c.inicio);
    if (!creada) continue;
    const finMin = c.inicio + c.dur;
    if (hoy && finMin > AHORA_MIN) {
      if (c.inicio <= AHORA_MIN) exigir(await REC.from("citas_estetica").update({ estado: "en_curso", entregado_por_nombre: c.p.cliente.nombre }).eq("id", creada.id), "cita en curso");
      else if (azar() < 0.5) exigir(await REC.from("citas_estetica").update({ estado: "confirmada" }).eq("id", creada.id), "confirmar cita");
      continue;
    }
    await cerrarCita(creada, c.p, c.quien, fecha, finMin);
    cobrarLuego.push([creada.reserva, hhmm(finMin + 5), metodoAlAzar(), azar() < 0.35 ? elegir([30, 50, 50, 100]) : 0]);
  }

  let total = 0;
  for (const [reserva, hora, metodo, propina] of cobrarLuego) total += await cobrar(reserva, fecha, hora, metodo, propina);
  if (!hoy) await cerrarTurno(fecha);
  RESERVAS_DIA.push([fecha, total]);
  process.stdout.write(`${fecha.slice(5)} $${total} · `);
}
console.log();

// Hoy, lo que no cabe en el ciclo: una cuenta con comida especial, bitácora.
const mochi = hotelActivo.get("Mochi-2");
if (mochi) {
  exigir(await REC.rpc("crear_cargo_suelto", { p_cliente_id: mochi.p.cliente.id, p_servicio_id: servicios.cargo_comida_especial.id, p_cantidad: 1, p_importe: 180, p_descripcion: "Pollo cocido con arroz (3 días)", p_perro_id: mochi.p.id, p_notas: null }), "comida especial");
}
const { data: adentro } = await S.from("estancias").select("id, perro_id").eq("negocio_id", NEG).eq("estado", "en_curso").eq("fecha_entrada", HOY);
for (const [i, e] of (adentro ?? []).slice(0, 4).entries()) {
  const p = PERROS.find((x) => x.id === e.perro_id);
  const nota = ["Ya jugó con la pelota y comió todo su desayuno.", "Tomó agua y está descansando en su cama.", "Hizo amistad con Toby; paseo corto en el patio.", "Se portó muy bien en el baño de la tarde."][i];
  let foto = null;
  if (i === 0) {
    foto = `${p.cliente.id}/${p.id}/bitacora/${HOY}-1.jpg`;
    exigir(await A.storage.from(BUCKET).upload(foto, fs.readFileSync(path.join(AQUI, "fotos", `${p.foto}.jpg`)), { contentType: "image/jpeg", upsert: true }), "foto bitácora");
  }
  exigir(await REC.from("bitacora_entradas").insert({ perro_id: p.id, estancia_id: e.id, fecha: HOY, tipo: "actualizacion", nota, foto_path: foto }), "bitácora");
}

// Reservas futuras: guardería de la próxima semana y citas de los siguientes días.
for (let n = 1; n <= 10; n++) {
  const fecha = dia(n);
  if (dow(fecha) === 0) continue;
  for (const p of G.filter(() => azar() < (dow(fecha) === 6 ? 0.25 : 0.45))) {
    if (HOTEL.some(([nom, a, b]) => nom === p.nombre && n >= a && n < b)) continue;
    const reserva = await reservaDe(p.cliente);
    const r = await REC.from("estancias").insert({ reserva_id: reserva, perro_id: p.id, servicio_id: servicios[p.nombre === "Kiwi" ? "guarderia_hora" : "guarderia_dia"].id, fecha_entrada: fecha, fecha_salida: dia(1, fecha), ...(p.nombre === "Kiwi" ? { horas: 4 } : {}) }).select("id").single();
    if (r.error) continue;
    if (p.bono) await REC.rpc("aplicar_bono_a_estancia", { p_estancia_id: r.data.id });
  }
  if (n <= 5) for (const c of agendaDelDia(fecha, 3)) await cita(c.p, c.quien, c.servicio, fecha, c.inicio);
}

for (const [nombre, entra, sale] of HOTEL.filter(([, a]) => a > 0)) {
  const p = perro(nombre);
  await estancia(await reservaDe(p.cliente), p, "hotel_noche", dia(entra), dia(sale));
}

// Reposición: la estética gastó lo de casi dos meses. Se compra lo que
// haga falta para que la existencia quede positiva, y bajo el mínimo solo
// en lo que debe salir con alerta.
const CON_ALERTA = ["Shampoo hipoalergénico", "Toallas desechables"];
for (const nombre of new Set(Object.values(D.RECETAS).flat().map(([n]) => n))) {
  const [, area, uCompra, uConsumo, minimo, compras] = D.INSUMOS.find((x) => x[0] === nombre);
  const eqConsumo = unidades[uConsumo].equivalencia_en_base;
  const eqCompra = unidades[uCompra].equivalencia_en_base;
  const { data: existencia } = await ADM.rpc("existencia_actual_insumo", { p_insumo_id: insumos[nombre] });
  const objetivo = minimo * eqConsumo * (CON_ALERTA.includes(nombre) ? 0.85 : 2.5);
  const falta = objetivo - Number(existencia ?? 0);
  if (falta <= 0) continue;
  // En media unidad de compra (medio galón), sin pasarse del objetivo en lo que lleva alerta.
  const medias = CON_ALERTA.includes(nombre) ? Math.floor((falta / eqCompra) * 2) : Math.ceil((falta / eqCompra) * 2);
  const cantidad = uCompra === "pieza" ? Math.round(falta) : medias / 2;
  if (cantidad > 0) await comprar(insumos[nombre], area === "estetica" ? proveedores[0] : proveedores[1], cantidad, compras[0][1], dia(-12), nombre);
}

// Vacunas vencidas (después de la historia; ver arriba).
for (const p of PERROS) await vacunas(p, true);

// ── Asistencia (últimas semanas) y la de hoy ──
const empleados = D.PERSONAL.filter((p) => p.horario);
for (const e of empleados) {
  const horario = D.HORARIOS[e.horario];
  const filas = [];
  for (let n = -HISTORIA - 5; n <= 0; n++) {
    const fecha = dia(n);
    const h = horario.find((x) => x.dia_semana === dow(fecha));
    if (!h || fecha < P[e.clave].ingreso) continue;
    if (e.clave === "cuidador" && n === -9) continue; // una falta
    const [he, me] = h.hora_entrada.split(":").map(Number);
    const tarde = azar() < 0.1 ? 12 + Math.floor(azar() * 20) : -Math.floor(azar() * 8);
    const entrada = inst(fecha, hhmm(he * 60 + me + tarde));
    const [hs, ms] = h.hora_salida.split(":").map(Number);
    const salidaMin = hs * 60 + ms + Math.floor(azar() * 10);
    if (n === 0 && he * 60 + me > AHORA_MIN) continue;
    const salida = n === 0 && salidaMin > AHORA_MIN ? null : inst(fecha, hhmm(salidaMin));
    const origen = P[e.clave].id ? "propio" : "recepcion";
    const quien = P[e.clave].id ?? P.recepcion.id;
    filas.push({ negocio_id: NEG, empleado_id: P[e.clave].empleado, fecha, entrada_at: entrada, salida_at: salida, entrada_origen: origen, entrada_capturada_por: quien, salida_origen: salida ? origen : null, salida_capturada_por: salida ? quien : null, corregida: false });
  }
  exigir(await S.from("asistencias").insert(filas), `asistencia ${e.nombre}`);
}

// ── Nómina: cada quincena terminada desde el mes anterior, pagada al día siguiente ──
const quincenas = [];
for (const mes of [meses(INICIO_MES, -1), INICIO_MES]) {
  quincenas.push([mes, `${mes.slice(0, 8)}15`], [`${mes.slice(0, 8)}16`, dia(-1, meses(mes, 1))]);
}
for (const [desde, hasta] of quincenas.filter(([, h]) => h < HOY)) {
  for (const e of empleados) {
    const r = await ADM.rpc("registrar_pago_nomina", { p_empleado_id: P[e.clave].empleado, p_desde: desde, p_hasta: hasta, p_metodo: "transferencia", p_fecha_pago: dia(1, hasta), p_notas: null });
    if (r.error) console.log(`  (nómina de ${e.nombre}, ${desde}: ${r.error.message})`);
  }
}
exigir(await ADM.rpc("registrar_adelanto", { p_empleado_id: P.limpieza.empleado, p_fecha: dia(-3), p_monto: 500, p_metodo: "efectivo", p_motivo: "Adelanto de quincena" }), "adelanto");
exigir(await ADM.rpc("ajustar_vacaciones", { p_empleado_id: P.cuidador.empleado, p_dias: 12, p_tipo: "asignacion", p_motivo: "Vacaciones del año" }), "vacaciones");
const aus = await ADM.rpc("solicitar_ausencia", { p_empleado_id: P.cuidador.empleado, p_tipo: "vacaciones", p_desde: dia(20), p_hasta: dia(24), p_motivo: "Viaje familiar" });
if (aus.error) console.log(`  (ausencia: ${aus.error.message})`);

// ── Gastos del mes y recurrentes ──
for (const mes of [meses(INICIO_MES, -1), INICIO_MES]) for (const [concepto, cat, monto, diaPago, metodo, cubre] of D.GASTOS) {
  const fechaPago = `${mes.slice(0, 8)}${String(diaPago).padStart(2, "0")}`;
  if (fechaPago > HOY) continue;
  // La luz se paga cada dos meses: en el mes anterior no hay recibo.
  if (cubre === "bimestre" && mes !== INICIO_MES) continue;
  const desde = cubre === "bimestre" ? meses(mes, -1) : cubre === "mes" ? mes : fechaPago;
  const hasta = cubre ? dia(-1, meses(mes, 1)) : fechaPago;
  exigir(await ADM.rpc("registrar_gasto", { p_concepto: concepto, p_categoria_id: categoriasGasto[cat].id, p_monto: monto, p_fecha_pago: fechaPago, p_metodo: metodo, p_proveedor_id: null, p_periodo_desde: desde, p_periodo_hasta: hasta, p_comprobante_path: null, p_notas: null }), `gasto ${concepto}`);
}
exigir(await ADM.from("gastos_recurrentes").insert({ concepto: "Renta del local", categoria_id: categoriasGasto.renta.id, monto_estimado: 18000, cada_meses: 1, dia: 2, cubre: "mes_del_pago", proxima_fecha: `${meses(INICIO_MES, 1).slice(0, 8)}02` }), "recurrente renta");
exigir(await ADM.from("gastos_recurrentes").insert({ concepto: "Recarga de gas", categoria_id: categoriasGasto.gas.id, monto_estimado: 1250, cada_meses: 1, dia: Number(dia(-3).slice(8, 10)), cubre: "mes_del_pago", proxima_fecha: dia(-3) }), "recurrente gas");
exigir(await ADM.rpc("gastos_por_atender"), "generar gastos esperados");

// ── Cuentas de solo lectura ──
const cuentasDemo = [...D.PERSONAL.filter((p) => P[p.clave].id).map((p) => P[p.clave].id), ...CLIENTES.filter((c) => c.cuenta).map((c) => c.cuenta)];
exigir(await S.from("membresias").update({ solo_lectura: true }).eq("negocio_id", NEG).in("profile_id", cuentasDemo), "solo lectura");

// ── Resumen ──
const conteo = async (tabla) => (await S.from(tabla).select("id", { count: "exact", head: true }).eq("negocio_id", NEG)).count;
const resumen = {};
for (const tabla of ["clientes", "perros", "estancias", "citas_estetica", "cobros", "turnos_caja", "bonos_clientes", "contratos", "insumos", "equipos", "empleados", "asistencias", "nomina_pagos", "gastos"]) resumen[tabla] = await conteo(tabla);
console.log(resumen);
console.log(`ingreso cobrado en la historia: $${RESERVAS_DIA.reduce((s, [, t]) => s + t, 0)}`);
console.log(`cuentas del demo (solo lectura): ${cuentasDemo.length} · dueña del portal: ${telefonoACorreo(D.CLIENTES.find((c) => c.portal).telefono)}`);
