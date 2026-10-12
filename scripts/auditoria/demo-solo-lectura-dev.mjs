// Solo lectura del demo (desarrollo): el visitante de «Ver demo» (CUENTAS_DEMO) no escribe nada; las cuentas del corredor
// (tutoriales.*, demo.mvz, demo.mvz2) sí. Se corre después de sembrar-demo.mjs. Con JWT reales y la API de siempre.
//   node scripts/auditoria/demo-solo-lectura-dev.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const sin = { auth: { persistSession: false, autoRefreshToken: false } };
const A = createClient(URL, env.SUPABASE_SECRET_KEY, sin);
const { data: neg } = await A.from("negocios").select("id, plan").eq("slug", "patitasyco").single();
if (neg.plan !== "demo") throw new Error("No es el demo");
const NEG = neg.id;
let fallos = 0;
const comprobar = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };

async function como(email) {
  const { data: link, error } = await A.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const { data: s, error: e2 } = await createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sin).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (e2) throw new Error(`${email}: ${e2.message}`);
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...sin, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": NEG } } });
}
async function bandera(email) {
  const { data: id } = await A.rpc("usuario_por_email", { p_email: email });
  if (!id) return undefined;
  return (await A.from("membresias").select("solo_lectura").eq("profile_id", id).eq("negocio_id", NEG).is("deleted_at", null).maybeSingle()).data?.solo_lectura;
}

console.log("1. La marca en la base");
const VISITANTE = ["demo.admin@peludesk.mx", "demo.recepcion@peludesk.mx", "demo.estetica@peludesk.mx", "demo.veterinaria@peludesk.mx", "t4420000201@telefono.ludogteka.mx"];
const CORREDOR = ["tutoriales.admin@peludesk.mx", "tutoriales.recepcion@peludesk.mx", "tutoriales.estetica@peludesk.mx", "demo.mvz@peludesk.mx", "demo.mvz2@peludesk.mx"];
for (const e of VISITANTE) comprobar((await bandera(e)) === true, `${e}: solo lectura`);
for (const e of CORREDOR) comprobar((await bandera(e)) === false, `${e}: con escritura`);

console.log("2. Escribir con cada una (JWT real)");
const tel = `44299${String(Date.now()).slice(-5)}`;
const intento = (api, nombre) => api.from("clientes").insert({ nombre, telefono: tel, negocio_id: NEG });
for (const e of ["demo.admin@peludesk.mx", "demo.recepcion@peludesk.mx"]) {
  const r = await intento(await como(e), "Visita que no debe quedar");
  comprobar(Boolean(r.error) && /solo lectura|42501/i.test(`${r.error.message} ${r.error.code}`), `${e} NO puede escribir (${r.error?.message?.slice(0, 60) ?? "¡escribió!"})`);
}
const tu = await como("tutoriales.admin@peludesk.mx");
const r2 = await intento(tu, "Prueba del corredor");
comprobar(!r2.error, `tutoriales.admin SÍ escribe (${r2.error?.message ?? "ok"})`);
await A.from("clientes").delete().eq("negocio_id", NEG).eq("telefono", tel);
const rv = await (await como("demo.mvz@peludesk.mx")).from("clientes").insert({ nombre: "Prueba mvz", telefono: tel + "1", negocio_id: NEG });
comprobar(!rv.error || !/solo lectura/i.test(rv.error.message), "demo.mvz no se topa con «solo lectura»");
await A.from("clientes").delete().eq("negocio_id", NEG).eq("telefono", tel + "1");

console.log(fallos ? `\n✘ ${fallos} fallo(s)` : "\n✔ Sin hallazgos.");
process.exit(fallos ? 1 : 0);
