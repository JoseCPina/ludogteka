"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { buscarRazasCatalogo, normalizarRaza, razaExacta } from "@/lib/razas";
import { useEspera } from "@/hooks/use-espera";
import { HojaRazaNueva, type OpcionCatalogo } from "@/components/hoja-raza-nueva";
import type { DatosRazaPropuesta, PropuestaRazaVista } from "@/lib/razas-propuesta";

export type RazaOpcion = {
  id: string;
  nombre: string;
  alias: string[];
  // Esta entrada significa "el dueno no sabe la raza", no una raza
  // concreta. La usa el precio estimado para avisar distinto.
  es_desconocida?: boolean;
  // Solo viajan cuando quien mira es del negocio (cargarRazas con
  // conGrupo). En la pantalla del cliente no se mandan.
  grupo_nombre?: string;
  grupo_depende_tamano?: boolean;
};

/**
 * Cómo se ofrece resolver una raza que no está en el catálogo. Sin esto el
 * selector solo deja escribir texto suelto («usar tal cual»); con esto, quien
 * captura la describe ahí mismo y la propone a la plataforma.
 */
export type OpcionesPropuestaRaza = {
  // «personal»: admin o recepción (puede dar talla, pelo y, con «Precios y
  // tarifas», grupo de precio). «dueno»: el cliente en su link, sin precios.
  modo: "personal" | "dueno";
  tamanos?: OpcionCatalogo[];
  pelajes?: OpcionCatalogo[];
  // Solo con «Precios y tarifas»: sin esto no se muestra ningún grupo.
  grupos?: { id: string; nombre: string }[];
  puedeAsignarGrupo?: boolean;
  // personal: el perro ya existe → se liga en el momento; si no, la propuesta
  // viaja con el formulario (campo oculto) y se liga al guardar al perro.
  proponer?: (datos: DatosRazaPropuesta) => Promise<{ error: string | null }>;
  propuestaInicial?: PropuestaRazaVista | null;
  // dueno: el padre guarda la propuesta junto con el perro.
  valorPropuesta?: DatosRazaPropuesta | null;
};

/**
 * Buscador de raza contra el catálogo.
 *
 * El grupo de precio NUNCA se escoge: sale de la raza. Un dueño sabe que
 * su perro es un shih tzu; "grupo 3" no le dice nada. Por eso esto busca
 * razas y el grupo se muestra solo cuando lo mira alguien del negocio
 * (`mostrarGrupo`), nunca en la pantalla del cliente.
 *
 * Sirve para las dos formas de formulario del proyecto: si recibe
 * `onCambio` es controlado (el alta pública, que arma su estado en React);
 * si no, se maneja solo y publica su valor en inputs ocultos (los
 * formularios de staff, que van por FormData a una server action).
 */
