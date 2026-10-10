// Inventario clínico con lotes, caducidades y clasificaciones (SOLO
// DESARROLLO, en Huellitas; nunca Ludogteka). Migraciones 20261014000300 y
// 20261014000400.
//
//   node scripts/auditoria/inventario-lotes-dev.mjs
//
// 1. Catálogo de principios activos: precargado como se pidió y editable solo
//    por la plataforma.
// 2. Permiso «Administrar lotes e inventario clínico».
// 3. Dos clasificaciones por producto, independientes y editables.
// 4. Lotes: saldo derivado de un libro inmutable, existencia global siempre de
//    acuerdo, salidas que no pasan del saldo.
// 5. Caducidades y alertas (caducado, por caducar, bajo mínimo).
// 6. Lo que otras partes de la app mueven (consumo, regreso de venta) se
//    reparte solo entre lotes, primero el que caduca antes; una compra sin
//    lote se rechaza.
// 7. Folio de receta: solo aviso en esta fase.
// 8. Pasar un insumo existente a lotes; aislamiento entre negocios.
import { A, B, SB, LUDOGTEKA, rpc, get, post, patch, borrar, personas, dar, quitar, fijarModulo, productoClinico, materialClinico, hoy, sumaDias, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { tokenDe } from "./sesiones-dev.mjs";

const P = await personas();
const MARCA = `lotes-${String(Date.now()).slice(-6)}`;
const num = (x) => Number(x);
const saldoLote = async (id) => num((await SB.from("insumo_lotes_saldo").select("saldo").eq("lote_id", id).single()).data?.saldo);
const existencia = async (insumo) => num((await SB.from("insumos_existencia_actual").select("existencia_actual").eq("insumo_id", insumo).single()).data?.existencia_actual);
const sumaLotes = async (insumo) => ((await SB.from("insumo_lotes_saldo").select("saldo").eq("insumo_id", insumo)).data ?? []).reduce((a, l) => a + num(l.saldo), 0);

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await quitar(P.admin, P.recConId, "lotes_clinicos");
  await quitar(P.admin, P.recSinId, "lotes_clinicos");
  const hoyB = await hoy(P.admin);

  // ── 1. Catálogo ──
  seccion("1. Catálogo de principios activos");
  const { data: cat } = await SB.from("principios_activos").select("*").is("deleted_at", null);
  const de = (n) => cat.find((x) => x.nombre.toLowerCase() === n);
  comprobar(cat.length >= 80, `catálogo precargado (${cat.length} principios)`);
  const esperado = [
    ["ketamina", "I", "psicotropico_245_III"], ["diazepam", "I", "psicotropico_245_III"], ["midazolam", "I", "psicotropico_245_III"],
    ["fentanilo", "I", "estupefaciente_234"], ["meperidina", "I", "estupefaciente_234"], ["butorfanol", "I", "psicotropico_245_II"],
    ["pentobarbital", "I", "psicotropico_245_II"], ["xilazina", "I", null], ["lidocaína", "I", null], ["testosterona", "I", null],
    ["amoxicilina", "II", null], ["enrofloxacina", "II", null], ["meloxicam", "II", null], ["dexametasona", "II", null], ["ivermectina", "II", null],
    ["permetrina", "III", null],
    ["tramadol", null, "psicotropico_245_III"], ["fenobarbital", null, "psicotropico_245_IV"], ["morfina", null, "estupefaciente_234"],
    ["buprenorfina", null, "estupefaciente_234"], ["nalbufina", null, "psicotropico_245_II"], ["codeína", null, "estupefaciente_234"],
    ["alprazolam", null, "psicotropico_245_III"], ["gabapentina", null, null], ["metadona", null, null],
  ];
  for (const [n, g, l] of esperado) {
    const x = de(n);
    comprobar(Boolean(x) && x.grupo_senasica === g && x.clasificacion_lgs === l, `${n}: grupo ${g ?? "ninguno"}, LGS ${l ?? "ninguna"}`);
  }
  for (const n of ["sevoflurano", "marbofloxacina", "fipronil", "tramadol", "fenobarbital", "buprenorfina", "morfina", "nalbufina", "dexmedetomidina", "gabapentina", "trazodona", "fluoxetina", "metadona"]) {
    comprobar(de(n)?.por_confirmar === true, `${n}: marcado «por confirmar»`);
  }
  comprobar(de("sevoflurano")?.grupo_senasica === null, "sevoflurano queda sin grupo");
  comprobar(de("marbofloxacina")?.grupo_senasica === "II" && de("fipronil")?.grupo_senasica === "III", "marbofloxacina en II y fipronil en III, por analogía");
  const antim = ["amoxicilina", "ampicilina", "cefalexina", "ceftiofur", "doxiciclina", "oxitetraciclina", "enrofloxacina", "ciprofloxacina", "marbofloxacina", "clindamicina", "lincomicina", "gentamicina", "amikacina", "trimetoprim-sulfa", "metronidazol", "florfenicol"];
  comprobar(antim.every((n) => de(n)?.es_antimicrobiano && de(n)?.grupo_senasica === "II"), "los 16 antimicrobianos: Grupo II y marca antimicrobiano");
  comprobar(["ketamina", "meloxicam", "tramadol"].every((n) => de(n)?.es_antimicrobiano === false), "los que no lo son no llevan la marca");
  comprobar(cat.filter((x) => x.grupo_senasica === "I").length >= 35, "Grupo I completo");
  // Edición: solo la plataforma
  const argsCat = { p_id: null, p_nombre: `Prueba ${MARCA}`, p_grupo_senasica: "III", p_clasificacion_lgs: null, p_es_antimicrobiano: false, p_por_confirmar: true, p_nota: "x" };
  for (const [quien, token] of [["admin del negocio", P.admin], ["recepción", P.recCon], ["cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await rpc(token, "plataforma_guardar_principio_activo", argsCat)).ok, `${quien} no edita el catálogo`);
  }
  comprobar(!(await post(P.admin, "principios_activos", { nombre: `Directo ${MARCA}` })).ok, "ni insertando directo por la API");
  comprobar(!(await patch(P.admin, `principios_activos?nombre=eq.ketamina`, { grupo_senasica: "III" })).ok || num((await SB.from("principios_activos").select("id").eq("nombre", "ketamina").eq("grupo_senasica", "I")).data?.length) === 1, "ni modificando una clasificación");
  comprobar((await get(null, "principios_activos?select=id&limit=1")).ok === false || ((await get(null, "principios_activos?select=id&limit=1")).cuerpo ?? []).length === 0, "la llave anónima no lee el catálogo");
  comprobar(((await get(P.recSin, "principios_activos?select=id&limit=3")).cuerpo ?? []).length === 3, "el personal sí lo lee");

  // ── 2. Permiso ──
  seccion("2. Permiso «Administrar lotes e inventario clínico»");
  const m = await materialClinico();
  const crear = (token, nombre) => rpc(token, "guardar_producto_clinico", {
    p_id: null, p_nombre: nombre, p_area_id: m.area, p_unidad_compra_id: m.litro, p_unidad_consumo_id: m.ml, p_stock_minimo: 0,
    p_dias_aviso_caducidad: 30, p_principio_activo_id: null, p_grupo_senasica: null, p_clasificacion_lgs: null, p_es_antimicrobiano: false, p_clasificacion_por_confirmar: false,
  });
  for (const [quien, token] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["cliente", P.cliente], ["anónimo", null]]) {
    const r = await crear(token, `Sin permiso ${MARCA}`);
    comprobar(!r.ok, `${quien} no da de alta productos clínicos${r.codigo ? ` (${r.codigo})` : ""}`);
  }
  const directo = await post(P.recSin, "insumos", { nombre: `Directo ${MARCA}`, area_id: m.area, unidad_compra_id: m.pieza, unidad_consumo_id: m.pieza, controla_lotes: true });
  comprobar(!directo.ok, `el trigger frena un insumo con lotes creado directo por la API («${directo.mensaje.slice(0, 50)}…»)`);
  const simple = await post(P.recSin, "insumos", { nombre: `Normal ${MARCA}`, area_id: m.area, unidad_compra_id: m.pieza, unidad_consumo_id: m.pieza });
  comprobar(simple.ok, "pero un insumo normal (sin nada clínico) se crea como siempre");
  await dar(P.admin, P.recConId, "lotes_clinicos");
  comprobar((await crear(P.recCon, `Con permiso ${MARCA}`)).ok, "recepción con el permiso sí da de alta un producto clínico");
  comprobar(!(await rpc(P.recSin, "inventario_clinico_alertas")).cuerpo?.caducados && Object.keys((await rpc(P.recSin, "inventario_clinico_alertas")).cuerpo ?? {}).length === 0, "las alertas del inventario clínico solo salen a quien tiene el permiso");

  // ── 3. Clasificaciones ──
  seccion("3. Dos clasificaciones independientes y editables");
  const ket = de("ketamina");
  const amox = de("amoxicilina");
  const prodKet = await productoClinico(P.admin, `Ketamina ${MARCA}`, { p_principio_activo_id: ket.id, p_grupo_senasica: "I", p_clasificacion_lgs: "psicotropico_245_III" });
  let k = (await SB.from("insumos").select("*").eq("id", prodKet).single()).data;
  comprobar(k.grupo_senasica === "I" && k.clasificacion_lgs === "psicotropico_245_III" && k.exige_folio_receta === true && k.controla_lotes && k.requiere_caducidad, "ketamina: Grupo I + psicotrópico fr. III, exige folio, con lotes y caducidad");
  const prodAmox = await productoClinico(P.admin, `Amoxicilina ${MARCA}`, { p_principio_activo_id: amox.id, p_grupo_senasica: "III", p_clasificacion_lgs: null, p_es_antimicrobiano: true, p_clasificacion_por_confirmar: true });
  let a = (await SB.from("insumos").select("*").eq("id", prodAmox).single()).data;
  comprobar(a.grupo_senasica === "III" && a.clasificacion_lgs === null && a.es_antimicrobiano && a.exige_folio_receta === false && a.clasificacion_por_confirmar, "el producto guarda SU clasificación, distinta de la del catálogo (II): son independientes");
  const soloLgs = await productoClinico(P.admin, `Solo LGS ${MARCA}`, { p_grupo_senasica: null, p_clasificacion_lgs: "psicotropico_245_IV" });
  comprobar((await SB.from("insumos").select("exige_folio_receta").eq("id", soloLgs).single()).data.exige_folio_receta === true, "con solo clasificación LGS (sin grupo) también exige folio");
  const ninguna = await productoClinico(P.admin, `Sin clasificar ${MARCA}`);
  comprobar((await SB.from("insumos").select("exige_folio_receta, grupo_senasica").eq("id", ninguna).single()).data.exige_folio_receta === false, "sin clasificación no exige folio");
  const cambiar = await rpc(P.admin, "guardar_producto_clinico", {
    p_id: prodAmox, p_nombre: `Amoxicilina ${MARCA}`, p_area_id: m.area, p_unidad_compra_id: m.litro, p_unidad_consumo_id: m.ml, p_stock_minimo: 5,
    p_dias_aviso_caducidad: 45, p_principio_activo_id: amox.id, p_grupo_senasica: "II", p_clasificacion_lgs: null, p_es_antimicrobiano: true, p_clasificacion_por_confirmar: false,
  });
  a = (await SB.from("insumos").select("*").eq("id", prodAmox).single()).data;
  comprobar(cambiar.ok && a.grupo_senasica === "II" && a.clasificacion_por_confirmar === false && a.dias_aviso_caducidad === 45, "la clasificación se edita después");
  const chk = await rpc(P.admin, "guardar_producto_clinico", { p_id: prodAmox, p_nombre: "x", p_area_id: m.area, p_unidad_compra_id: m.litro, p_unidad_consumo_id: m.ml, p_stock_minimo: 0, p_dias_aviso_caducidad: 30, p_principio_activo_id: null, p_grupo_senasica: "IV", p_clasificacion_lgs: null, p_es_antimicrobiano: false, p_clasificacion_por_confirmar: false });
  comprobar(!chk.ok, "un grupo que no existe (IV) se rechaza");
  const editaDirecto = await patch(P.recSin, `insumos?id=eq.${prodKet}`, { grupo_senasica: "III" });
  comprobar(!editaDirecto.ok || (editaDirecto.cuerpo ?? []).length === 0, "sin permiso no se cambia la clasificación por la API directa");

  // ── 4. Lotes ──
  seccion("4. Lotes, libro inmutable y saldo derivado");
  const prod = await productoClinico(P.admin, `Suero ${MARCA}`);
  const L1 = `A-${MARCA}`, L2 = `B-${MARCA}`;
  const e1 = await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: L1, p_caducidad: sumaDias(hoyB, 300), p_cantidad_compra: 2, p_proveedor: "Distribuidora X" });
  const e2 = await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: L2, p_caducidad: sumaDias(hoyB, 100), p_cantidad_compra: 1 });
  comprobar(e1.ok && e2.ok, `dos lotes entran (${e1.mensaje}${e2.mensaje})`);
  const lote1 = e1.cuerpo, lote2 = e2.cuerpo;
  comprobar((await saldoLote(lote1)) === 2000 && (await saldoLote(lote2)) === 1000, "los saldos salen del libro: 2 L = 2000 ml y 1 L = 1000 ml");
  comprobar((await existencia(prod)) === 3000 && (await sumaLotes(prod)) === 3000, "la existencia global coincide con la suma de los lotes");
  const e1b = await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: L1.toLowerCase(), p_caducidad: sumaDias(hoyB, 300), p_cantidad_compra: 1 });
  comprobar(e1b.ok && e1b.cuerpo === lote1 && (await saldoLote(lote1)) === 3000, "otra entrada del mismo código y caducidad suma al mismo lote");
  const choque = await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: L1, p_caducidad: sumaDias(hoyB, 50), p_cantidad_compra: 1 });
  comprobar(!choque.ok, "el mismo código con otra caducidad se rechaza");
  comprobar(!(await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: `C-${MARCA}`, p_caducidad: null, p_cantidad_compra: 1 })).ok, "una entrada sin caducidad se rechaza (el producto la requiere)");
  comprobar(!(await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: "", p_caducidad: sumaDias(hoyB, 9), p_cantidad_compra: 1 })).ok, "ni sin código de lote");
  comprobar(!(await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: `D-${MARCA}`, p_caducidad: sumaDias(hoyB, 9), p_cantidad_compra: 0 })).ok, "ni con cantidad cero");
  const s1 = await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lote1, p_cantidad_consumo: 250, p_tipo: "surtido" });
  comprobar(s1.ok && (await saldoLote(lote1)) === 2750, "surtir 250 ml baja el lote");
  comprobar((await existencia(prod)) === 3750 && (await sumaLotes(prod)) === 3750, "y la existencia global baja lo mismo");
  comprobar(!(await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lote2, p_cantidad_consumo: 5000, p_tipo: "surtido" })).ok, "no se puede sacar más de lo que tiene el lote");
  comprobar(!(await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lote2, p_cantidad_consumo: 10, p_tipo: "merma" })).ok, "una merma sin motivo se rechaza");
  comprobar((await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lote2, p_cantidad_consumo: 100, p_tipo: "merma", p_motivo: "Se rompió el frasco" })).ok, "una merma con motivo entra");
  comprobar((await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lote2, p_cantidad_consumo: 50, p_tipo: "caducado", p_motivo: "Venció en el refri" })).ok, "un producto caducado se da de baja con motivo");
  comprobar(!(await rpc(P.admin, "registrar_lote_ajuste", { p_lote_id: lote2, p_cantidad_consumo: 99999, p_sentido: "negativo", p_motivo: "x" })).ok, "un ajuste negativo no deja el lote en negativo");
  comprobar(!(await rpc(P.admin, "registrar_lote_ajuste", { p_lote_id: lote2, p_cantidad_consumo: 5, p_sentido: "positivo", p_motivo: "" })).ok, "un ajuste sin motivo se rechaza");
  comprobar((await rpc(P.admin, "registrar_lote_ajuste", { p_lote_id: lote2, p_cantidad_consumo: 20, p_sentido: "positivo", p_motivo: "Conteo físico" })).ok, "un ajuste con motivo entra");
  comprobar((await saldoLote(lote2)) === 1000 - 100 - 50 + 20 && (await existencia(prod)) === (await sumaLotes(prod)), "los saldos siguen cuadrando (lotes = existencia global)");
  const mov = (await SB.from("lotes_movimientos").select("id").eq("lote_id", lote1).limit(1)).data[0];
  comprobar(Boolean((await SB.from("lotes_movimientos").update({ cantidad_base: 1 }).eq("id", mov.id)).error), "el libro del lote no se edita (ni con la llave de servidor)");
  comprobar(Boolean((await SB.from("lotes_movimientos").delete().eq("id", mov.id)).error), "ni se borra");
  comprobar(!(await post(P.admin, "lotes_movimientos", { lote_id: lote1, insumo_id: prod, tipo: "ajuste_positivo", cantidad_base: 99999, motivo: "truco" })).ok, "nadie escribe el libro directo por la API");
  comprobar(!(await post(P.admin, "insumo_lotes", { insumo_id: prod, codigo: "TRUCO" })).ok, "ni crea lotes directo");
  for (const [quien, token] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await rpc(token, "registrar_lote_salida", { p_lote_id: lote1, p_cantidad_consumo: 1, p_tipo: "surtido" })).ok, `${quien} no mueve lotes`);
  }
  comprobar(((await get(P.estetica, `insumo_lotes_saldo?lote_id=eq.${lote1}&select=saldo`)).cuerpo ?? []).length === 1, "el personal sí ve los saldos");
  comprobar(((await get(P.cliente, `insumo_lotes_saldo?select=saldo`)).cuerpo ?? []).length === 0 && ((await get(P.cliente, `lotes_movimientos?select=id`)).cuerpo ?? []).length === 0, "el cliente no ve lotes ni movimientos");

  // ── 5. Caducidades y alertas ──
  seccion("5. Caducidades y alertas");
  const prodC = await productoClinico(P.admin, `Caducidades ${MARCA}`, { p_stock_minimo: 100000 });
  const lcad = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prodC, p_codigo: `VENC-${MARCA}`, p_caducidad: sumaDias(hoyB, -3), p_cantidad_compra: 1 })).cuerpo;
  const lpor = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prodC, p_codigo: `PRON-${MARCA}`, p_caducidad: sumaDias(hoyB, 10), p_cantidad_compra: 1 })).cuerpo;
  const lok = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prodC, p_codigo: `OK-${MARCA}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 1 })).cuerpo;
  const est = async (id) => (await SB.from("insumo_lotes_saldo").select("estado_caducidad").eq("lote_id", id).single()).data.estado_caducidad;
  comprobar((await est(lcad)) === "caducado" && (await est(lpor)) === "por_caducar" && (await est(lok)) === "vigente", "estados: caducado, por caducar (a 10 días, aviso a 30) y vigente");
  const al = (await rpc(P.admin, "inventario_clinico_alertas")).cuerpo;
  comprobar(al.caducados >= 1 && al.por_caducar >= 1 && al.bajo_minimo >= 1, `alertas: ${al.caducados} caducados, ${al.por_caducar} por caducar, ${al.bajo_minimo} bajo mínimo`);
  comprobar(Boolean(al.caducado_desde) && Boolean(al.por_caducar_primero), "las alertas traen desde cuándo (para la antigüedad del aviso)");
  const alRecCon = (await rpc(P.recCon, "inventario_clinico_alertas")).cuerpo;
  comprobar(alRecCon.caducados >= 1, "recepción con el permiso las ve");
  // Un lote agotado ya no alerta
  await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lcad, p_cantidad_consumo: 1000, p_tipo: "caducado", p_motivo: "Se desechó" });
  const al2 = (await rpc(P.admin, "inventario_clinico_alertas")).cuerpo;
  comprobar(al2.caducados === al.caducados - 1, "dar de baja el lote caducado quita su alerta");

  // ── 6. Lo que mueve el resto de la app ──
  seccion("6. Consumos, ventas y regresos se reparten solos entre lotes");
  const prodF = await productoClinico(P.admin, `FEFO ${MARCA}`);
  const lA = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prodF, p_codigo: `TARDE-${MARCA}`, p_caducidad: sumaDias(hoyB, 400), p_cantidad_compra: 1 })).cuerpo;
  const lB = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prodF, p_codigo: `PRONTO-${MARCA}`, p_caducidad: sumaDias(hoyB, 90), p_cantidad_compra: 1 })).cuerpo;
  const compraSinLote = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: prodF, tipo: "entrada_compra", cantidad_base: 100, fecha_caducidad: sumaDias(hoyB, 50) });
  comprobar(Boolean(compraSinLote.error), `una compra sin lote se rechaza («${compraSinLote.error?.message?.slice(0, 60)}»)`);
  const consumo = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: prodF, tipo: "salida_consumo", cantidad_base: 1300, motivo: "receta de una cita" });
  comprobar(!consumo.error, `un consumo de 1300 ml de otra parte de la app entra (${consumo.error?.message ?? "ok"})`);
  comprobar((await saldoLote(lB)) === 0 && (await saldoLote(lA)) === 700, "sale primero del lote que caduca antes (1000 ml) y el resto del otro (300 ml)");
  comprobar((await existencia(prodF)) === 700 && (await sumaLotes(prodF)) === 700, "lotes y existencia siguen iguales");
  const regreso = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: prodF, tipo: "ajuste_positivo", cantidad_base: 200, motivo: "Venta cancelada" });
  comprobar(!regreso.error, "un regreso (venta cancelada) entra");
  const sinLote = (await SB.from("insumo_lotes_saldo").select("lote_id, saldo, codigo").eq("insumo_id", prodF).eq("codigo", "SIN LOTE")).data ?? [];
  comprobar(sinLote.length === 1 && num(sinLote[0].saldo) === 200 && (await existencia(prodF)) === 900, "el regreso va al lote «SIN LOTE» del producto");
  const demasiado = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: prodF, tipo: "salida_venta", cantidad_base: 5000, motivo: "Venta de mostrador" });
  comprobar(Boolean(demasiado.error), "sacar más de lo que hay en lotes se rechaza");
  const viejoSalida = await rpc(P.admin, "registrar_salida", { p_insumo_id: prodF, p_cantidad_consumo: 100, p_tipo: "consumo" });
  comprobar(viejoSalida.ok && (await existencia(prodF)) === 800 && (await sumaLotes(prodF)) === 800, "la salida de siempre (inventario normal) también se reparte entre lotes");

  // ── 7. Folio de receta ──
  seccion("7. Folio de receta: solo aviso");
  const lk = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prodKet, p_codigo: `K-${MARCA}`, p_caducidad: sumaDias(hoyB, 120), p_cantidad_compra: 1 })).cuerpo;
  const sinFolio = await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lk, p_cantidad_consumo: 5, p_tipo: "surtido" });
  comprobar(sinFolio.ok && /Grupo I/.test(sinFolio.cuerpo?.aviso ?? "") && /folio de receta/.test(sinFolio.cuerpo.aviso), "surtir un Grupo I sin folio funciona y avisa que más adelante se exigirá");
  const conFolio = await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lk, p_cantidad_consumo: 5, p_tipo: "surtido", p_folio_receta: "RX-0001" });
  comprobar(conFolio.ok && !conFolio.cuerpo.aviso, "con folio no hay aviso");
  comprobar((await SB.from("lotes_movimientos").select("folio_receta").eq("lote_id", lk).eq("folio_receta", "RX-0001")).data?.length === 1, "el folio queda guardado en el movimiento");
  const lLgs = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: soloLgs, p_codigo: `S-${MARCA}`, p_caducidad: sumaDias(hoyB, 120), p_cantidad_compra: 1 })).cuerpo;
  const avisoLgs = await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lLgs, p_cantidad_consumo: 5, p_tipo: "surtido" });
  comprobar(/Ley General de Salud/.test(avisoLgs.cuerpo?.aviso ?? ""), "un producto con clasificación LGS también avisa");
  const lN = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: ninguna, p_codigo: `N-${MARCA}`, p_caducidad: sumaDias(hoyB, 120), p_cantidad_compra: 1 })).cuerpo;
  comprobar(!(await rpc(P.admin, "registrar_lote_salida", { p_lote_id: lN, p_cantidad_consumo: 5, p_tipo: "surtido" })).cuerpo?.aviso, "uno sin clasificación no avisa");

  // ── 8. Activar lotes y aislamiento ──
  seccion("8. Pasar un insumo existente a lotes; aislamiento");
  const normal = (await SB.from("insumos").insert({ negocio_id: B, nombre: `Normal ${MARCA}-2`, area_id: m.area, unidad_compra_id: m.pieza, unidad_consumo_id: m.pieza }).select("id").single()).data.id;
  await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: normal, tipo: "ajuste_positivo", cantidad_base: 12, motivo: "existencia inicial" });
  comprobar(!(await rpc(P.recSin, "activar_lotes_insumo", { p_insumo_id: normal })).ok, "sin permiso no se activan lotes");
  comprobar((await rpc(P.admin, "activar_lotes_insumo", { p_insumo_id: normal })).ok, "con permiso se activan");
  const ini = (await SB.from("insumo_lotes_saldo").select("saldo, codigo").eq("insumo_id", normal)).data ?? [];
  comprobar(ini.length === 1 && ini[0].codigo === "INICIAL" && num(ini[0].saldo) === 12 && (await existencia(normal)) === 12, "su existencia (12) queda en un lote INICIAL y todo cuadra");
  comprobar((await rpc(P.admin, "activar_lotes_insumo", { p_insumo_id: normal })).ok && (await sumaLotes(normal)) === 12, "activar dos veces no duplica");

  const { data: adminsL } = await A.from("membresias").select("profile_id").eq("rol", "admin").is("deleted_at", null).limit(1);
  const tLud = await tokenDe(adminsL[0].profile_id);
  comprobar(((await get(tLud, `insumo_lotes_saldo?lote_id=eq.${lote1}&select=lote_id`, LUDOGTEKA)).cuerpo ?? []).length === 0, "Ludogteka no ve los lotes de Huellitas");
  comprobar(((await get(tLud, `lotes_movimientos?select=id&insumo_id=eq.${prod}`, B)).cuerpo ?? []).length === 0, "ni suplantando el encabezado");
  comprobar(!(await rpc(tLud, "registrar_lote_salida", { p_lote_id: lote1, p_cantidad_consumo: 1, p_tipo: "surtido" }, LUDOGTEKA)).ok, "ni mueve un lote de Huellitas");
  comprobar(!(await rpc(tLud, "registrar_lote_salida", { p_lote_id: lote1, p_cantidad_consumo: 1, p_tipo: "surtido" }, B)).ok, "ni suplantando el encabezado");
  comprobar(Object.keys((await rpc(tLud, "inventario_clinico_alertas", {}, LUDOGTEKA)).cuerpo ?? {}).length === 0, "Ludogteka (Veterinaria apagada) no tiene alertas clínicas");
  comprobar(!(await rpc(null, "inventario_clinico_alertas")).ok || Object.keys((await rpc(null, "inventario_clinico_alertas")).cuerpo ?? {}).length === 0, "la llave anónima no ve alertas");
  comprobar(!(await rpc(null, "activar_lotes_insumo", { p_insumo_id: normal })).ok, "ni activa lotes");
} finally {
  await fijarModulo("veterinaria", true);
  await quitar(P.admin, P.recConId, "lotes_clinicos");
  await quitar(P.admin, P.recSinId, "lotes_clinicos");
}
terminar();
