// Uso: node scripts/db/limpiar-dev.mjs [--revisar | --aplicar] [--compactar] [--sin-mantenimiento] [--sin-indices]
//
// Deja SANA la base de DESARROLLO (sgfolltpvktbsiisfuzq). Nunca toca producción:
// la API de gestión se abre con clienteApi(DEV) y .env.local tiene que apuntar a
// desarrollo. Sin --aplicar (o con --revisar) solo dice qué haría.
//
//   1. Diagnóstico: tamaño, tablas más grandes, filas muertas, consultas más lentas.
//   2. Negocios: borra TODOS menos los de CONSERVAR (los que usan las auditorías,
//      la QA externa y el demo vigente), en cascada por negocio_id, con la misma
//      lógica que plataforma_eliminar_negocio pero sin sus guardas de producción
//      (aquí hay negocios «activos» y con cobros de prueba de Stripe/Mercado Pago).
//      Antes, sus archivos de Storage; después, las cuentas de Auth que quedan sin
//      ningún negocio (nunca las de la administración de la plataforma).
//   3. Bitácoras que solo sirven en producción (IndexNow, visitas y eventos de
//      prospectos, mensajes y uso de IA del bot, entregas de WhatsApp, eventos de
//      Stripe, registro de ediciones, corridas, resúmenes) y sesiones de Auth de
//      más de 2 días. Los prospectos se recortan a una muestra de 500.
//   4. Mantenimiento: VACUUM FULL + REINDEX de las tablas con filas muertas,
//      ANALYZE general, y quita los índices sin uso que no respaldan una llave
//      foránea, un unique ni una restricción de exclusión (solo en desarrollo).
//
// La API de gestión corre como postgres: es la excepción autorizada para
// desarrollo (como scripts/nube/migrar-dev.mjs). Nunca SQL suelto en producción.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { clienteApi, DEV } from "../nube/migraciones-api.mjs";
import { CONSERVAR, sqlBorrarNegocios } from "./negocios-dev.mjs";

const aplicar = process.argv.includes("--aplicar");
const sinMantenimiento = process.argv.includes("--sin-mantenimiento");
const sinIndices = process.argv.includes("--sin-indices");



/** Bitácoras y eventos que en desarrollo solo estorban. */
const BITACORAS = [
  "indexnow_envios", "indexnow_urls", "prospectos_visitas", "prospectos_eventos", "prospectos_contactos",
  "wa_mensajes", "wa_uso_ia", "wa_entregas", "wa_hilos", "eventos_stripe", "registro_ediciones",
  "resumenes_diarios", "prospeccion_corridas", "meta_audiencias_corridas", "meta_audiencias_miembros", "avisos_operador",
];
const MUESTRA_PROSPECTOS = 500;
/** Índices que en desarrollo no se usan porque su camino solo corre en producción: no se quitan. */
const SOLO_PRODUCCION = [
  "integraciones_cobro_cuenta_idx", // webhook de Mercado Pago (negocio por la cuenta conectada)
  "mp_ordenes_payment_ref_idx", // reembolsos hechos en el panel de Mercado Pago
  "vet_dictados_audio_idx", // tarea /api/cron/dictados
  "media_perro_por_vencer_idx", // tarea /api/cron/reportes-archivos
  "avisos_operador_pendientes", // tarea /api/cron/avisos
  "prospectos_marca", // calidad de prospectos (tarea de las 7:00)
];
const LOTE_NEGOCIOS = 20;

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(DEV)) {
  console.error("✘ .env.local no apunta al proyecto de desarrollo. No se sigue.");
  process.exit(1);
}
const cli = await clienteApi(DEV);
const S = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
// La API de gestión limita las peticiones por minuto (429): se espera y se reintenta.
async function sql(q, tope = 300000) {
  for (let intento = 0; ; intento++) {
    try {
      return await cli.sql(q, tope);
    } catch (e) {
      if (e.status !== 429 || intento >= 6) throw e;
      await new Promise((r) => setTimeout(r, 5000 * 2 ** intento));
    }
  }
}
const lit = (a) => `array[${a.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(",")}]`;
const titulo = (t) => console.log(`\n== ${t}`);
console.log(`Base de desarrollo (${cli.nombre}) · ${aplicar ? "SE APLICA" : "solo revisión (sin --aplicar)"}`);

