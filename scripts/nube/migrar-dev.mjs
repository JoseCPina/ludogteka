// Aplica las migraciones pendientes de supabase/migrations a DESARROLLO
// (sgfolltpvktbsiisfuzq) por HTTPS, con la API de gestión de Supabase. Existe
// porque en la nube el proxy de la sesión solo deja pasar HTTPS y Postgres
// (5432/6543) no se alcanza: `supabase db push` no puede correr ahí.
//
//   node scripts/nube/migrar-dev.mjs --revisar    compara y dice qué aplicaría (no escribe)
//   node scripts/nube/migrar-dev.mjs --aplicar    aplica las pendientes
//   node scripts/nube/migrar-dev.mjs --comparar   comprueba que las sentencias registradas
//                                                 por el CLI son las que este script registraría
//
// Hace lo mismo que `supabase db push`:
//   - lee supabase_migrations.schema_migrations; si la base tiene una versión
//     que no está en supabase/migrations, se detiene (el CLI también);
//   - si hay una pendiente más vieja que la última aplicada, se detiene salvo
//     con --incluir-todas (el --include-all del CLI);
//   - aplica solo las pendientes, en orden de versión, cada una en UNA
//     transacción con su registro en schema_migrations (version, name,
//     statements: las sentencias partidas igual que el CLI, sentencias.mjs).
//     Si una falla, la transacción entera se deshace, no queda registrada y
//     el script se detiene sin tocar las siguientes.
// Al final corre auditoria_frontera() (tiene que salir vacía) y dice qué
// migraciones de la rama no están en main (las que irán a producción).
//
// EXCEPCIÓN AUTORIZADA POR EL DUEÑO (27 de septiembre de 2026) a "nada de SQL
// manual", SOLO para desarrollo. Producción NUNCA: el proyecto está fijo en
// el código, no se acepta otro, y si algo apunta a producción el script se
// niega. Producción se migra únicamente con `npm run desplegar` desde la
// computadora del dueño.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { partirSentencias } from "./sentencias.mjs";

const DEV = "sgfolltpvktbsiisfuzq";
const PROD = "xdsxjhytggpsgrmfuuff";
const DIR = "supabase/migrations";
const TOPE_MS = 5 * 60 * 1000;

const args = new Set(process.argv.slice(2));
const modo = ["--revisar", "--aplicar", "--comparar"].find((m) => args.has(m));
if (!modo) {
  console.log("Uso: node scripts/nube/migrar-dev.mjs --revisar | --aplicar [--incluir-todas] | --comparar");
  process.exit(2);
}

function abortar(msg) {
  console.error(`\n✘ ${msg}`);
  process.exit(1);
}

// ------------------------------------------------ nunca contra producción
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) abortar("falta SUPABASE_ACCESS_TOKEN (variable del entorno).");
for (const [origen, valor] of [
  ["argumentos", process.argv.slice(2).join(" ")],
  ["SUPABASE_PROJECT_REF", process.env.SUPABASE_PROJECT_REF],
  ["SUPABASE_PROJECT_ID", process.env.SUPABASE_PROJECT_ID],
  ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
]) {
  if (valor?.includes(PROD)) abortar(`${origen} apunta a PRODUCCIÓN (${PROD}). Este script es solo para desarrollo; producción va por npm run desplegar desde la computadora del dueño.`);
}
const ligado = fs.existsSync("supabase/.temp/project-ref") ? fs.readFileSync("supabase/.temp/project-ref", "utf8").trim() : "";
if (ligado && ligado !== DEV) abortar(`el CLI está ligado a ${ligado}, no a desarrollo (${DEV}). No se sigue.`);

const secretos = [token];
const limpio = (t) => secretos.reduce((s, x) => s.split(x).join("[oculto]"), String(t)).slice(0, 2000);

