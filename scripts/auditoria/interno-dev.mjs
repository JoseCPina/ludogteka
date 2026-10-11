// Negocio interno (SOLO DESARROLLO, en Huellitas): solo la plataforma lo marca (migración 20261021000000).
//   node scripts/auditoria/interno-dev.mjs
import { B, SB, rpc, patch, personas, comprobar, terminar } from "./veterinaria-comun-dev.mjs";
const P = await personas();
comprobar(!(await rpc(P.admin, "plataforma_marcar_interno", { p_negocio_id: B, p_interno: true, p_motivo: "x" })).ok, "el admin del negocio no marca interno");
const r = await patch(P.admin, `negocios?id=eq.${B}`, { interno: true });
const n = (await SB.from("negocios").select("interno").eq("id", B).single()).data;
comprobar(n.interno === false, `un UPDATE directo del admin no cambia interno (${r.status})`);
comprobar(!(await rpc(null, "plataforma_marcar_interno", { p_negocio_id: B, p_interno: true, p_motivo: "x" })).ok, "la llave anónima tampoco");
comprobar(!(await rpc(P.admin, "plataforma_negocios")).ok, "ni lista los negocios de la plataforma");
terminar();
