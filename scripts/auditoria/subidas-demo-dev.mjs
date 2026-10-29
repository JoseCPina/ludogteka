// Subidas en la demo (SOLO DESARROLLO): con las cuentas de «Ver demo» (solo lectura), cada pantalla que sube una
// foto o un archivo la enseña con el aviso «En el demo … no se guarda» en vez de un error, y NADA llega a Storage
// (antes: el check-in decía «No pudimos subir la foto», «Foto de mi perro» del portal reemplazaba la foto del perro
// para todos con la secret key, y el adjunto de Vet y el PDF de consentimiento llegaban a Storage).
//
//   npm run build && npm run start -- -p 3001        (otra terminal)
//   node scripts/auditoria/subidas-demo-dev.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = `http://patitasyco.localhost:${Number(process.env.PUERTO_APP ?? 3001)}`;
const FOTO = "scripts/demo/fotos/8g0D8ZfFXyA.jpg";
const PDF = { name: "estudio.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") };
const AVISO_FOTO = "En el demo la foto no se guarda.";
const AVISO_ARCHIVO = "En el demo el archivo no se guarda.";

const hallazgos = [];
const comprobar = (c, t) => (c ? console.log(`  ✔ ${t}`) : (hallazgos.push(t), console.log(`  ✘ ${t}`)));

// ── Datos de la demo ──
const NEG = (await A.from("negocios").select("id, plan").eq("slug", "patitasyco").single()).data;
if (NEG.plan !== "demo") throw new Error("patitasyco no es el demo");
const estancia = (await A.from("estancias").select("id, perro_id, perros(cliente_id)").eq("negocio_id", NEG.id).eq("estado", "reservada").is("deleted_at", null).limit(1).single()).data;
const adentro = (await A.from("estancias").select("perro_id, perros(nombre, cliente_id)").eq("negocio_id", NEG.id).eq("estado", "en_curso").is("deleted_at", null).limit(1).maybeSingle()).data;
const { data: idCliente } = await A.rpc("usuario_por_email", { p_email: "t4420000201@telefono.ludogteka.mx" });
const clienteDemo = (await A.from("membresias").select("cliente_id").eq("negocio_id", NEG.id).eq("profile_id", idCliente).is("deleted_at", null).single()).data.cliente_id;
const perroPortal = (await A.from("perros").select("id, cliente_id").eq("negocio_id", NEG.id).eq("cliente_id", clienteDemo).eq("fallecido", false).is("deleted_at", null).limit(1).single()).data;
const vet = (await A.from("vet_consultas").select("perro_id").eq("negocio_id", NEG.id).limit(1).single()).data;
if (!estancia || !perroPortal || !vet) throw new Error("La demo de desarrollo no tiene los datos de ejemplo (corre scripts/demo/sembrar-demo.mjs)");

// ── Lo que hay en Storage antes (nombre + fecha), para ver que no cambió nada ──
async function listar(bucket, prefijo, nivel = 0) {
  const { data } = await A.storage.from(bucket).list(prefijo, { limit: 1000 });
  const out = [];
  for (const o of data ?? []) {
    const ruta = `${prefijo}/${o.name}`;
    if (o.id === null && nivel < 4) out.push(...(await listar(bucket, ruta, nivel + 1)));
    else out.push(`${bucket}:${ruta}@${o.updated_at}`);
  }
  return out;
}
const carpetas = [
  ["perros-archivos", `${estancia.perros.cliente_id}/${estancia.perro_id}`],
  ["perros-archivos", `${perroPortal.cliente_id}/${perroPortal.id}`],
  ["veterinaria-archivos", `${NEG.id}/${vet.perro_id}`],
  ["negocios-publico", `${NEG.id}`],
  ["reportes-archivos", `${NEG.id}`],
];
if (adentro) carpetas.push(["perros-archivos", `${adentro.perros.cliente_id}/${adentro.perro_id}`]);
const foto = async () => (await Promise.all(carpetas.map(([b, p]) => listar(b, p)))).flat().sort();
const antes = await foto();
const mediaAntes = (await A.from("media_perro").select("id", { count: "exact", head: true }).eq("negocio_id", NEG.id)).count;

// ── En pantalla ──
const nav = await abrirNavegador();
async function como(rol) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);
  await p.goto(`${BASE}/demo/entrar/${rol}`, { waitUntil: "networkidle" });
  return { p, ctx };
}
async function esperarAviso(p, texto, que) {
  const aviso = p.locator("[data-aviso-demo]", { hasText: texto }).first();
  const ok = await aviso.waitFor({ timeout: 30000 }).then(() => true, () => false);
  comprobar(ok, `${que}: aviso «${texto}»`);
  const cuerpo = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  comprobar(!/No pudimos (subir|guardar)|No se pudo guardar/.test(cuerpo), `${que}: sin error de subida`);
  return ok;
}
const hayVistaLocal = (p) => p.locator("img[src^='blob:'], video[src^='blob:']").count().then((n) => n > 0);

