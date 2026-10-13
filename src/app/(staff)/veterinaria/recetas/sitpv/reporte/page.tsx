import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { BotonImprimirPagina } from "@/components/boton-imprimir";
import { FormularioAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario, unidadSegunCantidad } from "@/lib/formato";
import { nombreMes, type ReporteSitpv } from "@/lib/veterinaria/recetas";
import { marcarReporte } from "../../actions";

// El reporte mensual de un médico, en el orden que pide el SITPV: folios usados, cancelados (en ceros),
// parcialidades y pacientes. Se captura en el SITPV y aquí se marca como reportado.
export default async function ReporteMensual({ searchParams }: { searchParams: Promise<{ medico?: string; periodo?: string }> }) {
  const { medico, periodo } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const puede = await vetPuede(supabase, "registrar_recetas_sitpv");
  const valido = medico && /^[0-9a-f-]{36}$/.test(medico) && periodo && /^\d{4}-\d{2}-\d{2}$/.test(periodo);
  const { data, error } = valido && puede ? await supabase.rpc("vet_sitpv_reporte", { p_medico: medico, p_periodo: periodo }) : { data: null, error: null };
  const r = data as ReporteSitpv | null;
  const mesActual = new Date().toISOString().slice(0, 8) + "01";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="print:hidden">
        <Link href="/veterinaria/recetas/sitpv" className="text-sm font-semibold text-morado hover:underline">← Registro SITPV</Link>
      </div>
      {!puede ? (
        <Alert variante="advertencia" titulo="Esto es de un médico veterinario">Pídele a un admin el permiso «Registrar recetas SITPV».</Alert>
      ) : !r || error ? (
        <Alert variante="error" titulo="No encontramos ese reporte">Vuelve a Registro SITPV y elige el mes desde ahí.</Alert>
      ) : (
        <>
          <header>
            <h1 className="text-2xl font-bold text-n-900">Reporte mensual del SITPV · {nombreMes(r.periodo)}</h1>
            <p className="text-n-700">{r.medico} · cédula {r.cedula} · CPA {r.cpa ?? "sin capturar"}</p>
            {r.reportado ? (
              <p className="mt-2 rounded-md bg-menta-suave px-3 py-2 text-menta-oscuro">Reportado en el SITPV el {formatearFechaCalendario(r.reportado.at.slice(0, 10))}{r.reportado.por ? ` por ${r.reportado.por}` : ""}{r.reportado.nota ? ` · ${r.reportado.nota}` : ""}.</p>
            ) : r.periodo >= mesActual ? (
              <p className="mt-2 rounded-md bg-n-100 px-3 py-2 text-n-700">Este mes todavía no termina: se reporta cuando acaba.</p>
            ) : (
              <p className="mt-2 rounded-md bg-ambar-suave px-3 py-2 text-ambar-oscuro">Todavía no está marcado como reportado en el SITPV.</p>
            )}
          </header>

          <section>
            <h2 className="mb-2 text-lg font-bold text-n-900">Folios usados ({r.usados.length})</h2>
            {r.usados.length === 0 ? <p className="text-n-600">Ninguno este mes.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-n-500"><th>Folio</th><th>Fecha</th><th>Producto</th><th>Registro SENASICA</th><th>Paciente</th><th className="text-right">Cantidad</th></tr></thead>
                <tbody>
                  {r.usados.map((u) => (
                    <tr key={u.id} className="border-t border-n-200"><td className="font-semibold">{u.folio}</td><td>{formatearFechaCalendario(u.fecha)}</td><td>{u.producto}</td><td>{u.registro_senasica}</td><td>{u.paciente}</td><td className="text-right">{u.cantidad_total}{u.unidad ? ` ${unidadSegunCantidad(u.cantidad_total, u.unidad)}` : ""}{u.parcialidades ? " (parc.)" : ""}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-n-900">Folios cancelados, en ceros ({r.cancelados.length})</h2>
            {r.cancelados.length === 0 ? <p className="text-n-600">Ninguno este mes.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-n-500"><th>Folio</th><th>Fecha</th><th className="text-right">Cantidad</th><th>Observación</th></tr></thead>
                <tbody>
                  {r.cancelados.map((c) => (
                    <tr key={c.id} className="border-t border-n-200"><td className="font-semibold">{c.folio}</td><td>{formatearFechaCalendario(c.fecha)}</td><td className="text-right">0</td><td>{c.observacion}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-n-900">Parcialidades ({r.parcialidades.length})</h2>
            {r.parcialidades.length === 0 ? <p className="text-n-600">Ninguna este mes.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-n-500"><th>Folio</th><th>Fecha</th><th>Producto</th><th>Paciente</th><th className="text-right">Cantidad</th></tr></thead>
                <tbody>
                  {r.parcialidades.map((p, i) => (
                    <tr key={i} className="border-t border-n-200"><td className="font-semibold">{p.folio}</td><td>{formatearFechaCalendario(p.fecha)}</td><td>{p.producto}</td><td>{p.paciente}</td><td className="text-right">{p.cantidad}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="mb-1 text-lg font-bold text-n-900">Pacientes ({r.pacientes.length})</h2>
            <p className="text-n-700">{r.pacientes.length ? r.pacientes.join(", ") : "Ninguno este mes."}</p>
          </section>

          <div className="flex flex-col gap-3 print:hidden">
            <BotonImprimirPagina texto="Imprimir o guardar PDF" />
            {!r.reportado && r.periodo < mesActual && (
              <FormularioAccion accion={marcarReporte.bind(null, medico as string, r.periodo)} textoBoton="Ya lo reporté en el SITPV" textoExito="Marcado como reportado" className="max-w-xl rounded-lg border border-n-200 bg-white p-4">
                <p className="text-sm text-n-600">Captura estos datos en el SITPV y luego marca el mes. Queda guardado quién lo marcó y cuándo.</p>
                <Field label="Nota (opcional)" name="nota" placeholder="Folio de acuse, si te lo dieron" />
              </FormularioAccion>
            )}
          </div>
        </>
      )}
    </div>
  );
}
