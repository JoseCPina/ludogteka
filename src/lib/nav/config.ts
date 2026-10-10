import { rutaPorRol } from "@/lib/auth/rutas";

export type ItemNav = {
  etiqueta: string;
  href: string;
  roles: string[];
  // Recepción con cualquiera de estos permisos extra también la ve
  // (permisos_staff; la base y el middleware aplican lo mismo).
  permisos?: string[];
  // Sin ruta real todavía: se muestra deshabilitado, sin link. Cuando la
  // sección exista, basta con quitar esta bandera (o mover la entrada,
  // si cambia de lugar en el flujo).
  proximamente?: boolean;
  // Solo si el negocio tiene ese módulo prendido (src/lib/plan/modulos.ts);
  // con una lista, basta con cualquiera de ellos.
  modulo?: string | string[];
};

// Agregar una sección nueva (Fase 4+) es agregar una entrada aquí, no
// tocar el layout. `roles` respeta lo que cada rol puede ver según
// docs/PROYECTO.md (recepción no ve dinero/reportes, estética no ve dinero).
export const SECCIONES_STAFF: ItemNav[] = [
  // Los tres servicios del negocio, juntos y primero: es como los piensa
  // el staff y es donde pasa el día. Guardería y hotel comparten tabla
  // (`estancias`) y comparten cupo, pero se atienden por separado: cada
  // uno con sus reservas, su check-in/check-out y su lista del día. La
  // ocupación que se muestra en ambos es la de toda la casa — ver
  // src/lib/modulos.ts.
  { etiqueta: "Guardería", href: "/guarderia", roles: ["admin", "recepcion"], modulo: "guarderia" },
  { etiqueta: "Hotel", href: "/hotel", roles: ["admin", "recepcion"], modulo: "hotel" },
  // Los que están adentro, con fotos, videos y el reporte del día.
  { etiqueta: "Adentro ahora", href: "/adentro", roles: ["admin", "recepcion"], modulo: ["guarderia", "hotel"] },
  { etiqueta: "Estética", href: "/estetica", roles: ["admin", "recepcion", "estetica"], modulo: "estetica" },
  { etiqueta: "Servicios", href: "/servicios", roles: ["admin"], permisos: ["tarifas"] },
  { etiqueta: "Clientes", href: "/clientes", roles: ["admin", "recepcion"] },
  { etiqueta: "Vinculación", href: "/vinculacion", roles: ["admin", "recepcion"], modulo: "portal" },
  { etiqueta: "Caja", href: "/caja", roles: ["admin", "recepcion"] },
  { etiqueta: "Contratos", href: "/contratos", roles: ["admin", "recepcion"], modulo: "contratos" },
  { etiqueta: "Inventario", href: "/inventario", roles: ["admin", "recepcion", "estetica"], modulo: "inventario" },
  { etiqueta: "Reportes", href: "/reportes", roles: ["admin"], permisos: ["reportes_financieros"], modulo: "reportes" },
  { etiqueta: "Empleados", href: "/empleados", roles: ["admin", "recepcion"], modulo: "empleados" },
  { etiqueta: "Gastos", href: "/gastos", roles: ["admin"], permisos: ["gastos"], modulo: "gastos" },
  { etiqueta: "Mi asistencia", href: "/mi-trabajo", roles: ["recepcion", "estetica"], modulo: "empleados" },
  // Admin aterriza en /admin (su "Inicio"); esta entrada es para recepción
  // con permisos de personal o de configuración.
  { etiqueta: "Administración", href: "/admin", roles: ["admin"], permisos: ["personal", "configuracion_negocio", "tarifas"] },
  { etiqueta: "Permisos", href: "/admin/permisos", roles: ["admin"] },
  { etiqueta: "Perfil y página web", href: "/admin/perfil", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Políticas y reglas", href: "/admin/politicas", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Reporte y fotos", href: "/admin/reporte-guarderia", roles: ["admin"], modulo: ["guarderia", "hotel"] },
  { etiqueta: "Tarifa de guardería", href: "/admin/tarifa-guarderia", roles: ["admin"], permisos: ["tarifas"], modulo: "estetica" },
  { etiqueta: "Módulos y plan", href: "/admin/modulos", roles: ["admin"], permisos: ["administrar_modulos"] },
  { etiqueta: "Cobro con terminal", href: "/admin/pagos", roles: ["admin"] },
  // Veterinaria (Fase 0): su inicio y, para quien lo administra, los módulos.
  { etiqueta: "Veterinaria", href: "/veterinaria", roles: ["admin", "recepcion"], modulo: "veterinaria" },
  { etiqueta: "Facturación", href: "/admin/facturacion", roles: ["admin"], permisos: ["editar_datos_fiscales", "facturar"] },
  { etiqueta: "Facturas", href: "/caja/facturas", roles: ["admin"], permisos: ["facturar", "cancelar_facturas"] },
  // Artículos, asistente y tickets de soporte: sin permiso especial.
  { etiqueta: "Ayuda", href: "/ayuda", roles: ["admin", "recepcion"] },
];

// Vacío por ahora — Fase 2/6/9 agregan aquí Mis perros, Mis reservas,
// Mis contratos, Bitácora. El layout del portal ya sabe renderizar esto
// en cuanto tenga elementos.
export const SECCIONES_PORTAL: ItemNav[] = [];

export function navStaffPara(rol: string, permisos: string[] = [], modulos: string[] = []): ItemNav[] {
  const inicio = rutaPorRol(rol);
  return [
    { etiqueta: "Inicio", href: inicio, roles: [rol] },
    // El rol de estética aterriza justamente en /estetica, que además es
    // una sección del menú: sin este filtro saldría dos veces seguidas,
    // "Inicio" y "Estética", apuntando al mismo lugar.
    ...SECCIONES_STAFF.filter(
      (seccion) =>
        (seccion.roles.includes(rol) ||
          (rol === "recepcion" && (seccion.permisos ?? []).some((p) => permisos.includes(p)))) &&
        (!seccion.modulo || (Array.isArray(seccion.modulo) ? seccion.modulo : [seccion.modulo]).some((m) => modulos.includes(m))) &&
        seccion.href !== inicio
    ),
  ];
}
