// Da de alta un médico veterinario designado de PRUEBA en un negocio PRUEBA de QA en producción, por la pantalla de
// la app («Tu equipo», /bienvenida/equipo) con la sesión de su admin, igual que lo haría el dueño:
//
//   node scripts/plataforma/medico-prueba-qa.mjs prueba-qa-onboarding-vet-s16 [prueba-veterinaria]
//
// · Solo negocios PRUEBA de Veterinaria (nunca Ludogteka). Si el negocio está en solo lectura (prueba vencida o falta
//   de pago) no se toca: la base no deja dar de alta personal ni designar médicos, y así lo dice.
// · La cuenta es el buzón de QA (tester-peludesk+medico-<negocio>@mail.grokbot.com), rol estética, «Es médico
//   veterinario» con una cédula de prueba (la pantalla exige 7 u 8 números: 00000000) y «PRUEBA» en el nombre.
// · Este script NO lee, guarda ni imprime el link de invitación ni ninguna contraseña. La cuenta se activa desde el
//   propio negocio: su admin (QA) entra a Administración → Cuentas y le pone una contraseña temporal con
//   «Restablecer contraseña», que la app le enseña solo a él.
// · Si la persona ya está en el negocio y designada médico, no hace nada.
import { negocioPrueba, servicioSinNegocio, sesionDe } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const slugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!slugs.length) throw new Error("Falta el slug del negocio PRUEBA.");
const S = servicioSinNegocio();
let fallas = 0;

for (const slug of slugs) {
  console.log(`\n══ ${slug} ══`);
  const n = await negocioPrueba(slug);
  const { data: mods } = await n.N.from("negocio_modulos").select("modulo, activo").eq("negocio_id", n.negocio.id).eq("modulo", "veterinaria").is("deleted_at", null).maybeSingle();
  if (!mods?.activo) { console.log("  · no tiene Veterinaria prendida: no aplica"); continue; }
  const { data: estado } = await S.rpc("estado_cobro_en", { p_negocio_id: n.negocio.id });
  if (["prueba_vencida", "solo_lectura", "cancelado"].includes(estado)) {
    console.log(`  · está en solo lectura (${estado}): la base no deja dar de alta personal ni designar médicos; no se toca`);
    continue;
  }
  const sufijo = slug.replace(/^prueba-(qa-onboarding-)?/, "");
  const correo = `tester-peludesk+medico-${sufijo}@mail.grokbot.com`;
  const nombre = `PRUEBA Médico QA ${sufijo.toUpperCase()}`;

  const yaEsta = async () => {
    const { data: id } = await S.rpc("usuario_por_email", { p_email: correo });
    if (!id) return { id: null, miembro: false, medico: false };
    const { data: m } = await n.N.from("membresias").select("rol").eq("negocio_id", n.negocio.id).eq("profile_id", id).is("deleted_at", null).maybeSingle();
    const { data: med } = await n.N.from("medicos_veterinarios").select("id, cedula_profesional").eq("negocio_id", n.negocio.id).eq("profile_id", id).is("deleted_at", null).maybeSingle();
    return { id, miembro: Boolean(m), rol: m?.rol ?? null, medico: Boolean(med), cedula: med?.cedula_profesional ?? null };
  };
  const antes = await yaEsta();
  if (antes.miembro && antes.medico) { console.log(`  ✔ ya estaba: ${nombre} (${antes.rol}), médico designado`); continue; }
  if (antes.miembro) { console.log("  ✘ la cuenta ya está en el negocio pero sin designar médico: desígnala en Veterinaria → Médicos"); fallas++; continue; }

  const { data: admin } = await n.N.from("membresias").select("profile_id").eq("negocio_id", n.negocio.id).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1).single();
  const { cookies } = await sesionDe(admin.profile_id, `${slug}.peludesk.mx`);
  const nav = await abrirNavegador();
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(cookies);
    const p = await ctx.newPage();
    await p.goto(`${n.base}/bienvenida/equipo`, { waitUntil: "load" });
    await p.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await p.getByLabel("Nombre completo *").fill(nombre);
    await p.getByLabel("Correo *").fill(correo);
    await p.getByLabel("Qué hace en la app").selectOption("estetica");
    await p.getByLabel("Es médico veterinario").check();
    await p.getByLabel("Cédula profesional *").fill("00000000");
    await p.getByRole("button", { name: "Invitar", exact: true }).click();
    await p.locator("[data-acciones-formulario] [role=status], [data-acciones-formulario] [role=alert]").first().waitFor({ timeout: 20000 }).catch(() => {});
    const aviso = (await p.locator("[data-acciones-formulario]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    console.log(`  · la pantalla dice: «${aviso.slice(0, 160)}»`);
    await ctx.close();
  } finally {
    await nav.close();
  }
  const despues = await yaEsta();
  if (despues.miembro && despues.medico) console.log(`  ✔ ${nombre}: cuenta ${correo.replace(/^(.{6}).*(@.*)$/, "$1…$2")}, rol ${despues.rol}, médico designado (cédula ${despues.cedula})`);
  else { console.log(`  ✘ no quedó: ${JSON.stringify({ miembro: despues.miembro, medico: despues.medico })}`); fallas++; }
}
process.exit(fallas ? 1 : 0);
