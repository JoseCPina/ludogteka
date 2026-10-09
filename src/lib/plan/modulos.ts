/**
 * Módulos del plan de un negocio (migración 20260926003318). La fuente de
 * verdad es la base: `modulos_activos()` dice qué tiene prendido el negocio
 * y los triggers bloquean lo demás aunque alguien pida directo a la API.
 * Aquí solo está lo que la app necesita para no MOSTRAR lo que no tiene:
 * qué rutas son de qué módulo. Los nombres, precios y qué incluye cada
 * plan viven en la base (tablas `modulos` y `planes`), nunca aquí.
 *
 * Caja y clientes no son módulos: siempre están.
 */
export type ClaveModulo =
  | "guarderia"
  | "hotel"
  | "estetica"
  | "bonos"
  | "recoleccion"
  | "contratos"
  | "portal"
  | "inventario"
  | "empleados"
  | "gastos"
  | "reportes"
  | "pagina_web";

// Lo más específico primero: gana el primer prefijo que coincide.
// `modulo` como lista: basta con que esté activo CUALQUIERA (lo que sirve a
// guardería y a hotel: «Adentro ahora», fotos y videos).
export const RUTAS_DE_MODULO: { prefijo: string; modulo: ClaveModulo | ClaveModulo[] }[] = [
  { prefijo: "/adentro", modulo: ["guarderia", "hotel"] },
  { prefijo: "/admin/reporte-guarderia", modulo: ["guarderia", "hotel"] },
  { prefijo: "/guarderia/pases", modulo: "bonos" },
  { prefijo: "/caja/pases", modulo: "bonos" },
  { prefijo: "/caja/ajustes-servicio", modulo: "estetica" },
  { prefijo: "/admin/tarifa-guarderia", modulo: "estetica" },
  { prefijo: "/guarderia", modulo: "guarderia" },
  { prefijo: "/hotel", modulo: "hotel" },
  { prefijo: "/estetica", modulo: "estetica" },
  { prefijo: "/recepcion/contratos", modulo: "contratos" },
  { prefijo: "/contratos", modulo: "contratos" },
  { prefijo: "/inventario", modulo: "inventario" },
  { prefijo: "/reportes", modulo: "reportes" },
  { prefijo: "/empleados", modulo: "empleados" },
  { prefijo: "/mi-trabajo", modulo: "empleados" },
  { prefijo: "/gastos", modulo: "gastos" },
  { prefijo: "/portal", modulo: "portal" },
  { prefijo: "/vinculacion", modulo: "portal" },
  { prefijo: "/clientes/invitaciones", modulo: "portal" },
];

export function moduloDeRuta(pathname: string): ClaveModulo | ClaveModulo[] | null {
  return RUTAS_DE_MODULO.find((r) => pathname === r.prefijo || pathname.startsWith(`${r.prefijo}/`))?.modulo ?? null;
}

/** ¿Está activo lo que pide la ruta? (un módulo, o cualquiera de una lista). */
export function moduloRequeridoActivo(requerido: ClaveModulo | ClaveModulo[], activos: readonly string[]): boolean {
  return (Array.isArray(requerido) ? requerido : [requerido]).some((m) => activos.includes(m));
}

/** ¿El negocio usa guardería u hotel? (requisitos sanitarios, evaluación, celo, cupo). */
export function usaEstancias(modulos: readonly string[]): boolean {
  return modulos.includes("guarderia") || modulos.includes("hotel");
}

/**
 * ¿Se ofrece este tipo de contrato? El general (sin categorías) va con
 * guardería u hotel; uno de hotel o de guardería, solo si ese módulo está
 * activo. En estética no hay contratos.
 */
export function tipoContratoAplica(categorias: readonly string[] | null | undefined, modulos: readonly string[]): boolean {
  const cats = categorias ?? [];
  return cats.length === 0 ? usaEstancias(modulos) : cats.some((c) => modulos.includes(c));
}
