"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { cancelarSolicitudApp } from "../negocios/acciones";
import { cancelarClienteNuevoApp } from "../negocios/acciones-cliente-nuevo";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import type { SolicitudApp } from "@/lib/app/negocios";

const ESTADO: Record<string, string> = { pendiente: "Esperando al negocio", aceptada: "Aceptada", rechazada: "No se pudo", caducada: "Caducó", cancelada: "Cancelada" };

/** Lo que pidió con «Pedir lugar»: arriba de sus visitas, porque todavía no es una. */
export function MisSolicitudes({ solicitudes }: { solicitudes: SolicitudApp[] }) {
  const [lista, setLista] = useState(solicitudes);
  const zona = useZonaNegocio();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  if (lista.length === 0) return null;
  async function cancelar(s: SolicitudApp) {
    setError(null);
    const r = await envio.ejecutar<{ error: string | null }>(() => (s.esClienteNuevo ? cancelarClienteNuevoApp(s.negocioId, s.id) : cancelarSolicitudApp(s.negocioId, s.id)));
    if (r.error) return setError(r.error);
    setLista((l) => l.map((x) => (x.id === s.id ? { ...x, estado: "cancelada" } : x)));
  }
  return (
    <section className="apd-seccion" data-mis-solicitudes>
      {lista.map((s) => (
        <div key={s.id} className="apd-tarjeta" style={{ marginTop: "0.5rem" }} data-solicitud-app={s.estado}>
          <p style={{ fontWeight: 800 }}>{s.esClienteNuevo ? "Pediste ser cliente" : "Solicitud"}: {s.servicioNombre} · {s.perroNombre}</p>
          <p className="apd-nota">{s.negocioNombre} · {s.inicio ? formatearFecha(s.inicio, zona) : s.fechaEntrada ? formatearFechaCalendario(s.fechaEntrada) : ""}</p>
          <p className="apd-nota" style={{ fontWeight: 700 }}>{ESTADO[s.estado] ?? s.estado}</p>
          {s.estado === "pendiente" && s.faltan.length > 0 && <p className="apd-nota">Falta: {s.faltan.join(", ")}</p>}
          {s.motivoRechazo && <p className="apd-nota">Motivo: {s.motivoRechazo}</p>}
          {s.estado === "pendiente" && (
            <button type="button" className="apd-boton-sec" style={{ marginTop: "0.5rem" }} aria-busy={envio.cargando || undefined} disabled={envio.cargando} onClick={() => cancelar(s)}>
              {envio.cargando ? "Cancelando…" : "Cancelar solicitud"}
            </button>
          )}
        </div>
      ))}
      {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
    </section>
  );
}
