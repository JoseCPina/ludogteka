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
//   npm run desplegar -- --revisar
//   npm run desplegar -- --aplicar
//
// --revisar  no escribe nada: estado real de producción + qué
//            migraciones se aplicarían. Es el paso obligatorio previo.
// --aplicar  hace lo mismo y luego migra, verifica y despliega.
//
// La cadena de conexión NUNCA va en el repo ni en .env.local (ver
// CLAUDE.md, sección Entornos): se lee de C:/proyectos/.ludogteka-prod-db,
// fuera del repo y permanente, o de LUDOGTEKA_PROD_DB_URL si viene puesta.
//
// En la nube (Claude Code en claude.ai/code, CLAUDE_CODE_REMOTE=true), desde
// el 28 de septiembre de 2026 (autorizado por el dueño), el mismo despliegue
// corre sin la computadora del dueño. El proxy de la sesión solo deja pasar
// HTTPS, así que:
//   - la base se lee y se migra con la API de gestión de Supabase
//     (scripts/nube/migraciones-api.mjs: el mismo motor probado en
//     desarrollo, mismo formato que el CLI, una transacción por migración
//     con su registro, se detiene al primer error);
//   - ANTES de migrar exige un respaldo físico completo de menos de 26 h
//     (la API de gestión no deja crear uno al momento) y guarda una copia en
//     JSON de todas las tablas de public; cuenta filas antes y después y
//     corre auditoria_frontera() al final (si no sale vacía, no se publica);
//   - el código se publica fusionando la rama de la sesión a main por la
//     API REST de GitHub (el GraphQL, que usa gh pr, lo niega el proxy), con
//     el PR y su "se puede fusionar" comprobados ANTES de migrar y la fusión
//     fijada al commit que se revisó.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { PROD as PROD_API, aplicarPendientes, auditoriaFrontera, clienteApi, estadoMigraciones } from "./nube/migraciones-api.mjs";

const PROY_PROD = "xdsxjhytggpsgrmfuuff";
const PROY_DEV = "sgfolltpvktbsiisfuzq";
const RAMA = "main";
const REINTENTOS_MIGRACION = 3;
const EN_NUBE = process.env.CLAUDE_CODE_REMOTE === "true";
// Fuera de la nube (la computadora del dueño, desde el 22 de octubre de 2026 la única
// instancia): si no vienen en el entorno, se toman de las sesiones de los CLI ya
// autenticados (`gh auth token` y el auth.json del CLI de Vercel). Nunca se imprimen.
function tokenDeGh() {
  if (EN_NUBE) return "";
  const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 });
  return r.status === 0 ? (r.stdout || "").trim() : "";
}
function tokenDeVercel() {
  if (EN_NUBE || !process.env.APPDATA) return "";
  for (const p of [["com.vercel.cli", "Data", "auth.json"], ["xdg.data", "com.vercel.cli", "auth.json"]]) {
    try {
      const t = JSON.parse(readFileSync(path.join(process.env.APPDATA, ...p), "utf8")).token;
      if (t) return t;
    } catch {}
  }
  return "";
}
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || tokenDeVercel();
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || tokenDeGh();
const HORAS_MAX_RESPALDO = 26;

// En la nube, la salida a internet va por el proxy de la sesión, y la
// credencial de GitHub solo es válida pasando por él. El fetch de Node no lee
// HTTPS_PROXY salvo con NODE_USE_ENV_PROXY=1 (Node >= 22.21): se relanza así.
if (EN_NUBE && process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== "1") {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}

const args = new Set(process.argv.slice(2));
const APLICAR = args.has("--aplicar");
const REVISAR = args.has("--revisar") || !APLICAR;
// Como el --include-all del CLI: aplica también pendientes más viejas que la última aplicada
// (una migración de otro carril que entró a main después de otra más nueva).
const INCLUIR_TODAS = args.has("--incluir-todas");

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

// Se juntan stdout y stderr a propósito: `vercel ls` manda la tabla con
// la columna de estado por stderr y solo las URLs peladas por stdout, así
// que leer nada más stdout hacía que un deploy "Ready" se viera eterno en
// "Building". Git también reporta progreso por stderr.
function corre(cmd, argumentos, opciones = {}) {
  // npx en Windows es un .cmd y spawnSync sin shell lo rechaza (EINVAL),
  // así que ahí sí hace falta shell. Por eso el CLI de Supabase —el único
  // que recibe la contraseña— NO va por npx: ver supabase() abajo.
  const necesitaShell = cmd.startsWith("npx") && process.platform === "win32";
  const r = spawnSync(cmd, argumentos, {
    shell: necesitaShell,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    // stdin cerrado y tope de tiempo: sin esto, un comando que decide
    // preguntar algo se queda esperando una respuesta que nunca llega y
    // cuelga el despliegue entero. Pasó de verdad: npx bajó una versión
    // nueva del CLI de Vercel que había perdido la sesión y abrió un
    // login por dispositivo — el script se quedó diez minutos mirando un
    // código de verificación que nadie iba a teclear. Con stdin cerrado
    // el mismo comando falla en un segundo y se puede manejar.
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000,
    ...opciones,
  });
  const salida = (r.stdout || "") + (r.stderr || "");
  if (r.error) throw Object.assign(r.error, { salida });
  if (r.status !== 0) {
    throw Object.assign(new Error(`${cmd} salió con código ${r.status}`), { salida });
  }
  return salida;
}

