"use client";

import { useEffect, useId, useRef, useState } from "react";
import { comprimirImagen } from "@/lib/imagen";

/**
 * La foto del ticket o comprobante. Se comprime aquí con la misma
 * compresión de siempre y se reemplaza el archivo del campo, así el
 * formulario manda la versión ligera. Sin `capture`: es un documento y la
 * foto casi siempre ya está en la galería.
 */
export function CampoComprobante({ etiqueta = "Foto del comprobante o ticket (opcional)" }: { etiqueta?: string }) {
  const id = useId();
  const [estado, setEstado] = useState<"vacio" | "preparando" | "listo" | "error">("vacio");
  const [vista, setVista] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  // Cuando el formulario se limpia tras guardar, la vista previa también.
  useEffect(() => {
    const form = campo.current?.form;
    if (!form) return;
    const limpiar = () => {
      setEstado("vacio");
      setVista(null);
    };
    form.addEventListener("reset", limpiar);
    return () => form.removeEventListener("reset", limpiar);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-n-800">
        {etiqueta}
      </label>
      <input
        ref={campo}
        id={id}
        name="foto"
        type="file"
        accept="image/*"
        className="text-sm text-n-700 file:mr-3 file:min-h-10 file:rounded-md file:border file:border-n-400 file:bg-white file:px-4 file:font-semibold file:text-n-900"
        onChange={async (e) => {
          const input = e.currentTarget;
          const archivo = input.files?.[0];
          if (!archivo) {
            setEstado("vacio");
            setVista(null);
            return;
          }
          setEstado("preparando");
          try {
            const blob = await comprimirImagen(archivo);
            const ligero = new File([blob], "comprobante.jpg", { type: "image/jpeg" });
            const dt = new DataTransfer();
            dt.items.add(ligero);
            input.files = dt.files;
            setVista(URL.createObjectURL(blob));
            setEstado("listo");
          } catch {
            setEstado("error");
          }
        }}
      />
      {estado === "preparando" && <p className="text-xs text-n-600">Preparando la foto…</p>}
      {estado === "error" && <p className="text-xs text-naranja-oscuro">No pudimos leer esa foto. Prueba con otra.</p>}
      {vista && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vista} alt="Vista previa del comprobante" className="mt-1 max-h-40 w-fit rounded-md border border-n-200" />
      )}
    </div>
  );
}
