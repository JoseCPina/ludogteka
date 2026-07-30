import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { InsumoForm } from "../insumo-form";
import { BajaServicioBoton } from "../../servicios/baja-servicio-boton";
import { MovimientosInsumo, type MovimientoFila } from "../movimientos-insumo";
import { actualizarInsumo, darDeBajaInsumo } from "../actions";

export default async function EditarInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";

  const [{ data: insumo }, { data: categorias }, { data: unidades }, { data: movimientosCrudo }] =
    await Promise.all([
      supabase
        .from("insumos")
        .select(
          "id, nombre, categoria_id, unidad_compra_id, unidad_consumo_id, stock_minimo, existencia_inicial, requiere_caducidad, dias_aviso_caducidad, deleted_at, unidad_compra:unidades_medida!unidad_compra_id(etiqueta), unidad_consumo:unidades_medida!unidad_consumo_id(etiqueta, equivalencia_en_base)"
        )
        .eq("id", id)
        .single(),
      supabase.from("categorias_insumo").select("id, etiqueta").is("deleted_at", null).order("orden"),
      supabase.from("unidades_medida").select("id, etiqueta, magnitud").is("deleted_at", null).order("etiqueta"),
      supabase
        .from("movimientos_inventario")
        .select("id, tipo, cantidad_base, fecha_caducidad, motivo, created_at")
        .eq("insumo_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!insumo) notFound();

  const unidadCompra = insumo.unidad_compra as unknown as { etiqueta: string } | null;
  const unidadConsumo = insumo.unidad_consumo as unknown as { etiqueta: string; equivalencia_en_base: number } | null;
  const equivalencia = unidadConsumo ? Number(unidadConsumo.equivalencia_en_base) : 1;

  let comprasPorMovimiento = new Map<
    string,
    { proveedor_nombre: string; cantidad_compra: number; costo_unitario: number; costo_total: number }
  >();
  let proveedores: { id: string; nombre: string }[] = [];
  if (esAdmin) {
    const [{ data: compras }, { data: proveedoresData }] = await Promise.all([
      supabase
        .from("compras_insumos")
        .select("movimiento_id, cantidad_compra, costo_unitario, costo_total, proveedores(nombre)")
        .in("movimiento_id", (movimientosCrudo ?? []).map((m) => m.id)),
      supabase.from("proveedores").select("id, nombre").is("deleted_at", null).order("nombre"),
    ]);
    proveedores = proveedoresData ?? [];
    comprasPorMovimiento = new Map(
      (compras ?? []).map((c) => {
        const proveedor = c.proveedores as unknown as { nombre: string } | null;
        return [
          c.movimiento_id,
          {
            proveedor_nombre: proveedor?.nombre ?? "—",
            cantidad_compra: Number(c.cantidad_compra),
            costo_unitario: Number(c.costo_unitario),
            costo_total: Number(c.costo_total),
          },
        ];
      })
    );
  }

  const movimientos: MovimientoFila[] = (movimientosCrudo ?? []).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    cantidad_base: Number(m.cantidad_base),
    fecha_caducidad: m.fecha_caducidad,
    motivo: m.motivo,
    created_at: m.created_at,
    compra: comprasPorMovimiento.get(m.id) ?? null,
  }));

  const actualizarConId = actualizarInsumo.bind(null, id);
  const bajaConId = darDeBajaInsumo.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-n-900">{insumo.nombre}</h1>
          {insumo.deleted_at && (
            <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Inactivo</span>
          )}
        </div>
        <p className="mt-1 text-n-600">Editar el insumo.</p>
      </div>

      {insumo.deleted_at && (
        <Alert variante="advertencia" titulo="Este insumo está inactivo">
          No aparece para registrar consumo nuevo. Se puede seguir editando y su historial se conserva.
        </Alert>
      )}

      <InsumoForm
        action={actualizarConId}
        categorias={categorias ?? []}
        unidades={unidades ?? []}
        valoresIniciales={{
          nombre: insumo.nombre,
          categoria_id: insumo.categoria_id,
          unidad_compra_id: insumo.unidad_compra_id,
          unidad_consumo_id: insumo.unidad_consumo_id,
          stock_minimo_consumo: Number(insumo.stock_minimo) / equivalencia,
          existencia_inicial_consumo: Number(insumo.existencia_inicial) / equivalencia,
          requiere_caducidad: insumo.requiere_caducidad,
          dias_aviso_caducidad: insumo.dias_aviso_caducidad,
        }}
        textoBoton="Guardar cambios"
      />

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Movimientos</h2>
        <MovimientosInsumo
          insumoId={id}
          esAdmin={esAdmin}
          unidadCompraEtiqueta={unidadCompra?.etiqueta ?? "—"}
          unidadConsumoEtiqueta={unidadConsumo?.etiqueta ?? "—"}
          equivalenciaConsumo={equivalencia}
          requiereCaducidad={insumo.requiere_caducidad}
          proveedores={proveedores}
          movimientos={movimientos}
        />
      </div>

      {!insumo.deleted_at && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
          <h2 className="text-lg font-bold text-n-900">Dar de baja</h2>
          <p className="text-n-600">
            Un insumo dado de baja deja de aparecer para registrar consumo nuevo; su historial de
            movimientos no se afecta.
          </p>
          <BajaServicioBoton accion={bajaConId} nombre={insumo.nombre} />
        </div>
      )}
    </div>
  );
}
