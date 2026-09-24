import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { CostoReferencia } from "../costo-referencia";

// Los consumibles que se dieron de alta sin costo (recepción no ve ni
// captura costos), para que admin —o quien tenga el permiso de costos— no
// se olvide de completarlos.
export default async function SinCostoPage() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "inventario_costos")) redirect("/inventario");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("insumos_sin_costo");
  const filas = (data ?? []) as { id: string; nombre: string; area_nombre: string; unidad_compra: string }[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inventario" className="text-sm font-semibold text-azul hover:underline">
          ← Inventario
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Consumibles sin costo</h1>
        <p className="mt-1 max-w-2xl text-n-600">
          No tienen costo de referencia ni compras. Ponles un costo de referencia por unidad de compra; cuando registres
          una compra, el costo sale de las compras.
        </p>
      </div>
      {filas.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center text-n-600">
          Todos los consumibles tienen costo.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filas.map((f) => (
            <li key={f.id} className="rounded-lg border border-n-200 bg-white p-4">
              <p className="font-semibold text-n-900">
                <Link href={`/inventario/${f.id}`} className="hover:underline">
                  {f.nombre}
                </Link>{" "}
                <span className="text-sm font-normal text-n-500">· {f.area_nombre}</span>
              </p>
              <div className="mt-2">
                <CostoReferencia insumoId={f.id} costoActual={null} unidadCompra={f.unidad_compra} tieneCompras={false} compacto />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
