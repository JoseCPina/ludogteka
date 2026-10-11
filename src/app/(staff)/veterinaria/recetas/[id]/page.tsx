import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { cargarProductosConLotes } from "@/lib/veterinaria/lotes";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { DOCUMENTOS, type RecetaDetalle } from "@/lib/veterinaria/recetas";
import { AccionesReceta } from "./acciones-receta";
import { SurtirDocumento } from "../surtir";

const ETIQUETAS_COPIA = ["ORIGINAL", "COPIA 1", "COPIA 2", "COPIA 3", "COPIA 4"];

function Cuerpo({ d, etiqueta, pie }: { d: RecetaDetalle; etiqueta: string; pie: string }) {
  const s = d.snapshot;
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-6 print:break-after-page print:border-0 print:p-0">
      <div className="flex items-start justify-between gap-3">
        <EncabezadoNegocio />
        <div className="text-right">
          <p className="rounded border border-n-500 px-2 py-0.5 text-sm font-bold tracking-wide text-n-900">{etiqueta}</p>
          <p className="mt-1 text-xs text-n-600">{pie}</p>
        </div>
      </div>
      <header className="text-center">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-n-900">Receta veterinaria</h1>
        <p className="text-sm text-n-600">N.º {d.numero} · {formatearFechaCalendario(d.fecha)}{d.estado === "anulada" ? " · ANULADA" : ""}</p>
      </header>
      <section className="grid gap-x-6 gap-y-1 rounded-md border border-n-200 p-3 text-sm sm:grid-cols-2">
        <p className="sm:col-span-2"><span className="text-n-500">Médico veterinario:</span> <strong>{s.medico.nombre}</strong> · cédula profesional <strong>{s.medico.cedula}</strong></p>
        <p className="sm:col-span-2"><span className="text-n-500">Establecimiento:</span> {s.establecimiento.nombre}{s.establecimiento.ciudad ? `, ${s.establecimiento.ciudad}` : ""}{s.establecimiento.aviso_funcionamiento ? ` · Aviso de funcionamiento SENASICA ${s.establecimiento.aviso_funcionamiento}` : ""}</p>
        <p><span className="text-n-500">Propietario:</span> <strong>{s.propietario.nombre}</strong></p>
        <p><span className="text-n-500">Teléfono:</span> {s.propietario.telefono ?? "—"}</p>
        <p className="sm:col-span-2"><span className="text-n-500">Domicilio:</span> {s.propietario.domicilio ?? "—"}</p>
        <p><span className="text-n-500">Especie:</span> {s.mascota.especie === "gato" ? "Gato" : s.mascota.especie === "otro" ? "Otra" : "Perro"} · <span className="text-n-500">Cantidad:</span> 1</p>
        <p><span className="text-n-500">Identificación:</span> <strong>{s.mascota.nombre}</strong>{s.mascota.microchip ? ` · microchip ${s.mascota.microchip}` : ""}</p>
        <p><span className="text-n-500">Raza:</span> {s.mascota.raza ?? "—"} · <span className="text-n-500">Peso:</span> {s.mascota.peso_kg ? `${s.mascota.peso_kg} kg` : "—"}</p>
        {d.diagnostico && <p className="sm:col-span-2"><span className="text-n-500">Diagnóstico:</span> {d.diagnostico}</p>}
      </section>
      <section className="flex flex-col gap-3">
        {d.lineas.map((l, i) => (
          <div key={l.id} className="rounded-md border border-n-200 p-3 text-sm">
            <p className="font-bold text-n-900">{i + 1}. {l.producto}{l.presentacion ? ` — ${l.presentacion}` : ""}</p>
            {l.principio_activo && <p className="text-n-600">Principio activo: {l.principio_activo}</p>}
            <p className="mt-1 text-n-800">
              <strong>Dosis:</strong> {l.dosis} · <strong>Vía:</strong> {l.via} · <strong>Frecuencia:</strong> {l.frecuencia} · <strong>Duración:</strong> {l.duracion_dias} {l.duracion_dias === 1 ? "día" : "días"}
            </p>
            <p className="text-n-800"><strong>Cantidad a surtir:</strong> {l.cantidad_surtir}{l.cantidad_unidad ? ` ${l.cantidad_unidad}` : ""}{l.tiempo_retiro ? <> · <strong>Tiempo de retiro:</strong> {l.tiempo_retiro}</> : null}</p>
            {l.indicaciones && <p className="text-n-700">{l.indicaciones}</p>}
            {l.documento === "receta_cedula" && <p className="mt-1 text-xs font-semibold text-ambar-oscuro">{l.clasificacion}: {l.surtidos_max === 1 ? "se surte una sola vez y se retiene" : `hasta ${l.surtidos_max ?? "—"} surtidos${l.ventana_meses ? ` en ${l.ventana_meses} meses` : ""}`}.</p>}
          </div>
        ))}
      </section>
      {d.observaciones && <p className="whitespace-pre-line text-sm text-n-800"><strong>Observaciones:</strong> {d.observaciones}</p>}
      <p className="text-xs font-semibold text-n-700">{s.leyenda}</p>
      <footer className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="text-center">
          <div className="mb-1 h-14 border-b border-n-500" />
          <p className="text-sm font-semibold text-n-900">{s.medico.nombre}</p>
          <p className="text-xs text-n-600">Médico(a) veterinario(a) · Cédula profesional {s.medico.cedula}</p>
        </div>
        <p className="self-end text-center text-xs text-n-600">Conservar hasta el {formatearFechaCalendario(d.conservar_hasta)}</p>
      </footer>
    </article>
  );
}

