import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";

export async function ListaCheckout({ modulo }: { modulo: ModuloEstancia }) {
  const supabase = await createSupabaseServerClient();
  const { data: adentro, error } = await supabase
    .from("quienes_estan_adentro")
    .select("estancia_id, perro_nombre, categoria, servicio_nombre, fecha_salida")
    .eq("categoria", modulo.categoria)
    .order("perro_nombre");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={modulo.base} className="text-sm font-semibold text-azul hover:underline">
          ← {modulo.etiqueta}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Check-out — {modulo.etiqueta}</h1>
        <p className="mt-1 text-n-600">
          Perros de {modulo.etiqueta.toLowerCase()} que siguen aquí ahora mismo.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !adentro || adentro.length === 0 ? (
        <p className="text-n-600">No hay nadie de {modulo.etiqueta.toLowerCase()} adentro.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {adentro.map((a) => (
            <li key={a.estancia_id}>
              <Link
                href={`/reservas/estancias/${a.estancia_id}/checkout`}
                className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-4 py-3 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
              >
                <span className="font-semibold text-n-900">{a.perro_nombre}</span>
                <span className="flex items-center gap-3 text-xs text-n-500">
                  {a.servicio_nombre}
                  {modulo.categoria === "hotel" && a.fecha_salida && (
                    <span className="text-n-600">
                      Sale {formatearFechaCalendario(a.fecha_salida as string)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
