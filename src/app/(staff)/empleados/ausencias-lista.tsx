import { formatearFechaCalendario, formatearFecha } from "@/lib/formato";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ESTADOS_AUSENCIA, TIPOS_AUSENCIA } from "@/lib/empleados/textos";
import { BotonAccion, Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { aprobarAusencia, cancelarAusencia, rechazarAusencia, solicitarAusencia } from "./ausencias-actions";

export type Ausencia = {
  id: string;
  empleado_id: string;
  tipo: string;
  desde: string;
  hasta: string;
  dias: number;
  motivo: string | null;
  estado: string;
  motivo_revision: string | null;
  revisada_at: string | null;
  created_at: string;
  empleados?: { nombre: string } | null;
};

export const COLUMNAS_AUSENCIA =
  "id, empleado_id, tipo, desde, hasta, dias, motivo, estado, motivo_revision, revisada_at, created_at, empleados(nombre)";

// Una lista de ausencias con lo que quien mira puede hacer: admin aprueba,
// rechaza (con motivo) y cancela una aprobada; quien la pidió cancela la
// suya mientras está por aprobar.
export function ListaAusencias({
  ausencias,
  esAdmin,
  puedeCancelarSolicitadas,
  mostrarNombre = false,
  vacio,
  zona,
}: {
  ausencias: Ausencia[];
  esAdmin: boolean;
  puedeCancelarSolicitadas: boolean;
  mostrarNombre?: boolean;
  vacio: string;
  zona: string;
}) {
  if (ausencias.length === 0) return <p className="text-sm text-n-600">{vacio}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {ausencias.map((a) => {
        const estado = ESTADOS_AUSENCIA[a.estado];
        const rango = a.desde === a.hasta ? formatearFechaCalendario(a.desde) : `${formatearFechaCalendario(a.desde)} al ${formatearFechaCalendario(a.hasta)}`;
        return (
          <li key={a.id} className="flex flex-col gap-2 rounded-md border border-n-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-n-900">
                  {mostrarNombre && a.empleados?.nombre ? `${a.empleados.nombre} · ` : ""}
                  {TIPOS_AUSENCIA[a.tipo] ?? a.tipo} · {rango}
                </p>
                <p className="text-sm text-n-600">
                  {Number(a.dias)} {Number(a.dias) === 1 ? "día" : "días"} que le tocaba trabajar · pedida el {formatearFecha(a.created_at, zona)}
                  {a.motivo && ` · «${a.motivo}»`}
                </p>
                {a.motivo_revision && <p className="text-sm text-n-600">Nota de la revisión: {a.motivo_revision}</p>}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estado?.estilo ?? ""}`}>{estado?.etiqueta ?? a.estado}</span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {esAdmin && a.estado === "solicitada" && (
                <>
                  <BotonAccion accion={aprobarAusencia.bind(null, a.id)} texto="Aprobar" variante="exito" textoExito="Aprobada" />
                  <Desplegable texto="Rechazar">
                    <FormularioAccion accion={rechazarAusencia.bind(null, a.id)} textoBoton="Rechazar" variante="peligro">
                      <Textarea label="¿Por qué se rechaza?" name="motivo" rows={2} required />
                    </FormularioAccion>
                  </Desplegable>
                </>
              )}
              {((a.estado === "solicitada" && (esAdmin || puedeCancelarSolicitadas)) || (a.estado === "aprobada" && esAdmin)) && (
                <Desplegable texto="Cancelar">
                  <FormularioAccion accion={cancelarAusencia.bind(null, a.id)} textoBoton="Cancelar ausencia" variante="peligro">
                    <Textarea
                      label="Motivo"
                      name="motivo"
                      rows={2}
                      required
                      ayuda={a.estado === "aprobada" && a.tipo === "vacaciones" ? "Los días regresan a su saldo de vacaciones." : undefined}
                    />
                  </FormularioAccion>
                </Desplegable>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Pedir una ausencia (empleadoId NULL = para quien tiene la sesión).
export function FormularioSolicitarAusencia({ empleadoId, hoy }: { empleadoId: string | null; hoy: string }) {
  return (
    <FormularioAccion accion={solicitarAusencia.bind(null, empleadoId)} textoBoton="Pedir ausencia" textoExito="Solicitud enviada: queda por aprobar" reiniciar>
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Tipo" name="tipo" defaultValue="vacaciones" required>
          {Object.entries(TIPOS_AUSENCIA).map(([clave, etiqueta]) => (
            <option key={clave} value={clave}>
              {etiqueta}
            </option>
          ))}
        </Select>
        <Field label="Desde" name="desde" type="date" defaultValue={hoy} required />
        <Field label="Hasta (incluido)" name="hasta" type="date" ayuda="Vacío si es un solo día." />
      </div>
      <Textarea label="Motivo (opcional)" name="motivo" rows={2} />
    </FormularioAccion>
  );
}
