import { rutaPorRol } from "@/lib/auth/rutas";
import { puedeAbrir } from "@/lib/auth/acceso";

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
  // Además de `modulo`, con al menos uno de estos prendido (p. ej. contratos solo existen para guardería u hotel).
  ademas?: string[];
  // También la ve quien sea médico veterinario designado o tenga algún permiso del módulo,
  // sin importar su rol (`acceso_veterinaria()`).
  conAccesoVeterinaria?: boolean;
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
  // Ocupación por día contra el cupo y la lista de próximas reservas de guardería y hotel.
  { etiqueta: "Calendario", href: "/reservas/calendario", roles: ["admin", "recepcion"], modulo: ["guarderia", "hotel"] },
  // Los que están adentro, con fotos, videos y el reporte del día.
  { etiqueta: "Adentro ahora", href: "/adentro", roles: ["admin", "recepcion"], modulo: ["guarderia", "hotel"] },
  { etiqueta: "Estética", href: "/estetica", roles: ["admin", "recepcion", "estetica"], modulo: "estetica" },
  { etiqueta: "Servicios", href: "/servicios", roles: ["admin"], permisos: ["tarifas"] },
  { etiqueta: "Clientes", href: "/clientes", roles: ["admin", "recepcion"] },
  // Respuestas de los clientes a los recordatorios automáticos por WhatsApp y su estado.
  { etiqueta: "Recordatorios", href: "/recordatorios", roles: ["admin", "recepcion"] },
  { etiqueta: "Vinculación", href: "/vinculacion", roles: ["admin", "recepcion"], modulo: "portal" },
  { etiqueta: "Caja", href: "/caja", roles: ["admin", "recepcion"] },
  { etiqueta: "Contratos", href: "/contratos", roles: ["admin", "recepcion"], modulo: "contratos", ademas: ["guarderia", "hotel"] },
  { etiqueta: "Inventario", href: "/inventario", roles: ["admin", "recepcion", "estetica"], modulo: "inventario" },
  { etiqueta: "Reportes", href: "/reportes", roles: ["admin"], permisos: ["reportes_financieros"], modulo: "reportes" },
  { etiqueta: "Empleados", href: "/empleados", roles: ["admin", "recepcion"], modulo: "empleados" },
  { etiqueta: "Gastos", href: "/gastos", roles: ["admin"], permisos: ["gastos"], modulo: "gastos" },
  { etiqueta: "Mi asistencia", href: "/mi-trabajo", roles: ["recepcion", "estetica"], modulo: "empleados" },
  // Admin aterriza en /admin (su "Inicio"); esta entrada es para recepción
  // con permisos de personal o de configuración.
  { etiqueta: "Administración", href: "/admin", roles: ["admin"], permisos: ["personal", "configuracion_negocio", "tarifas"] },
  { etiqueta: "Permisos", href: "/admin/permisos", roles: ["admin"] },
  // QA R22 (N87): la configuración vive en /admin#configuracion; /admin/configuracion lleva ahí.
  { etiqueta: "Configuración", href: "/admin/configuracion", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Perfil y página web", href: "/admin/perfil", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Políticas y reglas", href: "/admin/politicas", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Recordatorios por WhatsApp", href: "/admin/recordatorios", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Reporte y fotos", href: "/admin/reporte-guarderia", roles: ["admin"], modulo: ["guarderia", "hotel"] },
  // N132: la política de salida anticipada (Configuración → Hotel).
  { etiqueta: "Configuración de hotel", href: "/admin/hotel", roles: ["admin"], permisos: ["configuracion_negocio"], modulo: ["guarderia", "hotel"] },
  { etiqueta: "Tarifa de guardería", href: "/admin/tarifa-guarderia", roles: ["admin"], permisos: ["tarifas"], modulo: "estetica", ademas: ["guarderia"] },
  { etiqueta: "Módulos y plan", href: "/admin/modulos", roles: ["admin"], permisos: ["administrar_modulos"] },
  { etiqueta: "Cobro con terminal", href: "/admin/pagos", roles: ["admin"] },
  // Veterinaria (Fase 0): su inicio y, para quien lo administra, los módulos.
  { etiqueta: "Veterinaria", href: "/veterinaria", roles: ["admin", "recepcion"], modulo: "veterinaria", conAccesoVeterinaria: true },
  { etiqueta: "Facturación", href: "/admin/facturacion", roles: ["admin"], permisos: ["editar_datos_fiscales", "facturar"] },
  { etiqueta: "Facturas", href: "/caja/facturas", roles: ["admin"], permisos: ["facturar", "cancelar_facturas"] },
  { etiqueta: "Importar", href: "/admin/importar", roles: ["admin"], permisos: ["importar_datos"] },
  // Artículos, asistente y tickets de soporte: sin permiso especial.
  { etiqueta: "Ayuda", href: "/ayuda", roles: ["admin", "recepcion"] },
  // Servicios extra cobrables de Hotel y guardería (carril B).
  { etiqueta: "Servicios extra", href: "/extras", roles: ["admin", "recepcion"], modulo: ["guarderia", "hotel"] },
];

