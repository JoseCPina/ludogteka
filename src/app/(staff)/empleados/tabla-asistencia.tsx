import { formatearDiaSemana, formatearFechaCalendario, horaLocalDeInstante, formatearFecha } from "@/lib/formato";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ESTADOS_DIA, ORIGEN_REGISTRO, TIPOS_AUSENCIA, hora, minutos } from "@/lib/empleados/textos";
import type { DiaAsistencia } from "@/lib/empleados/tipos";
import { Desplegable, FormularioAccion } from "./formulario-accion";
import { corregirAsistencia } from "./asistencia-actions";

export type Correccion = {
  asistencia_id: string;
  entrada_anterior: string | null;
  salida_anterior: string | null;
  entrada_nueva: string | null;
  salida_nueva: string | null;
  motivo: string;
  created_at: string;
};

const h = (i: string | null) => (i ? horaLocalDeInstante(i) : "—");

export function ResumenAsistencia({ dias }: { dias: DiaAsistencia[] }) {
  const cuenta = (e: string) => dias.filter((d) => d.estado === e).length;
  const tarde = dias.reduce((s, d) => s + (d.estado === "retardo" ? d.minutos_retardo ?? 0 : 0), 0);
  const cifras = [
    { etiqueta: "Días trabajados", valor: cuenta("a_tiempo") + cuenta("retardo") + cuenta("extra") },
    { etiqueta: "Retardos", valor: cuenta("retardo"), sub: tarde ? `${minutos(tarde)} en total` : undefined },
    { etiqueta: "Faltas", valor: cuenta("falta") },
    { etiqueta: "Ausencias aprobadas", valor: cuenta("ausencia") },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cifras.map((c) => (
        <div key={c.etiqueta} className="rounded-lg border border-n-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-n-500">{c.etiqueta}</p>
          <p className="mt-1 text-2xl font-bold text-n-900">{c.valor}</p>
          {c.sub && <p className="text-xs text-n-500">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// Día por día, del más reciente al más viejo. Admin corrige con motivo; la
// corrección deja el valor original a la vista.
export function TablaAsistencia({
  dias,
  empleadoId,
  puedeCorregir,
  correcciones,
}: {
  dias: DiaAsistencia[];
  empleadoId: string;
  puedeCorregir: boolean;
  correcciones: Correccion[];
}) {
  const visibles = [...dias].reverse().filter((d) => d.estado !== "descanso" || d.asistencia_id);
  if (visibles.length === 0) return <p className="text-sm text-n-600">No hay días que le tocara trabajar en este periodo.</p>;
  return (
    <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
      {visibles.map((d) => {
        const estado = ESTADOS_DIA[d.estado];
        const suyas = correcciones.filter((c) => c.asistencia_id === d.asistencia_id);
        return (
          <li key={d.fecha} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-semibold text-n-900">
                  {formatearDiaSemana(d.fecha)} {formatearFechaCalendario(d.fecha)}
                </span>
                <span className="text-sm text-n-600">
                  {d.hora_entrada_prog ? `Horario ${hora(d.hora_entrada_prog)}–${hora(d.hora_salida_prog)}` : "No le tocaba"}
                  {d.entrada_at && ` · entró ${h(d.entrada_at)}${d.salida_at ? `, salió ${h(d.salida_at)}` : ", sin salida"}`}
                </span>
                {d.entrada_at && (
                  <span className="text-xs text-n-500">
                    Entrada {ORIGEN_REGISTRO[d.entrada_origen ?? ""] ?? ""}
                    {d.salida_origen && ` · salida ${ORIGEN_REGISTRO[d.salida_origen] ?? ""}`}
                    {d.corregida && " · corregido por admin"}
                  </span>
                )}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estado?.estilo ?? ""}`}>
                {d.estado === "ausencia" ? TIPOS_AUSENCIA[d.ausencia_tipo ?? ""] ?? "Ausencia" : estado?.etiqueta ?? d.estado}
                {d.estado === "retardo" && ` · ${minutos(d.minutos_retardo)}`}
              </span>
            </div>
            {suyas.length > 0 && (
              <ul className="rounded-md bg-n-50 px-3 py-2 text-xs text-n-600">
                {suyas.map((c) => (
                  <li key={c.created_at}>
                    {formatearFecha(c.created_at)}: {c.entrada_anterior || c.salida_anterior ? `antes ${h(c.entrada_anterior)}–${h(c.salida_anterior)}` : "no había registro"}
                    {" → "}
                    {c.entrada_nueva ? `${h(c.entrada_nueva)}–${h(c.salida_nueva)}` : "anulado"} · «{c.motivo}»
                  </li>
                ))}
              </ul>
            )}
            {puedeCorregir && d.estado !== "programado" && (
              <div>
                <Desplegable texto={d.asistencia_id ? "Corregir" : "Capturar asistencia"}>
                  <FormularioAccion accion={corregirAsistencia.bind(null, empleadoId, d.fecha)} textoBoton="Guardar corrección">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Entrada" name="entrada" type="time" defaultValue={d.entrada_at ? h(d.entrada_at) : ""} ayuda="Vacía para anular el registro del día." />
                      <Field label="Salida" name="salida" type="time" defaultValue={d.salida_at ? h(d.salida_at) : ""} />
                    </div>
                    <Textarea label="Motivo (queda en el registro)" name="motivo" rows={2} required />
                  </FormularioAccion>
                </Desplegable>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
