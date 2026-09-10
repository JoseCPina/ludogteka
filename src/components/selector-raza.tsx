"use client";

import { useId, useMemo, useRef, useState } from "react";
import { normalizarTextoRaza } from "@/lib/razas";

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

const MAXIMO_SUGERENCIAS = 8;

function buscar(razas: RazaOpcion[], consulta: string): RazaOpcion[] {
  const q = normalizarTextoRaza(consulta);
  if (!q) return razas.slice(0, MAXIMO_SUGERENCIAS);

  // Las que EMPIEZAN con lo tecleado van primero: quien escribe "pas"
  // busca un pastor, no un "perro pelón" que contiene "pas" a la mitad.
  const empiezan: RazaOpcion[] = [];
  const contienen: RazaOpcion[] = [];
  for (const raza of razas) {
    const candidatos = [raza.nombre, ...raza.alias].map(normalizarTextoRaza);
    if (candidatos.some((c) => c.startsWith(q))) empiezan.push(raza);
    else if (candidatos.some((c) => c.includes(q))) contienen.push(raza);
  }
  return [...empiezan, ...contienen].slice(0, MAXIMO_SUGERENCIAS);
}

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
}: {
  razas: RazaOpcion[];
  nombreCampoId?: string;
  nombreCampoTexto?: string;
  valorId?: string | null;
  valorTexto?: string | null;
  onCambio?: (valor: { raza_id: string | null; raza: string }) => void;
  label?: string;
  ayuda?: string;
  disabled?: boolean;
  mostrarGrupo?: boolean;
}) {
  const controlado = typeof onCambio === "function";
  const [internoId, setInternoId] = useState<string | null>(valorId ?? null);
  const [internoTexto, setInternoTexto] = useState(valorTexto ?? "");

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
  const sugerencias = useMemo(() => buscar(razas, consulta), [razas, consulta]);

  function emitir(raza_id: string | null, raza: string) {
    if (controlado) onCambio!({ raza_id, raza });
    else {
      setInternoId(raza_id);
      setInternoTexto(raza);
    }
  }

  function elegir(raza: RazaOpcion) {
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

  function limpiar() {
    emitir(null, "");
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
      if (sugerencias[resaltado]) elegir(sugerencias[resaltado]);
      else usarLibre();
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const idLista = `${idBase}-lista`;
  const hayTexto = consulta.trim().length > 0;
  const coincideExacto = sugerencias.some((r) => normalizarTextoRaza(r.nombre) === normalizarTextoRaza(consulta));

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
              Fuera del catálogo
            </span>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={limpiar}
              className="ml-auto rounded px-2 py-1 text-sm font-semibold text-azul hover:bg-azul-suave"
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
            className="min-h-12 w-full rounded-md border-[1.5px] border-n-400 bg-white px-3.5 text-base text-n-900 focus:border-azul focus:outline-none focus:ring-[3px] focus:ring-azul-suave"
          />

          {abierto && (
            <ul
              id={idLista}
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border-[1.5px] border-n-300 bg-white shadow-lg"
            >
              {sugerencias.map((raza, i) => (
                <li key={raza.id} role="option" aria-selected={i === resaltado}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(raza)}
                    onMouseEnter={() => setResaltado(i)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left ${
                      i === resaltado ? "bg-azul-suave" : "bg-white"
                    }`}
                  >
                    <span className="text-n-900">{raza.nombre}</span>
                    {mostrarGrupo && raza.grupo_nombre && (
                      <span className="text-xs text-n-500">{raza.grupo_nombre}</span>
                    )}
                  </button>
                </li>
              ))}

              {hayTexto && !coincideExacto && (
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

      {mostrarGrupo && texto && (
        <p className="mt-1.5 text-sm text-n-600">
          Grupo de precio de estética:{" "}
          <strong>{elegida?.grupo_nombre ?? "el predeterminado, por no estar en el catálogo"}</strong>
        </p>
      )}
      {!mostrarGrupo && ayuda && <p className="mt-1.5 text-sm text-n-600">{ayuda}</p>}
      {mostrarGrupo && !texto && ayuda && <p className="mt-1.5 text-sm text-n-600">{ayuda}</p>}
    </div>
  );
}
