"use client";

import { useRef } from "react";
import { useSecuencia, useVisible } from "./animacion/usar";
import "./maqueta-recordatorio.css";

// Maqueta animada del recordatorio automático por WhatsApp: llega el mensaje del día anterior con sus dos botones,
// el cliente toca «Confirmo» y la cita se pone en verde en la agenda del negocio. HTML y CSS, sin video ni imágenes.
// Datos de ejemplo escritos aquí (el negocio puede ser el real, en /para/<slug>); nunca consulta la base.
// Todos los elementos están en el HTML desde el servidor (sin saltos de diseño): los pasos solo cambian su opacidad.
// Con «reducir movimiento» enseña directo el estado final.

export type TipoRecordatorio = "estetica" | "veterinaria" | "hotel" | "guarderia";

export type DatosMaqueta = {
  /** Nombre del negocio, tal cual va en el texto del mensaje. */
  negocio: string;
  cliente: string;
  mascota: string;
  /** «Baño y corte», «Consulta»… En hotel y guardería no se usa (el texto dice «llega al hotel»). */
  servicio: string;
  /** «jueves 29 de octubre»: el mensaje dice «mañana jueves 29 de octubre». */
  dia: string;
  /** «11:00» */
  hora: string;
  tipo?: TipoRecordatorio;
  /** Solo en veterinaria: «la Dra. Montes». */
  medico?: string;
};

const TIEMPOS = [400, 1500, 3000, 3500, 4300] as const;
const [ESCRIBE, MENSAJE, TOQUE, RESPUESTA, CONFIRMADA] = [1, 2, 3, 4, 5];

const OTRAS: Record<TipoRecordatorio, [string, string, string][]> = {
  estetica: [["09:30", "Luna", "Baño"], ["13:00", "Max", "Corte de uñas"]],
  veterinaria: [["09:30", "Luna", "Vacuna"], ["13:00", "Max", "Seguimiento"]],
  hotel: [["09:30", "Luna", "Hotel"], ["13:00", "Max", "Hotel"]],
  guarderia: [["08:30", "Luna", "Guardería"], ["09:00", "Max", "Guardería"]],
};

/** El mismo texto de las plantillas reales (src/lib/recordatorios/plantillas.json), con datos de ejemplo. */
export function textoRecordatorio(d: DatosMaqueta): string {
  const tipo = d.tipo ?? "estetica";
  if (tipo === "hotel" || tipo === "guarderia") {
    return `Hola ${d.cliente}, en ${d.negocio} te esperamos con ${d.mascota} mañana ${d.dia} a partir de las ${d.hora}. Confírmanos con un botón.`;
  }
  if (tipo === "veterinaria") {
    return `Hola ${d.cliente}, te recordamos la cita de ${d.mascota} en ${d.negocio} mañana ${d.dia} a las ${d.hora} con ${d.medico ?? "tu médico veterinario"}. Confírmanos con un botón.`;
  }
  return `Hola ${d.cliente}, te recordamos la cita de ${d.mascota} en ${d.negocio} mañana ${d.dia} a las ${d.hora} (${d.servicio}). Confírmanos con un botón.`;
}

function Palomitas() {
  return (
    <svg viewBox="0 0 18 11" width="16" height="10" aria-hidden="true" className="shrink-0 text-[#53bdeb]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6l3 3 6-7.5M7.5 9l1 0.6 6.5-8" />
    </svg>
  );
}

function IconoResponder() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 5L3 10l5 5M3.5 10H12a5 5 0 015 5v1" />
    </svg>
  );
}

function Chip({ confirmada }: { confirmada: boolean }) {
  return confirmada ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-menta-suave px-2.5 py-1 text-xs font-semibold text-menta-oscuro">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-menta-oscuro" />
      Confirmada
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-coral-suave px-2.5 py-1 text-xs font-semibold text-coral-oscuro">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-coral-oscuro" />
      Por confirmar
    </span>
  );
}

