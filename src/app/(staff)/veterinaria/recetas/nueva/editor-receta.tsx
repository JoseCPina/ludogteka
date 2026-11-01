"use client";

import { useState } from "react";
import { AvisoBorrador, useAutoguardado } from "@/lib/borradores/use-autoguardado";
import { useAvisoAlSalir } from "@/hooks/use-aviso-al-salir";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { calcularCantidad, horasDeFrecuencia, indicacionesGeneradas, medicamentosDeTratamiento, numeroInicial, type Requisito } from "@/lib/veterinaria/recetas";
import { emitirReceta } from "../actions";
import { Enlace } from "@/components/ui/enlace";

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
  // true cuando el médico escribió la cantidad: deja de seguir al cálculo.
  cantidad_manual: boolean;
  cantidad_unidad: string;
  indicaciones: string;
  // true cuando el médico escribió las indicaciones: dejan de seguir a los datos del renglón.
  indicaciones_manual: boolean;
  // Lo que va antes de la dosis cuando el renglón vino del Tratamiento («Meloxicam 1 mg»); vacío = el medicamento.
  base: string;
};

const vacia = (): Fila => ({ insumo_id: "", producto: "", principio_activo: "", presentacion: "", dosis: "", dosis_cantidad: "", via: "Oral", frecuencia: "", frecuencia_horas: "", duracion_dias: "", tiempo_retiro: "", cantidad_surtir: "", cantidad_manual: false, cantidad_unidad: "", indicaciones: "", indicaciones_manual: false, base: "" });
const num = (t: string) => Number(String(t).replace(",", ".").trim());
const caja = "mt-1.5 min-h-12 w-full rounded-md border-[1.5px] border-borde bg-white px-3.5 text-base text-n-900";

