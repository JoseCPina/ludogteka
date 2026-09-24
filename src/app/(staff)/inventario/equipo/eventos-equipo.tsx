"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { registrarEventoEquipo } from "./equipo-actions";

// Lo del día a día con el equipo, para todo el personal: cambiar el estado,
// registrar un mantenimiento o corregir cuántos hay. Cada cambio queda en la
// bitácora con quién y cuándo.
export function EventosEquipo({
  equipoId,
  estadoActual,
  cantidadActual,
  queMantenimiento,
  hoy,
}: {
  equipoId: string;
  estadoActual: string;
  cantidadActual: number;
  queMantenimiento: string | null;
  hoy: string;
}) {
  const router = useRouter();
  const enviando = useEspera();
  const [abierto, setAbierto] = useState<"estado" | "mantenimiento" | "cantidad" | null>(null);
  const [estado, setEstado] = useState(estadoActual);
  const [cantidad, setCantidad] = useState(String(cantidadActual));
  const [fecha, setFecha] = useState(hoy);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function abrir(cual: typeof abierto) {
    setAbierto(abierto === cual ? null : cual);
    setError(null);
    setExito(null);
    setNota("");
  }

  async function guardar() {
    if (!abierto) return;
    setError(null);
    const res = await enviando.ejecutar(() =>
      registrarEventoEquipo(equipoId, abierto, {
        estado: abierto === "estado" ? estado : undefined,
        cantidad: abierto === "cantidad" ? Number(cantidad) : undefined,
        fecha: abierto === "mantenimiento" ? fecha : null,
        nota,
      })
    );
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito(abierto === "mantenimiento" ? "Mantenimiento registrado" : "Guardado");
    setAbierto(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variante={abierto === "mantenimiento" ? "primario" : "secundario"} onClick={() => abrir("mantenimiento")}>
          Registrar mantenimiento
        </Button>
        <Button type="button" variante={abierto === "estado" ? "primario" : "secundario"} onClick={() => abrir("estado")}>
          Cambiar estado
        </Button>
        <Button type="button" variante={abierto === "cantidad" ? "primario" : "secundario"} onClick={() => abrir("cantidad")}>
          Corregir cuántos hay
        </Button>
      </div>
      {exito && !abierto && <p className="text-sm font-semibold text-verde-oscuro">{exito}</p>}

      {abierto && (
        <div className="flex max-w-lg flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
          {abierto === "mantenimiento" && (
            <>
              <p className="text-sm text-n-700">
                {queMantenimiento ? `${queMantenimiento}. ` : ""}Al registrarlo, el equipo queda en buen estado y el
                aviso se reinicia.
              </p>
              <Field label="Fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} disabled={enviando.cargando} />
            </>
          )}
          {abierto === "estado" && (
            <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} disabled={enviando.cargando}>
              <option value="bueno">Bueno</option>
              <option value="mantenimiento">Necesita mantenimiento</option>
              <option value="descompuesto">Descompuesto</option>
              <option value="baja">Dado de baja</option>
            </Select>
          )}
          {abierto === "cantidad" && (
            <Field label="Cuántos hay" type="number" min="0" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} disabled={enviando.cargando} />
          )}
          <Field
            label={abierto === "estado" && (estado === "descompuesto" || estado === "baja") ? "Qué pasó" : "Nota (opcional)"}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={enviando.cargando}
          />
          <AccionesFormulario error={error}>
            <Button type="button" cargando={enviando.cargando} onClick={guardar}>
              Guardar
            </Button>
            <Button type="button" variante="secundario" onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
          </AccionesFormulario>
        </div>
      )}
    </div>
  );
}
