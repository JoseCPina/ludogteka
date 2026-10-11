// Tramo 2 · Inventario clínico: 3 productos con lote (Grupo I, Grupo II antimicrobiano, Grupo III) por la pantalla.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, hoyISO } from "../comun.mjs";

const PRODUCTOS = [
  { nombre: "Ketamina 10% PRUEBA (Grupo I)", principio: /^ketamina/i, lote: "KET-PRUEBA-001", clave: "ketamina" },
  { nombre: "Enrofloxacina 5% PRUEBA (Grupo II)", principio: /^enrofloxacina/i, lote: "ENR-PRUEBA-001", clave: "enrofloxacina" },
  { nombre: "Probiótico oral PRUEBA (Grupo III)", principio: /probi[óo]ticos/i, lote: "PRO-PRUEBA-001", clave: "probiotico" },
];

export async function tramo(c) {
  seccion("2. Inventario clínico con lotes (admin)");
  const adm = await c.abrir("admin");
  const p = adm.p;
  await p.goto(`${BASE}/veterinaria/inventario`, { waitUntil: "networkidle" });
  comprobar(/Inventario clínico|Nuevo producto clínico/i.test(await cuerpo(p)), "abre el inventario clínico");
  await sinDesborde(p, "inventario clínico");
  const ids = {};
  for (const prod of PRODUCTOS) {
    await p.goto(`${BASE}/veterinaria/inventario/nuevo`, { waitUntil: "networkidle" });
    await p.locator('input[name="nombre"]').fill(prod.nombre);
    await p.locator('select[name="area_id"]').selectOption({ label: (await p.locator('select[name="area_id"] option').allInnerTexts()).find((t) => /botiqu/i.test(t)) });
    await p.locator('select[name="unidad_compra_id"]').selectOption({ label: "Litro" });
    await p.locator('select[name="unidad_consumo_id"]').selectOption({ label: "Mililitro" });
    const opc = (await p.locator('select[name="principio_activo_id"] option').allInnerTexts()).find((t) => prod.principio.test(t));
    comprobar(opc, `el catálogo trae el principio activo de ${prod.clave}`);
    if (opc) await p.locator('select[name="principio_activo_id"]').selectOption({ label: opc });
    await p.waitForTimeout(500);
    const grupo = await p.locator('select[name="grupo_senasica"]').inputValue();
    const lgs = await p.locator('select[name="clasificacion_lgs"]').inputValue();
    const antim = await p.locator('input[name="es_antimicrobiano"]').isChecked();
    console.log(`     · clasificación prellenada de ${prod.clave}: grupo ${grupo || "—"}, LGS ${lgs || "—"}, antimicrobiano ${antim}`);
    await p.getByRole("button", { name: "Crear producto" }).click();
    await p.waitForURL(/\/veterinaria\/inventario\/[0-9a-f-]{36}/, { timeout: 30000 }).catch(() => {});
    const m = p.url().match(/inventario\/([0-9a-f-]{36})/);
    comprobar(m, `«${prod.nombre}» creado`);
    if (!m) continue;
    ids[prod.clave] = m[1];
    await sinDesborde(p, `ficha de ${prod.clave}`);
    // La entrada del lote.
    await p.getByRole("button", { name: "Registrar entrada" }).first().click();
    await p.getByLabel("Código de lote").fill(prod.lote);
    await p.getByLabel("Fecha de caducidad").fill(hoyISO(400));
    await p.getByLabel(/^Cantidad \(/).first().fill("0.5");
    await p.locator("form").filter({ hasText: "Código de lote" }).getByRole("button", { name: "Registrar entrada" }).click();
    await p.getByText("Entrada registrada").first().waitFor({ timeout: 20000 }).catch(() => {});
    comprobar(/Entrada registrada/.test(await cuerpo(p)), `entrada de 500 ml en el lote ${prod.lote}`);
  }
  c.guardarEstado({ productos: ids });
  // Qué documento pide cada uno.
  for (const prod of PRODUCTOS) {
    if (!ids[prod.clave]) continue;
    const { data } = await c.api.admin.rpc("vet_requisito_insumo", { p_insumo: ids[prod.clave] });
    console.log(`     · ${prod.clave}: ${JSON.stringify(data)?.slice(0, 160)}`);
  }
  const { data: libres } = await c.api.admin.rpc("inventario_clinico_alertas");
  console.log(`     · alertas del inventario clínico: ${JSON.stringify(libres)?.slice(0, 160)}`);
  const lista = await adm.p.goto(`${BASE}/veterinaria/inventario`, { waitUntil: "networkidle" }).then(() => cuerpo(adm.p));
  comprobar(PRODUCTOS.every((x) => lista.includes(x.nombre.split(" ")[0])), "los 3 productos salen en la lista");
  await adm.c.close();
}
