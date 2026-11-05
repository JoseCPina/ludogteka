// A petición de un negocio, la administración de PeluDesk da por revisadas TODAS sus alertas atrasadas anteriores a
// una fecha (hora de ese negocio): tarjetas manuales por revisar, contratos pendientes de firma, llegadas atrasadas,
// links de pago sin resolver y conciliación. Es el mismo cierre que el botón «Dar por revisadas todas las anteriores
// a…» del panel de admin (función alertas_dar_por_revisadas_hasta, migración 20261203003800), corrido con la sesión
// real del primer admin del negocio (magic link por Auth, sin contraseña) para que la RLS, los disparadores y las
// bitácoras apliquen como en la app y quede su nombre en cada cierre con la nota que el negocio pidió.
// Amplía a scripts/plataforma/cerrar-conciliacion-hasta.mjs (que solo cubre la conciliación).
//
//   node scripts/plataforma/cerrar-alertas-hasta.mjs --negocio <slug> --hasta AAAA-MM-DD --nota "<qué se revisó y quién lo pidió>" [--prod]   (solo cuenta)
//   … --aplicar [--prod]
//
// Las llaves se leen al vuelo (CLI de Supabase en producción, .env.local en desarrollo) y nunca se imprimen ni se guardan.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = args.includes("--prod");
const APLICAR = args.includes("--aplicar");
const slug = val("--negocio");
const hasta = val("--hasta");
const nota = val("--nota");
if (!slug || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? "") || !nota || nota.trim().length < 5) {
  throw new Error("Faltan --negocio <slug>, --hasta AAAA-MM-DD y --nota \"…\" (al menos 5 letras).");
}

const REF = PROD ? "xdsxjhytggpsgrmfuuff" : "sgfolltpvktbsiisfuzq";
const URL = `https://${REF}.supabase.co`;
let servicio, anon;
if (PROD) {
  const keys = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", REF, "-o", "json"], { encoding: "utf8" }));
  servicio = keys.find((k) => k.name === "service_role" && (k.type ?? "legacy") === "legacy")?.api_key;
  anon = keys.find((k) => k.name === "anon" && (k.type ?? "legacy") === "legacy")?.api_key;
} else {
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  servicio = env.SUPABASE_SECRET_KEY;
  anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
if (!servicio || !anon) throw new Error("No pude leer las llaves.");

const S = createClient(URL, servicio, { auth: { persistSession: false } });
const { data: neg } = await S.from("negocios").select("id, nombre, slug, zona_horaria").eq("slug", slug).maybeSingle();
if (!neg) throw new Error(`No existe el negocio «${slug}».`);
const { data: adminM } = await S.from("membresias").select("profile_id").eq("negocio_id", neg.id).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1).maybeSingle();
if (!adminM) throw new Error(`${neg.nombre} no tiene admin.`);
const { data: u } = await S.auth.admin.getUserById(adminM.profile_id);
if (!u?.user?.email) throw new Error("No encontré la cuenta del admin.");
const { data: link, error: e1 } = await S.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
if (e1) throw e1;
const A0 = createClient(URL, anon, { auth: { persistSession: false } });
const { data: ses, error: e2 } = await A0.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (e2) throw e2;
const A = createClient(URL, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${ses.session.access_token}`, "x-negocio-id": neg.id } } });

console.log(`${PROD ? "PRODUCCIÓN" : "desarrollo"} · ${neg.nombre} (${neg.zona_horaria}) · anteriores al ${hasta} · con la sesión de su admin ${adminM.profile_id.slice(0, 8)}`);
const { data: conteo, error: ec } = await A.rpc("alertas_por_revisar_hasta", { p_hasta: hasta });
if (ec) throw new Error(`alertas_por_revisar_hasta: ${ec.message}`);
console.log("  por cerrar:", JSON.stringify(conteo));
const total = Object.values(conteo ?? {}).reduce((s, n) => s + Number(n), 0);
if (total === 0) { console.log("✔ No hay nada que cerrar."); process.exit(0); }
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
const { data: r, error } = await A.rpc("alertas_dar_por_revisadas_hasta", { p_hasta: hasta, p_nota: nota.trim() });
if (error) throw new Error(`alertas_dar_por_revisadas_hasta: ${error.message}`);
console.log(`✔ cerradas ${r.total}: ${JSON.stringify(r.cerradas)} · quedan sin cerrar (dinero / comprobantes): ${JSON.stringify(r.pendientes)}`);
