#!/usr/bin/env node
// Despliegue a producción: migraciones primero, código después, y el
// push del código CONDICIONADO al éxito de la migración.
//
// Existe por un incidente real (Fase 11, 29 de agosto de 2026): el
// `db push` y el `git push` se encadenaron con ";" en vez de "&&". El
// db push falló con un LegacyDbConnectError transitorio y el git push
// salió de todos modos — quedó código nuevo empujado contra un esquema
// viejo. No pasó nada porque el build de Vercel tardó más que el
// reintento, pero fue suerte de tiempos, no diseño. Este script quita la
// suerte de la ecuación: si la migración no termina bien, el código no
// se empuja, punto.
//
// El otro motivo: en esa misma ocasión la documentación decía que
// producción estaba vacía y no lo estaba (14 clientes, 15 perros, el
// contrato real del negocio ya publicado). Por eso el primer paso
// SIEMPRE es leer el estado real de los datos contra la base, nunca
// contra los docs.
//
// Uso:
//   LUDOGTEKA_PROD_DB_URL="postgresql://..." node scripts/desplegar-produccion.mjs --revisar
//   LUDOGTEKA_PROD_DB_URL="postgresql://..." node scripts/desplegar-produccion.mjs --aplicar
//
// --revisar  no escribe nada: estado real de producción + qué
//            migraciones se aplicarían. Es el paso obligatorio previo.
// --aplicar  hace lo mismo y luego migra, verifica y despliega.
//
// La cadena de conexión NUNCA se guarda en el repo ni en .env.local
// (ver CLAUDE.md, sección Entornos): se pasa por variable de entorno en
// el momento de correrlo.

import { execFileSync } from "node:child_process";
import pg from "pg";

const PROY_PROD = "xdsxjhytggpsgrmfuuff";
const PROY_DEV = "sgfolltpvktbsiisfuzq";
const RAMA = "main";
const REINTENTOS_MIGRACION = 3;

const args = new Set(process.argv.slice(2));
const APLICAR = args.has("--aplicar");
const REVISAR = args.has("--revisar") || !APLICAR;

let paso = 0;

function titulo(texto) {
  paso += 1;
  console.log(`\n${"=".repeat(72)}\n${paso}. ${texto}\n${"=".repeat(72)}`);
}

function abortar(motivo, detalle) {
  console.error(`\n${"!".repeat(72)}`);
  console.error(`ABORTADO: ${motivo}`);
  if (detalle) console.error(String(detalle).trim());
  if (APLICAR) {
    console.error("\nEl código NO se empujó. Producción queda como estaba antes de este intento");
    console.error("salvo por las migraciones que alcanzaron a aplicarse (se listan arriba).");
  }
  console.error(`${"!".repeat(72)}\n`);
  process.exit(1);
}

function corre(cmd, argumentos, opciones = {}) {
  return execFileSync(cmd, argumentos, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
    ...opciones,
  });
}

function git(...argumentos) {
  return corre("git", argumentos).trim();
}

