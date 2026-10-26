// QA S36 · N128: agendar en un día cerrado (o que ya pasó su cierre). El formulario abre EN ese día, con «Fuera de
// horario: el negocio está cerrado ese día» y la propuesta del siguiente horario abierto («Te propongo el lunes 2 a las
// 09:00»), visible; nunca cambia la fecha en silencio. La misma utilería en Estética, Veterinaria, Hotel y Guardería.
// SOLO DESARROLLO (Huellitas, que cierra los domingos), con `next start` en el 3001:
//
//   node scripts/auditoria/agendar-dia-cerrado-dev.mjs
//
// 1. Lógica (sin servidor): día cerrado, «ya pasó el cierre», propuesta y su texto.
// 2. En pantalla, desde el «Agendar» de la agenda del día cerrado: Estética y Veterinaria (fecha, aviso, propuesta y
//    «Usar esa hora»), Hotel y Guardería (aviso al abrir, propuesta y «Usar ese día»).
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
registerHooks({
  resolve(especificador, contexto, siguiente) {
    let e = especificador.startsWith("@/") ? pathToFileURL(SRC + especificador.slice(2)).href : especificador;
    if ((e.startsWith("file:") || e.startsWith(".")) && !/\.\w+$/.test(e)) {
      const ruta = fileURLToPath(new URL(e, e.startsWith("file:") ? undefined : contexto.parentURL));
      if (existsSync(`${ruta}.ts`)) e = pathToFileURL(`${ruta}.ts`).href;
    }
    return siguiente(e, contexto);
  },
});

const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe, esperarTexto } = await import("./lib/huellitas-navegador.mjs");
const horario = await import("../../src/lib/estetica/aviso-horario.ts").catch(() => null);

seccion("1. Lógica: qué día no sirve y qué se propone");
if (!horario?.motivoDiaNoDisponible) {
  comprobar(false, "existe la utilería compartida del día cerrado (motivoDiaNoDisponible / siguienteHorarioAbierto / textoPropuesta)");
} else {
  const { motivoDiaNoDisponible, siguienteHorarioAbierto, textoPropuesta } = horario;
  // Domingo cerrado, sábado de 10 a 14, entre semana de 9 a 19 (como Huellitas).
  const semana = { 0: null, 1: { apertura: "09:00", cierre: "19:00" }, 2: { apertura: "09:00", cierre: "19:00" }, 3: { apertura: "09:00", cierre: "19:00" }, 4: { apertura: "09:00", cierre: "19:00" }, 5: { apertura: "09:00", cierre: "19:00" }, 6: { apertura: "10:00", cierre: "14:00" } };
  comprobar(motivoDiaNoDisponible("2026-11-01", semana, { hoy: "2026-10-26", minutos: 600 }) === "cerrado", "un domingo está cerrado");
  comprobar(motivoDiaNoDisponible("2026-10-26", semana, { hoy: "2026-10-26", minutos: 19 * 60 + 5 }) === "ya_cerro", "hoy a las 19:05, con cierre a las 19:00: ya cerró");
  comprobar(motivoDiaNoDisponible("2026-10-26", semana, { hoy: "2026-10-26", minutos: 18 * 60 }) === null, "hoy a las 18:00 todavía sirve");
  const p1 = siguienteHorarioAbierto("2026-11-01", semana, { hoy: "2026-10-26", minutos: 600 });
  comprobar(p1?.fecha === "2026-11-02" && p1?.hora === "09:00", `del domingo propone el lunes a la apertura (${JSON.stringify(p1)})`);
  const p2 = siguienteHorarioAbierto("2026-10-31", semana, { hoy: "2026-10-31", minutos: 14 * 60 + 10 });
  comprobar(p2?.fecha === "2026-11-02", `el sábado después de las 14:00 salta el domingo cerrado (${p2?.fecha})`);
  const p3 = siguienteHorarioAbierto("2026-11-01", semana, { hoy: "2026-10-26", minutos: 600 }, false);
  comprobar(p3?.hora === null, "sin hora (hotel y guardería) propone solo el día");
  comprobar(textoPropuesta({ fecha: "2026-10-26", hora: "09:30" }) === "Te propongo el lunes 26 a las 09:30", `texto: «${textoPropuesta({ fecha: "2026-10-26", hora: "09:30" })}»`);
  comprobar(textoPropuesta({ fecha: "2026-11-02", hora: null }) === "Te propongo el lunes 2", "texto sin hora: «Te propongo el lunes 2»");
}

// El siguiente día cerrado de Huellitas (por su horario) desde mañana.
const { data: n } = await SB.from("negocios").select("zona_horaria").eq("id", B).single();
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: n.zona_horaria }).format(new Date());
const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
let cerrado = null;
let abierto = null;
for (let i = 1; i <= 14 && !(cerrado && abierto); i++) {
  const f = sumar(hoy, i);
  const { data } = await SB.rpc("resolver_cupo_configuracion", { p_fecha: f });
  const fila = Array.isArray(data) ? data[0] : data;
  if (fila?.estado !== "configurado") continue;
  if (fila.hora_apertura == null && !cerrado) cerrado = f;
  else if (cerrado && fila.hora_apertura != null && !abierto) abierto = { fecha: f, apertura: String(fila.hora_apertura).slice(0, 5) };
}
if (!cerrado) throw new Error("Huellitas no tiene un día cerrado en su horario de las próximas dos semanas.");
console.log(`  · día cerrado ${cerrado}; el siguiente abierto ${abierto?.fecha} desde las ${abierto?.apertura}`);
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const textoEsperado = (f, hora) => `Te propongo el ${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${Number(f.slice(8))}${hora ? ` a las ${hora}` : ""}`;

