import { EnlacePestana } from "@/components/ui/enlace-pestana";

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
    <nav className="flex flex-wrap gap-1 border-b border-n-200" aria-label="Secciones de empleados">
      {pestanas.map((p) => (
        <EnlacePestana key={p.clave} href={p.href} className="whitespace-nowrap" forma="pestana" activo={activa === p.clave}>
          {p.etiqueta}
          {"aviso" in p && p.aviso ? (
            <span className="ml-2 rounded-full bg-ambar-suave px-2 py-0.5 text-xs text-ambar-oscuro">{p.aviso}</span>
          ) : null}
        </EnlacePestana>
      ))}
    </nav>
  );
}
