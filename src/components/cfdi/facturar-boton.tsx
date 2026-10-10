"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { facturarCobros, facturarGrupo, type ReceptorManual } from "@/app/(staff)/caja/facturacion-actions";
import { ReceptorForm } from "./receptor-form";
import type { ItemCatalogo } from "./textos";

// «Facturar»: arma y timbra la factura de uno o varios cobros. Si el cliente
// tiene sus datos fiscales se timbra con ellos; si no (o es «Público en
// general») se capturan aquí, al momento.
export function FacturarBoton({
  cobroIds,
  grupoId,
  necesitaReceptor,
  catalogos,
  etiqueta = "Facturar",
  yaFacturado,
}: {
  cobroIds: string[];
  grupoId?: string;
  necesitaReceptor: boolean;
  catalogos: ItemCatalogo[];
  etiqueta?: string;
  yaFacturado?: { facturaId: string; etiqueta: string } | null;
}) {
  const router = useRouter();
  // Timbrar habla con el PAC: más margen que el tope de siempre.
  const envio = useEspera({ tope: 70_000 });
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  if (yaFacturado) {
    return (
      <span className="text-sm text-n-700">
        Ya está en la {yaFacturado.etiqueta} ·{" "}
        <Link href="/caja/facturas" className="font-semibold text-morado hover:underline">
          Ver facturas
        </Link>
      </span>
    );
  }

  async function correr(receptor?: ReceptorManual) {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => (grupoId ? facturarGrupo(grupoId, receptor ?? null) : facturarCobros(cobroIds, receptor ?? null)));
    if (res.error) {
      setError(res.error);
      return;
    }
    setExito(res.aviso ?? "Factura timbrada.");
    setAbierto(false);
    router.refresh();
  }

  if (exito) {
    return (
      <AccionesFormulario exito={exito}>
        <Link href="/caja/facturas" className="text-sm font-semibold text-morado hover:underline">
          Ver facturas
        </Link>
      </AccionesFormulario>
    );
  }

  if (abierto && necesitaReceptor) {
    return <ReceptorForm catalogos={catalogos} cargando={envio.cargando} error={error} textoBoton="Facturar" onEnviar={(r) => void correr(r)} onCancelar={() => setAbierto(false)} />;
  }

  return (
    <AccionesFormulario error={error}>
      <Button type="button" variante="secundario" cargando={envio.cargando} onClick={() => (necesitaReceptor ? setAbierto(true) : void correr())}>
        {envio.cargando ? "Timbrando…" : etiqueta}
      </Button>
    </AccionesFormulario>
  );
}
