import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ContratoEstadoBanner,
  resumenVacio,
  type ContratoResumen,
} from "@/app/(staff)/perros/contrato-estado-banner";
import type { ModuloEstancia } from "@/lib/modulos";

export async function ListaCheckin({ modulo }: { modulo: ModuloEstancia }) {
  const supabase = await createSupabaseServerClient();
  const { data: llegadas, error } = await supabase
    .from("llegadas_hoy")
    .select("estancia_id, perro_id, perro_nombre, categoria, servicio_nombre")
    .eq("categoria", modulo.categoria)
    .order("perro_nombre");

  const perroIds = [...new Set((llegadas ?? []).map((l) => l.perro_id))];
  const { data: contratoEstados } = perroIds.length
    ? await supabase
        .from("perros_contrato_resumen")
        .select("perro_id, estado, faltantes, desactualizados")
        .in("perro_id", perroIds)
    : { data: [] as { perro_id: string; estado: string; faltantes: string[]; desactualizados: string[] }[] };
  const contratoPorPerro = new Map<string, ContratoResumen>(
    (contratoEstados ?? []).map((c) => [
      c.perro_id,
      {
        estado: c.estado as ContratoResumen["estado"],
        faltantes: c.faltantes ?? [],
        desactualizados: c.desactualizados ?? [],
      },
    ])
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={modulo.base} className="text-sm font-semibold text-azul hover:underline">
            ← {modulo.etiqueta}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Check-in — {modulo.etiqueta}</h1>
          <p className="mt-1 text-n-600">
            Perros de {modulo.etiqueta.toLowerCase()} que llegan hoy y todavía no hacen check-in.
          </p>
        </div>
        <Link href={`${modulo.base}/walkin`}>
          <Button type="button" variante="secundario">
            Walk-in (sin reserva)
          </Button>
        </Link>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la información">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !llegadas || llegadas.length === 0 ? (
        <p className="text-n-600">Nadie más por llegar hoy a {modulo.etiqueta.toLowerCase()}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {llegadas.map((l) => (
            <li key={l.estancia_id}>
              <Link
                href={`/reservas/estancias/${l.estancia_id}/checkin`}
                className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-4 py-3 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-n-900">{l.perro_nombre}</span>
                  <ContratoEstadoBanner
                    resumen={contratoPorPerro.get(l.perro_id) ?? resumenVacio()}
                    tamano="compacto"
                    mostrarVigente={false}
                  />
                </span>
                <span className="text-xs text-n-500">{l.servicio_nombre}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