async function api(ruta, init = {}) {
  const r = await fetch(`https://api.supabase.com/v1${ruta}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(init.tope ?? 60000),
  });
  const texto = await r.text();
  if (!r.ok) {
    let msg = texto;
    try { msg = JSON.parse(texto).message ?? texto; } catch {}
    const e = new Error(`HTTP ${r.status}: ${limpio(msg)}`);
    e.status = r.status;
    throw e;
  }
  return texto ? JSON.parse(texto) : null;
}

const sql = (query, tope) => api(`/projects/${DEV}/database/query`, { method: "POST", body: JSON.stringify({ query }), tope });

// La API confirma de qué proyecto se trata antes de escribir nada.
const proyecto = await api(`/projects/${DEV}`).catch((e) => abortar(`no se pudo leer el proyecto ${DEV} por la API de gestión — ${e.message}`));
if (proyecto.id !== DEV || proyecto.ref === PROD || /prod/i.test(proyecto.name ?? "")) {
  abortar(`la API devolvió un proyecto que no es desarrollo (${proyecto.id} · ${proyecto.name}). No se sigue.`);
}
console.log(`Proyecto: ${proyecto.name} (${DEV}) — desarrollo\n`);

// ------------------------------------------------------------ locales
const locales = fs
  .readdirSync(DIR)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort()
  .map((f) => {
    const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(f);
    return { version, name, archivo: path.join(DIR, f) };
  });

// ------------------------------------------------------------ remotas
const hayTabla = (await sql("select to_regclass('supabase_migrations.schema_migrations') is not null as hay"))[0].hay;
const remotas = hayTabla
  ? await sql(`select version, name${modo === "--comparar" ? ", statements" : ""} from supabase_migrations.schema_migrations order by version`)
  : [];
const aplicadas = new Set(remotas.map((r) => r.version));

if (modo === "--comparar") {
  const porVersion = new Map(locales.map((l) => [l.version, l]));
  let distintas = 0;
  for (const r of remotas) {
    const l = porVersion.get(r.version);
    if (!l) continue;
    // Las aplicadas desde Windows se registraron con CRLF; el git de aquí da LF.
    const suyas = JSON.stringify((r.statements ?? []).map((s) => s.replace(/\r\n/g, "\n")));
    const mias = JSON.stringify(partirSentencias(fs.readFileSync(l.archivo, "utf8").replace(/\r\n/g, "\n")));
    if (r.name !== l.name || suyas !== mias) {
      distintas += 1;
      console.log(`  ✘ ${r.version}_${l.name}`);
    }
  }
  console.log(`${remotas.length} registradas; ${distintas} con sentencias distintas a las que registraría este script.`);
  process.exit(distintas ? 1 : 0);
}

// Igual que el CLI: una versión en la base que no está en el repo detiene todo.
const huerfanas = remotas.filter((r) => !locales.some((l) => l.version === r.version));
if (huerfanas.length) {
  abortar(`la base tiene migraciones que no están en ${DIR}: ${huerfanas.map((r) => r.version).join(", ")}.\n  (el CLI se detiene igual: "Remote migration versions not found in local migrations directory"). Trae esa rama o repara el historial antes de seguir.`);
}

const pendientes = locales.filter((l) => !aplicadas.has(l.version));
const ultima = remotas.at(-1)?.version ?? "";
const viejas = pendientes.filter((p) => p.version < ultima);
if (viejas.length && !args.has("--incluir-todas")) {
  abortar(`hay pendientes más viejas que la última aplicada (${ultima}): ${viejas.map((v) => v.version).join(", ")}.\n  Igual que el --include-all del CLI, se aplican solo con --incluir-todas.`);
}

console.log(`Aplicadas en desarrollo: ${remotas.length} · en el repo: ${locales.length} · pendientes: ${pendientes.length}`);
for (const p of pendientes) console.log(`  · ${p.version}_${p.name}`);

// Lo que irá a producción: migraciones de la rama que main todavía no tiene.
function pendientesProduccion() {
  const r = spawnSync("git", ["diff", "--name-only", "--diff-filter=A", "origin/main...HEAD", "--", DIR], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const sucias = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "--", DIR], { encoding: "utf8" }).stdout;
  return [...new Set((r.stdout + sucias).split("\n").filter(Boolean).map((f) => path.basename(f)))].sort();
}
function informarProduccion() {
  const prod = pendientesProduccion();
  console.log("\nPara producción (migraciones de esta rama que no están en origin/main):");
  if (prod === null) console.log("  no se pudo comparar contra origin/main (git fetch origin main y vuelve a correr).");
  else if (!prod.length) console.log("  ninguna.");
  else {
    for (const f of prod) console.log(`  · ${f}`);
    console.log("  Se aplican SOLO desde la computadora del dueño: npm run desplegar -- --revisar, luego -- --aplicar.");
  }
}

async function auditarFrontera() {
  const filas = await sql("select * from public.auditoria_frontera()");
  if (filas.length) {
    console.log(`\n✘ auditoria_frontera() trae ${filas.length} renglón(es):`);
    for (const f of filas.slice(0, 30)) console.log(`  ${JSON.stringify(f)}`);
    return false;
  }
  console.log("\n✔ auditoria_frontera() vacía.");
  return true;
}

if (modo === "--revisar" || !pendientes.length) {
  if (!pendientes.length) console.log("\nDesarrollo está al día.");
  informarProduccion();
  process.exit(0);
}

// ------------------------------------------------------------ aplicar
// Misma tabla que crea el CLI si no existe (pkg/migration/history.go).
if (!hayTabla) {
  await sql(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;`);
}

