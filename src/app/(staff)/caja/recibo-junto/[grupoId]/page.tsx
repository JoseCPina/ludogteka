import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ETIQUETA_TARJETA_MANUAL } from "@/lib/cobro/tarjeta-manual";
import { BotonImprimir } from "./boton-imprimir";

export type DetalleGrupo = {
  grupo_id: string;
  recibo: string;
  fecha: string;
  cliente_id: string;
  cliente_nombre: string;
  origen: string;
  total: number;
  propina: number;
  notas: string | null;
  tarjeta: { id: string; folio: string; estado: string; monto: number } | null;
  metodos: { metodo: string; monto: number; propina: number }[];
  cuentas: { reserva_id: string; cobro_id: string; monto: number; propina: number; devuelto: number; descripcion: string; perros: string }[];
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  terminal: "Terminal",
  transferencia: "Transferencia",
  tarjeta_manual: ETIQUETA_TARJETA_MANUAL,
};
const ETIQUETA_ORIGEN: Record<string, string> = {
  manual: "Cobro en mostrador",
  mercadopago_point: "Terminal Mercado Pago",
  mercadopago_link: "Link de pago Mercado Pago",
  clip_terminal: "Terminal Clip",
};
const dinero = (v: number) => `$${Number(v).toFixed(2)}`;

// El recibo único de un cobro junto: el total, el desglose por cuenta y los
// métodos, con un solo folio. Se imprime o se guarda como PDF desde el navegador.
export default async function ReciboJuntoPage({ params }: { params: Promise<{ grupoId: string }> }) {
  const { grupoId } = await params;
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("cobro_grupo_detalle", { p_grupo_id: grupoId });
  const d = (Array.isArray(data) ? data[0] : data) as DetalleGrupo | null;

  if (!d) {
    return (
      <Alert variante="error" titulo="No encontramos este cobro">
        Puede que sea de otro negocio o que no tengas permiso para verlo.{" "}
        <Link href="/caja" className="font-semibold underline">
          Volver a Caja
        </Link>
      </Alert>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4" data-recibo-junto>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/caja" className="text-sm font-semibold text-morado hover:underline">
          ← Caja
        </Link>
        <BotonImprimir />
      </div>

      <Alert variante="exito" titulo="Cobro registrado">
        Las {d.cuentas.length} cuentas quedaron cobradas con un solo pago.
      </Alert>

      <article className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-n-500">Recibo</p>
            <p className="text-lg font-bold text-n-900">{d.recibo}</p>
          </div>
          <p className="text-sm text-n-600">{formatearFecha(d.fecha, zona)}</p>
        </header>
        <div>
          <p className="text-xs uppercase tracking-wide text-n-500">Cliente</p>
          <p className="font-semibold text-n-900">{d.cliente_nombre}</p>
          <p className="text-sm text-n-600">{ETIQUETA_ORIGEN[d.origen] ?? d.origen}</p>
        </div>

        <ul className="flex flex-col divide-y divide-n-200 border-y border-n-200">
          {d.cuentas.map((c) => (
            <li key={c.cobro_id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium text-n-900">{c.descripcion}</p>
                {c.perros && <p className="text-xs text-n-500">{c.perros}</p>}
              </div>
              <p className="font-semibold tabular-nums text-n-900">{dinero(c.monto)}</p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 text-sm">
          <p className="flex justify-between">
            <span className="text-n-600">Total de las cuentas</span>
            <span className="font-semibold tabular-nums">{dinero(d.total)}</span>
          </p>
          {d.propina > 0 && (
            <p className="flex justify-between">
              <span className="text-n-600">Propina</span>
              <span className="font-semibold tabular-nums">{dinero(d.propina)}</span>
            </p>
          )}
          <p className="flex justify-between border-t border-n-200 pt-1 text-base">
            <span className="font-bold text-n-900">Pagado</span>
            <span className="font-bold tabular-nums text-n-900">{dinero(d.total + d.propina)}</span>
          </p>
        </div>

        <div className="text-sm text-n-700">
          <p className="text-xs uppercase tracking-wide text-n-500">Cómo se pagó</p>
          <ul>
            {d.metodos.map((m) => (
              <li key={m.metodo}>
                {ETIQUETA_METODO[m.metodo] ?? m.metodo}: {dinero(m.monto)}
                {m.propina > 0 ? ` (+${dinero(m.propina)} de propina)` : ""}
              </li>
            ))}
          </ul>
          {d.tarjeta && (
            <p className="mt-1 text-n-600">
              Voucher de tarjeta · folio <span className="font-semibold">{d.tarjeta.folio}</span> ({d.tarjeta.estado === "por_revisar" ? "sin verificar" : d.tarjeta.estado === "revisada" ? "revisada" : "no recibida"})
            </p>
          )}
          {d.notas && <p className="mt-1 text-n-600">{d.notas}</p>}
        </div>
      </article>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href="/caja">
          <Button type="button">Volver a Caja</Button>
        </Link>
        <Link href={`/clientes/${d.cliente_id}`}>
          <Button type="button" variante="secundario">Ver expediente</Button>
        </Link>
      </div>
    </div>
  );
}
