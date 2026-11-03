// Avisos del negocio al dueño · verificación en PRODUCCIÓN con la dueña de la demo (Fernanda Luna, 4420000201).
// La demo (Patitas & Co.) es de solo lectura y por diseño no genera avisos (aviso_del_negocio_al_dueno sale en el plan
// demo), así que la escritura la hace un NEGOCIO DE PRUEBA de QA (nunca Ludogteka ni la demo):
//   1. al negocio de prueba se le agrega Fernanda como clienta con un perro → el disparador lo liga a una mascota de su app;
//   2. el admin del negocio de prueba (su propia sesión, enlace mágico canjeado aquí) agenda una cita como lo hace la
//      app (crear_reserva_para_cita + citas_estetica) y la confirma en pantalla con «Confirmar cita»;
//   3. se comprueba el aviso «… confirmó la cita de …» en app_avisos, que el push se despachó (push_pendiente = false)
//      y que Fernanda lo ve en app.peludesk.mx/avisos con su sesión;
//   4. se borra TODO lo que creó la prueba (aviso, cita, historial, reserva, vínculo, mascota, perro, membresía, cliente).
//
//   node scripts/auditoria/avisos-negocio-prod.mjs [--negocio <slug>]
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { llavesProd, URL_PROD, REF_PROD, LUDOGTEKA_ID } from "../lib/prod.mjs";

const i = process.argv.indexOf("--negocio");
const SLUG = i > 0 ? process.argv[i + 1] : "prueba-qa-onboarding-estetica-r21";
const APP = "https://app.peludesk.mx";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const sin = { auth: { persistSession: false, autoRefreshToken: false } };

const S = createClient(URL_PROD, llavesProd().servicio, sin);
const { data: neg } = await S.from("negocios").select("id, slug, nombre, plan").eq("slug", SLUG).is("deleted_at", null).single();
if (!neg || neg.id === LUDOGTEKA_ID || neg.plan === "demo" || !/^prueba/.test(neg.slug)) throw new Error(`«${SLUG}» no es un negocio de prueba.`);
const SN = createClient(URL_PROD, llavesProd().servicio, { ...sin, global: { headers: { "x-negocio-id": neg.id } } });
const { data: demo } = await S.from("negocios").select("id").eq("slug", "patitasyco").single();
const { data: cliDemo } = await S.from("clientes").select("id").eq("negocio_id", demo.id).eq("telefono", "4420000201").is("deleted_at", null).single();
const { data: mDemo } = await S.from("membresias").select("profile_id").eq("negocio_id", demo.id).eq("cliente_id", cliDemo.id).eq("rol", "cliente").is("deleted_at", null).single();
const FER = mDemo.profile_id;
const { data: adm } = await S.from("membresias").select("profile_id").eq("negocio_id", neg.id).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1).single();
console.log(`Negocio de prueba: ${neg.nombre} (${neg.slug}) · dueña de la demo: ${FER}`);

