import { negocioPrueba, comoPersona } from "./lib/prod.mjs";
const E = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
const { data: perros } = await E.N.from("perros").select("id, nombre").eq("negocio_id", E.negocio.id).or("nombre.ilike.%S41%,nombre.ilike.%S42%");
console.log(perros);
const { data: est } = await E.N.from("estancias").select("id, reserva_id, estado, perro_id, fecha_entrada, fecha_salida, perros(nombre)").eq("negocio_id", E.negocio.id).eq("estado", "finalizada").order("updated_at", { ascending: false }).limit(12);
for (const e of est) console.log(e.id, e.reserva_id, e.perros?.nombre, e.fecha_entrada, e.fecha_salida);
const s = await E.sesion("admin");
const api = comoPersona(s.token, E.negocio.id);
for (const e of est.filter((x) => /S4[12]/.test(x.perros?.nombre ?? ""))) {
  const { data, error } = await api.rpc("cuenta_lineas_estancia", { p_reserva_id: e.reserva_id });
  console.log(e.perros.nombre, error?.message, JSON.stringify(data));
  const { data: c } = await E.N.from("cargos_aplicados").select("id, precio, cantidad, cancelado").eq("estancia_id", e.id);
  console.log("  cargos_aplicados", JSON.stringify(c));
}