// Vacío por ahora — Fase 2/6/9 agregan aquí Mis perros, Mis reservas,
// Mis contratos, Bitácora. El layout del portal ya sabe renderizar esto
// en cuanto tenga elementos.
export const SECCIONES_PORTAL: ItemNav[] = [];

export function navStaffPara(rol: string, permisos: string[] = [], modulos: string[] = [], accesoVeterinaria = false): ItemNav[] {
  // Estética sin su módulo no tiene a dónde aterrizar en /estetica: su inicio pasa a lo que sí puede usar.
  const inicio = rol === "estetica" && !modulos.includes("estetica") ? (modulos.includes("empleados") ? "/mi-trabajo" : rutaPorRol(rol)) : rutaPorRol(rol);
  return [
    { etiqueta: "Inicio", href: inicio, roles: [rol] },
    // El rol de estética aterriza justamente en /estetica, que además es
    // una sección del menú: sin este filtro saldría dos veces seguidas,
    // "Inicio" y "Estética", apuntando al mismo lugar.
    ...SECCIONES_STAFF.filter(
      (seccion) =>
        (seccion.roles.includes(rol) ||
          (accesoVeterinaria && seccion.conAccesoVeterinaria === true) ||
          (rol === "recepcion" && (seccion.permisos ?? []).some((p) => permisos.includes(p)))) &&
        (!seccion.modulo || (Array.isArray(seccion.modulo) ? seccion.modulo : [seccion.modulo]).some((m) => modulos.includes(m))) &&
        (!seccion.ademas || seccion.ademas.some((m) => modulos.includes(m))) &&
        // QA N127: la misma regla con la que el middleware abre la página.
        puedeAbrir({ rol, permisos, modulos, accesoVeterinaria }, seccion.href) &&
        seccion.href !== inicio
    ),
  ];
}

// QA S41 (N141): las pantallas que se precargan solas (las del día a día del rol); el resto del menú y los mosaicos del
// tablero se precargan al pasar el puntero o tocar (EnlacePrecarga). En orden de preferencia; se toman las que el
// menú de esta persona tiene.
const PRINCIPALES_POR_ROL: Record<string, string[]> = {
  admin: ["/caja", "/estetica", "/guarderia", "/hotel", "/veterinaria", "/clientes"],
  recepcion: ["/caja", "/estetica", "/guarderia", "/hotel", "/veterinaria", "/clientes"],
  estetica: ["/estetica", "/mi-trabajo", "/inventario"],
};

/** El inicio y hasta 3 pantallas más del rol (4 en total) que sí se precargan solas. */
export function pantallasPrincipales(rol: string, items: ItemNav[]): string[] {
  const enMenu = new Set(items.filter((i) => !i.proximamente).map((i) => i.href));
  const inicio = items[0]?.href;
  const resto = (PRINCIPALES_POR_ROL[rol] ?? []).filter((h) => enMenu.has(h) && h !== inicio).slice(0, 3);
  return [...(inicio ? [inicio] : []), ...resto];
}
