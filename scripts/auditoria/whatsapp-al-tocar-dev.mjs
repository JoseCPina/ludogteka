// QA S41 (link sin enviar, 28 oct 2026): cada botón que genera un link y abre WhatsApp, EN PANTALLA, en celular y en
// escritorio. SOLO DESARROLLO, en Huellitas, con `next start` en el 3001 (npm run build antes):
//
//   node scripts/auditoria/whatsapp-al-tocar-dev.mjs
//
// Por cada botón comprueba que se genera el link y que se abre wa.me con el mensaje (y el link adentro). El «celular»
// bloquea las ventanas como iPhone: `window.open` solo funciona dentro del toque, no después de esperar al servidor
// (Chromium de escritorio lo deja pasar unos segundos). Con el código anterior falla: «Mandarle un link» de un perro
// cuyo dueño tiene cuenta (Goku) no abría nada, y «Reenviar» y «Notificar por WhatsApp» se bloqueaban en el celular.
// Si el navegador no deja abrir, también vale que la pantalla enseñe el link con «Copiar» y «Abrir WhatsApp» y que
// ese botón abra wa.me.
//
// Lo que crea lleva «AUDITORIA WA» y se quita al terminar (cliente y perro dados de baja, links cancelados, entrada
// de bitácora borrada).
import { abrirNavegador } from "../lib/navegador.mjs";
import { cookiesDe, BASE } from "./lib/huellitas-navegador.mjs";

const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");

const MARCA = "AUDITORIA WA";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const limpieza = [];

// Como iPhone: `window.open` solo dentro del toque (mismo turno del evento), nunca después de una espera.
const BLOQUEO_COMO_IPHONE = () => {
  let enToque = false;
  const marcar = () => {
    enToque = true;
    setTimeout(() => (enToque = false), 0);
  };
  for (const t of ["click", "touchend", "pointerup", "keydown"]) window.addEventListener(t, marcar, true);
  const abrir = window.open.bind(window);
  window.open = (...a) => (enToque ? abrir(...a) : null);
};

const EQUIPOS = {
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  escritorio: { viewport: { width: 1280, height: 900 } },
};

const nav = await abrirNavegador();

async function pestana(profileId, equipo) {
  const { cookies } = await cookiesDe(profileId);
  const c = await nav.newContext(EQUIPOS[equipo]);
  await c.addCookies(cookies);
  if (equipo === "celular") await c.addInitScript(BLOQUEO_COMO_IPHONE);
  const abiertos = [];
  // WhatsApp no se abre de verdad: se anota la dirección y se contesta una página vacía.
  await c.route(/wa\.me|api\.whatsapp\.com/, (r) => {
    abiertos.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp (auditoría)</title>" });
  });
  const p = await c.newPage();
  p.setDefaultTimeout(30000);
  p.setDefaultNavigationTimeout(90000);
  p.on("dialog", (d) => d.accept());
  return { c, p, abiertos };
}

/** Toca, y espera a que se abra wa.me; si no, prueba el «Abrir WhatsApp» que la pantalla debe enseñar. */
async function tocarYVer(t, boton, equipo, titulo, contiene) {
  const antes = t.abiertos.length;
  try {
    await boton.waitFor({ timeout: 10000 });
  } catch {
    comprobar(false, `${equipo}: ${titulo} — el botón no está en la pantalla`);
    return false;
  }
  if (equipo === "celular") await boton.tap();
  else await boton.click();
  const fin = Date.now() + 25000;
  while (Date.now() < fin && t.abiertos.length === antes) await espera(300);
  let como = "al tocar";
  if (t.abiertos.length === antes) {
    // Plan B: el link a la vista con «Abrir WhatsApp» (un enlace de verdad).
    const respaldo = t.p.locator("[data-abrir-whatsapp]").last();
    if (await respaldo.count()) {
      if (equipo === "celular") await respaldo.tap();
      else await respaldo.click();
      const fin2 = Date.now() + 10000;
      while (Date.now() < fin2 && t.abiertos.length === antes) await espera(300);
      como = "con «Abrir WhatsApp» (el navegador lo bloqueó)";
    }
  }
  const url = t.abiertos.at(-1) ?? "";
  const texto = decodeURIComponent((url.match(/[?&]text=([^&]*)/) ?? [])[1] ?? "").replace(/\+/g, " ");
  const ok = t.abiertos.length > antes && contiene.test(texto);
  comprobar(ok, `${equipo}: ${titulo} abre WhatsApp ${ok ? como : ""} con el mensaje y el link${ok ? "" : ` (abrió: ${t.abiertos.length > antes ? texto.slice(0, 120) || url.slice(0, 80) : "nada"})`}`);
  return ok;
}

async function ir(p, ruta) {
  await p.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" }).catch(() => {});
}

