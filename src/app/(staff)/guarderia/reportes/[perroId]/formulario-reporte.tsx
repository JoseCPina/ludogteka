"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { useZonaNegocio } from "@/components/zona-negocio";
import { aclarar, luminancia, oscurecer } from "@/lib/reporte/colores";
import { iconoSvg } from "@/lib/reporte/iconos";
import { ETIQUETA_ESTADO, type ColoresTarjeta, type RespuestasReporte, type SeccionPlantilla } from "@/lib/reporte/tipos";
import { copiarDeAyer, dejarListo, enviarReporte, guardarBorrador, regenerarImagen } from "../actions";
import type { MetaReporte } from "../tipos";

const TONO: Record<string, TonoChip> = { sin_reporte: "pendiente", borrador: "proceso", listo: "info", enviado: "exito" };

const hayAlgo = (r: RespuestasReporte) =>
  Object.values(r).some((x) => x.opciones.length > 0 || (x.otro ?? "").trim() !== "" || (x.texto ?? "").trim() !== "");

function Icono({ nombre, color, className }: { nombre: string | null; color: string; className: string }) {
  const svg = iconoSvg(nombre, { color });
  if (!svg) return null;
  return <span aria-hidden="true" className={`block flex-none ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Marca({ marcada, color, redonda = true }: { marcada: boolean; color: string; redonda?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-7 w-7 flex-none place-items-center border-2 ${redonda ? "rounded-full" : "rounded-md"}`}
      style={{ borderColor: color, background: marcada ? color : "#fff" }}
    >
      {marcada && (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke={luminancia(color) > 0.5 ? "#2b2a33" : "#fff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 10.5l3.5 3.5 7.5-8" />
        </svg>
      )}
    </span>
  );
}

