// Requisitos sanitarios sin duplicados, corregibles y anulables (SOLO DESARROLLO, en Huellitas) — QA externa
// del 16 de octubre de 2026, N4. JWT reales de admin y recepción (con y sin «Registrar vacunas») y llave anónima.
//
//   node scripts/auditoria/requisitos-sanitarios-dev.mjs
import { avisoGeneralPendiente, textoDelBloqueo, tipoDeBloqueo } from "../../src/lib/reservas/bloqueos.ts";
import { personas, B, SB, rpc, post, patch, get, dar, quitar, hoy, sumaDias, datos, comprobar, seccion, terminar, fijarModulo } from "./veterinaria-comun-dev.mjs";

const P = await personas();
const MARCA = String(Date.now()).slice(-6);
// QA S16: los requisitos para hospedar de Huellitas, para dejarlos como estaban al terminar.
const tiposAntes = (await SB.from("tipos_requisito_sanitario").select("id, obligatoria, vigencia_meses").eq("negocio_id", B).is("deleted_at", null)).data ?? [];
const ajustesAntes = (await SB.from("negocio_ajustes_operacion").select("exige_evaluacion_comportamiento").eq("negocio_id", B).is("deleted_at", null).maybeSingle()).data;
try {
  await fijarModulo("veterinaria", true);
  await quitar(P.admin, P.recConId, "registrar_vacunas");
  await quitar(P.admin, P.recSinId, "registrar_vacunas");
  const hoyB = await hoy(P.admin);
  const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Reqsan ${MARCA}` }).select("id").single()).data.id;
  const tipo = (await SB.from("tipos_requisito_sanitario").select("id").eq("negocio_id", B).is("deleted_at", null).order("orden").limit(1).single()).data.id;
  const nuevo = (fecha, token = P.recSin) => post(token, "requisitos_sanitarios_aplicados", { perro_id: perro, tipo_requisito_id: tipo, fecha_aplicacion: fecha });

  seccion("1. Sin duplicados");
  const a = await nuevo(hoyB);
  comprobar(a.ok, `recepción registra un requisito (${a.mensaje})`);
  const idA = a.cuerpo?.[0]?.id;
  const dup = await nuevo(hoyB);
  comprobar(!dup.ok && /Ya hay un registro/.test(dup.mensaje), `el mismo tipo y fecha se rechaza (${dup.mensaje})`);
  const otraFecha = await nuevo(sumaDias(hoyB, -30));
  comprobar(otraFecha.ok, "otra fecha del mismo tipo sí entra");
  const idB = otraFecha.cuerpo?.[0]?.id;

  seccion("2. Corregir y anular: quién");
  const corregir = (token, id, fecha, motivo = "Se capturó mal la fecha") => rpc(token, "corregir_requisito_aplicado", { p_id: id, p_fecha: fecha, p_detalle: "Dra. X", p_notas: null, p_motivo: motivo });
  const anular = (token, id, motivo = "Registro capturado por error") => rpc(token, "anular_requisito_aplicado", { p_id: id, p_motivo: motivo });
  comprobar(!(await corregir(P.recSin, idA, sumaDias(hoyB, -1))).ok, "recepción SIN el permiso no corrige");
  comprobar(!(await anular(P.recSin, idA)).ok, "recepción SIN el permiso no anula");
  comprobar(!(await rpc(null, "anular_requisito_aplicado", { p_id: idA, p_motivo: "Intento anónimo" })).ok, "la llave anónima no anula");
  comprobar(!(await rpc(P.cliente, "anular_requisito_aplicado", { p_id: idA, p_motivo: "Intento del dueño" })).ok, "el dueño no anula");

  seccion("3. Corregir");
  comprobar(!(await corregir(P.admin, idA, sumaDias(hoyB, 5))).ok, "una fecha futura se rechaza");
  comprobar(!(await corregir(P.admin, idA, sumaDias(hoyB, -30))).ok, "no se puede dejar igual que otro registro del mismo tipo y fecha");
  comprobar(!(await corregir(P.admin, idA, sumaDias(hoyB, -2), "")).ok, "sin motivo se rechaza");
  const ok = await corregir(P.admin, idA, sumaDias(hoyB, -2));
  comprobar(ok.ok, `admin corrige la fecha (${ok.mensaje})`);
  const fila = (await SB.from("requisitos_sanitarios_aplicados").select("*").eq("id", idA).single()).data;
  comprobar(fila.fecha_aplicacion === sumaDias(hoyB, -2) && fila.detalle === "Dra. X", "la fecha y el detalle quedan corregidos");
  comprobar(Array.isArray(fila.historial) && fila.historial.length === 1 && fila.historial[0].antes.fecha_aplicacion === hoyB, "el historial guarda lo que decía antes");
  await dar(P.admin, P.recConId, "registrar_vacunas");
  comprobar((await corregir(P.recCon, idA, sumaDias(hoyB, -3))).ok, "recepción CON «Registrar vacunas» también corrige");

  seccion("4. Directo por la API no se cambia ni se borra");
  comprobar(!(await patch(P.recSin, `requisitos_sanitarios_aplicados?id=eq.${idA}`, { fecha_aplicacion: hoyB })).ok, "un PATCH directo a la fecha se rechaza");
  const baja = await patch(P.admin, `requisitos_sanitarios_aplicados?id=eq.${idA}`, { deleted_at: new Date().toISOString() });
  comprobar(!baja.ok, "un PATCH directo a deleted_at se rechaza");
  comprobar((await patch(P.recSin, `requisitos_sanitarios_aplicados?id=eq.${idA}`, { comprobante_path: `x/${MARCA}.jpg` })).ok, "adjuntar el comprobante directo sí se puede");

  seccion("5. Anular");
  comprobar(!(await anular(P.admin, idB, "no")).ok, "el motivo es obligatorio (5 caracteres)");
  const an = await anular(P.recCon, idB);
  comprobar(an.ok, `anula quien tiene el permiso (${an.mensaje})`);
  const filaB = (await SB.from("requisitos_sanitarios_aplicados").select("deleted_at, anulado_motivo, anulado_por, historial").eq("id", idB).single()).data;
  comprobar(filaB.deleted_at && filaB.anulado_motivo === "Registro capturado por error" && filaB.anulado_por === P.recConId, "queda anulado con motivo y quién (no se borra)");
  comprobar(!(await anular(P.admin, idB)).ok, "no se anula dos veces");
  comprobar(!(await corregir(P.admin, idB, sumaDias(hoyB, -10))).ok, "un anulado no se corrige");
  const reuso = await nuevo(sumaDias(hoyB, -30));
  comprobar(reuso.ok, "tras anular, esa fecha se puede volver a capturar");
  const estado = (await get(P.admin, `perro_requisitos_sanitarios_estado?perro_id=eq.${perro}&tipo_requisito_id=eq.${tipo}`)).cuerpo;
  comprobar(Array.isArray(estado) && estado.length === 1, "el estado del requisito sigue saliendo de los registros vivos");

  seccion("6. Otro negocio");
  const LUD = "10000000-0000-4000-8000-000000000001";
  comprobar(!(await rpc(P.admin, "anular_requisito_aplicado", { p_id: idA, p_motivo: "Desde otro negocio" }, LUD)).ok, "un admin con el encabezado de otro negocio no anula");

  seccion("7. N20: el aviso del bloqueo, según el permiso de «Excepciones al reservar»");
  // Un bloqueo REAL de la base (perro sin evaluación de comportamiento), leído como recepción sin el permiso.
  await quitar(P.admin, P.recSinId, "excepciones_reserva");
  const srv = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").neq("unidad", "hora").is("deleted_at", null).limit(1).maybeSingle()).data;
  const reserva = await post(P.recSin, "reservas", { cliente_id: datos.clienteSoloB });
  if (!srv || !reserva.ok) {
    comprobar(false, `no se pudo armar la reserva de prueba (${reserva.mensaje})`);
  } else {
    const manana = sumaDias(hoyB, 40 + Math.floor(Math.random() * 100));
    const r = await post(P.recSin, "estancias", { reserva_id: reserva.cuerpo[0].id, perro_id: perro, servicio_id: srv.id, fecha_entrada: manana, fecha_salida: sumaDias(manana, 1), estado: "reservada" });
    const crudo = r.mensaje;
    comprobar(!r.ok && tipoDeBloqueo(crudo) === "comportamiento", `la base rechaza por la evaluación («${crudo.slice(0, 90)}»)`);
    const sinPermiso = textoDelBloqueo(crudo, false);
    comprobar(!/puede autorizar|permiso «Excepciones/.test(sinPermiso.split("No se puede reservar")[0]), "sin el permiso, el aviso no le ofrece autorizar la excepción");
    comprobar(/No se puede reservar hasta que se resuelva/.test(sinPermiso) && /pídesela a un admin o a quien tenga el permiso/.test(sinPermiso), "y dice que no se puede reservar y a quién pedírselo");
    comprobar(textoDelBloqueo(crudo, true) === crudo, "con el permiso el aviso queda igual (ahí está la casilla)");
    await SB.from("reservas").delete().eq("id", reserva.cuerpo[0].id);
  }

  // N20 (sigue): los avisos GENERALES de abajo de «Crear reserva» tampoco ofrecen autorizar a quien no puede.
  seccion("7b. N20: los avisos generales de «Crear reserva»");
  for (const tipo of ["sanitario", "comportamiento"]) {
    const sin = avisoGeneralPendiente(tipo, false);
    comprobar(!/si tienes permiso|autoriza la excepci/i.test(sin), `(${tipo}) sin el permiso no ofrece autorizar la excepción`);
    comprobar(/Sin eso no se puede reservar/.test(sin) && /pídesela a un admin o a quien tenga el permiso «Excepciones al reservar»/.test(sin), `(${tipo}) dice que no se puede reservar y a quién pedírsela`);
    const con = avisoGeneralPendiente(tipo, true);
    comprobar(/autoriza la excepción con su motivo/.test(con) && !/si tienes permiso/i.test(con), `(${tipo}) con el permiso sí ofrece autorizar, sin «si tienes permiso»`);
  }
  // Ningún texto de pantalla del flujo de reservas manda a "si tienes permiso".
  const fuente = (await import("node:fs")).readFileSync("src/app/(staff)/reservas/nueva/nueva-reserva-form.tsx", "utf8");
  comprobar(!/si tienes permiso/i.test(fuente), "el formulario de reservas ya no dice «si tienes permiso» en ningún aviso");

  // QA S14: la desparasitación pide «Veterinario y clínica» igual que una vacuna (además del producto).
  seccion("8. Desparasitación: veterinario y clínica");
  const form = (await import("node:fs")).readFileSync("src/app/(staff)/perros/requisito-form.tsx", "utf8");
  comprobar(/label="Veterinario y clínica"/.test(form) && !/esDesparasitacion \? "Producto usado" : "Veterinario y clínica"/.test(form), "el formulario pide «Veterinario y clínica» para cualquier tipo (también desparasitación)");
  comprobar(/esDesparasitacion && <Field label="Producto usado"/.test(form), "y en la desparasitación pide además el producto");
  const tipoDes = (await SB.from("tipos_requisito_sanitario").select("id").eq("negocio_id", B).eq("categoria", "desparasitacion").is("deleted_at", null).limit(1).maybeSingle()).data;
  if (tipoDes) {
    const r = await post(P.recSin, "requisitos_sanitarios_aplicados", { perro_id: perro, tipo_requisito_id: tipoDes.id, fecha_aplicacion: sumaDias(hoyB, -3), detalle: "Producto: Drontal · Veterinario y clínica: Dra. Prueba, Clínica Centro" });
    comprobar(r.ok, `recepción registra una desparasitación con producto y veterinario (${r.mensaje ?? "ok"})`);
    const guardado = r.cuerpo?.[0]?.detalle ?? "";
    comprobar(/Veterinario y clínica: Dra\. Prueba/.test(guardado), "el detalle guarda quién la aplicó");
  } else comprobar(false, "Huellitas no tiene un tipo de desparasitación");

  // QA S16 (N57): el expediente y la reserva usan la MISMA regla. Un perro con evaluación pero sin vacunas: la reserva
  // lo rechaza por vacunas y pendientes_para_estancia (de donde sale «Nada bloquea…») lo lista como bloqueo.
  seccion("9. N57: «Nada bloquea» sale de la misma regla que la reserva");
  const perro2 = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Reqsan2 ${MARCA}`, tamano_id: (await SB.from("tamanos_categoria").select("id").limit(1).single()).data.id }).select("id").single()).data.id;
  const ev = await rpc(P.admin, "marcar_evaluacion_comportamiento", { p_perro_id: perro2, p_fecha: hoyB, p_notas: null });
  comprobar(ev.ok, `se marca su evaluación (${ev.mensaje ?? "ok"})`);
  const pend = await rpc(P.admin, "pendientes_para_estancia", { p_perro_ids: [perro2] });
  const bloquean = (pend.cuerpo ?? []).filter((x) => x.bloquea && (x.grupo === "bloquea" || x.grupo === "condicion"));
  const reserva2 = await post(P.admin, "reservas", { cliente_id: datos.clienteSoloB });
  const srv2 = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").neq("unidad", "hora").is("deleted_at", null).limit(1).single()).data;
  const fecha2 = sumaDias(hoyB, 60 + Math.floor(Math.random() * 100));
  const est2 = await post(P.admin, "estancias", { reserva_id: reserva2.cuerpo[0].id, perro_id: perro2, servicio_id: srv2.id, fecha_entrada: fecha2, fecha_salida: sumaDias(fecha2, 1), estado: "reservada" });
  const bloqueaVacunas = !est2.ok && tipoDeBloqueo(est2.mensaje) === "sanitario";
  comprobar(bloqueaVacunas && bloquean.some((x) => x.clave.startsWith("sanitario:")), "la reserva lo rechaza por vacunas Y el expediente lista esas vacunas como bloqueo (ya no dice «Nada bloquea»)");
  const pagina = (await import("node:fs")).readFileSync("src/app/(staff)/perros/[id]/page.tsx", "utf8");
  comprobar(/bloqueos=\{pendientesEstancia\.filter/.test(pagina), "el bloque «Requisitos para guardería y hotel» recibe los bloqueos de pendientes_para_estancia");

  seccion("10. Requisitos para hospedar: quitar o relajar");
  const obligatorios = tiposAntes.filter((t) => t.obligatoria).map((t) => t.id);
  const sinPermisoReq = await rpc(P.recSin, "guardar_requisitos_estancia", { p_exige_evaluacion: false, p_obligatorias: [], p_vigencias: {} });
  comprobar(!sinPermisoReq.ok, `recepción sin «Configuración del negocio» no cambia los requisitos (${sinPermisoReq.mensaje})`);
  const anonReq = await rpc(null, "guardar_requisitos_estancia", { p_exige_evaluacion: false, p_obligatorias: [], p_vigencias: {} });
  comprobar(!anonReq.ok, "la llave anónima tampoco");
  const malaVig = await rpc(P.admin, "guardar_requisitos_estancia", { p_exige_evaluacion: true, p_obligatorias: obligatorios, p_vigencias: { [tiposAntes[0].id]: 0 } });
  comprobar(!malaVig.ok && /1 a 60 meses/.test(malaVig.mensaje), `una vigencia de 0 meses se rechaza (${malaVig.mensaje})`);
  const perro3 = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Reqsan3 ${MARCA}`, tamano_id: (await SB.from("tamanos_categoria").select("id").limit(1).single()).data.id }).select("id").single()).data.id;
  const apagar = await rpc(P.admin, "guardar_requisitos_estancia", { p_exige_evaluacion: false, p_obligatorias: [], p_vigencias: {} });
  comprobar(apagar.ok, `el admin quita la evaluación y las vacunas obligatorias (${apagar.mensaje ?? "ok"})`);
  const pend3 = await rpc(P.admin, "pendientes_para_estancia", { p_perro_ids: [perro3] });
  comprobar(!(pend3.cuerpo ?? []).some((x) => x.clave === "evaluacion" || x.clave.startsWith("sanitario:")), "pendientes_para_estancia ya no pide evaluación ni vacunas");
  const reserva3 = await post(P.admin, "reservas", { cliente_id: datos.clienteSoloB });
  const fecha3 = sumaDias(hoyB, 200 + Math.floor(Math.random() * 100));
  const est3 = await post(P.admin, "estancias", { reserva_id: reserva3.cuerpo[0].id, perro_id: perro3, servicio_id: srv2.id, fecha_entrada: fecha3, fecha_salida: sumaDias(fecha3, 1), estado: "reservada" });
  comprobar(est3.ok, `y la reserva de un perro sin evaluación ni vacunas entra (${est3.mensaje ?? "ok"})`);
  const ajuste = (await SB.from("negocio_ajustes_operacion").select("requisitos_revisados_at, requisitos_revisados_por").eq("negocio_id", B).single()).data;
  comprobar(Boolean(ajuste.requisitos_revisados_at && ajuste.requisitos_revisados_por), "queda anotado cuándo y quién revisó los requisitos");
  await SB.from("estancias").update({ estado: "cancelada" }).eq("reserva_id", reserva3.cuerpo[0].id);
  await SB.from("reservas").delete().eq("id", reserva2.cuerpo[0].id);
} finally {
  await quitar(P.admin, P.recConId, "registrar_vacunas");
  // Huellitas vuelve a sus requisitos de antes (otras auditorías esperan la evaluación y las vacunas).
  const vig = Object.fromEntries(tiposAntes.map((t) => [t.id, t.vigencia_meses]));
  const r = await rpc(P.admin, "guardar_requisitos_estancia", { p_exige_evaluacion: ajustesAntes?.exige_evaluacion_comportamiento ?? true, p_obligatorias: tiposAntes.filter((t) => t.obligatoria).map((t) => t.id), p_vigencias: vig });
  if (!r.ok) console.log(`  ✘ no se pudieron restaurar los requisitos de Huellitas: ${r.mensaje}`);
}
terminar();
