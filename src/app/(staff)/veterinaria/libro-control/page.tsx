import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { BotonImprimirPagina } from "@/components/boton-imprimir";
import { formatearFechaCalendario, hoyNegocio, sumarDiasFecha, unidadSegunCantidad } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { NOMBRE_TIPO_MOVIMIENTO, type Libro } from "@/lib/veterinaria/recetas";
import { NavRecetas } from "../recetas/nav";

// El libro de control se deriva de los movimientos de lote de los productos que la plataforma marca
// (Grupo I y, por omisión, estupefacientes y psicotrópicos de la fracción II). No hay nada que editar:
// una corrección se hace con un ajuste en el lote y queda aquí.
export default async function LibroControl({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; insumo?: string }> }) {
  const { desde: d, hasta: h, insumo } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);
  const fecha = (v: string | undefined, def: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : def);
  const hasta = fecha(h, hoy);
  const desde = fecha(d, sumarDiasFecha(hasta, -29));
  const filtro = insumo && /^[0-9a-f-]{36}$/.test(insumo) ? insumo : null;
  const puede = await vetPuede(supabase, "ver_libro_control");
  const [{ data, error }, { data: productosCrudo }] = puede
    ? await Promise.all([supabase.rpc("vet_libro_control", { p_desde: desde, p_hasta: hasta, p_insumo: filtro }), supabase.rpc("vet_productos_receta")])
    : [{ data: null, error: null }, { data: null }];
  const libro = data as Libro | null;
  const productos = ((productosCrudo ?? []) as { id: string; nombre: string; libro_control: boolean }[]).filter((p) => p.libro_control);
  const porProducto = new Map<string, Libro["movimientos"]>();
  for (const m of libro?.movimientos ?? []) porProducto.set(m.producto, [...(porProducto.get(m.producto) ?? []), m]);
  const excel = `/api/veterinaria/libro-control/excel?desde=${desde}&hasta=${hasta}${filtro ? `&insumo=${filtro}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Libro de control</h1>
        <p className="mt-1 max-w-3xl text-n-600">Cada entrada y salida de los productos controlados, con el folio de la receta, el lote, el paciente o el uso hospitalario y el médico. Se arma solo de los movimientos de lote: no se edita.</p>
      </div>
      <NavRecetas activa="libro" />
      {!puede ? (
        <Alert variante="advertencia" titulo="Ver el libro es de un médico veterinario">Pídele a un admin el permiso «Ver libro de control».</Alert>
      ) : error ? (
        <Alert variante="error" titulo="No pudimos armar el libro">{error.message}</Alert>
      ) : (
        <>
          <form method="get" className="grid gap-3 rounded-lg border border-n-200 bg-white p-4 sm:grid-cols-4 print:hidden">
            <Field label="Desde" name="desde" type="date" defaultValue={desde} />
            <Field label="Hasta" name="hasta" type="date" defaultValue={hasta} />
            <label className="block text-sm font-medium text-n-800">
              Producto
              <select name="insumo" defaultValue={filtro ?? ""} className="mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900">
                <option value="">Todos los controlados</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2"><Button type="submit">Ver</Button></div>
          </form>
          <div className="flex flex-wrap gap-3 print:hidden">
            <BotonImprimirPagina texto="Imprimir o guardar PDF" />
            <a href={excel} className="inline-flex min-h-12 items-center rounded-md border-[1.5px] border-morado px-4 font-semibold text-morado hover:bg-morado-suave">Descargar Excel</a>
          </div>
          <p className="hidden text-sm print:block">Libro de control del {formatearFechaCalendario(desde)} al {formatearFechaCalendario(hasta)}</p>
          {porProducto.size === 0 ? (
            <p className="rounded-lg border border-n-200 bg-white p-5 text-n-700">No hay movimientos de productos controlados en este rango.</p>
          ) : (
            [...porProducto.entries()].map(([producto, filas]) => {
              const inicial = libro?.saldos_iniciales.find((s) => s.producto === producto);
              return (
                <section key={producto} className="flex flex-col gap-2 print:break-inside-avoid-page">
                  <h2 className="text-lg font-bold text-n-900">{producto}{filas[0].laboratorio ? <span className="font-normal text-n-500"> · {filas[0].laboratorio}</span> : null}</h2>
                  <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
                    <table className="w-full min-w-[56rem] text-sm">
                      <thead>
                        <tr className="text-left text-n-500">
                          <th className="px-3 py-2">Fecha</th><th>Movimiento</th><th>Folio</th><th>Lote</th><th className="text-right">Entrada</th><th className="text-right">Salida</th><th className="text-right">Saldo</th><th className="px-3">Paciente</th><th>Médico</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inicial && inicial.saldo_inicial !== 0 && (
                          <tr className="border-t border-n-200 bg-n-50"><td className="px-3 py-1.5" colSpan={6}>Saldo al inicio del rango</td><td className="text-right font-semibold">{inicial.saldo_inicial}</td><td colSpan={2} /></tr>
                        )}
                        {filas.map((m) => (
                          <tr key={m.id} className="border-t border-n-200 align-top">
                            <td className="whitespace-nowrap px-3 py-1.5">{formatearFechaCalendario(m.fecha)}<span className="block text-xs text-n-500">{m.hora}</span></td>
                            <td>{NOMBRE_TIPO_MOVIMIENTO[m.tipo] ?? m.tipo}{m.motivo ? <span className="block text-xs text-n-500">{m.motivo}</span> : null}</td>
                            <td>{m.folio ?? "—"}</td>
                            <td>{m.lote}{m.caducidad ? <span className="block text-xs text-n-500">caduca {m.caducidad}</span> : null}</td>
                            <td className="text-right">{m.entrada ?? ""}</td>
                            <td className="text-right">{m.salida ?? ""}</td>
                            <td className="text-right font-semibold">{m.saldo} {unidadSegunCantidad(m.saldo, m.unidad)}</td>
                            <td className="px-3">{m.paciente ?? "—"}</td>
                            <td>{m.medico ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
