"use client";
import { dinero } from "@/lib/dinero";

import Link from "next/link";
import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { incluyeEnLinea } from "@/lib/app/texto-servicio";
import { horasApp, pedirCitaApp } from "../../../negocios/acciones";

export type NegocioCita = {
  id: string;
  nombre: string;
  zona: string;
  dias: string[];
  servicios: { id: string; nombre: string; duracionMinutos: number | null; incluye: string[] | string | null }[];
};

type Hora = { inicio: string; hora: string };
type Hecha = { servicio: string; dia: string; hora: string; atiende: string | null; precio: number | null; negocio: string };

// Un día del calendario (AAAA-MM-DD) dicho en la tarjeta: sin pasar por la zona de este teléfono.
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...o }).format(new Date(`${d}T12:00:00Z`));
const diaLargo = (d: string) => fmt(d, { weekday: "long", day: "numeric", month: "long" });

/** Servicio → día → hora libre → pedir. Cada paso aparece cuando el anterior está escogido (Fresha). */
export function PedirCita({ mascotaId, nombre, negocios, negocioInicial }: { mascotaId: string; nombre: string; negocios: NegocioCita[]; negocioInicial: string }) {
  const [negocioId, setNegocioId] = useState(negocioInicial);
  const negocio = negocios.find((n) => n.id === negocioId) ?? negocios[0];
  const [servicioId, setServicioId] = useState<string | null>(negocio.servicios.length === 1 ? negocio.servicios[0].id : null);
  const [dia, setDia] = useState<string | null>(null);
  const [horas, setHoras] = useState<{ dia: string; abre: boolean; lista: Hora[] } | null>(null);
  const [hora, setHora] = useState<Hora | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecha, setHecha] = useState<Hecha | null>(null);
  const consulta = useEspera();
  const envio = useEspera();
  const servicio = negocio.servicios.find((s) => s.id === servicioId) ?? null;

  function cambiarNegocio(id: string) {
    const n = negocios.find((x) => x.id === id)!;
    setNegocioId(id);
    setServicioId(n.servicios.length === 1 ? n.servicios[0].id : null);
    setDia(null);
    setHoras(null);
    setHora(null);
    setError(null);
  }

  async function escogerDia(d: string, sId = servicioId) {
    if (!sId) return;
    setDia(d);
    setHora(null);
    setError(null);
    setHoras(null);
    const r = await consulta.ejecutar(() => horasApp(negocio.id, sId, d));
    if (r.error || !r.datos) return setError(r.error ?? "No pudimos ver las horas de ese día.");
    setHoras({ dia: d, abre: r.datos.abre, lista: r.datos.horas });
  }

  async function pedir() {
    if (!servicio || !hora || !dia) return;
    setError(null);
    const r = await envio.ejecutar(() => pedirCitaApp(negocio.id, mascotaId, servicio.id, hora.inicio));
    if (r.error) {
      setError(r.error);
      // La hora se pudo ocupar mientras escogía: se vuelve a leer el día.
      if (/ocup/i.test(r.error)) escogerDia(dia);
      return;
    }
    // El precio que se le dice es el total de la CUENTA de la cita (cuenta_totales_reserva), el mismo de Caja.
    const d = (r.datos ?? {}) as { atiende?: string | null; precio?: number | null; total_cuenta?: number | null };
    setHecha({ servicio: servicio.nombre, dia: diaLargo(dia), hora: hora.hora, atiende: d.atiende ?? null, precio: d.total_cuenta != null ? Number(d.total_cuenta) : d.precio == null ? null : Number(d.precio), negocio: negocio.nombre });
  }

  if (hecha) {
    return (
      <div className="apd-tarjeta" data-cita-pedida>
        <div className="apd-resumen" role="status">
          <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>¡Listo! La cita de {nombre} quedó apartada</span>
          <span>{hecha.servicio} en {hecha.negocio}</span>
          <span>{hecha.dia[0].toUpperCase() + hecha.dia.slice(1)} a las {hecha.hora}</span>
          {hecha.atiende && <span data-atiende>La atiende {hecha.atiende}</span>}
          {hecha.precio != null && <span data-precio>Precio: {dinero(hecha.precio)}</span>}
        </div>
        <p className="apd-nota" style={{ marginTop: "0.75rem" }}>{hecha.negocio} la ve en su agenda. Si necesitas moverla o cancelarla, escríbeles por WhatsApp.</p>
        <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
          <Link href="/visitas" className="apd-boton" data-ir-visitas>Ver mis visitas</Link>
          <Link href={`/mascotas/${mascotaId}`} className="apd-boton-sec">Volver a {nombre}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="apd-opciones" data-pedir-cita>
      {negocios.length > 1 && (
        <>
          <p className="apd-etiqueta">¿Dónde?</p>
          <div className="apd-tabs">
            {negocios.map((n) => (
              <button key={n.id} type="button" className="apd-tab" aria-pressed={n.id === negocio.id} onClick={() => cambiarNegocio(n.id)} data-negocio-cita={n.id}>{n.nombre}</button>
            ))}
          </div>
        </>
      )}

      <p className="apd-etiqueta" style={{ marginTop: "0.5rem" }}>1. ¿Qué servicio?</p>
      {negocio.servicios.map((s) => (
        <button
          key={s.id}
          type="button"
          className="apd-opcion"
          aria-pressed={s.id === servicioId}
          onClick={() => {
            setServicioId(s.id);
            setHora(null);
            if (dia) escogerDia(dia, s.id);
          }}
          data-servicio-cita={s.id}
        >
          <span>
            {s.nombre}
            {incluyeEnLinea(s.incluye) && <span className="apd-nota" style={{ display: "block", fontWeight: 500 }}>{incluyeEnLinea(s.incluye)}</span>}
          </span>
          {s.duracionMinutos ? <span className="apd-chip apd-chip-neutro" style={{ flex: "none" }}>{s.duracionMinutos} min</span> : null}
        </button>
      ))}

      {servicio && (
        <>
          <p className="apd-etiqueta" style={{ marginTop: "0.75rem" }}>2. ¿Qué día?</p>
          <div className="apd-dias" data-dias-cita>
            {negocio.dias.map((d, i) => (
              <button key={d} type="button" className="apd-dia" aria-pressed={d === dia} onClick={() => escogerDia(d)} data-dia={d}>
                <small>{i === 0 ? "Hoy" : i === 1 ? "Mañana" : fmt(d, { weekday: "short" })}</small>
                <strong>{fmt(d, { day: "numeric" })}</strong>
                <small>{fmt(d, { month: "short" })}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {dia && (
        <>
          <p className="apd-etiqueta" style={{ marginTop: "0.75rem" }}>3. ¿A qué hora?</p>
          {consulta.cargando && <p className="apd-nota" role="status" aria-busy>Viendo qué horas están libres…</p>}
          {horas && horas.dia === dia && !horas.abre && <p className="apd-aviso apd-aviso-ambar" data-dia-cerrado>Ese día {negocio.nombre} no abre. Escoge otro.</p>}
          {horas && horas.dia === dia && horas.abre && horas.lista.length === 0 && <p className="apd-aviso apd-aviso-ambar" data-dia-lleno>Ese día ya está lleno. Escoge otro.</p>}
          {horas && horas.dia === dia && horas.lista.length > 0 && (
            <div className="apd-horas" data-horas-cita>
              {horas.lista.map((h) => (
                <button key={h.inicio} type="button" className="apd-hora" aria-pressed={hora?.inicio === h.inicio} onClick={() => setHora(h)} data-hora={h.inicio}>{h.hora}</button>
              ))}
            </div>
          )}
        </>
      )}

      {servicio && dia && hora && (
        <div className="apd-tarjeta" style={{ marginTop: "0.75rem" }} data-resumen-cita>
          <p style={{ fontWeight: 800 }}>{servicio.nombre} para {nombre}</p>
          <p className="apd-nota">{diaLargo(dia)} a las {hora.hora} · {negocio.nombre}</p>
          <button type="button" className="apd-boton apd-boton-ancho" style={{ marginTop: "0.8rem" }} aria-busy={envio.cargando || undefined} disabled={envio.cargando} onClick={pedir} data-pedir-la-cita>
            {envio.cargando ? "Apartando…" : "Pedir la cita"}
          </button>
        </div>
      )}
      {error && <p className="apd-aviso apd-aviso-error" role="alert" data-error-cita>{error}</p>}
    </div>
  );
}
