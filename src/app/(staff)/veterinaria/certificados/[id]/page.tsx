import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { BotonImprimirPagina } from "@/components/boton-imprimir";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { FormularioAccion, Desplegable } from "@/components/formulario-accion";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";
import { formatearFechaCalendario } from "@/lib/formato";
import { ETIQUETA_MOTIVO_CERTIFICADO, TIPOS_DESPARASITACION } from "@/lib/veterinaria/carnet";
import { anularCertificado } from "../../carnet/actions";

type Snapshot = {
  establecimiento: { nombre: string; ciudad: string | null; aviso_funcionamiento: string | null; aviso_fecha: string | null; mvra: string | null; mvra_cedula: string | null };
  medico: { nombre: string; cedula: string; cpa: string | null };
  mascota: { nombre: string; especie: string | null; raza: string | null; sexo: string | null; esterilizado: boolean | null; fecha_nacimiento: string | null; microchip: string | null; peso_kg: number | null };
  propietario: { nombre: string };
  vacunas: { biologico: string; fecha_aplicacion: string; vigente_hasta: string; lote: string | null }[];
  desparasitaciones: { producto: string; tipo: string; fecha_aplicacion: string; vigente_hasta: string }[];
};

// El certificado se imprime SOLO de su foto (snapshot): lo que decía al emitirse, aunque el carnet cambie después.
export default async function Certificado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: c }, puede] = await Promise.all([
    supabase.from("certificados_salud").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    vetPuede(supabase, "emitir_certificados"),
  ]);
  if (!c) notFound();
  const s = c.snapshot as Snapshot;
  const anulado = c.estado === "anulado";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/veterinaria/certificados" className="text-sm font-semibold text-morado hover:underline">← Certificados</Link>
        <BotonImprimirPagina />
      </div>
      {anulado && (
        <Alert variante="error" titulo="Certificado ANULADO">
          {c.anulado_motivo as string}. Ya no tiene validez.
        </Alert>
      )}
      <article className={`flex flex-col gap-5 rounded-lg border border-n-200 bg-white p-6 print:border-0 print:p-0 ${anulado ? "opacity-70" : ""}`}>
        <EncabezadoNegocio />
        <header className="text-center">
          <h1 className="text-2xl font-bold uppercase tracking-wide text-n-900">Certificado de salud</h1>
          <p className="text-sm text-n-600">N.º {c.numero as number}{c.folio_medico ? ` · folio ${c.folio_medico}` : ""} · {ETIQUETA_MOTIVO_CERTIFICADO[c.motivo as string] ?? c.motivo}</p>
          {c.destino ? <p className="text-sm text-n-600">Destino: {c.destino as string}</p> : null}
        </header>
        <p className="leading-relaxed text-n-800">
          El(la) suscrito(a) <strong>{s.medico.nombre}</strong>, médico(a) veterinario(a) con cédula profesional <strong>{s.medico.cedula}</strong>
          {s.medico.cpa ? <> (CPA {s.medico.cpa})</> : null}, hace constar que examinó a la mascota descrita abajo, propiedad de <strong>{s.propietario.nombre}</strong>, y encontró lo siguiente.
        </p>
        <section className="grid gap-x-6 gap-y-1 rounded-md border border-n-200 p-3 text-sm sm:grid-cols-2">
          <p><span className="text-n-500">Nombre:</span> <strong>{s.mascota.nombre}</strong></p>
          <p><span className="text-n-500">Especie:</span> {s.mascota.especie === "gato" ? "Gato" : s.mascota.especie === "otro" ? "Otra" : "Perro"}</p>
          <p><span className="text-n-500">Raza:</span> {s.mascota.raza ?? "—"}</p>
          <p><span className="text-n-500">Sexo:</span> {s.mascota.sexo ?? "—"}{s.mascota.esterilizado ? " · esterilizado(a)" : ""}</p>
          <p><span className="text-n-500">Nacimiento:</span> {s.mascota.fecha_nacimiento ? formatearFechaCalendario(s.mascota.fecha_nacimiento) : "—"}</p>
          <p><span className="text-n-500">Peso:</span> {s.mascota.peso_kg ? `${s.mascota.peso_kg} kg` : "—"}</p>
          <p className="sm:col-span-2"><span className="text-n-500">Microchip:</span> {s.mascota.microchip ?? "—"}</p>
        </section>
        <section>
          <h2 className="mb-1 font-bold text-n-900">Exploración física</h2>
          <p className="whitespace-pre-line text-n-800">{c.exploracion as string}</p>
          {c.observaciones ? <p className="mt-2 whitespace-pre-line text-sm text-n-700"><strong>Observaciones:</strong> {c.observaciones as string}</p> : null}
        </section>
        <section>
          <h2 className="mb-1 font-bold text-n-900">Vacunas vigentes al emitir</h2>
          {s.vacunas.length === 0 ? <p className="text-sm text-n-600">Sin vacunas vigentes registradas.</p> : (
            <ul className="text-sm text-n-800">
              {s.vacunas.map((v, i) => (
                <li key={i}>{v.biologico} — aplicada el {formatearFechaCalendario(v.fecha_aplicacion)}{v.lote ? `, lote ${v.lote}` : ""}, vigente hasta {formatearFechaCalendario(v.vigente_hasta)}</li>
              ))}
            </ul>
          )}
          {s.desparasitaciones.length > 0 && (
            <>
              <h2 className="mb-1 mt-3 font-bold text-n-900">Desparasitaciones vigentes</h2>
              <ul className="text-sm text-n-800">
                {s.desparasitaciones.map((d, i) => (
                  <li key={i}>{d.producto} ({TIPOS_DESPARASITACION[d.tipo]?.toLowerCase()}) — {formatearFechaCalendario(d.fecha_aplicacion)}, vigente hasta {formatearFechaCalendario(d.vigente_hasta)}</li>
                ))}
              </ul>
            </>
          )}
        </section>
        <p className="text-sm text-n-800">
          Emitido el {formatearFechaCalendario(c.fecha_emision as string)}{s.establecimiento.ciudad ? ` en ${s.establecimiento.ciudad}` : ""}. <strong>Vigente hasta el {formatearFechaCalendario(c.vigente_hasta as string)}.</strong>
        </p>
        <footer className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="text-center">
            <div className="mb-1 h-14 border-b border-n-500" />
            <p className="text-sm font-semibold text-n-900">{s.medico.nombre}</p>
            <p className="text-xs text-n-600">Médico(a) veterinario(a) · Cédula profesional {s.medico.cedula}</p>
          </div>
          <div className="text-center text-xs text-n-600">
            <p className="font-semibold text-n-900">{s.establecimiento.nombre}</p>
            {s.establecimiento.aviso_funcionamiento ? <p>Aviso de funcionamiento SENASICA: {s.establecimiento.aviso_funcionamiento}</p> : null}
            {s.establecimiento.mvra ? <p>MVRA: {s.establecimiento.mvra}{s.establecimiento.mvra_cedula ? ` (céd. ${s.establecimiento.mvra_cedula})` : ""}</p> : null}
          </div>
        </footer>
      </article>
      {puede && !anulado && (
        <div className="print:hidden">
          <Desplegable texto="Anular este certificado" variante="secundario">
            <FormularioAccion accion={(fd) => anularCertificado(id, fd)} textoBoton="Anular certificado" variante="peligro">
              <Textarea label="Motivo de la anulación" name="motivo" rows={2} required ayuda="No se borra: queda anulado con este motivo y tu nombre." />
            </FormularioAccion>
          </Desplegable>
        </div>
      )}
    </div>
  );
}
