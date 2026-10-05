// Uso: node scripts/plataforma/eliminar-negocio.mjs <slug> --telefono <10 dígitos> [--aplicar] [--prod]
//
// Borra un negocio de prueba o suspendido POR LA FUNCIÓN DE LA PLATAFORMA
// (plataforma_eliminar_negocio), con la misma limpieza que el botón de
// /plataforma/negocios/<id> (src/lib/plataforma/eliminar-negocio.ts): Stripe,
// Storage, la base (y con ella Vault) y las cuentas de Auth que quedan sin
// negocio. Sin --aplicar solo revisa y dice qué borraría.
//
// Guarda de identidad: el slug tiene que ser de UN negocio y su teléfono de
// registro (registros_prueba) tiene que ser el que se pasa. Si algo no
// coincide, no se borra nada. Las guardas de fondo (no demo, no Ludogteka,
// solo prueba o suspendido, sin cobros reales) las pone la base.
//
// Desarrollo: lee .env.local. Producción (--prod): la llave de servicio sale al
// vuelo del CLI de Supabase (nunca se imprime). Con suscripción en Stripe hace
// falta STRIPE_SECRET_KEY en el entorno; si no está, se detiene.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const [slug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const telefono = (arg("--telefono") ?? "").replace(/\D/g, "").slice(-10);
const aplicar = process.argv.includes("--aplicar");
const prod = process.argv.includes("--prod");
if (!slug || telefono.length !== 10) {
  console.error("Uso: node scripts/plataforma/eliminar-negocio.mjs <slug> --telefono <10 dígitos> [--aplicar] [--prod]");
  process.exit(2);
}
const parar = (m) => { console.error(`✘ ${m}`); process.exit(1); };

let url, llave;
if (prod) {
  const ref = "xdsxjhytggpsgrmfuuff";
  const llaves = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" }));
  llave = llaves.find((x) => x.name === "service_role" && (x.type ?? "legacy") === "legacy").api_key;
  url = `https://${ref}.supabase.co`;
} else {
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  url = env.NEXT_PUBLIC_SUPABASE_URL;
  llave = env.SUPABASE_SECRET_KEY;
  if (url.includes("xdsxjhytggpsgrmfuuff")) parar(".env.local apunta a producción.");
}
const S = createClient(url, llave, { auth: { persistSession: false } });
console.log(`${prod ? "PRODUCCIÓN" : "desarrollo"} · ${aplicar ? "SE BORRA" : "solo revisión (sin --aplicar)"}`);

// Guarda de identidad
const { data: negocios, error: e1 } = await S.from("negocios").select("id, slug, nombre, plan, activo").eq("slug", slug);
if (e1) parar(e1.message);
if (negocios.length !== 1) parar(`El slug «${slug}» coincide con ${negocios.length} negocios. No se borra nada.`);
const n = negocios[0];
const { data: regs, error: e2 } = await S.from("registros_prueba").select("telefono").eq("negocio_id", n.id);
if (e2) parar(e2.message);
const telefonos = [...new Set((regs ?? []).map((r) => String(r.telefono).replace(/\D/g, "").slice(-10)))];
if (telefonos.length !== 1 || telefonos[0] !== telefono) parar(`El teléfono de registro de «${slug}» (${telefonos.map((t) => `…${t.slice(-4)}`).join(", ") || "ninguno"}) no es el esperado (…${telefono.slice(-4)}). No se borra nada.`);
console.log(`✔ «${n.nombre}» (${n.slug}) · plan ${n.plan} · ${n.activo ? "activo" : "suspendido"} · teléfono …${telefono.slice(-4)} coincide`);

// Qué hay que limpiar (la base ya aplica sus guardas aquí)
const { data: m, error: e3 } = await S.rpc("plataforma_negocio_a_borrar", { p_negocio_id: n.id });
if (e3) parar(e3.message);
console.log(`  clientes ${m.clientes} · archivos en Storage ${m.objetos.length} · credenciales de cobro ${m.integraciones} · Stripe: ${m.stripe.suscripciones.length} suscripciones, ${m.stripe.customers.length} clientes`);
if (!aplicar) { console.log("Revisión terminada: no se borró nada."); process.exit(0); }

// 1. Stripe
if (m.stripe.suscripciones.length || m.stripe.customers.length) {
  if (!process.env.STRIPE_SECRET_KEY) parar("Tiene suscripción o cliente en Stripe y no hay STRIPE_SECRET_KEY: no se borra nada.");
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  for (const id of m.stripe.suscripciones) { try { await stripe.subscriptions.cancel(id); } catch (e) { if (e.code !== "resource_missing") parar(`Stripe: ${e.message}`); } }
  for (const id of m.stripe.customers) {
    try {
      const c = await stripe.customers.retrieve(id);
      if (!c.deleted && c.metadata?.peludesk_negocio_id === n.id) await stripe.customers.del(id);
    } catch (e) { if (e.code !== "resource_missing") parar(`Stripe: ${e.message}`); }
  }
  console.log("✔ Stripe limpio");
}
// 2. Storage
const porBucket = new Map();
for (const o of m.objetos) porBucket.set(o.bucket, [...(porBucket.get(o.bucket) ?? []), o.name]);
for (const [bucket, nombres] of porBucket) {
  for (let i = 0; i < nombres.length; i += 100) {
    const { error } = await S.storage.from(bucket).remove(nombres.slice(i, i + 100));
    if (error) parar(`Storage ${bucket}: ${error.message}. No se borró el negocio.`);
  }
}
console.log(`✔ ${m.objetos.length} archivos borrados de Storage`);
// 3. La base
const { data: r, error: e4 } = await S.rpc("plataforma_eliminar_negocio", { p_negocio_id: n.id, p_confirmacion: n.nombre });
if (e4) parar(e4.message);
console.log(`✔ Base: ${Object.keys(r.filas).length} tablas con filas borradas, ${r.secretos_vault} credenciales de Vault desvinculadas`);
console.log("  " + Object.entries(r.filas).map(([t, c]) => `${t} ${c}`).join(" · "));
// 4. Auth
let cuentas = 0;
for (const id of r.cuentas_huerfanas ?? []) { const { error } = await S.auth.admin.deleteUser(id); if (!error) cuentas++; }
console.log(`✔ ${cuentas} de ${(r.cuentas_huerfanas ?? []).length} cuentas sin negocio borradas de Auth`);
console.log("Listo.");
