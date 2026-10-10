"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { TIPOS_LINEA, dinero, type LineaEstimado, type MedicoVet } from "@/lib/veterinaria/expediente";
import { guardarEstimado } from "../expediente/actions";

type Insumo = { id: string; nombre: string; unidad: string | null; precio: number | null };
type Fila = { tipo: LineaEstimado["tipo"]; descripcion: string; cantidad: string; unidad: string; precio_min: string; precio_max: string; insumo_id: string };

const vacia = (tipo: Fila["tipo"] = "servicio"): Fila => ({ tipo, descripcion: "", cantidad: "1", unidad: "", precio_min: "", precio_max: "", insumo_id: "" });
const num = (t: string) => Number(String(t).replace(",", ".").trim());

function aFila(l: LineaEstimado): Fila {
  return { tipo: l.tipo, descripcion: l.descripcion, cantidad: String(l.cantidad), unidad: l.unidad ?? "", precio_min: String(l.precio_min), precio_max: String(l.precio_max), insumo_id: l.insumo_id ?? "" };
}

/** El borrador de un estimado: líneas de servicios, procedimientos e insumos del inventario con mínimo y máximo. */
export function EditorEstimado({
  id, perroId, consultaId, inicial, medicos, medicoPropio, insumos, hoy,
}: {
  id: string | null;
  perroId: string;
  consultaId: string | null;
  inicial?: { tipo: "consulta" | "cirugia"; titulo: string; notas: string; vigente_hasta: string; medico_id: string | null; lineas: LineaEstimado[] };
  medicos: MedicoVet[];
  medicoPropio: string | null;
  insumos: Insumo[];
  hoy: string;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [tipo, setTipo] = useState<"consulta" | "cirugia">(inicial?.tipo ?? "consulta");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [vigente, setVigente] = useState(inicial?.vigente_hasta ?? "");
  const [medico, setMedico] = useState(inicial?.medico_id ?? medicoPropio ?? "");
  const [filas, setFilas] = useState<Fila[]>(inicial?.lineas.length ? inicial.lineas.map(aFila) : [vacia()]);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cambiar = (i: number, parche: Partial<Fila>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...parche } : x)));
  const totales = filas.reduce(
    (a, f) => ({ min: a.min + (num(f.cantidad) || 0) * (num(f.precio_min) || 0), max: a.max + (num(f.cantidad) || 0) * (num(f.precio_max) || num(f.precio_min) || 0) }),
    { min: 0, max: 0 }
  );

  async function guardar() {
    setError(null);
    setExito(null);
    const lineas: LineaEstimado[] = [];
    for (const [i, f] of filas.entries()) {
      if (!f.descripcion.trim() && !f.precio_min.trim()) continue;
      const min = num(f.precio_min);
      const max = f.precio_max.trim() === "" ? min : num(f.precio_max);
      if (!f.descripcion.trim()) return setError(`Línea ${i + 1}: escribe qué es.`);
      if (!(num(f.cantidad) > 0)) return setError(`Línea ${i + 1}: la cantidad tiene que ser mayor a cero.`);
      if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < min) return setError(`Línea ${i + 1}: el mínimo no puede ser mayor al máximo.`);
      lineas.push({ tipo: f.tipo, descripcion: f.descripcion.trim(), cantidad: num(f.cantidad), unidad: f.unidad.trim() || null, precio_min: min, precio_max: max, insumo_id: f.insumo_id || null });
    }
    if (!titulo.trim()) return setError("Escribe un título para el estimado.");
    const r = await envio.ejecutar(() =>
      guardarEstimado({ id, perro_id: perroId, consulta_id: consultaId, tipo, titulo: titulo.trim(), notas, vigente_hasta: vigente || null, medico_id: medico || null, lineas })
    );
    if (r.error) return setError(r.error);
    setExito("Estimado guardado.");
    if (!id && r.id) router.push(`/veterinaria/estimados/${r.id}`);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 rounded-lg border border-n-200 bg-white p-5 sm:grid-cols-2">
        <Field label="Título" name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Esterilización, limpieza dental…" required />
        <Select label="Tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "consulta" | "cirugia")}>
          <option value="consulta">Consulta</option>
          <option value="cirugia">Cirugía</option>
        </Select>
        <Select label="Médico" name="medico_id" value={medico} onChange={(e) => setMedico(e.target.value)}>
          <option value="">— Sin médico —</option>
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
        <Field label="Vigente hasta" name="vigente" type="date" min={hoy} value={vigente} onChange={(e) => setVigente(e.target.value)} ayuda="Vacío: 15 días." />
        <div className="sm:col-span-2">
          <Textarea label="Notas para el dueño (opcional)" name="notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Líneas</h2>
        <p className="text-sm text-n-600">Cada línea lleva un precio mínimo (lo seguro) y uno máximo. Al aceptar, el mínimo pasa a la cuenta; lo demás se agrega cuando ocurre, hasta el máximo.</p>
        {filas.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-n-200 bg-n-50 p-3 sm:grid-cols-6">
            <Select label="Tipo" name={`tipo_${i}`} value={f.tipo} onChange={(e) => cambiar(i, { tipo: e.target.value as Fila["tipo"], insumo_id: e.target.value === "insumo" ? f.insumo_id : "" })}>
              {Object.entries(TIPOS_LINEA).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </Select>
            {f.tipo === "insumo" && (
              <div className="sm:col-span-2">
                <Select
                  label="Del inventario (opcional)"
                  name={`insumo_${i}`}
                  value={f.insumo_id}
                  onChange={(e) => {
                    const ins = insumos.find((x) => x.id === e.target.value);
                    cambiar(i, ins ? { insumo_id: ins.id, descripcion: ins.nombre, unidad: ins.unidad ?? "", precio_min: f.precio_min || (ins.precio != null ? String(ins.precio) : ""), precio_max: f.precio_max || (ins.precio != null ? String(ins.precio) : "") } : { insumo_id: "" });
                  }}
                >
                  <option value="">— Lo escribo yo —</option>
                  {insumos.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className={f.tipo === "insumo" ? "sm:col-span-3" : "sm:col-span-5"}>
              <Field label="Descripción" name={`desc_${i}`} value={f.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} />
            </div>
            <Field label="Cantidad" name={`cant_${i}`} inputMode="decimal" value={f.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} />
            <Field label="Precio mínimo" name={`min_${i}`} inputMode="decimal" value={f.precio_min} onChange={(e) => cambiar(i, { precio_min: e.target.value })} />
            <Field label="Precio máximo" name={`max_${i}`} inputMode="decimal" value={f.precio_max} onChange={(e) => cambiar(i, { precio_max: e.target.value })} ayuda="Vacío: igual al mínimo." />
            <div className="flex items-end justify-between gap-2 sm:col-span-3">
              <span className="text-sm text-n-700">
                {dinero((num(f.cantidad) || 0) * (num(f.precio_min) || 0))} – {dinero((num(f.cantidad) || 0) * (num(f.precio_max) || num(f.precio_min) || 0))}
              </span>
              <button type="button" className="text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => setFilas((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [vacia()]))}>
                Quitar línea
              </button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variante="secundario" onClick={() => setFilas((x) => [...x, vacia("servicio")])}>+ Servicio</Button>
          <Button type="button" variante="secundario" onClick={() => setFilas((x) => [...x, vacia("procedimiento")])}>+ Procedimiento</Button>
          <Button type="button" variante="secundario" onClick={() => setFilas((x) => [...x, vacia("insumo")])}>+ Insumo</Button>
        </div>
        <p className="text-lg font-bold text-n-900">
          Total estimado: {dinero(totales.min)} – {dinero(totales.max)}
        </p>
      </section>

      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={envio.cargando} onClick={guardar}>
          Guardar borrador
        </Button>
      </AccionesFormulario>
    </div>
  );
}
