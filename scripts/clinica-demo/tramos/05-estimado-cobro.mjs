// Tramo 5 · Estimado enviado por liga y aceptado con firma; cargos a la cuenta; cobro en efectivo; factura (sandbox si hay llave).
import { BASE, comprobar, seccion, cuerpo, sinDesborde } from "../comun.mjs";

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId;
  const perro = c.e.perroDueno;
  seccion("5a. El MVZ arma el estimado desde la consulta y lo envía por liga");
  const mvz = await c.abrir("mvz");
  const p = mvz.p;
  await p.goto(`${BASE}/veterinaria/estimados/nuevo?perro=${perro}&consulta=${c.e.consultaId}`, { waitUntil: "networkidle" });
  await p.getByLabel("Título").fill("Limpieza dental y estudios PRUEBA");
  await p.getByLabel("Descripción").first().fill("Limpieza dental con anestesia");
  await p.getByLabel("Precio mínimo").first().fill("1800");
  await p.getByLabel("Precio máximo").first().fill("2500");
  await p.getByRole("button", { name: "+ Insumo" }).click();
  await p.getByLabel("Descripción").nth(1).fill("Material de anestesia");
  await p.getByLabel("Cantidad").nth(1).fill("2");
  await p.getByLabel("Precio mínimo").nth(1).fill("60");
  await sinDesborde(p, "editor de estimado");
  comprobar(/Total estimado: \$1,920\.00 – \$2,620\.00/.test(await cuerpo(p)), "el total mínimo–máximo se calcula en pantalla");
  await p.getByRole("button", { name: "Guardar borrador" }).click();
  await p.waitForURL(/\/veterinaria\/estimados\/[0-9a-f-]{36}$/, { timeout: 30000 });
  const estId = p.url().split("/").pop();
  await p.getByRole("button", { name: "Enviar el estimado" }).click();
  const campo = p.locator("input[readonly]").first();
  await campo.waitFor({ timeout: 30000 });
  const liga = await campo.inputValue();
  comprobar(/\/e\/[A-Za-z0-9_-]{43}$/.test(liga) && liga.startsWith(BASE), "liga del estimado en el dominio de la clínica");
  await sinDesborde(p, "estimado enviado");
  await mvz.c.close();

  seccion("5b. El dueño (sin sesión) lo acepta con su firma");
  const pub = await c.abrir(null);
  const q = pub.p;
  await q.goto(liga, { waitUntil: "networkidle" });
  const t = await cuerpo(q);
  comprobar(/Limpieza dental/.test(t) && /Total estimado/.test(t), "el dueño ve el estimado con sus líneas");
  comprobar(!/Vómito|Gastroenteritis|Dictado|nota interna/i.test(t), "y nada del expediente clínico");
  await sinDesborde(q, "liga del estimado");
  await q.getByRole("button", { name: "Aceptar el estimado" }).click();
  const lienzo = q.locator('canvas[aria-label="Recuadro de firma"]');
  await lienzo.scrollIntoViewIfNeeded();
  const caja = await lienzo.boundingBox();
  await q.mouse.move(caja.x + 20, caja.y + 40);
  await q.mouse.down();
  for (let i = 1; i <= 12; i++) await q.mouse.move(caja.x + 20 + i * 12, caja.y + 40 + (i % 2) * 30);
  await q.mouse.up();
  await q.getByRole("button", { name: "Aceptar el estimado" }).click();
  await q.getByText("Estimado aceptado").first().waitFor({ timeout: 30000 }).catch(() => {});
  comprobar(/Estimado aceptado/.test(await cuerpo(q)), "firmado, queda aceptado");
  await pub.c.close();
  const { data: est } = await S.from("vet_estimados").select("estado, aceptado_via, reserva_id").eq("id", estId).single();
  comprobar(est?.estado === "aceptado" && est.aceptado_via === "liga" && est.reserva_id, "la base guarda la aceptación por liga y la cuenta");
  const { data: cargos } = await S.from("cargos_aplicados").select("precio, descripcion").eq("negocio_id", NEG).eq("reserva_id", est.reserva_id).eq("cancelado", false);
  comprobar(cargos?.length === 2 && cargos.some((x) => Number(x.precio) === 1800), `los cargos del MÍNIMO llegaron a la cuenta (${cargos?.map((x) => x.precio).join(" + ")})`);
  c.guardarEstado({ reservaEstimado: est.reserva_id });

  seccion("5c. Recepción cobra en efectivo (abre turno si hace falta)");
  const rec = await c.abrir("recepcion");
  const r = rec.p;
  await r.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  if (await r.getByLabel("Fondo inicial").count()) {
    await r.getByLabel("Fondo inicial").fill("500");
    await r.getByRole("button", { name: "Abrir turno" }).click();
    await r.getByText(/Turno abierto|Cerrar turno/).first().waitFor({ timeout: 30000 });
  }
  comprobar(/Cerrar turno|Turno abierto|Retiro/i.test(await cuerpo(r)), "hay un turno abierto");
  await sinDesborde(r, "turno de caja");
  await r.goto(`${BASE}/caja/cobrar/${est.reserva_id}`, { waitUntil: "networkidle" });
  await sinDesborde(r, "cobro de la cuenta del estimado");
  comprobar(/1,?920/.test(await cuerpo(r)), "la cuenta suma $1,920.00");
  await r.getByLabel("Monto").first().fill("1920");
  await r.getByRole("button", { name: "Registrar cobro" }).click();
  await r.getByText(/Cobro registrado|Pagada|Saldo.*0\.00/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  await r.waitForTimeout(4000);
  const { data: cob } = await S.from("cobros").select("id, origen").eq("negocio_id", NEG).eq("reserva_id", est.reserva_id);
  comprobar(cob?.length === 1 && cob[0].origen === "manual", "un cobro en efectivo registrado");
  const { data: tot } = await c.api.recepcion.rpc("cuenta_totales_reserva", { p_reserva_id: est.reserva_id });
  const t0 = Array.isArray(tot) ? tot[0] : tot;
  comprobar(Number(t0?.saldo) === 0, `la cuenta quedó en cero (saldo ${t0?.saldo})`);
  await rec.c.close();

  seccion("5d. Factura");
  const adm = await c.abrir("admin");
  await adm.p.goto(`${BASE}/admin/facturacion`, { waitUntil: "networkidle" });
  const f = await cuerpo(adm.p);
  await sinDesborde(adm.p, "facturación");
  console.log("     · facturación: " + f.slice(0, 200));
  comprobar(/Facturaci/i.test(f), "la pantalla de facturación abre");
  console.log("     · NO PROBADO: no hay FACTURAPI_TEST_KEY (el negocio no tiene llave del PAC); el timbrado en sandbox queda pendiente.");
  await adm.c.close();
}
