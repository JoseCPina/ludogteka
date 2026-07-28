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
  { etiqueta: "Reservas", href: "/reservas", roles: ["admin", "recepcion"], proximamente: true },
  { etiqueta: "Clientes", href: "/clientes", roles: ["admin", "recepcion"] },
  { etiqueta: "Caja", href: "/caja", roles: ["admin", "recepcion"], proximamente: true },
  { etiqueta: "Agenda", href: "/agenda", roles: ["admin", "estetica"], proximamente: true },
  { etiqueta: "Inventario", href: "/inventario", roles: ["admin", "estetica"], proximamente: true },
  { etiqueta: "Reportes", href: "/reportes", roles: ["admin"], proximamente: true },
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
