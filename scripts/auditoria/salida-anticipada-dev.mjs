// QA S36 · N132: salida anticipada y cobro. Por omisión la cuenta se ajusta a las noches (hotel) o días (guardería)
// que de verdad usó: lo no usado se quita con una corrección de precio con motivo «Salida anticipada», y el check-out lo
// dice ANTES de confirmar («Sale 2 noches antes: la cuenta baja de $X a $Y»). Con la política del negocio «Cobrar la
// estancia completa aunque salga antes» (Configuración → Hotel) la cuenta no cambia y el check-out avisa «Se cobra la
// estancia completa ($X) por la política del negocio». SOLO DESARROLLO (Huellitas), con `next start` en el 3001:
//
//   node scripts/auditoria/salida-anticipada-dev.mjs
const { B, SB, datos, comprobar, seccion, terminar } = await import("./veterinaria-comun-dev.mjs");
const { abrirNavegador } = await import("../lib/navegador.mjs");
const { BASE, abrirComo, textoDe, esperarTexto } = await import("./lib/huellitas-navegador.mjs");
const { CONFIRMA_FUERA_HORARIO, confirmarSiFueraDeHorario } = await import("../lib/fuera-horario.mjs");

const sufijo = String(Date.now()).slice(-6);
const sumar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const pesos = (n) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const nav = await abrirNavegador();
const creadas = [];
try {
  const { p, api } = await abrirComo(nav, datos.adminB, B, { width: 390, height: 900 });
  const hoy = (await api.rpc("fecha_negocio")).data;
  const abre = async (d) => (await api.rpc("negocio_abre", { p_fecha: d })).data === true;
  const abiertoDesde = async (d, paso) => { let x = d; for (let i = 0; i < 14 && !(await abre(x)); i++) x = sumar(x, paso); return x; };
  const { data: tallaChico } = await SB.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();
  const { data: guarderia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
  // Una estancia adentro desde `entrada` con la salida prevista en `salida`.
  const adentro = async (nombre, servicio, entrada, salida) => {
    const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ salida ${nombre} ${sufijo}`, tamano_id: tallaChico.id }).select("id").single()).data;
    const r = (await api.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const e = await api.from("estancias").insert({
      reserva_id: r.id, perro_id: perro.id, servicio_id: servicio, fecha_entrada: entrada, fecha_salida: salida, dia_cerrado_confirmado: "confirmado",
      bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba N132", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba N132",
    }).select("id").single();
    if (e.error) throw new Error(`estancia ${nombre}: ${e.error.message}`);
    creadas.push(e.data.id);
    const u = await api.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba", hora_entrada_real: new Date(`${entrada}T17:00:00Z`).toISOString(), ...CONFIRMA_FUERA_HORARIO }).eq("id", e.data.id);
    if (u.error) throw new Error(`check-in ${nombre}: ${u.error.message}`);
    return { id: e.data.id, reserva: r.id };
  };
  const total = async (reserva) => Number((await api.rpc("cuenta_totales_reserva", { p_reserva_id: reserva })).data?.[0]?.total_cuenta);
  const salir = async (e) => {
    await p.goto(`${BASE}/reservas/estancias/${e.id}/checkout`, { waitUntil: "networkidle" });
    const aviso = (await p.locator("[data-salida-anticipada]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
    await p.locator("#checkout-recoge-nombre").fill("Luis Prueba");
    await p.getByRole("button", { name: "Sí, es el dueño" }).click();
    if (await p.locator("[data-entregue-todo]").count()) await p.locator("[data-entregue-todo]").click();
    await p.getByRole("button", { name: "Confirmar salida" }).click();
    await confirmarSiFueraDeHorario(p);
    await esperarTexto(p, /Salida registrada|Este perro ya salió/);
    return { aviso, despues: await textoDe(p) };
  };

  // La política en su valor por omisión (ajustar), por la pantalla de Configuración → Hotel.
  const politica = async (completa) => {
    await p.goto(`${BASE}/admin/hotel`, { waitUntil: "networkidle" });
    const caja = p.locator("[data-cobrar-estancia-completa]");
    if ((await caja.isChecked()) !== completa) await caja.click();
    await p.locator("[data-guardar-politica-salida]").click();
    return esperarTexto(p, /Listo:/);
  };

  seccion("1. Por omisión: la cuenta baja a las noches usadas y el check-out lo dice antes de confirmar");
  comprobar(await politica(false), "Configuración → Hotel guarda «ajustar a lo usado» (por omisión)");
  const entrada1 = await abiertoDesde(sumar(hoy, -1), -1);
  const salida1 = await abiertoDesde(sumar(hoy, 2), 1);
  const reservadas1 = (new Date(`${salida1}T12:00:00Z`) - new Date(`${entrada1}T12:00:00Z`)) / 86400000;
  const usadas1 = Math.max(1, (new Date(`${hoy}T12:00:00Z`) - new Date(`${entrada1}T12:00:00Z`)) / 86400000);
  const e1 = await adentro("hotel", hotel.id, entrada1, salida1);
  const antes1 = await total(e1.reserva);
  const cot = (await api.rpc("salida_anticipada_cotizar", { p_estancia_id: e1.id })).data;
  comprobar(cot?.aplica === true && cot.no_usadas === reservadas1 - usadas1, `la base cotiza ${cot?.no_usadas} noche(s) sin usar de ${reservadas1} (${JSON.stringify(cot)})`);
  const { aviso: aviso1, despues: d1 } = await salir(e1);
  const n = reservadas1 - usadas1;
  const esperado1 = `Sale ${n} ${n === 1 ? "noche" : "noches"} antes: la cuenta baja de ${pesos(antes1)} a ${pesos(cot?.total_despues)}`;
  comprobar(aviso1.includes(esperado1), `antes de confirmar dice «${esperado1}» (${aviso1})`);
  const despues1 = await total(e1.reserva);
  comprobar(Math.abs(despues1 - Number(cot?.total_despues)) < 0.01 && despues1 < antes1, `la cuenta quedó en ${pesos(despues1)} (antes ${pesos(antes1)})`);
  const { data: ajuste } = await SB.from("cuenta_ajustes_precio").select("motivo, concepto, monto").eq("linea_id", e1.id).is("deleted_at", null);
  comprobar(ajuste?.length === 1 && ajuste[0].motivo === "Salida anticipada" && /no usada/.test(ajuste[0].concepto), `la noche no usada se quita con motivo «Salida anticipada» (${ajuste?.[0]?.concepto})`);
  comprobar(/(Sale|Salió) \d+ noches? antes/.test(d1) && /Cobrar la cuenta|Ver cobros/.test(d1), "al confirmar lo repite junto a «Cobrar la cuenta»");
  const otra = (await api.rpc("salida_anticipada_aplicar", { p_estancia_id: e1.id })).data;
  const { count } = await SB.from("cuenta_ajustes_precio").select("id", { count: "exact", head: true }).eq("linea_id", e1.id).is("deleted_at", null);
  comprobar(otra?.aplicada === false && count === 1, `aplicarlo otra vez no duplica el ajuste (${JSON.stringify(otra)}, ${count})`);

  seccion("2. Con la política «Cobrar la estancia completa aunque salga antes»");
  comprobar(await politica(true), "Configuración → Hotel guarda «Cobrar la estancia completa»");
  const e2 = await adentro("completa", hotel.id, entrada1, salida1);
  const antes2 = await total(e2.reserva);
  const { aviso: aviso2 } = await salir(e2);
  const esperado2 = `Se cobra la estancia completa (${pesos(antes2)}) por la política del negocio`;
  comprobar(aviso2.includes(esperado2), `antes de confirmar dice «${esperado2}» (${aviso2})`);
  comprobar(Math.abs((await total(e2.reserva)) - antes2) < 0.01, "la cuenta no cambia");
  comprobar(await politica(false), "la política regresa a «ajustar a lo usado»");

  seccion("3. Guardería por días: el mismo criterio");
  // Tres días seguidos que abren, empezando ayer o antes; sale hoy (usa 2 de 3 si ayer abrió).
  let g0 = await abiertoDesde(sumar(hoy, -1), -1);
  let g3 = sumar(hoy, 2);
  const e3 = await adentro("guarderia", guarderia.id, g0, g3).catch((e) => ({ error: e.message }));
  if (e3.error) comprobar(false, `guardería de varios días: ${e3.error}`);
  else {
    const c3 = (await api.rpc("salida_anticipada_cotizar", { p_estancia_id: e3.id })).data;
    const reservados = (new Date(`${g3}T12:00:00Z`) - new Date(`${g0}T12:00:00Z`)) / 86400000;
    const usados = (new Date(`${hoy}T12:00:00Z`) - new Date(`${g0}T12:00:00Z`)) / 86400000 + 1;
    comprobar(c3?.unidad === "dia" && c3.no_usadas === reservados - usados && c3.aplica === (reservados > usados), `guardería: ${c3?.no_usadas} día(s) sin usar de ${reservados} (${JSON.stringify(c3)})`);
  }
  await p.context().close();
} finally {
  for (const id of creadas) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  await nav.close();
}
terminar();
