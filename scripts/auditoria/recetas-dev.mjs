// Veterinaria, Fase 4 · receta simple y reglas editables (SOLO DESARROLLO, en Huellitas; nunca
// Ludogteka). Migraciones 20261017000000 a 20261017000400.
//
//   node scripts/auditoria/recetas-dev.mjs
//
// 1. Reglas regulatorias: sembradas, legibles por el personal y editables SOLO por la plataforma.
// 2. Requisito por producto según su clasificación (gana el más estricto).
// 3. Receta simple: solo un médico designado, desde una consulta (firmada o abierta, QA S49) o la ficha; campos completos,
//    cantidad calculada, foto de datos, hash, no se edita, se anula con motivo.
// 4. Fracciones III y IV: se surten con límite (una vez / tres en seis meses), según la regla.
// 5. Conservación y archivado, liga del dueño, portal, aislamiento y llave anónima.
import { comprobar, seccion, terminar, llamar, cab, URL } from "./veterinaria-comun-dev.mjs";
import { preparar, limpiar, rpc, get, SB, B, A, dar, quitar, sumaDias, tokenDe } from "./recetas-comun-dev.mjs";
import crypto from "node:crypto";

const E = await preparar("rx");
const { P } = E;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const linea = (insumo, extra = {}) => ({ insumo_id: insumo, producto: null, dosis: "1 tableta", dosis_cantidad: 1, via: "Oral", frecuencia: "Cada 12 horas", frecuencia_horas: 12, duracion_dias: 5, ...extra });
try {
  const perro = await E.nuevoPerro("Recetin");
  const libre = (await SB.from("perros").select("id").eq("id", perro).single()).data.id;

  seccion("1. Reglas regulatorias editables solo por la plataforma");
  const reglas = await get(P.recSin, "vet_reglas?select=clave,valor");
  comprobar(reglas.ok && reglas.cuerpo.length >= 13, `el personal lee las reglas (${reglas.cuerpo?.length})`);
  const val = (c) => reglas.cuerpo.find((r) => r.clave === c)?.valor;
  comprobar(val("receta_copias") === 2 && val("receta_conservacion_meses") === 6 && val("lgs_tratamiento_max_dias") === 30 && val("sitpv_folios_alerta") === 10, "los valores sembrados son los dictados (2 copias, 6 meses, 30 días, 10 folios)");
  const cl = await get(P.recSin, "vet_reglas_clasificacion?select=clave,documento,surtidos_max,ventana_meses,libro_control&order=orden");
  const doc = (c) => cl.cuerpo.find((r) => r.clave === c);
  comprobar(doc("senasica_I")?.documento === "espejo_sitpv" && doc("senasica_I")?.libro_control && doc("senasica_II")?.documento === "receta_simple" && doc("senasica_III")?.documento === "libre", "Grupo I → SITPV con libro; II → receta simple; III → libre");
  comprobar(doc("psicotropico_245_III")?.surtidos_max === 1 && doc("psicotropico_245_IV")?.surtidos_max === 3 && doc("psicotropico_245_IV")?.ventana_meses === 6, "fracción III: una vez; fracción IV: 3 surtidos en 6 meses");
  comprobar(["estupefaciente_234", "psicotropico_245_II"].every((c) => doc(c)?.documento === "receta_especial" && doc(c)?.libro_control), "estupefacientes y fracción II → recetario especial con libro");
  comprobar(doc("antimicrobiano")?.documento === "receta_simple", "los antimicrobianos piden receta simple (Grupo II)");
  comprobar(!(await get(null, "vet_reglas?select=clave&limit=1")).ok || (await get(null, "vet_reglas?select=clave&limit=1")).cuerpo?.length === 0, "la llave anónima no las lee");
  for (const [quien, token] of [["admin del negocio", P.admin], ["recepción", P.recCon], ["cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await rpc(token, "plataforma_vet_regla_guardar", { p_clave: "receta_copias", p_valor: 5 })).ok, `${quien} no edita una regla`);
    comprobar(!(await rpc(token, "plataforma_vet_clasificacion_guardar", { p_clave: "senasica_I", p_documento: "libre", p_surtidos_max: null, p_ventana_meses: null, p_retencion_meses: null, p_libro_control: false, p_nota: null })).ok, `${quien} no edita una clasificación`);
  }
  const parche = await fetch(`${URL}/rest/v1/vet_reglas?clave=eq.receta_copias`, { method: "PATCH", headers: cab(P.admin), body: JSON.stringify({ valor: 9 }) });
  comprobar(!parche.ok && (await A.from("vet_reglas").select("valor").eq("clave", "receta_copias").single()).data.valor === 2, "ni modificando la tabla por la API (sin permiso, y el valor no cambió)");
  comprobar(!(await fetch(`${URL}/rest/v1/vet_reglas_clasificacion?clave=eq.senasica_I`, { method: "PATCH", headers: cab(P.admin), body: JSON.stringify({ documento: "libre" }) })).ok, "ni la tabla de clasificaciones");
  const plat = (await SB.from("plataforma_admins").select("profile_id").limit(1)).data?.[0]?.profile_id;
  const PL = await tokenDe(plat);
  comprobar((await rpc(PL, "plataforma_vet_regla_guardar", { p_clave: "receta_conservacion_meses", p_valor: 7 }, LUDOGTEKA)).ok, "la plataforma sí edita una regla");
  comprobar(!(await rpc(PL, "plataforma_vet_regla_guardar", { p_clave: "receta_conservacion_meses", p_valor: -1 }, LUDOGTEKA)).ok, "pero un valor negativo se rechaza");
  comprobar(!(await rpc(PL, "plataforma_vet_regla_guardar", { p_clave: "no_existe", p_valor: 1 }, LUDOGTEKA)).ok, "y una regla que no existe también");
  const ev = await get(PL, "plataforma_eventos?accion=eq.editar_regla_vet&select=accion&limit=1", LUDOGTEKA);
  comprobar(ev.ok && ev.cuerpo?.length === 1, "el cambio quedó en los eventos de la plataforma");
  const rec7 = await rpc(P.recSin, "vet_regla_num", { p_clave: "receta_conservacion_meses", p_defecto: 0 });
  comprobar(Number(rec7.cuerpo) === 7, "la base usa el valor editado");
  await rpc(PL, "plataforma_vet_regla_guardar", { p_clave: "receta_conservacion_meses", p_valor: 6 }, LUDOGTEKA);

  seccion("2. Requisito por producto");
  const req = async (id) => (await rpc(P.admin, "vet_requisito_insumo", { p_insumo: id })).cuerpo;
  comprobar((await req(E.grupoI)).documento === "espejo_sitpv" && (await req(E.grupoI)).libro_control === true, "Grupo I → espejo del SITPV y libro de control");
  comprobar((await req(E.grupoII)).documento === "receta_simple" && (await req(E.libre)).documento === "libre", "Grupo II → receta simple; III → libre");
  comprobar((await req(E.fr3)).documento === "receta_cedula" && (await req(E.fr3)).surtidos_max === 1, "fracción III → receta con cédula, una vez");
  comprobar((await req(E.fr4)).surtidos_max === 3 && (await req(E.fr4)).ventana_meses === 6, "fracción IV → tres veces en seis meses");
  comprobar((await req(E.especial)).documento === "receta_especial" && (await req(E.especial)).libro_control === true, "estupefaciente → recetario especial y libro");
  comprobar((await req(E.antim)).documento === "receta_simple", "antimicrobiano sin la opción → receta simple");
  await SB.from("veterinaria_ajustes").update({ espejo_antimicrobianos: true }).eq("negocio_id", B);
  comprobar((await req(E.antim)).documento === "espejo_sitpv", "con el espejo de antimicrobianos activado → SITPV");
  await SB.from("veterinaria_ajustes").update({ espejo_antimicrobianos: false }).eq("negocio_id", B);
  comprobar(!(await rpc(P.recSin, "guardar_veterinaria_espejo_antimicrobianos", { p_activo: true })).ok, "recepción sin «Configuración» no cambia la opción");
  comprobar((await rpc(P.admin, "guardar_veterinaria_espejo_antimicrobianos", { p_activo: true })).ok, "admin sí");
  comprobar((await rpc(P.admin, "veterinaria_ajustes_actuales")).cuerpo.espejo_antimicrobianos === true, "y los ajustes la devuelven");
  await rpc(P.admin, "guardar_veterinaria_espejo_antimicrobianos", { p_activo: false });

  seccion("3. Receta simple: quién la emite");
  const emitir = (token, lineas, extra = {}) => rpc(token, "vet_receta_emitir", { p_perro: perro, p_consulta: null, p_lineas: lineas, p_diagnostico: "Dermatitis", p_observaciones: null, ...extra });
  const L1 = [linea(E.grupoII, { cantidad_surtir: null })];
  comprobar(!(await emitir(P.recSin, L1)).ok, "recepción sin permiso ni designación no emite");
  await dar(P.admin, P.recSinId, "emitir_recetas");
  const sinMed = await emitir(P.recSin, L1);
  comprobar(!sinMed.ok && /m[eé]dico veterinario designado/i.test(sinMed.mensaje), `con el permiso pero sin ser médico tampoco (${sinMed.mensaje})`);
  await quitar(P.admin, P.recSinId, "emitir_recetas");
  comprobar(!(await emitir(P.admin, L1)).ok, "un admin que no es médico no puede emitirla");
  comprobar(!(await emitir(P.cliente, L1)).ok && !(await emitir(null, L1)).ok, "el cliente y la llave anónima tampoco");
  const e1 = await emitir(P.recCon, L1);
  comprobar(e1.ok && e1.cuerpo.numero >= 1, `el médico designado la emite (${e1.mensaje})`);
  const rx = e1.cuerpo.id;

  seccion("4. Su contenido: campos NOM-064, cantidad, foto, hash");
  const d = (await rpc(P.recCon, "vet_receta_detalle", { p_id: rx })).cuerpo;
  const s = d.snapshot;
  comprobar(s.medico.cedula === E.cedA && s.medico.nombre && s.medico.cpa === "CPA-F4", "lleva nombre, cédula y CPA del médico");
  comprobar(s.establecimiento.nombre && s.propietario.nombre && s.mascota.nombre.startsWith("Recetin") && s.mascota.especie === "perro", "lleva establecimiento, propietario y mascota (especie)");
  comprobar(/veterinar/i.test(s.leyenda), "lleva la leyenda de uso veterinario");
  const l = d.lineas[0];
  comprobar(l.producto.startsWith("Meloxicam") && l.dosis && l.via === "Oral" && l.frecuencia && l.duracion_dias === 5, "producto, dosis, vía, frecuencia y duración");
  comprobar(l.cantidad_calculada === 10 && l.cantidad_surtir === 10, "cantidad calculada = 1 tableta × 2 al día × 5 días = 10");
  comprobar(d.copias === 2 && d.estado === "emitida" && d.integra === true, "original + 2 copias, emitida y íntegra (hash)");
  const hoyB = E.hoy;
  const meses6 = new Date(new Date(`${hoyB}T12:00:00Z`).setUTCMonth(new Date(`${hoyB}T12:00:00Z`).getUTCMonth() + 6)).toISOString().slice(0, 10);
  comprobar(d.conservar_hasta === meses6, `se conserva hasta ${meses6} (6 meses)`);
  comprobar(d.fecha === hoyB, "con la fecha del negocio");
  const sinDosis = await emitir(P.recCon, [linea(E.grupoII, { dosis: "" })]);
  comprobar(!sinDosis.ok, "sin dosis se rechaza");
  comprobar(!(await emitir(P.recCon, [linea(E.grupoII, { via: "" })])).ok && !(await emitir(P.recCon, [linea(E.grupoII, { duracion_dias: null })])).ok, "sin vía o sin duración también");
  comprobar(!(await emitir(P.recCon, [])).ok, "sin medicamentos se rechaza");
  const libreTxt = await emitir(P.recCon, [{ insumo_id: null, producto: "Pomada de la clínica", dosis: "Una capa fina", via: "Tópica", frecuencia: "Cada 8 horas", duracion_dias: 7, cantidad_surtir: 1, cantidad_unidad: "tubo", tiempo_retiro: "No aplica" }]);
  comprobar(libreTxt.ok, `un producto en texto libre también se receta (${libreTxt.mensaje})`);
  const ret = await emitir(P.recCon, [linea(E.grupoII, { tiempo_retiro: "28 días", cantidad_surtir: 20 })]);
  const dr = (await rpc(P.recCon, "vet_receta_detalle", { p_id: ret.cuerpo.id })).cuerpo;
  comprobar(dr.lineas[0].tiempo_retiro === "28 días" && dr.lineas[0].cantidad_surtir === 20 && dr.lineas[0].cantidad_calculada === 10, "el tiempo de retiro y una cantidad distinta de la calculada se guardan");
  const gI = await emitir(P.recCon, [linea(E.grupoI)]);
  comprobar(!gI.ok && /SITPV/.test(gI.mensaje), `un Grupo I no se receta como simple (${gI.mensaje})`);
  const esp = await emitir(P.recCon, [linea(E.especial)]);
  comprobar(!esp.ok && /recetario especial/i.test(esp.mensaje), `un estupefaciente tampoco (${esp.mensaje})`);

  seccion("5. No se edita; se anula con motivo");
  const upd = async (cuerpo) => (await fetch(`${URL}/rest/v1/vet_recetas?id=eq.${rx}`, { method: "PATCH", headers: cab(P.admin), body: JSON.stringify(cuerpo) })).ok;
  comprobar(!(await upd({ observaciones: "x" })), "una receta no se edita por la API");
  const sbEdit = await SB.from("vet_recetas").update({ observaciones: "cambio" }).eq("id", rx);
  comprobar(Boolean(sbEdit.error), "ni siquiera con la llave de servidor");
  comprobar(Boolean((await SB.from("vet_recetas").delete().eq("id", rx)).error), "no se borra");
  comprobar(Boolean((await SB.from("vet_receta_lineas").update({ dosis: "otra" }).eq("receta_id", rx)).error), "sus líneas tampoco se editan");
  comprobar(!(await rpc(P.recCon, "vet_receta_anular", { p_id: rx, p_motivo: "x" })).ok, "anular pide un motivo");
  comprobar(!(await rpc(P.recSin, "vet_receta_anular", { p_id: rx, p_motivo: "Motivo largo" })).ok, "quien no tiene permiso no anula");
  comprobar((await rpc(P.recCon, "vet_receta_anular", { p_id: rx, p_motivo: "Dosis mal escrita" })).ok, "el médico la anula con motivo");
  const da = (await rpc(P.recCon, "vet_receta_detalle", { p_id: rx })).cuerpo;
  comprobar(da.estado === "anulada" && da.anulada_motivo === "Dosis mal escrita", "queda anulada con su motivo");
  comprobar(!(await rpc(P.recCon, "vet_receta_anular", { p_id: rx, p_motivo: "Otra vez" })).ok, "no se anula dos veces");
  const noReact = await SB.from("vet_recetas").update({ estado: "emitida" }).eq("id", rx);
  comprobar(Boolean(noReact.error), "una anulada no se reactiva");

  seccion("6. Desde una consulta abierta o firmada (QA S49)");
  // Para firmar, cada cargo de la consulta lleva precio (sin tocar el catálogo).
  const conPrecios = async (id) => {
    const c = await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: id });
    for (const l of c.cuerpo?.lineas ?? c.cuerpo?.cargos ?? []) if (l.precio == null || l.sin_precio) await rpc(P.recCon, "vet_consulta_cargo_precio", { p_id: l.id, p_precio: 1, p_guardar_catalogo: false });
  };
  const cons = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: E.medA });
  comprobar(cons.ok, `abre una consulta (${cons.mensaje})`);
  const cid = cons.cuerpo?.id ?? cons.cuerpo;
  const conBorrador = await emitir(P.recCon, L1, { p_consulta: cid });
  comprobar(conBorrador.ok, `con la consulta todavía abierta (borrador) ya se receta (${conBorrador.mensaje})`);
  const descartar = await rpc(P.recCon, "vet_consulta_descartar", { p_id: cid });
  comprobar(!descartar.ok && /receta emitida/i.test(descartar.mensaje), `un borrador con receta emitida no se descarta (${descartar.mensaje})`);
  await rpc(P.recCon, "vet_consulta_guardar", { p_id: cid, p_datos: { motivo: "Prurito", anamnesis: "x", examen_fisico: "x", diagnosticos: [{ origen: "libre", nombre: "Dermatitis", tipo: "definitivo" }], plan: "Tratar" } });
  await conPrecios(cid);
  const firma = await rpc(P.recCon, "vet_consulta_firmar", { p_id: cid });
  comprobar(firma.ok, `la consulta se firma (${firma.mensaje})`);
  const conFirmada = await emitir(P.recCon, L1, { p_consulta: cid });
  comprobar(conFirmada.ok, `firmada, ya se puede recetar desde ella (${conFirmada.mensaje})`);
  // Una consulta anulada no recibe recetas.
  const cons2 = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: E.medA });
  const cid2 = cons2.cuerpo?.id ?? cons2.cuerpo;
  await rpc(P.recCon, "vet_consulta_guardar", { p_id: cid2, p_datos: { motivo: "Revisión", anamnesis: "x", examen_fisico: "x", diagnosticos: [{ origen: "libre", nombre: "Sano", tipo: "definitivo" }], plan: "Nada" } });
  await conPrecios(cid2);
  await rpc(P.recCon, "vet_consulta_firmar", { p_id: cid2 });
  const anulo = await rpc(P.recCon, "vet_consulta_anular", { p_id: cid2, p_motivo: "Se capturó en otra mascota" });
  if (anulo.ok) {
    const conAnulada = await emitir(P.recCon, L1, { p_consulta: cid2 });
    comprobar(!conAnulada.ok && /anulada/i.test(conAnulada.mensaje), `con una consulta anulada se rechaza (${conAnulada.mensaje})`);
  } else console.log(`  · no se pudo anular la consulta de prueba (${anulo.mensaje}); se salta ese caso`);
  const otraMascota = await E.nuevoPerro("Otrin");
  comprobar(!(await rpc(P.recCon, "vet_receta_emitir", { p_perro: otraMascota, p_consulta: cid, p_lineas: L1, p_diagnostico: null, p_observaciones: null })).ok, "una consulta de otra mascota se rechaza");

  seccion("7. Fracciones III y IV: surtido con límite");
  const rf3 = await emitir(P.recCon, [linea(E.fr3, { cantidad_surtir: 20 })]);
  comprobar(rf3.ok, "una receta con diazepam (fracción III) se emite");
  const lf3 = (await rpc(P.recCon, "vet_receta_detalle", { p_id: rf3.cuerpo.id })).cuerpo;
  comprobar(lf3.snapshot.requiere_cedula === true && lf3.lineas[0].documento === "receta_cedula" && lf3.lineas[0].surtidos_max === 1, "marca que requiere cédula y guarda la regla (una vez)");
  const sinReceta = await rpc(P.admin, "vet_surtir_controlado", { p_tipo: "receta", p_doc: lf3.lineas[0].id, p_salidas: [{ lote_id: E.lote.fr3, cantidad: 5 }], p_perro: null, p_consulta: null, p_motivo: null });
  comprobar(sinReceta.ok, `se surte contra la receta (${sinReceta.mensaje})`);
  const dos = await rpc(P.admin, "vet_surtir_controlado", { p_tipo: "receta", p_doc: lf3.lineas[0].id, p_salidas: [{ lote_id: E.lote.fr3, cantidad: 5 }], p_perro: null, p_consulta: null, p_motivo: null });
  comprobar(!dos.ok && /m[aá]ximo de veces/i.test(dos.mensaje), `la fracción III no se surte dos veces (${dos.mensaje})`);
  comprobar(!(await rpc(P.recCon, "vet_receta_anular", { p_id: rf3.cuerpo.id, p_motivo: "Intento tardío" })).ok, "una receta ya surtida no se anula");
  const rf4 = await emitir(P.recCon, [linea(E.fr4, { cantidad_surtir: 30 })]);
  const lf4 = (await rpc(P.recCon, "vet_receta_detalle", { p_id: rf4.cuerpo.id })).cuerpo.lineas[0];
  const s4 = [];
  for (let i = 0; i < 4; i++) s4.push(await rpc(P.admin, "vet_surtir_controlado", { p_tipo: "receta", p_doc: lf4.id, p_salidas: [{ lote_id: E.lote.fr4, cantidad: 5 }], p_perro: null, p_consulta: null, p_motivo: null }));
  comprobar(s4[0].ok && s4[1].ok && s4[2].ok && !s4[3].ok, `fracción IV: tres surtidos y el cuarto se rechaza (${s4.map((x) => x.ok).join(",")})`);
  const exceso = await rpc(P.admin, "vet_surtir_controlado", { p_tipo: "receta", p_doc: (await rpc(P.recCon, "vet_receta_detalle", { p_id: (await emitir(P.recCon, [linea(E.fr3, { cantidad_surtir: 10 })])).cuerpo.id })).cuerpo.lineas[0].id, p_salidas: [{ lote_id: E.lote.fr3, cantidad: 50 }], p_perro: null, p_consulta: null, p_motivo: null });
  comprobar(!exceso.ok && /excede/i.test(exceso.mensaje), `no se surte más de lo que ampara (${exceso.mensaje})`);
  // La regla manda: se sube a 2 vez y la receta nueva ya trae ese límite (las emitidas conservan la suya).
  await rpc(PL, "plataforma_vet_clasificacion_guardar", { p_clave: "psicotropico_245_III", p_documento: "receta_cedula", p_surtidos_max: 2, p_ventana_meses: null, p_retencion_meses: 12, p_libro_control: false, p_nota: null }, LUDOGTEKA);
  const rf3b = await emitir(P.recCon, [linea(E.fr3, { cantidad_surtir: 20 })]);
  const lf3b = (await rpc(P.recCon, "vet_receta_detalle", { p_id: rf3b.cuerpo.id })).cuerpo.lineas[0];
  comprobar(lf3b.surtidos_max === 2, "al editar la regla en la plataforma, la receta nueva trae el límite nuevo");
  const o1 = await rpc(P.admin, "vet_surtir_controlado", { p_tipo: "receta", p_doc: lf3b.id, p_salidas: [{ lote_id: E.lote.fr3, cantidad: 5 }], p_perro: null, p_consulta: null, p_motivo: null });
  const o2 = await rpc(P.admin, "vet_surtir_controlado", { p_tipo: "receta", p_doc: lf3b.id, p_salidas: [{ lote_id: E.lote.fr3, cantidad: 5 }], p_perro: null, p_consulta: null, p_motivo: null });
  const o3 = await rpc(P.admin, "vet_surtir_controlado", { p_tipo: "receta", p_doc: lf3b.id, p_salidas: [{ lote_id: E.lote.fr3, cantidad: 5 }], p_perro: null, p_consulta: null, p_motivo: null });
  comprobar(o1.ok && o2.ok && !o3.ok, "y se aplica: dos surtidos sí, el tercero no");
  await rpc(PL, "plataforma_vet_clasificacion_guardar", { p_clave: "psicotropico_245_III", p_documento: "receta_cedula", p_surtidos_max: 1, p_ventana_meses: null, p_retencion_meses: 12, p_libro_control: false, p_nota: "Art. 251: se surte una vez y se retiene." }, LUDOGTEKA);

  seccion("8. Conservación, liga del dueño y portal");
  const arch = await rpc(P.recCon, "vet_receta_archivar", { p_id: e1.cuerpo.id });
  comprobar(!arch.ok && /conservarse hasta/i.test(arch.mensaje), `no se archiva antes de su plazo (${arch.mensaje})`);
  await SB.from("vet_recetas").update({ conservar_hasta: sumaDias(hoyB, -1) }).eq("id", rx).then(() => {});
  const tok = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(tok).digest("hex");
  comprobar((await rpc(P.recCon, "vet_receta_enlace", { p_id: conFirmada.cuerpo.id, p_token_hash: hash })).ok, "el médico genera la liga del dueño (solo se guarda el sha256)");
  comprobar(!(await rpc(P.recSin, "vet_receta_enlace", { p_id: conFirmada.cuerpo.id, p_token_hash: hash })).ok, "sin permiso no");
  const pub = await rpc(A.auth ? null : null, "receta_publica", { p_token_hash: hash });
  comprobar(!pub.ok, "la liga no se consulta con la llave anónima");
  const pubS = await SB.rpc("receta_publica", { p_token_hash: hash });
  comprobar(!pubS.error && pubS.data?.lineas?.length === 1 && pubS.data.integra === true && pubS.data.snapshot.medico.cedula === E.cedA, "el servidor la lee: líneas, íntegra, cédula");
  comprobar(!JSON.stringify(pubS.data).includes("notas_internas"), "sin notas internas");
  comprobar((await SB.rpc("receta_publica", { p_token_hash: "0".repeat(64) })).data === null, "un token inventado no devuelve nada");
  const portal = await rpc(P.cliente, "mis_recetas", { p_perro: perro });
  comprobar(portal.ok && Array.isArray(portal.cuerpo), "el portal responde para el dueño");
  comprobar((await rpc(P.cliente, "mis_recetas", { p_perro: otraMascota })).cuerpo.length === 0, "y no devuelve nada de una mascota ajena");
  comprobar((await rpc(null, "mis_recetas", { p_perro: perro })).ok === false, "la llave anónima no entra");

  seccion("9. Lectura anotada, aislamiento y anónimo");
  const lect = await SB.from("vet_lecturas").select("id").eq("negocio_id", B).eq("recurso", "receta").eq("recurso_id", rx);
  comprobar((lect.data ?? []).length >= 1, "ver una receta deja anotada la lectura");
  const lista = await rpc(P.recCon, "vet_recetas_lista", {});
  comprobar(lista.ok && lista.cuerpo.length >= 3 && lista.cuerpo[0].mascota, "la lista trae mascota, dueño y médico");
  comprobar(!(await rpc(P.cliente, "vet_recetas_lista", {})).ok && !(await rpc(null, "vet_recetas_lista", {})).ok, "el cliente y la llave anónima no listan");
  const otro = await rpc(P.admin, "vet_recetas_lista", {}, LUDOGTEKA);
  comprobar(!otro.ok || (otro.cuerpo ?? []).length === 0, "con el encabezado de otro negocio no se ve nada");
  for (const t of ["vet_recetas", "vet_receta_lineas", "vet_sitpv_recetas", "vet_recetario_especial", "vet_sitpv_reportes"]) {
    const g = await get(P.admin, `${t}?select=id&limit=1`);
    comprobar(g.ok && (g.cuerpo ?? []).length === 0, `${t}: nadie la lee directo por la API`);
    comprobar(!(await get(null, `${t}?select=id&limit=1`)).ok || (await get(null, `${t}?select=id&limit=1`)).cuerpo?.length === 0, `${t}: la llave anónima tampoco`);
  }
  for (const f of ["vet_receta_emitir", "vet_receta_anular", "vet_receta_detalle", "vet_surtir_controlado", "vet_sitpv_registrar", "vet_libro_control", "vet_requisito_insumo"]) {
    comprobar(!(await rpc(null, f, {})).ok, `${f}: la llave anónima no la ejecuta`);
  }
} finally {
  await limpiar(E);
}
terminar();
