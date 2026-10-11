"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { calcularCantidad, type Requisito } from "@/lib/veterinaria/recetas";
import { emitirReceta } from "../actions";

export type ProductoReceta = {
  id: string;
  nombre: string;
  presentacion: string | null;
  principio_activo: string | null;
  unidad: string | null;
  documento: Requisito["documento"];
  clasificacion: string | null;
  surtidos_max: number | null;
};

type Fila = {
  insumo_id: string;
  producto: string;
  principio_activo: string;
  presentacion: string;
  dosis: string;
  dosis_cantidad: string;
  via: string;
  frecuencia: string;
  frecuencia_horas: string;
  duracion_dias: string;
  tiempo_retiro: string;
  cantidad_surtir: string;
  cantidad_unidad: string;
  indicaciones: string;
};

const vacia = (): Fila => ({ insumo_id: "", producto: "", principio_activo: "", presentacion: "", dosis: "", dosis_cantidad: "", via: "Oral", frecuencia: "", frecuencia_horas: "", duracion_dias: "", tiempo_retiro: "", cantidad_surtir: "", cantidad_unidad: "", indicaciones: "" });
const num = (t: string) => Number(String(t).replace(",", ".").trim());
const caja = "mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900";

/** El borrador de una receta simple: medicamentos del inventario o en texto libre, con la cantidad a surtir calculada. */
export function EditorReceta({ perroId, consultaId, productos }: { perroId: string; consultaId: string | null; productos: ProductoReceta[] }) {
  const router = useRouter();
  const envio = useEspera();
  const [filas, setFilas] = useState<Fila[]>([vacia()]);
  const [diagnostico, setDiagnostico] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emitibles = productos.filter((p) => p.documento === "libre" || p.documento === "receta_simple" || p.documento === "receta_cedula");
  const cambiar = (i: number, parche: Partial<Fila>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...parche } : x)));

  function elegirProducto(i: number, id: string) {
    const p = emitibles.find((x) => x.id === id);
    cambiar(i, p ? { insumo_id: id, producto: p.nombre, principio_activo: p.principio_activo ?? "", presentacion: p.presentacion ?? "", cantidad_unidad: p.unidad ?? "" } : { insumo_id: "" });
  }
  const calculada = (f: Fila) => calcularCantidad(num(f.dosis_cantidad), f.frecuencia_horas ? num(f.frecuencia_horas) : null, num(f.duracion_dias));

  async function emitir() {
    setError(null);
    const lineas = filas
      .filter((f) => f.producto.trim() || f.insumo_id)
      .map((f) => ({
        insumo_id: f.insumo_id || null,
        producto: f.producto.trim() || null,
        principio_activo: f.principio_activo.trim() || null,
        presentacion: f.presentacion.trim() || null,
        dosis: f.dosis.trim(),
        dosis_cantidad: f.dosis_cantidad ? num(f.dosis_cantidad) : null,
        via: f.via.trim(),
        frecuencia: f.frecuencia.trim(),
        frecuencia_horas: f.frecuencia_horas ? num(f.frecuencia_horas) : null,
        duracion_dias: f.duracion_dias ? Math.trunc(num(f.duracion_dias)) : null,
        tiempo_retiro: f.tiempo_retiro.trim() || null,
        cantidad_surtir: f.cantidad_surtir ? num(f.cantidad_surtir) : null,
        cantidad_unidad: f.cantidad_unidad.trim() || null,
        indicaciones: f.indicaciones.trim() || null,
      }));
    if (lineas.length === 0) {
      setError("Agrega al menos un medicamento.");
      return;
    }
    const fd = new FormData();
    fd.set("lineas", JSON.stringify(lineas));
    fd.set("diagnostico", diagnostico);
    fd.set("observaciones", observaciones);
    const r = await envio.ejecutar(() => emitirReceta(perroId, consultaId, fd));
    if (r.error) {
      setError(r.error);
      return;
    }
    if (r.ir) router.push(r.ir);
  }

  return (
    <div className="flex flex-col gap-5">
      {filas.map((f, i) => {
        const elegido = emitibles.find((p) => p.id === f.insumo_id);
        const calc = calculada(f);
        return (
          <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
            <legend className="px-1 text-sm font-bold text-n-700">Medicamento {i + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-n-800">
                Del inventario clínico (opcional)
                <select className={caja} value={f.insumo_id} onChange={(e) => elegirProducto(i, e.target.value)}>
                  <option value="">— Escribirlo a mano —</option>
                  {emitibles.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.documento === "receta_cedula" ? " · con cédula" : ""}</option>
                  ))}
                </select>
              </label>
              <Field label="Medicamento" name={`producto-${i}`} value={f.producto} onChange={(e) => cambiar(i, { producto: e.target.value })} required />
              <Field label="Principio activo (opcional)" name={`pa-${i}`} value={f.principio_activo} onChange={(e) => cambiar(i, { principio_activo: e.target.value })} />
              <Field label="Presentación (opcional)" name={`pres-${i}`} value={f.presentacion} onChange={(e) => cambiar(i, { presentacion: e.target.value })} placeholder="Tabletas de 20 mg" />
            </div>
            {elegido?.documento === "receta_cedula" && (
              <p className="rounded-md bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">
                {elegido.clasificacion}: la receta lleva tu cédula y {elegido.surtidos_max === 1 ? "se surte una sola vez y se retiene" : elegido.surtidos_max ? `se puede surtir hasta ${elegido.surtidos_max} veces dentro de su plazo` : "tiene regla de surtido propia"}. La regla la fija la plataforma.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Dosis (como se escribe)" name={`dosis-${i}`} value={f.dosis} onChange={(e) => cambiar(i, { dosis: e.target.value })} placeholder="1 tableta" required />
              <Field label="Dosis por toma (número, para calcular)" name={`dn-${i}`} value={f.dosis_cantidad} onChange={(e) => cambiar(i, { dosis_cantidad: e.target.value })} inputMode="decimal" placeholder="1" />
              <Field label="Vía de administración" name={`via-${i}`} value={f.via} onChange={(e) => cambiar(i, { via: e.target.value })} required />
              <Field label="Frecuencia (como se escribe)" name={`frec-${i}`} value={f.frecuencia} onChange={(e) => cambiar(i, { frecuencia: e.target.value })} placeholder="Cada 12 horas" required />
              <Field label="Cada cuántas horas (número)" name={`fh-${i}`} value={f.frecuencia_horas} onChange={(e) => cambiar(i, { frecuencia_horas: e.target.value })} inputMode="decimal" placeholder="12" />
              <Field label="Duración (días)" name={`dur-${i}`} value={f.duracion_dias} onChange={(e) => cambiar(i, { duracion_dias: e.target.value })} inputMode="numeric" placeholder="5" required />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Cantidad a surtir" name={`cant-${i}`} value={f.cantidad_surtir} onChange={(e) => cambiar(i, { cantidad_surtir: e.target.value })} inputMode="decimal"
                ayuda={calc ? `Calculada: ${calc} (dosis × tomas al día × días). Déjala vacía para usar esa.` : "Escribe la cantidad, o llena dosis, horas y días para calcularla."} />
              <Field label="Unidad" name={`uni-${i}`} value={f.cantidad_unidad} onChange={(e) => cambiar(i, { cantidad_unidad: e.target.value })} placeholder="tabletas, ml, frasco" />
              <Field label="Tiempo de retiro (si aplica)" name={`ret-${i}`} value={f.tiempo_retiro} onChange={(e) => cambiar(i, { tiempo_retiro: e.target.value })} placeholder="28 días" />
            </div>
            <Field label="Indicaciones (opcional)" name={`ind-${i}`} value={f.indicaciones} onChange={(e) => cambiar(i, { indicaciones: e.target.value })} />
            {filas.length > 1 && (
              <button type="button" className="w-fit text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => setFilas((x) => x.filter((_, j) => j !== i))}>
                Quitar este medicamento
              </button>
            )}
          </fieldset>
        );
      })}
      <button type="button" className="w-fit text-sm font-semibold text-morado hover:underline" onClick={() => setFilas((x) => [...x, vacia()])}>
        + Otro medicamento
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Diagnóstico o motivo (opcional)" name="diagnostico" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />
        <Textarea label="Observaciones (opcional)" name="observaciones" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </div>
      <p className="text-sm text-n-600">Se emite a tu nombre y con tu cédula. Los de Grupo I y los estupefacientes no se recetan aquí: van en «Registro SITPV» y «Recetario especial».</p>
      <AccionesFormulario error={error} exito={null}>
        <Button type="button" cargando={envio.cargando} onClick={emitir}>Emitir receta</Button>
      </AccionesFormulario>
    </div>
  );
}
