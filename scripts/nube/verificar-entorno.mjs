// Comprueba que el entorno (de la nube o local) puede hacer todo lo que el
// trabajo en PeluDesk necesita, sin escribir nada y sin imprimir un secreto:
//   node scripts/nube/verificar-entorno.mjs
// Sale con 1 si algo falla. Cada renglón dice qué se probó y, si falló, qué
// revisar (variable, acceso a red o sesión del CLI).
import { spawnSync } from "node:child_process";
import pg from "pg";
import { abrirNavegador } from "../lib/navegador.mjs";

const DEV = "sgfolltpvktbsiisfuzq";
const PROD = "xdsxjhytggpsgrmfuuff";
const CLI = "node_modules/supabase/dist/supabase.js";
const env = process.env;
let fallas = 0;

const secretos = [env.SUPABASE_SECRET_KEY, env.SUPABASE_ACCESS_TOKEN, env.VERCEL_TOKEN, env.LUDOGTEKA_PROD_DB_URL, env.SUPABASE_DB_PASSWORD].filter(Boolean);
const limpio = (t) => secretos.reduce((s, x) => s.split(x).join("[oculto]"), String(t)).replace(/postgresql:\/\/\S+/g, "postgresql://[oculto]").split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300);

async function prueba(que, fn) {
  try {
    const detalle = await fn();
    console.log(`  ✔ ${que}${detalle ? ` — ${detalle}` : ""}`);
  } catch (e) {
    fallas += 1;
    console.log(`  ✘ ${que} — ${limpio(e.message)}`);
  }
}

function corre(cmd, args, timeout = 60000) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stdout || "") + (r.stderr || "") || `${cmd} salió con ${r.status}`);
  return r.stdout;
}

console.log(`\nEntorno: ${env.CLAUDE_CODE_REMOTE === "true" ? "nube (claude.ai/code)" : "local"}\n`);

console.log("Variables");
for (const v of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID", "LUDOGTEKA_PROD_DB_URL"]) {
  await prueba(v, () => {
    if (!env[v]) throw new Error("no está puesta");
    return "";
  });
}
await prueba("NEXT_PUBLIC_SUPABASE_URL es desarrollo", () => {
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(DEV)) throw new Error(`se esperaba ${DEV}: las llaves de producción viven solo en Vercel`);
});
await prueba("LUDOGTEKA_PROD_DB_URL es producción", () => {
  if (!env.LUDOGTEKA_PROD_DB_URL?.includes(PROD)) throw new Error(`se esperaba una cadena de ${PROD}`);
});

console.log("\nDesarrollo");
await prueba("API REST de desarrollo con la secret key", async () => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/negocios?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});
await prueba("Postgres de desarrollo por el CLI ligado (migration list)", () => {
  const salida = corre("node", [CLI, "migration", "list"], 90000);
  return `${(salida.match(/\d{14}/g) || []).length / 2 | 0} migraciones`;
});

console.log("\nProducción (solo lectura)");
let llaveProd = "";
await prueba("CLI de Supabase con sesión (api-keys de producción)", () => {
  const llaves = JSON.parse(corre("node", [CLI, "projects", "api-keys", "--project-ref", PROD, "-o", "json"]));
  // La sb_secret_ que devuelve esta API viene truncada: la que sirve es la legacy service_role.
  llaveProd = llaves.find((k) => k.name === "service_role" && k.type === "legacy")?.api_key ?? "";
  if (!llaveProd) throw new Error("no vino la llave service_role legacy");
  secretos.push(llaveProd);
});
await prueba("API REST de producción (conteo de clientes)", async () => {
  if (!llaveProd) throw new Error("sin llave (ver arriba)");
  const r = await fetch(`https://${PROD}.supabase.co/rest/v1/clientes?select=id`, {
    method: "HEAD",
    headers: { apikey: llaveProd, Authorization: `Bearer ${llaveProd}`, Prefer: "count=exact" },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return `${r.headers.get("content-range")?.split("/")[1] ?? "?"} clientes`;
});
await prueba("Postgres de producción (select 1, lo que usa el despliegue)", async () => {
  const c = new pg.Client({ connectionString: env.LUDOGTEKA_PROD_DB_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  try {
    await c.query("select 1");
  } finally {
    await c.end();
  }
});

console.log("\nHerramientas");
await prueba("CLI de Vercel con sesión (vercel whoami)", () => {
  const args = ["whoami", ...(env.VERCEL_TOKEN ? ["--token", env.VERCEL_TOKEN] : [])];
  return corre("vercel", args).trim().split("\n").pop();
});
await prueba("gh con sesión (para abrir y fusionar el PR del despliegue)", () => {
  corre("gh", ["auth", "status"]);
});
await prueba("Playwright abre Chromium", async () => {
  const navegador = await abrirNavegador();
  const version = navegador.version();
  await navegador.close();
  return version;
});

console.log(fallas ? `\n${fallas} comprobación(es) fallaron.\n` : "\nTodo en orden.\n");
process.exit(fallas ? 1 : 0);
