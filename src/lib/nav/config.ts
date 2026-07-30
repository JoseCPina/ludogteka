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
  { etiqueta: "Reservas", href: "/reservas", roles: ["admin", "recepcion"] },
  { etiqueta: "Servicios", href: "/servicios", roles: ["admin"] },
  { etiqueta: "Clientes", href: "/clientes", roles: ["admin", "recepcion"] },
  { etiqueta: "Vinculación", href: "/vinculacion", roles: ["admin", "recepcion"] },
  { etiqueta: "Caja", href: "/caja", roles: ["admin", "recepcion"] },
  { etiqueta: "Contratos", href: "/contratos", roles: ["admin", "recepcion"] },
  { etiqueta: "Agenda", href: "/agenda", roles: ["admin", "recepcion", "estetica"] },
  { etiqueta: "Inventario", href: "/inventario", roles: ["admin", "recepcion", "estetica"] },
  { etiqueta: "Reportes", href: "/reportes", roles: ["admin"] },
];

// Vacío por ahora — Fase 2/6/9 agregan aquí Mis perros, Mis reservas,
// Mis contratos, Bitácora. El layout del portal ya sabe renderizar esto
// en cuanto tenga elementos.
export const SECCIONES_PORTAL: ItemNav[] = [];

export function navStaffPara(rol: string): ItemNav[] {
  return [
    { etiqueta: "Inicio", href: rutaPorRol(rol), roles: [rol] },
    ...SECCIONES_STAFF.filter((seccion) => seccion.roles.includes(rol)),
  ];
}
