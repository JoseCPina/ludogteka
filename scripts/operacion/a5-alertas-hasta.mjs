// Operación A5 «fresh start de noviembre» (4 de noviembre de 2026, pedido del dueño): dar por revisadas o cerradas las
// alertas de «Necesita atención» de Ludogteka anteriores a una fecha (hora de México), con la sesión real del admin del
// negocio (Ronith) y las mismas funciones que usa la app, con motivo en cada una. Tipos:
//   · tarjetas manuales por revisar       → tarjeta_manual_revisar (quedan «revisadas» con la nota)
//   · contratos pendientes de firma       → cancelar_contrato (estado cancelado + motivo en contratos_internos)
//   · llegadas atrasadas (estancias reservadas/confirmadas con la entrada pasada) → estado no_llego (como «No llegó» en la app)
//   · links de pago sin resolver (mp_ordenes en «creada») → canceladas con el motivo (como «Cancelar» en la app)
//   · conciliación de Mercado Pago        → conciliacion_dar_por_revisadas_hasta (ya existe)
// Lo que NO se cierra solo y se lista: cuentas con saldo pendiente (son dinero: se cobran o se cancelan una por una), saldos a
// favor (son devoluciones), comprobantes sanitarios propuestos (hay que verlos) y citas de días pasados sin cerrar.
//   node scripts/operacion/a5-alertas-hasta.mjs --hasta 2026-11-01 --revisar
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/a5-alertas-hasta.mjs --hasta 2026-11-01 --aplicar
// Reversa: respaldo JSON de cada fila tocada (carpeta temporal) con su estado anterior.
import { leer, escribir, respaldar, LUDOGTEKA_ID as L, diaMx, dinero } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const hasta = args[args.indexOf("--hasta") + 1];
if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? "")) throw new Error("Falta --hasta AAAA-MM-DD.");
const MOTIVO = `Fresh start de noviembre: dado por revisado por la plataforma a petición del dueño (4 de noviembre de 2026), anterior al ${hasta}.`;
const R = comoPersona(await tokenDe("1d24ded5-632c-43d2-9feb-8644d65b7407"));
const antesDe = (iso) => diaMx(iso) < hasta;

const tarjetas = (await leer(`tarjetas_manuales?negocio_id=eq.${L}&estado=eq.por_revisar&deleted_at=is.null&select=id,created_at,monto,folio,cobro_id&order=created_at`, { todas: true })).filter((t) => antesDe(t.created_at));
const contratos = (await leer(`contratos?negocio_id=eq.${L}&estado=eq.pendiente_firma&deleted_at=is.null&select=id,created_at,perro_id,perros(nombre)&order=created_at`, { todas: true })).filter((c) => antesDe(c.created_at));
const llegadas = await leer(`estancias?negocio_id=eq.${L}&estado=in.(reservada,confirmada)&fecha_entrada=lt.${hasta}&deleted_at=is.null&select=id,estado,fecha_entrada,fecha_salida,notas,perros(nombre),servicios(nombre)&order=fecha_entrada`, { todas: true });
const ordenes = (await leer(`mp_ordenes?negocio_id=eq.${L}&estado=eq.creada&deleted_at=is.null&select=id,created_at,monto,tipo,reserva_id,detalle_error&order=created_at`, { todas: true })).filter((o) => antesDe(o.created_at));
const conciliacion = (await leer(`conciliacion_terminal?negocio_id=eq.${L}&resuelta_at=is.null&deleted_at=is.null&select=id,tipo,monto,ocurrio_at`, { todas: true })).filter((c) => antesDe(c.ocurrio_at));
// Solo se listan:
const saldos = ((await R.rpc("saldos_de_salidas_json", { p_dias: 400 })) ?? []).filter((s) => (s.salio_el ?? "").slice(0, 10) < hasta);
const aFavor = ((await R.rpc("tablero_atencion", { p_grupo: "dinero" }))?.saldos_a_favor ?? []).filter((s) => (s.fecha_actividad ?? "").slice(0, 10) < hasta);
const comprobantes = (await leer(`requisitos_sanitarios_propuestos?negocio_id=eq.${L}&estado=eq.pendiente&deleted_at=is.null&select=id,created_at`, { todas: true })).filter((c) => antesDe(c.created_at));
const citas = (await leer(`citas_estetica?negocio_id=eq.${L}&estado=in.(reservada,confirmada,en_curso)&inicio=lt.${hasta}T06:00:00Z&deleted_at=is.null&select=id,inicio,estado`, { todas: true }));

