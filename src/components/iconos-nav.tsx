// Íconos de las secciones, al estilo de la iconografía del kit de PeluDesk
// (lámina 03): bicolor morado + menta, formas llenas y redondeadas. En SVG,
// no los PNG del kit (recortes de 400 px con el fondo de la lámina).
// Decorativos: la etiqueta de la sección va siempre al lado.

const M = "var(--color-morado)";
const T = "var(--color-menta)";
const C = "var(--color-coral)";

const ICONOS: Record<string, React.ReactNode> = {
  inicio: (
    <>
      <path d="M3.5 11 12 4l8.5 7v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" fill={M} />
      <rect x="9.5" y="14" width="5" height="7" rx="1.2" fill={T} />
    </>
  ),
  guarderia: (
    <>
      <path d="M2.5 11 12 3.5 21.5 11v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1Z" fill={M} />
      <circle cx="9.3" cy="13.2" r="1.3" fill={T} />
      <circle cx="12" cy="12" r="1.3" fill={T} />
      <circle cx="14.7" cy="13.2" r="1.3" fill={T} />
      <path d="M9.6 17.6c0-1.4 1.1-2.4 2.4-2.4s2.4 1 2.4 2.4c0 .8-.7 1.2-1.4 1l-1-.3-1 .3c-.7.2-1.4-.2-1.4-1Z" fill={T} />
    </>
  ),
  hotel: (
    <>
      <path d="M3 18V8.5M21 18v-4.5a3 3 0 0 0-3-3h-7v7.5" stroke={M} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M2.5 16.5h19v2.2h-19Z" fill={M} />
      <rect x="4.8" y="11" width="5" height="4" rx="2" fill={T} />
    </>
  ),
  estetica: (
    <>
      <circle cx="6.5" cy="17.5" r="3" stroke={M} strokeWidth="2.4" fill="none" />
      <circle cx="17.5" cy="17.5" r="3" stroke={M} strokeWidth="2.4" fill="none" />
      <path d="M8.6 15.4 17 4.5M15.4 15.4 7 4.5" stroke={T} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  servicios: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2.2" fill={M} />
      <rect x="13" y="3" width="8" height="8" rx="2.2" fill={T} />
      <rect x="3" y="13" width="8" height="8" rx="2.2" fill={T} />
      <rect x="13" y="13" width="8" height="8" rx="2.2" fill={M} />
    </>
  ),
  clientes: (
    <>
      <circle cx="9" cy="8" r="3.6" fill={M} />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0Z" fill={M} />
      <circle cx="16.5" cy="9.5" r="3" fill={T} />
      <path d="M12.6 20a5.4 5.4 0 0 1 9.9-3V20Z" fill={T} />
    </>
  ),
  vinculacion: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" stroke={M} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" stroke={T} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  caja: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill={M} />
      <rect x="2.5" y="8.5" width="19" height="3" fill={T} />
      <rect x="5.5" y="14.5" width="5" height="2" rx="1" fill="#fff" />
    </>
  ),
  contratos: (
    <>
      <path d="M6 2.5h8.5L19 7v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5Z" fill={M} />
      <path d="M8.5 11h7M8.5 14.5h4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13.5 19.5c1-1.8 2-2.3 2.6-1.4.6.9 1.2.9 2.4-.6" stroke={T} strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  inventario: (
    <>
      <path d="M3 8 12 3.5 21 8v9L12 21.5 3 17Z" fill={M} />
      <path d="M3 8l9 4.5L21 8M12 12.5v9" stroke={T} strokeWidth="2" strokeLinejoin="round" fill="none" />
    </>
  ),
  reportes: (
    <>
      <rect x="3.5" y="12" width="4" height="8.5" rx="1.6" fill={T} />
      <rect x="10" y="8" width="4" height="12.5" rx="1.6" fill={C} />
      <rect x="16.5" y="3.5" width="4" height="17" rx="1.6" fill={M} />
    </>
  ),
  empleados: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="3" fill={M} />
      <circle cx="12" cy="10" r="3" fill={T} />
      <path d="M7.5 17.5a4.5 4.5 0 0 1 9 0Z" fill={T} />
    </>
  ),
  gastos: (
    <>
      <path d="M5 2.5h14V21l-2.3-1.5-2.4 1.5-2.3-1.5L9.7 21l-2.4-1.5L5 21Z" fill={M} />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" stroke={T} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  asistencia: (
    <>
      <circle cx="12" cy="12" r="9.5" fill={M} />
      <path d="M12 7v5.2l3.4 2" stroke={T} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  administracion: (
    <>
      <path d="M12 2.5 14 5l3.2-.4.5 3.2 2.8 1.6-1.4 2.9 1.4 2.9-2.8 1.6-.5 3.2-3.2-.4L12 21.5 10 19l-3.2.4-.5-3.2-2.8-1.6 1.4-2.9-1.4-2.9 2.8-1.6.5-3.2 3.2.4Z" fill={M} />
      <circle cx="12" cy="12" r="3.4" fill={T} />
    </>
  ),
  permisos: (
    <>
      <path d="M12 2.5 20 5.5v6c0 4.8-3.3 8.6-8 10-4.7-1.4-8-5.2-8-10v-6Z" fill={M} />
      <path d="m8.5 12 2.5 2.5 4.5-5" stroke={T} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
};

const POR_RUTA: [string, string][] = [
  ["/admin/permisos", "permisos"],
  ["/admin", "administracion"],
  ["/recepcion", "inicio"],
  ["/guarderia", "guarderia"],
  ["/hotel", "hotel"],
  ["/estetica", "estetica"],
  ["/servicios", "servicios"],
  ["/clientes", "clientes"],
  ["/vinculacion", "vinculacion"],
  ["/caja", "caja"],
  ["/contratos", "contratos"],
  ["/inventario", "inventario"],
  ["/reportes", "reportes"],
  ["/empleados", "empleados"],
  ["/gastos", "gastos"],
  ["/mi-trabajo", "asistencia"],
];

export function IconoSeccion({ href, inicio = false }: { href: string; inicio?: boolean }) {
  const clave = inicio ? "inicio" : (POR_RUTA.find(([r]) => href === r || href.startsWith(`${r}/`))?.[1] ?? "inicio");
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="flex-none">
      {ICONOS[clave]}
    </svg>
  );
}
