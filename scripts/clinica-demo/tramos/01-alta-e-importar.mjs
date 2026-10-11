// Tramo 1 · Alta del cliente por liga (con campos clínicos) y 5 clientes importados desde un .xlsx.
import { BASE, comprobar, seccion, cuerpo, sinDesborde, PDF, hoyISO } from "../comun.mjs";
import { xlsx } from "../xlsx.mjs";

const TEL_LIGA = "4441300002";
export async function tramo(c) {
  const S = c.S;
  const NEG = c.e.negocioId;
  seccion("1a. Alta por liga (recepción genera la liga; el dueño la llena en su celular)");
  const rec = await c.abrir("recepcion");
  await rec.p.goto(`${BASE}/clientes/invitaciones`, { waitUntil: "networkidle" });
  await rec.p.getByLabel("¿Para quién es?").fill("Cliente Liga PRUEBA");
  await rec.p.getByLabel("Teléfono (WhatsApp)").fill(TEL_LIGA);
  await rec.p.getByLabel("¿Para qué viene?").selectOption({ label: (await rec.p.locator("select option").allInnerTexts()).find((t) => /guarder|hotel/i.test(t)) });
  await sinDesborde(rec.p, "pantalla de links de alta");
  await rec.p.getByRole("button", { name: "Generar link" }).click();
  const campo = rec.p.locator("input[readonly]").first();
  await campo.waitFor({ timeout: 30000 });
  const liga = await campo.inputValue();
  comprobar(/\/alta\/[A-Za-z0-9_-]{32,}$/.test(liga) && liga.startsWith(BASE), `liga de alta del negocio (${liga.replace(/[A-Za-z0-9_-]{32,}$/, "…")})`);

  const dueno = await c.abrir(null);
  const p = dueno.p;
  await p.goto(liga, { waitUntil: "networkidle" });
  comprobar(/Lo que le vamos a pedir a tu perro|Clínica Demo PeluDesk/i.test(await cuerpo(p)), "el alta abre con el nombre de la clínica");
  await sinDesborde(p, "alta (paso 1)");
  await p.getByLabel("Tu nombre completo").fill("Cliente Liga PRUEBA");
  await p.getByLabel("Tu teléfono").fill(TEL_LIGA);
  await p.getByRole("button", { name: "Siguiente" }).click();
  // Primer animal: perro con campos clínicos.
  await p.getByLabel("¿Cómo se llama?").first().fill("Rocco Liga");
  await p.getByLabel("Tamaño").first().selectOption({ index: 2 });
  const clinico = p.getByText("Datos de salud (opcional)").first();
  comprobar(await clinico.count() > 0, "el alta ofrece «Datos de salud» (especie, esterilizado, microchip) porque Veterinaria está prendida");
  await p.getByLabel("¿Está esterilizado?").first().selectOption("si");
  await p.getByLabel("Número de microchip").first().fill("985000000PRUEBA1");
  await p.getByRole("button", { name: "Agregar otro perro" }).click();
  await p.getByLabel("¿Cómo se llama?").nth(1).fill("Michi Liga");
  await p.getByLabel("Tamaño").nth(1).selectOption({ index: 1 });
  await p.getByLabel("Especie").nth(1).selectOption("gato");
  await p.getByRole("button", { name: "Siguiente" }).click();
  // Vacunas: sube un PDF al primer requisito del perro.
  await p.locator("[data-comprobantes-perro]").first().waitFor({ timeout: 20000 }).catch(() => {});
  const req = p.locator("[data-requisito]").first();
  if (await req.count()) {
    await req.getByLabel("Fecha en que se aplicó").fill(hoyISO(-30));
    await req.locator('input[type="file"]').setInputFiles({ name: "carnet.pdf", mimeType: "application/pdf", buffer: PDF });
  } else comprobar(false, "no apareció el paso de vacunas");
  await p.getByRole("button", { name: "Siguiente" }).click();
  await p.getByLabel("Tu contraseña", { exact: true }).fill("Prueba-Liga-2026");
  await p.getByLabel("Repite tu contraseña").fill("Prueba-Liga-2026");
  await sinDesborde(p, "alta (contraseña)");
  await p.getByRole("button", { name: "Terminar mi registro" }).click();
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(8000);
  const t = await cuerpo(p);
  comprobar(/registro quedó listo|Registrado|firmar|contrato|Falta|Este es tu portal/i.test(t), `el alta termina y dice qué sigue (${t.slice(0, 140)})`);
  await sinDesborde(p, "alta (final)");

  const { data: cli } = await S.from("clientes").select("id, nombre, telefono").eq("negocio_id", NEG).eq("telefono", TEL_LIGA).is("deleted_at", null).maybeSingle();
  comprobar(cli, "el cliente quedó creado en la clínica (y solo en la clínica)");
  if (cli) {
    const { data: perros } = await S.from("perros").select("id, nombre, especie, microchip, esterilizado").eq("negocio_id", NEG).eq("cliente_id", cli.id).is("deleted_at", null).order("created_at");
    comprobar(perros?.length === 2, `con sus dos mascotas (${perros?.map((x) => `${x.nombre}:${x.especie}`).join(", ")})`);
    const rocco = perros?.find((x) => x.especie === "perro");
    comprobar(rocco?.microchip === "985000000PRUEBA1" && rocco?.esterilizado === true, "los campos clínicos quedaron en la ficha");
    c.guardarEstado({ clienteLiga: cli.id, perroLiga: rocco?.id, gatoLiga: perros?.find((x) => x.especie === "gato")?.id });
  }

  seccion("1b. Importar 5 clientes desde un .xlsx (admin)");
  const adm = await c.abrir("admin");
  const q = adm.p;
  const enc = ["Nombre del cliente", "Celular", "Correo electrónico", "Mascota", "Especie", "Raza", "Sexo", "Fecha de nacimiento", "Tamaño", "Peso (kg)", "Alergias", "Microchip"];
  const filas = [
    enc,
    ["Cliente Demo (WhatsApp de PeluDesk)", 4441301539, "", "Firulais", "Perro", "Labrador", "Macho", "15/03/2021", "Grande", 28.5, "Pollo", "985000000PRUEBA2"],
    ["Cliente Demo (WhatsApp de PeluDesk)", 4441301539, "", "Michi", "Gato", "", "Hembra", "10/06/2022", "Chico", 4.2, "", ""],
    ["Luis Ortega Demo", 4420000101, "", "Toby", "Perro", "Beagle", "Macho", "02/02/2020", "Mediano", 11, "", ""],
    ["Ana Villa Demo", 4420000102, "", "Nube", "Gato", "", "Hembra", "", "", "", "", ""],
    ["Jorge Salas Demo", 4420000103, "", "Rex", "Perro", "Pastor alemán", "Macho", "", "Grande", 32, "", ""],
    ["Paty Núñez Demo", 4420000104, "", "Lola", "Perro", "Poodle", "Hembra", "", "Chico", 6, "", ""],
  ];
  await q.goto(`${BASE}/admin/importar`, { waitUntil: "networkidle" });
  await sinDesborde(q, "importador");
  await q.setInputFiles('[data-testid="archivo-importar"]', { name: "clientes-demo.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsx(filas) });
  await q.getByText(/Revisa a qué campo corresponde/).first().waitFor({ timeout: 40000 });
  await q.getByRole("button", { name: "Revisar antes de importar" }).click();
  await q.getByText(/Se importan/).first().waitFor({ timeout: 40000 });
  await q.getByRole("button", { name: /^Importar \d+ filas/ }).click();
  const fin = await q.getByText(/Importación terminada/).first().waitFor({ timeout: 120000 }).then(() => true).catch(() => false);
  comprobar(fin, "la importación termina");
  await sinDesborde(q, "importación terminada");
  const { data: dueno1 } = await S.from("clientes").select("id").eq("negocio_id", NEG).eq("telefono", "4441301539").is("deleted_at", null).maybeSingle();
  comprobar(dueno1, "el cliente de prueba con tu WhatsApp (4441301539) quedó en la clínica");
  if (dueno1) {
    const { data: ps } = await S.from("perros").select("id, nombre, especie, microchip").eq("negocio_id", NEG).eq("cliente_id", dueno1.id).is("deleted_at", null).order("created_at");
    comprobar(ps?.length === 2 && ps.some((x) => x.especie === "perro") && ps.some((x) => x.especie === "gato"), `con un perro y un gato (${ps?.map((x) => `${x.nombre}:${x.especie}`).join(", ")})`);
    c.guardarEstado({ clienteDueno: dueno1.id, perroDueno: ps?.find((x) => x.especie === "perro")?.id, gatoDueno: ps?.find((x) => x.especie === "gato")?.id });
  }
  const { count } = await S.from("clientes").select("id", { count: "exact", head: true }).eq("negocio_id", NEG).is("deleted_at", null);
  comprobar(count === 6, `la clínica tiene 6 clientes: el de la liga y los 5 importados (${count})`);
  for (const x of [rec, dueno, adm]) await x.c.close();
}
