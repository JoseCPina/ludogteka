// QA R50 en PRODUCCIÓN, en el negocio PRUEBA de QA que lo reportó (prueba-qa-onboarding-hotel-s16, y solo ahí), con
// navegador. Antes del arreglo sirve para anotar qué se ve; después del despliegue, para verificarlo en el mismo negocio.
// Sale con 1 si alguno sigue mal.
//
//   node scripts/auditoria/qa-r50-prod.mjs [--fotos] [--escribir]
//
// N133 · «Nueva reserva» de Hotel con «PRUEBA QA R49 SinTalla» (cliente «PRUEBA QA S37 Hotel»): al marcar
//        el perro tiene que salir «Falta la talla de …: sin ella no se puede calcular el precio» con el selector de talla
//        ahí mismo, y «Crear reserva» deshabilitado mientras falte.
//        Con --escribir (solo después de desplegar): escoge una talla en ese selector, la guarda en el expediente y revisa
//        que el aviso se va, sale el precio y «Crear reserva» se habilita (sin crear la reserva); al final le quita la
//        talla otra vez para que el caso de QA quede como lo dejó QA.
// N136 · Detalle de la reserva de «PRUEBA QA S38 Perro Hotel» (26 a 28 oct, salida anticipada el 26): el bloque de la
//        estancia tiene que dar el mismo total que el encabezado y que la base (cuenta_lineas_reserva), con las noches
//        reales y la línea del ajuste por salida anticipada con su motivo.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const FOTOS = process.argv.includes("--fotos");
const ESCRIBIR = process.argv.includes("--escribir");
const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const ver = (t) => console.log(`    · ${t}`);
const texto = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const foto = async (p, nombre) => {
  if (!FOTOS) return;
  const ruta = path.join(os.tmpdir(), `qa-r50-${nombre}.png`);
  await p.screenshot({ path: ruta, fullPage: true });
  ver(`foto: ${ruta}`);
};
const dinero = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const HOT = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
const nav = await abrirNavegador();
async function pagina(rol) {
  const s = await HOT.sesion(rol);
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(s.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(60000);
  return { p, api: comoPersona(s.token, HOT.negocio.id) };
}

// ── N133 · Nueva reserva con un perro sin talla
console.log("\nN133 · reservar un perro sin talla");
{
  const { data: perro } = await HOT.N.from("perros").select("id, nombre, tamano_id, cliente_id, clientes(nombre)").eq("negocio_id", HOT.negocio.id).eq("nombre", "PRUEBA QA R49 SinTalla").is("deleted_at", null).single();
  const cliente = perro?.clientes?.nombre;
  ver(`${perro?.nombre} (cliente ${cliente}): talla en el expediente ${perro?.tamano_id ? "sí" : "no"}`);
  const { p } = await pagina("admin");
  // Este negocio solo tiene Hotel prendido; Guardería y Estética se prueban en desarrollo (talla-precio-dev.mjs).
  for (const modulo of ["hotel"]) {
    await p.goto(`${HOT.base}/${modulo}/nueva`);
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.locator("input[type=text], input[type=search], input:not([type])").first().fill("S37 Hotel");
    await p.getByText(cliente, { exact: true }).first().click();
    const casilla = p.getByLabel(perro.nombre, { exact: true });
    await casilla.waitFor({ timeout: 30000 });
    if (!(await casilla.isChecked())) await casilla.check();
    // Lo que la pantalla dice del perro marcado (avisos de evaluación, vacunas, recomendados y talla).
    await p.waitForTimeout(4000);
    await p.waitForLoadState("networkidle").catch(() => {});
    const tarjeta = p.locator("div.rounded-lg").filter({ has: casilla }).first();
    const dice = await texto(tarjeta);
    const crear = p.getByRole("button", { name: "Crear reserva" });
    const deshabilitado = await crear.isDisabled();
    const aviso = await texto(p.locator("[data-falta-dato-precio]").first());
    const selector = await p.locator("[data-falta-dato-precio] select").count();
    const recomendado = await texto(p.locator("[data-datos-recomendados]").first());
    ver(`${HOT.base}/${modulo}/nueva → aviso de talla: «${aviso || "(ninguno)"}»; selector de talla: ${selector ? "sí" : "no"}; «Crear reserva» ${deshabilitado ? "deshabilitado" : "HABILITADO"}`);
    ver(`«Recomendado»: «${recomendado || "(no sale)"}»`);
    if (!aviso) ver(`la tarjeta del perro dice: «${dice.slice(0, 400)}»`);
    const ok = new RegExp(`Falta la talla de ${perro.nombre}: sin ella no se puede calcular el precio`).test(aviso) && selector > 0 && deshabilitado;
    if (ok) bien(`${modulo}: «${aviso.slice(0, 120)}», con el selector de talla y «Crear reserva» deshabilitado`);
    else mal(`${modulo}: aviso de talla ${aviso ? "sí" : "NO"}, selector ${selector ? "sí" : "NO"}, «Crear reserva» ${deshabilitado ? "deshabilitado" : "HABILITADO"}`);
    await foto(p, `n133-${modulo}`);

    if (ESCRIBIR && ok && modulo === "hotel") {
      const opciones = await p.locator("[data-falta-dato-precio] select").first().locator("option").evaluateAll((xs) => xs.map((x) => ({ v: x.value, t: x.textContent })).filter((x) => x.v));
      await p.locator("[data-falta-dato-precio] select").first().selectOption(opciones[0].v);
      await p.locator("[data-falta-dato-precio]").getByRole("button").first().click();
      await p.locator("[data-falta-dato-precio]").waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
      await p.waitForLoadState("networkidle").catch(() => {});
      const precio = await texto(p.locator("[data-precio-linea]").first());
      const sigue = await p.locator("[data-falta-dato-precio]").count();
      const habilitado = !(await crear.isDisabled());
      const { data: guardado } = await HOT.N.from("perros").select("tamano_id").eq("id", perro.id).single();
      ver(`después de escoger «${opciones[0].t}»: talla guardada ${guardado?.tamano_id ? "sí" : "no"}; aviso ${sigue ? "SIGUE" : "se fue"}; precio «${precio || "(no sale)"}»; «Crear reserva» ${habilitado ? "habilitado" : "deshabilitado"}`);
      // «Crear reserva» puede seguir deshabilitado por la evaluación o las vacunas de este perro de QA: lo que se exige aquí
      // es que la talla ya no sea lo que lo detiene y que el precio se vea.
      if (guardado?.tamano_id === opciones[0].v && !sigue && /\$\d/.test(precio)) bien(`la talla se guardó en el expediente y la pantalla recalculó: «${precio}»`);
      else mal(`al escoger la talla: guardada ${guardado?.tamano_id ? "sí" : "NO"}, aviso ${sigue ? "SIGUE" : "se fue"}, precio «${precio}»`);
      await foto(p, "n133-hotel-con-talla");
      // El caso de QA se queda como estaba: sin talla.
      await HOT.N.from("perros").update({ tamano_id: null }).eq("id", perro.id);
    }
  }
  await p.context().close();
}

// ── N136 · El bloque de la estancia y el encabezado, con salida anticipada
console.log("\nN136 · total de la estancia con salida anticipada");
{
  const { data: perro } = await HOT.N.from("perros").select("id").eq("negocio_id", HOT.negocio.id).eq("nombre", "PRUEBA QA S38 Perro Hotel").is("deleted_at", null).single();
  const { data: est } = await HOT.N.from("estancias").select("id, reserva_id, fecha_entrada, fecha_salida, estado").eq("perro_id", perro.id).eq("estado", "finalizada").is("deleted_at", null).order("created_at").limit(1).single();
  const { p, api } = await pagina("admin");
  const { data: lineas } = await api.rpc("cuenta_lineas_reserva", { p_reserva_id: est.reserva_id });
  const { data: tot } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: est.reserva_id });
  const totalBase = Number(tot?.[0]?.total_cuenta);
  ver(`base: ${(lineas ?? []).map((l) => `${l.tipo} ${l.descripcion} ${l.cantidad} × ${l.precio_unitario} = ${l.total}`).join(" | ")}; total ${dinero(totalBase)}`);
  await p.goto(`${HOT.base}/reservas/${est.reserva_id}`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const encabezado = await texto(p.locator("[data-total-cuenta]").first());
  const bloque = await texto(p.locator(`[data-estancia="${est.id}"]`).first().or(p.locator("div.rounded-lg.border").filter({ hasText: "PRUEBA QA S38 Perro Hotel" }).first()));
  ver(`${HOT.base}/reservas/${est.reserva_id} → encabezado «${encabezado}»`);
  ver(`bloque de la estancia: «${bloque.slice(0, 600)}»`);
  const totalBloque = await texto(p.locator("[data-total-estancia]").first());
  const conNochesReales = /1 noche × \$450\.00/.test(bloque);
  const conAjuste = /Ajuste por salida anticipada: −\$450\.00/.test(bloque);
  const sinTotalViejo = !/\$?900(\.00)?\b/.test(bloque.replace(/2 noches reservadas[^$]*\$[\d,.]+[^$]*\$[\d,.]+/, ""));
  const mismoTotal = totalBloque.includes(dinero(totalBase)) && encabezado.includes(dinero(totalBase));
  if (conNochesReales && conAjuste && mismoTotal && sinTotalViejo) bien(`el bloque dice «1 noche × $450.00», «Ajuste por salida anticipada: −$450.00» y total «${totalBloque}», igual que el encabezado (${encabezado}) y la base`);
  else mal(`bloque: noches reales ${conNochesReales ? "sí" : "NO"}, línea de ajuste ${conAjuste ? "sí" : "NO"}, total del bloque «${totalBloque || "(no sale)"}» vs encabezado «${encabezado}» y base ${dinero(totalBase)}${sinTotalViejo ? "" : ", y sigue diciendo $900 como total"}`);
  await foto(p, "n136-reserva");
  await p.context().close();
}

await nav.close();
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exitCode = hallazgos.length ? 1 : 0;
