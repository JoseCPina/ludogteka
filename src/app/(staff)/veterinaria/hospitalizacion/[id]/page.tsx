import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { cargarMedicos, cargarProductosConLotes, miMedico } from "@/lib/veterinaria/lotes";
import { Alert } from "@/components/ui/alert";
import { Desplegable } from "@/components/formulario-accion";
import { formatearFecha, formatearFechaCalendario, horaLocalDeInstante, horaLocalParaInput } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ETIQUETA_CONSENTIMIENTO, TURNOS_MONITOREO } from "@/lib/veterinaria/carnet";
import { AccionesDosis, FormularioAlta, FormularioCargo, FormularioMedicacion, FormularioMonitoreo, NuevoConsentimiento, SuspenderMedicacion } from "./paneles";

type Dosis = { id: string; programada_at: string; estado: string; aplicada_at: string | null; aplicada_por: string | null; lote: string | null; motivo_omision: string | null; nota: string | null; atrasada: boolean };
type Medicacion = { id: string; producto: string; insumo_id: string | null; dosis: string; via: string | null; frecuencia_horas: number | null; precio_dosis: number | null; indicaciones: string | null; suspendida: boolean; suspendida_motivo: string | null; indico: string; dosis_lista: Dosis[] };
type Detalle = {
  id: string; estado: "ingresado" | "alta"; perro_id: string; reserva_id: string; mascota: string; especie: string | null; dueno: string; telefono: string | null; motivo: string; ubicacion: string | null;
  medico: string; ingreso_at: string; alta_at: string | null; resumen_alta: string | null; precio_dia: number | null; deposito: number; dias: number;
  medicacion: Medicacion[];
  monitoreo: { id: string; registrado_at: string; turno: string; temperatura_c: number | null; peso_kg: number | null; frecuencia_cardiaca: number | null; frecuencia_respiratoria: number | null; notas: string | null; por: string | null }[];
  cargos: { id: string; tipo: string; fecha: string | null; descripcion: string; importe: number; cancelado: boolean }[];
  consentimientos: { id: string; tipo: string; titulo: string; estado: string; procedimiento: string | null; firmado_at: string | null; firmante: string | null }[];
};

const dinero = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const ESTADO_DOSIS: Record<string, string> = { pendiente: "bg-n-100 text-n-700", aplicada: "bg-menta-suave text-menta-oscuro", omitida: "bg-ambar-suave text-ambar-oscuro" };

