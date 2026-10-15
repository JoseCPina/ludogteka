"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFechaCalendario, sumarDiasFecha } from "@/lib/formato";
import { cancelarEstancia, moverFechas } from "../reserva-actions";

export type ReservaCalendario = {
  id: string;
  reservaId: string;
  perroNombre: string;
  clienteNombre: string;
  categoria: string;
  servicioNombre: string;
  fechaEntrada: string;
  fechaSalida: string;
  estado: string;
  /** Texto corto de la cuenta: «Debe $350.00», «Pagada», «Cuenta cancelada»… */
  cuenta: string;
  cuentaTono: "debe" | "ok" | "cancelada" | "neutro";
};

export const ETIQUETA_ESTADO: Record<string, string> = {
  reservada: "Reservada",
  confirmada: "Confirmada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_llego: "No llegó",
};

const ESTILO_ESTADO: Record<string, string> = {
  reservada: "bg-n-100 text-n-700",
  confirmada: "bg-morado-suave text-morado",
  en_curso: "bg-menta-suave text-menta-oscuro",
  finalizada: "bg-n-100 text-n-600",
  cancelada: "bg-coral-suave text-coral-oscuro",
  no_llego: "bg-coral-suave text-coral-oscuro",
};

const ESTILO_CUENTA: Record<ReservaCalendario["cuentaTono"], string> = {
  debe: "text-coral-oscuro",
  ok: "text-menta-oscuro",
  cancelada: "text-n-500",
  neutro: "text-n-600",
};

/** Una reserva de guardería u hotel: se abre, se mueve de fechas o se cancela sin salir de la lista. */
export function FilaReserva({ r }: { r: ReservaCalendario }) {
  const router = useRouter();
  const envio = useEspera();
  const [estado, setEstado] = useState(r.estado);
  const [entrada, setEntrada] = useState(r.fechaEntrada);
  const [salida, setSalida] = useState(r.fechaSalida);
  const [moviendo, setMoviendo] = useState(false);
  const [nuevaEntrada, setNuevaEntrada] = useState(r.fechaEntrada);
  const [nuevaSalida, setNuevaSalida] = useState(r.fechaSalida);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const esGuarderia = r.categoria === "guarderia";
  const editable = estado === "reservada" || estado === "confirmada";

  async function mover() {
    setError(null);
    setExito(null);
    if (!nuevaEntrada) return setError("Escoge la nueva fecha.");
    const salidaFinal = esGuarderia ? sumarDiasFecha(nuevaEntrada, 1) : nuevaSalida;
    if (!esGuarderia && salidaFinal <= nuevaEntrada) return setError("La salida tiene que ser después de la entrada.");
    const res = await envio.ejecutar(() => moverFechas(r.id, nuevaEntrada, salidaFinal));
    if (res.error) return setError(res.error);
    setEntrada(nuevaEntrada);
    setSalida(salidaFinal);
    setMoviendo(false);
    setExito("Fechas cambiadas.");
    router.refresh();
  }

  async function cancelar() {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => cancelarEstancia(r.id));
    if (res.error) return setError(res.error);
    setEstado("cancelada");
    setCancelando(false);
    setExito(res.aviso ? `Reserva cancelada y su cupo quedó libre. ${res.aviso}` : "Reserva cancelada y su cupo quedó libre.");
    router.refresh();
  }

  return (
    <li data-reserva={r.id} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-n-900">
            {r.perroNombre} <span className="font-normal text-n-600">· {r.clienteNombre}</span>
          </p>
          <p className="text-sm text-n-600">
            {esGuarderia ? "Guardería" : "Hotel"} · {r.servicioNombre}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO_ESTADO[estado] ?? "bg-n-100 text-n-700"}`}>
          {ETIQUETA_ESTADO[estado] ?? estado}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-n-700">
        <span>
          {esGuarderia ? "Fecha" : "Del"}: <span className="font-semibold text-n-900">{formatearFechaCalendario(entrada)}</span>
          {!esGuarderia && (
            <>
              {" "}al <span className="font-semibold text-n-900">{formatearFechaCalendario(salida)}</span>
            </>
          )}
        </span>
        <span>
          Cuenta: <span className={`font-semibold ${ESTILO_CUENTA[r.cuentaTono]}`}>{r.cuenta}</span>
        </span>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}
      {exito && <p className="text-sm font-semibold text-menta-oscuro">{exito}</p>}

      {moviendo ? (
        <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={esGuarderia ? "Nueva fecha" : "Nueva entrada"} type="date" value={nuevaEntrada} onChange={(e) => setNuevaEntrada(e.target.value)} />
            {!esGuarderia && <Field label="Nueva salida" type="date" value={nuevaSalida} min={nuevaEntrada} onChange={(e) => setNuevaSalida(e.target.value)} />}
          </div>
          <AccionesFormulario error={null}>
            <Button type="button" cargando={envio.cargando} onClick={mover}>
              Guardar fechas
            </Button>
            <Button type="button" variante="secundario" onClick={() => setMoviendo(false)}>
              Dejarlas
            </Button>
          </AccionesFormulario>
        </div>
      ) : cancelando ? (
        <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
          <p className="text-sm font-semibold text-coral-oscuro">¿Cancelar la reserva de {r.perroNombre}? Su cupo queda libre y, si usó un pase, se le devuelve.</p>
          <div className="flex gap-2">
            <Button type="button" variante="peligro" cargando={envio.cargando} onClick={cancelar}>
              Sí, cancelarla
            </Button>
            <Button type="button" variante="secundario" onClick={() => setCancelando(false)}>
              No
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/reservas/${r.reservaId}`}
            className="inline-flex min-h-10 items-center rounded-md border-[1.5px] border-n-300 bg-white px-3 text-sm font-semibold text-n-800 hover:border-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
          >
            Abrir
          </Link>
          {editable && (
            <>
              <Button type="button" variante="secundario" className="min-h-10 px-3 text-sm" onClick={() => { setMoviendo(true); setNuevaEntrada(entrada); setNuevaSalida(salida); setExito(null); }}>
                Mover fechas
              </Button>
              <Button type="button" variante="secundario" className="min-h-10 px-3 text-sm" onClick={() => { setCancelando(true); setExito(null); }}>
                Cancelar
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