// ------------------------------------------------------------------ 1. Diagnóstico
async function diagnostico(etiqueta) {
  titulo(`Diagnóstico ${etiqueta}`);
  const [g] = await sql(`select pg_database_size(current_database()) bytes,
    (select count(*) from public.negocios) negocios, (select count(*) from auth.users) cuentas,
    (select sum(n_live_tup) from pg_stat_user_tables where schemaname='public') filas,
    (select sum(n_dead_tup) from pg_stat_user_tables) muertas`);
  console.log(`  tamaño ${(g.bytes / 1048576).toFixed(1)} MB · ${g.negocios} negocios · ${g.cuentas} cuentas · ${g.filas} filas en public · ${g.muertas} filas muertas`);
  const top = await sql(`select relname t, n_live_tup vivas, n_dead_tup muertas, pg_size_pretty(pg_total_relation_size(relid)) sz
    from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 8`);
  console.log("  más grandes: " + top.map((r) => `${r.t} ${r.sz} (${r.vivas}/${r.muertas} muertas)`).join(" · "));
  try {
    const lentas = await sql(`select round(mean_exec_time::numeric) mean_ms, round(max_exec_time::numeric) max_ms, calls,
      coalesce(substring(regexp_replace(query,'\\s+',' ','g') from '"public"\\."([a-z_]+)"'), left(regexp_replace(query,'\\s+',' ','g'),60)) q
      from extensions.pg_stat_statements where calls > 20 order by mean_exec_time desc limit 5`);
    console.log("  más lentas (promedio): " + lentas.map((r) => `${r.q} ${r.mean_ms} ms (máx ${r.max_ms}, ${r.calls} veces)`).join(" · "));
  } catch {}
  return g;
}
const antes = await diagnostico("antes");

// ------------------------------------------------------------------ 2. Negocios
titulo("Negocios de auditoría y sembrados viejos");
const negocios = await sql(`select id, slug, nombre, plan, principal_id is not null sucursal from public.negocios
  where not (slug = any(${lit(CONSERVAR)})) order by (principal_id is null), created_at`);
const conservados = await sql(`select slug from public.negocios where slug = any(${lit(CONSERVAR)})`);
console.log(`  se conservan ${conservados.length}: ${conservados.map((r) => r.slug).join(", ")}`);
const porPrefijo = {};
for (const n of negocios) { const p = n.slug.replace(/-?[a-z]{0,3}\d+[a-z0-9]*$/, ""); porPrefijo[p] = (porPrefijo[p] ?? 0) + 1; }
console.log(`  se borran ${negocios.length}: ` + Object.entries(porPrefijo).sort((a, b) => b[1] - a[1]).map(([p, k]) => `${p} ×${k}`).join(", "));
const ids = negocios.map((n) => n.id);

let filasNegocios = 0;
if (ids.length) {
  const tablas = (await sql(`select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname<>'negocios'
      and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='negocio_id' and not a.attisdropped)`)).map((r) => r.t);
  const conteo = await sql(tablas.map((t) => `select '${t}' t, count(*)::int n from public."${t}" where negocio_id = any(${lit(ids)}::uuid[])`).join(" union all "));
  filasNegocios = conteo.reduce((s, r) => s + r.n, 0);
  console.log(`  ${filasNegocios} filas de esos negocios en ${conteo.filter((r) => r.n > 0).length} tablas (las de más: ${conteo.sort((a, b) => b.n - a.n).slice(0, 6).map((r) => `${r.t} ${r.n}`).join(", ")})`);
}

// Archivos de Storage de esos negocios (por {negocio}/… o por {cliente}/… en perros-archivos).
const objetos = ids.length ? await sql(`select bucket_id, name from storage.objects
  where split_part(name,'/',1) = any(${lit(ids)})
     or (bucket_id = 'perros-archivos' and split_part(name,'/',1) in (select id::text from public.clientes where negocio_id = any(${lit(ids)}::uuid[])))`) : [];
console.log(`  ${objetos.length} archivos de Storage`);

