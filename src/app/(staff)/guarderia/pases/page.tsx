import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { BonosCliente, type BonoCatalogo, type BonoFila } from "@/app/(staff)/clientes/bonos-cliente";
import { BuscadorCliente } from "./buscador-cliente";
import { cargarClientesBuscables } from "@/lib/clientes/buscables";

// Vender y consultar day pass desde Guardería, sin salirse a Clientes ni a
// Caja. El paquete es de UN perro (bonos_clientes.perro_id): se busca al
// dueño y se escoge para cuál de sus perros es. Solo se ofrecen los
// paquetes que dan acceso a un servicio de guardería.
export default async function PasesGuarderiaPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; perro?: string }>;
}) {
  const { cliente: clienteId, perro: perroInicial } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ clientes }, { data: bonosCatalogo }, { data: serviciosGuarderia }, { data: turno }] =
    await Promise.all([
      cargarClientesBuscables(supabase),
      supabase
        .from("servicios_cotizables")
        .select("id, nombre, orden")
        .eq("categoria", "bono")
        .order("orden"),
      supabase.from("servicios").select("id").eq("categoria", "guarderia").is("deleted_at", null),
      supabase.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).limit(1),
    ]);

  // Los datos del paquete (pases, vigencia, ilimitado) viven en servicios;
  // la vista de cotizables solo dice cuál se puede vender hoy.
  const idsCotizables = new Set((bonosCatalogo ?? []).map((b) => b.id as string));
  const { data: paquetes } = idsCotizables.size
    ? await supabase
        .from("servicios")
        .select("id, nombre, cantidad_incluida, vigencia_dias, ilimitado, servicio_incluido_id")
        .in("id", Array.from(idsCotizables))
        .order("orden")
    : { data: [] as never[] };
  const idsGuarderia = new Set((serviciosGuarderia ?? []).map((s) => s.id as string));
  const catalogo: BonoCatalogo[] = (paquetes ?? [])
    .filter((p) => idsGuarderia.has(p.servicio_incluido_id as string))
    .map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      cantidad_incluida: p.cantidad_incluida as number | null,
      vigencia_dias: p.vigencia_dias as number | null,
      ilimitado: Boolean(p.ilimitado),
    }));

  const clienteElegido = clienteId ? (clientes ?? []).find((c) => c.id === clienteId) : null;
  const { data: bonos } = clienteElegido
    ? await supabase
        .from("bonos_clientes_estado")
        .select(
          "id, servicio_nombre, servicio_incluido_nombre, cantidad_total, cantidad_disponible, precio_pagado, fecha_compra, fecha_vencimiento, estado, ilimitado, perro_id, perro_nombre"
        )
        .eq("cliente_id", clienteElegido.id)
        .order("fecha_compra", { ascending: false })
    : { data: [] as never[] };

  const { data: perrosCliente } = clienteElegido
    ? await supabase
        .from("perros")
        .select("id, nombre")
        .eq("cliente_id", clienteElegido.id)
        .is("deleted_at", null)
        .eq("fallecido", false)
        .order("nombre")
    : { data: [] as { id: string; nombre: string }[] };

  const hayTurno = (turno ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/guarderia" className="text-sm font-semibold text-morado hover:underline">
          ← Guardería
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Day pass y mensualidad</h1>
        <p className="mt-1 text-n-600">
          Vende un paquete y consulta el saldo. Cada paquete es de un perro: solo ese perro lo usa (un
          dueño con dos perros compra dos), y la reserva de guardería lo toma sola.
        </p>
      </div>

      {!hayTurno && (
        <Alert variante="advertencia" titulo="No hay turno de caja abierto">
          Puedes consultar saldos, pero para vender un paquete primero{" "}
          <Link href="/caja" className="font-semibold underline">
            abre el turno
          </Link>
          .
        </Alert>
      )}

      {!clienteElegido ? (
        <BuscadorCliente clientes={clientes} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
            <div>
              <p className="text-sm text-n-600">Cliente</p>
              <p className="font-bold text-n-900">{clienteElegido.nombre}</p>
            </div>
            <div className="flex gap-3 text-sm font-semibold">
              <Link href={`/clientes/${clienteElegido.id}`} className="text-morado hover:underline">
                Ver ficha
              </Link>
              <Link href="/guarderia/pases" className="text-morado hover:underline">
                Cambiar cliente
              </Link>
            </div>
          </div>
          <BonosCliente
            catalogo={catalogo}
            bonos={(bonos as BonoFila[]) ?? []}
            perros={(perrosCliente ?? []) as { id: string; nombre: string }[]}
            perroInicial={perroInicial ?? null}
          />
        </div>
      )}
    </div>
  );
}
