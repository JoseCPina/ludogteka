"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

/**
 * Un link, un código o una contraseña que hay que pasarle a alguien.
 *
 * Campo de solo lectura con botón de copiar al lado. Al presionarlo dice
 * "Copiado" un momento. Si el portapapeles no está disponible (http sin
 * https, un permiso negado, un navegador viejo), no falla en silencio:
 * selecciona todo el texto y lo dice, para que un Ctrl+C lo resuelva. Y
 * hacer clic en el campo selecciona todo, como respaldo en cualquier
 * caso — nadie tiene que arrastrar el cursor sobre un token de 64
 * caracteres.
 *
 * Todo lo que la app muestre para copiar pasa por aquí: link de alta,
 * link de complemento, link de invitación de staff, contraseña temporal.
 */
export function CampoCopiable({
  valor,
  etiqueta,
  textoBoton = "Copiar",
  textoCopiado = "Copiado",
  monoespaciado = false,
  className = "",
}: {
  valor: string;
  etiqueta?: string;
  textoBoton?: string;
  textoCopiado?: string;
  // Para contraseñas y códigos: letra a letra, sin ambigüedad entre l e I.
  monoespaciado?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<"listo" | "copiado" | "seleccionado">("listo");

  useEffect(() => {
    if (estado === "listo") return;
    const t = setTimeout(() => setEstado("listo"), 2500);
    return () => clearTimeout(t);
  }, [estado]);

  function seleccionarTodo() {
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("sin portapapeles");
      await navigator.clipboard.writeText(valor);
      setEstado("copiado");
    } catch {
      // Respaldo: el texto queda seleccionado y se le dice qué hacer.
      seleccionarTodo();
      setEstado("seleccionado");
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {etiqueta && <span className="text-sm font-semibold text-n-800">{etiqueta}</span>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          readOnly
          value={valor}
          onClick={seleccionarTodo}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={etiqueta ?? "Texto para copiar"}
          className={`min-h-12 w-full flex-1 rounded-md border-[1.5px] border-n-400 bg-white px-3.5 text-n-900 ${
            monoespaciado ? "font-mono text-lg tracking-wider" : "text-sm"
          }`}
        />
        <Button
          type="button"
          variante={estado === "copiado" ? "exito" : "secundario"}
          className="flex-none"
          onClick={copiar}
          aria-live="polite"
        >
          {estado === "copiado" ? textoCopiado : textoBoton}
        </Button>
      </div>
      {estado === "seleccionado" && (
        <p className="text-sm font-semibold text-amarillo-oscuro" aria-live="polite">
          No se pudo usar el portapapeles: el texto quedó seleccionado, cópialo con Ctrl+C.
        </p>
      )}
    </div>
  );
}
