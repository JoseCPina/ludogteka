import { PERMISOS, type ClavePermiso } from "./permisos";

/**
 * Cómo se agrupan los permisos en la pantalla de Permisos (5 de noviembre de 2026): un acordeón por área, con cuántos
 * están activos de cuántos, buscador y «activar todo el grupo». La fuente de qué hace cada permiso sigue siendo
 * `PERMISOS`; aquí solo va el grupo de cada clave y cuáles vienen prendidos para toda la recepción (lo decide la base
 * con sus disparadores de «por omisión»; esto es para decirlo en pantalla).
 */
export const GRUPOS_PERMISOS = [
  "Recepción y agenda",
  "Hotel y guardería",
  "Estética",
  "Veterinaria",
  "Clientes y mascotas",
  "Caja y cobros",
  "Inventario y gastos",
  "Reportes",
  "Equipo",
  "Configuración",
] as const;
export type GrupoPermiso = (typeof GRUPOS_PERMISOS)[number];

const GRUPO_DE: Record<ClavePermiso, GrupoPermiso> = {
  excepciones_reserva: "Recepción y agenda",
  eliminar_citas: "Recepción y agenda",
  importar_datos: "Recepción y agenda",
  ajustar_pases: "Hotel y guardería",
  extender_pases: "Hotel y guardería",
  reportes_guarderia: "Hotel y guardería",
  plantilla_reporte_guarderia: "Hotel y guardería",
  agregar_servicios_extra: "Hotel y guardería",
  editar_catalogo_extras: "Hotel y guardería",
  corregir_estilista: "Estética",
  corregir_servicio: "Estética",
  editar_ficha_clinica: "Veterinaria",
  lotes_clinicos: "Veterinaria",
  registrar_vacunas: "Veterinaria",
  emitir_certificados: "Veterinaria",
  hospitalizar: "Veterinaria",
  atender_consultas: "Veterinaria",
  firmar_expediente: "Veterinaria",
  crear_estimados: "Veterinaria",
  emitir_recetas: "Veterinaria",
  registrar_recetas_sitpv: "Veterinaria",
  ver_libro_control: "Veterinaria",
  usar_dictado: "Veterinaria",
  atender_teleconsultas: "Veterinaria",
  designar_medicos: "Veterinaria",
  ver_lecturas_expediente: "Veterinaria",
  quitar_evaluacion: "Clientes y mascotas",
  responder_resenas: "Clientes y mascotas",
  descuentos_sin_tope: "Caja y cobros",
  tarjeta_manual: "Caja y cobros",
  anular_cobros: "Caja y cobros",
  editar_monto_cobros: "Caja y cobros",
  corregir_turnos_cerrados: "Caja y cobros",
  agregar_efectivo: "Caja y cobros",
  cancelar_cuentas: "Caja y cobros",
  cortesias: "Caja y cobros",
  devoluciones: "Caja y cobros",
  revisar_tarjetas_manuales: "Caja y cobros",
  conciliacion: "Caja y cobros",
  facturar: "Caja y cobros",
  cancelar_facturas: "Caja y cobros",
  editar_datos_fiscales: "Caja y cobros",
  inventario_costos: "Inventario y gastos",
  areas_inventario: "Inventario y gastos",
  gastos: "Inventario y gastos",
  categorias_gasto: "Inventario y gastos",
  reportes_financieros: "Reportes",
  personal: "Equipo",
  nomina: "Equipo",
  asistencia_ausencias: "Equipo",
  configuracion_negocio: "Configuración",
  tarifas: "Configuración",
  servicios: "Configuración",
  plantillas_contrato: "Configuración",
  administrar_modulos: "Configuración",
  revisar_alertas: "Configuración",
};

/** Los que la base prende sola para toda la recepción (disparadores «por omisión»). */
export const PERMISOS_POR_OMISION: readonly ClavePermiso[] = ["tarjeta_manual", "agregar_servicios_extra", "categorias_gasto", "areas_inventario"];

export function grupoDePermiso(clave: string): GrupoPermiso {
  return GRUPO_DE[clave as ClavePermiso] ?? "Configuración";
}

/** Los permisos de cada grupo, en el orden del catálogo; un grupo sin permisos no aparece. */
export function permisosPorGrupo(): { grupo: GrupoPermiso; permisos: (typeof PERMISOS)[number][] }[] {
  return GRUPOS_PERMISOS.map((grupo) => ({ grupo, permisos: PERMISOS.filter((p) => grupoDePermiso(p.clave) === grupo) })).filter((g) => g.permisos.length > 0);
}

/** Lo que nunca se delega: se dice en la pantalla, para que nadie lo busque entre las casillas. */
export const NUNCA_SE_DELEGA = [
  "Dar y quitar permisos, crear admins y cambiar el rol de alguien",
  "El tope de descuentos de recepción",
  "Con qué cobra el negocio (Mercado Pago, Clip, terminal) y sus credenciales",
  "El plan, el pago a PeluDesk y las sucursales",
  "Restablecer la contraseña de alguien del equipo",
  "Ver el efectivo esperado del turno abierto de otra persona (corte ciego)",
] as const;
