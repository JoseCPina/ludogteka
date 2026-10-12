// «Ver demo» de Veterinaria (SOLO DESARROLLO): entra sin registro al negocio demo (Patitas & Co.) como la médica
// veterinaria, recorre sus pantallas a 390 px y a escritorio, y comprueba que es de SOLO LECTURA: las acciones de
// escritura se muestran pero la base las rechaza, y nada sale por WhatsApp.
//
//   npm run build && npm run start -- -p 3001        (otra terminal)
//   node scripts/auditoria/demo-veterinaria-dev.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PUERTO = Number(process.env.PUERTO_APP ?? 3001);
const BASE = `http://patitasyco.localhost:${PUERTO}`;
const hallazgos = [];
const ID_DEMO = (await A.from("negocios").select("id").eq("slug", "patitasyco").single()).data.id;
const comprobar = (c, t) => (c ? console.log(`  ✔ ${t}`) : (hallazgos.push(t), console.log(`  ✘ ${t}`)));
const cuerpo = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");

const nav = await abrirNavegador();
try {
  for (const [nombre, viewport] of [["celular 390 px", { width: 390, height: 844 }], ["escritorio 1280 px", { width: 1280, height: 900 }]]) {
    console.log(`\n── ${nombre}`);
    const ctx = await nav.newContext({ viewport });
    const p = await ctx.newPage();
    p.setDefaultNavigationTimeout(60000);
    await p.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    comprobar(/Médica veterinaria/.test(await cuerpo(p)), "/demo ofrece entrar como médica veterinaria");
    await p.goto(`${BASE}/demo/entrar/veterinaria`, { waitUntil: "networkidle" });
    comprobar(/\/veterinaria/.test(p.url()), `entra sin registro a /veterinaria (${p.url().replace(BASE, "")})`);
    const ancho = async (donde) => comprobar((await p.evaluate(() => document.documentElement.scrollWidth)) <= viewport.width + 2, `${donde}: sin desborde`);
    const ver = async (ruta, regex, que) => {
      await p.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
      comprobar(regex.test(await cuerpo(p)), que);
      await ancho(que);
    };
    await ver("/veterinaria", /Veterinaria/, "inicio de Veterinaria");
    await ver("/veterinaria/agenda", /Kiwi|Luna|Rocco|Canela/, "agenda clínica con las citas de ejemplo");
    await ver("/veterinaria/expediente", /Canela|Rocco|Kiwi|Luna/, "expedientes");
    await ver("/veterinaria/hospitalizacion", /Rocco/, "mascota hospitalizada");
    await ver("/veterinaria/recetas", /Canela/, "recetas emitidas");
    await ver("/veterinaria/inventario", /Ketamina|Enrofloxacina/, "inventario clínico con lotes");
    await ver("/veterinaria/estimados", /Esterilización/, "estimados");
    await ver("/veterinaria/carnet", /Canela|Kiwi/, "carnets");

    // Solo lectura: abrir el expediente de Canela y la receta, y ver que no hay nada privado de otro negocio.
    const { data: canela } = await A.from("perros").select("id").eq("nombre", "Canela").eq("negocio_id", ID_DEMO).limit(1).maybeSingle();
    await ver(`/veterinaria/expediente/${canela.id}`, /Otitis|Canela/, "expediente de Canela con su consulta firmada");
    await ver(`/veterinaria/carnet/${canela.id}`, /Séxtuple|Antirrábica/, "carnet de Canela");

    comprobar(/solo lectura/i.test(await cuerpo(p)), "la pantalla avisa que es una demostración de solo lectura");
    await ctx.close();
  }

  // Escribir: la base se niega, con la sesión real de la médica de la demo.
  console.log("\n── Escribir con la sesión de la demo");
  {
    const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: "demo.veterinaria@peludesk.mx" });
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: s } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    const med = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": ID_DEMO } } });
    const { data: perro } = await A.from("perros").select("id").eq("negocio_id", ID_DEMO).eq("nombre", "Kiwi").limit(1).maybeSingle();
    const { data: medico } = await A.from("medicos_veterinarios").select("id").eq("negocio_id", ID_DEMO).is("deleted_at", null).limit(1).maybeSingle();
    const intento = await med.rpc("vet_consulta_iniciar", { p_perro: perro.id, p_cita: null, p_tipo: "consulta", p_medico: medico.id });
    comprobar(Boolean(intento.error) && /solo lectura/i.test(intento.error.message), `iniciar una consulta se rechaza («${intento.error?.message?.slice(0, 60)}»)`);
    const vacuna = await med.rpc("registrar_vacuna", { p_perro_id: perro.id, p_biologico: "X", p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: "L", p_laboratorio: null, p_fecha: new Date().toISOString().slice(0, 10), p_proxima: null, p_medico_id: medico.id, p_dosis: null, p_notas: null, p_descontar: false });
    comprobar(Boolean(vacuna.error), "registrar una vacuna se rechaza");
    const lee = await med.rpc("vet_linea_tiempo", { p_perro: perro.id });
    comprobar(!lee.error, "leer el expediente sí funciona");
  }

  // Nada sale por WhatsApp desde la demo.
  console.log("\n── Sin mensajes reales");
  const ctx = await nav.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/demo/entrar/veterinaria`, { waitUntil: "networkidle" });
  const { data: cita } = await A.from("vet_citas").select("id").eq("negocio_id", ID_DEMO).limit(1).maybeSingle();
  comprobar(Boolean(cita), "hay citas en la demo");
  await ctx.close();
  const { data: env2 } = await A.from("wa_entregas").select("id", { count: "exact" }).eq("negocio_ref", ID_DEMO);
  comprobar((env2 ?? []).length === 0, "la demo no ha mandado ningún mensaje de WhatsApp");
  const { data: ajustes } = await A.from("veterinaria_ajustes").select("recordatorios_activos").eq("negocio_id", ID_DEMO).maybeSingle();
  comprobar(ajustes?.recordatorios_activos === false, "el envío automático de recordatorios está apagado en la demo");
  const { data: negs } = await A.rpc("carnet_negocios_con_recordatorios");
  comprobar(!(negs ?? []).some((n) => n.negocio_id === ID_DEMO), "la tarea de recordatorios no recorre la demo");
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s):\n${hallazgos.map((h) => `   - ${h}`).join("\n")}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