function git(...argumentos) {
  return corre("git", argumentos).trim();
}

// El CLI de Supabase es dependencia local (node_modules/supabase) y su
// entrada es JavaScript plano: se corre con el mismo node, sin shell de
// por medio. Es el único comando que recibe la cadena de conexión con la
// contraseña, y así viaja como argumento directo del proceso — nunca por
// la línea de comandos de cmd.exe, donde ni se escapa ni se puede evitar
// que quede a la vista de la lista de procesos.
const CLI_SUPABASE = new URL("../node_modules/supabase/dist/supabase.js", import.meta.url)
  .pathname.replace(/^\/([A-Za-z]:)/, "$1");

function supabase(...argumentos) {
  return corre(process.execPath, [CLI_SUPABASE, ...argumentos]);
}

// `vercel ls` escupe las URLs peladas por stdout y la tabla con la
// columna de estado por stderr. El renglón bueno es el que trae las dos
// cosas; quedarse con la primera línea que tenga una URL daba siempre
// "Building", aunque el deploy llevara rato Ready.
//
// Si esto empieza a decir que la sesión caducó y a pedir login por
// dispositivo, revisa PRIMERO dónde guarda la credencial la versión del
// CLI que bajó npx, antes de gastar un login: la 58 la dejaba en
// "%APPDATA%/xdg.data/com.vercel.cli/auth.json" y la 59 la busca en
// "%APPDATA%/com.vercel.cli/Data/auth.json". Cuando npx saltó de una a
// otra, el CLI se declaró deslogueado teniendo la credencial completa
// (con su refreshToken, que se renueva solo) una carpeta más allá;
// copiar el auth.json a la carpeta nueva lo dejó como estaba. El
// currentTeam vive en el config.json de al lado y también hay que
// llevárselo, o `vercel ls ludogteka` busca el proyecto en la cuenta
// personal en vez de en el equipo.
function ultimoDeploy() {
  // Comando completo en una sola cadena: con shell y arreglo de
  // argumentos, node avisa (DEP0190) que los concatena sin escapar. Aquí
  // no hay ningún secreto que escapar, pero el aviso ensucia la salida
  // del despliegue justo cuando uno la está leyendo.
  // 45 segundos, no los 180 de default: un listado de deploys responde en
  // segundos o no va a responder. Cerrar stdin no basta para el login por
  // dispositivo de Vercel — ese no lee del teclado, imprime un código y se
  // queda esperando en el navegador — así que aquí el tope de tiempo es lo
  // único que corta.
  // Con VERCEL_TOKEN (la nube) el token va como argumento directo, sin
  // shell: así no queda en ningún mensaje de error ni en una línea de cmd.
  const salida = VERCEL_TOKEN && process.platform !== "win32"
    ? corre("npx", ["--yes", "vercel", "ls", "ludogteka", "--prod", "--token", VERCEL_TOKEN], { timeout: 45000 })
    : corre("npx vercel ls ludogteka --prod", [], { timeout: 45000 });
  const renglon = salida
    .split("\n")
    .find((l) => /vercel\.app/.test(l) && /(Ready|Building|Queued|Error|Canceled)/.test(l));
  if (!renglon) return { url: "", estado: "" };
  return {
    url: (renglon.match(/https:\/\/[a-z0-9-]+\.vercel\.app/) || [""])[0],
    estado: (renglon.match(/(Ready|Building|Queued|Error|Canceled)/) || [""])[0],
  };
}