/** El borrador de una receta simple: medicamentos del inventario o en texto libre, con la cantidad a surtir calculada. */
export function EditorReceta({ perroId, consultaId, productos, tratamiento = null }: { perroId: string; consultaId: string | null; productos: ProductoReceta[]; tratamiento?: string | null }) {
  const router = useRouter();
  const envio = useEspera();
  // Con una consulta firmada, el borrador sale del campo «Tratamiento» (el médico lo revisa y lo corrige).
  const [prellenado] = useState(() => medicamentosDeTratamiento(tratamiento));
  const [filas, setFilas] = useState<Fila[]>(() => (prellenado.length > 0 ? prellenado.map((m) => ({ ...vacia(), ...m, indicaciones_manual: false })) : [vacia()]));
  const [diagnostico, setDiagnostico] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);

  // N34: lo que se escribe se guarda como borrador (1.5 s después de dejar de escribir) y al volver a abrir la
  // receta de esta mascota se ofrece recuperarlo; y se avisa antes de salir con cambios sin emitir.
  const [inicial] = useState(() => JSON.stringify({ filas, diagnostico: "", observaciones: "" }));
  const valorBorrador = { filas, diagnostico, observaciones };
  const sinCambios = (v: typeof valorBorrador) => JSON.stringify(v) === inicial;
  const borrador = useAutoguardado<typeof valorBorrador>({
    formulario: "receta",
    clave: `${perroId}:${consultaId ?? "ficha"}`,
    valor: valorBorrador,
    esVacio: sinCambios,
    alRecuperar: (d) => {
      if (Array.isArray(d.filas) && d.filas.length > 0) setFilas(d.filas);
      setDiagnostico(typeof d.diagnostico === "string" ? d.diagnostico : "");
      setObservaciones(typeof d.observaciones === "string" ? d.observaciones : "");
    },
  });
  const [emitida, setEmitida] = useState(false);
  const sinEmitir = !emitida && !sinCambios(valorBorrador);
  // N34: avisa al recargar, al cerrar y al salir por un enlace de la app (menú lateral, Inicio, Clientes).
  useAvisoAlSalir(sinEmitir, "La receta no se ha emitido. Lo que escribiste queda en el borrador. ¿Salir de todos modos?");

  const emitibles = productos.filter((p) => p.documento === "libre" || p.documento === "receta_simple" || p.documento === "receta_cedula");
  const cambiar = (i: number, parche: Partial<Fila>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...parche } : x)));

  function elegirProducto(i: number, id: string) {
    const p = emitibles.find((x) => x.id === id);
    cambiar(i, p ? { insumo_id: id, producto: p.nombre, principio_activo: p.principio_activo ?? "", presentacion: p.presentacion ?? "", cantidad_unidad: p.unidad ?? "" } : { insumo_id: "" });
  }
  // La cuenta usa los números escritos o, si faltan, los que se entienden de «1 tableta» y «Cada 12 horas».
  // Con una frecuencia escrita que no se entiende no se calcula (no se inventa una cantidad).
  const datosDeCuenta = (f: Fila) => {
    const dosis = f.dosis_cantidad ? num(f.dosis_cantidad) : numeroInicial(f.dosis);
    const horas = f.frecuencia_horas ? num(f.frecuencia_horas) : horasDeFrecuencia(f.frecuencia);
    return { dosis, horas, sinEntender: !horas && f.frecuencia.trim() !== "" };
  };
  const calculada = (f: Fila) => {
    const { dosis, horas, sinEntender } = datosDeCuenta(f);
    if (sinEntender || dosis === null) return null;
    return calcularCantidad(dosis, horas, num(f.duracion_dias));
  };
  // Lo que se ve en «Cantidad a surtir»: lo que escribió el médico o, mientras no escriba, la cuenta.
  const generadas = (f: Fila) => indicacionesGeneradas({ dosis: f.dosis, frecuencia: f.frecuencia, duracion_dias: f.duracion_dias });
  // Lo que se ve en «Indicaciones»: lo que escribió el médico o, mientras no escriba, lo que sale de los datos.
  const indicacionesDe = (f: Fila) => (f.indicaciones_manual ? f.indicaciones : generadas(f));
  const cantidadDe = (f: Fila) => (f.cantidad_manual ? f.cantidad_surtir : (calculada(f) ?? ""));

  async function emitir() {
    setError(null);
    // Un guardado pendiente del borrador no debe llegar después de emitir y volver a dejar un borrador (N34).
    borrador.pausar();
    const lineas = filas
      .filter((f) => f.producto.trim() || f.insumo_id)
      .map((f) => ({
        insumo_id: f.insumo_id || null,
        producto: f.producto.trim() || null,
        principio_activo: f.principio_activo.trim() || null,
        presentacion: f.presentacion.trim() || null,
        dosis: f.dosis.trim(),
        dosis_cantidad: datosDeCuenta(f).dosis ?? null,
        via: f.via.trim(),
        frecuencia: f.frecuencia.trim(),
        frecuencia_horas: datosDeCuenta(f).horas ?? null,
        duracion_dias: f.duracion_dias ? Math.trunc(num(f.duracion_dias)) : null,
        tiempo_retiro: f.tiempo_retiro.trim() || null,
        cantidad_surtir: cantidadDe(f) !== "" ? num(String(cantidadDe(f))) : null,
        cantidad_unidad: f.cantidad_unidad.trim() || null,
        indicaciones: indicacionesDe(f).trim() || null,
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
    setEmitida(true);
    if (r.ir) router.push(r.ir);
  }

  return (
    <div className="flex flex-col gap-5">
      <AvisoBorrador estado={borrador} />
      {prellenado.length > 0 && (
        <p data-receta-prellenada className="rounded-md border-l-4 border-morado bg-morado-suave px-3 py-2 text-sm text-n-800">
          Prellenamos {prellenado.length === 1 ? "el medicamento" : "los medicamentos"} con el «Tratamiento» de la consulta. Revísalo{prellenado.length === 1 ? "" : "s"}: puedes cambiar cualquier campo.
        </p>
      )}
      {filas.map((f, i) => {
        const elegido = emitibles.find((p) => p.id === f.insumo_id);
        const calc = calculada(f);
        return (
          <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
            <legend className="px-1 text-sm font-bold text-n-700">Medicamento {i + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {emitibles.length === 0 ? (
                <p data-sin-productos className="rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm text-n-800">
                  No hay productos cargados. Dalos de alta en <Enlace href="/veterinaria/inventario" enTexto>Inventario</Enlace>, o escribe el medicamento a mano.
                </p>
              ) : (
              <label className="block text-sm font-medium text-n-800">
                Del inventario clínico (opcional)
                <select className={caja} value={f.insumo_id} onChange={(e) => elegirProducto(i, e.target.value)}>
                  <option value="">— Escribirlo a mano —</option>
                  {emitibles.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.documento === "receta_cedula" ? " · con cédula" : ""}</option>
                  ))}
                </select>
              </label>
              )}
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
              <Field label="Cantidad a surtir" name={`cant-${i}`} value={String(cantidadDe(f))} onChange={(e) => cambiar(i, { cantidad_surtir: e.target.value, cantidad_manual: true })} inputMode="decimal"
                ayuda={f.cantidad_manual
                  ? "La escribiste tú."
                  : (calc ? `Calculada: ${calc} (dosis × tomas al día × días). Puedes cambiarla.` : "Escribe la cantidad, o llena dosis, frecuencia y días para calcularla.")} />
              <Field label="Unidad" name={`uni-${i}`} value={f.cantidad_unidad} onChange={(e) => cambiar(i, { cantidad_unidad: e.target.value })} placeholder="tabletas, ml, frasco" />
              <Field label="Tiempo de retiro (si aplica)" name={`ret-${i}`} value={f.tiempo_retiro} onChange={(e) => cambiar(i, { tiempo_retiro: e.target.value })} placeholder="28 días" />
            </div>
            {f.cantidad_manual && calc !== null && Number(String(f.cantidad_surtir).replace(",", ".")) !== calc && (
              <Button type="button" data-usar-calculada onClick={() => cambiar(i, { cantidad_manual: false })} className="w-fit" variante="secundario" tamano="compacto">
                Usar la cantidad calculada con dosis, frecuencia y días ({calc})
              </Button>
            )}
            <Field label="Indicaciones (opcional)" name={`ind-${i}`} value={indicacionesDe(f)} onChange={(e) => cambiar(i, { indicaciones: e.target.value, indicaciones_manual: true })}
              ayuda={f.indicaciones_manual ? "Las escribiste tú." : "Se arman con la dosis, la frecuencia y los días. Puedes cambiarlas."} />
            {f.indicaciones_manual && f.indicaciones.trim() !== generadas(f).trim() && (
              <div data-indicaciones-desfasadas className="flex flex-col gap-1 rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm text-n-800">
                <span>Las indicaciones ya no coinciden con la dosis, la frecuencia y los días de arriba.</span>
                <Button type="button" data-regenerar-indicaciones onClick={() => cambiar(i, { indicaciones_manual: false })} className="w-fit text-left" variante="secundario" tamano="compacto">
                  Regenerar las indicaciones{generadas(f) ? `: «${generadas(f)}»` : ""}
                </Button>
              </div>
            )}
            {filas.length > 1 && (
              <Button type="button" onClick={() => setFilas((x) => x.filter((_, j) => j !== i))} className="w-fit" variante="secundario" tamano="compacto">
                Quitar este medicamento
              </Button>
            )}
          </fieldset>
        );
      })}
      <Button type="button" onClick={() => setFilas((x) => [...x, vacia()])} className="w-fit" variante="secundario" tamano="compacto">
        + Otro medicamento
      </Button>
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
