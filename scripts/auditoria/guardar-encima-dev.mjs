// QA S39 · N138: «Guardar los míos encima» deja la pantalla al día al momento. SOLO DESARROLLO (Huellitas), con
// `next start` en el 3001:
//
//   node --experimental-strip-types scripts/auditoria/guardar-encima-dev.mjs
//
// 1. La pieza compartida, en cada tipo de registro con control de versión: `registrosFinales` (lo que las acciones
//    devuelven al guardar) lee de la base la versión y los datos con los que quedó el registro.
// 2. En pantalla, como lo hizo QA en producción: la estilista y Recepción tienen abierta la misma cita; Recepción la
//    mueve (éxito) y la estilista guarda la suya encima → en el mismo instante en que sale «Cita reprogramada», el
//    encabezado ya dice la hora guardada y el aviso de conflicto se cerró. Recepción, con su pantalla de antes, vuelve a
//    moverla → sale el aviso de conflicto SIN el «Cita reprogramada» de antes; guarda encima → su hora al momento, solo
//    el éxito. Y un guardado siguiente desde esa misma pantalla entra sin un conflicto falso.
const { B, SB, datos, comprobar, seccion, terminar, fijarModulo } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo } = await import("./lib/huellitas-navegador.mjs");

const sufijo = String(Date.now()).slice(-6);
const creados = { citas: [], perros: [] };
const nav = await abrirNavegador();
try {
  const { p: rec, api: apiRec } = await abrirComo(nav, datos.recepcionB, B);
  const { p: est } = await abrirComo(nav, datos.esteticaB, B);
  // La sección 1 lee como admin (Recepción no ve por RLS la nómina, los permisos ni lo clínico).
  const { c: ctxAdmin, api: apiAdmin } = await abrirComo(nav, datos.adminB, B);
  await ctxAdmin.close();
  const zona = (await SB.from("negocios").select("zona_horaria").eq("id", B).single()).data.zona_horaria;

  seccion("1. registrosFinales en cada tipo de registro");
  let registrosFinales = null;
  try {
    ({ registrosFinales } = await import("../../src/lib/concurrencia/registro-final.ts"));
  } catch (e) {
    comprobar(false, `existe la pieza que devuelve el registro final (${e.code ?? e.message})`);
  }
  const ultima = async (tabla, col, id, fecha = "updated_at") => (await SB.from(tabla).select(fecha).eq(col, id).order(fecha, { ascending: false }).limit(1).maybeSingle()).data?.[fecha] ?? null;
  const uno = async (tabla, filtro = {}) => {
    let q = SB.from(tabla).select("id, updated_at").eq("negocio_id", B);
    for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
    return (await q.limit(1).maybeSingle()).data;
  };
  const servicio = await uno("servicios");
  const empleado = await uno("empleados");
  const casos = [
    ["estancias", await uno("estancias")],
    ["reservas", await uno("reservas")],
    ["citas_estetica", await uno("citas_estetica")],
    ["vet_citas", await uno("vet_citas")],
    ["vet_consultas", await uno("vet_consultas")],
    ["cargos_aplicados", await uno("cargos_aplicados")],
    ["clientes", (await SB.from("clientes").select("id, updated_at").eq("id", datos.clienteSoloB).single()).data],
    ["perros", (await SB.from("perros").select("id, updated_at").eq("id", datos.perroSoloB).single()).data],
    ["carnet_vacunas", await uno("carnet_vacunas")],
    ["servicios", servicio],
    ["insumos", await uno("insumos")],
    ["empleados", empleado],
    ["permisos_staff", await uno("permisos_staff")],
    ["negocio_perfil", await uno("negocio_perfil")],
    ["negocio_politicas", { id: B, updated_at: await ultima("negocio_politicas", "negocio_id", B) }],
    ["veterinaria_ajustes", { id: B, updated_at: await ultima("veterinaria_ajustes", "negocio_id", B) }],
    ["cupo_configuracion", { id: B, updated_at: await ultima("cupo_configuracion", "negocio_id", B) }],
    ["horario_semana", { id: B, updated_at: await ultima("horario_semana", "negocio_id", B) }],
    ["horario_empleado", empleado && { id: empleado.id, updated_at: await ultima("empleados_horario", "empleado_id", empleado.id) }],
    ["esquemas_empleado", empleado && { id: empleado.id, updated_at: await ultima("esquemas_pago", "empleado_id", empleado.id) }],
    ["clientes_notas_internas", { id: datos.clienteSoloB, updated_at: await ultima("clientes_notas_internas", "cliente_id", datos.clienteSoloB) }],
    [
      "precios_servicio",
      servicio && {
        id: servicio.id,
        updated_at: [await ultima("tarifas", "servicio_id", servicio.id, "created_at"), await ultima("tarifas_dia_semana", "servicio_id", servicio.id, "created_at")].filter(Boolean).sort().at(-1) ?? "-infinity",
      },
    ],
  ];
  // Lo clínico solo se lee con Veterinaria prendida (RLS): se prende para esta sección y se regresa como estaba.
  const vetAntes = ((await apiAdmin.rpc("modulos_activos")).data ?? []).includes("veterinaria");
  if (!vetAntes) await fijarModulo("veterinaria", true);
  if (registrosFinales) {
    for (const [t, fila] of casos) {
      if (!fila?.id) { console.log(`    · ${t}: Huellitas no tiene uno; se salta`); continue; }
      const [r] = await registrosFinales(apiAdmin, { versiones: [{ t, i: fila.id, v: "2000-01-01T00:00:00Z" }] });
      const esperada = fila.updated_at ?? "-infinity";
      const igual = r && (r.version === esperada || Date.parse(r.version) === Date.parse(esperada));
      comprobar(igual, `${t}: versión final ${r?.version ?? "(nada)"} = base ${esperada}${r?.datos ? " (con sus datos)" : ""}`);
    }
  }
  if (!vetAntes) await fijarModulo("veterinaria", false);

  seccion("2. En pantalla: estilista y Recepción sobre la misma cita");
  const { data: tallas } = await SB.from("tamanos_categoria").select("id, clave");
  const { data: pelajes } = await SB.from("tipos_pelaje").select("id, clave");
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ Encima ${sufijo}`, tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((t) => t.clave === "medio").id }).select("id").single()).data;
  creados.perros.push(perro.id);
  const { data: serv } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "estetica_estetico").is("deleted_at", null).limit(1).single();
  const { data: rr } = await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  const hoy = (await apiRec.rpc("fecha_negocio")).data;
  const dia = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 3 * 86400000).toISOString().slice(0, 10);
  const { data: cita, error: eCita } = await SB.from("citas_estetica").insert({ reserva_id: rr.id, perro_id: perro.id, servicio_id: serv.id, empleado_id: datos.esteticaB, inicio: `${dia}T11:00:00-06:00` }).select("id, inicio").single();
  if (eCita) throw new Error(`cita: ${eCita.message}`);
  creados.citas.push(cita.id);
  const masHoras = (iso, h) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();
  const local = (iso) => new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: zona }).format(new Date(iso)).replace(" ", "T");
  const hora = (iso) => new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: zona }).format(new Date(iso)).replace(/\s/g, " ");
  const normal = (t) => t.replace(/\s+/g, " ").replace(/\./g, "").toLowerCase();
  const tieneHora = (texto, iso) => normal(texto).includes(normal(hora(iso)));

  // El encabezado y los avisos EN EL INSTANTE en que aparece «Cita reprogramada» (sin esperar a que la página se recargue).
  const alSalirExito = async (p) => {
    const h = await p.waitForFunction(() => {
      const ok = [...document.querySelectorAll("[role=alert], .rounded-md, div")].some((n) => n.childElementCount < 6 && /Cita reprogramada/.test(n.textContent ?? ""));
      if (!ok) return null;
      return { encabezado: (document.querySelector("h1 + p")?.textContent ?? "").replace(/\s+/g, " "), conflicto: document.querySelectorAll("[data-conflicto-version]").length };
    }, null, { timeout: 30000, polling: 25 });
    return h.jsonValue();
  };

  await est.goto(`${BASE}/estetica/${cita.id}?reprogramar=1`, { waitUntil: "networkidle", timeout: 120000 });
  await rec.goto(`${BASE}/estetica/${cita.id}?reprogramar=1`, { waitUntil: "networkidle", timeout: 120000 });
  const deRecepcion = masHoras(cita.inicio, 0.5);
  await rec.getByLabel("Nueva fecha y hora").fill(local(deRecepcion));
  await rec.getByRole("button", { name: "Guardar la nueva hora" }).click();
  await rec.getByText(/Cita reprogramada/).first().waitFor({ timeout: 30000 });

  const deEstilista = masHoras(cita.inicio, 2);
  await est.getByLabel("Nueva fecha y hora").fill(local(deEstilista));
  await est.getByRole("button", { name: "Guardar la nueva hora" }).click();
  await est.locator("[data-conflicto-version]").waitFor({ timeout: 30000 });
  await est.locator("[data-guardar-encima]").click();
  await est.locator("[data-guardar-encima-confirmar]").click();
  const e1 = await alSalirExito(est);
  comprobar(tieneHora(e1.encabezado, deEstilista), `estilista: al salir «Cita reprogramada» el encabezado ya dice ${hora(deEstilista)} («${e1.encabezado.trim()}»)`);
  comprobar(e1.conflicto === 0, "estilista: el aviso de conflicto se cerró en el mismo instante");

  // Recepción no se enteró (su pantalla dice todavía su «Cita reprogramada» y su hora): vuelve a moverla.
  await rec.getByRole("button", { name: "Reprogramar" }).click();
  const deRecepcion2 = masHoras(cita.inicio, 1);
  await rec.getByLabel("Nueva fecha y hora").fill(local(deRecepcion2));
  await rec.getByRole("button", { name: "Guardar la nueva hora" }).click();
  await rec.locator("[data-conflicto-version]").waitFor({ timeout: 30000 });
  const exitoViejo = await rec.getByText(/Cita reprogramada/).count();
  comprobar(exitoViejo === 0, `Recepción: con el aviso de conflicto ya no sale el «Cita reprogramada» de antes (${exitoViejo})`);
  await rec.locator("[data-guardar-encima]").click();
  await rec.locator("[data-guardar-encima-confirmar]").click();
  const e2 = await alSalirExito(rec);
  comprobar(tieneHora(e2.encabezado, deRecepcion2) && e2.conflicto === 0, `Recepción al guardar encima: encabezado ${hora(deRecepcion2)} al momento y sin conflicto («${e2.encabezado.trim()}», conflicto ${e2.conflicto})`);
  const { data: base } = await SB.from("citas_estetica").select("inicio").eq("id", cita.id).single();
  comprobar(Date.parse(base.inicio) === Date.parse(deRecepcion2), `la base tiene ${hora(base.inicio)}`);

  // Un guardado más desde la misma pantalla, inmediatamente: su versión ya es la del guardado (sin conflicto falso).
  await rec.getByRole("button", { name: "Reprogramar" }).click();
  await rec.getByLabel("Nueva fecha y hora").fill(local(masHoras(cita.inicio, 1.5)));
  await rec.getByRole("button", { name: "Guardar la nueva hora" }).click();
  await rec.waitForFunction(() => document.querySelectorAll("[data-conflicto-version]").length > 0 || /Cita reprogramada/.test(document.body.innerText), null, { timeout: 30000 });
  comprobar((await rec.locator("[data-conflicto-version]").count()) === 0, "el siguiente guardado de Recepción entra sin un conflicto falso");
} finally {
  const ahora = new Date().toISOString();
  for (const id of creados.citas) await SB.from("citas_estetica").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.perros) await SB.from("perros").update({ deleted_at: ahora }).eq("id", id);
  await nav.close();
}
terminar();
