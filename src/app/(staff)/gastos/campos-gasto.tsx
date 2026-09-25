import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { METODOS_GASTO } from "@/lib/gastos/textos";
import { CampoComprobante } from "./campo-comprobante";

export type Opcion = { id: string; nombre: string };

// Los campos del pago de un gasto: el mismo bloque para registrar uno
// nuevo y para marcar pagado uno esperado.
export function CamposPago({
  hoy,
  proveedores,
  montoSugerido,
  cubreDesde,
  cubreHasta,
}: {
  hoy: string;
  proveedores: Opcion[];
  montoSugerido?: number | null;
  cubreDesde?: string;
  cubreHasta?: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Monto" name="monto" type="number" step="0.01" min="0" required defaultValue={montoSugerido ?? ""} />
        <Field label="Fecha de pago" name="fecha_pago" type="date" defaultValue={hoy} required />
        <Select label="Cómo se pagó" name="metodo" defaultValue="transferencia" ayuda="Del cajón: se registra solo el retiro en el turno abierto.">
          {Object.entries(METODOS_GASTO)
            .filter(([k]) => k !== "retenido")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          <option value="retenido">{METODOS_GASTO.retenido}</option>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label="Proveedor (opcional)" name="proveedor_id" defaultValue="">
          <option value="">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
        <Field
          label="Cubre desde (mes)"
          name="cubre_desde"
          type="month"
          defaultValue={cubreDesde ?? ""}
          ayuda="Vacío: el mes en que se paga."
        />
        <Field label="Hasta (mes)" name="cubre_hasta" type="month" defaultValue={cubreHasta ?? ""} ayuda="La luz bimestral cubre dos meses; un seguro, doce." />
      </div>
      <CampoComprobante />
      <Textarea label="Notas (opcional)" name="notas" rows={2} />
    </>
  );
}
