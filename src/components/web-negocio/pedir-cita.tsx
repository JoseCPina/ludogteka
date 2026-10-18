"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarCheck, Check, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { hoyNegocio } from "@/lib/formato";
import { type HorarioSemana, diasAbiertos, diasEntre, hora12, horasDelDia, sumarDias, diaSemana } from "@/lib/web-negocio/horario";
import { type ServicioWeb, type DatosPedido, mensajeSolicitud, mensajesAlCliente, pesosMx } from "@/lib/web-negocio/catalogo";
import { ChatWhatsApp } from "./chat-whatsapp";
import { EVENTO_PEDIR } from "./boton-pedir";

type Props = {
  catalogo: ServicioWeb[];
  horario: HorarioSemana;
  zona: string;
  negocio: string;
  /** demo: nada sale de la página, se muestra lo que pasaría. real: abre WhatsApp con la solicitud al negocio. */
  modo: "demo" | "real";
  telefono: string | null;
  preciosDeEjemplo: boolean;
  /** Lo que se dice de PeluDesk junto al resultado de la demostración. */
  notaDemo?: ReactNode;
};

const fechaLarga = (iso: string) => new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const mesCorto = (iso: string) => new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

function ahoraEn(zona: string): { fecha: string; minutos: number } {
  const p = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona }).formatToParts(new Date());
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { fecha: hoyNegocio(zona), minutos: v("hour") * 60 + v("minute") };
}

const PASOS = ["Servicio", "Cuándo", "Tus datos"];

