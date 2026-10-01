import Link from "next/link";
import { TableroModulo } from "@/app/(staff)/reservas/modulo/tablero";
import { MODULOS } from "@/lib/modulos";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";

export default async function GuarderiaPage() {
  const sesion = await obtenerSesionConRol();
  // El reporte diario lo llena quien tiene el permiso «Reportes de guardería».
  const conReportes = tienePermiso(sesion, "reportes_guarderia");
  return (
    <div className="flex flex-col gap-5">
      {conReportes && (
        <Link
          href="/guarderia/reportes"
          className="flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 border-menta bg-menta-suave px-4 py-3 text-menta-oscuro transition-colors hover:bg-menta/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
        >
          <span className="flex flex-col">
            <span className="text-base font-bold">Reportes del día</span>
            <span className="text-sm">Llena y envía el reporte de comportamiento de cada perro que está adentro.</span>
          </span>
          <span aria-hidden="true" className="text-xl">
            →
          </span>
        </Link>
      )}
      <TableroModulo modulo={MODULOS.guarderia} />
    </div>
  );
}
