import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ creado?: string }>;
}) {
  const { creado } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";

  const { data: proveedores, error } = await supabase
    .from("proveedores")
    .select("id, nombre, contacto_nombre, telefono, deleted_at")
    .order("nombre");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/inventario" className="text-sm font-semibold text-azul hover:underline">
            ← Inventario
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Proveedores</h1>
        </div>
        {esAdmin && (
          <Link href="/inventario/proveedores/nuevo">
            <Button type="button">Nuevo proveedor</Button>
          </Link>
        )}
      </div>

      {creado === "1" && <Alert variante="exito" titulo="Proveedor creado correctamente" />}

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los proveedores">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !proveedores || proveedores.length === 0 ? (
        <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-10 text-center">
          <h3 className="text-lg font-bold text-n-900">Todavía no hay proveedores</h3>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {proveedores.map((p) => (
            <li key={p.id}>
              <Link
                href={`/inventario/proveedores/${p.id}`}
                className={`flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-4 py-3 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave ${
                  p.deleted_at ? "opacity-60" : ""
                }`}
              >
                <div>
                  <span className="font-semibold text-n-900">{p.nombre}</span>
                  {p.contacto_nombre && <span className="ml-2 text-sm text-n-600">{p.contacto_nombre}</span>}
                </div>
                <span className="text-sm text-n-600">{p.telefono ?? "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
