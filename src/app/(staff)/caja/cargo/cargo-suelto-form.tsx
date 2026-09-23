"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { crearCargoSuelto } from "../mostrador-actions";

export type CargoCatalogo = { id: string; nombre: string; montoLibre: boolean; dependeTamano: boolean };

export function CargoSueltoForm({
  clienteId,
  cargos,
  perros,
}: {
  clienteId: string;
  cargos: CargoCatalogo[];
  perros: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [servicioId, setServicioId] = useState(cargos[0]?.id ?? "");
  const [perroId, setPerroId] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [importe, setImporte] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const enviando = useEspera();

  const cargo = cargos.find((c) => c.id === servicioId);

  async function enviar() {
    setError(null);
    const res = await enviando.ejecutar(() =>
      crearCargoSuelto({
        clienteId,
        servicioId,
        cantidad: Number(cantidad) || 0,
        importe: cargo?.montoLibre ? Number(importe) || null : null,
        descripcion,
        perroId: perroId || null,
        notas,
      })
    );
    if (res.error || !res.reservaId) return setError(res.error ?? "No pudimos aplicar el cargo.");
    router.push(`/caja/cobrar/${res.reservaId}`);
  }

  if (cargos.length === 0) {
    return (
      <Alert variante="advertencia" titulo="No hay cargos que se puedan aplicar sueltos">
        Los cargos que dependen del tamaño del perro se aplican desde su estancia; los demás necesitan precio en la matriz.
      </Alert>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
      {error && (
        <Alert variante="error" titulo="No se pudo aplicar">
          {error}
        </Alert>
      )}
      <Select label="Cargo" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
        {cargos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.montoLibre ? " (monto libre)" : ""}
          </option>
        ))}
      </Select>
      {perros.length > 0 && (
        <Select label="Perro (opcional)" value={perroId} onChange={(e) => setPerroId(e.target.value)}>
          <option value="">Sin perro en particular</option>
          {perros.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      )}
      <div className="flex flex-wrap gap-3">
        <div className="w-28">
          <Field label="Cantidad" type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
        {cargo?.montoLibre && (
          <div className="w-36">
            <Field label="Importe" type="number" min="0" step="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} />
          </div>
        )}
      </div>
      <Field
        label={cargo?.montoLibre ? "Qué se le dio (obligatorio)" : "Descripción (opcional)"}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="ej. Collar mediano azul"
      />
      <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
      <AccionesFormulario error={null}>
        <Button type="button" cargando={enviando.cargando} onClick={enviar}>
          {enviando.cargando ? "Aplicando…" : "Aplicar y cobrar"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
