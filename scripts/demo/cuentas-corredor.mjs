// Las cuentas del CORREDOR de tutoriales en el demo de DESARROLLO (Patitas & Co.): siempre con escritura.
//
//   node scripts/demo/cuentas-corredor.mjs        (lo llama sembrar-demo.mjs al final; idempotente)
//
// «Ver demo» entra con las cuentas de CUENTAS_DEMO (src/lib/demo/cuentas.ts), que quedan en SOLO LECTURA. El motor de
// tutoriales no las usa: graba con estas cuentas gemelas (mismo nombre y mismo rol, otro correo), que nunca se ponen en
// solo lectura. Así no hace falta desbloquear nada mientras se graba y el visitante no puede escribir jamás.
// Los dueños del portal no tienen gemelo (ver abajo). Los médicos del corredor (demo.mvz y demo.mvz2) los crea sembrar-veterinaria.mjs y también son de escritura.
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (process.argv.includes("--prod")) throw new Error("Las cuentas del corredor son SOLO de desarrollo.");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Solo el proyecto de desarrollo.");
const sin = { auth: { persistSession: false, autoRefreshToken: false } };
const A = createClient(URL, env.SUPABASE_SECRET_KEY, sin);
const { data: neg } = await A.from("negocios").select("id, plan").eq("slug", "patitasyco").is("deleted_at", null).maybeSingle();
if (!neg || neg.plan !== "demo") throw new Error("No hay un negocio demo «patitasyco».");
const NEG = neg.id;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { ...sin, global: { headers: { "x-negocio-id": NEG } } });
const ok = (t) => console.log(`  ✔ ${t}`);
const exigir = (r, t) => { if (r.error) throw new Error(`${t}: ${r.error.message}`); return r.data; };

async function cuenta(email, nombre) {
  const { data: existente } = await A.rpc("usuario_por_email", { p_email: email });
  const id = existente ?? exigir(await A.auth.admin.createUser({ email, password: `Corredor-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: nombre } }), `crear ${email}`).user.id;
  exigir(await A.from("profiles").update({ nombre_completo: nombre }).eq("id", id), `nombre ${email}`);
  return id;
}
const membresia = async (id) => (await A.from("membresias").select("rol").eq("profile_id", id).eq("negocio_id", NEG).is("deleted_at", null).maybeSingle()).data;
const nombreDe = async (email) => {
  const { data: id } = await A.rpc("usuario_por_email", { p_email: email });
  if (!id) throw new Error(`Falta la cuenta ${email}: corre antes sembrar-demo.mjs`);
  return (await A.from("profiles").select("nombre_completo").eq("id", id).single()).data.nombre_completo;
};

console.log("Cuentas del corredor (siempre con escritura)");
for (const [clave, rol] of [["admin", "admin"], ["recepcion", "recepcion"], ["estetica", "estetica"]]) {
  const nombre = await nombreDe(`demo.${clave}@peludesk.mx`);
  const id = await cuenta(`tutoriales.${clave}@peludesk.mx`, nombre);
  if (!(await membresia(id))) {
    if (rol === "admin") exigir(await A.rpc("agregar_admin_negocio", { p_negocio_id: NEG, p_profile_id: id }), "admin");
    else exigir(await S.rpc("asignar_rol_staff", { p_user_id: id, p_rol: rol, p_nombre_completo: nombre }), `rol ${clave}`);
  }
  exigir(await S.from("membresias").update({ solo_lectura: false }).eq("profile_id", id).eq("negocio_id", NEG), `abrir ${clave}`);
  ok(`${clave}: tutoriales.${clave}@peludesk.mx (${nombre})`);
}
// Dueños del portal: NO hay gemelos (una cuenta por cliente: `membresias_cliente_una_cuenta`). El corredor usa las mismas cuentas
// que «Ver demo» y las abre SOLO mientras graba un video de dueño (tutoriales.mjs), volviéndolas a cerrar al terminar.
