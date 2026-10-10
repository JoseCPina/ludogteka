import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BotonImprimirPagina } from "@/components/boton-imprimir";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { formatearFechaCalendario } from "@/lib/formato";
import { ESTADOS_CARNET, TIPOS_DESPARASITACION, type CarnetCompleto } from "@/lib/veterinaria/carnet";

// El carnet impreso: solo lo que sigue siendo válido (sin lo anulado), una hoja.
export default async function ImprimirCarnet({ params }: { params: Promise<{ perroId: string }> }) {
  const { perroId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: perro } = await supabase
    .from("perros")
    .select("id, nombre, especie, raza, sexo, fecha_nacimiento, microchip, clientes(nombre)")
    .eq("id", perroId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!perro) notFound();
  const { data: carnetCrudo } = await supabase.rpc("carnet_de_mascota", { p_perro_id: perroId });
  const carnet = (carnetCrudo ?? { vacunas: [], desparasitaciones: [] }) as CarnetCompleto;
  const dueno = (Array.isArray(perro.clientes) ? perro.clientes[0] : perro.clientes) as { nombre: string } | null;
  const vacunas = carnet.vacunas.filter((v) => v.estado !== "anulada");
  const desparasitaciones = carnet.desparasitaciones.filter((d) => d.estado !== "anulada");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/veterinaria/carnet/${perroId}`} className="text-sm font-semibold text-morado hover:underline">← Carnet</Link>
        <BotonImprimirPagina />
      </div>
      <article className="flex flex-col gap-5 rounded-lg border border-n-200 bg-white p-6 print:border-0 print:p-0">
        <EncabezadoNegocio />
        <header>
          <p className="text-xs font-bold uppercase tracking-wide text-n-500">Carnet de vacunación y desparasitación</p>
          <h1 className="text-3xl font-bold text-n-900">{perro.nombre as string}</h1>
          <p className="mt-1 text-n-700">
            {perro.especie === "gato" ? "Gato" : perro.especie === "otro" ? "Otra especie" : "Perro"}
            {perro.raza ? ` · ${perro.raza}` : ""}
            {perro.sexo ? ` · ${perro.sexo}` : ""}
            {perro.fecha_nacimiento ? ` · nació el ${formatearFechaCalendario(perro.fecha_nacimiento as string)}` : ""}
            {perro.microchip ? ` · microchip ${perro.microchip}` : ""}
          </p>
          <p className="text-n-700">Propietario: {dueno?.nombre ?? "—"}</p>
        </header>

        <section>
          <h2 className="mb-2 text-lg font-bold text-n-900">Vacunas</h2>
          {vacunas.length === 0 ? (
            <p className="text-n-600">Sin vacunas registradas.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-n-300 text-n-600">
                  <th className="py-1.5 pr-2">Vacuna</th>
                  <th className="py-1.5 pr-2">Fecha</th>
                  <th className="py-1.5 pr-2">Lote</th>
                  <th className="py-1.5 pr-2">Próxima dosis</th>
                  <th className="py-1.5">Médico</th>
                </tr>
              </thead>
              <tbody>
                {vacunas.map((v) => (
                  <tr key={v.id} className="border-b border-n-100 align-top">
                    <td className="py-1.5 pr-2 font-semibold text-n-900">
                      {v.biologico}
                      {v.laboratorio ? <span className="block text-xs font-normal text-n-500">{v.laboratorio}</span> : null}
                    </td>
                    <td className="py-1.5 pr-2">{formatearFechaCalendario(v.fecha_aplicacion)}</td>
                    <td className="py-1.5 pr-2">{v.lote ?? "—"}</td>
                    <td className="py-1.5 pr-2">
                      {v.proxima_dosis ? formatearFechaCalendario(v.proxima_dosis) : `Vigente hasta ${formatearFechaCalendario(v.vigente_hasta)}`}
                      <span className="block text-xs text-n-500">{ESTADOS_CARNET[v.estado]?.etiqueta}</span>
                    </td>
                    <td className="py-1.5">
                      {v.medico ?? "—"}
                      {v.cedula ? <span className="block text-xs text-n-500">Céd. {v.cedula}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-n-900">Desparasitaciones</h2>
          {desparasitaciones.length === 0 ? (
            <p className="text-n-600">Sin desparasitaciones registradas.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-n-300 text-n-600">
                  <th className="py-1.5 pr-2">Producto</th>
                  <th className="py-1.5 pr-2">Tipo</th>
                  <th className="py-1.5 pr-2">Fecha</th>
                  <th className="py-1.5 pr-2">Dosis</th>
                  <th className="py-1.5">Próxima</th>
                </tr>
              </thead>
              <tbody>
                {desparasitaciones.map((d) => (
                  <tr key={d.id} className="border-b border-n-100 align-top">
                    <td className="py-1.5 pr-2 font-semibold text-n-900">{d.producto}</td>
                    <td className="py-1.5 pr-2">{TIPOS_DESPARASITACION[d.tipo]}</td>
                    <td className="py-1.5 pr-2">{formatearFechaCalendario(d.fecha_aplicacion)}</td>
                    <td className="py-1.5 pr-2">{d.dosis ?? "—"}</td>
                    <td className="py-1.5">{d.proxima_dosis ? formatearFechaCalendario(d.proxima_dosis) : `Hasta ${formatearFechaCalendario(d.vigente_hasta)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <p className="text-xs text-n-500">Este carnet lo emite el establecimiento con los registros de sus médicos veterinarios. Una vacuna anulada no aparece aquí.</p>
      </article>
    </div>
  );
}
