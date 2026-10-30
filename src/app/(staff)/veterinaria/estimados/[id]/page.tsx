import Link from "next/link";
import { EnlaceOTexto } from "@/components/acceso-contexto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { formatearFecha, formatearFechaCalendario, hoyNegocio, unidadSegunCantidad } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ESTADOS_ESTIMADO, TIPOS_LINEA, dinero, totalLinea, type DetalleEstimado, type MedicoVet } from "@/lib/veterinaria/expediente";
import { opcionesDeEstimado } from "../../expediente/actions";
import { EditorEstimado } from "../editor-estimado";
import { AceptarEnMostrador, CancelarEstimado, EnviarEstimado, VersionNueva } from "../acciones-estimado";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";

export default async function DetalleEstimadoPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const sesion = await obtenerSesionConRol();
  const { data, error } = await supabase.rpc("vet_estimado_detalle", { p_id: id });
  if (error || !data) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Link href="/veterinaria/estimados" className="text-sm font-semibold text-morado hover:underline">← Estimados</Link>
        <Alert variante="advertencia" titulo="No pudimos abrir el estimado">No existe o no tienes acceso. Los estimados son de un médico veterinario, de admin o de quien tenga «Crear estimados».</Alert>
      </div>
    );
  }
  const d = data as DetalleEstimado;
  const e = d.estimado;
  const [{ data: puede }, { data: medicosCrudo }, { data: miMedico }] = await Promise.all([
    supabase.rpc("vet_puede", { p_permiso: "crear_estimados" }),
    supabase.rpc("vet_medicos_lista"),
    supabase.rpc("vet_mi_medico"),
  ]);
  const puedeEditar = puede === true;
  const est = ESTADOS_ESTIMADO[e.estado] ?? { etiqueta: e.estado, estilo: "bg-n-100" };
  const ultima = d.versiones[d.versiones.length - 1]?.id === e.id;

  const encabezado = (
    <div>
      <Link href={`/veterinaria/expediente/${e.perro_id}`} className="text-sm font-semibold text-morado hover:underline">← Expediente de {d.mascota.nombre}</Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-n-900">{e.titulo}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${d.vencido ? "bg-coral-suave text-coral-oscuro" : est.estilo}`}>{d.vencido ? "Vencido" : est.etiqueta}</span>
        <span className="text-sm text-n-600">versión {e.version}</span>
      </div>
      <p className="text-n-700">{d.mascota.nombre} · de {d.dueno.nombre}{d.dueno.telefono ? ` · ${d.dueno.telefono}` : ""}</p>
    </div>
  );

  if (e.estado === "borrador" && puedeEditar) {
    return (
      <div className="flex flex-col gap-5">
        {encabezado}
        <EditorEstimado
          id={e.id}
          perroId={e.perro_id}
          consultaId={e.consulta_id}
          inicial={{ tipo: e.tipo, titulo: e.titulo, notas: e.notas ?? "", vigente_hasta: e.vigente_hasta, medico_id: e.medico_id, lineas: d.lineas }}
          medicos={(medicosCrudo ?? []) as MedicoVet[]}
          medicoPropio={(miMedico as string | null) ?? null}
          insumos={await opcionesDeEstimado()}
          hoy={hoyNegocio(zona)}
        />
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Listo para el dueño</h2>
          <p className="text-n-700">Guarda tus cambios y entonces envíalo: al enviarlo, el contenido queda congelado (cambiarlo es hacer una versión nueva).</p>
          <div className="flex flex-wrap items-start gap-3">
            <EnviarEstimado id={e.id} telefono={d.dueno.telefono} mascota={d.mascota.nombre} titulo={e.titulo} yaEnviado={false} />
            <AceptarEnMostrador id={e.id} />
            <CancelarEstimado id={e.id} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {encabezado}
      {!d.integro && <Alert variante="error" titulo="El contenido no coincide con lo que se envió">Haz una versión nueva antes de mandarlo otra vez.</Alert>}
      {e.estado === "aceptado" && (
        <Alert variante="exito" titulo={`Aceptado por ${e.aceptado_nombre}`}>
          {e.aceptado_via === "liga" ? "Por la liga" : "En el mostrador"}, el {e.aceptado_at ? formatearFecha(e.aceptado_at, zona) : ""}. El mínimo de cada línea ya está en la cuenta de la mascota: se cobra en <EnlaceOTexto href="/caja" className="font-semibold underline">Caja</EnlaceOTexto>.
        </Alert>
      )}
      {e.estado === "rechazado" && <Alert variante="advertencia" titulo="El dueño lo rechazó">{e.rechazo_motivo ? `Motivo: ${e.rechazo_motivo}` : "No dejó motivo."} Puedes hacer una versión nueva.</Alert>}
      {e.estado === "cancelado" && <Alert variante="info" titulo="Estimado cancelado">Motivo: {e.cancelado_motivo}</Alert>}
      {e.estado === "reemplazado" && <Alert variante="info" titulo="Reemplazado por una versión más nueva">Su liga ya no sirve.</Alert>}

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <TablaResponsiva className="w-full text-sm">
          <thead>
            <tr className="text-left text-n-500"><th className="py-1">Concepto</th><th>Cant.</th><th className="text-right">Mínimo</th><th className="text-right">Máximo</th></tr>
          </thead>
          <tbody>
            {d.lineas.map((l, i) => {
              const t = totalLinea(l);
              return (
                <tr key={i} className="border-t border-n-100">
                  <td className="py-1.5"><span className="text-xs font-semibold text-n-500">{TIPOS_LINEA[l.tipo]}</span><br />{l.descripcion}</td>
                  <td>{l.cantidad}{l.unidad ? ` ${unidadSegunCantidad(l.cantidad, l.unidad)}` : ""}</td>
                  <td className="text-right">{dinero(t.min)}</td>
                  <td className="text-right">{dinero(t.max)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-n-300 font-bold text-n-900"><td className="py-2" colSpan={2}>Total estimado</td><td className="text-right">{dinero(e.total_min)}</td><td className="text-right">{dinero(e.total_max)}</td></tr>
          </tfoot>
        </TablaResponsiva>
        {e.notas && <p className="mt-3 whitespace-pre-wrap text-n-700">{e.notas}</p>}
        <p className="mt-3 text-sm text-n-600">Vigente hasta {formatearFechaCalendario(e.vigente_hasta)}{d.medico ? ` · ${d.medico.nombre}, cédula ${d.medico.cedula}` : ""}</p>
        {d.tiene_firma && d.firma_png && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.firma_png} alt={`Firma de ${e.aceptado_nombre}`} className="mt-3 h-24 rounded border border-n-200 bg-white" />
        )}
      </section>

      {d.versiones.length > 1 && (
        <section className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Versiones</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {d.versiones.map((v) => (
              <li key={v.id}>
                <Link href={`/veterinaria/estimados/${v.id}`} className={`font-semibold ${v.id === e.id ? "text-n-900" : "text-morado hover:underline"}`}>Versión {v.version}</Link>{" "}
                <span className="text-n-600">· {ESTADOS_ESTIMADO[v.estado]?.etiqueta ?? v.estado} · {dinero(v.total_min)} – {dinero(v.total_max)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap items-start gap-3">
          {e.estado === "enviado" && !d.vencido && (
            <>
              <EnviarEstimado id={e.id} telefono={d.dueno.telefono} mascota={d.mascota.nombre} titulo={e.titulo} yaEnviado />
              <AceptarEnMostrador id={e.id} />
            </>
          )}
          {(e.estado === "enviado" || e.estado === "rechazado") && ultima && <VersionNueva id={e.id} />}
          {e.estado === "enviado" && <CancelarEstimado id={e.id} />}
          {e.estado === "aceptado" && d.cuenta && (sesion?.rol === "admin" || sesion?.rol === "recepcion") && <Link href={`/caja/cobrar/${d.cuenta.reserva_id}`} className="inline-flex min-h-12 items-center rounded-md bg-morado px-5 font-semibold text-white hover:opacity-90">Cobrar en Caja</Link>}
        </div>
      )}
    </div>
  );
}