// Cuentas que se quedarían sin ningún negocio vivo (nunca la administración de la plataforma).
const cuentasHuerfanas = async () => (await sql(`select u.id from auth.users u
  where not exists (select 1 from public.membresias m join public.negocios n on n.id = m.negocio_id
                    where m.profile_id = u.id and m.deleted_at is null and not (n.id = any(${lit(ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])}::uuid[])))
    and not exists (select 1 from public.plataforma_admins a where a.profile_id = u.id)
    and coalesce(u.email, '') not like '%@peludesk.mx'`)).map((r) => r.id);
const huerfanas = await cuentasHuerfanas();
console.log(`  ${huerfanas.length} cuentas de Auth quedarían sin negocio`);

// ------------------------------------------------------------------ 3. Bitácoras
titulo("Bitácoras y sesiones");
const existentes = new Set((await sql(`select tablename from pg_tables where schemaname='public' and tablename = any(${lit(BITACORAS)})`)).map((r) => r.tablename));
const bitacoras = BITACORAS.filter((t) => existentes.has(t));
const filasBit = await sql(bitacoras.map((t) => `select '${t}' t, count(*)::int n from public."${t}"`).join(" union all "));
const totalBit = filasBit.reduce((s, r) => s + r.n, 0);
console.log(`  ${totalBit} filas: ` + filasBit.filter((r) => r.n).map((r) => `${r.t} ${r.n}`).join(", "));
const [pros] = await sql(`select count(*)::int n from public.prospectos`);
const sobranProspectos = Math.max(0, pros.n - MUESTRA_PROSPECTOS);
console.log(`  prospectos: ${pros.n} (se quedan ${Math.min(pros.n, MUESTRA_PROSPECTOS)}, se borran ${sobranProspectos})`);
const [ses] = await sql(`select count(*)::int n from auth.sessions where coalesce(updated_at, created_at) < now() - interval '2 days'`);
console.log(`  ${ses.n} sesiones de Auth de más de 2 días`);

// ------------------------------------------------------------------ 4. Índices sin uso
titulo("Índices sin uso");
const sinUso = sinIndices ? [] : await sql(`select s.relname t, s.indexrelname i, pg_relation_size(s.indexrelid) bytes
  from pg_stat_user_indexes s join pg_index x on x.indexrelid = s.indexrelid
  where s.schemaname = 'public' and s.idx_scan = 0 and not x.indisunique and not x.indisprimary
    and not (s.indexrelname = any(${lit(SOLO_PRODUCCION)}))
    and not exists (select 1 from pg_constraint c where c.conindid = s.indexrelid)
    and not exists (select 1 from pg_constraint c where c.contype = 'f' and c.conrelid = x.indrelid
                    and c.conkey::int2[] = (string_to_array(x.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)])
  order by 3 desc`);
console.log(sinUso.length ? `  ${sinUso.length} (${(sinUso.reduce((s, r) => s + Number(r.bytes), 0) / 1024).toFixed(0)} kB): ${sinUso.map((r) => `${r.t}.${r.i}`).join(", ")}` : "  ninguno");

if (!aplicar) {
  console.log("\nRevisión terminada. No se tocó nada. Para hacerlo: el mismo comando con --aplicar.");
  process.exit(0);
}

// ================================================================== APLICAR
titulo("Aplicando");
// Storage primero (si la base se borra antes, ya no se sabe de quién era cada archivo).
for (const bucket of [...new Set(objetos.map((o) => o.bucket_id))]) {
  const nombres = objetos.filter((o) => o.bucket_id === bucket).map((o) => o.name);
  for (let i = 0; i < nombres.length; i += 100) {
    const { error } = await S.storage.from(bucket).remove(nombres.slice(i, i + 100));
    if (error) console.log(`  ⚠ Storage ${bucket}: ${error.message}`);
  }
}
console.log(`  ✔ ${objetos.length} archivos de Storage`);

// La base, por lotes (las sucursales primero: apuntan a su principal).

for (let i = 0; i < ids.length; i += LOTE_NEGOCIOS) {
  await sql(sqlBorrarNegocios(ids.slice(i, i + LOTE_NEGOCIOS)));
  process.stdout.write(`\r  negocios borrados: ${Math.min(i + LOTE_NEGOCIOS, ids.length)}/${ids.length}`);
}
console.log(`\n  ✔ ${ids.length} negocios y ${filasNegocios} filas suyas`);