try {
  console.log("\n── Recepción: check-in con foto de llegada");
  let { p, ctx } = await como("recepcion");
  await p.goto(`${BASE}/reservas/estancias/${estancia.id}/checkin`, { waitUntil: "networkidle" });
  await p.locator("input[type=file]").first().setInputFiles(FOTO);
  if (await esperarAviso(p, AVISO_FOTO, "check-in")) comprobar(await hayVistaLocal(p), "check-in: la foto elegida se ve en pantalla");
  comprobar(await p.getByRole("button", { name: "Reemplazar foto" }).isVisible(), "check-in: el botón dice «Reemplazar foto»");

  console.log("\n── Recepción: foto del perro");
  await p.goto(`${BASE}/perros/${estancia.perro_id}`, { waitUntil: "networkidle" });
  const botonFoto = p.getByRole("button", { name: /^(Subir|Reemplazar) foto$/ }).first();
  await botonFoto.locator("xpath=..").locator("input[type=file]").setInputFiles(FOTO);
  if (await esperarAviso(p, AVISO_FOTO, "foto del perro")) comprobar(await hayVistaLocal(p), "foto del perro: se ve en pantalla");

  await ctx.close();

  console.log("\n── Médica veterinaria: adjuntos del expediente");
  ({ p, ctx } = await como("veterinaria"));
  await p.goto(`${BASE}/veterinaria/expediente/${vet.perro_id}`, { waitUntil: "networkidle" });
  await p.getByText("Adjuntar una foto o PDF").first().click();
  const adj = p.locator("input[type=file][accept*='application/pdf']").first();
  await adj.setInputFiles(PDF);
  await p.getByRole("button", { name: "Subir archivo" }).first().click();
  await esperarAviso(p, AVISO_ARCHIVO, "adjunto PDF");
  await adj.setInputFiles(FOTO);
  await p.getByRole("button", { name: "Subir archivo" }).first().click();
  if (await esperarAviso(p, AVISO_FOTO, "adjunto foto")) comprobar(await hayVistaLocal(p), "adjunto foto: se ve en pantalla");
  await ctx.close();

  console.log("\n── Dueña (portal): foto de su perro");
  ({ p, ctx } = await como("cliente"));
  await p.goto(`${BASE}/portal/perros/${perroPortal.id}`, { waitUntil: "networkidle" });
  const botonPortal = p.getByRole("button", { name: /^(Subir|Reemplazar) foto$/ }).first();
  await botonPortal.locator("xpath=..").locator("input[type=file]").setInputFiles(FOTO);
  if (await esperarAviso(p, AVISO_FOTO, "portal")) comprobar(await hayVistaLocal(p), "portal: la foto se ve en pantalla");
  await ctx.close();

  console.log("\n── Dueña del negocio: galería de Adentro ahora y fotos de la página web");
  ({ p, ctx } = await como("admin"));
  if (adentro) {
    // En la demo, la galería de «Adentro ahora» es de quien tiene el permiso de fotos y videos (la dueña).
    await p.goto(`${BASE}/adentro`, { waitUntil: "networkidle" });
    const entrada = p.locator("input[type=file][aria-label^='Elegir fotos o videos de']").first();
    comprobar((await entrada.count()) > 0, "galería: la dueña tiene dónde subir fotos y videos");
    if (await entrada.count()) {
      await entrada.setInputFiles(FOTO);
      if (await esperarAviso(p, AVISO_FOTO, "galería")) comprobar(await hayVistaLocal(p), "galería: la foto se ve en pantalla");
    }
  }
  await p.goto(`${BASE}/admin/perfil`, { waitUntil: "networkidle" });
  const entradaPerfil = p.locator("input[aria-label='Foto para: agregar foto']").first();
  if (await entradaPerfil.count()) {
    await entradaPerfil.setInputFiles(FOTO);
    // El campo de archivo también se llama «… agregar foto»: el botón es el de nombre exacto.
    await p.getByRole("button", { name: "Agregar foto", exact: true }).click();
    if (await esperarAviso(p, AVISO_FOTO, "perfil")) comprobar(await hayVistaLocal(p), "perfil: la foto se ve en pantalla");
    comprobar(!(await p.locator("body").innerText()).includes("Foto agregada"), "perfil: no dice «Foto agregada»");
  } else console.log("  · /admin/perfil sin el campo de fotos en la demo: se salta");
  await ctx.close();
} finally {
  await nav.close();
}

console.log("\n── Storage y base");
const despues = await foto();
const nuevos = despues.filter((x) => !antes.includes(x));
comprobar(nuevos.length === 0, `Storage sin archivos nuevos ni reemplazados${nuevos.length ? `: ${nuevos.slice(0, 5).join(", ")}` : ""}`);
const mediaDespues = (await A.from("media_perro").select("id", { count: "exact", head: true }).eq("negocio_id", NEG.id)).count;
comprobar(mediaDespues === mediaAntes, "media_perro sin filas nuevas");

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