// Una cadena $etiqueta$…$etiqueta$ que no aparece en el texto.
function literal(texto) {
  let tag;
  do tag = `$m${crypto.randomBytes(6).toString("hex")}$`; while (texto.includes(tag));
  return `${tag}${texto}${tag}`;
}

async function registrada(version) {
  const r = await sql(`select 1 from supabase_migrations.schema_migrations where version = ${literal(version)}`);
  return r.length > 0;
}

for (const p of pendientes) {
  const sentencias = partirSentencias(fs.readFileSync(p.archivo, "utf8"));
  // Un begin/commit propio partiría la transacción: se deshace a mano, no aquí.
  const control = sentencias.find((s) => /^(begin|commit|rollback|end|start\s+transaction)\b/i.test(s.replace(/^(\s*--[^\n]*\n)*/, "").trim()));
  if (control) abortar(`${p.version}_${p.name} trae control de transacción propio (${control.slice(0, 40)}…): el registro dejaría de ser atómico. Quítalo de la migración.`);
  // Una sola consulta de varias sentencias = una transacción implícita en
  // Postgres (como el batch del CLI): si algo falla, se deshace todo, registro incluido.
  const consulta = [
    ...sentencias,
    `insert into supabase_migrations.schema_migrations (version, name, statements) values (${literal(p.version)}, ${literal(p.name)}, array[${sentencias.map(literal).join(", ")}]::text[])`,
  ].join("\n;\n") + "\n;";
  process.stdout.write(`\n→ ${p.version}_${p.name} (${sentencias.length} sentencias) … `);
  try {
    await sql(consulta, TOPE_MS);
  } catch (e) {
    // Con un corte de red o tope la base pudo terminarla: se pregunta, no se supone.
    let quedo = null;
    try { quedo = await registrada(p.version); } catch {}
    console.log("falló");
    console.error(`  ${e.message}`);
    if (quedo === true) {
      console.error("  OJO: la respuesta se perdió pero la base SÍ la registró (terminó del lado del servidor). Vuelve a correr --revisar.");
    } else {
      console.error(`  No quedó registrada${quedo === null ? " (no se pudo confirmar: revisa con --revisar)" : ""}; la transacción se deshizo. No se aplicó ninguna de las siguientes.`);
    }
    process.exit(1);
  }
  if (!(await registrada(p.version))) abortar(`${p.version} respondió bien pero no aparece en schema_migrations. Se detiene.`);
  console.log("aplicada y registrada");
}

const limpia = await auditarFrontera();
informarProduccion();
process.exit(limpia ? 0 : 1);