// Cuentas sin ningún negocio (después de borrar, con la lista recalculada).
const porBorrar = await cuentasHuerfanas();
let cuentasBorradas = 0;
for (const id of porBorrar) {
  const { error } = await S.auth.admin.deleteUser(id);
  if (error) console.log(`  ⚠ cuenta …${id.slice(-6)}: ${error.message}`); else cuentasBorradas++;
}
console.log(`  ✔ ${cuentasBorradas} cuentas de Auth sin negocio`);

// Bitácoras (DELETE, no TRUNCATE … CASCADE: no arrastra nada que no se haya pedido).
await sql(`do $$ declare v_t text; begin
  foreach v_t in array ${lit(bitacoras)} loop
    begin execute format('delete from public.%I', v_t);
    exception when others then
      execute format('alter table public.%I disable trigger user', v_t);
      execute format('delete from public.%I', v_t);
      execute format('alter table public.%I enable trigger user', v_t);
    end;
  end loop; end $$`);
console.log(`  ✔ ${totalBit} filas de bitácoras`);
if (sobranProspectos > 0) {
  await sql(`delete from public.prospectos where id in (select id from public.prospectos order by created_at desc offset ${MUESTRA_PROSPECTOS})`);
  console.log(`  ✔ ${sobranProspectos} prospectos (quedan ${MUESTRA_PROSPECTOS})`);
}
await sql(`delete from auth.sessions where coalesce(updated_at, created_at) < now() - interval '2 days'`);
console.log(`  ✔ ${ses.n} sesiones viejas`);

// Índices sin uso (solo desarrollo: producción conserva los suyos).
for (const r of sinUso) await sql(`drop index if exists public."${r.i}"`);
if (sinUso.length) console.log(`  ✔ ${sinUso.length} índices sin uso quitados`);

// Mantenimiento: VACUUM no corre dentro de una transacción, va de una en una.
if (!sinMantenimiento) {
  // n_dead_tup se actualiza tarde: después de un borrado grande no lo refleja todavía. Por eso,
  // si esta corrida borró algo, se recompacta toda tabla de más de 64 kB; si no, solo las que
  // ya traen filas muertas. Las de auth y storage no son de postgres: VACUUM FULL las salta.
  const borroAlgo = ids.length + totalBit + sobranProspectos + ses.n > 0 || process.argv.includes("--compactar");
  const conBasura = await sql(`select schemaname s, relname t from pg_stat_user_tables
    where schemaname = 'public' and (${borroAlgo ? "pg_total_relation_size(relid) > 65536 or " : ""}(n_dead_tup > 50 and n_dead_tup > n_live_tup * 0.1))
    order by pg_total_relation_size(relid) desc`);
  // VACUUM no corre dentro de una transacción, pero una sola sentencia acepta varias tablas, y
  // VACUUM FULL reescribe la tabla y reconstruye sus índices (eso es el REINDEX). Por lotes, para
  // no gastar el tope de peticiones de la API.
  for (let i = 0; i < conBasura.length; i += 25) {
    const lote = conBasura.slice(i, i + 25).map((r) => `"${r.s}"."${r.t}"`).join(", ");
    try {
      await sql(`vacuum full ${lote}`, 600000);
    } catch (e) { console.log(`  ⚠ VACUUM FULL (${lote.slice(0, 80)}…): ${e.message.slice(0, 120)}`); }
  }
  console.log(`  ✔ VACUUM FULL (reescribe tabla e índices) de ${conBasura.length} tablas`);
  await sql("analyze");
  console.log("  ✔ ANALYZE");
  try { await sql("select extensions.pg_stat_statements_reset()"); console.log("  ✔ estadísticas de consultas reiniciadas (para medir desde cero)"); } catch {}
}

const despues = await diagnostico("después");
console.log(`\nResultado: ${(antes.bytes / 1048576).toFixed(1)} MB → ${(despues.bytes / 1048576).toFixed(1)} MB · negocios ${antes.negocios} → ${despues.negocios} · cuentas ${antes.cuentas} → ${despues.cuentas} · filas en public ${antes.filas} → ${despues.filas}`);
