// El negocio demo (Patitas & Co., SOLO en desarrollo) listo para grabar con acciones de verdad.
//
// «Ver demo» deja las cuentas del demo en solo lectura; para que un tutorial pueda
// capturar un cliente, cobrar o agendar de verdad se desbloquean AQUÍ, en
// desarrollo, y nunca en producción. Los datos son los inventados de
// scripts/demo/datos.mjs (el demo envejece: `node scripts/demo/sembrar-demo.mjs
// --rehacer` lo vuelve a sembrar con «hoy» de nuevo; después se vuelve a correr esto).
export const SLUG_DEMO = "patitasyco";

export async function prepararDemo(c) {
  if (c.prod) throw new Error("El demo de tutoriales se graba SOLO en desarrollo.");
  const { data: neg } = await c.cliente.from("negocios").select("id, plan, nombre").eq("slug", SLUG_DEMO).is("deleted_at", null).maybeSingle();
  if (!neg) throw new Error("No hay negocio demo en desarrollo: node scripts/demo/sembrar-demo.mjs");
  if (neg.plan !== "demo") throw new Error(`«${SLUG_DEMO}» no es un negocio demo (plan ${neg.plan}).`);
  const { error } = await c.cliente.from("membresias").update({ solo_lectura: false }).eq("negocio_id", neg.id).eq("solo_lectura", true);
  if (error) throw new Error(`no pude desbloquear las cuentas del demo: ${error.message}`);
  const cuenta = async (t) => (await c.cliente.from(t).select("id", { count: "exact", head: true }).eq("negocio_id", neg.id).is("deleted_at", null)).count ?? 0;
  const [clientes, perros, citas] = await Promise.all([cuenta("clientes"), cuenta("perros"), cuenta("citas_estetica")]);
  if (clientes < 5 || perros < 5) throw new Error(`El demo está vacío (${clientes} clientes, ${perros} perros): node scripts/demo/sembrar-demo.mjs --rehacer`);
  return { negocio: neg, clientes, perros, citas };
}
