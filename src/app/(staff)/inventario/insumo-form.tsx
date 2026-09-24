"use client";

import { useActionState, useMemo, useState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import type { EstadoInsumoForm } from "./actions";

const ESTADO_INICIAL: EstadoInsumoForm = { error: null };

export type AreaOpcion = { id: string; nombre: string };
export type UnidadOpcion = { id: string; etiqueta: string; magnitud: string };

export function InsumoForm({
  action,
  areas,
  unidades,
  valoresIniciales,
  textoBoton,
  soloLectura = false,
}: {
  action: (estadoPrevio: EstadoInsumoForm, formData: FormData) => Promise<EstadoInsumoForm>;
  areas: AreaOpcion[];
  unidades: UnidadOpcion[];
  valoresIniciales?: {
    nombre: string;
    area_id: string;
    unidad_compra_id: string;
    unidad_consumo_id: string;
    stock_minimo_consumo: number;
    existencia_inicial_consumo: number;
    requiere_caducidad: boolean;
    dias_aviso_caducidad: number | null;
  };
  textoBoton: string;
  // Estética lo ve pero no lo edita (dar de alta y editar es de admin y recepción).
  soloLectura?: boolean;
}) {
  const [estado, formAction, enviandoForm] = useActionState(useAccionConTope(action), ESTADO_INICIAL);
  const enviando = enviandoForm || soloLectura;
  const [unidadCompraId, setUnidadCompraId] = useState(valoresIniciales?.unidad_compra_id ?? "");
  const [requiereCaducidad, setRequiereCaducidad] = useState(valoresIniciales?.requiere_caducidad ?? false);

  const magnitudCompra = unidades.find((u) => u.id === unidadCompraId)?.magnitud;
  const unidadesConsumoCompatibles = useMemo(
    () => (magnitudCompra ? unidades.filter((u) => u.magnitud === magnitudCompra) : unidades),
    [unidades, magnitudCompra]
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

      <Field
        label="Nombre"
        name="nombre"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.nombre}
      />

      <Select
        label="Área"
        name="area_id"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.area_id ?? ""}
      >
        <option value="">Elige el área</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
      </Select>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Unidad de compra"
          name="unidad_compra_id"
          required
          disabled={enviando}
          value={unidadCompraId}
          onChange={(e) => setUnidadCompraId(e.target.value)}
        >
          <option value="">Elige una unidad</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.etiqueta}
            </option>
          ))}
        </Select>
        <Select
          label="Unidad de consumo"
          name="unidad_consumo_id"
          required
          disabled={enviando}
          defaultValue={valoresIniciales?.unidad_consumo_id ?? ""}
          ayuda="Debe ser de la misma magnitud que la de compra."
        >
          <option value="">Elige una unidad</option>
          {unidadesConsumoCompatibles.map((u) => (
            <option key={u.id} value={u.id}>
              {u.etiqueta}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Existencia inicial"
          name="existencia_inicial_consumo"
          type="number"
          step="0.01"
          min="0"
          disabled={enviando}
          defaultValue={valoresIniciales?.existencia_inicial_consumo ?? 0}
          ayuda="En la unidad de consumo."
        />
        <Field
          label="Stock mínimo"
          name="stock_minimo_consumo"
          type="number"
          step="0.01"
          min="0"
          disabled={enviando}
          defaultValue={valoresIniciales?.stock_minimo_consumo ?? 0}
          ayuda="Debajo de esto, avisa."
        />
      </div>

      <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3">
        <label className="flex items-center gap-2 text-n-900">
          <input
            type="checkbox"
            name="requiere_caducidad"
            disabled={enviando}
            checked={requiereCaducidad}
            onChange={(e) => setRequiereCaducidad(e.target.checked)}
            className="h-4 w-4"
          />
          Este insumo caduca
        </label>
        {requiereCaducidad && (
          <Field
            label="Días de aviso antes de caducar"
            name="dias_aviso_caducidad"
            type="number"
            min="1"
            disabled={enviando}
            defaultValue={valoresIniciales?.dias_aviso_caducidad ?? 30}
            ayuda="La fecha real de caducidad se captura por cada compra."
          />
        )}
      </div>

      {!soloLectura && (
        <AccionesFormulario error={estado.error} exito={estado.ok && "Cambios guardados"}>
          <Button type="submit" cargando={enviandoForm}>
            {enviandoForm ? "Guardando…" : textoBoton}
          </Button>
        </AccionesFormulario>
      )}
    </form>
  );
}