function TarjetaSeccion({
  s,
  color,
  resp,
  onCambio,
}: {
  s: SeccionPlantilla;
  color: string;
  resp: { opciones: string[]; otro?: string | null; texto?: string | null };
  onCambio: (r: { opciones: string[]; otro?: string | null; texto?: string | null }) => void;
}) {
  const trazo = s.color === "acento" ? oscurecer(color, 0.2) : color;
  const sobre = luminancia(color) > 0.45 ? oscurecer(color, 0.7) : "#ffffff";
  const alternar = (clave: string) => {
    const esta = resp.opciones.includes(clave);
    if (s.seleccion === "una") onCambio({ ...resp, opciones: esta ? [] : [clave] });
    else onCambio({ ...resp, opciones: esta ? resp.opciones.filter((c) => c !== clave) : [...resp.opciones, clave] });
  };
  const boton = (o: SeccionPlantilla["opciones"][number], variante: "cara" | "icono" | "fila" | "resumen") => {
    const marcada = resp.opciones.includes(o.clave);
    const base = "relative flex w-full items-center rounded-xl border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-1 active:scale-[0.99]";
    const estilo = { borderColor: marcada ? trazo : aclarar(trazo, 0.6), background: marcada ? aclarar(trazo, 0.86) : "#fff" };
    const contenido =
      variante === "cara" || variante === "icono" ? (
        <span className="flex w-full flex-col items-center gap-1.5 px-1 py-3 text-center">
          <Icono nombre={o.icono} color={trazo} className={variante === "cara" ? "h-12 w-12" : "h-10 w-10"} />
          <span className="text-sm font-semibold leading-tight text-n-900">{o.texto}</span>
          <Marca marcada={marcada} color={trazo} />
        </span>
      ) : (
        <span className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5">
          <Marca marcada={marcada} color={trazo} redonda={s.seleccion === "una"} />
          {o.icono && <Icono nombre={o.icono} color={trazo} className="h-9 w-9" />}
          <span className={`text-base leading-snug text-n-900 ${marcada ? "font-bold" : "font-medium"}`}>{o.texto}</span>
        </span>
      );
    return (
      <button
        key={o.clave}
        type="button"
        role={s.seleccion === "una" ? "radio" : "checkbox"}
        aria-checked={marcada}
        onClick={() => alternar(o.clave)}
        className={base}
        style={estilo}
      >
        {contenido}
      </button>
    );
  };

  const rejilla =
    s.presentacion === "caras"
      ? "grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6"
      : s.presentacion === "iconos"
        ? "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4"
        : s.presentacion === "resumen"
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
          : s.columna === "completo"
            ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
            : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2";
  const variante = s.presentacion === "caras" ? "cara" : s.presentacion === "iconos" ? "icono" : s.presentacion === "resumen" ? "resumen" : "fila";

  return (
    <section className="overflow-hidden rounded-2xl border-2 bg-white" style={{ borderColor: aclarar(trazo, 0.5) }} aria-label={s.titulo}>
      <h2 className="flex items-center gap-2.5 px-4 py-3 text-base font-bold uppercase tracking-wide" style={{ background: color, color: sobre }}>
        <Icono nombre={s.icono} color={sobre} className="h-6 w-6" />
        {s.titulo}
        {s.seleccion === "una" && s.presentacion !== "texto" && <span className="ml-auto text-xs font-semibold normal-case opacity-90">Elige una</span>}
      </h2>
      <div className="flex flex-col gap-3 p-3.5">
        {s.presentacion !== "texto" && (
          <div role={s.seleccion === "una" ? "radiogroup" : "group"} aria-label={s.titulo} className={rejilla}>
            {s.opciones.map((o) => boton(o, variante))}
          </div>
        )}
        {s.permite_otro && (
          <label className="flex items-center gap-3 rounded-xl border-2 px-3.5 py-2" style={{ borderColor: aclarar(trazo, 0.6) }}>
            <span className="text-base font-semibold text-n-900">Otro:</span>
            <input
              type="text"
              value={resp.otro ?? ""}
              maxLength={80}
              onChange={(e) => onCambio({ ...resp, otro: e.target.value })}
              className="min-h-11 flex-1 bg-transparent text-base text-n-900 outline-none placeholder:text-n-400"
              placeholder="Escríbelo aquí"
            />
          </label>
        )}
        {s.etiqueta_texto && (
          <label className="flex flex-col gap-1.5">
            <span className="text-base font-bold text-n-900">{s.etiqueta_texto}</span>
            <textarea
              value={resp.texto ?? ""}
              maxLength={600}
              rows={s.presentacion === "texto" ? 5 : 3}
              onChange={(e) => onCambio({ ...resp, texto: e.target.value })}
              className="w-full resize-y rounded-xl border-2 bg-white px-3.5 py-2.5 text-base text-n-900 outline-none focus:border-morado"
              style={{ borderColor: aclarar(trazo, 0.6) }}
              placeholder="Escribe aquí si hace falta"
            />
          </label>
        )}
      </div>
    </section>
  );
}