const nav = await abrirNavegador();
try {
  const { p, c } = await abrirComo(nav, datos.adminB, B);
  const AVISO = /Fuera de horario: el negocio está cerrado ese día/;

  seccion("2. Estética: «Agendar» desde la vista Día del día cerrado");
  await p.goto(`${BASE}/estetica?vista=dia&fecha=${cerrado}`, { waitUntil: "networkidle" });
  const href = await p.locator("[data-agendar-fecha]").first().getAttribute("href");
  comprobar(href === `/estetica/nueva?fecha=${cerrado}`, `«Agendar» lleva el día cerrado (${href})`);
  await p.goto(`${BASE}${href}&cliente=${datos.clienteSoloB}`, { waitUntil: "networkidle" });
  const campo = p.locator('input[type="datetime-local"]').first();
  await campo.waitFor();
  const valor = await campo.inputValue();
  comprobar(valor.startsWith(cerrado), `el formulario abre EN el día cerrado (${valor}), no lo cambia en silencio`);
  const cuerpo = await textoDe(p);
  comprobar(AVISO.test(cuerpo), "dice «Fuera de horario: el negocio está cerrado ese día»");
  const prop = await p.locator("[data-propuesta-horario]").first().getAttribute("data-propuesta-horario").catch(() => null);
  comprobar(Boolean(prop) && prop.startsWith(abierto.fecha), `propone el siguiente horario abierto (${prop})`);
  comprobar(cuerpo.includes(textoEsperado(abierto.fecha, prop?.slice(11, 16))), `se ve «${textoEsperado(abierto.fecha, prop?.slice(11, 16))}»`);
  await p.locator("[data-usar-propuesta]").first().click().catch(() => {});
  comprobar((await campo.inputValue()) === prop, `«Usar esa hora» deja ${prop} y quita el aviso`);
  comprobar(!AVISO.test(await textoDe(p)), "sin el aviso después de usar la propuesta");

  seccion("3. Veterinaria: «Agendar» desde la agenda del día cerrado");
  await p.goto(`${BASE}/veterinaria/agenda?vista=dia&fecha=${cerrado}`, { waitUntil: "networkidle" });
  const hrefVet = await p.locator("[data-agendar-fecha]").first().getAttribute("href");
  comprobar(hrefVet === `/veterinaria/agenda/nueva?fecha=${cerrado}`, `«Agendar» de Vet lleva el día cerrado (${hrefVet})`);
  await p.goto(`${BASE}${hrefVet}&perro=${datos.perroSoloB}`, { waitUntil: "networkidle" });
  const fechaVet = p.locator('input[name="fecha"]');
  await fechaVet.waitFor();
  comprobar((await fechaVet.inputValue()) === cerrado, `Vet abre en el día cerrado (${await fechaVet.inputValue()})`);
  comprobar(AVISO.test(await textoDe(p)), "Vet: «Fuera de horario: el negocio está cerrado ese día»");
  const propVet = await p.locator("[data-propuesta-horario]").first().getAttribute("data-propuesta-horario").catch(() => null);
  comprobar(Boolean(propVet) && propVet.startsWith(abierto.fecha), `Vet propone ${propVet}`);
  await p.locator("[data-usar-propuesta]").first().click().catch(() => {});
  comprobar((await fechaVet.inputValue()) === abierto.fecha && (await p.locator('input[name="hora"]').inputValue()) === propVet?.slice(11, 16), "Vet: «Usar esa hora» pone fecha y hora");

  for (const [nombre, ruta] of [["Hotel", "/hotel/nueva"], ["Guardería", "/guarderia/nueva"]]) {
    seccion(`4. ${nombre}: nueva reserva con el día cerrado`);
    await p.goto(`${BASE}${ruta}?fecha=${cerrado}`, { waitUntil: "networkidle" });
    const t = await textoDe(p);
    comprobar(AVISO.test(t), `${nombre} dice al abrir «Fuera de horario: el negocio está cerrado ese día»`);
    comprobar(t.includes(textoEsperado(abierto.fecha, null)), `${nombre} propone «${textoEsperado(abierto.fecha, null)}»`);
    comprobar((await p.locator("[data-usar-propuesta]").count()) === 1, `${nombre}: botón «Usar ese día»`);
    if (await p.locator("[data-usar-propuesta]").count()) {
      await p.locator("[data-usar-propuesta]").first().click();
      comprobar(await esperarTexto(p, /^(?!.*Fuera de horario: el negocio está cerrado ese día)/, 5000), `${nombre}: al usar el día propuesto se quita el aviso`);
    }
  }
  await c.close();
} finally {
  await nav.close();
}
terminar();
