// Veterinaria, Fase 4 · libro de control derivado (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
// Migraciones 20261017000000 a 20261017000600.
//
//   node scripts/auditoria/libro-control-dev.mjs
//
// 1. Quién lo ve (permiso «Ver libro de control») y que anota la lectura.
// 2. Qué productos entran (según la regla de la plataforma, no el código) y qué columnas trae.
// 3. El saldo corre por producto y cuadra con los lotes; filtros por fecha y producto.
// 4. No es una tabla que se edite: lo derivado de los movimientos de lote.
import { comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { preparar, limpiar, darFolios, rpc, get, SB, B, A, dar, quitar, sumaDias, tokenDe } from "./recetas-comun-dev.mjs";

const E = await preparar("libro");
const { P } = E;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const libro = (token, extra = {}) => rpc(token, "vet_libro_control", { p_desde: sumaDias(E.hoy, -2), p_hasta: sumaDias(E.hoy, 1), p_insumo: null, ...extra });
try {
  const perro = await E.nuevoPerro("Librin");
  const desde = 1000000 + Math.floor(Math.random() * 800000000);
  await darFolios(E, E.medA, desde, desde + 60);
  await rpc(P.admin, "guardar_veterinaria_espejo_antimicrobianos", { p_activo: false });

  seccion("1. Quién lo ve");
  comprobar(!(await libro(P.recSin)).ok, "recepción sin permiso ni designación no lo ve");
  comprobar(!(await libro(P.cliente)).ok && !(await libro(null)).ok, "el cliente y la llave anónima tampoco");
  await dar(P.admin, P.recSinId, "ver_libro_control");
  const conPermiso = await libro(P.recSin);
  comprobar(conPermiso.ok, `con «Ver libro de control» sí (${conPermiso.mensaje})`);
  await quitar(P.admin, P.recSinId, "ver_libro_control");
  comprobar((await libro(P.recCon)).ok && (await libro(P.admin)).ok, "el médico designado y admin lo ven");
  comprobar(!(await libro(P.admin, { p_desde: sumaDias(E.hoy, 1), p_hasta: E.hoy })).ok, "un rango al revés se rechaza");
  const lect = await SB.from("vet_lecturas").select("id").eq("negocio_id", B).eq("recurso", "libro");
  comprobar((lect.data ?? []).length >= 1, "ver el libro deja anotada la lectura");

  seccion("2. Qué entra y qué columnas trae");
  // Movimientos: entradas ya hechas por preparar(); salidas con documento, una merma y un ajuste.
  const esp = await rpc(P.recCon, "vet_sitpv_registrar", { p_perro: perro, p_uso_hospitalario: false, p_insumo: E.grupoI, p_registro_senasica: null, p_lote: E.lote.grupoI, p_presentacion: null, p_dosis: "x", p_intervalo: null, p_duracion: null, p_cantidad_total: 50, p_parcialidades: true, p_comprobante_compra: null, p_observaciones: null, p_fecha: null });
  comprobar(esp.ok, `un folio del SITPV (${esp.mensaje})`);
  await rpc(P.recCon, "vet_surtir_controlado", { p_tipo: "espejo", p_doc: esp.cuerpo.id, p_salidas: [{ lote_id: E.lote.grupoI, cantidad: 20 }], p_perro: null, p_consulta: null, p_motivo: null });
  await rpc(P.recCon, "vet_surtir_controlado", { p_tipo: "espejo", p_doc: esp.cuerpo.id, p_salidas: [{ lote_id: E.lote.grupoI, cantidad: 10 }], p_perro: null, p_consulta: null, p_motivo: null });
  await rpc(P.admin, "registrar_lote_salida", { p_lote_id: E.lote.grupoI, p_cantidad_consumo: 3, p_tipo: "merma", p_motivo: "Derrame", p_folio_receta: null });
  const re = await rpc(P.recCon, "vet_recetario_registrar", { p_perro: perro, p_insumo: E.especial, p_folio: `LB-${E.MARCA}`, p_codigo_barras: "123456", p_fecha: null, p_dias: 5, p_cantidad_diaria: 4, p_indicaciones: null });
  await rpc(P.recCon, "vet_surtir_controlado", { p_tipo: "recetario", p_doc: re.cuerpo.id, p_salidas: [{ lote_id: E.lote.especial, cantidad: 20 }], p_perro: null, p_consulta: null, p_motivo: null });
  const r = (await libro(P.recCon)).cuerpo;
  r.movimientos = r.movimientos.filter((m) => m.producto.includes(E.MARCA));
  const productos = new Set(r.movimientos.map((m) => m.producto));
  comprobar([...productos].some((p) => p.startsWith("Xilazina")) && [...productos].some((p) => p.startsWith("Morfina")), "entran el Grupo I y el estupefaciente");
  comprobar(![...productos].some((p) => /Meloxicam|Shampoo|Diazepam|Fenobarbital/.test(p)), "no entran Grupo II, libres ni fracciones III y IV (así lo dicen las reglas)");
  const x = r.movimientos.filter((m) => m.producto.startsWith("Xilazina"));
  comprobar(x.length === 4 && x[0].tipo === "entrada_compra", `la xilazina trae su entrada, dos surtidos y la merma (${x.map((m) => m.tipo).join(",")})`);
  const surt = x.filter((m) => m.tipo === "salida_surtido");
  comprobar(surt.every((m) => m.folio === esp.cuerpo.folio && m.paciente?.startsWith("Librin") && m.medico && m.fecha && m.lote && m.laboratorio === "Laboratorio Prueba"), "cada salida lleva folio, paciente, médico, fecha, lote y laboratorio");
  comprobar(x.at(-1).tipo === "salida_merma" && x.at(-1).motivo === "Derrame" && x.at(-1).folio === null, "la merma va con su motivo y sin folio");
  comprobar(x[0].entrada === 1000 && x[0].salida === null && x[1].salida === 20 && x[1].entrada === null, "entradas y salidas en columnas separadas, en la unidad de consumo");
  comprobar(x.map((m) => m.saldo).join(",") === "1000,980,970,967", `el saldo corre: ${x.map((m) => m.saldo).join(" → ")}`);
  const me = r.movimientos.find((m) => m.producto.startsWith("Morfina") && m.tipo === "salida_surtido");
  comprobar(me?.folio === `LB-${E.MARCA}` && me.salida === 20, "el recetario especial aparece con su folio");
  const vlote = (await SB.from("insumo_lotes_saldo").select("saldo").eq("lote_id", E.lote.grupoI).single()).data.saldo;
  comprobar(Number(vlote) === 967, "el último saldo coincide con el del lote");
  comprobar(r.saldos_iniciales.filter((s) => s.producto.includes(E.MARCA)).every((s) => s.saldo_inicial === 0), "el saldo inicial del rango es cero (todo pasó hoy)");

  seccion("3. Rango y producto");
  const mañana = (await libro(P.recCon, { p_desde: sumaDias(E.hoy, 1), p_hasta: sumaDias(E.hoy, 5) })).cuerpo;
  mañana.movimientos = mañana.movimientos.filter((m) => m.producto.includes(E.MARCA));
  comprobar(mañana.movimientos.length === 0 && mañana.saldos_iniciales.find((s) => s.producto.includes(E.MARCA) && s.producto.startsWith("Xilazina"))?.saldo_inicial === 967, "un rango posterior no trae movimientos pero sí el saldo con el que arranca");
  const solo = (await libro(P.recCon, { p_insumo: E.especial })).cuerpo;
  comprobar(solo.movimientos.every((m) => m.producto.startsWith("Morfina")), "se puede filtrar por producto");

  seccion("4. La regla de la plataforma decide qué entra");
  const PL = await tokenDe((await SB.from("plataforma_admins").select("profile_id").limit(1)).data[0].profile_id);
  const quitarLibro = await rpc(PL, "plataforma_vet_clasificacion_guardar", { p_clave: "estupefaciente_234", p_documento: "receta_especial", p_surtidos_max: null, p_ventana_meses: null, p_retencion_meses: 12, p_libro_control: false, p_nota: null }, LUDOGTEKA);
  comprobar(quitarLibro.ok, "la plataforma le quita el libro a los estupefacientes");
  comprobar(![...new Set((await libro(P.recCon, { p_insumo: E.especial })).cuerpo.movimientos.map((m) => m.producto))].some((p) => p.startsWith("Morfina")), "y el libro deja de incluirlos sin tocar código");
  await rpc(PL, "plataforma_vet_clasificacion_guardar", { p_clave: "estupefaciente_234", p_documento: "receta_especial", p_surtidos_max: null, p_ventana_meses: null, p_retencion_meses: 12, p_libro_control: true, p_nota: "Recetario especial con código de barras, tratamiento máximo de 30 días." }, LUDOGTEKA);
  comprobar([...new Set((await libro(P.recCon, { p_insumo: E.especial })).cuerpo.movimientos.map((m) => m.producto))].some((p) => p.startsWith("Morfina")), "al devolvérselo vuelve a aparecer");

  seccion("5. Es derivado: nadie lo edita");
  comprobar(Boolean((await SB.from("lotes_movimientos").update({ cantidad_base: 1 }).eq("lote_id", E.lote.grupoI)).error), "los movimientos que lo alimentan no se editan");
  comprobar(Boolean((await SB.from("lotes_movimientos").delete().eq("lote_id", E.lote.grupoI)).error), "ni se borran");
  comprobar(!(await get(P.admin, "vet_libro_control?select=*")).ok, "no existe una tabla del libro que editar");
  const otroN = await libro(P.admin, {}).then(async () => rpc(P.admin, "vet_libro_control", { p_desde: sumaDias(E.hoy, -2), p_hasta: sumaDias(E.hoy, 1), p_insumo: null }, LUDOGTEKA));
  comprobar(!otroN.ok || (otroN.cuerpo?.movimientos ?? []).length === 0, "con el encabezado de otro negocio no se ve nada");
} finally {
  await limpiar(E);
}
terminar();
