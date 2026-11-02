import { inicioDeSesion } from "@/lib/auth/rutas";
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
  // Rediseño (docs/diseno/DESIGN.md → «Navegación»): el grupo del menú lateral, como los menús de referencia
  // (Square, Jobber): el día a día primero, luego clientes, dinero, equipo, ajustes y ayuda. El nombre de la entrada
  // no cambia (los textos de ayuda la nombran así: rutas-en-textos.mjs).
  grupo?: GrupoNav;
};

export type GrupoNav = "dia" | "clientes" | "dinero" | "equipo" | "ajustes" | "ayuda";
export const GRUPOS_NAV: { id: GrupoNav; titulo: string }[] = [
  { id: "dia", titulo: "Día a día" },
  { id: "clientes", titulo: "Clientes" },
  { id: "dinero", titulo: "Dinero" },
  { id: "equipo", titulo: "Equipo e inventario" },
  { id: "ajustes", titulo: "Ajustes" },
  { id: "ayuda", titulo: "Ayuda" },
];

/** Las entradas del menú agrupadas en el orden de GRUPOS_NAV (el inicio va aparte, arriba). */
export function agruparNav(items: ItemNav[]): { id: GrupoNav; titulo: string; items: ItemNav[] }[] {
  const resto = items.slice(1);
  return GRUPOS_NAV.map((g) => ({ ...g, items: resto.filter((i) => (i.grupo ?? "ajustes") === g.id) })).filter((g) => g.items.length > 0);
}

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
  { etiqueta: "Guardería", href: "/guarderia", grupo: "dia", roles: ["admin", "recepcion"], modulo: "guarderia" },
  { etiqueta: "Hotel", href: "/hotel", grupo: "dia", roles: ["admin", "recepcion"], modulo: "hotel" },
  // Ocupación por día contra el cupo y la lista de próximas reservas de guardería y hotel.
  { etiqueta: "Calendario", href: "/reservas/calendario", grupo: "dia", roles: ["admin", "recepcion"], modulo: ["guarderia", "hotel"] },
  // Los que están adentro, con fotos, videos y el reporte del día.
  { etiqueta: "Adentro ahora", href: "/adentro", grupo: "dia", roles: ["admin", "recepcion"], modulo: ["guarderia", "hotel"] },
  { etiqueta: "Estética", href: "/estetica", grupo: "dia", roles: ["admin", "recepcion", "estetica"], modulo: "estetica" },
  { etiqueta: "Servicios", href: "/servicios", grupo: "ajustes", roles: ["admin"], permisos: ["tarifas"] },
  { etiqueta: "Clientes", href: "/clientes", grupo: "clientes", roles: ["admin", "recepcion"] },
  // Respuestas de los clientes a los recordatorios automáticos por WhatsApp y su estado.
  { etiqueta: "Recordatorios", href: "/recordatorios", grupo: "clientes", roles: ["admin", "recepcion"] },
  { etiqueta: "Vinculación", href: "/vinculacion", grupo: "clientes", roles: ["admin", "recepcion"], modulo: "portal" },
  { etiqueta: "Caja", href: "/caja", grupo: "dinero", roles: ["admin", "recepcion"] },
  { etiqueta: "Contratos", href: "/contratos", grupo: "clientes", roles: ["admin", "recepcion"], modulo: "contratos", ademas: ["guarderia", "hotel"] },
  { etiqueta: "Inventario", href: "/inventario", grupo: "equipo", roles: ["admin", "recepcion", "estetica"], modulo: "inventario" },
  { etiqueta: "Reportes", href: "/reportes", grupo: "dinero", roles: ["admin"], permisos: ["reportes_financieros"], modulo: "reportes" },
  { etiqueta: "Empleados", href: "/empleados", grupo: "equipo", roles: ["admin", "recepcion"], modulo: "empleados" },
  { etiqueta: "Gastos", href: "/gastos", grupo: "dinero", roles: ["admin"], permisos: ["gastos"], modulo: "gastos" },
  { etiqueta: "Mi asistencia", href: "/mi-trabajo", grupo: "equipo", roles: ["recepcion", "estetica"], modulo: "empleados" },
  // Admin aterriza en /admin (su "Inicio"); esta entrada es para recepción
  // con permisos de personal o de configuración.
  { etiqueta: "Administración", href: "/admin", grupo: "ajustes", roles: ["admin"], permisos: ["personal", "configuracion_negocio", "tarifas"] },
  { etiqueta: "Permisos", href: "/admin/permisos", grupo: "ajustes", roles: ["admin"] },
  // QA R22 (N87): la configuración vive en /admin#configuracion; /admin/configuracion lleva ahí.
  { etiqueta: "Configuración", href: "/admin/configuracion", grupo: "ajustes", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Perfil y página web", href: "/admin/perfil", grupo: "ajustes", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Políticas y reglas", href: "/admin/politicas", grupo: "ajustes", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Recordatorios por WhatsApp", href: "/admin/recordatorios", grupo: "ajustes", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { etiqueta: "Reporte y fotos", href: "/admin/reporte-guarderia", grupo: "ajustes", roles: ["admin"], modulo: ["guarderia", "hotel"] },
  // N132: la política de salida anticipada (Configuración → Hotel).
  { etiqueta: "Configuración de hotel", href: "/admin/hotel", grupo: "ajustes", roles: ["admin"], permisos: ["configuracion_negocio"], modulo: ["guarderia", "hotel"] },
  { etiqueta: "Tarifa de guardería", href: "/admin/tarifa-guarderia", grupo: "ajustes", roles: ["admin"], permisos: ["tarifas"], modulo: "estetica", ademas: ["guarderia"] },
  { etiqueta: "Módulos y plan", href: "/admin/modulos", grupo: "ajustes", roles: ["admin"], permisos: ["administrar_modulos"] },
  { etiqueta: "Cobro con terminal", href: "/admin/pagos", grupo: "ajustes", roles: ["admin"] },
  // Veterinaria (Fase 0): su inicio y, para quien lo administra, los módulos.
  { etiqueta: "Veterinaria", href: "/veterinaria", grupo: "dia", roles: ["admin", "recepcion"], modulo: "veterinaria", conAccesoVeterinaria: true },
  { etiqueta: "Facturación", href: "/admin/facturacion", grupo: "ajustes", roles: ["admin"], permisos: ["editar_datos_fiscales", "facturar"] },
  { etiqueta: "Facturas", href: "/caja/facturas", grupo: "dinero", roles: ["admin"], permisos: ["facturar", "cancelar_facturas"] },
  { etiqueta: "Importar", href: "/admin/importar", grupo: "ajustes", roles: ["admin"], permisos: ["importar_datos"] },
  // Artículos, asistente y tickets de soporte: sin permiso especial.
  { etiqueta: "Ayuda", href: "/ayuda", grupo: "ayuda", roles: ["admin", "recepcion"] },
  // Servicios extra cobrables de Hotel y guardería (carril B).
  { etiqueta: "Servicios extra", href: "/extras", grupo: "dia", roles: ["admin", "recepcion"], modulo: ["guarderia", "hotel"] },
];

// Vacío por ahora — Fase 2/6/9 agregan aquí Mis perros, Mis reservas,
// Mis contratos, Bitácora. El layout del portal ya sabe renderizar esto
// en cuanto tenga elementos.
export const SECCIONES_PORTAL: ItemNav[] = [];

export function navStaffPara(rol: string, permisos: string[] = [], modulos: string[] = [], accesoVeterinaria = false, esMedico = false): ItemNav[] {
  // Estética sin su módulo no tiene a dónde aterrizar en /estetica: su inicio pasa a lo que sí puede usar (QA S53,
  // N156: Veterinaria si trabaja ahí, si no su asistencia; `inicioDeSesion`, la misma regla del layout y del middleware).
  const inicio = inicioDeSesion({ rol, modulos, accesoVeterinaria, esMedico });
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