// La cadena trae la contraseña: nunca se imprime, ni siquiera al fallar.
function sinSecreto(texto) {
  return String(texto).replace(/postgresql:\/\/[^\s"']+/g, "postgresql://[oculto]");
}

const DB_URL = process.env.LUDOGTEKA_PROD_DB_URL;
if (!DB_URL) {
  abortar(
    "falta LUDOGTEKA_PROD_DB_URL",
    "Pásala en el momento de correr el script, nunca en un archivo del repo:\n" +
      '  LUDOGTEKA_PROD_DB_URL="postgresql://postgres.' + PROY_PROD +
      ':<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \\\n' +
      "    node scripts/desplegar-produccion.mjs --revisar"
  );
}
if (!DB_URL.includes(PROY_PROD)) {
  abortar(
    "LUDOGTEKA_PROD_DB_URL no apunta a producción",
    DB_URL.includes(PROY_DEV)
      ? `Esa cadena es la de DESARROLLO (${PROY_DEV}). Este script es solo para producción.`
      : `Se esperaba una cadena del proyecto ${PROY_PROD}.`
  );
}

async function consulta(sql) {
  const cliente = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await cliente.connect();
  try {
    return (await cliente.query(sql)).rows;
  } finally {
    await cliente.end();
  }
}

// ---------------------------------------------------------------- 1
titulo("Estado del repositorio");

const rama = git("rev-parse", "--abbrev-ref", "HEAD");
console.log(`   rama:   ${rama}`);
if (rama !== RAMA) {
  abortar(`estás en '${rama}', no en '${RAMA}'`, "Producción se despliega desde main.");
}

const sucio = git("status", "--porcelain");
if (sucio) {
  abortar(
    "hay cambios sin commitear",
    "Commitea o guarda todo antes de desplegar — si no, lo que se despliega\n" +
      "no es lo que tienes enfrente:\n" + sucio
  );
}

git("fetch", "origin", RAMA);
const local = git("rev-parse", "HEAD");
const remoto = git("rev-parse", `origin/${RAMA}`);
const pendientes = git("log", "--oneline", `origin/${RAMA}..HEAD`);
console.log(`   local:  ${local.slice(0, 7)}`);
console.log(`   origin: ${remoto.slice(0, 7)}`);
if (pendientes) {
  console.log("   commits por desplegar:");
  pendientes.split("\n").forEach((l) => console.log(`     ${l}`));
} else {
  console.log("   commits por desplegar: ninguno");
}

const detras = git("log", "--oneline", `HEAD..origin/${RAMA}`);
if (detras) {
  abortar(
    "tu rama está detrás de origin/main",
    "Haz pull y vuelve a intentar; si no, el push va a ser rechazado o vas a\n" +
      "pisar trabajo de alguien más:\n" + detras
  );
}

// ---------------------------------------------------------------- 2
// PASO OBLIGATORIO: el estado real sale de la base, no de los docs.
titulo("Estado REAL de los datos en producción (no lo que digan los docs)");

const TABLAS_NEGOCIO = [
  "clientes", "perros", "reservas", "estancias", "citas_estetica",
  "contratos", "plantillas_contrato", "tipos_contrato", "cobros",
  "turnos_caja", "insumos", "movimientos_inventario", "bitacora_entradas",
  "profiles",
];

let hayDatos = false;
try {
  const existentes = await consulta(
    `select table_name from information_schema.tables
     where table_schema = 'public'
       and table_name in (${TABLAS_NEGOCIO.map((t) => `'${t}'`).join(",")})`
  );
  const nombres = new Set(existentes.map((r) => r.table_name));
  const conteos = await consulta(
    TABLAS_NEGOCIO.filter((t) => nombres.has(t))
      .map((t) => `select '${t}' as tabla, count(*)::int as filas from public.${t}`)
      .join(" union all ") + " order by tabla"
  );
  for (const c of conteos) {
    const marca = c.filas > 0 ? " <- CON DATOS" : "";
    if (c.filas > 0 && c.tabla !== "profiles") hayDatos = true;
    console.log(`   ${(c.tabla + ":").padEnd(24)} ${String(c.filas).padStart(6)}${marca}`);
  }
  for (const t of TABLAS_NEGOCIO.filter((t) => !nombres.has(t))) {
    console.log(`   ${(t + ":").padEnd(24)} ${"(no existe)".padStart(6)}`);
  }
} catch (e) {
  abortar("no se pudo leer el estado de producción", sinSecreto(e.message));
}

console.log(
  hayDatos
    ? "\n   Producción TIENE datos de negocio reales. Cualquier migración con backfill\n" +
      "   va a correr de verdad sobre ellos: revisa arriba que el conteo cuadre con\n" +
      "   lo que esperabas ANTES de seguir."
    : "\n   Producción no tiene datos de negocio todavía."
);

// ---------------------------------------------------------------- 3
titulo("Migraciones pendientes");

let salidaSeco;
try {
  salidaSeco = corre("npx", ["supabase", "db", "push", "--dry-run", "--db-url", DB_URL], {
    shell: process.platform === "win32",
  });
} catch (e) {
  abortar("el dry-run de las migraciones falló", sinSecreto(e.stdout || e.stderr || e.message));
}
console.log(sinSecreto(salidaSeco).trim());

const pendientesMigracion = [...salidaSeco.matchAll(/(\d{14}_[\w-]+\.sql)/g)].map((m) => m[1]);
const migracionesUnicas = [...new Set(pendientesMigracion)];

if (migracionesUnicas.length === 0 && !pendientes) {
  console.log("\nNada que migrar y nada que desplegar. Listo.");
  process.exit(0);
}

if (REVISAR && !APLICAR) {
  console.log(
    `\n${"-".repeat(72)}\n` +
      `Revisión terminada. No se tocó nada.\n` +
      `Migraciones que se aplicarían: ${migracionesUnicas.length}\n` +
      `Commits que se desplegarían:   ${pendientes ? pendientes.split("\n").length : 0}\n` +
      `Para hacerlo de verdad, el mismo comando con --aplicar.\n${"-".repeat(72)}`
  );
  process.exit(0);
}

// ---------------------------------------------------------------- 4
titulo("Aplicando migraciones a producción");

// El CLI no siempre dice lo mismo al terminar bien: "Finished supabase db
// push" cuando aplicó algo, "Remote database is up to date" cuando no
// había nada. Y al fallar por conexión devolvió un JSON con _tag Error
// SIN código de salida distinto de cero — por eso no basta con el exit
// code ni con una sola frase.
function migracionOk(salida) {
  if (/"_tag"\s*:\s*"Error"|LegacyDbConnectError|Failed to connect/.test(salida)) return false;
  return (
    salida.includes("Finished supabase db push") ||
    salida.includes("Remote database is up to date") ||
    /"upToDate"\s*:\s*true/.test(salida)
  );
}

let migrado = migracionesUnicas.length === 0;
if (migrado) {
  console.log("   No hay migraciones pendientes: no se toca el esquema.");
}
for (let intento = 1; intento <= REINTENTOS_MIGRACION && !migrado; intento += 1) {
  console.log(`   intento ${intento} de ${REINTENTOS_MIGRACION}…`);
  try {
    const salida = corre("npx", ["supabase", "db", "push", "--db-url", DB_URL], {
      shell: process.platform === "win32",
    });
    console.log(sinSecreto(salida).trim());
    migrado = migracionOk(salida);
    if (!migrado) {
      console.log("   terminó sin confirmar el push; se reintenta.");
    }
  } catch (e) {
    const detalle = sinSecreto(e.stdout || e.stderr || e.message);
    console.log(`   falló: ${detalle.split("\n").slice(-2).join(" ").trim()}`);
    // El fallo de conexión del pooler es transitorio y fue justo el que
    // provocó el incidente: se reintenta antes de rendirse.
    if (intento === REINTENTOS_MIGRACION) {
      abortar("las migraciones no se pudieron aplicar", detalle);
    }
  }
}
if (!migrado) abortar("las migraciones no se pudieron aplicar");

// ---------------------------------------------------------------- 5
titulo("Verificando que la base quedó como se esperaba");

try {
  const aplicadas = await consulta(
    `select version from supabase_migrations.schema_migrations
     order by version desc limit ${Math.max(migracionesUnicas.length, 1)}`
  );
  const registradas = new Set(aplicadas.map((r) => r.version));
  const faltantes = migracionesUnicas.filter((m) => !registradas.has(m.slice(0, 14)));
  if (migracionesUnicas.length === 0) {
    console.log(`   Sin migraciones en este despliegue. Última registrada: ${aplicadas[0]?.version ?? "?"}`);
  }
  migracionesUnicas.forEach((m) =>
    console.log(`   ${registradas.has(m.slice(0, 14)) ? "OK   " : "FALTA"} ${m}`)
  );
  if (faltantes.length) {
    abortar(
      "hay migraciones que no quedaron registradas en la base",
      `Sin registrar: ${faltantes.join(", ")}\n` +
        "El código NO se empujó: producción se quedaría con esquema a medias."
    );
  }
} catch (e) {
  abortar("no se pudo verificar el historial de migraciones", sinSecreto(e.message));
}

// ---------------------------------------------------------------- 6
titulo("Desplegando el código");

if (!pendientes) {
  console.log("   No hay commits nuevos: la migración ya quedó y no hay nada que empujar.");
  process.exit(0);
}

let antesDeploy = "";
try {
  antesDeploy = corre("npx", ["vercel", "ls", "ludogteka", "--prod"], {
    shell: process.platform === "win32",
  });
} catch {
  console.log("   (no se pudo leer el estado previo de Vercel; se sigue de todos modos)");
}
const deployPrevio = (antesDeploy.match(/https:\/\/[a-z0-9-]+\.vercel\.app/) || [""])[0];

try {
  console.log(corre("git", ["push", "origin", RAMA]).trim() || "   push enviado.");
} catch (e) {
  abortar(
    "el push del código falló DESPUÉS de migrar",
    sinSecreto(e.stdout || e.stderr || e.message) +
      "\n\nProducción quedó con el esquema nuevo y el código viejo. Resuelve el push\n" +
      "cuanto antes: es la ventana que este script existe para evitar."
  );
}

// ---------------------------------------------------------------- 7
titulo("Esperando el build de Vercel");

const limite = Date.now() + 6 * 60 * 1000;
let listo = false;
while (Date.now() < limite && !listo) {
  await new Promise((r) => setTimeout(r, 15000));
  let salida = "";
  try {
    salida = corre("npx", ["vercel", "ls", "ludogteka", "--prod"], {
      shell: process.platform === "win32",
    });
  } catch {
    continue;
  }
  const linea = salida.split("\n").find((l) => l.includes(".vercel.app"));
  if (!linea) continue;
  const url = (linea.match(/https:\/\/[a-z0-9-]+\.vercel\.app/) || [""])[0];
  const estado = linea.includes("Ready")
    ? "Ready"
    : linea.includes("Error")
      ? "Error"
      : "Building";
  console.log(`   ${url}  ${estado}`);
  if (url && url !== deployPrevio) {
    if (estado === "Ready") listo = true;
    if (estado === "Error") abortar("el build de Vercel falló", `Revisa: ${url}`);
  }
}

if (!listo) {
  console.log("\n   El build no quedó Ready dentro del tiempo de espera. Revísalo en Vercel:");
  console.log("   npx vercel ls ludogteka --prod");
  process.exit(1);
}

console.log(`\n${"=".repeat(72)}`);
console.log("Producción actualizada: esquema migrado, verificado, y código desplegado.");
console.log(`${"=".repeat(72)}\n`);
