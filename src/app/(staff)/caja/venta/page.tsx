import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarClientesBuscables } from "@/lib/clientes/buscables";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { VentaRapida, type ProductoVenta } from "./venta-rapida";

// Venta rápida: cobrar algo sin reserva, sin perro y sin servicio. Un
// concepto libre con su monto, o un producto del inventario marcado «Se
// vende en mostrador». Se arma la cuenta y se cobra en la pantalla de
// cobro de siempre (efectivo, terminal o link; propina; descuento con tope).
export default async function VentaRapidaPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const conInventario = Boolean(sesion?.modulos.includes("inventario"));
  const [{ clientes }, { data: productosCrudo }, { data: existencias }, { data: turno }] = await Promise.all([
    cargarClientesBuscables(supabase),
    conInventario
      ? supabase
          .from("insumos")
          .select("id, nombre, precio_venta, unidad_compra:unidades_medida!unidad_compra_id(etiqueta, equivalencia_en_base)")
          .eq("se_vende", true)
          .is("deleted_at", null)
          .order("nombre")
      : Promise.resolve({ data: [] as never[] }),
    conInventario ? supabase.from("insumos_existencia_actual").select("insumo_id, existencia_actual") : Promise.resolve({ data: [] as never[] }),
    supabase.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle(),
  ]);
  const existenciaPor = new Map((existencias ?? []).map((e) => [e.insumo_id as string, Number(e.existencia_actual)]));
  const productos: ProductoVenta[] = (productosCrudo ?? []).map((p) => {
    const u = (Array.isArray(p.unidad_compra) ? p.unidad_compra[0] : p.unidad_compra) as { etiqueta: string; equivalencia_en_base: number } | null;
    const eq = Number(u?.equivalencia_en_base ?? 1) || 1;
    return {
      id: p.id as string,
      nombre: p.nombre as string,
      precio: Number(p.precio_venta),
      unidad: (u?.etiqueta ?? "pieza").toLowerCase(),
      disponible: Math.floor(((existenciaPor.get(p.id as string) ?? 0) / eq) * 100) / 100,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">
          ← Caja
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Venta rápida</h1>
        <p className="mt-1 text-n-600">
          Un producto o cualquier otra cosa que se cobre en mostrador, sin reserva ni perro. Se arma la cuenta y pasas a cobrarla como siempre.
        </p>
      </div>
      <VentaRapida
        clientes={clientes}
        productos={productos}
        conInventario={conInventario}
        turnoAbierto={Boolean(turno)}
        clienteInicial={cliente ?? null}
      />
    </div>
  );
}
