"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { CATALOGO_ICONOS, iconoSvg } from "@/lib/reporte/iconos";
import type { ColoresTarjeta, ConfigReporte, SeccionPlantilla } from "@/lib/reporte/tipos";
import { COLORES, COLUMNAS, PRESENTACIONES, type OpcionEditable, type SeccionEditable } from "./tipos";
import { crearSeccion, guardarConfig, guardarSeccion, moverSeccion, vistaPreviaTarjeta } from "./actions";

// Tras guardar se recarga la página y el formulario se vuelve a armar con lo
// que quedó en la base (así las opciones nuevas ya traen su id): el aviso de
// "guardado" sobrevive a esa recarga aquí.
const recien = new Set<string>();

const campo = "min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3 text-base text-n-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado";
const etiqueta = "flex flex-col gap-1.5 text-sm font-semibold text-n-800";

function SelectorIcono({ valor, onChange, etiquetaTexto }: { valor: string | null; onChange: (v: string | null) => void; etiquetaTexto: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 flex-none place-items-center rounded-md border border-n-200 bg-n-50 p-1.5"
        dangerouslySetInnerHTML={{ __html: iconoSvg(valor, { color: "#4b3f72" }) }}
      />
      <select aria-label={etiquetaTexto} value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)} className={campo}>
        <option value="">Sin ícono</option>
        {CATALOGO_ICONOS.map((i) => (
          <option key={i.clave} value={i.clave}>
            {i.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Título, subtítulo, colores y retención ──

function FormConfig({ config, conReporte, coloresMarca }: { config: ConfigReporte | null; conReporte: boolean; coloresMarca: ColoresTarjeta }) {
  const router = useRouter();
  const envio = useEspera();
  const [titulo, setTitulo] = useState(config?.titulo ?? "REPORTE DE COMPORTAMIENTO");
  const [subtitulo, setSubtitulo] = useState(config?.subtitulo ?? "");
  const [primario, setPrimario] = useState<string | null>(config?.color_primario ?? null);
  const [secundario, setSecundario] = useState<string | null>(config?.color_secundario ?? null);
  const [acento, setAcento] = useState<string | null>(config?.color_acento ?? null);
  const [dias, setDias] = useState(String(config?.retencion_dias ?? 7));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(recien.delete("config"));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    const r = await envio.ejecutar(() =>
      guardarConfig({ titulo, subtitulo, color_primario: primario, color_secundario: secundario, color_acento: acento, retencion_dias: Number(dias) })
    );
    if (r.error) setError(r.error);
    else {
      recien.add("config");
      router.refresh();
    }
  };

  const color = (nombre: string, valor: string | null, set: (v: string | null) => void, porOmision: string) => (
    <div className={etiqueta}>
      <span>{nombre}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={nombre}
          value={valor ?? porOmision}
          onChange={(e) => set(e.target.value.toUpperCase())}
          className="h-12 w-16 cursor-pointer rounded-md border-[1.5px] border-borde bg-white p-1"
        />
        <span className="text-sm font-normal text-n-600">{valor ? valor : "Los de tu marca"}</span>
        {valor && (
          <button type="button" onClick={() => set(null)} className="min-h-11 text-sm font-semibold text-morado hover:underline">
            Usar los de la marca
          </button>
        )}
      </div>
    </div>
  );

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4 rounded-xl border border-n-200 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-bold text-n-900">{conReporte ? "Encabezado, colores y retención" : "Retención"}</h2>
      {conReporte && (
        <>
          <label className={etiqueta}>
            Título de la tarjeta
            <input value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} className={campo} required />
          </label>
          <label className={etiqueta}>
            Subtítulo
            <input value={subtitulo} maxLength={90} onChange={(e) => setSubtitulo(e.target.value)} className={campo} placeholder="Una frase corta para el dueño" />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            {color("Color principal", primario, setPrimario, coloresMarca.primario)}
            {color("Color secundario", secundario, setSecundario, coloresMarca.secundario)}
            {color("Color de acento", acento, setAcento, coloresMarca.acento)}
          </div>
          <p className="text-sm text-n-600">El logo es el de tu negocio (Perfil y página web). Si no cambias los colores, la tarjeta usa los de tu marca.</p>
        </>
      )}
      <label className={`${etiqueta} sm:max-w-xs`}>
        Días que viven las fotos, los videos y las ligas
        <input type="number" min={1} max={30} inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className={campo} required />
        <span className="text-xs font-normal text-n-600">Pasado ese tiempo se borran del almacenamiento y la liga deja de funcionar. El reporte (sus datos) se conserva.</span>
      </label>
      <AccionesFormulario error={error} exito={ok && "Cambios guardados"}>
        <Button type="submit" cargando={envio.cargando}>
          Guardar
        </Button>
      </AccionesFormulario>
    </form>
  );
}

// ── Una sección con sus opciones ──

function FormSeccion({ s, indice, total }: { s: SeccionPlantilla; indice: number; total: number }) {
  const router = useRouter();
  const envio = useEspera();
  const mover = useEspera();
  const [d, setD] = useState<SeccionEditable>({
    id: s.id,
    titulo: s.titulo,
    presentacion: s.presentacion,
    seleccion: s.seleccion,
    permite_otro: s.permite_otro,
    etiqueta_texto: s.etiqueta_texto,
    columna: s.columna,
    color: s.color,
    icono: s.icono,
    activa: s.activa,
    opciones: s.opciones.map((o) => ({ id: o.id, texto: o.texto, icono: o.icono, activa: o.activa, en_buen_dia: o.en_buen_dia })),
  });
  const [error, setError] = useState<string | null>(null);
  const [ok] = useState(recien.has(s.id));
  const [abierta, setAbierta] = useState(recien.delete(s.id) || false);

  const cambiarOpcion = (i: number, parche: Partial<OpcionEditable>) =>
    setD((x) => ({ ...x, opciones: x.opciones.map((o, k) => (k === i ? { ...o, ...parche } : o)) }));
  const moverOpcion = (i: number, delta: number) =>
    setD((x) => {
      const j = i + delta;
      if (j < 0 || j >= x.opciones.length) return x;
      const copia = [...x.opciones];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return { ...x, opciones: copia };
    });

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await envio.ejecutar(() => guardarSeccion(d));
    if (r.error) setError(r.error);
    else {
      recien.add(s.id);
      router.refresh();
    }
  };
  const subirBajar = async (dir: "arriba" | "abajo") => {
    setError(null);
    const r = await mover.ejecutar(() => moverSeccion(s.id, dir));
    if (r.error) setError(r.error);
    else router.refresh();
  };

  const conOpciones = d.presentacion !== "texto";
  return (
    <section className={`rounded-xl border bg-white ${d.activa ? "border-n-200" : "border-n-200 opacity-80"}`}>
      <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
        >
          <span aria-hidden="true" className="text-n-500">
            {abierta ? "▾" : "▸"}
          </span>
          <span className="truncate text-base font-bold text-n-900">{s.titulo}</span>
          {!d.activa && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Apagada</span>}
        </button>
        <Button type="button" variante="secundario" className="min-h-11 px-3" onClick={() => subirBajar("arriba")} disabled={indice === 0} cargando={mover.cargando} aria-label={`Subir ${s.titulo}`}>
          ↑
        </Button>
        <Button type="button" variante="secundario" className="min-h-11 px-3" onClick={() => subirBajar("abajo")} disabled={indice === total - 1} cargando={mover.cargando} aria-label={`Bajar ${s.titulo}`}>
          ↓
        </Button>
      </div>
      {abierta && (
        <form onSubmit={guardar} className="flex flex-col gap-4 border-t border-n-200 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={etiqueta}>
              Nombre de la sección
              <input value={d.titulo} maxLength={60} onChange={(e) => setD({ ...d, titulo: e.target.value })} className={campo} required />
            </label>
            <label className={etiqueta}>
              Cómo se muestra
              <select value={d.presentacion} onChange={(e) => setD({ ...d, presentacion: e.target.value as SeccionEditable["presentacion"] })} className={campo}>
                {PRESENTACIONES.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className={etiqueta}>
              Lugar en la tarjeta
              <select value={d.columna} onChange={(e) => setD({ ...d, columna: e.target.value as SeccionEditable["columna"] })} className={campo}>
                {COLUMNAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className={etiqueta}>
              Color
              <select value={d.color} onChange={(e) => setD({ ...d, color: e.target.value as SeccionEditable["color"] })} className={campo}>
                {COLORES.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            {conOpciones && (
              <label className={etiqueta}>
                Cuántas se pueden marcar
                <select value={d.seleccion} onChange={(e) => setD({ ...d, seleccion: e.target.value as "una" | "varias" })} className={campo}>
                  <option value="varias">Varias</option>
                  <option value="una">Una sola (obligatoria para dejar el reporte listo)</option>
                </select>
              </label>
            )}
            <label className={etiqueta}>
              {d.presentacion === "texto" ? "Nombre del campo" : "Campo de texto (déjalo vacío si no lo quieres)"}
              <input value={d.etiqueta_texto ?? ""} maxLength={40} onChange={(e) => setD({ ...d, etiqueta_texto: e.target.value })} className={campo} placeholder="Observaciones" />
            </label>
            <div className={etiqueta}>
              Ícono del encabezado
              <SelectorIcono valor={d.icono} onChange={(v) => setD({ ...d, icono: v })} etiquetaTexto="Ícono del encabezado" />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {conOpciones && (
              <label className="flex min-h-11 items-center gap-2.5 text-base text-n-900">
                <input type="checkbox" checked={d.permite_otro} onChange={(e) => setD({ ...d, permite_otro: e.target.checked })} className="h-5 w-5 accent-morado" />
                Permitir «Otro: …»
              </label>
            )}
            <label className="flex min-h-11 items-center gap-2.5 text-base text-n-900">
              <input type="checkbox" checked={d.activa} onChange={(e) => setD({ ...d, activa: e.target.checked })} className="h-5 w-5 accent-morado" />
              Sección activa
            </label>
          </div>

          {conOpciones && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-n-600">Opciones</h3>
              <ul className="flex flex-col gap-2.5">
                {d.opciones.map((o, i) => (
                  <li key={o.id ?? `nueva-${i}`} className={`flex flex-col gap-2 rounded-lg border border-n-200 p-2.5 ${o.activa ? "bg-n-50" : "bg-n-100 opacity-75"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label="Texto de la opción"
                        value={o.texto}
                        maxLength={80}
                        onChange={(e) => cambiarOpcion(i, { texto: e.target.value })}
                        className={`${campo} min-w-0 flex-1 basis-56`}
                        placeholder="Texto de la opción"
                      />
                      <button type="button" aria-label="Subir opción" onClick={() => moverOpcion(i, -1)} disabled={i === 0} className="min-h-11 min-w-11 rounded-md border border-borde bg-white text-lg disabled:opacity-40">
                        ↑
                      </button>
                      <button type="button" aria-label="Bajar opción" onClick={() => moverOpcion(i, 1)} disabled={i === d.opciones.length - 1} className="min-h-11 min-w-11 rounded-md border border-borde bg-white text-lg disabled:opacity-40">
                        ↓
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                      <div className="min-w-56 flex-1">
                        <SelectorIcono valor={o.icono} onChange={(v) => cambiarOpcion(i, { icono: v })} etiquetaTexto="Ícono de la opción" />
                      </div>
                      <label className="flex min-h-11 items-center gap-2 text-sm text-n-900">
                        <input type="checkbox" checked={o.activa} onChange={(e) => cambiarOpcion(i, { activa: e.target.checked })} className="h-5 w-5 accent-morado" />
                        Activa
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm text-n-900">
                        <input type="checkbox" checked={o.en_buen_dia} onChange={(e) => cambiarOpcion(i, { en_buen_dia: e.target.checked })} className="h-5 w-5 accent-morado" />
                        Incluir en «Buen día»
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <Button type="button" variante="secundario" className="self-start" onClick={() => setD({ ...d, opciones: [...d.opciones, { id: null, texto: "", icono: null, activa: true, en_buen_dia: false }] })}>
                + Agregar opción
              </Button>
            </div>
          )}
          <AccionesFormulario error={error} exito={ok && "Sección guardada"}>
            <Button type="submit" cargando={envio.cargando}>
              Guardar sección
            </Button>
          </AccionesFormulario>
        </form>
      )}
    </section>
  );
}

function NuevaSeccion() {
  const router = useRouter();
  const envio = useEspera();
  const [abierta, setAbierta] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [presentacion, setPresentacion] = useState<"lista" | "iconos" | "resumen" | "texto">("lista");
  const [seleccion, setSeleccion] = useState<"una" | "varias">("varias");
  const [permiteOtro, setPermiteOtro] = useState(false);
  const [etiquetaTexto, setEtiquetaTexto] = useState("");
  const [columna, setColumna] = useState<"izq" | "der" | "completo">("izq");
  const [color, setColor] = useState<"primario" | "secundario" | "acento">("secundario");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!abierta) {
    return (
      <Button type="button" variante="secundario" className="self-start" onClick={() => setAbierta(true)}>
        + Agregar sección
      </Button>
    );
  }
  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    const r = await envio.ejecutar(() =>
      crearSeccion({ titulo, presentacion, seleccion, permite_otro: permiteOtro, etiqueta_texto: etiquetaTexto || null, columna, color })
    );
    if (r.error) {
      setError(r.error);
      return;
    }
    setOk(true);
    setTitulo("");
    setEtiquetaTexto("");
    router.refresh();
  };
  return (
    <form onSubmit={crear} className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-n-300 bg-white p-4">
      <h3 className="text-base font-bold text-n-900">Sección nueva</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={etiqueta}>
          Nombre
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={60} className={campo} required />
        </label>
        <label className={etiqueta}>
          Cómo se muestra
          <select value={presentacion} onChange={(e) => setPresentacion(e.target.value as typeof presentacion)} className={campo}>
            {PRESENTACIONES.filter((p) => p.valor !== "caras").map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {presentacion !== "texto" && (
          <label className={etiqueta}>
            Cuántas se pueden marcar
            <select value={seleccion} onChange={(e) => setSeleccion(e.target.value as "una" | "varias")} className={campo}>
              <option value="varias">Varias</option>
              <option value="una">Una sola</option>
            </select>
          </label>
        )}
        <label className={etiqueta}>
          Campo de texto (opcional)
          <input value={etiquetaTexto} onChange={(e) => setEtiquetaTexto(e.target.value)} maxLength={40} className={campo} placeholder="Observaciones" />
        </label>
        <label className={etiqueta}>
          Lugar
          <select value={columna} onChange={(e) => setColumna(e.target.value as typeof columna)} className={campo}>
            {COLUMNAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Color
          <select value={color} onChange={(e) => setColor(e.target.value as typeof color)} className={campo}>
            {COLORES.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      {presentacion !== "texto" && (
        <label className="flex min-h-11 items-center gap-2.5 text-base text-n-900">
          <input type="checkbox" checked={permiteOtro} onChange={(e) => setPermiteOtro(e.target.checked)} className="h-5 w-5 accent-morado" />
          Permitir «Otro: …»
        </label>
      )}
      <p className="text-sm text-n-600">Después de crearla, ábrela para agregar sus opciones.</p>
      <AccionesFormulario error={error} exito={ok && "Sección creada: ábrela abajo para agregar sus opciones"}>
        <Button type="submit" cargando={envio.cargando}>
          Crear sección
        </Button>
        <Button type="button" variante="secundario" onClick={() => setAbierta(false)}>
          Cerrar
        </Button>
      </AccionesFormulario>
    </form>
  );
}

function VistaPrevia() {
  const envio = useEspera();
  const [imagen, setImagen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ver = async () => {
    setError(null);
    const r = await envio.ejecutar(() => vistaPreviaTarjeta());
    if (r.error || !r.imagen) setError(r.error ?? "No pudimos dibujar la vista previa.");
    else setImagen(r.imagen);
  };
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-n-200 bg-white p-4 sm:p-5">
      <h2 className="text-lg font-bold text-n-900">Vista previa de la tarjeta</h2>
      <p className="text-sm text-n-600">Con datos de ejemplo y lo que ya guardaste (guarda primero y vuelve a verla).</p>
      <AccionesFormulario error={error}>
        <Button type="button" variante="secundario" onClick={ver} cargando={envio.cargando}>
          {imagen ? "Actualizar vista previa" : "Ver vista previa"}
        </Button>
      </AccionesFormulario>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imagen && <img src={imagen} alt="Vista previa de la tarjeta del reporte" className="w-full max-w-md rounded-xl border border-n-200" />}
    </section>
  );
}

export function EditorPlantilla({
  config,
  secciones,
  conReporte,
  coloresMarca,
}: {
  config: ConfigReporte | null;
  secciones: SeccionPlantilla[];
  conReporte: boolean;
  coloresMarca: ColoresTarjeta;
}) {
  return (
    <div className="flex flex-col gap-6">
      <FormConfig key={JSON.stringify(config)} config={config} conReporte={conReporte} coloresMarca={coloresMarca} />
      {conReporte && (
        <>
          <section className="flex flex-col gap-3" aria-label="Secciones">
            <div>
              <h2 className="text-lg font-bold text-n-900">Secciones y opciones</h2>
              <p className="text-sm text-n-600">
                Lo que cambies aquí vale para los reportes nuevos; los que ya guardaste se quedan como estaban. Apaga lo que no uses en vez de borrarlo.
              </p>
            </div>
            {secciones.length === 0 && <Alert variante="info" titulo="Todavía no hay plantilla">Se crea sola la primera vez que alguien abre el reporte de un perro.</Alert>}
            {secciones.map((s, i) => (
              <FormSeccion key={`${s.id}-${JSON.stringify(s)}`} s={s} indice={i} total={secciones.length} />
            ))}
            <NuevaSeccion />
          </section>
          <VistaPrevia />
        </>
      )}
    </div>
  );
}
