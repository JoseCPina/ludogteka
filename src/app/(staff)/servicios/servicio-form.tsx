"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { EstadoServicioForm } from "./actions";

const ESTADO_INICIAL: EstadoServicioForm = { error: null };

export type ServicioOpcion = { id: string; nombre: string };

export function ServicioForm({
  action,
  serviciosDisponibles,
  valoresIniciales,
  textoBoton,
}: {
  action: (estadoPrevio: EstadoServicioForm, formData: FormData) => Promise<EstadoServicioForm>;
  serviciosDisponibles: ServicioOpcion[];
  valoresIniciales?: {
    clave: string;
    nombre: string;
    categoria: string;
    unidad: string;
    depende_tamano: boolean;
    depende_pelaje: boolean;
    depende_cantidad: boolean;
    servicio_incluido_id: string | null;
    cantidad_incluida: number | null;
    vigencia_dias: number | null;
    orden: number;
  };
  textoBoton: string;
}) {
  const [estado, formAction, enviando] = useActionState(action, ESTADO_INICIAL);
  const [categoria, setCategoria] = useState(valoresIniciales?.categoria ?? "guarderia");
  const esBono = categoria === "bono";

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Clave"
          name="clave"
          required
          disabled={enviando}
          defaultValue={valoresIniciales?.clave}
          ayuda="Identificador interno, sin espacios."
        />
        <Field
          label="Nombre"
          name="nombre"
          required
          disabled={enviando}
          defaultValue={valoresIniciales?.nombre}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Categoría"
          name="categoria"
          required
          disabled={enviando}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="guarderia">Guardería</option>
          <option value="hotel">Hotel</option>
          <option value="estetica">Estética</option>
          <option value="cargo">Cargo adicional</option>
          <option value="bono">Bono</option>
        </Select>
        <Select
          label="Unidad"
          name="unidad"
          required
          disabled={enviando}
          defaultValue={valoresIniciales?.unidad ?? "dia"}
        >
          <option value="dia">Día</option>
          <option value="noche">Noche</option>
          <option value="sesion">Sesión</option>
          <option value="evento">Evento</option>
          <option value="km">Kilómetro</option>
        </Select>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-n-800">
          Dimensiones de precio — determinan cuántas celdas tiene la matriz de tarifas
        </p>
        <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3">
          <label className="flex items-center gap-2 text-n-900">
            <input
              type="checkbox"
              name="depende_tamano"
              disabled={enviando}
              defaultChecked={valoresIniciales?.depende_tamano ?? false}
              className="h-4 w-4"
            />
            Depende del tamaño del perro
          </label>
          <label className="flex items-center gap-2 text-n-900">
            <input
              type="checkbox"
              name="depende_pelaje"
              disabled={enviando}
              defaultChecked={valoresIniciales?.depende_pelaje ?? false}
              className="h-4 w-4"
            />
            Depende del pelaje del perro
          </label>
          <label className="flex items-center gap-2 text-n-900">
            <input
              type="checkbox"
              name="depende_cantidad"
              disabled={enviando}
              defaultChecked={valoresIniciales?.depende_cantidad ?? false}
              className="h-4 w-4"
            />
            Precio por volumen (tramos de cantidad, ej. noches de hotel)
          </label>
        </div>
      </div>

      {esBono && (
        <div className="flex flex-col gap-4 rounded-md border-[1.5px] border-turquesa bg-turquesa-suave p-3">
          <p className="text-sm font-semibold text-turquesa-oscuro">Solo para bonos</p>
          <Select
            label="Servicio al que da acceso"
            name="servicio_incluido_id"
            required={esBono}
            disabled={enviando}
            defaultValue={valoresIniciales?.servicio_incluido_id ?? ""}
          >
            <option value="">Elige un servicio</option>
            {serviciosDisponibles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Unidades incluidas"
              name="cantidad_incluida"
              type="number"
              min="1"
              required={esBono}
              disabled={enviando}
              defaultValue={valoresIniciales?.cantidad_incluida ?? ""}
            />
            <Field
              label="Vigencia (días, opcional)"
              name="vigencia_dias"
              type="number"
              min="1"
              disabled={enviando}
              defaultValue={valoresIniciales?.vigencia_dias ?? ""}
              ayuda="Vacío = sin vencimiento."
            />
          </div>
        </div>
      )}

      <Field
        label="Orden de aparición"
        name="orden"
        type="number"
        disabled={enviando}
        defaultValue={valoresIniciales?.orden ?? 0}
      />

      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
