"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { comprimirImagen } from "@/lib/imagen";
import { hoyNegocio } from "@/lib/formato";
import { proponerComprobante } from "./comprobante-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

/**
 * El botón "Subir comprobante" de cada requisito pendiente en el portal,
 * con su formulario: fecha de aplicación, detalle opcional y la foto del
 * carnet. Lo que manda queda como propuesto — el aviso de arriba ya se
 * lo dice — y recepción lo confirma contra el documento.
 */
export function ProponerComprobante({
  perroId,
  tipoRequisitoId,
  etiqueta,
  categoria,
  textoBoton = "Subir el comprobante",
}: {
  perroId: string;
  tipoRequisitoId: string;
  etiqueta: string;
  categoria: "vacuna" | "desparasitacion";
  textoBoton?: string;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoyNegocio(zona));
  const [detalle, setDetalle] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lleva una foto: tope más largo que el de un botón.
  const enviando = useEspera({ tope: 60_000 });

  async function enviar() {
    setError(null);
    if (!archivo) return setError("Toma o elige la foto del comprobante.");

    const r = await enviando.correr(async () => {
      const blob = await comprimirImagen(archivo);
      const datos = new FormData();
      datos.append("tipo_requisito_id", tipoRequisitoId);
      datos.append("fecha_aplicacion", fecha);
      datos.append("detalle", detalle);
      datos.append("foto", new File([blob], "comprobante.jpg", { type: "image/jpeg" }));
      return proponerComprobante(perroId, datos);
    });

    if (!r.ok) return setError(r.error);
    if (r.valor.error) return setError(r.valor.error);

    setAbierto(false);
    setArchivo(null);
    setDetalle("");
    router.refresh();
  }

  if (!abierto) {
    return (
      <Button type="button" variante="secundario" className="mt-2 min-h-11 px-4 text-sm" onClick={() => setAbierto(true)}>
        {textoBoton}
      </Button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border-[1.5px] border-n-200 bg-white p-3">
      <p className="text-sm text-n-700">
        <strong>{etiqueta}.</strong> Toma una foto clara del carnet o del comprobante donde se vea la
        fecha. Recepción lo revisa y, si todo cuadra, queda registrado.
      </p>

      {error && (
        <Alert variante="error" titulo="Revisa esto">
          {error}
        </Alert>
      )}

      <Field
        label="Fecha en que se aplicó"
        type="date"
        max={hoyNegocio(zona)}
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        disabled={enviando.cargando}
      />
      <Field
        label={categoria === "desparasitacion" ? "Producto usado (opcional)" : "Veterinario o clínica (opcional)"}
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        disabled={enviando.cargando}
      />

      <div>
        <p className="mb-1.5 text-sm font-semibold text-n-800">Foto del comprobante</p>
        {/* Sin `capture`: es un documento, y el dueño casi siempre ya tiene la
            foto del carnet en su galería. Con `capture` el celular abre SOLO la
            cámara y no deja escoger de archivos. */}
        <input
          ref={inputArchivoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variante="secundario"
          disabled={enviando.cargando}
          onClick={() => inputArchivoRef.current?.click()}
        >
          {archivo ? archivo.name : "Tomar o elegir foto"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" cargando={enviando.cargando} onClick={enviar}>
          {enviando.cargando ? "Enviando…" : "Enviar a revisión"}
        </Button>
        <Button type="button" variante="secundario" disabled={enviando.cargando} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
