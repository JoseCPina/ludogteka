// Migraciones por HTTPS con la API de gestión de Supabase: el mismo motor
// para desarrollo (scripts/nube/migrar-dev.mjs) y para producción (solo a
// través de scripts/desplegar-produccion.mjs, que además respalda, cuenta
// antes y después y verifica). Existe porque en la nube el proxy de la
// sesión solo deja pasar HTTPS: `supabase db push` no alcanza Postgres.
//
// Hace lo mismo que `supabase db push` (probado contra lo que el CLI ya
// había registrado: 208 de 208 migraciones idénticas, `--comparar`):
//   - compara supabase/migrations contra supabase_migrations.schema_migrations;
//     una versión en la base que no está en el repo detiene todo (el CLI
//     también) y una pendiente más vieja que la última aplicada solo pasa
//     con incluirTodas (el --include-all);
//   - aplica las pendientes en orden de versión, cada una en UNA transacción
//     junto con su registro (version, name, statements partidas igual que el
//     CLI por sentencias.mjs). Si una falla, se deshace completa, no queda
//     registrada y no se toca ninguna de las siguientes.
// La consulta corre como `postgres`, igual que el CLI.
//
// Producción solo se abre con { produccion: true }, y eso lo pasa
// únicamente el script de despliegue (autorizado por el dueño el 28 de
// septiembre de 2026, ver CLAUDE.md).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { partirSentencias } from "./sentencias.mjs";

export const DEV = "sgfolltpvktbsiisfuzq";
export const PROD = "xdsxjhytggpsgrmfuuff";
export const DIR_MIGRACIONES = "supabase/migrations";
const TOPE_MIGRACION_MS = 5 * 60 * 1000;

export class ErrorMigracion extends Error {}