// La cadena trae la contraseña: nunca se imprime, ni siquiera al fallar.
function sinSecreto(texto) {
  let limpio = String(texto).replace(/postgresql:\/\/[^\s"']+/g, "postgresql://[oculto]");
  for (const s of [VERCEL_TOKEN, GH_TOKEN, process.env.SUPABASE_ACCESS_TOKEN]) if (s) limpio = limpio.split(s).join("[oculto]");
  return limpio;
}

// La cadena de conexión vive en un archivo FUERA del repo, permanente
// (decisión del 21 de septiembre de 2026, ver CLAUDE.md > Entornos): el
// despliegue lo corre el agente sin pedir nada, y para eso la cadena
// tiene que estar en la máquina. La variable de entorno sigue mandando
// si viene puesta, por si algún día hay que apuntar a otro lado.
const ARCHIVO_DB_URL = "C:/proyectos/.ludogteka-prod-db";
function leerDbUrl() {
  if (process.env.LUDOGTEKA_PROD_DB_URL) return process.env.LUDOGTEKA_PROD_DB_URL;
  try {
    return readFileSync(ARCHIVO_DB_URL, "utf8").trim();
  } catch {
    return "";
  }
}

// En la nube no hace falta: la base va por la API de gestión.
const DB_URL = EN_NUBE ? "" : leerDbUrl();
if (!EN_NUBE && !DB_URL) {
  abortar(
    `falta la cadena de producción: ni LUDOGTEKA_PROD_DB_URL ni ${ARCHIVO_DB_URL}`,
    "El archivo lleva una sola línea, la cadena completa, y NO se borra al terminar:\n" +
      "  postgresql://postgres." + PROY_PROD +
      ":<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  );
}
if (!EN_NUBE && !DB_URL.includes(PROY_PROD)) {
  abortar(
    "LUDOGTEKA_PROD_DB_URL no apunta a producción",
    DB_URL.includes(PROY_DEV)
      ? `Esa cadena es la de DESARROLLO (${PROY_DEV}). Este script es solo para producción.`
      : `Se esperaba una cadena del proyecto ${PROY_PROD}.`
  );
}

// En la nube: la API de gestión, con el proyecto de producción confirmado por la propia API.
let cliProd = null;
if (EN_NUBE) {
  if (PROD_API !== PROY_PROD) abortar("el motor de migraciones apunta a otro proyecto de producción");
  try {
    cliProd = await clienteApi(PROY_PROD, { produccion: true });
  } catch (e) {
    abortar("no se pudo abrir producción por la API de gestión", sinSecreto(e.message));
  }
}

async function consulta(sql) {
  if (cliProd) {
    // Lecturas (conteos y copia JSON): la API de gestión limita las consultas
    // por minuto (429 ThrottlerException) y ~200 seguidas lo rebasan. Es solo
    // lectura, así que se espera y se repite; las migraciones NO pasan por aquí.
    for (let intento = 1; ; intento++) {
      try {
        return await cliProd.sql(sql, 120000);
      } catch (e) {
        if (e?.status !== 429 || intento >= 8) throw e;
        await new Promise((r) => setTimeout(r, 15000 * intento));
      }
    }
  }
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
console.log(`   rama:   ${rama}${rama !== RAMA || EN_NUBE ? " (se despliega por PR a main)" : ""}`);
// Desde una rama que no es main (en la nube siempre; en la computadora, el camino normal
// desde el 22 de octubre de 2026) se despliega igual que en la nube: la rama se empuja, se
// abre o se reusa su PR a main, se comprueba que se puede fusionar ANTES de migrar y se
// fusiona por la API fijado al commit revisado. Desde main en la computadora queda el
// `git push origin main` de siempre.
const POR_PR = EN_NUBE || rama !== RAMA;
if (rama === "HEAD") abortar("no estás en ninguna rama (HEAD suelto)");
if (rama === RAMA && EN_NUBE) {
  abortar("en la nube no se despliega desde main", "Git solo empuja la rama de la sesión: trabaja en una rama propia y el script abre su PR.");
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

// Videos tutoriales que este cambio pudo dejar desactualizados (avisa ahora y los
// marca «por actualizar» —estado persistente— cuando la producción ya quedó actualizada).
let VIDEOS_POR_ACTUALIZAR = [];
console.log("\n   Videos tutoriales:");
{
  const r = spawnSync(process.execPath, ["scripts/tutoriales/afectados.mjs", `origin/${RAMA}`], { encoding: "utf8" });
  console.log((r.stdout || "   (sin información)\n").trimEnd());
  // Lo que se va a marcar «por actualizar» al terminar (el diff hay que leerlo
  // ahora: después de fusionar ya no hay diferencia contra origin/main).
  const j = spawnSync(process.execPath, ["scripts/tutoriales/afectados.mjs", `origin/${RAMA}`, "--json"], { encoding: "utf8" });
  try { VIDEOS_POR_ACTUALIZAR = JSON.parse((j.stdout || "[]").trim() || "[]"); } catch { VIDEOS_POR_ACTUALIZAR = []; }
}

// GitHub por la API REST (el GraphQL de `gh pr` lo niega el proxy de la nube).
const [GH_DUENO, GH_REPO] = (() => {
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(git("remote", "get-url", "origin"));
  return m ? [m[1], m[2]] : ["", ""];
})();
async function github(ruta, { method = "GET", body } = {}) {
  const r = await fetch(`https://api.github.com/repos/${GH_DUENO}/${GH_REPO}${ruta}`, {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {}
  if (!r.ok) {
    const e = new Error(`GitHub ${method} ${ruta}: HTTP ${r.status} ${sinSecreto(json?.message ?? texto).slice(0, 300)}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

// En la nube, lo que puede fallar al publicar el código (empujar la rama,
// el PR, que se pueda fusionar) se prueba ANTES de migrar: si falla después,
// queda esquema nuevo con código viejo, que es justo lo que este script evita.
let prNube = null;
if (POR_PR && pendientes) {
  if (!GH_TOKEN) abortar("falta GH_TOKEN (o una sesión de `gh`) para publicar el código por la API de GitHub");
  if (!GH_DUENO) abortar("no se reconoce el repositorio de GitHub del remoto origin");
  try {
    const repo = await github("");
    if (!repo.permissions?.push) abortar("el GH_TOKEN no tiene permiso de escritura en el repositorio");
    if (APLICAR) {
      corre("git", ["push", "origin", `HEAD:refs/heads/${rama}`]);
      console.log(`   rama '${rama}' empujada.`);
      const abiertos = await github(`/pulls?state=open&base=${RAMA}&head=${GH_DUENO}:${encodeURIComponent(rama)}`);
      prNube = abiertos[0] ?? null;
      if (!prNube) {
        const asunto = git("log", "-1", "--format=%s");
        prNube = await github("/pulls", {
          method: "POST",
          body: {
            title: asunto,
            head: rama,
            base: RAMA,
            body:
              "Despliegue a producción (`npm run desplegar -- --aplicar`): " +
              "las migraciones se aplican y se verifican ANTES de fusionar; al fusionar, Vercel construye main.\n\n" +
              "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
          },
        });
      }
      // GitHub calcula "se puede fusionar" en segundo plano: se espera.
      let mergeable = null;
      for (let i = 0; i < 15 && mergeable === null; i += 1) {
        const pr = await github(`/pulls/${prNube.number}`);
        mergeable = pr.mergeable;
        prNube = pr;
        if (mergeable === null) await new Promise((r) => setTimeout(r, 2000));
      }
      if (prNube.head.sha !== local) abortar("el PR no apunta al commit que se está desplegando", `PR: ${prNube.head.sha} · local: ${local}`);
      if (mergeable !== true) abortar(`el PR #${prNube.number} no se puede fusionar con ${RAMA} (${prNube.mergeable_state})`, prNube.html_url);
      console.log(`   PR #${prNube.number} listo para fusionar: ${prNube.html_url}`);
    }
  } catch (e) {
    abortar("no se pudo preparar la publicación del código por PR", sinSecreto(e.salida || e.message));
  }
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
// Conteo de TODAS las tablas de public, para comparar antes y después.
async function contarTodo() {
  const tablas = await consulta(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
  );
  if (!tablas.length) return {};
  const filas = await consulta(
    tablas.map((t) => `select '${t.table_name}' as tabla, count(*)::int as filas from public."${t.table_name}"`).join(" union all ")
  );
  return Object.fromEntries(filas.map((f) => [f.tabla, Number(f.filas)]));
}
let conteosAntes = {};
try {
  conteosAntes = await contarTodo();
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

let migracionesUnicas;
let pendientesNube = [];
if (EN_NUBE) {
  // El "dry-run": las mismas reglas que el CLI, leídas por la API.
  let estado;
  try {
    estado = await estadoMigraciones(cliProd, { incluirTodas: INCLUIR_TODAS });
  } catch (e) {
    abortar("no se pudo leer el historial de migraciones de producción", sinSecreto(e.message));
  }
  if (estado.problema) abortar(estado.problema);
  pendientesNube = estado.pendientes;
  migracionesUnicas = pendientesNube.map((p) => `${p.version}_${p.name}.sql`);
  console.log(`   aplicadas en producción: ${estado.remotas.length} · en el repo: ${estado.locales.length}`);
  console.log(migracionesUnicas.length ? migracionesUnicas.map((m) => `   · ${m}`).join("\n") : "   Remote database is up to date.");
} else {
  let salidaSeco;
  try {
    salidaSeco = supabase("db", "push", "--dry-run", "--db-url", DB_URL);
  } catch (e) {
    abortar("el dry-run de las migraciones falló", sinSecreto(e.salida || e.message));
  }
  console.log(sinSecreto(salidaSeco).trim());
  const pendientesMigracion = [...salidaSeco.matchAll(/(\d{14}_[\w-]+\.sql)/g)].map((m) => m[1]);
  migracionesUnicas = [...new Set(pendientesMigracion)];
}

// ---------------------------------------------------------------- respaldo
if (migracionesUnicas.length) {
  titulo("Respaldo antes de migrar");
  try {
    // En la computadora, la misma lectura por el CLI de Supabase (su sesión vive en el
    // Administrador de credenciales de Windows); la copia JSON va por la conexión directa.
    const b = cliProd
      ? await cliProd.api(`/projects/${PROY_PROD}/database/backups`)
      : JSON.parse(supabase("backups", "list", "--project-ref", PROY_PROD, "-o", "json").replace(/^[^{]*/, ""));
    const completos = (b.backups ?? []).filter((x) => x.status === "COMPLETED").sort((a, c) => c.inserted_at.localeCompare(a.inserted_at));
    const ultimo = completos[0];
    const horas = ultimo ? (Date.now() - Date.parse(ultimo.inserted_at)) / 3600000 : Infinity;
    console.log(`   respaldo físico más reciente: ${ultimo ? `${ultimo.inserted_at} (hace ${horas.toFixed(1)} h, id ${ultimo.id})` : "ninguno"}`);
    console.log(`   PITR: ${b.pitr_enabled ? "sí" : "no"} · (la API no deja crear un punto de restauración al momento)`);
    if (!b.pitr_enabled && horas > HORAS_MAX_RESPALDO) {
      abortar(`no hay un respaldo físico completo de las últimas ${HORAS_MAX_RESPALDO} h`, "Espera al respaldo diario o créalo desde el panel de Supabase, y vuelve a correr.");
    }
    if (APLICAR) {
      const carpeta = path.join(os.tmpdir(), "peludesk-respaldos", new Date().toISOString().replace(/[:.]/g, "-"));
      mkdirSync(carpeta, { recursive: true });
      let total = 0;
      for (const tabla of Object.keys(conteosAntes)) {
        const [fila] = await consulta(`select coalesce(json_agg(t), '[]'::json) as filas from public."${tabla}" t`);
        writeFileSync(path.join(carpeta, `${tabla}.json`), JSON.stringify(fila.filas));
        total += conteosAntes[tabla];
      }
      writeFileSync(path.join(carpeta, "_conteos.json"), JSON.stringify(conteosAntes, null, 2));
      console.log(`   copia JSON de ${Object.keys(conteosAntes).length} tablas (${total} filas) en ${carpeta}`);
      console.log("   (copia de consulta en la carpeta temporal; el respaldo restaurable es el físico de arriba)");
    }
  } catch (e) {
    abortar("no se pudo comprobar o hacer el respaldo previo", sinSecreto(e.message));
  }
}

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
// En la nube: el motor por la API. Cada migración es su propia transacción
// con su registro; un error de SQL se detiene ahí (se deshizo), y solo un
// fallo de red o del servidor (sin respuesta de la base) se reintenta, sobre
// las que sigan pendientes según la base.
for (let intento = 1; EN_NUBE && intento <= REINTENTOS_MIGRACION && !migrado; intento += 1) {
  console.log(`   intento ${intento} de ${REINTENTOS_MIGRACION}…`);
  try {
    const estado = await estadoMigraciones(cliProd, { incluirTodas: INCLUIR_TODAS });
    if (estado.problema) abortar(estado.problema);
    await aplicarPendientes(cliProd, estado.pendientes);
    migrado = true;
  } catch (e) {
    const detalle = sinSecreto(e.message);
    console.log(`   falló: ${detalle}`);
    const transitorio = !e.status || e.status >= 500 || /HTTP (5\d\d|429)|timeout|aborted|fetch failed/i.test(detalle);
    if (!transitorio || intento === REINTENTOS_MIGRACION) abortar("las migraciones no se pudieron aplicar", detalle);
    await new Promise((r) => setTimeout(r, 5000 * intento));
  }
}
for (let intento = 1; !EN_NUBE && intento <= REINTENTOS_MIGRACION && !migrado; intento += 1) {
  console.log(`   intento ${intento} de ${REINTENTOS_MIGRACION}…`);
  try {
    const salida = supabase("db", "push", "--db-url", DB_URL);
    console.log(sinSecreto(salida).trim());
    migrado = migracionOk(salida);
    if (!migrado) {
      console.log("   terminó sin confirmar el push; se reintenta.");
    }
  } catch (e) {
    const detalle = sinSecreto(e.salida || e.message);
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
    // Por versión exacta, no "las N más recientes": con --incluir-todas una migración vieja
    // queda fuera de esa ventana aunque sí se haya registrado.
    migracionesUnicas.length
      ? `select version from supabase_migrations.schema_migrations
         where version in (${migracionesUnicas.map((m) => `'${m.slice(0, 14).replace(/[^0-9]/g, "")}'`).join(", ")})
         order by version desc`
      : `select version from supabase_migrations.schema_migrations order by version desc limit 1`
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

try {
  const conteosDespues = await contarTodo();
  const cambios = Object.keys({ ...conteosAntes, ...conteosDespues })
    .filter((t) => conteosAntes[t] !== conteosDespues[t])
    .map((t) => `   ${(t + ":").padEnd(28)} ${String(conteosAntes[t] ?? "(nueva)").padStart(8)} → ${String(conteosDespues[t] ?? "(ya no está)").padStart(8)}`);
  console.log(cambios.length ? `   filas que cambiaron con la migración:\n${cambios.join("\n")}` : "   Conteos: ninguna tabla cambió de número de filas.");
} catch (e) {
  console.log(`   (no se pudieron recontar las tablas: ${sinSecreto(e.message)})`);
}
try {
  const frontera = cliProd ? await auditoriaFrontera(cliProd) : await consulta("select * from public.auditoria_frontera()");
  if (frontera.length) {
    abortar(
      `auditoria_frontera() trae ${frontera.length} renglón(es) después de migrar`,
      frontera.slice(0, 20).map((f) => JSON.stringify(f)).join("\n") + "\n\nEl código NO se publicó: revisa la frontera antes de desplegar."
    );
  }
  console.log("   auditoria_frontera(): vacía.");
} catch (e) {
  abortar("no se pudo correr auditoria_frontera()", sinSecreto(e.message));
}

// ---------------------------------------------------------------- 6
titulo("Desplegando el código");

if (!pendientes) {
  console.log("   No hay commits nuevos: la migración ya quedó y no hay nada que empujar.");
  process.exit(0);
}

let deployPrevio = "";
try {
  deployPrevio = ultimoDeploy().url;  // mismo tope corto de tiempo
  console.log(`   deploy actual en producción: ${deployPrevio || "(ninguno)"}`);
} catch {
  console.log("   (no se pudo leer el estado previo de Vercel; se sigue de todos modos)");
}

try {
  if (POR_PR) {
    // Fijado al commit que se revisó: si alguien empujó algo más a la rama, GitHub la rechaza.
    const r = await github(`/pulls/${prNube.number}/merge`, { method: "PUT", body: { merge_method: "merge", sha: local } });
    if (!r?.merged) throw new Error(`GitHub no fusionó el PR #${prNube.number}: ${r?.message ?? "sin detalle"}`);
    console.log(`   PR #${prNube.number} fusionado a ${RAMA} (${String(r.sha).slice(0, 7)}).`);
  } else {
    console.log(corre("git", ["push", "origin", RAMA]).trim() || "   push enviado.");
  }
} catch (e) {
  abortar(
    "el push del código falló DESPUÉS de migrar",
    sinSecreto(e.salida || e.message) +
      "\n\nProducción quedó con el esquema nuevo y el código viejo. Resuelve el push\n" +
      "cuanto antes: es la ventana que este script existe para evitar."
  );
}

// La rama de la sesión queda al día con main (la fusión es un commit más
// adelante); si no, el siguiente despliegue la vería "detrás de origin/main".
if (POR_PR) {
  try {
    git("pull", "--ff-only", "origin", RAMA);
    git("push", "origin", `HEAD:refs/heads/${rama}`);
  } catch (e) {
    console.log(`   (no se pudo traer main a la rama: ${sinSecreto(e.salida || e.message).trim()})`);
  }
}

// ---------------------------------------------------------------- 7
titulo("Esperando el build de Vercel");

// Un build que falla por la INFRAESTRUCTURA de Vercel (git_info_fail y parecidos:
// el 10 de octubre de 2026 el build murió sin tocar el código) no es un fallo del
// despliegue. Se distingue del fallo de código por el errorCode/errorMessage del
// deployment, se reintenta con `vercel redeploy` y, si sigue, se crea el deployment
// por la API desde el commit fusionado de main. Un fallo de CÓDIGO no se reintenta.
const PROYECTO_VERCEL = (() => {
  try { return JSON.parse(readFileSync(".vercel/project.json", "utf8")); } catch { return {}; }
})();
async function vercelApi(ruta, { method = "GET", body } = {}) {
  if (!VERCEL_TOKEN) throw new Error("falta VERCEL_TOKEN para hablar con la API de Vercel");
  const sep = ruta.includes("?") ? "&" : "?";
  const team = process.env.VERCEL_ORG_ID || PROYECTO_VERCEL.orgId || "";
  const r = await fetch(`https://api.vercel.com${ruta}${team ? `${sep}teamId=${team}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch {}
  if (!r.ok) throw new Error(`Vercel ${method} ${ruta}: HTTP ${r.status} ${sinSecreto(json?.error?.message ?? texto).slice(0, 300)}`);
  return json;
}
function esFalloDeCodigo(info) {
  const t = `${info?.errorCode ?? ""} ${info?.errorMessage ?? ""}`;
  return /build_failed|BUILD_FAILED|exited with|Command .* exited|Type error|Failed to compile|compile/i.test(t);
}
async function esperarDeployment(id, minutos = 10) {
  const limiteLocal = Date.now() + minutos * 60 * 1000;
  let info = null;
  while (Date.now() < limiteLocal) {
    info = await vercelApi(`/v13/deployments/${id}`).catch(() => null);
    const estado = info?.readyState ?? info?.status;
    if (estado === "READY") return { listo: true, info };
    if (estado === "ERROR" || estado === "CANCELED") return { listo: false, info };
    await new Promise((r) => setTimeout(r, 10000));
  }
  return { listo: false, info, vencio: true };
}
async function idDeDeployment(url) {
  const host = String(url).replace(/^https?:\/\//, "");
  const info = await vercelApi(`/v13/deployments/${encodeURIComponent(host)}`);
  return info?.id ?? "";
}
// Devuelve { listo, detalle }. `fallo` es lo que dijo `vercel ls` del deployment que murió.
async function recuperarBuild(fallo) {
  const bitacora = [];
  let info = null;
  try {
    const id = await idDeDeployment(fallo.url);
    info = await vercelApi(`/v13/deployments/${id}`);
    bitacora.push(`deployment ${fallo.url}: ${info?.readyState ?? "?"} · errorCode=${info?.errorCode ?? "(ninguno)"} · ${String(info?.errorMessage ?? "").slice(0, 200)}`);
    if (esFalloDeCodigo(info)) {
      return { listo: false, codigo: true, detalle: bitacora.join("\n") + "\nEs un fallo de CÓDIGO (el build no compiló): no se reintenta." };
    }
    // 1) Reintento: el mismo deployment otra vez.
    console.log("   El build falló por algo que no parece del código: reintento con `vercel redeploy`.");
    let nuevoId = "";
    try {
      const re = await vercelApi(`/v13/deployments?forceNew=1`, { method: "POST", body: { name: PROYECTO_VERCEL.projectName || "ludogteka", deploymentId: id, target: "production" } });
      nuevoId = re?.id ?? "";
      bitacora.push(`redeploy → ${re?.url ?? "?"}`);
    } catch (e) {
      bitacora.push(`redeploy falló: ${sinSecreto(e.message)}`);
    }
    if (nuevoId) {
      const r1 = await esperarDeployment(nuevoId);
      bitacora.push(`redeploy terminó en ${r1.info?.readyState ?? "?"}`);
      if (r1.listo) return { listo: true, detalle: bitacora.join("\n") };
      if (r1.info && esFalloDeCodigo(r1.info)) return { listo: false, codigo: true, detalle: bitacora.join("\n") + "\nEl reintento reveló un fallo de CÓDIGO." };
    }
    // 2) Crear el deployment por la API desde el commit fusionado de main.
    console.log("   Sigue fallando: creo el deployment por la API de Vercel desde main.");
    const sha = git("rev-parse", `origin/${RAMA}`);
    const repo = await github("");
    const nuevo = await vercelApi(`/v13/deployments?forceNew=1`, {
      method: "POST",
      body: {
        name: PROYECTO_VERCEL.projectName || "ludogteka",
        project: PROYECTO_VERCEL.projectId,
        target: "production",
        gitSource: { type: "github", repoId: repo.id, ref: RAMA, sha },
      },
    });
    bitacora.push(`deployment por API (${String(sha).slice(0, 7)}) → ${nuevo?.url ?? "?"}`);
    const r2 = await esperarDeployment(nuevo.id);
    bitacora.push(`deployment por API terminó en ${r2.info?.readyState ?? "?"}`);
    return { listo: r2.listo, detalle: bitacora.join("\n"), codigo: !!(r2.info && esFalloDeCodigo(r2.info)) };
  } catch (e) {
    bitacora.push(`no se pudo recuperar: ${sinSecreto(e.message)}`);
    return { listo: false, detalle: bitacora.join("\n") };
  }
}

const limite = Date.now() + 8 * 60 * 1000;
let listo = false;
let fallosSeguidos = 0;
let ultimoError = "";
let sesionVercelCaducada = false;
let falloBuild = null;
let recuperacion = null;

while (Date.now() < limite && !listo) {
  await new Promise((r) => setTimeout(r, 10000));
  let d;
  try {
    d = ultimoDeploy();
    fallosSeguidos = 0;
  } catch (e) {
    // Que no se pueda CONSULTAR el estado no significa que el deploy haya
    // fallado: el código ya está empujado y Vercel construye por su
    // cuenta. Se avisa y se sale bien, en vez de reportar un fracaso que
    // no ocurrió — o peor, quedarse colgado reintentando.
    fallosSeguidos += 1;
    const detalle = sinSecreto(e.salida || e.message);
    ultimoError = detalle.split("\n").filter(Boolean).slice(-2).join(" ");
    // Sesión caducada: no se va a arreglar sola en diez segundos, así que
    // se corta al primer intento en vez de gastar otro tope de tiempo
    // completo esperando lo mismo.
    if (/oauth\/device|Waiting for authentication|Logged out|vercel login/i.test(detalle)) {
      sesionVercelCaducada = true;
      break;
    }
    if (fallosSeguidos >= 2) break;
    continue;
  }
  if (!d.url) continue;
  console.log(`   ${d.url}  ${d.estado}`);
  if (d.url !== deployPrevio) {
    if (d.estado === "Ready") listo = true;
    if (d.estado === "Error" || d.estado === "Canceled") {
      falloBuild = d;
      break;
    }
  }
}

if (falloBuild) {
  console.log(`\n   El build de Vercel terminó en ${falloBuild.estado}. Se intenta recuperar antes de rendirse.`);
  recuperacion = await recuperarBuild(falloBuild);
  console.log(recuperacion.detalle.split("\n").map((l) => `   ${l}`).join("\n"));
  listo = recuperacion.listo;
}

// ---------------------------------------------------------------- 8
// Pasos posteriores al código: SIEMPRE se intentan (aunque el build haya fallado, el
// código ya está en main y los videos hay que marcarlos), y lo que no se pueda hacer
// queda impreso como PENDIENTE con el comando exacto.
titulo("Videos tutoriales en producción");
const PENDIENTES = [];
{
  const s = spawnSync(process.execPath, ["scripts/tutoriales/sincronizar.mjs", "--prod"], { encoding: "utf8" });
  console.log(sinSecreto((s.stdout || "") + (s.stderr || "")).trimEnd().split("\n").map((l) => `   ${l}`).join("\n"));
  if (s.status !== 0) PENDIENTES.push("node scripts/tutoriales/sincronizar.mjs --prod");
}
if (VIDEOS_POR_ACTUALIZAR.length) {
  // El código cambió en estos videos; ¿cambió algo que SE VE? (scripts/tutoriales/verificar-visual.mjs: abre en el demo las
  // pantallas de cada video y las compara contra sus fotogramas grabados). Solo se marcan los que sí; si el verificador no
  // puede correr, se marcan todos como antes (y queda dicho): es preferible un video de más por revisar a uno de menos.
  const candidatos = VIDEOS_POR_ACTUALIZAR.map((v) => v.numero);
  console.log(`\n   Verificación visual de ${candidatos.length} video(s) con cambios de código (${candidatos.join(", ")})…`);
  const vv = spawnSync(process.execPath, ["scripts/tutoriales/verificar-visual.mjs", "--videos", candidatos.join(","), "--levantar", "--subir", "--prod", "--json", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 45 * 60 * 1000 });
  console.log(sinSecreto(vv.stderr || "").trimEnd().split("\n").slice(-30).map((l) => `   ${l}`).join("\n"));
  try {
    const dicho = JSON.parse((vv.stdout || "").trim());
    if (!Array.isArray(dicho) || !dicho.length) throw new Error("sin resultados");
    const por = new Map(dicho.map((d) => [d.numero, d]));
    const antes = VIDEOS_POR_ACTUALIZAR.length;
    VIDEOS_POR_ACTUALIZAR = VIDEOS_POR_ACTUALIZAR.flatMap((v) => {
      const d = por.get(v.numero);
      if (!d) return [v];
      if (d.estado === "igual" || d.estado === "sin_grabar") return [];
      const captura = d.imagen ? ` (captura: ${v.numero}-…/diferencias/${d.imagen.split("/").pop()})` : "";
      return [{ numero: v.numero, motivo: (d.estado === "cambio" ? `se ve distinto: ${d.motivo}` : `no pude compararlo (${d.motivo}); cambió el código: ${v.motivo}`).slice(0, 260) + captura }];
    });
    console.log(`   Se ven igual ${antes - VIDEOS_POR_ACTUALIZAR.length} de ${antes}: no se marcan.`);
  } catch (e) {
    console.log(`   (la verificación visual no dio resultados: ${e.message}; se marcan todos los que cambiaron por código)`);
    PENDIENTES.push("node scripts/tutoriales/verificar-visual.mjs --marcados --aplicar --prod   (desmarca los que se ven igual)");
  }
}
if (VIDEOS_POR_ACTUALIZAR.length) {
  const m = spawnSync(process.execPath, ["scripts/tutoriales/marcar.mjs", "--json", JSON.stringify(VIDEOS_POR_ACTUALIZAR), "--prod"], { encoding: "utf8" });
  console.log(`\n   Videos «por actualizar»: ${VIDEOS_POR_ACTUALIZAR.map((v) => v.numero).join(", ")}`);
  console.log(sinSecreto((m.stdout || "") + (m.stderr || "")).trimEnd().split("\n").map((l) => `   ${l}`).join("\n"));
  if (m.status !== 0) {
    const archivo = path.join(os.tmpdir(), "marcas-videos-pendientes.json");
    writeFileSync(archivo, JSON.stringify(VIDEOS_POR_ACTUALIZAR));
    PENDIENTES.push(`node scripts/tutoriales/marcar.mjs --archivo ${archivo} --prod`);
  }
}
if (PENDIENTES.length) {
  console.log(`\n   PENDIENTE (corre en este orden):`);
  for (const c of PENDIENTES) console.log(`     ${c}`);
}

if (falloBuild && !listo) {
  console.log(`\n${"!".repeat(72)}`);
  console.log(`El código YA está en main y la base migrada, pero el build de Vercel NO quedó Ready${recuperacion?.codigo ? " (fallo de CÓDIGO)" : ""}.`);
  console.log("Revisa el deployment en Vercel; si fue de infraestructura, crea otro con la API (ver CLAUDE.md > «Cuando el build de Vercel falla por infraestructura»).");
  console.log(`${"!".repeat(72)}\n`);
  process.exit(1);
}

if (!listo) {
  console.log(`\n${"=".repeat(72)}`);
  console.log("El código YA se empujó y Vercel está construyendo; lo que no se pudo fue");
  console.log("seguir el estado del build desde aquí.");
  if (sesionVercelCaducada) {
    console.log("\nMotivo: la sesión del CLI de Vercel caducó (pidió login por dispositivo).");
    console.log("Corre `npx vercel login` una vez y el próximo despliegue ya va a poder");
    console.log("reportar el estado del build. El deploy de este no se ve afectado.");
  } else if (fallosSeguidos >= 2) {
    console.log(`\nMotivo: ${ultimoError}`);
  } else {
    console.log("\nMotivo: el build no quedó Ready dentro del tiempo de espera.");
  }
  console.log("\nRevísalo con:  npx vercel ls ludogteka --prod");
  console.log(`${"=".repeat(72)}\n`);
  process.exit(0);
}

console.log(`\n${"=".repeat(72)}`);
console.log("Producción actualizada: esquema migrado, verificado, y código desplegado.");
console.log(`${"=".repeat(72)}\n`);
