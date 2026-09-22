import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { describirBono, diasParaVencer } from "@/lib/bonos/descripcion";

type Fila = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  servicio_nombre: string;
  cantidad_total: number;
  cantidad_disponible: number;
  fecha_vencimiento: string | null;
  fecha_compra: string;
  estado: string;
  ilimitado: boolean;
};

const DIAS_AVISO = 7;
const DIAS_HISTORIAL = 30;

// Los pases que necesitan una llamada, en el tablero de guardería: los que
// vencen esta semana con saldo (para avisarle al dueño que los use), los
// que ya se acabaron (para ofrecerle otro paquete) y los que vencieron
// con pases sin usar (para que se vea que se perdieron, y cuántos).
function Lista({ titulo, items, vacio }: { titulo: string; items: Fila[]; vacio: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-n-500">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-n-500">{vacio}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((f) => (
            <li key={f.id}>
              <Link
                href={`/guarderia/pases?cliente=${f.cliente_id}`}
                className="flex flex-col rounded-md border border-n-200 bg-white px-3 py-2 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
              >
                <span className="font-semibold text-n-900">
                  {f.cliente_nombre} · {f.servicio_nombre}
                </span>
                <span className="text-xs text-n-600">{describirBono(f)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function PasesTablero({ hoy }: { hoy: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("bonos_clientes_estado")
    .select(
      "id, cliente_id, cliente_nombre, servicio_nombre, cantidad_total, cantidad_disponible, fecha_vencimiento, fecha_compra, estado, ilimitado"
    )
    .in("estado", ["activo", "agotado", "vencido"])
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  const filas = ((data as Fila[] | null) ?? []).filter((f) => {
    const dias = diasParaVencer(f.fecha_vencimiento, hoy);
    if (f.estado === "activo") return dias !== null && dias <= DIAS_AVISO;
    if (f.estado === "vencido") return f.cantidad_disponible > 0 && dias !== null && dias >= -DIAS_HISTORIAL;
    // agotado: los de los últimos 30 días de compra
    return diasParaVencer(f.fecha_compra, hoy)! >= -DIAS_HISTORIAL;
  });

  const porVencer = filas.filter((f) => f.estado === "activo");
  const agotados = filas.filter((f) => f.estado === "agotado");
  const perdidos = filas.filter((f) => f.estado === "vencido");

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-n-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Day pass y mensualidad</h2>
        <Link href="/guarderia/pases">
          <Button type="button" variante="secundario">
            Vender o consultar pases
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Lista
          titulo={`Vencen en ${DIAS_AVISO} días`}
          items={porVencer}
          vacio="Ninguno por vencer esta semana."
        />
        <Lista titulo="Se les acabaron" items={agotados} vacio="Nadie sin pases recientemente." />
        <Lista titulo="Vencieron con pases sin usar" items={perdidos} vacio="Ninguno perdido este mes." />
      </div>
    </section>
  );
}
