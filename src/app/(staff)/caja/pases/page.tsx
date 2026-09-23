import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { BonosCliente, type BonoCatalogo, type BonoFila } from "@/app/(staff)/clientes/bonos-cliente";
import { BuscadorClientes } from "@/components/buscador-clientes";
import { cargarClientesBuscables } from "@/lib/clientes/buscables";
import { formatearTelefono } from "@/lib/telefono";

// Vender day pass o mensualidad desde Caja, no solo desde Guardería.
// Aquí se ofrecen TODOS los paquetes cotizables (no solo los que dan
// guardería): el mostrador vende lo que haya.
export default async function PasesCajaPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente: clienteId } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ clientes }, { data: bonosCatalogo }, { data: turno }] = await Promise.all([
    cargarClientesBuscables(supabase),
    supabase.from("servicios_cotizables").select("id").eq("categoria", "bono"),
    supabase.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).limit(1),
  ]);

  const idsCotizables = (bonosCatalogo ?? []).map((b) => b.id as string);
  const { data: paquetes } = idsCotizables.length
    ? await supabase
        .from("servicios")
        .select("id, nombre, cantidad_incluida, vigencia_dias, ilimitado")
        .in("id", idsCotizables)
        .order("orden")
    : { data: [] as never[] };
  const catalogo: BonoCatalogo[] = (paquetes ?? []).map((p) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    cantidad_incluida: p.cantidad_incluida as number | null,
    vigencia_dias: p.vigencia_dias as number | null,
    ilimitado: Boolean(p.ilimitado),
  }));

  const clienteElegido = clienteId ? clientes.find((c) => c.id === clienteId) ?? null : null;
  const { data: bonos } = clienteElegido
    ? await supabase
        .from("bonos_clientes_estado")
        .select(
          "id, servicio_nombre, servicio_incluido_nombre, cantidad_total, cantidad_disponible, precio_pagado, fecha_compra, fecha_vencimiento, estado, ilimitado"
        )
        .eq("cliente_id", clienteElegido.id)
        .order("fecha_compra", { ascending: false })
    : { data: [] as never[] };

  const hayTurno = (turno ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/caja" className="text-sm font-semibold text-azul hover:underline">
          ← Caja
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Vender pase o mensualidad</h1>
        <p className="mt-1 text-n-600">Los pases son del dueño: cualquiera de sus perros los usa, y la reserva los toma sola.</p>
      </div>

      {!hayTurno && (
        <Alert variante="advertencia" titulo="No hay turno de caja abierto">
          Puedes consultar saldos, pero para vender primero{" "}
          <Link href="/caja/turno" className="font-semibold underline">
            abre el turno
          </Link>
          .
        </Alert>
      )}

      {!clienteElegido ? (
        <BuscadorClientes clientes={clientes} hrefDe={(c) => `/caja/pases?cliente=${c.id}`} autoFocus />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
            <div>
              <p className="text-sm text-n-600">Cliente</p>
              <p className="font-bold text-n-900">
                {clienteElegido.nombre}
                {clienteElegido.perros.length > 0 && (
                  <span className="font-normal text-n-600"> · {clienteElegido.perros.map((p) => p.nombre).join(", ")}</span>
                )}
              </p>
              <p className="text-sm text-n-600">{formatearTelefono(clienteElegido.telefono)}</p>
            </div>
            <Link href="/caja/pases" className="text-sm font-semibold text-azul hover:underline">
              Cambiar cliente
            </Link>
          </div>
          <BonosCliente clienteId={clienteElegido.id} catalogo={catalogo} bonos={(bonos ?? []) as BonoFila[]} />
        </div>
      )}
    </div>
  );
}
