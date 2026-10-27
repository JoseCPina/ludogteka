// Mascotas con especie gato que tienen una raza de perro (QA S39: antes de `razas.especie` el alta solo ofrecía razas de
// perro). Solo lee. Las repara la migración 20261202002800 (raza de perro definida → «Doméstico de pelo corto»; mestizo,
// criollo o desconocida → «Mestizo» de gato).
//
//   node scripts/auditoria/gatos-con-raza-de-perro.mjs           desarrollo
//   node scripts/auditoria/gatos-con-raza-de-perro.mjs --prod    producción (llave del CLI, nunca se imprime)
// Sale con 1 si encuentra alguna.
import { createClient } from "@supabase/supabase-js";
import { URL_PROD, llavesProd } from "../lib/prod.mjs";
import { todas } from "../lib/paginar.mjs";

const PROD = process.argv.includes("--prod");
let c;
if (PROD) {
  c = createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false } });
} else {
  process.loadEnvFile(".env.local");
  c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}

const { data: razas, error: e1 } = await todas(() => c.from("razas").select("id, nombre, especie, es_desconocida").order("id"));
const porId = new Map(razas.map((r) => [r.id, r]));
const { data: gatos, error: e2 } = await todas(() => c.from("perros").select("id, nombre, negocio_id, raza_id, deleted_at").eq("especie", "gato").not("raza_id", "is", null).order("id"));
if (e1 || e2) throw new Error((e1 || e2).message);
const malos = gatos.filter((p) => porId.get(p.raza_id)?.especie === "perro");
const mestizo = (r) => r.es_desconocida || /mestiz|criollo|cruza/i.test(r.nombre);
console.log(`${PROD ? "Producción" : "Desarrollo"}: ${gatos.length} gato(s) con raza; ${malos.length} con raza de perro.`);
for (const p of malos) {
  const r = porId.get(p.raza_id);
  console.log(`  ${p.id}  «${p.nombre}»  negocio ${p.negocio_id}${p.deleted_at ? " (dado de baja)" : ""}: ${r.nombre} → ${mestizo(r) ? "Mestizo" : "Doméstico de pelo corto"}`);
}
process.exit(malos.length ? 1 : 0);