export function MaquetaRecordatorio(props: DatosMaqueta & { className?: string }) {
  const { negocio, cliente, mascota, servicio, dia, hora, className = "" } = props;
  const tipo = props.tipo ?? "estetica";
  const ref = useRef<HTMLDivElement>(null);
  const visible = useVisible(ref, 0.35);
  const { paso, saliendo } = useSecuencia(TIEMPOS, visible, 4500, 450);
  const texto = textoRecordatorio(props);
  const servicioAgenda = tipo === "hotel" ? "Llega al hotel" : tipo === "guarderia" ? "Guardería" : servicio;
  const filas = [...OTRAS[tipo].map(([h, m, s]) => ({ hora: h, mascota: m, servicio: s, principal: false })), { hora, mascota, servicio: servicioAgenda, principal: true }].sort((a, b) =>
    a.hora.padStart(5, "0").localeCompare(b.hora.padStart(5, "0"))
  );
  const ver = (n: number) => (paso >= n ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2");
  const transicion = "transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none";
  const confirmada = paso >= CONFIRMADA;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Ejemplo animado: ${cliente} recibe por WhatsApp el recordatorio «${texto}» con los botones Confirmo y Necesito cambiarla, toca Confirmo y la cita de ${mascota} queda confirmada, en verde, en la agenda de ${negocio}.`}
      className={`grid grid-cols-[minmax(0,1fr)] items-center gap-5 transition-opacity duration-500 motion-reduce:transition-none md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-8 ${saliendo ? "opacity-0" : "opacity-100"} ${className}`}
    >
      {/* ── El celular del cliente ── */}
      <div aria-hidden="true" className="pointer-events-none mx-auto w-full max-w-[320px] select-none rounded-[34px] bg-n-900 p-2 shadow-[0_18px_40px_-24px_rgb(43_42_51/0.55)]">
        <div className="overflow-hidden rounded-[27px] bg-[#efeae2]">
          <div className="flex items-center gap-2.5 bg-[#008069] px-3 py-2.5 text-white">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12.5 4.5L7 10l5.5 5.5" />
            </svg>
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/peludesk/isotipo.svg" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-[15px] font-semibold leading-tight">
                PeluDesk
                <svg viewBox="0 0 20 20" width="14" height="14" className="shrink-0">
                  <circle cx="10" cy="10" r="9" fill="#25d366" />
                  <path d="M6 10.2l2.6 2.6L14 7.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="block text-xs leading-tight text-white/85">Cuenta de empresa</span>
            </span>
          </div>

          <div className="flex min-h-[330px] flex-col gap-2 px-3 py-3">
            <p className="mx-auto rounded-md bg-white/90 px-2.5 py-0.5 text-[11px] font-medium text-[#54656f]">Hoy</p>

            {/* Escribiendo… */}
            <div className={`-mb-8 flex h-8 w-14 items-center justify-center gap-1 rounded-lg rounded-tl-none bg-white ${transicion} ${paso >= ESCRIBE && paso < MENSAJE ? "opacity-100" : "opacity-0"}`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="pd-mr-punto h-1.5 w-1.5 rounded-full bg-[#8696a0]" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>

            {/* El recordatorio, con sus dos botones */}
            <div className={`max-w-[92%] ${transicion} ${ver(MENSAJE)}`}>
              <div className="rounded-lg rounded-tl-none bg-white px-2.5 pb-1.5 pt-2 shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
                <p className="text-[13.5px] leading-snug text-[#111b21]">{texto}</p>
                <p className="mt-1.5 text-[12px] leading-snug text-[#667781]">Para no recibir recordatorios, responde BAJA.</p>
                <p className="mt-0.5 text-right text-[11px] tabular-nums text-[#667781]">10:00</p>
              </div>
              <div className="mt-[3px] grid gap-[3px]">
                <span className="relative flex items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-white py-2 text-[14px] font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
                  {paso >= TOQUE && <span className="pd-mr-onda absolute left-1/2 top-1/2 -ml-10 -mt-10 h-20 w-20 rounded-full bg-[#027eb5]/25" />}
                  <span className={`relative flex items-center gap-1.5 transition-colors duration-300 ${paso >= TOQUE ? "text-[#015a82]" : ""}`}>
                    <IconoResponder />
                    Confirmo
                  </span>
                </span>
                <span className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-[14px] font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
                  <IconoResponder />
                  Necesito cambiarla
                </span>
              </div>
            </div>

            {/* La respuesta del cliente */}
            <div className={`ml-auto mt-1 flex items-end gap-2 rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 shadow-[0_1px_0.5px_rgb(11_20_26/0.13)] ${transicion} ${ver(RESPUESTA)}`}>
              <span className="text-[13.5px] text-[#111b21]">Confirmo</span>
              <span className="flex items-center gap-1 text-[11px] tabular-nums text-[#667781]">
                10:02
                <Palomitas />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── La agenda del negocio ── */}
      <div aria-hidden="true" className="pointer-events-none mx-auto w-full max-w-[460px] select-none md:mx-0">
        <div className="rounded-[18px] border border-n-200 bg-white p-4 shadow-[0_18px_40px_-30px_rgb(43_42_51/0.45)] sm:p-5">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-n-600">Agenda de {negocio}</p>
          <p className="mt-0.5 text-lg font-bold text-n-900 first-letter:uppercase">{dia}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {filas.map((f) => {
              const verde = f.principal ? confirmada : f.hora === filas[0].hora;
              return (
                <li
                  key={`${f.hora}-${f.mascota}`}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-500 motion-reduce:transition-none ${
                    f.principal ? (confirmada ? "pd-mr-pulso border-menta-oscuro/40 bg-menta-suave" : "border-n-300 bg-crema") : "border-n-200 bg-white"
                  }`}
                >
                  <span className="w-11 shrink-0 text-sm font-bold tabular-nums text-n-900">{f.hora}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-n-900">{f.mascota}</span>
                    <span className="block truncate text-xs text-n-600">{f.principal && tipo === "veterinaria" && props.medico ? `${f.servicio} · ${props.medico}` : f.servicio}</span>
                  </span>
                  <Chip confirmada={verde} />
                </li>
              );
            })}
          </ul>
          <p className={`mt-3 flex items-center gap-2 rounded-xl bg-menta-suave px-3 py-2 text-sm font-semibold text-menta-oscuro ${transicion} ${ver(CONFIRMADA)}`}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 10.5l3.5 3.5 7.5-8" />
            </svg>
            <span className="min-w-0 truncate">{cliente} confirmó por WhatsApp</span>
          </p>
        </div>
        <p className="mt-2 text-right text-xs text-n-600">Datos de ejemplo</p>
      </div>
    </div>
  );
}