export default async function Receta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data }, puede, productos] = await Promise.all([
    supabase.rpc("vet_receta_detalle", { p_id: id }),
    vetPuede(supabase, "emitir_recetas"),
    cargarProductosConLotes(supabase),
  ]);
  const d = data as RecetaDetalle | null;
  if (!d) notFound();
  const anulada = d.estado === "anulada";
  const copias = Math.max(0, Math.min(d.copias, 4));
  const piePagina = ["Se queda en el establecimiento que surte", "Para el propietario", "Para el médico veterinario", "Copia adicional", "Copia adicional"];
  const surtibles = d.lineas.filter((l) => l.insumo_id && l.documento === "receta_cedula");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="print:hidden">
        <Link href="/veterinaria/recetas" className="text-sm font-semibold text-morado hover:underline">← Recetas</Link>
      </div>
      {anulada && <Alert variante="error" titulo="Receta ANULADA">{d.anulada_motivo}. Ya no tiene validez.</Alert>}
      {!d.integra && <Alert variante="error" titulo="El contenido no coincide con su huella">Esta receta cambió después de emitirse. No la uses y avisa al equipo técnico.</Alert>}
      <AccionesReceta
        id={d.id} numero={d.numero} mascota={d.snapshot.mascota.nombre} telefono={d.snapshot.propietario.telefono} negocio={d.snapshot.establecimiento.nombre}
        estado={d.estado} puedeGestionar={puede} archivada={Boolean(d.archivada_at)} conservarHasta={formatearFechaCalendario(d.conservar_hasta)}
      />
      {Array.from({ length: 1 + copias }, (_, i) => (
        <div key={i} className={anulada ? "opacity-60" : ""}>
          <Cuerpo d={d} etiqueta={ETIQUETAS_COPIA[i]} pie={piePagina[i]} />
        </div>
      ))}
      {surtibles.length > 0 && !anulada && puede && (
        <section className="flex flex-col gap-3 print:hidden">
          <h2 className="text-lg font-bold text-n-900">Surtir del inventario</h2>
          <p className="text-sm text-n-600">Estos productos solo salen del inventario contra su receta. Cada salida queda en el lote y en el libro de control.</p>
          {surtibles.map((l) => {
            const prod = productos.find((p) => p.id === l.insumo_id);
            return (
              <div key={l.id} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
                <p className="font-semibold text-n-900">{l.producto} <span className="font-normal text-n-600">· {DOCUMENTOS[l.documento].corta}</span></p>
                <p className="text-sm text-n-600">
                  Surtida {l.surtidos} {l.surtidos === 1 ? "vez" : "veces"}{l.surtidos_max ? ` de ${l.surtidos_max}` : ""} · {l.surtido_cantidad} de {l.cantidad_surtir}{l.cantidad_unidad ? ` ${l.cantidad_unidad}` : ""}
                </p>
                <SurtirDocumento tipo="receta" docId={l.id} lotes={prod?.lotes ?? []} unidad={l.cantidad_unidad} pacientes={[{ perro_id: d.perro_id, nombre: d.snapshot.mascota.nombre }]} />
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
