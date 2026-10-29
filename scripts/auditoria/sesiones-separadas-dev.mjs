// N12 (QA externa, 16 de octubre de 2026) — SOLO DESARROLLO, Huellitas, con el servidor en el 3001.
//
//   node scripts/auditoria/sesiones-separadas-dev.mjs
//
// El personal y el dueño del portal viven en el mismo navegador y dominio: entrar al portal no debe cerrar la sesión
// del admin ni mandarlo al portal al volver.
//   1. Admin con su sesión de personal; abre /recepcion.
//   2. En el MISMO navegador, el dueño entra por /login con su teléfono y contraseña: llega a /portal y su sesión se
//      guarda en la cookie del portal (la del personal no cambia).
//   3. Volver a /recepcion: sigue siendo el admin (no redirige al portal). /portal sigue siendo del dueño.
//   4. Un enlace de activación o alta no pisa la cookie del personal.
//   5. El personal no entra al portal con su cookie, y el dueño no entra a /recepcion con la suya.
//   6. N42: la misma persona en dos subdominios (Huellitas y qa-pruebas): fallar al entrar, entrar y salir en uno
//      no cierra su sesión del otro, y la cookie es solo del subdominio.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));

async function cookieDe(profileId, nombre) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const PERSONAL = `sb-${REF}-auth-token`;
const PORTAL = `sb-${REF}-portal-auth-token`;
const nombres = async (ctx) => (await ctx.cookies()).map((c) => c.name.replace(/\.\d+$/, ""));

