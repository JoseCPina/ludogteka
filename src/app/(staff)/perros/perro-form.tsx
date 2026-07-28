"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { EstadoPerroForm } from "./actions";

const ESTADO_INICIAL: EstadoPerroForm = { error: null };

export type CategoriaOpcion = { id: string; etiqueta: string };

export function PerroForm({
  action,
  tamanos,
  pelajes,
  valoresIniciales,
  textoBoton,
  soloLectura = false,
}: {
  action: (estadoPrevio: EstadoPerroForm, formData: FormData) => Promise<EstadoPerroForm>;
  tamanos: CategoriaOpcion[];
  pelajes: CategoriaOpcion[];
  valoresIniciales?: {
    nombre: string;
    raza: string | null;
    sexo: string | null;
    esterilizado: boolean | null;
    fecha_nacimiento: string | null;
    tamano_id: string | null;
    pelaje_id: string | null;
    alimentacion_notas: string | null;
    temperamento_notas: string | null;
  };
  textoBoton: string;
  soloLectura?: boolean;
}) {
  const [estado, formAction, enviando] = useActionState(action, ESTADO_INICIAL);
  const deshabilitado = enviando || soloLectura;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}
      {soloLectura && (
        <Alert variante="advertencia" titulo="Solo lectura">
          Solo admin o recepción pueden editar los datos base del perro.
        </Alert>
      )}

      <Field
        label="Nombre del perro"
        name="nombre"
        required
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.nombre}
      />
      <Field
        label="Raza (opcional)"
        name="raza"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.raza ?? ""}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Sexo"
          name="sexo"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.sexo ?? ""}
        >
          <option value="">No especificado</option>
          <option value="macho">Macho</option>
          <option value="hembra">Hembra</option>
        </Select>
        <Select
          label="Esterilizado"
          name="esterilizado"
          disabled={deshabilitado}
          defaultValue={
            valoresIniciales?.esterilizado === true
              ? "si"
              : valoresIniciales?.esterilizado === false
                ? "no"
                : ""
          }
        >
          <option value="">No especificado</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </Select>
      </div>

      <Field
        label="Fecha de nacimiento (opcional)"
        name="fecha_nacimiento"
        type="date"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.fecha_nacimiento ?? ""}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Tamaño"
          name="tamano_id"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.tamano_id ?? ""}
        >
          <option value="">No especificado</option>
          {tamanos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </Select>
        <Select
          label="Pelaje"
          name="pelaje_id"
          disabled={deshabilitado}
          defaultValue={valoresIniciales?.pelaje_id ?? ""}
        >
          <option value="">No especificado</option>
          {pelajes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.etiqueta}
            </option>
          ))}
        </Select>
      </div>

      <Textarea
        label="Notas de alimentación"
        name="alimentacion_notas"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.alimentacion_notas ?? ""}
        ayuda="El dueño también puede editar esto desde su portal."
      />
      <Textarea
        label="Temperamento"
        name="temperamento_notas"
        disabled={deshabilitado}
        defaultValue={valoresIniciales?.temperamento_notas ?? ""}
        ayuda="Descripción general. Las alertas de manejo (muerde, se escapa, etc.) van aparte."
      />

      {!soloLectura && (
        <Button type="submit" disabled={enviando} className="self-start">
          {enviando ? "Guardando…" : textoBoton}
        </Button>
      )}
    </form>
  );
}
