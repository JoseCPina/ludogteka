"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { hoyNegocio } from "@/lib/formato";
import { crearCita } from "../agenda-actions";

type Cliente = { id: string; nombre: string; telefono: string };
type Perro = { id: string; cliente_id: string; nombre: string };
type Servicio = { id: string; nombre: string };
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
  clientes: Cliente[];
  perros: Perro[];
  servicios: Servicio[];
  empleados: Empleado[];
  estanciasEnCurso: EstanciaEnCurso[];
  rolActual: string;
  userIdActual: string;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [perroId, setPerroId] = useState("");
  const [servicioId, setServicioId] = useState(servicios[0]?.id ?? "");
  const [empleadoId, setEmpleadoId] = useState(rolActual === "estetica" ? userIdActual : empleados[0]?.id ?? "");
  const [fechaHora, setFechaHora] = useState(`${hoyNegocio()}T10:00`);
  const [estanciaId, setEstanciaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    const qDigitos = q.replace(/\D/g, "");
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (qDigitos && c.telefono.includes(qDigitos))
    );
  }, [clientes, busqueda]);

  const clienteElegido = clientes.find((c) => c.id === clienteId) ?? null;
  const perrosDelCliente = useMemo(() => perros.filter((p) => p.cliente_id === clienteId), [perros, clienteId]);
  const estanciasDelPerro = estanciasEnCurso.filter((e) => e.perroId === perroId);

  async function enviar() {
    if (!perroId) {
      setError("Elige un perro.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await crearCita({
      perroId,
      servicioId,
      empleadoId,
      inicio: localAUtc(fechaHora),
      estanciaId: estanciaId || null,
    });
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push(`/agenda/${res.citaId}`);
  }

  if (!clienteElegido) {
    return (
      <div className="flex flex-col gap-4">
        <div className="max-w-sm">
          <Field
            label="Buscar cliente por nombre o teléfono"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="ej. Ana o 444 123"
            autoFocus
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
          {clientesFiltrados.length === 0 ? (
            <p className="p-6 text-center text-n-600">Ningún cliente coincide con la búsqueda.</p>
          ) : (
            <ul className="divide-y divide-n-200">
              {clientesFiltrados.slice(0, 30).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setClienteId(c.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
                  >
                    <span className="font-semibold text-n-900">{c.nombre}</span>
                    <span className="tabular-nums text-n-600">{formatearTelefono(c.telefono)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

          <Button type="button" disabled={enviando || !perroId} onClick={enviar} className="self-start">
            {enviando ? "Agendando…" : "Agendar cita"}
          </Button>
        </>
      )}
    </div>
  );
}
