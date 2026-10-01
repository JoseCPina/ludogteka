"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Chip } from "@/components/ui/chip";
import { useEspera } from "@/hooks/use-espera";
import { conTope, mensajeDeFallo } from "@/lib/ui/espera";
import { ArchivoRechazado, prepararArchivo, type ArchivoPreparado } from "@/lib/media/preparar";
import { subirConProgreso } from "@/lib/media/subir";
import { confirmarSubida, enviarGaleria, listarMediaPerro, prepararSubida, quitarMedia, type MediaVigente } from "./actions";

export type PerroAdentroDato = {
  perroId: string;
  nombre: string;
  /** Etiquetas de su estancia actual: «Hotel», «Guardería». */
  etiquetas: string[];
  tieneGuarderia: boolean;
  sinTelefono: boolean;
  /** Estado del reporte de hoy (solo guardería): sin_reporte | borrador | listo | enviado */
  reporte: string | null;
};

type Subida = {
  key: string;
  nombre: string;
  tipo: "foto" | "video";
  estado: "preparando" | "subiendo" | "error";
  texto: string;
  progreso: number;
  error?: string;
  reintentable?: boolean;
};

const TOPE_SERVIDOR_MS = 30_000;
const ETIQUETA_REPORTE: Record<string, string> = { sin_reporte: "Sin reporte", borrador: "Borrador", listo: "Listo", enviado: "Enviado" };
const TONO_REPORTE: Record<string, "pendiente" | "proceso" | "info" | "exito"> = { sin_reporte: "pendiente", borrador: "proceso", listo: "info", enviado: "exito" };

function IconoCamara() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function IconoVideo() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10.5l5-3v9l-5-3z" />
    </svg>
  );
}
function IconoGaleria() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </svg>
  );
}
function IconoReporte() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </svg>
  );
}

const claseBoton =
  "inline-flex min-h-14 flex-1 basis-[calc(50%-0.5rem)] items-center justify-center gap-2 rounded-lg border-[1.5px] border-borde bg-white px-3 py-2 text-base font-semibold text-n-900 transition-colors hover:bg-n-100 active:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2 md:basis-0 [-webkit-tap-highlight-color:transparent]";