async function sesion(profileId) {
  const { data: u } = await S.auth.admin.getUserById(profileId);
  const { data: link, error: eL } = await S.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (eL) throw eL;
  const { data: s, error } = await createClient(URL_PROD, llavesProd().anon, sin).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  return s.session;
}
function galletas(s, nombre, dominio) {
  const valor = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, k) => [`${nombre}.${k}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/", secure: true, sameSite: "Lax" }));
}

const creados = { cliente: null, membresia: null, perro: null, mascota: null, reserva: null, cita: null };
const nav = await abrirNavegador();
try {
  console.log("\n1. Fernanda, clienta del negocio de prueba, con un perro ligado a su app");
  const { data: cli, error: eC } = await SN.from("clientes").insert({ negocio_id: neg.id, nombre: "Fernanda Luna (prueba de avisos)", telefono: "4420000201" }).select("id").single();
  if (eC) throw new Error(`cliente: ${eC.message}`);
  creados.cliente = cli.id;
  const { data: mem, error: eM } = await SN.from("membresias").insert({ negocio_id: neg.id, profile_id: FER, rol: "cliente", cliente_id: cli.id }).select("id").single();
  if (eM) throw new Error(`membresía: ${eM.message}`);
  creados.membresia = mem.id;
  const { data: modelo } = await SN.from("perros").select("raza, raza_id, tamano_id, pelaje_id").eq("negocio_id", neg.id).not("tamano_id", "is", null).limit(1).single();
  const { data: perro, error: eP } = await SN.from("perros").insert({ negocio_id: neg.id, cliente_id: cli.id, nombre: "Aviso Prod", ...modelo }).select("id").single();
  if (eP) throw new Error(`perro: ${eP.message}`);
  creados.perro = perro.id;
  const { data: v } = await S.from("mascotas_vinculos").select("mascota_id").eq("perro_id", perro.id).is("deleted_at", null).maybeSingle();
  creados.mascota = v?.mascota_id ?? null;
  if (!creados.mascota) throw new Error("el perro no quedó ligado a una mascota de la app de Fernanda");
  bien("el perro quedó ligado a una mascota de la app de Fernanda");

  console.log("\n2. El admin agenda y confirma la cita en pantalla");
  const sAdm = await sesion(adm.profile_id);
  const A = createClient(URL_PROD, llavesProd().anon, { ...sin, global: { headers: { "x-negocio-id": neg.id, Authorization: `Bearer ${sAdm.access_token}` } } });
  const { data: base } = await SN.from("citas_estetica").select("servicio_id, empleado_id").eq("negocio_id", neg.id).limit(1).single();
  const d = new Date(Date.now() + (60 + Math.floor(Math.random() * 60)) * 86_400_000);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1); // martes, como la cita que ya tiene el negocio
  const inicio = `${d.toISOString().slice(0, 10)}T16:00:00+00:00`;
  const { data: reservaId, error: eR } = await A.rpc("crear_reserva_para_cita", { p_perro_id: perro.id });
  if (eR) throw new Error(`reserva: ${eR.message}`);
  creados.reserva = reservaId;
  const { data: cita, error: eCi } = await A.from("citas_estetica").insert({ reserva_id: reservaId, perro_id: perro.id, servicio_id: base.servicio_id, empleado_id: base.empleado_id, inicio }).select("id, estado").single();
  if (eCi) throw new Error(`cita: ${eCi.message}`);
  creados.cita = cita.id;
  bien(`cita ${cita.estado} el ${inicio.slice(0, 10)}`);

  const host = `${neg.slug}.peludesk.mx`;
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(galletas(sAdm, `sb-${REF_PROD}-auth-token`, host));
  const p = await ctx.newPage();
  await p.goto(`https://${host}/estetica/${cita.id}`, { waitUntil: "networkidle" });
  if (!(await p.locator("[data-confirmar-cita]").count())) throw new Error(`no aparece «Confirmar cita» en ${p.url()}`);
  const t0 = Date.now();
  await p.locator("[data-confirmar-cita]").click();
  await p.getByText(/Cita confirmada/).first().waitFor({ timeout: 30_000 });
  bien(`«Confirmar cita» respondió en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await ctx.close();
  const est = (await SN.from("citas_estetica").select("estado").eq("id", cita.id).single()).data?.estado;
  if (est !== "confirmada") hallazgo(`la cita quedó «${est}»`);
  else bien("la cita quedó confirmada en la base");

  console.log("\n3. El aviso le llega a Fernanda");
  let aviso = null;
  for (let k = 0; k < 15; k++) {
    const { data } = await S.from("app_avisos").select("id, titulo, cuerpo, datos").eq("dueno_id", FER).eq("tipo", "negocio").contains("datos", { origen_id: cita.id });
    aviso = data?.[0] ?? null;
    if (aviso && aviso.datos?.push_pendiente === false) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!aviso) hallazgo("no se creó el aviso en app_avisos");
  else {
    bien(`aviso: «${aviso.titulo}» — ${aviso.cuerpo}`);
    if (aviso.datos?.push_pendiente !== false) hallazgo("el push sigue pendiente (no se despachó al terminar la acción)");
    else bien("el push se despachó al terminar la acción (push_pendiente = false)");
    const sFer = await sesion(FER);
    const ctxD = await nav.newContext({ viewport: { width: 390, height: 800 } });
    await ctxD.addCookies(galletas(sFer, `sb-${REF_PROD}-portal-auth-token`, "app.peludesk.mx"));
    const pd = await ctxD.newPage();
    await pd.goto(`${APP}/avisos`, { waitUntil: "networkidle" });
    if (!(await pd.getByText(aviso.titulo, { exact: false }).first().count())) hallazgo("Fernanda no ve el aviso en app.peludesk.mx/avisos");
    else bien("Fernanda ve el aviso en app.peludesk.mx/avisos");
    await ctxD.close();
  }
} catch (e) {
  hallazgo(e instanceof Error ? e.message : String(e));
} finally {
  await nav.close();
  console.log("\n4. Limpieza");
  if (creados.mascota) await S.from("app_avisos").delete().eq("dueno_id", FER).eq("mascota_id", creados.mascota);
  if (creados.cita) {
    await SN.from("citas_estetica_cambios").delete().eq("cita_id", creados.cita);
    await SN.from("citas_estetica").delete().eq("id", creados.cita);
  }
  if (creados.reserva) await SN.from("reservas").delete().eq("id", creados.reserva);
  if (creados.perro) {
    await S.from("mascotas_vinculos").delete().eq("perro_id", creados.perro);
    await SN.from("perros").delete().eq("id", creados.perro);
  }
  if (creados.mascota) await S.from("mascotas").delete().eq("id", creados.mascota).eq("dueno_id", FER).eq("origen", "negocio");
  if (creados.membresia) await SN.from("membresias").delete().eq("id", creados.membresia);
  if (creados.cliente) await SN.from("clientes").delete().eq("id", creados.cliente);
  const quedan = [
    creados.cita && (await SN.from("citas_estetica").select("id").eq("id", creados.cita)).data?.length,
    creados.perro && (await SN.from("perros").select("id").eq("id", creados.perro)).data?.length,
    creados.mascota && (await S.from("mascotas").select("id").eq("id", creados.mascota)).data?.length,
    creados.membresia && (await SN.from("membresias").select("id").eq("id", creados.membresia)).data?.length,
    creados.cliente && (await SN.from("clientes").select("id").eq("id", creados.cliente)).data?.length,
  ].filter(Boolean);
  if (quedan.length) hallazgo(`quedaron ${quedan.length} registro(s) de la prueba: ${JSON.stringify(creados)}`);
  else bien("se borró todo lo que creó la prueba");
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Aviso de «cita confirmada» en producción: le llega a la dueña.");
process.exit(hallazgos.length ? 1 : 0);
