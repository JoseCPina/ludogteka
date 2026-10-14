"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Mascota, NOMBRE_MASCOTA, type TipoMascota } from "./mascotas";
import { useSecuencia, useVisible } from "./usar";

/**
 * El hero: una ventana de PeluDesk que trabaja sola. Se arma «El día de
 * recepción» por turnos (WhatsApp → agenda → check-in → cobro → recordatorio →
 * caja cuadrada) con un cursor fantasma que agenda y cobra. Datos inventados.
 */

// Milisegundos desde el arranque en que entra cada paso.
const T = [1000, 2000, 3200, 3900, 6500, 7200, 8300, 9300, 11900, 12900, 14000] as const;
const [MSG, ESCRIBE, CONFIRMA, AGENDANDO, AGENDA, CHECKIN_P, CHECKIN, COBRANDO, COBRO, RECORDATORIO, CAJA] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const MODULOS: { tipo: TipoMascota; nombre: string }[] = [
  { tipo: "recepcion", nombre: "Recepción" },
  { tipo: "hotel", nombre: "Hotel y guardería" },
  { tipo: "estetica", nombre: "Estética" },
  { tipo: "veterinaria", nombre: "Veterinaria" },
];

function Panel({ titulo, children, boton, botonRef, pulsar }: { titulo: string; children?: ReactNode; boton?: string; botonRef?: React.Ref<HTMLSpanElement>; pulsar?: boolean }) {
  return (
    <div className="flex min-h-[176px] flex-col rounded-xl border border-dashed border-n-300 bg-white/60 p-2.5 sm:min-h-[156px] sm:p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">{titulo}</p>
        {boton && (
          <span ref={botonRef} className={`rounded-full bg-morado px-2.5 py-0.5 text-[11px] font-semibold text-white ${pulsar ? "pd-clic" : ""}`}>
            {boton}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Palomita({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path className="pd-trazo" d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
    </svg>
  );
}

type Cursor = { objetivo: "agendar" | "cobrar"; vars: Record<string, string> };

export function AppFalsa() {
  const caja = useRef<HTMLDivElement>(null);
  const ventana = useRef<HTMLDivElement>(null);
  const btnAgendar = useRef<HTMLSpanElement>(null);
  const btnCobrar = useRef<HTMLSpanElement>(null);
  const visible = useVisible(caja, 0.35);
  const { paso, ciclo, saliendo, reducido } = useSecuencia(T, visible, 4500, 500);
  const [cursor, setCursor] = useState<Cursor | null>(null);

  // El cursor recorre la ventana en zigzag 2.6 s y termina sobre el botón. Se
  // mide el botón en el momento, así sirve igual en celular y en escritorio.
  useLayoutEffect(() => {
    const objetivo = paso === AGENDANDO ? "agendar" : paso === COBRANDO ? "cobrar" : null;
    const v = ventana.current;
    const b = objetivo === "agendar" ? btnAgendar.current : objetivo === "cobrar" ? btnCobrar.current : null;
    if (!objetivo || !v || !b || reducido) {
      setCursor(null);
      return;
    }
    const rv = v.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const px = (n: number) => `${Math.round(n)}px`;
    setCursor({
      objetivo,
      vars: {
        "--x0": px(rv.width * 0.78), "--y0": px(rv.height * 0.12),
        "--x1": px(rv.width * 0.22), "--y1": px(rv.height * 0.38),
        "--x2": px(rv.width * 0.7), "--y2": px(rv.height * 0.55),
        "--x3": px(rv.width * 0.3), "--y3": px(rv.height * 0.78),
        "--x4": px(rb.left - rv.left + rb.width * 0.5), "--y4": px(rb.top - rv.top + rb.height * 0.55),
      },
    });
  }, [paso, reducido]);

  const pendiente = paso === AGENDANDO ? "Agendando…" : paso === CHECKIN_P ? "Registrando check-in…" : paso === COBRANDO ? "Cobrando…" : null;
  const activo: TipoMascota = paso >= CHECKIN_P && paso < COBRANDO ? "hotel" : "recepcion";
  const vacunas = ["Rabia", "Parvovirus", "Bordetella"];

  return (
    <div ref={caja}>
      <div
        ref={ventana}
        role="img"
        aria-label="Ejemplo animado de PeluDesk: llega una cita por WhatsApp, se agenda, el perro hace check-in con sus vacunas al corriente, se cobra y la caja cuadra."
        className={`pd-ventana pd-captura relative overflow-hidden rounded-[18px] border border-n-200 bg-crema ${saliendo ? "pd-sale" : ""}`}
      >
        <div aria-hidden="true" className="pointer-events-none select-none">
          <div className="flex items-center gap-2 border-b border-n-200 bg-white px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-coral" />
            <span className="h-2.5 w-2.5 rounded-full bg-ambar" />
            <span className="h-2.5 w-2.5 rounded-full bg-menta" />
            <p className="ml-2 truncate text-xs font-semibold text-n-700">PeluDesk · Patitas &amp; Co. · El día de recepción</p>
          </div>
          <div className="flex">
            <div className="flex w-[52px] shrink-0 flex-col gap-1 border-r border-n-200 bg-white p-1.5 sm:w-[168px] sm:p-2">
              {MODULOS.map((m, i) => (
                <div
                  key={m.tipo}
                  className={`flex items-center gap-2 rounded-lg p-1 transition-colors duration-300 sm:px-2 ${m.tipo === activo ? "bg-morado-suave" : ""}`}
                >
                  <Mascota tipo={m.tipo} tamano={30} retraso={i * 0.7} />
                  <span className={`hidden text-xs font-semibold sm:block ${m.tipo === activo ? "text-morado" : "text-n-700"}`}>{m.nombre}</span>
                </div>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="grid flex-1 grid-cols-2 gap-2 p-2 sm:gap-3 sm:p-3">
                <Panel titulo="WhatsApp">
                  {paso >= MSG && (
                    <p key={`m${ciclo}`} className="pd-entra max-w-[92%] self-start rounded-xl rounded-tl-sm bg-white px-2 py-1.5 text-[11px] leading-snug text-n-800 shadow-sm">
                      ¿Hay lugar mañana a las 10 para el baño de Luna?
                    </p>
                  )}
                  {paso >= ESCRIBE && paso < CONFIRMA && (
                    <p className="pd-entra flex w-fit items-center gap-1 self-end rounded-xl rounded-tr-sm bg-menta px-3 py-2" key={`e${ciclo}`}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="pd-punto h-1.5 w-1.5 rounded-full bg-morado" style={{ animationDelay: `${i * 160}ms` }} />
                      ))}
                    </p>
                  )}
                  {paso >= CONFIRMA && (
                    <p key={`c${ciclo}`} className="pd-entra max-w-[92%] self-end rounded-xl rounded-tr-sm bg-menta px-2 py-1.5 text-[11px] font-semibold leading-snug text-morado">
                      ¡Listo! Te esperamos mañana a las 10:00.
                    </p>
                  )}
                </Panel>
                <Panel titulo="Agenda" boton="Agendar" botonRef={btnAgendar} pulsar={cursor?.objetivo === "agendar"}>
                  <p className="rounded-md bg-white px-2 py-1 text-[11px] text-n-700">
                    <span className="font-bold tabular-nums">09:00</span> Rocky · corte
                  </p>
                  {paso >= AGENDA && (
                    <p key={`a${ciclo}`} className="pd-entra rounded-md border border-menta bg-menta-suave px-2 py-1 text-[11px] font-semibold text-morado">
                      <span className="tabular-nums">10:00</span> Luna · baño completo
                    </p>
                  )}
                </Panel>
                <Panel titulo="Check-in">
                  {paso >= CHECKIN && (
                    <div key={`k${ciclo}`} className="pd-entra">
                      <p className="text-xs font-bold text-n-900">Luna · poodle</p>
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {vacunas.map((v, i) => (
                          <li key={v} className="pd-entra rounded-full bg-menta-suave px-2 py-0.5 text-[10px] font-semibold text-menta-oscuro" style={{ animationDelay: `${200 + i * 140}ms` }}>
                            ✓ {v}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 text-[10px] font-semibold text-menta-oscuro">Vacunas al corriente</p>
                    </div>
                  )}
                </Panel>
                <Panel titulo="Cobro" boton="Cobrar" botonRef={btnCobrar} pulsar={cursor?.objetivo === "cobrar"}>
                  {paso >= COBRO && (
                    <div key={`b${ciclo}`} className="pd-entra flex items-center gap-2">
                      <span className="pd-pop-check flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-menta-oscuro text-white">
                        <Palomita />
                      </span>
                      <div>
                        <p className="text-sm font-bold tabular-nums text-n-900">$350</p>
                        <p className="text-[10px] text-n-600">Baño completo · pagado</p>
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
              <div className="relative flex min-h-[46px] items-center justify-between gap-2 border-t border-n-200 bg-white px-3 py-2">
                <div className="min-w-0 text-[11px] font-semibold">
                  {pendiente && (
                    <p key={pendiente} className="pd-entra flex items-center gap-2 text-n-700">
                      <svg className="pd-spin shrink-0" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <path d="M12 3a9 9 0 1 0 9 9" className="text-morado" />
                      </svg>
                      {pendiente}
                    </p>
                  )}
                  {paso >= RECORDATORIO && paso < CAJA && !pendiente && (
                    <p key={`r${ciclo}`} className="pd-entra flex items-center gap-1.5 text-morado">
                      <span className="h-2 w-2 rounded-full bg-menta-oscuro" />
                      Recordatorio de vacuna enviado
                    </p>
                  )}
                  {paso >= CAJA && (
                    <p key={`z${ciclo}`} className="pd-entra flex items-center gap-1.5 text-menta-oscuro">
                      <Palomita className="pd-trazo-vivo" />
                      Caja cuadrada
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-[10px] text-n-600">Datos de ejemplo</p>
              </div>
            </div>
          </div>
          {paso >= RECORDATORIO && paso < CAJA && (
            <div key={`t${ciclo}`} className="pd-entra absolute bottom-14 right-3 hidden max-w-[220px] items-center gap-2 rounded-xl bg-morado px-3 py-2 text-[11px] font-semibold text-white shadow-lg sm:flex">
              <span className="h-2 w-2 shrink-0 rounded-full bg-menta" />
              Recordatorio de vacuna enviado
            </div>
          )}
          {cursor && (
            <div key={`${ciclo}-${cursor.objetivo}`} className="pd-cursor-ruta" style={cursor.vars as React.CSSProperties}>
              <svg className="pd-cursor" viewBox="0 0 24 24" width="22" height="22">
                <path d="M4 2l15 9-6.5 1.5L9 19z" fill="#2b2a33" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <span className="pd-onda" />
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-n-600">
        {NOMBRE_MASCOTA.recepcion}, {NOMBRE_MASCOTA.hotel}, {NOMBRE_MASCOTA.estetica} y {NOMBRE_MASCOTA.veterinaria} te acompañan en cada módulo.
      </p>
    </div>
  );
}