export function PerroAdentro({ dato, permiso, retencion }: { dato: PerroAdentroDato; permiso: boolean; retencion: number }) {
  const [abierto, setAbierto] = useState(false);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [media, setMedia] = useState<MediaVigente[] | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const envio = useEspera();
  const quitar = useEspera();
  const fila = useRef<Promise<void>>(Promise.resolve());
  const preparados = useRef(new Map<string, { prep: ArchivoPreparado; perroId: string }>());
  const refFoto = useRef<HTMLInputElement>(null);
  const refVideo = useRef<HTMLInputElement>(null);
  const refGaleria = useRef<HTMLInputElement>(null);

  const actualizar = useCallback((key: string, cambios: Partial<Subida>) => {
    setSubidas((s) => s.map((x) => (x.key === key ? { ...x, ...cambios } : x)));
  }, []);

  const refrescar = useCallback(
    async (nuevoId?: string) => {
      const r = await conTope(listarMediaPerro(dato.perroId), TOPE_SERVIDOR_MS).catch((e) => ({ error: mensajeDeFallo(e), items: [] as MediaVigente[] }));
      if (r.error) setError(r.error);
      else setMedia(r.items);
      if (nuevoId) setSeleccion((s) => new Set(s).add(nuevoId));
    },
    [dato.perroId]
  );

  async function subirPreparado(key: string) {
    const guardado = preparados.current.get(key);
    if (!guardado) return;
    const { prep } = guardado;
    actualizar(key, { estado: "subiendo", texto: "Subiendo…", progreso: 0, error: undefined });
    try {
      const pre = await conTope(prepararSubida(dato.perroId, prep.tipo, prep.mime), TOPE_SERVIDOR_MS);
      if (pre.error || !pre.id || !pre.urlFirmada) throw new Error(pre.error ?? "No pudimos preparar la subida.");
      await subirConProgreso({
        url: pre.urlFirmada,
        blob: prep.blob,
        onProgreso: (f) => actualizar(key, { progreso: f }),
        onReintento: (n) => actualizar(key, { texto: `Se cortó la conexión. Reintentando (${n} de 3)…`, progreso: 0 }),
      });
      actualizar(key, { texto: "Guardando…", progreso: 1 });
      const conf = await conTope(confirmarSubida(pre.id, prep.duracion), TOPE_SERVIDOR_MS);
      if (conf.error) throw new Error(conf.error);
      preparados.current.delete(key);
      setSubidas((s) => s.filter((x) => x.key !== key));
      await refrescar(pre.id);
    } catch (e) {
      actualizar(key, { estado: "error", error: e instanceof Error ? mensajeDeFallo(e) : "No se pudo subir.", texto: "" });
    }
  }

  function agregarArchivos(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setAbierto(true);
    setError(null);
    if (media === null) void refrescar();
    for (const archivo of Array.from(archivos)) {
      const key = crypto.randomUUID();
      const esVideo = archivo.type.startsWith("video/");
      setSubidas((s) => [...s, { key, nombre: archivo.name, tipo: esVideo ? "video" : "foto", estado: "preparando", texto: esVideo ? "Revisando el video…" : "Preparando la foto…", progreso: 0 }]);
      // Uno por uno: el celular no aguanta tres videos comprimiéndose a la vez.
      fila.current = fila.current.then(async () => {
        try {
          const prep = await prepararArchivo(archivo, (texto, f) => actualizar(key, { texto, progreso: f ?? 0 }));
          preparados.current.set(key, { prep, perroId: dato.perroId });
          actualizar(key, { tipo: prep.tipo, reintentable: true });
          await subirPreparado(key);
        } catch (e) {
          actualizar(key, { estado: "error", error: e instanceof ArchivoRechazado ? e.message : "No pudimos preparar ese archivo.", texto: "" });
        }
      });
    }
  }

  function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    agregarArchivos(e.target.files);
    e.target.value = "";
  }

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function quitarUno(id: string) {
    const res = await quitar.ejecutar(() => quitarMedia(id));
    setQuitando(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSeleccion((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setMedia((m) => (m ?? []).filter((x) => x.id !== id));
  }

  async function enviar() {
    setError(null);
    // Se abre la pestaña ya, dentro del toque: iPhone bloquea las que se abren después de una espera.
    const ventana = window.open("", "_blank");
    const res = await envio.ejecutar(() => enviarGaleria(dato.perroId, Array.from(seleccion)));
    if (res.error || !res.whatsapp) {
      ventana?.close();
      setError(res.error ?? "No pudimos preparar el mensaje.");
      return;
    }
    if (ventana) ventana.location.href = res.whatsapp;
    else window.location.href = res.whatsapp;
  }

  const nSel = seleccion.size;
  const ocupado = subidas.some((s) => s.estado !== "error");
  const reporte = dato.reporte ?? null;

  return (
    <li className="rounded-xl border border-n-200 bg-white p-4 shadow-sm" data-perro={dato.nombre}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold text-n-900">{dato.nombre}</h3>
        <span className="flex flex-wrap gap-1.5">
          {dato.etiquetas.map((e) => (
            <Chip key={e} tono="info" punto={false}>
              {e}
            </Chip>
          ))}
        </span>
        {reporte && dato.tieneGuarderia && (
          <Chip tono={TONO_REPORTE[reporte] ?? "neutro"} className="ml-auto">
            Reporte: {ETIQUETA_REPORTE[reporte] ?? reporte}
          </Chip>
        )}
      </div>

      {permiso && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={claseBoton} onClick={() => refFoto.current?.click()}>
              <IconoCamara /> Tomar foto
            </button>
            <button type="button" className={claseBoton} onClick={() => refVideo.current?.click()}>
              <IconoVideo /> Tomar video
            </button>
            <button type="button" className={claseBoton} onClick={() => refGaleria.current?.click()}>
              <IconoGaleria /> Elegir de la galería
            </button>
            {dato.tieneGuarderia && (
              <Link href={`/guarderia/reportes/${dato.perroId}`} className={`${claseBoton} border-morado text-morado`}>
                <IconoReporte /> Reporte
              </Link>
            )}
          </div>
          <input ref={refFoto} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label={`Tomar foto de ${dato.nombre}`} onChange={alElegir} />
          <input ref={refVideo} type="file" accept="video/*" capture="environment" className="sr-only" tabIndex={-1} aria-label={`Tomar video de ${dato.nombre}`} onChange={alElegir} />
          <input ref={refGaleria} type="file" accept="image/*,video/*" multiple className="sr-only" tabIndex={-1} aria-label={`Elegir fotos o videos de ${dato.nombre}`} onChange={alElegir} />

          {!abierto && (
            <button
              type="button"
              onClick={() => {
                setAbierto(true);
                void refrescar();
              }}
              className="mt-3 min-h-11 text-sm font-semibold text-morado hover:underline"
            >
              Ver lo subido y enviar al dueño
            </button>
          )}

          {abierto && (
            <div className="mt-4 flex flex-col gap-3 border-t border-n-200 pt-4">
              <p className="text-sm text-n-600">
                Se borra en {retencion} {retencion === 1 ? "día" : "días"}: lo que subas aquí solo vive ese tiempo.
              </p>
              {error && <Alert variante="error" titulo="No se pudo">{error}</Alert>}

              {subidas.length > 0 && (
                <ul className="flex flex-col gap-2" aria-live="polite">
                  {subidas.map((s) => (
                    <li key={s.key} className="rounded-lg border border-n-200 bg-n-50 p-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-semibold text-n-900">{s.tipo === "video" ? "Video" : "Foto"} · {s.nombre}</span>
                        {s.estado !== "error" && <span className="shrink-0 text-n-600">{Math.round(s.progreso * 100)} %</span>}
                      </div>
                      {s.estado === "error" ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-sm text-coral-oscuro">{s.error}</p>
                          {s.reintentable && (
                            <Button type="button" variante="secundario" className="min-h-11" onClick={() => void subirPreparado(s.key)}>
                              Reintentar
                            </Button>
                          )}
                          <button type="button" className="min-h-11 px-2 text-sm font-semibold text-n-600 hover:underline" onClick={() => setSubidas((x) => x.filter((y) => y.key !== s.key))}>
                            Descartar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-n-200" role="progressbar" aria-valuenow={Math.round(s.progreso * 100)} aria-valuemin={0} aria-valuemax={100}>
                            <div className="h-full rounded-full bg-morado transition-[width] duration-200" style={{ width: `${Math.round(s.progreso * 100)}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-n-600">{s.texto}</p>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {media === null ? (
                <p className="text-sm text-n-600">Cargando…</p>
              ) : media.length === 0 ? (
                <p className="text-sm text-n-600">Todavía no hay fotos ni videos vigentes de {dato.nombre}.</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-n-700">Marca los que quieres mandar al dueño</p>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {media.map((m) => {
                      const marcado = seleccion.has(m.id);
                      return (
                        <li key={m.id} className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => alternar(m.id)}
                            aria-pressed={marcado}
                            aria-label={`${m.tipo === "video" ? "Video" : "Foto"} ${marcado ? "incluido" : "no incluido"}`}
                            className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado ${marcado ? "border-morado" : "border-transparent"}`}
                          >
                            {m.url &&
                              (m.tipo === "video" ? (
                                <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.url} alt="" className="h-full w-full object-cover" />
                              ))}
                            {m.tipo === "video" && (
                              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 text-xs font-semibold text-white">
                                ▶ {m.duracion ? `${Math.round(m.duracion)} s` : "Video"}
                              </span>
                            )}
                            <span
                              aria-hidden="true"
                              className={`absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-bold ${marcado ? "border-morado bg-morado text-white" : "border-white bg-black/30 text-transparent"}`}
                            >
                              ✓
                            </span>
                          </button>
                          <p className="text-xs text-n-600">{m.borra}</p>
                          {quitando === m.id ? (
                            <div className="flex gap-2">
                              <button type="button" className="min-h-11 flex-1 rounded-md bg-coral-oscuro px-2 text-sm font-semibold text-white" onClick={() => void quitarUno(m.id)}>
                                Sí, quitar
                              </button>
                              <button type="button" className="min-h-11 flex-1 rounded-md border border-borde px-2 text-sm font-semibold" onClick={() => setQuitando(null)}>
                                No
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="min-h-11 text-left text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => setQuitando(m.id)}>
                              Quitar
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <div className="flex flex-col gap-2">
                {dato.sinTelefono ? (
                  <Button type="button" disabled className="w-full sm:w-auto">
                    Falta el teléfono del dueño
                  </Button>
                ) : (
                  <Button type="button" variante="exito" cargando={envio.cargando} disabled={nSel === 0 || ocupado} onClick={enviar} className="w-full sm:w-auto">
                    {nSel === 0 ? "Escoge algo para enviar" : `Enviar por WhatsApp (${nSel})`}
                  </Button>
                )}
                {dato.sinTelefono && <p className="text-sm text-n-600">Captura su teléfono en la ficha del cliente para poder mandárselo por WhatsApp.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </li>
  );
}