export function FormularioReporte({
  perroId,
  perroNombre,
  secciones,
  respuestasIniciales,
  buenDia,
  colores,
  metaInicial,
  hayAyer,
  faltaTelefono,
  retencionDias,
}: {
  perroId: string;
  perroNombre: string;
  secciones: SeccionPlantilla[];
  respuestasIniciales: RespuestasReporte;
  buenDia: Record<string, string[]>;
  colores: ColoresTarjeta;
  metaInicial: MetaReporte;
  hayAyer: boolean;
  faltaTelefono: string | null;
  retencionDias: number;
}) {
  const zona = useZonaNegocio();
  const [resp, setResp] = useState<RespuestasReporte>(respuestasIniciales);
  const [meta, setMeta] = useState<MetaReporte>(metaInicial);
  const [estadoGuardado, setEstadoGuardado] = useState<"quieto" | "pendiente" | "guardando" | "guardado" | "error">("quieto");
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [guardadoA, setGuardadoA] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<null | "buen_dia" | "ayer">(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enlaceWa, setEnlaceWa] = useState<string | null>(null);

  const auto = useEspera();
  const listo = useEspera();
  const ayer = useEspera();
  const envio = useEspera();
  const regen = useEspera();

  const autoRef = useRef(auto);
  const respRef = useRef(resp);
  const metaRef = useRef(meta);
  const guardando = useRef(false);
  const pendiente = useRef(false);
  const primera = useRef(true);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    respRef.current = resp;
    autoRef.current = auto;
  });
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const horaDe = useCallback(
    (iso: string) => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: zona }).format(new Date(iso)),
    [zona]
  );
  const diaHoraDe = useCallback(
    (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: zona }).format(new Date(iso)),
    [zona]
  );

  // Un reporte ya enviado no se autoguarda: se corrige con un botón explícito.
  const corrigiendoEnviado = meta.estado === "enviado";
  const sinGuardar = corrigiendoEnviado && JSON.stringify(resp) !== JSON.stringify(respuestasIniciales);

  const guardarAhora = useCallback(async () => {
    if (guardando.current) {
      pendiente.current = true;
      return;
    }
    guardando.current = true;
    setEstadoGuardado("guardando");
    try {
      do {
        pendiente.current = false;
        const r = await autoRef.current.ejecutar(() => guardarBorrador(perroId, respRef.current));
        if (r.error) {
          setErrorGuardado(r.error);
          setEstadoGuardado("error");
        } else {
          setErrorGuardado(null);
          setEstadoGuardado(pendiente.current ? "guardando" : "guardado");
          setGuardadoA(new Date().toISOString());
          if (r.meta) setMeta(r.meta);
        }
      } while (pendiente.current);
    } finally {
      guardando.current = false;
    }
  }, [perroId]);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (metaRef.current.estado === "enviado" || !hayAlgo(resp)) return;
    setEstadoGuardado("pendiente");
    temporizador.current = setTimeout(() => void guardarAhora(), 1200);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, [resp, guardarAhora]);

  const cambiar = (clave: string, nuevo: { opciones: string[]; otro?: string | null; texto?: string | null }) => {
    setExito(null);
    setResp((r) => ({ ...r, [clave]: nuevo }));
  };

  const aplicarBuenDia = () => {
    setConfirmar(null);
    setExito(null);
    setResp((r) => {
      const siguiente = { ...r };
      for (const [clave, opciones] of Object.entries(buenDia)) siguiente[clave] = { ...(r[clave] ?? { opciones: [] }), opciones };
      return siguiente;
    });
  };

  const pedirBuenDia = () => (hayAlgo(resp) ? setConfirmar("buen_dia") : aplicarBuenDia());
  const traerAyer = async () => {
    setConfirmar(null);
    setErrorAccion(null);
    const r = await ayer.ejecutar(() => copiarDeAyer(perroId));
    if (r.error || !r.respuestas) {
      setErrorAccion(r.error ?? "No pudimos traer el reporte anterior.");
      return;
    }
    const nuevas = r.respuestas;
    setExito(null);
    setResp((actual) => {
      const siguiente = { ...actual };
      for (const [clave, v] of Object.entries(nuevas)) siguiente[clave] = { opciones: v.opciones, otro: null, texto: null };
      return siguiente;
    });
  };
  const pedirAyer = () => (hayAlgo(resp) ? setConfirmar("ayer") : void traerAyer());

  const dejarListoAhora = async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setErrorAccion(null);
    setExito(null);
    const r = await listo.ejecutar(() => dejarListo(perroId, respRef.current));
    if (r.meta) setMeta(r.meta);
    if (r.error) {
      setErrorAccion(r.error);
      return;
    }
    setEstadoGuardado("quieto");
    setExito("Reporte listo. Revisa la imagen y envíalo cuando quieras.");
  };

  const regenerar = async () => {
    if (!meta.id) return;
    setErrorAccion(null);
    const r = await regen.ejecutar(() => regenerarImagen(meta.id as string, perroId));
    if (r.meta) setMeta(r.meta);
    if (r.error) setErrorAccion(r.error);
    else setExito("Imagen generada de nuevo.");
  };

  const enviar = async () => {
    if (!meta.id) return;
    setErrorAccion(null);
    setExito(null);
    const r = await envio.ejecutar(() => enviarReporte(meta.id as string, perroId));
    if (r.error || !r.url) {
      setErrorAccion(r.error ?? "No pudimos preparar el mensaje.");
      return;
    }
    if (r.meta) setMeta(r.meta);
    setEnlaceWa(r.url);
    setExito("Se abrió WhatsApp con el mensaje. Si no se abrió, usa el botón verde.");
    window.open(r.url, "_blank", "noopener");
  };

  const estadoMostrado = meta.estado ?? "sin_reporte";
  const vacio = !hayAlgo(resp);
  const izq = secciones.filter((s) => s.columna === "izq");
  const der = secciones.filter((s) => s.columna === "der");
  const completo = secciones.filter((s) => s.columna === "completo");
  const pintar = (lista: SeccionPlantilla[]) =>
    lista.map((s) => <TarjetaSeccion key={s.clave} s={s} color={colores[s.color]} resp={resp[s.clave] ?? { opciones: [] }} onCambio={(n) => cambiar(s.clave, n)} />);

  const textoGuardado =
    estadoGuardado === "guardando"
      ? "Guardando…"
      : estadoGuardado === "pendiente"
        ? "Cambios sin guardar…"
        : estadoGuardado === "error"
          ? "No se pudo guardar"
          : guardadoA
            ? `Guardado automáticamente a las ${horaDe(guardadoA)}`
            : corrigiendoEnviado
              ? "Reporte ya enviado"
              : "Se guarda solo mientras lo llenas";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-28">
      <header className="flex flex-col gap-2">
        <Link href="/guarderia/reportes" className="text-sm font-semibold text-morado hover:underline">
          ← Reportes del día
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-n-900">Reporte de {perroNombre}</h1>
            <Chip tono={TONO[estadoMostrado]}>{ETIQUETA_ESTADO[estadoMostrado]}</Chip>
          </div>
          <p role="status" className={`text-sm ${estadoGuardado === "error" ? "font-semibold text-coral-oscuro" : "text-n-600"}`}>
            {textoGuardado}
          </p>
        </div>
        {errorGuardado && (
          <Alert variante="error" titulo="El autoguardado falló">
            {errorGuardado}
          </Alert>
        )}
      </header>

      {corrigiendoEnviado && (
        <Alert variante="info" titulo="Este reporte ya se envió">
          {meta.enviadoAt ? `Se envió el ${diaHoraDe(meta.enviadoAt)}${meta.enviadoPor ? ` (${meta.enviadoPor})` : ""}. ` : ""}
          Si lo corriges, se guarda la versión anterior, se dibuja la imagen otra vez y hay que volver a enviarlo.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-n-200 bg-white p-3">
        <Button type="button" variante="exito" onClick={pedirBuenDia} className="min-h-14 flex-1 sm:flex-none">
          Buen día
        </Button>
        <Button type="button" variante="secundario" onClick={pedirAyer} cargando={ayer.cargando} disabled={!hayAyer} className="min-h-14 flex-1 sm:flex-none">
          Repetir el de ayer
        </Button>
        <p className="basis-full text-sm text-n-600 sm:basis-auto sm:pl-1">
          {hayAyer ? "Llenan el formulario como borrador; tú los revisas y ajustas." : "«Repetir el de ayer» aparece cuando este perro ya tiene un reporte anterior."}
        </p>
        {confirmar && (
          <div role="alertdialog" aria-label="Confirmar" className="flex basis-full flex-wrap items-center gap-2.5 rounded-xl bg-ambar-suave p-3 text-ambar-oscuro">
            <p className="flex-1 text-sm font-semibold">
              {confirmar === "buen_dia" ? "Esto cambia lo que ya marcaste en las secciones del atajo." : "Esto reemplaza las opciones que ya marcaste con las del último reporte."}
            </p>
            <Button type="button" variante="primario" onClick={confirmar === "buen_dia" ? aplicarBuenDia : () => void traerAyer()}>
              Sí, llenar
            </Button>
            <Button type="button" variante="secundario" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">{pintar(izq)}</div>
        <div className="flex flex-col gap-5">{pintar(der)}</div>
        {completo.length > 0 && <div className="flex flex-col gap-5 lg:col-span-2">{pintar(completo)}</div>}
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border-2 border-n-200 bg-white p-4" aria-label="Imagen y envío">
        <h2 className="text-lg font-bold text-n-900">Imagen para el dueño</h2>

        {meta.tarjetaVigente && meta.tarjetaUrl ? (
          <div className="flex flex-col items-start gap-4 md:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={meta.tarjetaUrl} alt={`Reporte de ${perroNombre}`} width={1080} height={1350} className="w-full max-w-sm rounded-xl border border-n-200" />
            <div className="flex flex-col gap-3 md:flex-1">
              <p className="text-sm text-n-700">
                {meta.estado === "enviado" && meta.enviadoAt
                  ? `Enviado el ${diaHoraDe(meta.enviadoAt)}${meta.enviadoPor ? ` por ${meta.enviadoPor}` : ""}${meta.envios > 1 ? ` · ${meta.envios} envíos` : ""}.`
                  : "Todavía no se ha enviado."}{" "}
                Se manda una liga a la tarjeta, nunca la imagen como archivo.
              </p>
              <p className="text-sm text-n-600">Se borra en {retencionDias} días{meta.tarjetaExpiraAt ? ` (${diaHoraDe(meta.tarjetaExpiraAt)})` : ""}; el reporte queda guardado y se puede dibujar de nuevo.</p>
              {faltaTelefono && <Alert variante="advertencia" titulo="No se puede enviar todavía">{faltaTelefono}</Alert>}
              <AccionesFormulario error={errorAccion} exito={exito}>
                <Button type="button" onClick={enviar} cargando={envio.cargando} disabled={Boolean(faltaTelefono) || sinGuardar} className="min-h-14">
                  {meta.estado === "enviado" ? "Reenviar por WhatsApp" : "Enviar por WhatsApp"}
                </Button>
                {meta.descargaUrl && (
                  <a
                    href={meta.descargaUrl}
                    download
                    className="inline-flex min-h-14 items-center justify-center rounded-md border-[1.5px] border-borde bg-white px-5 text-base font-semibold text-n-900 hover:bg-n-100"
                  >
                    Descargar imagen
                  </a>
                )}
              </AccionesFormulario>
              {enlaceWa && (
                <a href={enlaceWa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-md bg-menta px-5 font-semibold text-morado hover:bg-menta-hover">
                  Abrir WhatsApp
                </a>
              )}
            </div>
          </div>
        ) : meta.tarjetaVencida && meta.id ? (
          <div className="flex flex-col gap-3">
            <Alert variante="advertencia" titulo={meta.estado === "listo" || meta.estado === "enviado" ? "La imagen ya no está disponible" : "La imagen quedó vieja"}>
              Los datos del reporte se conservan. Genera la imagen de nuevo para verla o enviarla.
            </Alert>
            <AccionesFormulario error={errorAccion} exito={exito}>
              <Button type="button" onClick={regenerar} cargando={regen.cargando} className="min-h-14">
                Generar imagen de nuevo
              </Button>
            </AccionesFormulario>
          </div>
        ) : (
          <p className="text-sm text-n-600">Cuando dejes el reporte listo aparece aquí la imagen para revisarla y enviarla.</p>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-n-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="hidden text-sm text-n-600 sm:block">{vacio ? "Marca algo para empezar." : textoGuardado}</p>
          <AccionesFormulario error={!meta.tarjetaVigente ? errorAccion : null} exito={!meta.tarjetaVigente ? exito : null} className="w-full sm:w-auto">
            <Button type="button" onClick={dejarListoAhora} cargando={listo.cargando} disabled={vacio || (corrigiendoEnviado && !sinGuardar)} className="min-h-14 w-full sm:w-auto">
              {corrigiendoEnviado ? "Guardar corrección y generar imagen" : estadoMostrado === "listo" || estadoMostrado === "enviado" ? "Dejar listo otra vez" : "Dejar listo"}
            </Button>
          </AccionesFormulario>
        </div>
      </div>
    </div>
  );
}
