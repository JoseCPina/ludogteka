"use client";

import { useMemo, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { BuscadorClientes } from "@/components/buscador-clientes";
import type { ClienteBuscable } from "@/lib/clientes/buscables";
import { hoyNegocio } from "@/lib/formato";
import { crearCita } from "../agenda-actions";

type Perro = { id: string; cliente_id: string; nombre: string };
type Servicio = {
  id: string;
  nombre: string;
  // Si este servicio tiene capturado un precio alternativo para pelo
  // maltratado en algún grupo. Lo resuelve la pantalla, no el formulario.
  tiene_precio_maltratado?: boolean;
};
type Empleado = { id: string; nombre_completo: string | null };
type EstanciaEnCurso = { id: string; perroId: string; servicioNombre: string };

// datetime-local no trae huso horario — se ancla explícito a -06:00 (San
// Luis Potosí, sin horario de verano) en vez de confiar en la del
// navegador. Mismo cuidado del barrido de zona horaria, aplicado aquí
// porque es el único punto de la app donde el staff teclea una hora.
function localAUtc(valorDatetimeLocal: string): string {
  return new Date(`${valorDatetimeLocal}:00-06:00`).toISOString();
}

export function AgendarForm({
  clientes,
  perros,
  servicios,
  empleados,
  estanciasEnCurso,
  rolActual,
  userIdActual,
}: {
  clientes: ClienteBuscable[];
  perros: Perro[];
  servicios: Servicio[];
  empleados: Empleado[];
  estanciasEnCurso: EstanciaEnCurso[];
  rolActual: string;
  userIdActual: string;
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [perroId, setPerroId] = useState("");
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [empleadoId, setEmpleadoId] = useState(rolActual === "estetica" ? userIdActual : empleados[0]?.id ?? "");
  const [fechaHora, setFechaHora] = useState(`${hoyNegocio()}T10:00`);
  const [estanciaId, setEstanciaId] = useState("");
  const [peloMaltratado, setPeloMaltratado] = useState(false);
  const enviando = useEspera();
  const [error, setError] = useState<string | null>(null);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(() => perros.filter((p) => p.cliente_id === clienteId), [perros, clienteId]);
  const estanciasDelPerro = estanciasEnCurso.filter((e) => e.perroId === perroId);

  async function enviar() {
    if (!perroId) {
      setError("Elige un perro.");
      return;
    }
    setError(null);
    const res = await enviando.ejecutar(() => crearCita({
      perroId,
      servicioId,
      peloMaltratado,
      empleadoId,
      inicio: localAUtc(fechaHora),
      estanciaId: estanciaId || null,
    }));
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push(`/estetica/${res.citaId}`);
  }

  if (!clienteElegido) {
    return (
      <div className="flex flex-col gap-4">
        <BuscadorClientes clientes={clientes} onElegir={(c) => setClienteId(c.id)} autoFocus />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
        <div>
          <p className="text-sm text-n-600">Cliente</p>
          <p className="font-bold text-n-900">{clienteElegido.nombre}</p>
        </div>
        <Button type="button" variante="secundario" onClick={() => setClienteId(null)}>
          Cambiar cliente
        </Button>
      </div>

      {perrosDelCliente.length === 0 ? (
        <Alert variante="advertencia" titulo="Este cliente no tiene perros registrados">
          Da de alta al perro antes de poder agendarle una cita.
        </Alert>
      ) : (
        <>
          <Select label="Perro" value={perroId} onChange={(e) => { setPerroId(e.target.value); setEstanciaId(""); }}>
            <option value="">Elige un perro</option>
            {perrosDelCliente.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>

          {estanciasDelPerro.length > 0 && (
            <Select
              label="¿Ligar a una estancia en curso? (opcional)"
              value={estanciaId}
              onChange={(e) => setEstanciaId(e.target.value)}
              ayuda="El perro ya está adentro — esta cita no genera una entrada/salida aparte."
            >
              <option value="">No, es una visita suelta</option>
              {estanciasDelPerro.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.servicioNombre}
                </option>
              ))}
            </Select>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Servicio" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
            <Select
              label="Empleado"
              value={empleadoId}
              onChange={(e) => setEmpleadoId(e.target.value)}
              disabled={rolActual === "estetica"}
              ayuda={rolActual === "estetica" ? "Solo puedes agendar en tu propia agenda." : undefined}
            >
              {empleados.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre_completo ?? "—"}
                </option>
              ))}
            </Select>
          </div>

          {/* Solo se ofrece en el servicio que de verdad tiene precio
              alternativo. En los demás la casilla no haría nada y sería
              una pregunta de más en el mostrador. */}
          {servicios.find((s) => s.id === servicioId)?.tiene_precio_maltratado && (
            <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
              <input
                type="checkbox"
                checked={peloMaltratado}
                onChange={(e) => setPeloMaltratado(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                Llegó con el pelo maltratado
                <span className="block text-sm text-n-600">
                  Cobra el precio alternativo de este mismo baño, no un cargo aparte.
                </span>
              </span>
            </label>
          )}

          <Field
            label="Fecha y hora"
            type="datetime-local"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.target.value)}
          />

          {error && (
            <Alert variante="error" titulo="No se pudo agendar">
              {error}
            </Alert>
          )}

          <Button type="button" disabled={enviando.cargando || !perroId} onClick={enviar} className="self-start">
            {enviando.cargando ? "Agendando…" : "Agendar cita"}
          </Button>
        </>
      )}
    </div>
  );
}