console.log(`Ludogteka · alertas anteriores al ${hasta} (hora de México)`);
console.log(`  se cierran: tarjetas manuales por revisar ${tarjetas.length} · contratos pendientes de firma ${contratos.length} · llegadas atrasadas ${llegadas.length} · links de pago sin resolver ${ordenes.length} · conciliación ${conciliacion.length}`);
console.log(`  solo se listan: cuentas con saldo de perros que ya se fueron ${saldos.length} · saldos a favor ${aFavor.length} · comprobantes propuestos ${comprobantes.length} · citas pasadas sin cerrar ${citas.length}`);
for (const t of tarjetas) console.log(`   tarjeta ${diaMx(t.created_at)} ${dinero(t.monto)} folio ${t.folio ?? "—"} ${t.id.slice(0, 8)}`);
for (const c of contratos) console.log(`   contrato ${diaMx(c.created_at)} ${c.perros?.nombre} ${c.id.slice(0, 8)}`);
for (const e of llegadas) console.log(`   llegada ${e.fecha_entrada}→${e.fecha_salida} ${e.perros?.nombre} ${e.servicios?.nombre} [${e.estado}] ${e.id.slice(0, 8)}`);
for (const o of ordenes) console.log(`   link ${diaMx(o.created_at)} ${dinero(o.monto)} ${o.id.slice(0, 8)}`);
for (const s of saldos) console.log(`   saldo pendiente ${s.salio_el?.slice(0, 10)} ${dinero(s.saldo)} ${s.cliente_nombre} · ${s.descripcion} (${s.reserva_id.slice(0, 8)})`);
for (const s of aFavor) console.log(`   saldo a favor ${s.fecha_actividad?.slice(0, 10)} ${dinero(-s.saldo)} ${s.cliente_nombre} · ${s.descripcion} (${s.reserva_id.slice(0, 8)})`);
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");

console.log("respaldo:", respaldar(`a5-alertas-hasta-${hasta}`, { tarjetas, contratos, llegadas, ordenes, conciliacion }));
const hecho = { tarjetas: 0, contratos: 0, llegadas: 0, links: 0, conciliacion: 0 }, errores = [];
for (const t of tarjetas) { try { await R.rpc("tarjeta_manual_revisar", { p_tarjeta_id: t.id, p_nota: MOTIVO }); hecho.tarjetas++; } catch (e) { errores.push(`tarjeta ${t.id.slice(0, 8)}: ${e.message.slice(0, 140)}`); } }
for (const c of contratos) { try { await R.rpc("cancelar_contrato", { p_contrato_id: c.id, p_motivo: MOTIVO }); hecho.contratos++; } catch (e) { errores.push(`contrato ${c.id.slice(0, 8)}: ${e.message.slice(0, 140)}`); } }
for (const e of llegadas) { try { await R.patch("estancias", `id=eq.${e.id}`, { estado: "no_llego", notas: `${e.notas ? e.notas + "\n" : ""}${MOTIVO}` }); hecho.llegadas++; } catch (x) { errores.push(`llegada ${e.id.slice(0, 8)}: ${x.message.slice(0, 140)}`); } }
for (const o of ordenes) { try { await escribir("mp_ordenes", `id=eq.${o.id}&estado=eq.creada`, { estado: "cancelada", detalle_error: MOTIVO, notificado_at: new Date().toISOString() }); hecho.links++; } catch (x) { errores.push(`link ${o.id.slice(0, 8)}: ${x.message.slice(0, 140)}`); } }
if (conciliacion.length) { try { const r = await R.rpc("conciliacion_dar_por_revisadas_hasta", { p_hasta: hasta, p_nota: MOTIVO }); hecho.conciliacion = Number(r?.cerradas ?? r ?? conciliacion.length); } catch (e) { errores.push(`conciliación: ${e.message.slice(0, 140)}`); } }
console.log(`✔ cerradas: tarjetas ${hecho.tarjetas}/${tarjetas.length} · contratos ${hecho.contratos}/${contratos.length} · llegadas ${hecho.llegadas}/${llegadas.length} · links ${hecho.links}/${ordenes.length} · conciliación ${hecho.conciliacion}/${conciliacion.length}`);
for (const e of errores) console.log("  ✖", e);
console.log("bitácora:", respaldar(`a5-resultado-${hasta}`, { hecho, errores, listados: { saldos, aFavor, comprobantes: comprobantes.length, citas: citas.length } }));
