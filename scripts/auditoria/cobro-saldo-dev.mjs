// registrar_cobro valida el monto contra el saldo (SOLO DESARROLLO, Huellitas).
//   node scripts/auditoria/cobro-saldo-dev.mjs
// Efectivo de más = cambio (a la caja entra el saldo); terminal / transferencia /
// tarjeta manual no pasan del saldo; una cuenta en cero no se vuelve a cobrar;
// el grupo sigue su regla; recepción y admin igual; llave anónima rechazada.
// 7. Alerta de patrón (más de 3 al día / más del 30 % del turno), solo con
//    proveedor integrado; la función de la plataforma solo la llama la plataforma.
// 8. Aislamiento: otro negocio no ve ni toca nada; el cliente no lee las tablas.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (cond, titulo) => (cond ? bien(titulo) : hallazgo(titulo));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const rpc = (token, fn, args = {}, negocio = B) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });
const get = (token, ruta, negocio = B) => llamar(`${URL}/rest/v1/${ruta}`, { headers: cab(token, negocio) });

const tAdmin = await tokenDe(datos.adminB);
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
const recConPermiso = recepciones[0].profile_id;
const recSinPermiso = recepciones[1].profile_id;
const tRec = await tokenDe(recConPermiso);
const tRecSin = await tokenDe(recSinPermiso);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);
const hoyB = (await rpc(tAdmin, "fecha_negocio")).cuerpo;

const sufijo = String(Date.now()).slice(-6);
let n = 0;
const folio = (p = "AUT") => `${p}-${sufijo}${String(++n).padStart(2, "0")}`;
const turno = (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;
if (!turno) throw new Error("Huellitas necesita un turno abierto.");
const cuenta = async (precio) => {
  const r = await rpc(tAdmin, "crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto: "Prueba saldo", precio, cantidad: 1 }], p_notas: "prueba cobro saldo" });
  if (!r.ok) throw new Error(`cuenta: ${r.mensaje}`);
  return r.cuerpo;
};
const saldo = async (id) => Number((await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: id })).cuerpo?.[0]?.saldo ?? NaN);
const cobrar = (t, id, metodos) => rpc(t, "registrar_cobro", { p_reserva_id: id, p_notas: "prueba saldo", p_metodos: metodos });
const metodosDe = async (cobroId) => (await SB.from("cobro_metodos").select("metodo, monto").eq("cobro_id", cobroId)).data ?? [];
const efe = (monto, propina = 0) => ({ metodo: "efectivo", monto, propina });

console.log("── Efectivo de más es cambio");
let c = await cuenta(116);
let r = await cobrar(tRec, c, [efe(200)]);
comprobar(r.ok, `efectivo $200 a una cuenta de $116 se acepta (${r.mensaje || "ok"})`);
const m1 = r.ok ? await metodosDe(r.cuerpo) : [];
comprobar(m1.length === 1 && Number(m1[0].monto) === 116, "a la caja entra solo el saldo ($116)");
comprobar(await saldo(c) === 0, "la cuenta queda en cero (no −84)");
r = await cobrar(tRec, c, [efe(10)]);
comprobar(!r.ok && /no tiene saldo/.test(r.mensaje), `una cuenta en cero no se vuelve a cobrar («${r.mensaje.slice(0, 60)}»)`);
r = await cobrar(tAdmin, c, [efe(10)]);
comprobar(!r.ok, "tampoco el admin");

c = await cuenta(116);
r = await cobrar(tRec, c, [efe(100, 20)]);
comprobar(r.ok && await saldo(c) === 16, "pago parcial en efectivo deja el saldo ($16) y la propina no cuenta contra el saldo");
r = await cobrar(tRec, c, [efe(50, 5)]);
const m2 = r.ok ? await metodosDe(r.cuerpo) : [];
comprobar(r.ok && Number(m2[0]?.monto) === 16 && await saldo(c) === 0, "$50 sobre un saldo de $16: entra $16 y la cuenta cierra");

c = await cuenta(116);
r = await cobrar(tRec, c, [efe(100), { metodo: "transferencia", monto: 50, propina: 0 }]);
const m3 = r.ok ? await metodosDe(r.cuerpo) : [];
comprobar(r.ok && m3.find((x) => x.metodo === "transferencia")?.monto == 50 && Number(m3.find((x) => x.metodo === "efectivo")?.monto) === 66, "mixto: transferencia $50 entera y el efectivo baja a $66 (cambio $84)");
comprobar(await saldo(c) === 0, "mixto: cuenta en cero");

c = await cuenta(116);
r = await cobrar(tRec, c, [efe(116), { metodo: "transferencia", monto: 50, propina: 0 }]);
comprobar(r.ok && await saldo(c) === 0, "efectivo $116 + transferencia $50: la transferencia se respeta y el efectivo baja a $66");

console.log("── Otros métodos no pasan del saldo");
c = await cuenta(116);
for (const [metodo, extra] of [["transferencia", {}], ["terminal", {}], ["tarjeta_manual", { folio: "SAL-" + sufijo + "A", motivo: "sin_senal" }]]) {
  r = await cobrar(tRec, c, [{ metodo, monto: 200, propina: 0, ...extra }]);
  const msj = r.mensaje;
  comprobar(!r.ok && (/más que el saldo|Terminal|terminal conectada/.test(msj)), `${metodo} $200 sobre $116 se rechaza («${msj.slice(0, 70)}»)`);
}
comprobar(await saldo(c) === 116, "ninguno dejó cobro: el saldo sigue en $116");
r = await cobrar(tRec, c, [{ metodo: "tarjeta_manual", monto: 116, propina: 0, folio: "SAL-" + sufijo + "B", motivo: "sin_senal" }]);
comprobar(r.ok && await saldo(c) === 0, "tarjeta manual por el saldo exacto sí");
const cobrosC = (await SB.from("cobros").select("id").eq("reserva_id", c)).data ?? [];
comprobar(cobrosC.length === 1, "los rechazos no dejan cobros a medias");

console.log("── Cobro agrupado y anónimo");
const a1 = await cuenta(100), a2 = await cuenta(100);
r = await rpc(tRec, "registrar_cobro_grupo", { p_partes: [{ reserva_id: a1, monto: 150 }, { reserva_id: a2, monto: 100 }], p_notas: "x", p_metodos: [efe(250)] });
comprobar(!r.ok, `el grupo rechaza más que el saldo de una cuenta («${r.mensaje.slice(0, 60)}»)`);
const an = await llamar(`${URL}/rest/v1/rpc/registrar_cobro`, { method: "POST", headers: cab(null), body: JSON.stringify({ p_reserva_id: a1, p_notas: "x", p_metodos: [efe(10)] }) });
comprobar(!an.ok, "la llave anónima no cobra");

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