function Seccion({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-bold text-n-900">{titulo}</h2>
        {nota && <p className="mt-0.5 text-sm text-n-600">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function Hospitalizacion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const [{ data: crudo, error }, puede, medicos, productos, medicoPropio] = await Promise.all([
    supabase.rpc("hospitalizacion_detalle", { p_hosp: id }),
    vetPuede(supabase, "hospitalizar"),
    cargarMedicos(supabase),
    cargarProductosConLotes(supabase),
    miMedico(supabase),
  ]);
  if (error?.message?.includes("no existe")) notFound();
  const d = crudo as Detalle | null;
  if (!d) {
    return <Alert variante="error" titulo="No pudimos cargar la hospitalización">{error?.message ?? "Inténtalo de nuevo."}</Alert>;
  }
  const internada = d.estado === "ingresado";
  const vivos = d.cargos.filter((c) => !c.cancelado);
  const total = vivos.reduce((s, c) => s + Number(c.importe), 0);
  const ahoraLocal = horaLocalParaInput(new Date().toISOString(), zona);
  const atrasadas = d.medicacion.flatMap((m) => m.dosis_lista).filter((x) => x.atrasada).length;
  const consentimientoHosp = d.consentimientos.find((c) => c.tipo === "hospitalizacion" && c.estado !== "cancelado");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/veterinaria/hospitalizacion" className="text-sm font-semibold text-morado hover:underline">← Hospitalización</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-n-900">
              {d.mascota} <span className={`ml-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${internada ? "bg-ambar-suave text-ambar-oscuro" : "bg-menta-suave text-menta-oscuro"}`}>{internada ? `Internada · día ${d.dias}` : "Dada de alta"}</span>
            </h1>
            <p className="mt-1 text-n-700">
              {d.motivo} · Dueño: {d.dueno}
              {d.telefono ? ` (${d.telefono})` : ""}
              {d.ubicacion ? ` · ${d.ubicacion}` : ""}
            </p>
            <p className="text-sm text-n-600">
              Ingresó el {formatearFecha(d.ingreso_at, zona)} {horaLocalDeInstante(d.ingreso_at, zona)} · Responsable: {d.medico}
              {d.alta_at ? ` · Alta el ${formatearFecha(d.alta_at, zona)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/caja/cobrar/${d.reserva_id}`} className="inline-flex min-h-10 items-center rounded-md bg-menta px-4 text-sm font-semibold text-morado hover:bg-menta-hover">
              Ver cuenta / cobrar
            </Link>
            <Link href={`/veterinaria/carnet/${d.perro_id}`} className="inline-flex min-h-10 items-center rounded-md border-[1.5px] border-borde bg-white px-4 text-sm font-semibold text-n-900 hover:bg-n-100">
              Carnet
            </Link>
          </div>
        </div>
      </div>

      {!puede && <Alert variante="info" titulo="Solo consulta">Hospitalizar y medicar es de un médico veterinario o de quien tenga el permiso «Hospitalizar y medicar».</Alert>}
      {internada && atrasadas > 0 && (
        <Alert variante="advertencia" titulo={atrasadas === 1 ? "Hay 1 dosis atrasada" : `Hay ${atrasadas} dosis atrasadas`}>
          Revisa la hoja de medicación: las atrasadas salen marcadas en ámbar.
        </Alert>
      )}
      {internada && !consentimientoHosp && puede && (
        <Alert variante="advertencia" titulo="Falta el consentimiento de hospitalización">
          Crea el consentimiento más abajo y que el propietario lo firme.
        </Alert>
      )}
      {!internada && d.resumen_alta && (
        <Alert variante="exito" titulo="Resumen del alta">
          {d.resumen_alta}
        </Alert>
      )}

      <Seccion titulo="Cuenta de la hospitalización" nota="Todo lo que se va cargando cuelga de una cuenta que se cobra en Caja, sola o junto con otras cuentas de la misma persona.">
        {d.cargos.length === 0 ? (
          <p className="text-n-700">Todavía no hay cargos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-n-200 text-sm">
            {d.cargos.map((c) => (
              <li key={c.id} className={`flex items-baseline justify-between gap-3 py-1.5 ${c.cancelado ? "text-n-400 line-through" : "text-n-800"}`}>
                <span>{c.descripcion}{c.tipo === "deposito" && c.cancelado ? " (aplicado a la cuenta)" : ""}</span>
                <span className="tabular-nums">{dinero(Number(c.importe))}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-baseline justify-between border-t border-n-200 pt-2 font-bold text-n-900">
          <span>Total de la cuenta</span>
          <span className="tabular-nums">{dinero(total)}</span>
        </p>
        {Number(d.deposito) > 0 && <p className="text-sm text-n-600">Depósito inicial: {dinero(Number(d.deposito))}. {internada ? "Se aplica a la cuenta al dar el alta." : "Ya se aplicó a la cuenta."}</p>}
        {puede && internada && (
          <Desplegable texto="Agregar un procedimiento o cargo">
            <FormularioCargo hospId={d.id} />
          </Desplegable>
        )}
      </Seccion>

      <Seccion titulo="Hoja de medicación" nota="Cada dosis queda con quién la aplicó y cuándo. Si lleva lote, se descuenta del inventario clínico.">
        {d.medicacion.length === 0 ? (
          <p className="text-n-700">No hay medicación indicada.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {d.medicacion.map((m) => (
              <div key={m.id} className={`rounded-md border p-3 ${m.suspendida ? "border-n-200 bg-n-50 opacity-80" : "border-n-200"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold text-n-900">
                    {m.producto} <span className="font-normal text-n-600">· {m.dosis}{m.via ? ` · ${m.via}` : ""}{m.frecuencia_horas ? ` · cada ${m.frecuencia_horas} h` : ""}</span>
                  </p>
                  {m.suspendida && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Suspendida: {m.suspendida_motivo}</span>}
                </div>
                <p className="text-sm text-n-600">
                  Indicó {m.indico}
                  {m.precio_dosis ? ` · ${dinero(Number(m.precio_dosis))} por dosis` : ""}
                  {m.indicaciones ? ` · ${m.indicaciones}` : ""}
                </p>
                <ul className="mt-2 flex flex-col gap-2">
                  {m.dosis_lista.map((x) => (
                    <li key={x.id} className={`flex flex-col gap-1.5 rounded-md px-2 py-1.5 ${x.atrasada ? "bg-ambar-suave" : "bg-white"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-n-900">
                          {formatearFecha(x.programada_at, zona)} {horaLocalDeInstante(x.programada_at, zona)}
                        </span>
                        <span className="flex items-center gap-2">
                          {x.atrasada && <span className="text-xs font-bold text-ambar-oscuro">ATRASADA</span>}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_DOSIS[x.estado]}`}>{x.estado === "pendiente" ? "Pendiente" : x.estado === "aplicada" ? "Aplicada" : "No aplicada"}</span>
                        </span>
                      </div>
                      {x.estado === "aplicada" && (
                        <p className="text-xs text-n-600">
                          La aplicó {x.aplicada_por ?? "—"} el {x.aplicada_at ? `${formatearFecha(x.aplicada_at, zona)} ${horaLocalDeInstante(x.aplicada_at, zona)}` : ""}
                          {x.lote ? ` · lote ${x.lote}` : ""}
                          {x.nota ? ` · ${x.nota}` : ""}
                        </p>
                      )}
                      {x.estado === "omitida" && <p className="text-xs text-n-600">{x.motivo_omision}</p>}
                      {puede && internada && !m.suspendida && x.estado === "pendiente" && <AccionesDosis hospId={d.id} dosisId={x.id} insumoId={m.insumo_id} productos={productos} />}
                    </li>
                  ))}
                </ul>
                {puede && internada && !m.suspendida && m.dosis_lista.some((x) => x.estado === "pendiente") && (
                  <div className="mt-2">
                    <SuspenderMedicacion hospId={d.id} medicacionId={m.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {puede && internada && (
          <Desplegable texto="Indicar medicación" variante="primario">
            <FormularioMedicacion hospId={d.id} productos={productos} medicos={medicos} medicoPropio={medicoPropio} ahoraLocal={ahoraLocal} />
          </Desplegable>
        )}
      </Seccion>

      <Seccion titulo="Monitoreo" nota="Temperatura, peso, frecuencias y notas por turno. Un registro no se edita: agrega otro.">
        {d.monitoreo.length === 0 ? (
          <p className="text-n-700">Todavía no hay registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-n-300 text-n-600">
                  <th className="py-1.5 pr-2">Cuándo</th>
                  <th className="py-1.5 pr-2">Turno</th>
                  <th className="py-1.5 pr-2">Temp.</th>
                  <th className="py-1.5 pr-2">Peso</th>
                  <th className="py-1.5 pr-2">FC / FR</th>
                  <th className="py-1.5">Notas</th>
                </tr>
              </thead>
              <tbody>
                {d.monitoreo.map((m) => (
                  <tr key={m.id} className="border-b border-n-100 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatearFecha(m.registrado_at, zona)} {horaLocalDeInstante(m.registrado_at, zona)}</td>
                    <td className="py-1.5 pr-2">{TURNOS_MONITOREO[m.turno]}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{m.temperatura_c !== null ? `${m.temperatura_c} °C` : "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{m.peso_kg !== null ? `${m.peso_kg} kg` : "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{m.frecuencia_cardiaca ?? "—"} / {m.frecuencia_respiratoria ?? "—"}</td>
                    <td className="py-1.5">{m.notas ?? ""}{m.por ? <span className="block text-xs text-n-500">{m.por}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puede && internada && (
          <Desplegable texto="Registrar monitoreo" variante="primario">
            <FormularioMonitoreo hospId={d.id} />
          </Desplegable>
        )}
      </Seccion>

      <Seccion titulo="Consentimientos informados" nota="Hospitalización, cirugía, anestesia y eutanasia. El propietario los firma en el mostrador.">
        {d.consentimientos.length === 0 ? (
          <p className="text-n-700">Todavía no hay consentimientos de esta hospitalización.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-n-200 text-sm">
            {d.consentimientos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/veterinaria/consentimientos/${c.id}`} className="font-semibold text-morado hover:underline">
                  {ETIQUETA_CONSENTIMIENTO[c.tipo]}{c.procedimiento ? ` — ${c.procedimiento}` : ""}
                </Link>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.estado === "firmado" ? "bg-menta-suave text-menta-oscuro" : c.estado === "cancelado" ? "bg-n-100 text-n-600" : "bg-ambar-suave text-ambar-oscuro"}`}>
                  {c.estado === "firmado" ? `Firmado${c.firmado_at ? ` el ${formatearFechaCalendario(c.firmado_at.slice(0, 10))}` : ""}` : c.estado === "cancelado" ? "Cancelado" : "Pendiente de firma"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {puede && (
          <Desplegable texto="Crear un consentimiento" variante="secundario">
            <NuevoConsentimiento perroId={d.perro_id} hospId={d.id} medicos={medicos} medicoPropio={medicoPropio} />
          </Desplegable>
        )}
      </Seccion>

      {puede && internada && (
        <Seccion titulo="Alta">
          <FormularioAlta hospId={d.id} />
        </Seccion>
      )}
    </div>
  );
}
