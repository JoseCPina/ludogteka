// Solo lectura en pantalla (SOLO DESARROLLO): las acciones del servidor traducen el rechazo de
// «solo lectura» en UN solo lugar (src/lib/supabase/aviso-solo-lectura.ts + src/lib/ui/espera.ts),
// no archivo por archivo. Con una cuenta en solo lectura se recorren formularios de familias
// distintas (clientes, servicios, proveedores, empleados, peso) y cada uno tiene que decir el
// mensaje correcto, nunca el «No pudimos guardar…» propio de su acción:
//   · el demo (patitasyco)  → «En la demo no se guardan cambios. Prueba 15 días gratis con tu negocio.»
//   · una prueba vencida (Huellitas) → «Este negocio está en solo lectura…»
// Además comprueba que una validación normal (campo vacío) conserva SU texto.
//
//   npm run build && npm run start -- -p 3001      (en otra terminal)
//   node scripts/auditoria/solo-lectura-acciones-dev.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
// (no se importa sesiones-dev.mjs: su arranque tarda minutos y aquí no hace falta)
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const A = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const hallazgos = [];
const comprobar = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) hallazgos.push(t); };
const sufijo = String(Date.now()).slice(-6);

async function cookiesDe(email, host) {
  const { data: link, error } = await A.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (e2) throw e2;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: host, path: "/" }));
}

const SB = (neg) => createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": neg } } });
const { data: demo } = await A.from("negocios").select("id, plan").eq("slug", "patitasyco").single();
if (demo.plan !== "demo") throw new Error("patitasyco no es el demo");
const perroDemo = (await SB(demo.id).from("perros").select("id").eq("negocio_id", demo.id).is("deleted_at", null).limit(1).single()).data.id;

// Cada caso: ruta, cómo llenarlo y cómo enviarlo.
const casos = (perroId) => [
  { nombre: "Cliente nuevo", ruta: "/clientes/nuevo", formulario: 'input[name="telefono"]', llenar: async (p) => { await p.fill('input[name="nombre"]', `Solo Lectura ${sufijo}`); await p.fill('input[name="telefono"]', `44299${sufijo.slice(-5)}`); } },
  { nombre: "Servicio nuevo", ruta: "/servicios/nuevo", formulario: 'input[name="clave"]', llenar: async (p) => { await p.fill('input[name="clave"]', `sl_${sufijo}`); await p.fill('input[name="nombre"]', `Servicio ${sufijo}`); } },
  { nombre: "Proveedor nuevo", ruta: "/inventario/proveedores/nuevo", formulario: 'input[name="telefono"]', llenar: async (p) => { await p.fill('input[name="nombre"]', `Proveedor ${sufijo}`); } },
  { nombre: "Peso de la mascota", ruta: `/perros/${perroId}`, llenar: async (p) => { await p.fill('input[name="peso_kg"]', "12.5"); }, formulario: 'input[name="peso_kg"]' },
];

// El título fijo «No se pudo guardar» de la alerta no cuenta: lo que se busca es el texto propio de la acción.
const AVISO_PROPIO = /No pudimos guardar|No pudimos completar|Intenta de nuevo/;

async function recorrer(nav, host, cuentaEmail, perroId, esperado, etiqueta) {
  console.log(`── ${etiqueta}`);
  const ctx = await nav.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addCookies(await cookiesDe(cuentaEmail, host.split(":")[0]));
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);
  for (const caso of casos(perroId)) {
    await p.goto(`http://${host}${caso.ruta}`, { waitUntil: "domcontentloaded" });
    try {
      await caso.llenar(p);
    } catch (e) {
      comprobar(false, `${caso.nombre}: no se pudo llenar el formulario (${String(e.message).split("\n")[0]})`);
      continue;
    }
    // El primer <form> de la página es el de «Cerrar sesión» del menú: se busca el que tiene el campo.
    const form = p.locator("form", { has: p.locator(caso.formulario) }).first();
    await form.evaluate((f) => { f.noValidate = true; });
    await form.locator('button[type="submit"]').last().click();
    let texto = "";
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(500);
      texto = (await p.locator("body").innerText()).replace(/\s+/g, " ");
      if (esperado.test(texto) || AVISO_PROPIO.test(texto)) break;
    }
    comprobar(esperado.test(texto) && !AVISO_PROPIO.test(texto), `${caso.nombre}: ${esperado.test(texto) ? "dice el mensaje de solo lectura" : "NO dice el mensaje correcto"}${AVISO_PROPIO.test(texto) ? " (salió el aviso propio de la acción)" : ""}`);
  }
  // Una validación normal sigue diciendo SU texto (no se confunde con solo lectura).
  await p.goto(`http://${host}/clientes/nuevo`, { waitUntil: "domcontentloaded" });
  const f0 = p.locator("form", { has: p.locator('input[name="telefono"]') }).first();
  await f0.evaluate((f) => { f.noValidate = true; });
  await f0.locator('button[type="submit"]').last().click();
  await p.waitForTimeout(2500);
  const t0 = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  comprobar(/Escribe el nombre del dueño/.test(t0) && !esperado.test(t0), "una validación (nombre vacío) conserva su propio texto");
  await ctx.close();
}

const nav = await abrirNavegador();
const NEG = SB(B);
const { data: antes } = await NEG.from("negocios").select("plan, prueba_termina_at").eq("id", B).single();
try {
  await recorrer(nav, "patitasyco.localhost:3001", "demo.admin@peludesk.mx", perroDemo, /En la demo no se guardan cambios\. Prueba 15 días gratis con tu negocio\./, "El demo (patitasyco)");

  // Prueba vencida en Huellitas: plan prueba con la fecha en el pasado (se restaura al final).
  const ayer = new Date(Date.now() - 3 * 86400000).toISOString();
  const rr = await NEG.from("negocios").update({ plan: "prueba", prueba_termina_at: ayer }).eq("id", B);
  if (rr.error) throw new Error(`no se pudo vencer la prueba: ${rr.error.message}`);
  const { data: adminB } = await A.from("profiles").select("id").eq("id", datos.adminB).single();
  const { data: u } = await A.auth.admin.getUserById(adminB.id);
  const perroB = (await NEG.from("perros").select("id").eq("negocio_id", B).is("deleted_at", null).limit(1).single()).data.id;
  await recorrer(nav, "huellitas.localhost:3001", u.user.email, perroB, /Este negocio está en solo lectura/, "Una prueba vencida (Huellitas)");
} finally {
  await NEG.from("negocios").update({ plan: antes.plan, prueba_termina_at: antes.prueba_termina_at }).eq("id", B);
  await nav.close();
  // Lo que alcanzó a quedar de la corrida (nada debería).
  await SB(demo.id).from("clientes").delete().eq("negocio_id", demo.id).like("nombre", "Solo Lectura%");
  await NEG.from("clientes").delete().eq("negocio_id", B).like("nombre", "Solo Lectura%");
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
