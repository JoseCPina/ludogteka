import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
const PROD = process.argv.includes("--prod");
let url, key;
if (PROD) { const keys = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", "xdsxjhytggpsgrmfuuff", "-o", "json"], { encoding: "utf8" })); url = "https://xdsxjhytggpsgrmfuuff.supabase.co"; key = keys.find((k) => k.name === "service_role" && String(k.api_key).startsWith("eyJ"))?.api_key; }
else { const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })); url = env.NEXT_PUBLIC_SUPABASE_URL; key = env.SUPABASE_SECRET_KEY; }
const S = createClient(url, key, { auth: { persistSession: false } });
const { data: [d] } = await S.from("negocios").select("id").eq("plan", "demo");
const N = createClient(url, key, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": d.id } } });
const dia = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(iso));
const cuenta = (rows, f) => { const m = {}; for (const r of rows) { const k = `${dia(r[f])} ${r.estado}`; m[k] = (m[k] ?? 0) + 1; } return m; };
const { data: ce } = await N.from("citas_estetica").select("inicio, estado").eq("negocio_id", d.id).is("deleted_at", null).gte("inicio", "2026-10-15").order("inicio");
const { data: vc } = await N.from("vet_citas").select("inicia_at, estado, medico_id, perro_id").eq("negocio_id", d.id).is("deleted_at", null).order("inicia_at");
const { data: vco } = await N.from("vet_consultas").select("atendida_at, estado").eq("negocio_id", d.id).order("atendida_at");
const { data: med } = await N.from("medicos_veterinarios").select("id, profile_id").eq("negocio_id", d.id).is("deleted_at", null);
const { count: perros } = await N.from("perros").select("id", { count: "exact", head: true }).eq("negocio_id", d.id).is("deleted_at", null);
console.log(PROD ? "PROD" : "DEV", { perros, medicos: med.length });
console.log("estetica", cuenta(ce, "inicio")); console.log("vet_citas", cuenta(vc, "inicia_at")); console.log("vet_consultas", cuenta(vco, "atendida_at"));
