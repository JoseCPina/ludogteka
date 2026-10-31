"use client";

import { useEffect, useId, useRef, useState } from "react";
import { buscarCiudades, type CiudadMercado } from "@/lib/mercado/ciudades";

/** Buscador de los 198 municipios de la lista nacional (INEGI): escribe y escoge; el valor es una ciudad o nada. */
export function BuscadorCiudad({ valor, onChange, etiqueta = "Tu ciudad" }: { valor: CiudadMercado | null; onChange: (c: CiudadMercado | null) => void; etiqueta?: string }) {
  const id = useId();
  const [texto, setTexto] = useState(valor?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const opciones = abierto ? buscarCiudades(texto) : [];
  // Si quien la usa cambia la ciudad desde afuera, el campo la sigue (sin efecto: se ajusta en el render).
  const [valorVisto, setValorVisto] = useState(valor);
  if (valor !== valorVisto) {
    setValorVisto(valor);
    setTexto(valor?.nombre ?? "");
  }

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const escoger = (c: CiudadMercado) => {
    onChange(c);
    setTexto(c.nombre);
    setAbierto(false);
  };

  return (
    <div ref={caja} className="relative">
      <label htmlFor={id} className="hta-etiqueta">{etiqueta}</label>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Escribe tu ciudad"
        className="hta-campo"
        value={texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
          if (!e.target.value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (!abierto) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, opciones.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && opciones[activo]) { e.preventDefault(); escoger(opciones[activo]); }
          if (e.key === "Escape") setAbierto(false);
        }}
      />
      {abierto && opciones.length > 0 && (
        <ul id={`${id}-lista`} role="listbox" className="hta-lista">
          {opciones.map((c, i) => (
            <li key={c.clave} role="option" aria-selected={i === activo} className="cursor-pointer px-4 py-2.5" onPointerDown={(e) => { e.preventDefault(); escoger(c); }}>
              <span className="font-semibold text-n-900">{c.nombre}</span>
              <span className="ml-2 text-sm text-n-600">{c.estado}</span>
            </li>
          ))}
        </ul>
      )}
      {abierto && texto && opciones.length === 0 && <p className="mt-1 text-sm text-n-600">No está en la lista de municipios del índice. Puedes dejarla vacía: verás el rango del país.</p>}
    </div>
  );
}
