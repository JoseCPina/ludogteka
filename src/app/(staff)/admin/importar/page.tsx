import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { usaVeterinaria } from "@/lib/plan/modulos";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { Importador } from "./importador";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { texto: string; tono: TonoChip }> = {
  preparada: { texto: "Sin terminar de subir", tono: "proceso" },
  procesando: { texto: "En curso", tono: "proceso" },
  completada: { texto: "Terminada", tono: "exito" },
  deshecha: { texto: "Deshecha", tono: "neutro" },
  cancelada: { texto: "Cancelada", tono: "neutro" },
};

// Importar clientes y mascotas desde un Excel o CSV. Solo con el permiso
// «Importar clientes y mascotas» (admin lo tiene siempre).
export default async function ImportarPage() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "importar_datos")) redirect("/admin");
  const conClinicos = usaVeterinaria(sesion?.modulos ?? []) && tienePermiso(sesion, "editar_ficha_clinica");
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("importaciones")
    .select("id, nombre_archivo, estado, modo_duplicados, total_filas, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(15);
  const historial = (data ?? []) as {
    id: string;
    nombre_archivo: string;
    estado: string;
    modo_duplicados: string;
    total_filas: number;
    created_at: string;
  }[];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Importar clientes y mascotas</h1>
        <p className="mt-1 text-n-700">
          Pasa tu lista de un Excel o CSV al sistema sin capturar uno por uno. Antes de importar ves qué va a pasar con cada fila.
        </p>
      </header>
      <Importador conClinicos={conClinicos} />
      <section className="flex flex-col gap-3" aria-labelledby="historial">
        <h2 id="historial" className="text-lg font-bold text-n-900">
          Historial de importaciones
        </h2>
        {historial.length === 0 ? (
          <p className="text-n-700">Todavía no has importado nada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {historial.map((i) => {
              const e = ESTADO[i.estado] ?? { texto: i.estado, tono: "neutro" as TonoChip };
              return (
                <li key={i.id}>
                  <Link
                    href={`/admin/importar/${i.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-borde bg-white p-3 hover:bg-n-100"
                  >
                    <span>
                      <strong className="text-n-900">{i.nombre_archivo}</strong>
                      <span className="block text-sm text-n-700">
                        {formatearFecha(i.created_at, zona)} · {i.total_filas.toLocaleString("es-MX")} filas ·{" "}
                        {i.modo_duplicados === "actualizar" ? "actualizar duplicados" : "omitir duplicados"}
                      </span>
                    </span>
                    <Chip tono={e.tono}>{e.texto}</Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