// El dueño: una contraseña que solo vive en esta corrida.
const { data: cuenta } = await A.auth.admin.getUserById(datos.cuentaSoloB);
const { data: perfil } = await A.from("profiles").select("telefono").eq("id", datos.cuentaSoloB).maybeSingle();
const clave = claveAleatoria();
const act = await A.auth.admin.updateUserById(datos.cuentaSoloB, { password: clave });
if (act.error) throw act.error;
const usuario = perfil?.telefono ?? cuenta.user.email;

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies(await cookieDe(datos.adminB, PERSONAL));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);

  console.log("── 1. El admin tiene su sesión");
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), `el admin ve /recepcion (${p.url()})`);

  console.log("── 2. El dueño entra por /login en el mismo navegador");
  const ctxDueno = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pd = await ctxDueno.newPage();
  pd.setDefaultTimeout(60000);
  await pd.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
  // QA S36: el login separa «Soy cliente» (el de por omisión, con su teléfono) y «Soy del equipo».
  await pd.getByLabel("Teléfono", { exact: true }).fill(usuario);
  await pd.locator('input[name="password"]').fill(clave);
  await pd.getByRole("button", { name: "Entrar" }).click();
  await pd.waitForURL(/\/portal/, { timeout: 60000 }).catch(() => {});
  comprobar(new globalThis.URL(pd.url()).pathname.startsWith("/portal"), `el dueño llega a /portal (${pd.url()})`);
  const cd = await nombres(ctxDueno);
  comprobar(cd.includes(PORTAL) && !cd.includes(PERSONAL), `su sesión se guarda en la cookie del portal, no en la del personal (${[...new Set(cd)].filter((n) => n.startsWith("sb-")).join(", ")})`);

  console.log("── 3. Las dos sesiones conviven en un mismo navegador");
  // Se pasan las cookies del dueño al contexto del admin: un solo navegador con las dos.
  const cookiesDueno = (await ctxDueno.cookies()).filter((c) => c.name.startsWith("sb-"));
  await ctx.addCookies(cookiesDueno.map((c) => ({ name: c.name, value: c.value, domain: "huellitas.localhost", path: "/" })));
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), `el admin sigue en /recepcion (no lo manda al portal) (${p.url()})`);
  await p.goto(`${BASE}/portal`, { waitUntil: "networkidle", timeout: 120000 });
  const textoPortal = await p.locator("body").innerText();
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/portal") && /Hola,/.test(textoPortal), `/portal muestra el del dueño (${p.url()})`);
  comprobar(!/\b\d{3} \d{3} \d{4}\b/.test((await p.locator("[data-saludo-portal]").first().innerText().catch(() => "")) || ""), "la cabecera no saluda con el teléfono");
  const antes = await nombres(ctx);
  comprobar(antes.includes(PERSONAL) && antes.includes(PORTAL), "las dos cookies siguen puestas");
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), "tras visitar el portal, el admin vuelve a su zona sin iniciar sesión");

  console.log("── 4. Cada cookie sirve solo en lo suyo");
  const ctxSolo = await nav.newContext();
  await ctxSolo.addCookies(await cookieDe(datos.adminB, PERSONAL));
  const ps = await ctxSolo.newPage();
  await ps.goto(`${BASE}/portal`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(!(await ps.locator("body").innerText()).includes("Tus perros"), `el personal solo con su cookie no obtiene el portal del dueño (${ps.url()})`);
  const ctxCli = await nav.newContext();
  await ctxCli.addCookies(cookiesDueno.map((c) => ({ name: c.name, value: c.value, domain: "huellitas.localhost", path: "/" })));
  const pc = await ctxCli.newPage();
  await pc.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(!new globalThis.URL(pc.url()).pathname.startsWith("/recepcion"), `el dueño no entra a /recepcion (${pc.url()})`);

  console.log("── 5. Un enlace de alta o activación no pisa la sesión del personal");
  await p.goto(`${BASE}/activar/token-que-no-existe`, { waitUntil: "networkidle", timeout: 120000 });
  const despues = await nombres(ctx);
  comprobar(despues.includes(PERSONAL), "la cookie del personal sigue después de abrir /activar");
  await p.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(new globalThis.URL(p.url()).pathname.startsWith("/recepcion"), "y el admin sigue adentro");
  await ctx.close(); await ctxDueno.close(); await ctxSolo.close(); await ctxCli.close();

  // ── N42 (QA externa, 18 de octubre de 2026): la sesión de un negocio no se cierra por lo que pase en otro ──
  console.log("── 6. Dos subdominios a la vez: entrar, fallar y salir en uno no cierra la sesión del otro");
  const { data: otro } = await A.from("negocios").select("id, slug").eq("slug", "qa-pruebas").single();
  const OTRO = `http://${otro.slug}.localhost:3001`;
  const sufijo = String(Date.now()).slice(-6);
  const claveN42 = claveAleatoria();
  const correoN42 = `aud-n42-${sufijo}@prueba.peludesk.mx`; // escaner-ok: correo de una cuenta temporal, sin contraseña escrita
  const creada = await A.auth.admin.createUser({ email: correoN42, password: claveN42, email_confirm: true });
  if (creada.error) throw creada.error;
  const idN42 = creada.data.user.id;
  const sinAcceso = await A.auth.admin.createUser({ email: `aud-n42-sin-${sufijo}@prueba.peludesk.mx`, password: claveN42, email_confirm: true });
  if (sinAcceso.error) throw sinAcceso.error;
  try {
    await A.from("profiles").upsert({ id: idN42, nombre_completo: `Auditoría Sesiones ${sufijo}` });
    const m1 = await A.from("membresias").insert({ profile_id: idN42, negocio_id: datos.B, rol: "admin" });
    if (m1.error) throw m1.error;
    const ctx6 = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const entrar = async (base, correo) => {
      const pg = await ctx6.newPage();
      pg.setDefaultTimeout(60000);
      await pg.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 120000 });
      // QA S36: el login separa «Soy cliente» y «Soy del equipo».
      await pg.locator('[data-entrar-como="equipo"]').click();
      await pg.getByLabel("Teléfono o correo").fill(correo);
      await pg.locator('input[name="password"]').fill(claveN42);
      await pg.getByRole("button", { name: "Entrar" }).click();
      await pg.waitForFunction(() => !location.pathname.startsWith("/login") || /no tiene acceso|incorrectos|No pudimos/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
      await pg.waitForLoadState("networkidle").catch(() => {});
      return pg;
    };
    const sigueAdentro = async (pg) => {
      await pg.goto(`${BASE}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
      return new globalThis.URL(pg.url()).pathname.startsWith("/recepcion");
    };
    const pH = await entrar(BASE, correoN42);
    comprobar(new globalThis.URL(pH.url()).pathname.startsWith("/recepcion") || new globalThis.URL(pH.url()).pathname.startsWith("/admin"), `entra como admin en Huellitas por /login (${pH.url()})`);
    const galletas = (await ctx6.cookies()).filter((c) => c.name.startsWith("sb-"));
    comprobar(galletas.length > 0 && galletas.every((c) => c.domain === "huellitas.localhost"), `la cookie de sesión es solo del subdominio de Huellitas (${[...new Set(galletas.map((c) => c.domain))].join(", ")})`);

    // a) En el otro negocio, la MISMA persona intenta entrar sin tener acceso: antes eso cerraba su sesión en todos.
    const pO = await entrar(OTRO, correoN42);
    comprobar(/no tiene acceso/.test(await pO.locator("body").innerText()), "en el otro negocio le dice que su cuenta no tiene acceso");
    comprobar(await sigueAdentro(pH), "y su sesión de Huellitas sigue abierta");

    // b) Le damos acceso de recepción en el otro negocio: entra ahí y Huellitas sigue con su sesión.
    const m2 = await A.from("membresias").insert({ profile_id: idN42, negocio_id: otro.id, rol: "recepcion" });
    if (m2.error) throw m2.error;
    const pO2 = await entrar(OTRO, correoN42);
    comprobar(new globalThis.URL(pO2.url()).pathname.startsWith("/recepcion"), `entra como recepción en ${otro.slug} (${pO2.url()})`);
    comprobar(await sigueAdentro(pH), "con las dos sesiones abiertas a la vez, Huellitas sigue adentro");

    // d) Salir en el otro negocio no cierra la sesión de Huellitas.
    await pO2.goto(`${OTRO}/recepcion`, { waitUntil: "networkidle", timeout: 120000 });
    await pO2.getByRole("button", { name: "Salir" }).first().click();
    await pO2.waitForURL(/\/login/, { timeout: 60000 }).catch(() => {});
    comprobar(/\/login/.test(pO2.url()), "«Salir» en el otro negocio lo manda a su /login");
    comprobar(await sigueAdentro(pH), "y la sesión de Huellitas sigue abierta");
    // c) Otra cuenta (sin acceso) entra en el otro negocio en el mismo navegador: no toca Huellitas.
    await entrar(OTRO, sinAcceso.data.user.email);
    comprobar(await sigueAdentro(pH), "otra cuenta que falla al entrar en el otro negocio no cierra la de Huellitas");

    await ctx6.close();
  } finally {
    await A.from("membresias").delete().eq("profile_id", idN42);
    await A.auth.admin.deleteUser(idN42).catch(() => {});
    await A.auth.admin.deleteUser(sinAcceso.data.user.id).catch(() => {});
  }

  // ── Pendiente de «Leer contrato» (27 de octubre de 2026): todo lo que el dueño abre con su sesión lee la del PORTAL ──
  // El dueño entra con SOLO la cookie del portal (sin la del personal) y abre cada cosa que su portal le da: páginas,
  // vista previa del contrato (/api), PDF y XML de su factura, recetas, carnet, la foto de su perro y la de la bitácora
  // (URLs firmadas de Storage que arma el servidor con su sesión) y las acciones del servidor de sus formularios. Si
  // algo leyera la cookie del personal, el dueño saldría sin sesión: /login, «No encontramos…» o una imagen rota.
  console.log("── 7. El dueño con SOLO la cookie del portal: vistas previas, PDF, recetas, carnet, fotos, bitácora, descargas y acciones");
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const sufijo7 = String(Date.now()).slice(-6);
  const deshacer = [];
  // Las tablas del negocio se leen y escriben con la llave de servicio ACOTADA a Huellitas (sin el encabezado, un update no toca nada).
  const { SB: SBn } = await import("./veterinaria-comun-dev.mjs");
  try {
    // Un perro del dueño con foto y una entrada de bitácora con foto (se quitan al terminar).
    const perroF = (await SBn.from("perros").insert({ negocio_id: datos.B, cliente_id: datos.clienteSoloB, nombre: `AUD sesion ${sufijo7}` }).select("id").single()).data;
    deshacer.push(() => SBn.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perroF.id));
    const rutaFoto = `${datos.clienteSoloB}/${perroF.id}/auditoria-foto-${sufijo7}.png`;
    const rutaBitacora = `${datos.clienteSoloB}/${perroF.id}/auditoria-bitacora-${sufijo7}.png`;
    for (const r of [rutaFoto, rutaBitacora]) {
      const sub = await A.storage.from("perros-archivos").upload(r, PNG, { contentType: "image/png" });
      if (sub.error) throw sub.error;
      deshacer.push(() => A.storage.from("perros-archivos").remove([r]));
    }
    await SBn.from("perros").update({ foto_path: rutaFoto }).eq("id", perroF.id);
    const entrada = (await SBn.from("bitacora_entradas").insert({ negocio_id: datos.B, perro_id: perroF.id, tipo: "actualizacion", nota: `AUD sesion ${sufijo7}`, foto_path: rutaBitacora }).select("id").single()).data;
    deshacer.push(() => SBn.from("bitacora_entradas").delete().eq("id", entrada.id));
    // Lo que ya tiene el dueño de prueba: una receta emitida, un carnet con vacuna y un contrato pendiente.
    const perrosDueno = ((await SBn.from("perros").select("id").eq("cliente_id", datos.clienteSoloB).is("deleted_at", null).limit(3000)).data ?? []).map((x) => x.id);
    const unoDe = async (tabla, extra = (q) => q) => {
      for (let i = 0; i < perrosDueno.length; i += 150) {
        const { data } = await extra(SBn.from(tabla).select("id, perro_id").in("perro_id", perrosDueno.slice(i, i + 150))).limit(1);
        if (data?.length) return data[0];
      }
      return null;
    };
    const receta = await unoDe("vet_recetas", (q) => q.eq("estado", "emitida"));
    const vacuna = await unoDe("carnet_vacunas", (q) => q.is("deleted_at", null));
    const contrato = await unoDe("contratos", (q) => q.eq("estado", "pendiente_firma"));
    // Una factura con PDF, prestada al dueño mientras corre esta sección (se le regresa a su cliente al terminar).
    const { data: factura } = await SBn.from("cfdi_facturas").select("id, cliente_id").eq("negocio_id", datos.B).not("pdf_path", "is", null).limit(1).maybeSingle();
    if (factura && factura.cliente_id !== datos.clienteSoloB) {
      const prestada = await SBn.from("cfdi_facturas").update({ cliente_id: datos.clienteSoloB }).eq("id", factura.id);
      if (!prestada.error) deshacer.push(() => SBn.from("cfdi_facturas").update({ cliente_id: factura.cliente_id }).eq("id", factura.id));
      else console.log(`    · no se pudo prestar la factura al dueño (${prestada.error.message}); se revisa con la que tenga`);
    }

    // Sin «cambia tu contraseña» pendiente (otra auditoría pudo dejarle una temporal): si no, todo lleva a esa pantalla.
    const { data: u7 } = await A.auth.admin.getUserById(datos.cuentaSoloB);
    if (u7.user.app_metadata?.debe_cambiar_password) await A.auth.admin.updateUserById(datos.cuentaSoloB, { app_metadata: { ...u7.user.app_metadata, debe_cambiar_password: false } });
    const ctx7 = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx7.addCookies(await cookieDe(datos.cuentaSoloB, PORTAL));
    comprobar(!(await nombres(ctx7)).includes(PERSONAL), "el dueño solo trae la cookie del portal");
    const p7 = await ctx7.newPage();
    p7.setDefaultTimeout(60000);
    const enPortal = (pg) => !/\/login/.test(pg.url());
    // La imagen: su URL firmada está en la página y responde 200 (se pide desde la página: el navegador resuelve *.localhost).
    const imagenCargo = async (re) => p7.evaluate(async (fuente) => {
      const im = [...document.images].find((x) => new RegExp(fuente).test(x.getAttribute("src") ?? ""));
      if (!im) return false;
      const r = await fetch(im.src).catch(() => null);
      return Boolean(r?.ok);
    }, re.source);
    const pedir = (ruta) => p7.evaluate(async (u) => {
      const r = await fetch(u, { redirect: "manual" });
      return { status: r.status, tipo: r.headers.get("content-disposition") ?? "", texto: r.headers.get("content-type")?.includes("html") ? await r.text() : "" };
    }, `${BASE}${ruta}`);

    // Páginas del portal.
    for (const ruta of ["/portal", "/portal/facturas", "/portal/cambiar-contrasena"]) {
      const r = await p7.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120000 });
      comprobar(r?.status() === 200 && enPortal(p7), `${ruta}: ${r?.status()} con su sesión (${new globalThis.URL(p7.url()).pathname})`);
    }
    // La ficha de su perro: la foto y la de la bitácora (URLs firmadas que arma el servidor con la sesión del dueño).
    await p7.goto(`${BASE}/portal/perros/${perroF.id}`, { waitUntil: "networkidle", timeout: 120000 });
    const textoFicha = (await p7.locator("body").textContent()).replace(/\s+/g, " ");
    comprobar(enPortal(p7) && textoFicha.includes(`AUD sesion ${sufijo7}`), `/portal/perros/<id>: la ficha de su perro (${new globalThis.URL(p7.url()).pathname}: «${textoFicha.slice(0, 120)}»)`);
    comprobar(await imagenCargo(/auditoria-foto-/), "la foto de su perro carga (URL firmada con su sesión)");
    comprobar(await imagenCargo(/auditoria-bitacora-/), "la foto de la bitácora carga");
    // Acción del servidor de la ficha («Guardar cambios» de los datos de su perro).
    const guardarPerro = p7.getByRole("button", { name: "Guardar cambios" }).last();
    if (await guardarPerro.count()) {
      await guardarPerro.click();
      await p7.getByText("Cambios guardados").first().waitFor({ timeout: 30000 }).catch(() => {});
      comprobar((await p7.getByText("Cambios guardados").count()) > 0 && enPortal(p7), "acción del servidor de su perro («Guardar cambios») con su sesión");
    } else comprobar(false, "la ficha de su perro tiene «Guardar cambios»");
    // Recetas y carnet.
    if (receta) {
      await p7.goto(`${BASE}/portal/perros/${receta.perro_id}`, { waitUntil: "networkidle", timeout: 120000 });
      comprobar(enPortal(p7) && (await p7.locator("[data-recetas-cliente]").count()) > 0, "recetas: las ve en la ficha de su mascota");
    } else console.log("    · el dueño de prueba no tiene recetas emitidas (corre recetas-dev.mjs)");
    if (vacuna) {
      await p7.goto(`${BASE}/portal/perros/${vacuna.perro_id}`, { waitUntil: "networkidle", timeout: 120000 });
      comprobar(enPortal(p7) && (await p7.locator("[data-carnet-cliente]").count()) > 0, "carnet: lo ve en la ficha de su mascota");
    } else console.log("    · el dueño de prueba no tiene carnet (corre carnet-dev.mjs)");
    // Vista previa del contrato: la ruta de /api que se abre en una pestaña («Leer contrato»).
    if (contrato) {
      const r = await pedir(`/api/contratos/${contrato.id}/preview`);
      comprobar(r.status === 200 && !/No encontramos este contrato/.test(r.texto), `vista previa del contrato (/api): ${r.status}${/No encontramos/.test(r.texto) ? " «No encontramos este contrato»" : ""}`);
    } else console.log("    · el dueño de prueba no tiene contrato pendiente");
    // Descarga del PDF y del XML de su factura.
    const { data: suya } = await SBn.from("cfdi_facturas").select("id, xml_path").eq("negocio_id", datos.B).eq("cliente_id", datos.clienteSoloB).not("pdf_path", "is", null).limit(1).maybeSingle();
    if (suya) {
      for (const formato of ["pdf", "xml"]) {
        const r = await pedir(`/portal/facturas/${suya.id}/${formato}`);
        comprobar(r.status === 200 && /attachment/.test(r.tipo), `descarga de su factura (${formato}): ${r.status}`);
      }
    } else console.log("    · no hay una factura con PDF para el dueño de prueba");
    // Acción del servidor del inicio del portal («Guardar cambios» de sus datos).
    await p7.goto(`${BASE}/portal`, { waitUntil: "networkidle", timeout: 120000 });
    await p7.getByRole("button", { name: "Guardar cambios" }).first().click();
    await p7.getByText("Cambios guardados").first().waitFor({ timeout: 30000 }).catch(() => {});
    comprobar((await p7.getByText("Cambios guardados").count()) > 0 && enPortal(p7), "acción del servidor de sus datos («Guardar cambios») con su sesión");
    await ctx7.close();
  } finally {
    for (const f of deshacer.reverse()) await Promise.resolve().then(f).catch(() => {});
  }
} finally {
  await nav.close();
  await A.auth.admin.updateUserById(datos.cuentaSoloB, { password: claveAleatoria() });
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
