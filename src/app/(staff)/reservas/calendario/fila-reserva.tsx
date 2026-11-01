"use client";

import { describirEstancia } from "@/lib/formato";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import { formatearFechaCalendario } from "@/lib/formato";
import type { Conflicto } from "@/lib/concurrencia/tipos";
import { cancelarEstancia } from "../reserva-actions";
import { MoverFechas } from "../mover-fechas";
import { ESTILO_ESTADO, ETIQUETA_ESTADO } from "@/lib/estados/insignias";
import { Enlace } from "@/components/ui/enlace";

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
  /** updated_at de la estancia al cargar la lista (QA N43). */
  version: string | null;
  /** Texto corto de la cuenta: «Debe $350.00», «Pagada», «Cuenta cancelada»… */
  cuenta: string;
  cuentaTono: "debe" | "ok" | "cancelada" | "neutro";
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
  const [version, setVersion] = useState(r.version);
  // Al recargar (otra persona la cambió), la fila toma lo que dice la base.
  const [versionVista, setVersionVista] = useState(r.version);
  if (r.version !== versionVista) {
    setVersionVista(r.version);
    setVersion(r.version);
    setEstado(r.estado);
    setEntrada(r.fechaEntrada);
    setSalida(r.fechaSalida);
  }
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const esGuarderia = r.categoria === "guarderia";
  const editable = estado === "reservada" || estado === "confirmada";

  async function cancelar(forzar = false) {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => cancelarEstancia(r.id, { versiones: version ? [{ t: "estancias", i: r.id, v: version }] : [], forzar }));
    if (res.conflicto) return setConflicto(res.conflicto);
    if (res.error) return setError(res.error);
    setConflicto(null);
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

      {conflicto && (
        <AvisoConflicto
          conflicto={conflicto}
          registro="esta reserva"
          cargando={envio.cargando}
          onRecargar={() => {
            setConflicto(null);
            setCancelando(false);
          }}
          onGuardarEncima={() => cancelar(true)}
        />
      )}
      {moviendo ? (
        <MoverFechas
          estanciaId={r.id}
          esGuarderia={esGuarderia}
          entrada={entrada}
          salida={salida}
          version={version}
          onHecho={(x) => {
            setEntrada(x.entrada);
            setSalida(x.salida);
            if (x.version) setVersion(x.version);
            setMoviendo(false);
            setExito("Fechas cambiadas.");
            router.refresh();
          }}
          onCancelar={() => setMoviendo(false)}
        />
      ) : cancelando ? (
        <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
          <p className="text-sm font-semibold text-coral-oscuro">¿Cancelar {describirEstancia(r.servicioNombre, r.perroNombre, r.fechaEntrada, r.fechaSalida, r.categoria)}? Su cupo queda libre y, si usó un pase, se le devuelve.</p>
          <div className="flex gap-2">
            <Button type="button" variante="peligro" cargando={envio.cargando} onClick={() => cancelar()}>
              Sí, cancelarla
            </Button>
            <Button type="button" variante="secundario" onClick={() => setCancelando(false)}>
              No
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Enlace href={`/reservas/${r.reservaId}`} className="text-sm">
            Abrir
          </Enlace>
          {editable && (
            <>
              <Button type="button" variante="secundario" className="px-3 text-sm" tamano="compacto" onClick={() => { setMoviendo(true); setExito(null); }}>
                Mover fechas
              </Button>
              <Button type="button" variante="secundario" className="px-3 text-sm" tamano="compacto" onClick={() => { setCancelando(true); setExito(null); }}>
                Cancelar
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