export function PedirCita({ catalogo, horario, zona, negocio, modo, telefono, preciosDeEjemplo, notaDemo }: Props) {
  const [paso, setPaso] = useState(0);
  const [servicio, setServicio] = useState<ServicioWeb | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [salida, setSalida] = useState<string | null>(null);
  const [mascota, setMascota] = useState(modo === "demo" ? "Luna" : "");
  const [cliente, setCliente] = useState(modo === "demo" ? "Ana López" : "");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<DatosPedido | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  // Los botones de la página («Agendar» de un servicio) llegan con el servicio escogido.
  useEffect(() => {
    const escoger = (e: Event) => {
      const s = catalogo.find((x) => x.clave === (e as CustomEvent<string>).detail);
      if (!s) return;
      setServicio(s);
      setDia(null);
      setHora(null);
      setSalida(null);
      setListo(null);
      setError(null);
      setPaso(1);
    };
    window.addEventListener(EVENTO_PEDIR, escoger);
    return () => window.removeEventListener(EVENTO_PEDIR, escoger);
  }, [catalogo]);

  // Solo se calculan al llegar al paso 2 (ya en el navegador): así el servidor no pinta fechas.
  const ahora = useMemo(() => (paso >= 1 ? ahoraEn(zona) : null), [paso, zona]);
  const dias = useMemo(() => {
    if (!ahora || !servicio) return [];
    const lista = diasAbiertos(horario, ahora.fecha, 12);
    // Hoy ya no cuenta para una cita si no le quedan horas.
    return servicio.modo === "cita" ? lista.filter((f) => horasDelDia(horario, f, servicio.duracionMin, ahora).length > 0) : lista;
  }, [ahora, servicio, horario]);
  const horas = useMemo(() => (servicio?.modo === "cita" && dia && ahora ? horasDelDia(horario, dia, servicio.duracionMin, ahora) : []), [servicio, dia, ahora, horario]);
  const salidas = useMemo(() => (servicio?.modo === "noches" && dia ? diasAbiertos(horario, sumarDias(dia, 1), 10) : []), [servicio, dia, horario]);
  const noches = dia && salida ? diasEntre(dia, salida) : 0;

  const ir = (n: number) => {
    setError(null);
    setPaso(n);
    requestAnimationFrame(() => caja.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const siguiente = () => {
    if (paso === 0 && !servicio) return setError("Escoge un servicio.");
    if (paso === 1) {
      if (!dia) return setError(servicio?.modo === "noches" ? "Escoge el día de llegada." : "Escoge un día.");
      if (servicio?.modo === "cita" && !hora) return setError("Escoge una hora.");
      if (servicio?.modo === "noches" && !salida) return setError("Escoge el día de salida.");
    }
    ir(paso + 1);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mascota.trim()) return setError("Escribe el nombre de tu mascota.");
    if (!cliente.trim()) return setError("Escribe tu nombre.");
    if (!servicio || !dia) return;
    const d = horario[diaSemana(salida ?? dia)];
    const datos: DatosPedido = {
      negocio,
      servicio,
      mascota: mascota.trim(),
      cliente: cliente.trim(),
      dia: fechaLarga(dia),
      hora: hora ? hora12(hora) : null,
      salida: salida ? fechaLarga(salida) : null,
      noches,
      abre: d ? hora12(d.abre) : null,
      cierra: d ? hora12(d.cierra) : null,
    };
    if (modo === "real") {
      if (!telefono) return setError("Este negocio todavía no tiene WhatsApp en su página. Llámales para pedir tu cita.");
      window.open(`https://wa.me/52${telefono}?text=${encodeURIComponent(mensajeSolicitud(datos))}`, "_blank", "noopener,noreferrer");
    }
    setListo(datos);
    requestAnimationFrame(() => caja.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const reiniciar = () => {
    setListo(null);
    setServicio(null);
    setDia(null);
    setHora(null);
    setSalida(null);
    ir(0);
  };

  const chip = (activo: boolean) =>
    `min-h-11 rounded-[var(--w-radio-chico)] border-[1.5px] px-3 text-sm font-semibold transition-colors ${
      activo ? "border-[var(--w-acento)] bg-[var(--w-acento)] text-white" : "border-black/15 bg-white text-[var(--w-tinta)] hover:border-[var(--w-acento)]"
    }`;
  const boton = { background: "var(--w-acento)", color: "#fff" };

  if (listo) {
    return (
      <div ref={caja} data-pedido-listo className="flex min-w-0 scroll-mt-24 flex-col gap-6">
        <div className="flex items-start gap-3 rounded-[var(--w-radio-tarjeta)] bg-white p-5 shadow-sm ring-1 ring-black/5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: "var(--w-acento)" }} aria-hidden>
            <Check size={22} weight="bold" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-snug">{modo === "demo" ? "Solicitud lista" : "Te abrimos WhatsApp con tu solicitud"}</p>
            <p className="mt-1 text-[15px] text-black/70">
              {listo.servicio.nombre} para {listo.mascota} ·{" "}
              {listo.servicio.modo === "noches" ? `${listo.dia} al ${listo.salida} (${listo.noches} ${listo.noches === 1 ? "noche" : "noches"})` : `${listo.dia}${listo.hora ? `, ${listo.hora}` : ""}`}
            </p>
            {modo === "real" && <p className="mt-2 text-sm text-black/70">Mándala desde WhatsApp y {negocio} te confirma por ahí.</p>}
          </div>
        </div>
        {modo === "demo" && (
          <>
            <div className="flex flex-col gap-3">
              <h3 className="text-xl font-bold" style={{ fontFamily: "var(--w-titulos)" }}>
                Esto le llega a tu cliente por WhatsApp
              </h3>
              <ChatWhatsApp negocio={negocio} mensajes={mensajesAlCliente(listo)} />
            </div>
            {notaDemo}
          </>
        )}
        <div>
          <Button type="button" variante="secundario" onClick={reiniciar} data-otra-solicitud>
            {modo === "demo" ? "Probar otro servicio" : "Pedir otra cita"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={caja} data-pedir-cita className="min-w-0 scroll-mt-24 rounded-[var(--w-radio-tarjeta)] bg-white p-4 shadow-[0_20px_50px_-30px_rgba(0,0,0,.35)] ring-1 ring-black/5 sm:p-6">
      <ol className="mb-5 flex items-center gap-2 text-xs font-semibold" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} className={`flex items-center gap-1.5 ${i <= paso ? "text-[var(--w-tinta)]" : "text-black/40"}`} aria-current={i === paso ? "step" : undefined}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] text-white" style={{ background: i <= paso ? "var(--w-acento)" : "rgba(0,0,0,.25)" }}>
              {i < paso ? <Check size={12} weight="bold" aria-hidden /> : i + 1}
            </span>
            {p}
            {i < PASOS.length - 1 && <span className="mx-1 h-px w-4 bg-black/15" aria-hidden />}
          </li>
        ))}
      </ol>

      {paso === 0 && (
        <fieldset className="min-w-0">
          <legend className="mb-3 text-lg font-bold">¿Qué servicio quieres?</legend>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {catalogo.map((s) => (
              <li key={s.clave}>
                <label
                  className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-[var(--w-radio-chico)] border-[1.5px] p-3.5 transition-colors ${
                    servicio?.clave === s.clave ? "border-[var(--w-acento)] bg-[var(--w-suave)]" : "border-black/12 hover:border-[var(--w-acento)]"
                  }`}
                >
                  <input type="radio" name="servicio" className="mt-1 accent-[var(--w-acento)]" checked={servicio?.clave === s.clave} onChange={() => setServicio(s)} data-servicio={s.clave} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{s.nombre}</span>
                      {s.precio != null && (
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {s.unidad === "desde" ? "desde " : ""}
                          {pesosMx(s.precio)}
                        </span>
                      )}
                    </span>
                    {s.descripcion && <span className="mt-0.5 block text-sm text-black/65">{s.descripcion}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {preciosDeEjemplo && <p className="mt-2 text-xs text-black/55">Precios de ejemplo.</p>}
        </fieldset>
      )}

      {paso === 1 && servicio && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-black/65">
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-[var(--w-acento)]" onClick={() => ir(0)}>
              <ArrowLeft size={14} weight="bold" aria-hidden /> {servicio.nombre}
            </button>
          </p>
          <fieldset className="min-w-0">
            <legend className="mb-2.5 text-lg font-bold">{servicio.modo === "noches" ? "¿Qué día llega?" : "¿Qué día?"}</legend>
            {dias.length === 0 ? (
              <p className="text-sm text-black/65">No hay días disponibles en las próximas semanas.</p>
            ) : (
              <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" role="radiogroup">
                {dias.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={dia === f}
                    data-dia={f}
                    className={`${chip(dia === f)} flex min-w-[64px] shrink-0 snap-start flex-col items-center justify-center py-1.5 leading-tight`}
                    onClick={() => {
                      setDia(f);
                      setHora(null);
                      setSalida(null);
                    }}
                  >
                    <span className="text-[11px] font-medium capitalize opacity-80">{f === ahora?.fecha ? "Hoy" : fechaCorta(f).split(" ")[0]}</span>
                    <span className="text-lg">{Number(f.slice(8))}</span>
                    <span className="text-[11px] font-medium opacity-80">{mesCorto(f)}</span>
                  </button>
                ))}
              </div>
            )}
          </fieldset>
          {servicio.modo === "cita" && dia && (
            <fieldset className="min-w-0">
              <legend className="mb-2.5 text-lg font-bold">¿A qué hora?</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup">
                {horas.map((h) => (
                  <button key={h} type="button" role="radio" aria-checked={hora === h} data-hora={h} className={chip(hora === h)} onClick={() => setHora(h)}>
                    {hora12(h)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {servicio.modo === "noches" && dia && (
            <fieldset className="min-w-0">
              <legend className="mb-2.5 text-lg font-bold">¿Qué día sale?</legend>
              <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" role="radiogroup">
                {salidas.map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={salida === f} data-salida={f} className={`${chip(salida === f)} flex min-w-[64px] shrink-0 snap-start flex-col items-center justify-center py-1.5 leading-tight`} onClick={() => setSalida(f)}>
                    <span className="text-[11px] font-medium capitalize opacity-80">{fechaCorta(f).split(" ")[0]}</span>
                    <span className="text-lg">{Number(f.slice(8))}</span>
                    <span className="text-[11px] font-medium opacity-80">{mesCorto(f)}</span>
                  </button>
                ))}
              </div>
              {salida && (
                <p className="mt-2 text-sm font-semibold" data-noches>
                  {noches} {noches === 1 ? "noche" : "noches"}
                  {servicio.precio != null && <span className="font-normal text-black/65"> · {pesosMx(servicio.precio * noches)}{preciosDeEjemplo ? " (ejemplo)" : ""}</span>}
                </p>
              )}
            </fieldset>
          )}
        </div>
      )}

      {paso === 2 && servicio && dia && (
        <form id="form-pedir" onSubmit={enviar} className="flex flex-col gap-4" noValidate>
          <p className="flex items-start gap-2 rounded-[var(--w-radio-chico)] bg-[var(--w-suave)] p-3 text-[15px]">
            <CalendarCheck size={20} className="mt-0.5 shrink-0 text-[var(--w-acento)]" aria-hidden />
            <span>
              <b>{servicio.nombre}</b> ·{" "}
              {servicio.modo === "noches" ? `${fechaLarga(dia)} al ${salida ? fechaLarga(salida) : ""}` : `${fechaLarga(dia)}${hora ? `, ${hora12(hora)}` : ""}`}{" "}
              <button type="button" className="ml-1 font-semibold text-[var(--w-acento)] underline" onClick={() => ir(1)}>
                Cambiar
              </button>
            </span>
          </p>
          <Field label="Nombre de tu mascota" name="mascota" value={mascota} onChange={(e) => setMascota(e.target.value)} autoComplete="off" required />
          <Field label="Tu nombre" name="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} autoComplete="name" required />
        </form>
      )}

      {error && (
        <div className="mt-4">
          <Alert variante="error" titulo="Falta información">{error}</Alert>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {paso > 0 && (
          <Button type="button" variante="secundario" onClick={() => ir(paso - 1)}>
            Atrás
          </Button>
        )}
        {paso < 2 ? (
          <Button key="siguiente" type="button" style={boton} onClick={siguiente} data-siguiente>
            Siguiente
          </Button>
        ) : (
          <Button key="confirmar" type="submit" form="form-pedir" style={boton} data-confirmar-pedido>
            {modo === "real" && <WhatsappLogo size={20} weight="fill" aria-hidden />}
            {modo === "real" ? "Enviar por WhatsApp" : servicio?.modo === "cita" ? "Pedir cita" : "Pedir reserva"}
          </Button>
        )}
        {modo === "demo" && <span className="ml-auto text-xs text-black/45" data-modo-demostracion>Modo demostración: no se guarda nada</span>}
      </div>
    </div>
  );
}