try {
  // Un cliente SIN cuenta en el portal con su perro (le falta todo para guardería y hotel).
  const sufijo = String(Date.now()).slice(-6);
  const tel = `44400${sufijo.slice(-5)}`;
  const cliente = (await SB.from("clientes").insert({ negocio_id: B, nombre: `${MARCA} ${sufijo}`, telefono: tel }).select("id").single()).data;
  limpieza.push(() => SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", cliente.id));
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: cliente.id, nombre: `${MARCA} ${sufijo}` }).select("id").single()).data;
  limpieza.push(() => SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perro.id));
  // Los links que cree la corrida se cancelan al final.
  const desde = new Date().toISOString();
  limpieza.push(() => SB.from("invitaciones_cliente").update({ cancelada_at: new Date().toISOString() }).eq("negocio_id", B).gte("created_at", desde).is("usada_at", null));
  // Una entrada de bitácora del perro, para «Notificar por WhatsApp».
  const entrada = (await SB.from("bitacora_entradas").insert({ negocio_id: B, perro_id: perro.id, tipo: "actualizacion", nota: `${MARCA}: comió bien.` }).select("id").single()).data;
  limpieza.push(() => SB.from("bitacora_entradas").delete().eq("id", entrada.id));
  // El dueño con cuenta: el perro de la cuenta de Huellitas (como Goku).
  const conCuenta = { cliente: datos.clienteSoloB, perro: datos.perroSoloB };

  for (const equipo of ["celular", "escritorio"]) {
    seccion(`${equipo} · recepción`);
    const t = await pestana(datos.recepcionB, equipo);

    await ir(t.p, `/perros/${conCuenta.perro}`);
    const b1 = t.p.getByRole("button", { name: "Mandarle un link" });
    if (await b1.count()) await tocarYVer(t, b1, equipo, "«Mandarle un link» de un perro cuyo dueño tiene cuenta (Goku)", new RegExp(`/portal/perros/${conCuenta.perro}`));
    else comprobar(false, `${equipo}: el perro de un dueño con cuenta enseña «Mandarle un link» (no apareció: ¿no le falta nada?)`);

    await ir(t.p, `/perros/${perro.id}`);
    await tocarYVer(t, t.p.getByRole("button", { name: "Mandarle un link" }), equipo, "«Mandarle un link» de un perro cuyo dueño no tiene cuenta", /\/alta\/[0-9a-f]+/);
    await tocarYVer(t, t.p.getByRole("button", { name: "Notificar por WhatsApp" }).first(), equipo, "«Notificar por WhatsApp» de la bitácora", /comió bien/);

    await ir(t.p, `/clientes/${cliente.id}`);
    await tocarYVer(t, t.p.getByRole("button", { name: "Generar link" }), equipo, "«Generar link» para completar (ficha del cliente)", /\/alta\/[0-9a-f]+/);
    await t.p.getByRole("button", { name: "Invitar al portal" }).click();
    await t.p.locator("[data-aviso='Invitar al portal']").click();
    await tocarYVer(t, t.p.locator("[data-vista-mensaje] [data-abrir-whatsapp]"), equipo, "«Invitar al portal»", /\/activar\//);

    await ir(t.p, `/clientes/${conCuenta.cliente}`);
    await tocarYVer(t, t.p.locator("[data-mandar-link-portal]"), equipo, "«Mandarle el link de su portal» (cliente con cuenta)", /\/portal/);

    await ir(t.p, "/clientes/invitaciones");
    await t.p.getByLabel("¿Para quién es?").fill(`${MARCA} alta ${equipo}`);
    await t.p.getByLabel("Teléfono (WhatsApp)").fill(`44401${sufijo.slice(-5)}`);
    await tocarYVer(t, t.p.getByRole("button", { name: "Generar link" }), equipo, "«Generar link» de alta (Altas por link)", /\/alta\/[0-9a-f]+/);
    await ir(t.p, "/clientes/invitaciones");
    await tocarYVer(t, t.p.getByRole("button", { name: "Reenviar" }).first(), equipo, "«Reenviar» un link de alta", /\/alta\/[0-9a-f]+/);
    await t.c.close();

    seccion(`${equipo} · admin`);
    const a = await pestana(datos.adminB, equipo);
    await ir(a.p, `/clientes/${conCuenta.cliente}`);
    await a.p.getByRole("button", { name: "Restablecer contraseña" }).click();
    await a.p.getByRole("button", { name: "Sí, restablecer" }).click();
    await a.p.getByText("Contraseña temporal").waitFor();
    await tocarYVer(a, a.p.getByRole("link", { name: "Mandársela por WhatsApp" }), equipo, "«Mandársela por WhatsApp» (contraseña temporal)", /contraseña|Contraseña/);
    await a.c.close();
  }
} finally {
  await nav.close();
  for (const f of limpieza.reverse()) await Promise.resolve().then(f).catch(() => {});
}
terminar();
