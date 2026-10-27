// QA R50 · N136: una sola fuente del total de una estancia y de su cuenta: las líneas de la base (cuenta_lineas_reserva,
// agrupadas por estancia en cuenta_lineas_estancia). El bloque de la estancia en /reservas/<id> calculaba «precio por
// noche × noches reservadas» en el navegador y no veía la corrección «Salida anticipada»: decía $900 con el encabezado,
// Caja y el calendario en $450. SOLO DESARROLLO (Huellitas), con `next start` en el 3001:
//
//   node scripts/auditoria/cuenta-estancia-dev.mjs
//
// Una estancia de hotel de 3 noches que entra ayer y sale hoy por la pantalla de check-out (salida anticipada), con un
// cargo aplicado. Revisa contra la base: el bloque de la estancia (noches reales, la línea del ajuste con su motivo, el
// cargo y el total), el encabezado de la reserva, la pantalla de check-out ya hecha, el calendario y Reportes («Noches
// de hotel» cuenta las que usó).
const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, esperarTexto } = await import("./lib/huellitas-navegador.mjs");
const { CONFIRMA_FUERA_HORARIO, confirmarSiFueraDeHorario } = await import("../lib/fuera-horario.mjs");

const sufijo = String(Date.now()).slice(-6);
const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const limpio = (t) => (t ?? "").replace(/\s+/g, " ").trim();
const pesos = (n) => `${n < 0 ? "−" : ""}$${Math.abs(Number(n)).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nav = await abrirNavegador();
const creados = { perros: [], estancias: [] };
try {
  const { p, api } = await abrirComo(nav, datos.adminB, B);
  const hoy = (await api.rpc("fecha_negocio")).data;
  const abre = async (d) => (await api.rpc("negocio_abre", { p_fecha: d })).data === true;
  const abiertoDesde = async (d, paso) => { let x = d; for (let i = 0; i < 14 && !(await abre(x)); i++) x = sumar(x, paso); return x; };
  const completa = (await api.rpc("cobrar_estancia_completa")).data;
  if (completa) throw new Error("Huellitas tiene «Cobrar la estancia completa aunque salga antes»: corre salida-anticipada-dev.mjs (la regresa) y vuelve a correr esta.");
  const { data: tallaChico } = await SB.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();
  const { data: cargoLibre } = await SB.from("servicios_cotizables").select("id, nombre").eq("negocio_id", B).eq("categoria", "cargo").eq("monto_libre", true).not("clave", "like", "extra\\_%").limit(1).maybeSingle();

  const nombre = `ZZ Cuenta ${sufijo}`;
  const entrada = await abiertoDesde(sumar(hoy, -1), -1);
  const salida = await abiertoDesde(sumar(hoy, 2), 1);
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre, tamano_id: tallaChico.id }).select("id").single()).data;
  creados.perros.push(perro.id);
  const reserva = (await api.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
  const est = await api.from("estancias").insert({
    reserva_id: reserva.id, perro_id: perro.id, servicio_id: hotel.id, fecha_entrada: entrada, fecha_salida: salida, dia_cerrado_confirmado: "confirmado",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba N136", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba N136",
  }).select("id").single();
  if (est.error) throw new Error(`estancia: ${est.error.message}`);
  const id = est.data.id;
  creados.estancias.push(id);
  const ci = await api.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba", hora_entrada_real: new Date(`${entrada}T17:00:00Z`).toISOString(), ...CONFIRMA_FUERA_HORARIO }).eq("id", id);
  if (ci.error) throw new Error(`check-in: ${ci.error.message}`);
  if (cargoLibre) await api.from("cargos_aplicados").insert({ estancia_id: id, servicio_id: cargoLibre.id, cantidad: 1, precio: 85, descripcion: "Pollo hervido" });

  // Sale hoy por la pantalla de check-out (la salida anticipada se aplica ahí, como en producción).
  await p.goto(`${BASE}/reservas/estancias/${id}/checkout`, { waitUntil: "networkidle", timeout: 120000 });
  await p.locator("#checkout-recoge-nombre").fill("Luis Prueba");
  await p.getByRole("button", { name: "Sí, es el dueño" }).click();
  if (await p.locator("[data-entregue-todo]").count()) await p.locator("[data-entregue-todo]").click();
  await p.getByRole("button", { name: "Confirmar salida" }).click();
  await confirmarSiFueraDeHorario(p);
  await esperarTexto(p, /Salida registrada|Este perro ya salió/);

  const { data: lineas } = await api.rpc("cuenta_lineas_estancia", { p_reserva_id: reserva.id });
  const { data: tot } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: reserva.id });
  const totalBase = Number(tot?.[0]?.total_cuenta);
  const deEstancia = (lineas ?? []).filter((l) => l.estancia_id === id);
  const sumaEstancia = Math.round(deEstancia.reduce((s, l) => s + Number(l.total), 0) * 100) / 100;
  const base = deEstancia.find((l) => l.tipo === "estancia");
  const ajuste = deEstancia.find((l) => l.tipo === "ajuste" && l.motivo === "Salida anticipada");
  const reservadas = base?.reservadas, usadas = base?.usadas;

  seccion("1. La base: las líneas de la estancia suman lo mismo que la cuenta");
  comprobar(Boolean(ajuste) && usadas < reservadas, `salió antes: usó ${usadas} de ${reservadas} noches y la base tiene «${ajuste?.concepto}» (${ajuste?.total})`);
  comprobar(Math.abs(sumaEstancia - totalBase) < 0.005, `las líneas de la estancia (${deEstancia.map((l) => `${l.tipo} ${l.total}`).join(", ")}) suman ${pesos(sumaEstancia)} = total de la cuenta ${pesos(totalBase)}`);

  seccion("2. /reservas/<id>: el bloque de la estancia dice lo mismo que el encabezado y la base");
  await p.goto(`${BASE}/reservas/${reserva.id}`, { waitUntil: "networkidle", timeout: 120000 });
  const encabezado = limpio(await p.locator("[data-total-cuenta]").first().innerText());
  const precio = limpio(await p.locator("[data-precio-estancia]").first().innerText().catch(() => ""));
  const totalBloque = await p.locator("[data-total-estancia]").first().getAttribute("data-total-estancia").catch(() => null);
  const lineaAjuste = limpio(await p.locator("[data-linea-estancia=ajuste]").first().innerText().catch(() => ""));
  const lineaCargo = cargoLibre ? limpio(await p.locator("[data-linea-estancia=cargo]").first().innerText().catch(() => "")) : "";
  const bloque = limpio(await p.locator("[data-desglose-cuenta-estancia]").first().innerText().catch(() => ""));
  const porNoche = Math.round(((Number(base.total) + Number(ajuste.total)) / usadas) * 100) / 100;
  const nochesTxt = (n) => `${n} ${n === 1 ? "noche" : "noches"}`;
  comprobar(precio.startsWith(`Precio: ${nochesTxt(usadas)} × ${pesos(porNoche)}`), `el bloque dice las noches reales: «${precio}»`);
  comprobar(lineaAjuste.startsWith(`Ajuste por salida anticipada: ${pesos(ajuste.total)}`) && /Motivo: salida anticipada \(\d+ noches? no usadas?\)/.test(lineaAjuste), `la línea del ajuste con su motivo: «${lineaAjuste}»`);
  if (cargoLibre) comprobar(/\$85\.00/.test(lineaCargo), `el cargo de la estancia también es línea de la base: «${lineaCargo}»`);
  comprobar(totalBloque === totalBase.toFixed(2) && encabezado === pesos(totalBase), `total del bloque ${totalBloque} = encabezado ${encabezado} = base ${pesos(totalBase)}`);
  comprobar(!/Base: \$/.test(bloque) && !bloque.includes(`Total: ${pesos(Number(base.total) + (cargoLibre ? 85 : 0))}`), "ningún «Base / Total» calculado en la pantalla con las noches reservadas");

  seccion("3. La misma cifra en el check-out ya hecho, el calendario y Reportes");
  await p.goto(`${BASE}/reservas/estancias/${id}/checkout`, { waitUntil: "networkidle", timeout: 120000 });
  const totalCheckout = await p.locator("[data-total-estancia]").first().getAttribute("data-total-estancia").catch(() => null);
  comprobar(totalCheckout === sumaEstancia.toFixed(2), `check-out: total de la estancia ${totalCheckout} (base ${sumaEstancia.toFixed(2)})`);
  await p.goto(`${BASE}/reservas/calendario?fecha=${entrada}&dia=${entrada}`, { waitUntil: "networkidle", timeout: 120000 });
  const tarjeta = limpio(await p.locator(`[data-reserva="${id}"]`).first().innerText().catch(() => ""));
  comprobar(!tarjeta || !/\$/.test(tarjeta) || tarjeta.includes(pesos(totalBase).replace(/\.00$/, "")) || /Pagada|saldo/i.test(tarjeta), `calendario: «${tarjeta.slice(0, 160) || "(no sale en el panel)"}»`);
  const { data: desg } = await api.rpc("reporte_desglose", { p_tarjeta: "op_hotel", p_desde: entrada, p_hasta: entrada, p_buscar: nombre, p_orden: "fecha", p_dir: "desc", p_limite: 5, p_desplazamiento: 0 });
  const fila = (desg?.filas ?? [])[0];
  comprobar(Number(fila?.monto) === usadas && new RegExp(`${usadas} noches?`).test(fila?.detalle ?? ""), `Reportes › Noches de hotel cuenta ${fila?.monto} (${fila?.detalle}); usó ${usadas} de ${reservadas}`);
  await p.context().close();
} finally {
  const ahora = new Date().toISOString();
  for (const id of creados.estancias) await SB.from("estancias").update({ deleted_at: ahora }).eq("id", id);
  for (const id of creados.perros) await SB.from("perros").update({ deleted_at: ahora }).eq("id", id);
  await nav.close();
}
terminar();
