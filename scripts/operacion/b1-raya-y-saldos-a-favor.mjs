// Operación B1 (5 de noviembre de 2026, pedido del dueño): Raya (Myriam Lizeth Hernández Ruíz) y los saldos a favor que no
// eran dinero del cliente. Con la sesión real del admin de Ludogteka (Ronith) por la API, con las mismas funciones y
// disparadores que la app; respaldo JSON de cada fila tocada; nada se borra.
//
//  1. Raya, 4 de noviembre: el check-in se hizo sobre la estancia del 22 de octubre (b5cb7141, que ya tenía su día de pase
//     descontado el 22). La visita del 4 nunca se registró ni descontó el pase. Se crea la reserva y estancia del 4 (llegada
//     13:52, salida 17:21 = cuando pagó la «Visita cantera»), se le aplica el pase (queda en 12 de 15) y se cierra; y la
//     estancia del 22 se cierra con su fecha real (entrada 22/10 10:51, salida 22/10 19:00, captura tardía).
//  2. Alejandra Perez: la corrección de precio −$60 quedó huérfana cuando la cita se canceló y se volvió a crear (pagó $450);
//     se anula la corrección con motivo (anular_correccion_precio, como desde la cuenta).
//  3. Daniela Reyes: la transferencia de $255 del 12 de octubre cubría «Cañada + corte de uñas» ($65) y el baño exprés de
//     Bruno ($190) pero se registró completa en la primera cuenta; la del baño quedó «por cobrar» y se canceló el 16 por
//     error de captura. Se anula el cobro de $255 y se registran $65 y $190 en su cuenta (transferencia, turno de hoy).
//  Lo que NO hace (necesita la función deshacer_no_llego_estancia de la rama fix/revertir-operaciones): regresar a su estado
//  real las estancias marcadas «no llegó» que sí ocurrieron (Blacky 22/10, Raya y Blacky 26/10, Vincent 20–23/10): b2.
//   node scripts/operacion/b1-raya-y-saldos-a-favor.mjs --revisar
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/b1-raya-y-saldos-a-favor.mjs --aplicar [--solo raya|alejandra|daniela]
// Reversa: estancias → valores del respaldo; corrección de precio → deleted_at/anulada_* a null; cobros → anular los dos
// nuevos y registrar de nuevo los $255 (el anulado queda en cobro_correcciones).
import { leer, rpc, respaldar, dinero, horaMx } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const APLICAR = process.argv.includes("--aplicar");
const SOLO = process.argv.includes("--solo") ? process.argv[process.argv.indexOf("--solo") + 1] : null;
const RONITH = "1d24ded5-632c-43d2-9feb-8644d65b7407";
const R = comoPersona(await tokenDe(RONITH));
const totales = async (reserva) => (await R.rpc("cuenta_totales_reserva", { p_reserva_id: reserva }).then((x) => (Array.isArray(x) ? x[0] : x))) ?? {};
const cuenta = (t) => `total ${dinero(t.total_cuenta)} · cobrado ${dinero(t.total_cobrado)} · pase ${dinero(t.total_bono)} · saldo ${dinero(t.saldo)}`;
const log = (...a) => console.log(...a);
if (APLICAR && process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");

// ── 1. Raya ─────────────────────────────────────────────────────────────────────────────────────────────────
if (!SOLO || SOLO === "raya") {
  const CLIENTE = "ecbbe340-8557-46b8-a6fd-f6ac6da57eca";
  const RAYA = "e94d4a32-68a5-4e58-8b25-a8ef460953af";
  const SERVICIO_DIA = "eba18591-92bf-4575-a848-1bfc541f8206";
  const BONO = "eff601c5-da90-4194-8c8f-d453700433e8";
  const EST_22 = "b5cb7141-875a-4f81-b343-9779d7b8dd10";
  const RES_22 = "f51ebb4d-b608-4ba4-b176-bf674af11ef3";
  const LLEGADA_4 = "2026-11-04T19:52:29.870343+00:00"; // 13:52 hora de México, la que capturó Dulce
  const SALIDA_4 = "2026-11-04T23:21:00+00:00"; // 17:21: cuando Myriam pagó la «Visita cantera» (asunción: la recogió entonces)
  log("\n== 1. RAYA");
  const [bono] = await R.leer(`bonos_clientes?id=eq.${BONO}&select=id,cantidad_total,cantidad_disponible,fecha_vencimiento`);
  const [e22] = await R.leer(`estancias?id=eq.${EST_22}&select=*`);
  const ya4 = await R.leer(`estancias?perro_id=eq.${RAYA}&fecha_entrada=eq.2026-11-04&deleted_at=is.null&select=id,estado,reserva_id`);
  log(`pase: ${bono.cantidad_disponible} de ${bono.cantidad_total}, vence ${bono.fecha_vencimiento} · estancia 22/10: ${e22.estado}, entrada real ${horaMx(e22.hora_entrada_real)} · estancia del 4/11: ${ya4.length ? ya4.map((e) => e.estado).join(",") : "no existe"}`);
  log("cuenta 22/10 antes:", cuenta(await totales(RES_22)));
  if (ya4.length && e22.estado === "finalizada") log("✔ Raya ya está corregida.");
  else if (!APLICAR) log("Haría: reserva + estancia 4→5/11 en curso (13:52) → aplicar pase → finalizar (17:21); estancia 22/10 → finalizada (22/10 10:51–19:00).");
  else {
    log("respaldo:", respaldar("b1-raya", { bono, e22 }));
    let est4 = ya4[0];
    if (!est4) {
      const r = await fetch(`https://xdsxjhytggpsgrmfuuff.supabase.co/rest/v1/reservas`, { method: "POST", headers: await headersRonith(), body: JSON.stringify({ cliente_id: CLIENTE, notas: "Guardería del 4 de noviembre de 2026, registrada por la plataforma el 5 a petición del dueño: el check-in de ese día se había hecho sobre la reserva del 22 de octubre." }) });
      if (!r.ok) throw new Error(`reservas: ${r.status} ${await r.text()}`);
      const [reserva] = await r.json();
      const r2 = await fetch(`https://xdsxjhytggpsgrmfuuff.supabase.co/rest/v1/estancias`, { method: "POST", headers: await headersRonith(), body: JSON.stringify({
        reserva_id: reserva.id, perro_id: RAYA, servicio_id: SERVICIO_DIA, fecha_entrada: "2026-11-04", fecha_salida: "2026-11-05", estado: "en_curso",
        hora_entrada_real: LLEGADA_4, entregado_por_nombre: e22.entregado_por_nombre, entregado_por_telefono: e22.entregado_por_telefono,
        bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: e22.motivo_excepcion_comportamiento ?? "Sin evaluación registrada (misma excepción que su reserva del 22 de octubre)",
        notas: "Llegada del 4 de noviembre de 2026 a las 13:52 (capturada ese día por Dulce sobre la reserva del 22 de octubre); recogida a las 17:21, cuando se pagó la «Visita cantera». Registrada por la plataforma el 5 de noviembre a petición del dueño.",
      }) });
      if (!r2.ok) throw new Error(`estancias: ${r2.status} ${await r2.text()}`);
      [est4] = await r2.json();
      log(`✔ estancia del 4/11 creada ${est4.id} (reserva ${reserva.id}) en curso`);
      const pase = await R.rpc("aplicar_bono_a_estancia", { p_estancia_id: est4.id });
      log("pase:", JSON.stringify(pase));
      if (!pase?.aplicado) throw new Error("El pase no se aplicó: revisar antes de seguir.");
      const [fin] = await R.patch("estancias", `id=eq.${est4.id}`, { estado: "finalizada", hora_salida_real: SALIDA_4, recogido_por_nombre: e22.entregado_por_nombre, recogido_por_telefono: e22.entregado_por_telefono, recogido_por_es_dueno: true });
      log(`✔ estancia del 4/11 finalizada: salida ${horaMx(fin.hora_salida_real)} · cuenta: ${cuenta(await totales(reserva.id))}`);
    }
    if (e22.estado !== "finalizada") {
      const [fin22] = await R.patch("estancias", `id=eq.${EST_22}`, {
        estado: "finalizada", hora_entrada_real: e22.created_at, hora_salida_real: "2026-10-23T01:00:00+00:00",
        recogido_por_nombre: e22.entregado_por_nombre, recogido_por_telefono: e22.entregado_por_telefono, recogido_por_es_dueno: true,
        notas: `${e22.notas ? e22.notas + "\n" : ""}Captura tardía (plataforma, 5 de noviembre de 2026, a petición del dueño): la guardería del 22 de octubre se dio con el pase ese día pero nunca se registró la entrada ni la salida; el 4 de noviembre se usó esta estancia para la llegada de ese día. Horas estimadas: entrada 10:51 (cuando se capturó), salida 19:00 (cierre).`,
      });
      log(`✔ estancia 22/10 finalizada: ${horaMx(fin22.hora_entrada_real)} → ${horaMx(fin22.hora_salida_real)}`);
    }
    const [b2] = await R.leer(`bonos_clientes?id=eq.${BONO}&select=cantidad_total,cantidad_disponible`);
    log(`pase de Raya ahora: ${b2.cantidad_disponible} de ${b2.cantidad_total} · cuenta 22/10: ${cuenta(await totales(RES_22))} (el −$350 lo quita Blacky al salir de «no llegó», rama fix/revertir-operaciones)`);
  }
}

// ── 2. Alejandra Perez ──────────────────────────────────────────────────────────────────────────────────────
if (!SOLO || SOLO === "alejandra") {
  const AJUSTE = "5e3cef85-eae8-4720-a5b3-d1558a4fba69";
  const RES = "cfb10cdb-2493-4c8a-bde0-e9e17c38c3b3";
  log("\n== 2. ALEJANDRA PEREZ");
  const [a] = await leer(`cuenta_ajustes_precio?id=eq.${AJUSTE}&select=*`);
  log(`corrección ${dinero(a.monto)} «${a.motivo}» sobre cita ${a.linea_id.slice(0, 8)} · deleted_at ${a.deleted_at} · cuenta: ${cuenta(await totales(RES))}`);
  if (a.deleted_at) log("✔ Ya está anulada.");
  else if (!APLICAR) log("Haría: anular la corrección con anular_correccion_precio (motivo).");
  else {
    log("respaldo:", respaldar("b1-alejandra-ajuste", a));
    const r = await R.rpc("anular_correccion_precio", { p_ajuste_id: AJUSTE, p_motivo: "La cita a la que corregía el precio se canceló el 26 de octubre y se volvió a crear en otra cuenta, que se pagó completa ($450). Anulada por la plataforma el 5 de noviembre de 2026 a petición del dueño." });
    log("✔ corrección anulada", JSON.stringify(r), "· cuenta:", cuenta(await totales(RES)));
  }
}

// ── 3. Daniela Reyes ────────────────────────────────────────────────────────────────────────────────────────
if (!SOLO || SOLO === "daniela") {
  const COBRO = "e8e2dcff-855c-42f9-bc97-4bc204348d15";
  const RES_CANADA = "7ea1156d-a157-474c-8e01-34031f8369c4";
  const RES_BANO = "ae9a96ce-89e8-4f68-8f69-e44ae399627c";
  log("\n== 3. DANIELA REYES");
  const [c] = await R.leer(`cobros?id=eq.${COBRO}&select=id,anulado_at,anulacion_motivo,cobro_metodos(metodo,monto)`);
  const tc = await totales(RES_CANADA), tb = await totales(RES_BANO);
  log(`cobro $255: anulado ${c.anulado_at ?? "no"} · cañada: ${cuenta(tc)} · baño exprés: ${cuenta(tb)}`);
  if (c.anulado_at && Math.abs(tc.saldo) < 0.01 && Math.abs(tb.saldo) < 0.01) log("✔ Ya está repartido.");
  else if (c.anulado_at && Math.abs(tc.saldo) < 0.01) log("✔ Cañada ya pagada ($65); los $190 del baño exprés van con b2 (la cuenta sigue cancelada).");
  else if (!APLICAR) log("Haría: anular el cobro de $255 (motivo) y registrar $65 en la cuenta de la cañada y $190 en la del baño exprés (transferencia, turno de hoy).");
  else {
    log("respaldo:", respaldar("b1-daniela", { cobro: c, tc, tb }));
    if (!c.anulado_at) {
      const an = await R.rpc("anular_cobro", { p_cobro_id: COBRO, p_motivo: "La transferencia de $255 del 12 de octubre cubría dos cuentas (cañada + corte de uñas $65 y baño exprés de Bruno $190) y se registró completa en una sola; se vuelve a registrar repartida. Plataforma, 5 de noviembre de 2026, a petición del dueño." });
      log("✔ anulado:", JSON.stringify({ monto: an.monto, turno_del_cobro_cerrado: an.turno_del_cobro_cerrado }));
    }
    if ((await totales(RES_CANADA)).saldo > 0.01) {
      const id = await R.rpc("registrar_cobro", { p_reserva_id: RES_CANADA, p_notas: "Parte de la transferencia de $255 del 12 de octubre de 2026 (reparto hecho por la plataforma el 5 de noviembre).", p_metodos: [{ metodo: "transferencia", monto: 65 }] });
      log("✔ cobro $65 registrado", id);
    }
    if ((await totales(RES_BANO)).saldo > 0.01) {
      // La cuenta del baño está cancelada (cuentas_canceladas, 16 de octubre) y la base no admite cobros en una cuenta
      // cancelada: los $190 se registran con b2 (reabrir_cuenta + registrar_cobro), después de desplegar fix/revertir-operaciones.
      const cancelada = await R.leer(`cuentas_canceladas?reserva_id=eq.${RES_BANO}&select=id,deleted_at`);
      if (cancelada.some((c) => !c.deleted_at)) log("… los $190 del baño exprés esperan a reabrir la cuenta (b2-saldos-a-favor-post-despliegue.mjs).");
      else {
        const id = await R.rpc("registrar_cobro", { p_reserva_id: RES_BANO, p_notas: "Parte de la transferencia de $255 del 12 de octubre de 2026 (reparto hecho por la plataforma el 5 de noviembre). La cuenta se había cancelado el 16 de octubre como error de captura.", p_metodos: [{ metodo: "transferencia", monto: 190 }] });
        log("✔ cobro $190 registrado", id);
      }
    }
    log(`cañada: ${cuenta(await totales(RES_CANADA))} · baño exprés: ${cuenta(await totales(RES_BANO))}`);
  }
}

log("\n== Saldos a favor que ve /admin (cuentas_saldo_a_favor 120 días)");
for (const s of await rpc("cuentas_saldo_a_favor", { p_dias: 120 })) log(`  ${s.cliente_nombre} · ${s.descripcion} · ${dinero(-s.saldo)} · reserva ${s.reserva_id.slice(0, 8)}`);

async function headersRonith() {
  const { execFileSync } = await import("node:child_process");
  const lista = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", "xdsxjhytggpsgrmfuuff", "-o", "json"], { encoding: "utf8" }));
  const anon = lista.find((k) => k.name === "anon" && (k.type ?? "legacy") === "legacy")?.api_key;
  return { apikey: anon, Authorization: `Bearer ${await tokenDe(RONITH)}`, "Content-Type": "application/json", "x-negocio-id": "10000000-0000-4000-8000-000000000001", Prefer: "return=representation" };
}
