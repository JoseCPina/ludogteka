import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";

const ETIQUETA_CATEGORIA: Record<string, string> = { guarderia: "Guardería", hotel: "Hotel" };

export default async function CheckoutListaPage() {
  const supabase = await createSupabaseServerClient();
  const { data: adentro, error } = await supabase
    .from("quienes_estan_adentro")
    .select("estancia_id, perro_nombre, categoria, servicio_nombre, fecha_salida")
    .order("perro_nombre");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Check-out</h1>
        <p className="mt-1 text-n-600">Perros que siguen aquí ahora mismo.</p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !adentro || adentro.length === 0 ? (
        <p className="text-n-600">No hay nadie dentro.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {adentro.map((a) => (
            <li key={a.estancia_id}>
              <Link
                href={`/reservas/estancias/${a.estancia_id}/checkout`}
                className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-4 py-3 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
              >
                <span className="font-semibold text-n-900">{a.perro_nombre}</span>
                <span className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">
                  {ETIQUETA_CATEGORIA[a.categoria] ?? a.categoria}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
