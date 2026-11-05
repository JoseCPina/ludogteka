"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFechaCalendario } from "@/lib/formato";
import { contarAlertasHasta, darPorRevisadasAlertasHasta, type ConteoAlertas } from "./alertas-actions";

const ETIQUETAS: { clave: keyof ConteoAlertas; una: string; varias: string }[] = [
  { clave: "tarjetas", una: "tarjeta manual por revisar", varias: "tarjetas manuales por revisar" },
  { clave: "contratos", una: "contrato pendiente de firma", varias: "contratos pendientes de firma" },
  { clave: "llegadas", una: "llegada atrasada", varias: "llegadas atrasadas" },
  { clave: "links", una: "link de pago sin resolver", varias: "links de pago sin resolver" },
  { clave: "conciliacion", una: "diferencia de conciliación", varias: "diferencias de conciliación" },
];

function describir(c: ConteoAlertas): string {
  const partes = ETIQUETAS.filter((e) => c[e.clave] > 0).map((e) => `${c[e.clave]} ${c[e.clave] === 1 ? e.una : e.varias}`);
  return partes.length ? partes.join(", ") : "";
}

/**
 * «Dar por revisadas todas las anteriores a…» del panel de admin: cierra en un paso, con una nota, lo que «Necesita
 * atención» arrastra de antes de una fecha (tarjetas manuales, contratos sin firmar, llegadas atrasadas, links de pago,
 * conciliación). Antes de apretar dice cuántas de cada tipo; después, qué cerró y qué dejó pendiente (dinero y
 * comprobantes se resuelven una por una).
 */
export function RevisarAlertasHasta({ hoy }: { hoy: string }) {
  const router = useRouter();
  const envio = useEspera();
  const contando = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [hasta, setHasta] = useState(hoy);
  const [nota, setNota] = useState("");
  const [conteo, setConteo] = useState<ConteoAlertas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || !hasta) return;
    let vivo = true;
    contando.ejecutar(() => contarAlertasHasta(hasta)).then((r) => {
      if (!vivo) return;
      if (r.error) setError(r.error);
      else setConteo(r.conteo ?? null);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, hasta]);

  const total = conteo ? Object.values(conteo).reduce((s, n) => s + Number(n), 0) : 0;

  if (!abierto) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variante="secundario" onClick={() => setAbierto(true)} data-revisar-alertas>
          Dar por revisadas todas las anteriores a…
        </Button>
        {exito && <p className="text-sm font-semibold text-menta-oscuro" data-revisar-alertas-exito>{exito}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card shadow-tarjeta p-4" data-revisar-alertas-formulario>
      <p className="text-sm text-n-700">
        Se cierran, con tu nota, las alertas <strong>anteriores</strong> a la fecha que escojas: tarjetas manuales por revisar (quedan revisadas),
        contratos pendientes de firma (se cancelan), llegadas atrasadas (quedan como «No llegó»), links de pago sin resolver (se cancelan) y la
        conciliación. Las cuentas con saldo, los saldos a favor y los comprobantes sanitarios no se cierran solos: son dinero o hay que verlos.
      </p>
      <Field label="Anteriores a" type="date" value={hasta} max={hoy} onChange={(e) => { setConteo(null); setHasta(e.target.value); }} />
      <Field label="¿Qué revisaste?" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Arranque limpio de noviembre, revisado con el dueño" />
      <p className="text-sm text-n-700" aria-live="polite" data-revisar-alertas-conteo>
        {!hasta
          ? "Escoge una fecha."
          : contando.cargando || !conteo
            ? "Contando…"
            : total === 0
              ? `No hay alertas anteriores al ${formatearFechaCalendario(hasta)}.`
              : `Anteriores al ${formatearFechaCalendario(hasta)}: ${describir(conteo)}.`}
      </p>
      <AccionesFormulario error={error}>
        <Button
          type="button"
          cargando={envio.cargando}
          disabled={!hasta || total === 0 || nota.trim().length < 5}
          onClick={async () => {
            setError(null);
            const r = await envio.ejecutar(() => darPorRevisadasAlertasHasta(hasta, nota));
            if (r.error) return setError(r.error);
            const pend = r.pendientes ?? { cuentas_con_saldo: 0, comprobantes: 0 };
            const colas: string[] = [];
            if (pend.cuentas_con_saldo > 0) colas.push(`${pend.cuentas_con_saldo} ${pend.cuentas_con_saldo === 1 ? "cuenta con saldo pendiente" : "cuentas con saldo pendiente"} (se cobran o se cancelan una por una)`);
            if (pend.comprobantes > 0) colas.push(`${pend.comprobantes} ${pend.comprobantes === 1 ? "comprobante sanitario por revisar" : "comprobantes sanitarios por revisar"}`);
            setExito(`Listo: ${r.total === 0 ? "no había nada que cerrar" : `se cerraron ${describir(r.cerradas!)}`}.${colas.length ? ` Quedan: ${colas.join("; ")}.` : ""}`);
            setAbierto(false);
            setNota("");
            setConteo(null);
            router.refresh();
          }}
        >
          Dar por revisadas{total > 0 ? ` (${total})` : ""}
        </Button>
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Button>
      </AccionesFormulario>
    </div>
  );
}