export function SelectorRaza({
  razas,
  nombreCampoId = "raza_id",
  nombreCampoTexto = "raza",
  valorId,
  valorTexto,
  onCambio,
  label = "Raza",
  ayuda,
  disabled = false,
  mostrarGrupo = false,
  propuestas,
}: {
  razas: RazaOpcion[];
  nombreCampoId?: string;
  nombreCampoTexto?: string;
  valorId?: string | null;
  valorTexto?: string | null;
  onCambio?: (valor: { raza_id: string | null; raza: string; propuesta?: DatosRazaPropuesta | null }) => void;
  label?: string;
  ayuda?: string;
  disabled?: boolean;
  mostrarGrupo?: boolean;
  propuestas?: OpcionesPropuestaRaza;
}) {
  const controlado = typeof onCambio === "function";
  const [internoId, setInternoId] = useState<string | null>(valorId ?? null);
  const [internoTexto, setInternoTexto] = useState(valorTexto ?? "");

  const [internaPropuesta, setInternaPropuesta] = useState<PropuestaRazaVista | null>(propuestas?.propuestaInicial ?? null);
  const [hoja, setHoja] = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const envioHoja = useEspera();

  const razaId = controlado ? (valorId ?? null) : internoId;
  const texto = controlado ? (valorTexto ?? "") : internoTexto;

  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const porEnfocar = useRef(false);
  const idBase = useId();

  // Al darle "Cambiar" el buscador todavía no existe en el DOM: lo
  // pintado es la etiqueta con la raza elegida, y el input aparece hasta
  // el render siguiente. Enfocar dentro del click no hace nada — quien
  // captura teclea al vacío. Se enfoca desde el ref del propio input, que
  // corre justo cuando el elemento entra al DOM.
  function refInput(el: HTMLInputElement | null) {
    inputRef.current = el;
    if (el && porEnfocar.current) {
      porEnfocar.current = false;
      el.focus();
    }
  }

  const elegida = useMemo(() => razas.find((r) => r.id === razaId) ?? null, [razas, razaId]);
  const sugerencias = useMemo(() => buscarRazasCatalogo(razas, consulta), [razas, consulta]);

  const valorPropuesta = propuestas?.valorPropuesta ?? null;
  const propuesta: PropuestaRazaVista | null = controlado
    ? valorPropuesta && !razaId && normalizarRaza(valorPropuesta.nombre) === normalizarRaza(texto)
      ? { nombre: valorPropuesta.nombre, grupoNombre: null, enviada: false, datos: valorPropuesta }
      : null
    : internaPropuesta && !razaId && normalizarRaza(internaPropuesta.nombre) === normalizarRaza(texto)
      ? internaPropuesta
      : null;

  function emitir(raza_id: string | null, raza: string, nuevaPropuesta: DatosRazaPropuesta | null = null) {
    if (controlado) onCambio!({ raza_id, raza, propuesta: nuevaPropuesta });
    else {
      setInternoId(raza_id);
      setInternoTexto(raza);
    }
  }

  function elegir(raza: RazaOpcion) {
    setInternaPropuesta(null);
    emitir(raza.id, raza.nombre);
    setConsulta("");
    setAbierto(false);
  }

  // El catálogo no va a tener todas las razas del mundo. Antes que
  // obligar a quien captura a mentir escogiendo la más parecida, se
  // guarda lo que escribió: el perro cotiza con el grupo por defecto y
  // queda escrito qué raza dijeron, para que el negocio decida después si
  // vale la pena agregarla al catálogo.
  function usarLibre() {
    const escrito = consulta.trim();
    if (!escrito) return;
    emitir(null, escrito);
    setConsulta("");
    setAbierto(false);
  }

  // «No la encuentro»: abre la hoja con lo escrito (o con lo que ya tenía el perro).
  function abrirHoja() {
    setErrorHoja(null);
    setHoja(true);
    setAbierto(false);
  }

  async function guardarHoja(datos: DatosRazaPropuesta) {
    if (!propuestas) return;
    setErrorHoja(null);
    if (propuestas.modo === "personal" && propuestas.proponer) {
      const res = await envioHoja.ejecutar(() => propuestas.proponer!(datos));
      if (res.error) return setErrorHoja(res.error);
      setInternaPropuesta({
        nombre: datos.nombre,
        grupoNombre: propuestas.grupos?.find((g) => g.id === datos.grupoId)?.nombre ?? null,
        enviada: true,
        datos: null,
      });
      emitir(null, datos.nombre);
    } else if (propuestas.modo === "personal") {
      setInternaPropuesta({
        nombre: datos.nombre,
        grupoNombre: propuestas.grupos?.find((g) => g.id === datos.grupoId)?.nombre ?? null,
        enviada: false,
        datos,
      });
      emitir(null, datos.nombre);
    } else {
      emitir(null, datos.nombre, datos);
    }
    setConsulta("");
    setHoja(false);
  }

  function limpiar() {
    setInternaPropuesta(null);
    emitir(null, "", null);
    setConsulta("");
    setAbierto(true);
    porEnfocar.current = true;
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setResaltado((i) => Math.min(i + 1, sugerencias.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Enter dentro del buscador escoge de la lista; sin esto envía el
      // formulario completo a medio capturar.
      e.preventDefault();
      if (sugerencias[resaltado]) elegir(sugerencias[resaltado].raza);
      else if (propuestas && hayTexto) abrirHoja();
      else usarLibre();
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const idLista = `${idBase}-lista`;
  const hayTexto = consulta.trim().length > 0;
  const coincideExacto = sugerencias.some((x) => !x.parecido && normalizarRaza(x.raza.nombre) === normalizarRaza(consulta));
  // Un perro con la raza escrita a mano que YA coincide con una del catálogo:
  // se ofrece ligarla con un toque (nunca se liga sola).
  const exactaDelTexto = !elegida && texto ? razaExacta(razas, texto) : null;

  return (
    <div>
      <label htmlFor={`${idBase}-input`} className="mb-1.5 block text-sm font-semibold text-n-800">
        {label}
      </label>

      {!controlado && (
        <>
          <input type="hidden" name={nombreCampoId} value={razaId ?? ""} />
          <input type="hidden" name={nombreCampoTexto} value={texto} />
        </>
      )}

      {texto ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border-[1.5px] border-n-400 bg-white px-3.5 py-2.5">
          <span className="font-semibold text-n-900">{texto}</span>
          {!elegida && (
            <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
              {propuesta ? "Raza nueva propuesta" : "Fuera del catálogo"}
            </span>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={limpiar}
              className="ml-auto rounded px-2 py-1 text-sm font-semibold text-morado hover:bg-morado-suave"
            >
              Cambiar
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <input
            ref={refInput}
            id={`${idBase}-input`}
            type="text"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={idLista}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={disabled}
            placeholder="Escribe la raza: labrador, shih tzu, mestizo…"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setAbierto(true);
              setResaltado(0);
            }}
            onFocus={() => setAbierto(true)}
            onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
            onKeyDown={alTeclear}
            className="min-h-12 w-full rounded-md border-[1.5px] border-n-400 bg-white px-3.5 text-base text-n-900 focus:border-morado focus:outline-none focus:ring-[3px] focus:ring-morado-suave"
          />

          {abierto && (
            <ul
              id={idLista}
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border-[1.5px] border-n-300 bg-white shadow-lg"
            >
              {sugerencias.map(({ raza, parecido }, i) => (
                <li key={raza.id} role="option" aria-selected={i === resaltado}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(raza)}
                    onMouseEnter={() => setResaltado(i)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left ${
                      i === resaltado ? "bg-morado-suave" : "bg-white"
                    }`}
                  >
                    <span className="text-n-900">{raza.nombre}</span>
                    {parecido && <span className="text-xs font-semibold text-n-600">¿Quisiste decir esta? Se parece a lo que escribiste</span>}
                    {mostrarGrupo && raza.grupo_nombre && (
                      <span className="text-xs text-n-500">{raza.grupo_nombre}</span>
                    )}
                  </button>
                </li>
              ))}

              {hayTexto && !coincideExacto && propuestas && (
                <li>
                  <button
                    type="button"
                    data-agregar-raza
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={abrirHoja}
                    className="min-h-12 w-full border-t border-n-200 px-3.5 py-2.5 text-left font-semibold text-morado hover:bg-morado-suave"
                  >
                    No la encuentro: agregar esta raza
                    <span className="block text-sm font-normal text-n-600">«{consulta.trim()}»</span>
                  </button>
                </li>
              )}

              {hayTexto && !coincideExacto && !propuestas && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={usarLibre}
                    className="w-full border-t border-n-200 px-3.5 py-2.5 text-left text-n-700 hover:bg-n-100"
                  >
                    Usar «<strong>{consulta.trim()}</strong>» tal cual
                  </button>
                </li>
              )}

              {sugerencias.length === 0 && !hayTexto && (
                <li className="px-3.5 py-2.5 text-n-600">Empieza a escribir para buscar.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {!controlado && propuesta && !propuesta.enviada && propuesta.datos && (
        <input type="hidden" name="raza_propuesta" value={JSON.stringify(propuesta.datos)} />
      )}

      {exactaDelTexto && !disabled && (
        <div data-ligar-raza className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-morado-suave px-3 py-2 text-sm text-n-800">
          <span>
            «{texto}» está en el catálogo como <strong>{exactaDelTexto.nombre}</strong>.
          </span>
          <button type="button" onClick={() => elegir(exactaDelTexto)} className="ml-auto rounded px-2 py-1 font-semibold text-morado hover:bg-white">
            Usar {exactaDelTexto.nombre}
          </button>
        </div>
      )}

      {texto && !elegida && !exactaDelTexto && !propuesta && propuestas && !disabled && (
        <button type="button" data-agregar-raza onClick={abrirHoja} className="mt-2 min-h-11 rounded-md border-[1.5px] border-morado px-3 text-sm font-semibold text-morado hover:bg-morado-suave">
          No la encuentro: agregar esta raza
        </button>
      )}

      {propuesta && propuestas?.modo === "dueno" && (
        <p className="mt-1.5 text-sm text-n-700">
          Listo: anotamos <strong>{propuesta.nombre}</strong> y la revisamos para agregarla.
        </p>
      )}

      {mostrarGrupo && texto && <AvisoGrupo elegida={elegida} propuesta={propuesta} propuestas={propuestas} />}
      {!mostrarGrupo && ayuda && <p className="mt-1.5 text-sm text-n-600">{ayuda}</p>}
      {mostrarGrupo && !texto && ayuda && <p className="mt-1.5 text-sm text-n-600">{ayuda}</p>}

      {hoja && propuestas && (
        <HojaRazaNueva
          nombreInicial={texto || consulta.trim()}
          modo={propuestas.modo}
          tamanos={propuestas.tamanos}
          pelajes={propuestas.pelajes}
          grupos={propuestas.puedeAsignarGrupo ? propuestas.grupos : []}
          inicial={propuesta?.datos ?? null}
          guardando={envioHoja.cargando}
          error={errorHoja}
          onGuardar={guardarHoja}
          onCancelar={() => setHoja(false)}
        />
      )}
    </div>
  );
}

/**
 * Qué grupo de precio de estética le toca a lo que se escogió, dicho sin
 * adivinar: el del catálogo, el que el negocio le dio a la propuesta, o que
 * hace falta asignarlo antes de agendar. Solo lo muestra el personal.
 */
function AvisoGrupo({
  elegida,
  propuesta,
  propuestas,
}: {
  elegida: RazaOpcion | null;
  propuesta: PropuestaRazaVista | null;
  propuestas?: OpcionesPropuestaRaza;
}) {
  const puedeAsignar = Boolean(propuestas?.puedeAsignarGrupo);
  const enlace = puedeAsignar ? (
    <>
      {" "}
      <Link href="/perros/razas/grupos" className="font-semibold text-morado underline">
        Asignar grupo
      </Link>
    </>
  ) : (
    " Pídeselo a admin o a quien tenga «Precios y tarifas»."
  );
  const necesita = (cual: string) => (
    <p data-aviso-grupo="falta" className="mt-1.5 text-sm text-n-700">
      {cual} La estética de este perro necesita un grupo de precio antes de agendar.{enlace}
    </p>
  );

  if (elegida?.grupo_nombre) {
    return (
      <p data-aviso-grupo="ok" className="mt-1.5 text-sm text-n-600">
        Grupo de precio de estética: <strong>{elegida.grupo_nombre}</strong>
      </p>
    );
  }
  if (elegida) return necesita("La raza está en el catálogo, pero este negocio todavía no le asigna grupo de precio.");
  if (propuesta?.grupoNombre) {
    return (
      <p data-aviso-grupo="propuesta" className="mt-1.5 text-sm text-n-600">
        Raza nueva en revisión. Grupo de precio de estética: <strong>{propuesta.grupoNombre}</strong>
      </p>
    );
  }
  if (propuesta) return necesita("Raza nueva en revisión por PeluDesk.");
  return (
    <p data-aviso-grupo="predeterminado" className="mt-1.5 text-sm text-n-600">
      Grupo de precio de estética: <strong>el predeterminado, por no estar en el catálogo</strong>
    </p>
  );
}
