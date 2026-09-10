import { rutaPorRol } from "@/lib/auth/rutas";

export type ItemNav = {
  etiqueta: string;
  href: string;
  roles: string[];
  // Sin ruta real todavía: se muestra deshabilitado, sin link. Cuando la
  // sección exista, basta con quitar esta bandera (o mover la entrada,
  // si cambia de lugar en el flujo).
  proximamente?: boolean;
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
  { etiqueta: "Guardería", href: "/guarderia", roles: ["admin", "recepcion"] },
  { etiqueta: "Hotel", href: "/hotel", roles: ["admin", "recepcion"] },
  { etiqueta: "Estética", href: "/estetica", roles: ["admin", "recepcion", "estetica"] },
  { etiqueta: "Servicios", href: "/servicios", roles: ["admin"] },
  { etiqueta: "Clientes", href: "/clientes", roles: ["admin", "recepcion"] },
  { etiqueta: "Vinculación", href: "/vinculacion", roles: ["admin", "recepcion"] },
  { etiqueta: "Caja", href: "/caja", roles: ["admin", "recepcion"] },
  { etiqueta: "Contratos", href: "/contratos", roles: ["admin", "recepcion"] },
  { etiqueta: "Inventario", href: "/inventario", roles: ["admin", "recepcion", "estetica"] },
  { etiqueta: "Reportes", href: "/reportes", roles: ["admin"] },
];

// Vacío por ahora — Fase 2/6/9 agregan aquí Mis perros, Mis reservas,
// Mis contratos, Bitácora. El layout del portal ya sabe renderizar esto
// en cuanto tenga elementos.
export const SECCIONES_PORTAL: ItemNav[] = [];

export function navStaffPara(rol: string): ItemNav[] {
  const inicio = rutaPorRol(rol);
  return [
    { etiqueta: "Inicio", href: inicio, roles: [rol] },
    // El rol de estética aterriza justamente en /estetica, que además es
    // una sección del menú: sin este filtro saldría dos veces seguidas,
    // "Inicio" y "Estética", apuntando al mismo lugar.
    ...SECCIONES_STAFF.filter((seccion) => seccion.roles.includes(rol) && seccion.href !== inicio),
  ];
}
