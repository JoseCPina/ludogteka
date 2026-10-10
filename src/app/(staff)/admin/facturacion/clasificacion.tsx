"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CLASES_DE_SERVICIO, ETIQUETA_CLASE } from "@/components/cfdi/textos";
import { guardarInsumoFiscal, guardarServicioFiscal } from "./actions";

type FiscalInsumo = { insumo_id: string; de_patente: boolean; clase: "alimento_mascotas" | "otro_producto" };

// Cómo se factura cada producto que se vende y cada servicio. Un producto sin
// clasificar sale como «otro producto» con IVA; un servicio sale por su categoría
// (estética, guardería, hotel). Solo cambia lo que no cae solo en su clase.
export function Clasificacion({
  insumos,
  fiscalInsumos,
  servicios,
  fiscalServicios,
  editable,
}: {
  insumos: { id: string; nombre: string }[];
  fiscalInsumos: FiscalInsumo[];
  servicios: { id: string; nombre: string; categoria: string }[];
  fiscalServicios: { servicio_id: string; clase: string }[];
  editable: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-n-900">Productos que se venden en mostrador</h3>
        {insumos.length === 0 ? (
          <p className="text-sm text-n-600">No hay productos a la venta todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {insumos.map((i) => (
              <FilaInsumo key={i.id} insumo={i} inicial={fiscalInsumos.find((f) => f.insumo_id === i.id) ?? null} editable={editable} />
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-n-900">Servicios</h3>
        <ul className="flex flex-col gap-2">
          {servicios.map((s) => (
            <FilaServicio key={s.id} servicio={s} inicial={fiscalServicios.find((f) => f.servicio_id === s.id)?.clase ?? ""} editable={editable} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function FilaInsumo({ insumo, inicial, editable }: { insumo: { id: string; nombre: string }; inicial: FiscalInsumo | null; editable: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [patente, setPatente] = useState(inicial?.de_patente ?? false);
  const [clase, setClase] = useState<FiscalInsumo["clase"]>(inicial?.clase ?? "otro_producto");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  async function guardar() {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => guardarInsumoFiscal(insumo.id, patente, clase));
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Guardado");
    router.refresh();
  }
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-3">
      <p className="font-medium text-n-900">{insumo.nombre}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Tipo de producto" value={clase} onChange={(e) => setClase(e.target.value as FiscalInsumo["clase"])} disabled={!editable || patente}>
          <option value="alimento_mascotas">Alimento procesado para mascotas</option>
          <option value="otro_producto">Otro producto</option>
        </Select>
        <label className="flex items-center gap-2 pt-6 text-sm text-n-800">
          <input type="checkbox" checked={patente} onChange={(e) => setPatente(e.target.checked)} disabled={!editable} />
          Medicina veterinaria «de patente» (IVA 0 %)
        </label>
      </div>
      {editable && (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="button" variante="secundario" cargando={envio.cargando} onClick={guardar}>
            Guardar
          </Button>
        </AccionesFormulario>
      )}
    </li>
  );
}

function FilaServicio({ servicio, inicial, editable }: { servicio: { id: string; nombre: string; categoria: string }; inicial: string; editable: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [clase, setClase] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  async function guardar() {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => guardarServicioFiscal(servicio.id, clase || null));
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Guardado");
    router.refresh();
  }
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-3">
      <p className="font-medium text-n-900">
        {servicio.nombre} <span className="text-xs font-normal text-n-500">({servicio.categoria})</span>
      </p>
      <Select label="Se factura como" value={clase} onChange={(e) => setClase(e.target.value)} disabled={!editable}>
        <option value="">Según su categoría (lo normal)</option>
        {CLASES_DE_SERVICIO.map((c) => (
          <option key={c} value={c}>
            {ETIQUETA_CLASE[c]}
          </option>
        ))}
      </Select>
      {editable && (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="button" variante="secundario" cargando={envio.cargando} onClick={guardar}>
            Guardar
          </Button>
        </AccionesFormulario>
      )}
    </li>
  );
}
