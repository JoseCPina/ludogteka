"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { cambiarOculto } from "./acciones-atenciones";
import type { AtencionDelDueno } from "@/lib/app/atenciones";

const GIRO: Record<string, string> = { veterinaria: "Veterinaria", estetica: "Estética", hotel: "Hotel" };

/** Lo que registraron los negocios con el QR (Fase 2): quién, qué, y ocultar sin borrar. */
export function AtencionesDeNegocios({ atenciones, nombre }: { atenciones: AtencionDelDueno[]; nombre: string }) {
  const [ocultas, setOcultas] = useState(() => new Set(atenciones.filter((a) => a.oculto).map((a) => a.id)));
  const [error, setError] = useState<string | null>(null);
  const envio = useEspera();
  const [cual, setCual] = useState<string | null>(null);
  async function alternar(id: string) {
    setError(null);
    setCual(id);
    const ocultar = !ocultas.has(id);
    const r = await envio.ejecutar(() => cambiarOculto(id, ocultar));
    setCual(null);
    if (r.error) return setError(r.error);
    setOcultas((s) => {
      const n = new Set(s);
      if (r.oculto) n.add(id);
      else n.delete(id);
      return n;
    });
  }
  return (
    <ul className="apd-lista">
      {atenciones.map((a) => {
        const oculta = ocultas.has(a.id);
        return (
          <li key={a.id} className="apd-tarjeta" data-atencion={a.id} data-oculta={oculta ? "si" : "no"} style={oculta ? { opacity: 0.6 } : undefined}>
            <div className="apd-fila" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <span className="apd-ceja">{GIRO[a.giro] ?? a.giro}</span>
              {a.editado && <span className="apd-chip apd-chip-neutro">Corregido</span>}
            </div>
            <p style={{ fontWeight: 800, marginTop: "0.35rem" }}>{a.negocioNombre}</p>
            <p className="apd-nota">{new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${a.fecha}T00:00:00Z`))}: {a.resumen}.{a.nota ? ` «${a.nota}»` : ""}</p>
            {oculta && <p className="apd-nota" style={{ marginTop: "0.3rem" }}>Oculto: no cuenta en la cartilla de {nombre} ni en sus recordatorios.</p>}
            <div className="apd-fila" style={{ flexWrap: "wrap", marginTop: "0.7rem", gap: "0.5rem" }}>
              {!oculta && (
                <a className="apd-boton-sec" href={`https://wa.me/52${a.negocioWhatsapp}?text=${encodeURIComponent(`Hola, soy de la familia de ${nombre}.`)}`} target="_blank" rel="noopener noreferrer">Escribirles</a>
              )}
              <button type="button" className="apd-boton-sec" aria-busy={(envio.cargando && cual === a.id) || undefined} disabled={envio.cargando} onClick={() => alternar(a.id)} data-ocultar-atencion={a.id}>
                {oculta ? "Volver a mostrar" : "Ocultar"}
              </button>
            </div>
          </li>
        );
      })}
      {error && <li className="apd-aviso apd-aviso-error" role="alert">{error}</li>}
    </ul>
  );
}
