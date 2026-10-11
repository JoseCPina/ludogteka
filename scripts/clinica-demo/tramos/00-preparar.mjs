// Tramo 0 · Preparar la clínica: tarifas de hotel y guardería, catálogo de servicios extra y ajustes de Veterinaria.
// Todo con la sesión del ADMIN de la clínica (como lo haría la app); nada con la llave de servicio.
import { comprobar, seccion } from "../comun.mjs";

export async function tramo(c) {
  seccion("0. Preparar la clínica (admin)");
  const A = c.api.admin;
  const { data: servicios } = await A.from("servicios").select("id, clave, categoria").eq("negocio_id", c.e.negocioId).is("deleted_at", null);
  const { data: tallas } = await A.from("tamanos_categoria").select("id, clave, orden").is("deleted_at", null).order("orden");
  const hotel = servicios.find((s) => s.clave === "hotel_noche");
  const dia = servicios.find((s) => s.clave === "guarderia_dia");
  const { data: yaTar } = await A.from("tarifas").select("id").eq("negocio_id", c.e.negocioId).is("deleted_at", null).limit(1);
  if (!yaTar?.length) {
    const filas = [
      ...tallas.map((t, i) => ({ servicio_id: hotel.id, tamano_id: t.id, cantidad_desde: 1, precio: 270 + 30 * Math.min(i, 2), vigencia_desde: "2026-01-01" })),
      { servicio_id: dia.id, tamano_id: null, cantidad_desde: 1, precio: 350, vigencia_desde: "2026-01-01" },
    ];
    const r = await A.from("tarifas").insert(filas);
    comprobar(!r.error, `tarifas de hotel (${tallas.length} tallas) y de guardería por día (${r.error?.message ?? "ok"})`);
  } else comprobar(true, "las tarifas ya estaban");

  const aj = await A.rpc("guardar_veterinaria_ajustes", { p_recordatorios_activos: true, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: true, p_precio_dia: 450 });
  comprobar(!aj.error, `ajustes de Veterinaria: recordatorios prendidos, el carnet reemplaza al comprobante, día de hospitalización $450 (${aj.error?.message ?? "ok"})`);
  const po = await A.rpc("guardar_veterinaria_portal", { p_expediente: true });
  comprobar(!po.error, `portal del dueño con las consultas prendidas (${po.error?.message ?? "ok"})`);

  const ex = await A.rpc("extra_guardar", { p_id: null, p_nombre: "Paseo de 30 minutos", p_descripcion: "Paseo por el parque", p_tipo: "general", p_unidad: "vez", p_precio: 80, p_clase_fiscal: "otro_servicio", p_clave_prod_serv: null, p_activo: true });
  comprobar(!ex.error || /ya existe|duplic/i.test(ex.error?.message ?? ""), `servicio extra «Paseo de 30 minutos» ($80) (${ex.error?.message ?? "ok"})`);
  c.guardarEstado({ preparado: true });
}
