"use client";

import { useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { comprimirImagen } from "@/lib/imagen";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hoyNegocio } from "@/lib/formato";
import {
  crearRequisitoAplicado,
  guardarComprobanteRequisito,
} from "./requisitos-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

const BUCKET = "perros-archivos";
const DOS_ANIOS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export type TipoRequisitoOpcion = {
  id: string;
  clave: string;
  etiqueta: string;
  categoria: "vacuna" | "desparasitacion";
};

export function RequisitoForm({
  perroId,
  clienteId,
  tipos,
}: {
  perroId: string;
  clienteId: string;
  tipos: TipoRequisitoOpcion[];
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoyNegocio(zona));
  const [archivo, setArchivo] = useState<File | null>(null);
  // Puede llevar foto del carnet: tope más largo que el de un botón.
  const enviando = useEspera({ tope: 60_000 });
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [avisoFechaAntigua, setAvisoFechaAntigua] = useState(false);

  const tipoSeleccionado = tipos.find((t) => t.id === tipoId);
  const etiquetaDetalle =
    tipoSeleccionado?.categoria === "desparasitacion" ? "Producto usado" : "Veterinario y clínica";

  // Date.now() se calcula aquí, dentro del handler (nunca en el cuerpo del
  // componente ni en un useMemo), porque llamar una función impura durante
  // el render viola las reglas de componentes puros de React.
  function manejarCambioFecha(valor: string) {
    setFecha(valor);
    setAvisoFechaAntigua(Boolean(valor) && Date.now() - new Date(valor).getTime() > DOS_ANIOS_MS);
  }

  async function manejarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setExito(false);

    const formData = new FormData(evento.currentTarget);
    const detalle = String(formData.get("detalle") ?? "").trim() || null;
    const notas = String(formData.get("notas") ?? "").trim() || null;

    const r = await enviando.correr(async () => {
      const resultado = await crearRequisitoAplicado(perroId, {
        tipoRequisitoId: tipoId,
        fechaAplicacion: fecha,
        detalle,
        notas,
      });
      if (resultado.error || !resultado.id) {
        return { error: resultado.error ?? "No pudimos guardar el registro." };
      }

      if (archivo) {
        const blob = await comprimirImagen(archivo);
        const path = `${clienteId}/${perroId}/requisitos/${resultado.id}/comprobante.jpg`;
        const supabase = createSupabaseBrowserClient();
        const { error: subidaError } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
        if (subidaError) {
          return { error: "Guardamos el registro, pero no pudimos subir el comprobante." };
        }
        const { error: guardarError } = await guardarComprobanteRequisito(resultado.id, perroId, path);
        if (guardarError) return { error: guardarError };
      }
      return { error: null };
    });

    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.valor.error) {
      setError(r.valor.error);
      return;
    }

    setExito(true);
    formRef.current?.reset();
    setFecha(hoyNegocio(zona));
    setAvisoFechaAntigua(false);
    setArchivo(null);
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={manejarEnvio} className="flex max-w-lg flex-col gap-4">
      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}
      {exito && <Alert variante="exito" titulo="Registro guardado" />}

      <Select
        label="Tipo de requisito"
        name="tipo_requisito_id"
        required
        disabled={enviando.cargando}
        value={tipoId}
        onChange={(e) => setTipoId(e.target.value)}
      >
        {tipos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.etiqueta}
          </option>
        ))}
      </Select>

      <div>
        <Field
          label="Fecha de aplicación"
          name="fecha_aplicacion"
          type="date"
          required
          disabled={enviando.cargando}
          max={hoyNegocio(zona)}
          value={fecha}
          onChange={(e) => manejarCambioFecha(e.target.value)}
        />
        {avisoFechaAntigua && (
          <p className="mt-1.5 text-sm font-semibold text-ambar-oscuro">
            Esta fecha es de hace más de dos años — revisa que el año esté bien escrito.
          </p>
        )}
      </div>

      <Field label={etiquetaDetalle} name="detalle" disabled={enviando.cargando} ayuda="Opcional." />
      <Textarea label="Notas" name="notas" disabled={enviando.cargando} />

      <div>
        <p className="mb-1.5 text-sm font-semibold text-n-800">Foto del comprobante (opcional)</p>
        {/* Sin `capture`: es un comprobante, no el perro. Puede venir del carnet
            en el mostrador o de una foto que el dueño mandó por WhatsApp; el
            selector normal ofrece cámara y archivos. */}
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
          cargando={enviando.cargando}
          onClick={() => inputArchivoRef.current?.click()}
        >
          {archivo ? archivo.name : "Elegir foto"}
        </Button>
      </div>

      <AccionesFormulario error={error} exito={exito && "Registro guardado"}>
        <Button type="submit" cargando={enviando.cargando}>
          {enviando.cargando ? "Guardando…" : "Registrar aplicación"}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
