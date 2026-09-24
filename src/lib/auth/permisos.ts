/**
 * Permisos que admin le puede dar a una persona de recepción en
 * particular (24 de septiembre de 2026). La fuente de verdad es la base
 * (permisos_staff + tiene_permiso(), migración 20260924025425): aquí solo
 * están los nombres y lo que cada uno implica, para la pantalla de admin,
 * la navegación y para esconder botones que la base de todos modos
 * rechazaría.
 *
 * Lo que NUNCA se delega (sigue siendo de admin): dar o quitar permisos,
 * crear o quitar admins, cambiar el rol de alguien, el tope de descuentos
 * de recepción, las devoluciones y quitar una evaluación de comportamiento.
 */
export const PERMISOS = [
  {
    clave: "inventario_costos",
    etiqueta: "Costos y compras de inventario",
    implica:
      "Ve lo que costó cada compra y el costo promedio de los insumos, registra compras y da de alta o edita proveedores. El catálogo de insumos sigue siendo de admin.",
  },
  {
    clave: "tarifas",
    etiqueta: "Precios y tarifas",
    implica:
      "Edita los precios de la matriz de cada servicio y los precios por día de la semana. Crear o cambiar servicios sigue siendo de admin.",
  },
  {
    clave: "reportes_financieros",
    etiqueta: "Reportes financieros",
    implica:
      "Ve los reportes completos: ingresos, costos, margen por servicio y operativos, con los mismos números que ve admin.",
  },
  {
    clave: "personal",
    etiqueta: "Personal",
    implica:
      "Invita gente de recepción y estética y ve la lista del personal. No puede crear admins ni cambiarle el rol a nadie.",
  },
  {
    clave: "configuracion_negocio",
    etiqueta: "Configuración del negocio",
    implica:
      "Cambia el cupo, el horario de atención, el teléfono de recepción y la dirección base de la camioneta. El tope de descuentos no: ese sigue siendo de admin.",
  },
  {
    clave: "excepciones_reserva",
    etiqueta: "Excepciones al reservar",
    implica:
      "Puede reservar a un perro con vacunas vencidas o sin evaluación de comportamiento, con un motivo por escrito que queda registrado con su nombre.",
  },
  {
    clave: "descuentos_sin_tope",
    etiqueta: "Descuentos sin tope",
    implica:
      "Aplica descuentos arriba del tope de recepción, con un motivo por escrito que queda registrado con su nombre.",
  },
  {
    clave: "plantillas_contrato",
    etiqueta: "Plantillas de contrato",
    implica:
      "Crea, edita, archiva y publica versiones de los contratos, y decide cuándo se genera cada uno.",
  },
] as const;

export type ClavePermiso = (typeof PERMISOS)[number]["clave"];

export function etiquetaDePermiso(clave: string): string {
  return PERMISOS.find((p) => p.clave === clave)?.etiqueta ?? clave;
}

/** Admin tiene todos; los demás, solo los que la base dice. */
export function tienePermiso(
  sesion: { rol: string; permisos: string[] } | null | undefined,
  clave: ClavePermiso
): boolean {
  if (!sesion) return false;
  return sesion.rol === "admin" || sesion.permisos.includes(clave);
}
