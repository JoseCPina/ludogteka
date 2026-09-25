import Link from "next/link";

// Pestañas de la sección. Nómina y comisiones solo con el permiso.
export function SubnavEmpleados({
  activa,
  puedeNomina,
  ausenciasPorAprobar = 0,
}: {
  activa: "hoy" | "ausencias" | "nomina" | "comisiones";
  puedeNomina: boolean;
  ausenciasPorAprobar?: number;
}) {
  const pestanas = [
    { clave: "hoy", etiqueta: "Asistencia y personal", href: "/empleados" },
    { clave: "ausencias", etiqueta: "Ausencias", href: "/empleados/ausencias", aviso: ausenciasPorAprobar },
    ...(puedeNomina
      ? [
          { clave: "nomina", etiqueta: "Nómina", href: "/empleados/nomina" },
          { clave: "comisiones", etiqueta: "Comisiones", href: "/empleados/comisiones" },
        ]
      : []),
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-n-200" aria-label="Secciones de empleados">
      {pestanas.map((p) => (
        <Link
          key={p.clave}
          href={p.href}
          className={`whitespace-nowrap rounded-t-md border-b-[3px] px-4 py-2 font-semibold ${
            activa === p.clave ? "border-morado text-morado" : "border-transparent text-n-600 hover:text-n-900"
          }`}
        >
          {p.etiqueta}
          {"aviso" in p && p.aviso ? (
            <span className="ml-2 rounded-full bg-ambar-suave px-2 py-0.5 text-xs text-ambar-oscuro">{p.aviso}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
