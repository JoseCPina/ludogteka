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
// manual". Este script es SOLO para desarrollo: el proyecto está fijo y si
// algo apunta a producción se niega. Producción usa el mismo motor
// (migraciones-api.mjs) únicamente a través de `npm run desplegar`, que
// además respalda, cuenta antes y después y publica el código (28 de
// septiembre de 2026).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { partirSentencias } from "./sentencias.mjs";
import { DEV, PROD, DIR_MIGRACIONES as DIR, aplicarPendientes, auditoriaFrontera, clienteApi, estadoMigraciones } from "./migraciones-api.mjs";

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
for (const [origen, valor] of [
  ["argumentos", process.argv.slice(2).join(" ")],
  ["SUPABASE_PROJECT_REF", process.env.SUPABASE_PROJECT_REF],
  ["SUPABASE_PROJECT_ID", process.env.SUPABASE_PROJECT_ID],
  ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
]) {
  if (valor?.includes(PROD)) abortar(`${origen} apunta a PRODUCCIÓN (${PROD}). Este script es solo para desarrollo; producción va por npm run desplegar.`);
}
const ligado = fs.existsSync("supabase/.temp/project-ref") ? fs.readFileSync("supabase/.temp/project-ref", "utf8").trim() : "";
if (ligado && ligado !== DEV) abortar(`el CLI está ligado a ${ligado}, no a desarrollo (${DEV}). No se sigue.`);

const cli = await clienteApi(DEV).catch((e) => abortar(`no se pudo abrir el proyecto ${DEV} por la API de gestión — ${e.message}`));
console.log(`Proyecto: ${cli.nombre} (${DEV}) — desarrollo\n`);

const estado = await estadoMigraciones(cli, { incluirTodas: args.has("--incluir-todas"), conSentencias: modo === "--comparar" });

if (modo === "--comparar") {
  const porVersion = new Map(estado.locales.map((l) => [l.version, l]));
  let distintas = 0;
  for (const r of estado.remotas) {
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
  console.log(`${estado.remotas.length} registradas; ${distintas} con sentencias distintas a las que registraría este script.`);
  process.exit(distintas ? 1 : 0);
}

if (estado.problema) abortar(estado.problema);
const { pendientes } = estado;
console.log(`Aplicadas en desarrollo: ${estado.remotas.length} · en el repo: ${estado.locales.length} · pendientes: ${pendientes.length}`);
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
    console.log("  Se aplican con: npm run desplegar -- --revisar, luego -- --aplicar (también desde la nube).");
  }
}

if (modo === "--revisar" || !pendientes.length) {
  if (!pendientes.length) console.log("\nDesarrollo está al día.");
  informarProduccion();
  process.exit(0);
}

try {
  await aplicarPendientes(cli, pendientes);
} catch (e) {
  abortar(e.message);
}
const frontera = await auditoriaFrontera(cli);
if (frontera.length) {
  console.log(`\n✘ auditoria_frontera() trae ${frontera.length} renglón(es):`);
  for (const f of frontera.slice(0, 30)) console.log(`  ${JSON.stringify(f)}`);
} else console.log("\n✔ auditoria_frontera() vacía.");
informarProduccion();
process.exit(frontera.length ? 1 : 0);
