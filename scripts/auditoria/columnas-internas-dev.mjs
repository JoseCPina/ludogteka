// Columnas de uso interno que el dueño NO debe poder leer (SOLO DESARROLLO,
// en Huellitas; nunca Ludogteka). Migración 20261019000000.
//
//   node scripts/auditoria/columnas-internas-dev.mjs            (revisa)
//   node scripts/auditoria/columnas-internas-dev.mjs --escribir (regenera la lista de columnas permitidas)
//
// La RLS de fila deja al dueño leer la fila ENTERA de su cliente, sus perros y
// sus contratos: lo interno (notas del personal, notas clínicas, evaluación,
// motivos de contrato) vive en tablas propias que solo lee el personal. Con el
// JWT REAL de un dueño y con la llave anónima se intenta de todas las maneras:
//
//   1. Las columnas viejas ya no existen (select directo y select=*).
//   2. Las tablas internas devuelven vacío (select directo y como embed).
//   3. Un texto-marca puesto en cada nota interna NO aparece en NINGUNA tabla
//      ni vista de `public` leída con la sesión del dueño, ni en sus funciones
//      (mis_*), ni en el portal.
//   4. Las funciones que escriben o leen lo interno rechazan al dueño.
//   5. Lista cerrada: las columnas que el dueño ve de cada tabla son las de
//      `lib/columnas-dueno.json`; una columna NUEVA en esas tablas falla hasta
//      que alguien la clasifique (visible a propósito o interna).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clienteApi, DEV } from "../nube/migraciones-api.mjs";
import { B, SB, datos, rpc, get, post, patch, borrar, personas, fijarModulo, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVO_LISTA = path.join(AQUI, "lib", "columnas-dueno.json");
const ESCRIBIR = process.argv.includes("--escribir");
const MARCA = `SECRETO-${String(Date.now()).slice(-7)}`;

// Lo que ya NO debe existir como columna de las tablas que lee el dueño.
const COLUMNAS_QUE_NO_EXISTEN = [
  ["clientes", "notas"],
  ["perros", "notas_clinicas"],
  ["perros", "evaluacion_comportamiento_notas"],
  ["perros", "evaluacion_comportamiento_por"],
  ["contratos", "regenerar_motivo"],
  ["contratos", "regenerar_marcado_at"],
  ["contratos", "motivo_cancelacion"],
];
// Las tablas internas: el dueño las lee VACÍAS.
const TABLAS_INTERNAS = ["clientes_notas_internas", "perros_notas_clinicas", "perros_evaluaciones", "contratos_internos"];
const RPC_SOLO_PERSONAL = [
  ["cliente_notas_guardar", (c) => ({ p_cliente: c.cliente, p_notas: MARCA })],
  ["perro_notas_clinicas_guardar", (c) => ({ p_perro: c.perro, p_notas: MARCA })],
  ["marcar_evaluacion_comportamiento", (c) => ({ p_perro_id: c.perro, p_fecha: "2020-01-01", p_notas: MARCA })],
  ["quitar_evaluacion_comportamiento", (c) => ({ p_perro_id: c.perro })],
  ["cancelar_contrato", (c) => ({ p_contrato_id: c.contrato ?? "00000000-0000-0000-0000-000000000000", p_motivo: MARCA })],
  ["regenerar_contrato", (c) => ({ p_contrato_id: c.contrato ?? "00000000-0000-0000-0000-000000000000" })],
];

const api = await clienteApi(DEV);
const P = await personas();
const ctx = { cliente: datos.clienteSoloB, perro: null, contrato: null };

try {
  // ── Preparar: un perro del dueño con una marca en cada nota interna ──
  const perro = await SB.from("perros").insert({ negocio_id: B, cliente_id: ctx.cliente, nombre: `Interno ${MARCA.slice(-5)}` }).select("id").single();
  if (perro.error) throw new Error(`perro: ${perro.error.message}`);
  ctx.perro = perro.data.id;

  // El módulo de veterinaria (notas clínicas) puede estar apagado en Huellitas: se prende solo para sembrar.
  await fijarModulo("veterinaria", true);

  const sembrar = [
    ["cliente_notas_guardar", { p_cliente: ctx.cliente, p_notas: `nota interna ${MARCA}` }],
    ["perro_notas_clinicas_guardar", { p_perro: ctx.perro, p_notas: `nota clínica ${MARCA}` }],
    ["marcar_evaluacion_comportamiento", { p_perro_id: ctx.perro, p_fecha: "2026-01-02", p_notas: `evaluación ${MARCA}` }],
  ];
  for (const [fn, args] of sembrar) {
    const r = await rpc(P.admin, fn, args);
    comprobar(r.ok, `el admin siembra la nota interna con ${fn} (${r.mensaje ?? ""})`);
  }
  // Un contrato del dueño con motivos internos (si se puede armar uno).
  const plantilla = await SB.from("plantillas_contrato").select("id").eq("negocio_id", B).limit(1).maybeSingle();
  if (plantilla.data) {
    const c = await SB.from("contratos").insert({ negocio_id: B, perro_id: ctx.perro, cliente_id: ctx.cliente, plantilla_id: plantilla.data.id }).select("id").single();
    if (!c.error) {
      ctx.contrato = c.data.id;
      await SB.from("contratos_internos").insert({ negocio_id: B, contrato_id: ctx.contrato, regenerar_motivo: `regenerar ${MARCA}`, motivo_cancelacion: `cancelación ${MARCA}` });
    }
  }
  comprobar(Boolean(ctx.contrato), "hay un contrato del dueño con motivos internos para probar");
  // Una nota del personal en un peso.
  await SB.from("pesos_registrados").insert({ negocio_id: B, perro_id: ctx.perro, peso_kg: 7.5, fecha: "2026-01-02", notas: `peso ${MARCA}` });

  // Lo que el personal SÍ ve (si no, la prueba no probaría nada).
  const staff = await get(P.admin, `clientes_notas_internas?cliente_id=eq.${ctx.cliente}&select=notas`);
  comprobar(staff.ok && staff.cuerpo?.[0]?.notas?.includes(MARCA), "el personal sí lee la nota interna del cliente");
  const staffClin = await get(P.admin, `perros_notas_clinicas?perro_id=eq.${ctx.perro}&select=notas`);
  comprobar(staffClin.ok && staffClin.cuerpo?.[0]?.notas?.includes(MARCA), "el personal con permiso sí lee la nota clínica");
  const sinPermiso = await get(P.estetica, `perros_notas_clinicas?perro_id=eq.${ctx.perro}&select=notas`);
  comprobar(sinPermiso.ok && sinPermiso.cuerpo.length === 0, "estética (sin permiso clínico) no lee la nota clínica");

  const SESIONES = [["dueño", P.cliente], ["anónimo", null]];

  // ── 1. Las columnas viejas ya no existen ──
  seccion("1. Las columnas internas ya no están en tablas que el dueño lee");
  for (const [quien, token] of SESIONES) {
    for (const [tabla, col] of COLUMNAS_QUE_NO_EXISTEN) {
      const directo = await get(token, `${tabla}?select=${col}&limit=1`);
      comprobar(!directo.ok, `${quien}: ${tabla}.${col} ya no se puede pedir (${directo.status})`);
    }
  }
  const dueno = P.cliente;
  for (const tabla of ["clientes", "perros", "contratos"]) {
    const todo = await get(dueno, `${tabla}?select=*&limit=50`);
    const claves = new Set((Array.isArray(todo.cuerpo) ? todo.cuerpo : []).flatMap((f) => Object.keys(f)));
    const mal = COLUMNAS_QUE_NO_EXISTEN.filter(([t, c]) => t === tabla && claves.has(c));
    comprobar(todo.ok && mal.length === 0, `dueño: ${tabla}?select=* no trae columnas internas (${claves.size} columnas)`);
  }

  // ── 2. Las tablas internas, vacías para el dueño (directo y por embed) ──
  seccion("2. Las tablas internas están cerradas al dueño");
  for (const [quien, token] of SESIONES) {
    for (const t of TABLAS_INTERNAS) {
      const r = await get(token, `${t}?select=*&limit=50`);
      comprobar(!r.ok || (Array.isArray(r.cuerpo) && r.cuerpo.length === 0), `${quien}: ${t} sin filas (${r.status})`);
    }
  }
  // Datos comerciales del negocio y catálogos clínicos de la plataforma: solo personal.
  for (const t of ["negocios", "principios_activos", "vet_diagnosticos"]) {
    const d = await get(dueno, `${t}?select=*&limit=5`);
    comprobar(d.ok && Array.isArray(d.cuerpo) && d.cuerpo.length === 0, `dueño: ${t} sin filas (el plan, la cortesía y el tope de Maps no son de un dueño)`);
    const p = await get(P.admin, `${t}?select=*&limit=1`);
    comprobar(p.ok && Array.isArray(p.cuerpo) && p.cuerpo.length === 1, `el personal sí lee ${t}`);
  }
  const embeds = [
    `clientes?select=id,clientes_notas_internas(notas)&id=eq.${ctx.cliente}`,
    `perros?select=id,perros_notas_clinicas(notas),perros_evaluaciones(notas,por)&id=eq.${ctx.perro}`,
    `contratos?select=id,contratos_internos(*)&perro_id=eq.${ctx.perro}`,
    `perros?select=*,clientes(*),perros_notas_clinicas(*)&id=eq.${ctx.perro}`,
  ];
  for (const e of embeds) {
    const r = await get(dueno, e);
    comprobar(!JSON.stringify(r.cuerpo).includes(MARCA), `dueño: embed sin la marca (${e.split("?")[0]})`);
  }

  // ── 3. La marca no aparece por NINGUNA vía de lectura ──
  seccion("3. La marca no sale en ninguna tabla, vista ni función");
  const relaciones = await api.sql(`select c.relname::text as n, c.relkind::text as k from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m') order by 1`);
  let filasVistas = 0;
  const fugas = [];
  for (const [quien, token] of SESIONES) {
    for (const rel of relaciones) {
      const r = await get(token, `${rel.n}?select=*&limit=200`);
      if (r.ok && Array.isArray(r.cuerpo)) {
        filasVistas += r.cuerpo.length;
        if (JSON.stringify(r.cuerpo).includes(MARCA)) fugas.push(`${quien}:${rel.n}`);
      }
    }
  }
  comprobar(fugas.length === 0, `${relaciones.length} tablas y vistas leídas como dueño y como anónimo (${filasVistas} filas): la marca no sale${fugas.length ? " — FUGA en " + fugas.join(", ") : ""}`);
  const funciones = [
    ["mi_carnet", { p_perro_id: ctx.perro }], ["mi_expediente", { p_perro: ctx.perro }], ["mis_recetas", { p_perro: ctx.perro }],
    ["mis_visitas", {}], ["mis_negocios", {}], ["mis_modulos", {}], ["mis_facturas", {}], ["mis_tickets_con_respuesta", {}],
  ];
  const fugasFn = [];
  for (const [fn, args] of funciones) {
    const r = await rpc(dueno, fn, args);
    if (JSON.stringify(r.cuerpo).includes(MARCA)) fugasFn.push(fn);
  }
  comprobar(fugasFn.length === 0, `las funciones mis_* del dueño no sacan la marca${fugasFn.length ? " — FUGA en " + fugasFn.join(", ") : ""}`);

  // ── 4. Las funciones internas rechazan al dueño (y a la llave anónima) ──
  seccion("4. Las funciones que tocan lo interno rechazan al dueño");
  for (const [quien, token] of SESIONES) {
    for (const [fn, args] of RPC_SOLO_PERSONAL) {
      const r = await rpc(token, fn, args(ctx));
      comprobar(!r.ok, `${quien}: ${fn} rechazado (${r.status})`);
    }
  }
  const escritura = await post(dueno, "clientes_notas_internas", { cliente_id: ctx.cliente, notas: "x" });
  comprobar(!escritura.ok, "dueño: tampoco inserta directo en clientes_notas_internas");
  const pisar = await patch(dueno, `clientes?id=eq.${ctx.cliente}`, { notas: "x" });
  comprobar(!pisar.ok, "dueño: no puede escribir clientes.notas (la columna ya no existe)");
  const borrarNota = await borrar(dueno, `perros_evaluaciones?perro_id=eq.${ctx.perro}`);
  comprobar(!borrarNota.ok || (Array.isArray(borrarNota.cuerpo) && borrarNota.cuerpo.length === 0), "dueño: no borra la evaluación interna");
  const sigue = await SB.from("perros_evaluaciones").select("notas").eq("perro_id", ctx.perro).maybeSingle();
  comprobar(Boolean(sigue.data?.notas?.includes(MARCA)), "la evaluación interna sigue intacta");

  // ── 5. Lista cerrada de columnas visibles para el dueño ──
  seccion("5. Lista cerrada de columnas que el dueño ve");
  const conPolitica = await api.sql(`
    select distinct tablename::text as n from pg_policies
    where schemaname='public' and cmd in ('SELECT','ALL') and permissive='PERMISSIVE'
      and roles::text like '%authenticated%'
      and (qual ilike '%mi_cliente_id%' or policyname ilike '%propio%')
    order by 1`);
  // También las que de hecho devolvieron filas al dueño.
  const conFilas = new Set();
  for (const rel of relaciones) {
    const r = await get(dueno, `${rel.n}?select=*&limit=1`);
    if (r.ok && Array.isArray(r.cuerpo) && r.cuerpo.length) conFilas.add(rel.n);
  }
  const tablas = [...new Set([...conPolitica.map((x) => x.n), ...conFilas])].sort();
  const cols = await api.sql(`select table_name::text as t, column_name::text as c from information_schema.columns where table_schema='public' order by 1, ordinal_position`);
  const actuales = {};
  for (const t of tablas) actuales[t] = cols.filter((x) => x.t === t).map((x) => x.c);
  if (ESCRIBIR) {
    fs.mkdirSync(path.dirname(ARCHIVO_LISTA), { recursive: true });
    fs.writeFileSync(ARCHIVO_LISTA, JSON.stringify(actuales, null, 1) + "\n");
    console.log(`  · lista escrita: ${ARCHIVO_LISTA} (${tablas.length} tablas)`);
  } else {
    const permitidas = JSON.parse(fs.readFileSync(ARCHIVO_LISTA, "utf8"));
    for (const t of tablas) {
      const nuevas = actuales[t].filter((c) => !(permitidas[t] ?? []).includes(c));
      comprobar(nuevas.length === 0, `${t}: sin columnas nuevas sin clasificar${nuevas.length ? " — " + nuevas.join(", ") + " (¿es interna? muévela a una tabla de personal; si el dueño debe verla, regenera con --escribir)" : ""}`);
    }
    const prohibidas = COLUMNAS_QUE_NO_EXISTEN.filter(([t, c]) => (actuales[t] ?? []).includes(c));
    comprobar(prohibidas.length === 0, "ninguna columna prohibida volvió a una tabla del dueño");
  }
} finally {
  // Limpieza de lo que se sembró (se hace con la llave de servidor).
  if (ctx.contrato) {
    await SB.from("contratos_internos").delete().eq("contrato_id", ctx.contrato);
    await SB.from("contratos").delete().eq("id", ctx.contrato);
  }
  if (ctx.perro) {
    await SB.from("pesos_registrados").delete().eq("perro_id", ctx.perro);
    await SB.from("perros_notas_clinicas").delete().eq("perro_id", ctx.perro);
    await SB.from("perros_evaluaciones").delete().eq("perro_id", ctx.perro);
    await SB.from("perros").delete().eq("id", ctx.perro);
  }
  await SB.from("clientes_notas_internas").delete().eq("cliente_id", ctx.cliente).like("notas", `%${MARCA}%`);
}
terminar();
