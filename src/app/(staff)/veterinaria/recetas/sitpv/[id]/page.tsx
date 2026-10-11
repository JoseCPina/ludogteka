import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { cargarProductosConLotes } from "@/lib/veterinaria/lotes";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { BotonImprimirPagina } from "@/components/boton-imprimir";
import { FormularioAccion, Desplegable, BotonAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario } from "@/lib/formato";
import type { EspejoDetalle } from "@/lib/veterinaria/recetas";
import { archivarEspejo, cancelarEspejo } from "../../actions";
import { SurtirDocumento } from "../../surtir";

export default async function EspejoSitpv({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data }, puede, productos, { data: urlRegla }, { data: internadosCrudo }] = await Promise.all([
    supabase.rpc("vet_sitpv_detalle", { p_id: id }),
    vetPuede(supabase, "registrar_recetas_sitpv"),
    cargarProductosConLotes(supabase),
    supabase.from("vet_reglas").select("valor").eq("clave", "sitpv_url").maybeSingle(),
    supabase.rpc("vet_pacientes_internados"),
  ]);
  const d = data as EspejoDetalle | null;
  if (!d) notFound();
  const cancelada = d.estado === "cancelada";
  const urlSitpv = typeof urlRegla?.valor === "string" ? urlRegla.valor : null;
  const lotes = productos.find((p) => p.id === d.insumo_id)?.lotes ?? [];
  const pendiente = Math.max(0, d.cantidad_total - d.surtido);
  const internados = (internadosCrudo ?? []) as { perro_id: string; nombre: string }[];
  const paciente = d.uso_hospitalario ? "USO HOSPITALARIO" : (d.mascota ?? "—");
  const campos: [string, string][] = [
    ["Folio", d.folio], ["CPA", d.cpa], ["Fecha", formatearFechaCalendario(d.fecha)], ["Paciente", paciente],
    ["Producto", d.producto], ["Registro SENASICA", d.registro_senasica], ["Principio activo", d.principio_activo ?? ""], ["Lote", d.lote ?? ""],
    ["Presentación", d.presentacion ?? ""], ["Dosis", d.dosis ?? ""], ["Intervalo", d.intervalo ?? ""], ["Duración", d.duracion ?? ""],
    ["Cantidad total", `${d.cantidad_total}${d.unidad ? ` ${d.unidad}` : ""}`], ["Comprobante de compra", d.comprobante_compra ?? ""],
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="print:hidden">
        <Link href="/veterinaria/recetas/sitpv" className="text-sm font-semibold text-morado hover:underline">← Registro SITPV</Link>
      </div>
      {cancelada && <Alert variante="error" titulo="Folio CANCELADO">{d.cancelada_motivo}. Va en ceros, con esta observación, en el reporte del mes.</Alert>}

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <BotonImprimirPagina texto="Imprimir PDF de referencia" />
        {urlSitpv && (
          <a href={urlSitpv} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center rounded-md border-[1.5px] border-morado px-4 font-semibold text-morado hover:bg-morado-suave">
            Abrir el SITPV en otra pestaña
          </a>
        )}
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4 print:hidden">
        <h2 className="text-lg font-bold text-n-900">Datos para copiar al SITPV</h2>
        <p className="text-sm text-n-600">Cópialos uno por uno al capturar la receta en el SITPV. Si ya la emitiste, verifica que el folio sea este.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campos.filter(([, v]) => v).map(([etiqueta, valor]) => (
            <CampoCopiable key={etiqueta} etiqueta={etiqueta} valor={valor} />
          ))}
        </div>
        {d.observaciones && <CampoCopiable etiqueta="Observaciones" valor={d.observaciones.replace(/\n/g, " · ")} />}
      </section>

      <article className="relative flex flex-col gap-4 rounded-lg border-2 border-dashed border-coral bg-white p-6 print:border-coral">
        <p className="text-center text-sm font-bold uppercase tracking-wide text-coral-oscuro">{d.leyenda}</p>
        <div className="flex items-start justify-between gap-3">
          <EncabezadoNegocio />
          <p className="text-right text-xs text-n-600">Registro espejo de la receta cuantificada<br />emitida en el SITPV</p>
        </div>
        <h1 className="text-center text-xl font-bold uppercase text-n-900">Folio {d.folio}</h1>
        <section className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <p><span className="text-n-500">Médico:</span> <strong>{d.medico}</strong></p>
          <p><span className="text-n-500">Cédula:</span> {d.cedula ?? "—"} · <span className="text-n-500">CPA:</span> {d.cpa}</p>
          <p><span className="text-n-500">Fecha:</span> {formatearFechaCalendario(d.fecha)}</p>
          <p><span className="text-n-500">Paciente:</span> <strong>{paciente}</strong>{!d.uso_hospitalario && d.dueno ? ` · de ${d.dueno}` : ""}</p>
          <p className="sm:col-span-2"><span className="text-n-500">Producto:</span> <strong>{d.producto}</strong>{d.presentacion ? ` — ${d.presentacion}` : ""}</p>
          <p><span className="text-n-500">Registro SENASICA:</span> {d.registro_senasica}</p>
          <p><span className="text-n-500">Principio activo:</span> {d.principio_activo ?? "—"}</p>
          <p><span className="text-n-500">Laboratorio:</span> {d.laboratorio ?? "—"}</p>
          <p><span className="text-n-500">Lote:</span> {d.lote ?? "—"}</p>
          <p><span className="text-n-500">Dosis:</span> {d.dosis ?? "—"} · <span className="text-n-500">Intervalo:</span> {d.intervalo ?? "—"} · <span className="text-n-500">Duración:</span> {d.duracion ?? "—"}</p>
          <p><span className="text-n-500">Cantidad total:</span> <strong>{d.cantidad_total}{d.unidad ? ` ${d.unidad}` : ""}</strong>{d.parcialidades ? " · en parcialidades" : ""}</p>
          <p className="sm:col-span-2"><span className="text-n-500">Comprobante de compra:</span> {d.comprobante_compra ?? "—"}</p>
          {d.observaciones && <p className="whitespace-pre-line sm:col-span-2"><span className="text-n-500">Observaciones:</span> {d.observaciones}</p>}
        </section>
        {d.aplicaciones.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-bold text-n-900">Aplicaciones (parcialidades)</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-n-500"><th>Fecha</th><th>Paciente</th><th>Lote</th><th className="text-right">Cantidad</th></tr></thead>
              <tbody>
                {d.aplicaciones.map((a, i) => (
                  <tr key={i} className="border-t border-n-200"><td>{formatearFechaCalendario(a.fecha)}</td><td>{a.hospitalario && !a.paciente ? "USO HOSPITALARIO" : (a.paciente ?? "—")}{a.hospitalario && a.paciente ? " (uso hospitalario)" : ""}</td><td>{a.lote ?? "—"}</td><td className="text-right">{a.cantidad}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-sm text-n-700">Surtido {d.surtido} de {d.cantidad_total}{d.unidad ? ` ${d.unidad}` : ""}.</p>
          </section>
        )}
        <p className="text-center text-xs font-semibold text-coral-oscuro">{d.leyenda}</p>
      </article>

      {puede && !cancelada && (
        <section className="flex flex-col gap-3 print:hidden">
          {pendiente > 0 && (d.parcialidades || d.surtido === 0) ? (
            <>
              <h2 className="text-lg font-bold text-n-900">{d.parcialidades ? "Registrar una aplicación (parcialidad)" : "Surtir"}</h2>
              <p className="text-sm text-n-600">Queda por surtir {pendiente}{d.unidad ? ` ${d.unidad}` : ""}. La salida baja el lote y entra al libro de control con este folio{d.uso_hospitalario ? " y el paciente que elijas" : ` y ${d.mascota}`}.</p>
              <SurtirDocumento
                tipo="espejo" docId={d.id} lotes={lotes} unidad={d.unidad}
                pacientes={d.uso_hospitalario ? internados : d.perro_id ? [{ perro_id: d.perro_id, nombre: d.mascota ?? "Paciente" }] : []}
                etiquetaPaciente={d.uso_hospitalario ? "Paciente internado" : "Paciente"}
              />
            </>
          ) : (
            <p className="text-sm text-n-600">{pendiente <= 0 ? "Este folio ya se surtió completo." : "Este folio no es en parcialidades y ya se surtió."}</p>
          )}
          <Desplegable texto="Cancelar este folio (va en ceros)" variante="secundario">
            <FormularioAccion accion={cancelarEspejo.bind(null, d.id)} textoBoton="Cancelar folio" variante="peligro">
              <Textarea label="Motivo (será la observación del folio en ceros)" name="motivo" rows={2} required ayuda="El folio no se borra ni se reutiliza. Un folio con parcialidades ya no se puede cancelar." />
            </FormularioAccion>
          </Desplegable>
          {!d.archivada_at && (
            <div className="flex flex-col gap-1">
              <BotonAccion accion={archivarEspejo.bind(null, d.id)} texto="Archivar" variante="secundario" textoExito="Archivado" />
              <p className="text-xs text-n-500">Se conserva hasta el {formatearFechaCalendario(d.conservar_hasta)}; antes de esa fecha no se puede archivar.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
