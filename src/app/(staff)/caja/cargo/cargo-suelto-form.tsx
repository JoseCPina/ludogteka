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
import { crearCargoSuelto, crearCargoVeterinario } from "../mostrador-actions";
import { crearVentaRapida } from "../venta/venta-actions";
import { dinero } from "@/lib/dinero";

export type CargoCatalogo = { id: string; nombre: string; montoLibre: boolean; dependeTamano: boolean };
// QA S16 (N66): conceptos de Veterinaria (con su precio de catálogo) y productos que se venden.
export type ConceptoVet = { clave: string; nombre: string; precio: number | null };
export type ProductoCargo = { id: string; nombre: string; precio: number };

export function CargoSueltoForm({
  clienteId,
  cargos,
  perros,
  conceptosVet = [],
  productos = [],
}: {
  clienteId: string;
  cargos: CargoCatalogo[];
  perros: { id: string; nombre: string }[];
  conceptosVet?: ConceptoVet[];
  productos?: ProductoCargo[];
}) {
  const router = useRouter();
  // Lo elegido: «c:<servicio>» (cargo), «v:<clave>» (Veterinaria) o «p:<insumo>» (producto).
  const primerVet = conceptosVet.find((c) => c.precio != null);
  const [eleccion, setEleccion] = useState(primerVet ? `v:${primerVet.clave}` : cargos[0] ? `c:${cargos[0].id}` : productos[0] ? `p:${productos[0].id}` : "");
  const [tipo, valor] = [eleccion.slice(0, 1), eleccion.slice(2)];
  const servicioId = tipo === "c" ? valor : "";
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
    if (tipo === "v" || tipo === "p") {
      const r = await enviando.ejecutar(() =>
        tipo === "v"
          ? crearCargoVeterinario({ clienteId, clave: valor, cantidad: Number(cantidad) || 0, perroId: perroId || null, notas })
          : crearVentaRapida(clienteId, [{ insumoId: valor, concepto: "", precio: null, cantidad: Number(cantidad) || 0 }], notas)
      );
      if (r.error || !r.reservaId) return setError(r.error ?? "No pudimos aplicar el cargo.");
      router.push(`/caja/cobrar/${r.reservaId}`);
      return;
    }
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

  if (cargos.length === 0 && conceptosVet.length === 0 && productos.length === 0) {
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
      <Select label="Qué se cobra" value={eleccion} onChange={(e) => setEleccion(e.target.value)}>
        {conceptosVet.length > 0 && (
          <optgroup label="Veterinaria">
            {conceptosVet.map((c) => (
              <option key={c.clave} value={`v:${c.clave}`} disabled={c.precio == null}>
                {c.nombre} {c.precio == null ? "(sin precio: captúralo en Servicios)" : `· ${dinero(c.precio)}`}
              </option>
            ))}
          </optgroup>
        )}
        {cargos.length > 0 && (
          <optgroup label="Cargos">
            {cargos.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.nombre}
                {c.montoLibre ? " (monto libre)" : ""}
              </option>
            ))}
          </optgroup>
        )}
        {productos.length > 0 && (
          <optgroup label="Productos (descuentan inventario)">
            {productos.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                {p.nombre} · {dinero(p.precio)}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      {perros.length > 0 && tipo !== "p" && (
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
      {tipo === "c" && (
      <Field
        label={cargo?.montoLibre ? "Qué se le dio (obligatorio)" : "Descripción (opcional)"}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="ej. Collar mediano azul"
      />
      )}
      <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
      <AccionesFormulario error={null}>
        <Button type="button" cargando={enviando.cargando} onClick={enviar}>
          {enviando.cargando ? "Aplicando…" : "Aplicar y cobrar"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