/** Cliente de la API de gestión para UN proyecto. Nunca imprime el token. */
export async function clienteApi(ref, { produccion = false } = {}) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new ErrorMigracion("falta SUPABASE_ACCESS_TOKEN (variable del entorno).");
  if (ref !== DEV && ref !== PROD) throw new ErrorMigracion(`proyecto desconocido: ${ref}`);
  if (ref === PROD && !produccion) throw new ErrorMigracion("producción solo se migra con npm run desplegar.");
  const limpio = (t) => String(t).split(token).join("[oculto]").slice(0, 2000);

  async function api(ruta, init = {}) {
    const r = await fetch(`https://api.supabase.com/v1${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(init.tope ?? 60000),
    });
    const texto = await r.text();
    if (!r.ok) {
      let msg = texto;
      try {
        msg = JSON.parse(texto).message ?? texto;
      } catch {}
      const e = new ErrorMigracion(`HTTP ${r.status}: ${limpio(msg)}`);
      e.status = r.status;
      throw e;
    }
    return texto ? JSON.parse(texto) : null;
  }
  const sql = (query, tope) => api(`/projects/${ref}/database/query`, { method: "POST", body: JSON.stringify({ query }), tope });

  // La API confirma de qué proyecto se trata antes de hacer nada.
  const proyecto = await api(`/projects/${ref}`);
  const esProd = /prod/i.test(proyecto.name ?? "");
  if (proyecto.id !== ref || (ref === DEV && esProd) || (ref === PROD && !esProd)) {
    throw new ErrorMigracion(`la API devolvió otro proyecto (${proyecto.id} · ${proyecto.name}). No se sigue.`);
  }
  return { ref, nombre: proyecto.name, api, sql };
}

/** Las migraciones del repo, en orden de versión. */
export function migracionesLocales(dir = DIR_MIGRACIONES) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => {
      const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(f);
      return { version, name, archivo: path.join(dir, f) };
    });
}

/** Qué hay en la base y qué falta, con las mismas reglas que el CLI. */
export async function estadoMigraciones(cli, { incluirTodas = false, conSentencias = false } = {}) {
  const locales = migracionesLocales();
  const hayTabla = (await cli.sql("select to_regclass('supabase_migrations.schema_migrations') is not null as hay"))[0].hay;
  const remotas = hayTabla
    ? await cli.sql(`select version, name${conSentencias ? ", statements" : ""} from supabase_migrations.schema_migrations order by version`)
    : [];
  const aplicadas = new Set(remotas.map((r) => r.version));
  const huerfanas = remotas.filter((r) => !locales.some((l) => l.version === r.version));
  const pendientes = locales.filter((l) => !aplicadas.has(l.version));
  const ultima = remotas.at(-1)?.version ?? "";
  const viejas = pendientes.filter((p) => p.version < ultima);
  let problema = null;
  if (huerfanas.length) {
    problema = `la base tiene migraciones que no están en ${DIR_MIGRACIONES}: ${huerfanas.map((r) => r.version).join(", ")} (el CLI se detiene igual: "Remote migration versions not found in local migrations directory").`;
  } else if (viejas.length && !incluirTodas) {
    problema = `hay pendientes más viejas que la última aplicada (${ultima}): ${viejas.map((v) => v.version).join(", ")}. Igual que el --include-all del CLI, se aplican solo pidiéndolo.`;
  }
  return { locales, remotas, hayTabla, pendientes, huerfanas, viejas, problema };
}

// Una cadena $etiqueta$…$etiqueta$ que no aparece en el texto.
function literal(texto) {
  let tag;
  do tag = `$m${crypto.randomBytes(6).toString("hex")}$`;
  while (texto.includes(tag));
  return `${tag}${texto}${tag}`;
}

export async function registrada(cli, version) {
  const r = await cli.sql(`select 1 from supabase_migrations.schema_migrations where version = ${literal(version)}`);
  return r.length > 0;
}

/**
 * Aplica las pendientes, una por una. Al primer error lanza ErrorMigracion
 * diciendo si la base alcanzó a registrarla (respuesta perdida) o no.
 * Devuelve las versiones aplicadas.
 */
export async function aplicarPendientes(cli, pendientes, { log = (t) => process.stdout.write(t) } = {}) {
  const hechas = [];
  const { hayTabla } = await estadoMigraciones(cli, { incluirTodas: true });
  if (!hayTabla) {
    // Misma tabla que crea el CLI si no existe (pkg/migration/history.go).
    await cli.sql(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;`);
  }
  for (const p of pendientes) {
    const sentencias = partirSentencias(fs.readFileSync(p.archivo, "utf8"));
    // Un begin/commit propio partiría la transacción: el registro dejaría de ser atómico.
    const control = sentencias.find((s) => /^(begin|commit|rollback|end|start\s+transaction)\b/i.test(s.replace(/^(\s*--[^\n]*\n)*/, "").trim()));
    if (control) throw new ErrorMigracion(`${p.version}_${p.name} trae control de transacción propio (${control.slice(0, 40)}…). Quítalo de la migración.`);
    // Una sola consulta de varias sentencias = una transacción implícita en
    // Postgres (como el batch del CLI): si algo falla, se deshace todo, registro incluido.
    const consulta =
      [
        ...sentencias,
        `insert into supabase_migrations.schema_migrations (version, name, statements) values (${literal(p.version)}, ${literal(p.name)}, array[${sentencias.map(literal).join(", ")}]::text[])`,
      ].join("\n;\n") + "\n;";
    log(`\n→ ${p.version}_${p.name} (${sentencias.length} sentencias) … `);
    try {
      await cli.sql(consulta, TOPE_MIGRACION_MS);
    } catch (e) {
      // Con un corte de red o tope la base pudo terminarla: se pregunta, no se supone.
      let quedo = null;
      try {
        quedo = await registrada(cli, p.version);
      } catch {}
      log("falló\n");
      const err = new ErrorMigracion(
        `${p.version}_${p.name}: ${e.message}\n` +
          (quedo === true
            ? "OJO: la respuesta se perdió pero la base SÍ la registró (terminó del lado del servidor)."
            : `No quedó registrada${quedo === null ? " (no se pudo confirmar)" : ""}: la transacción se deshizo. No se aplicó ninguna de las siguientes.`)
      );
      err.aplicadas = hechas;
      err.registrada = quedo;
      throw err;
    }
    if (!(await registrada(cli, p.version))) {
      const err = new ErrorMigracion(`${p.version} respondió bien pero no aparece en schema_migrations. Se detiene.`);
      err.aplicadas = hechas;
      throw err;
    }
    log("aplicada y registrada");
    hechas.push(p.version);
  }
  if (pendientes.length) log("\n");
  return hechas;
}

/** auditoria_frontera(): tiene que salir vacía después de cualquier migración. */
export async function auditoriaFrontera(cli) {
  return cli.sql("select * from public.auditoria_frontera()");
}
