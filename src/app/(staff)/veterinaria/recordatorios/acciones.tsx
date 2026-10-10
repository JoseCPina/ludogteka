"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useRouter } from "next/navigation";
import { marcarRecordatorio } from "../carnet/actions";

/** Mandarlo a mano (wa.me) y anotarlo, u omitirlo. */
export function AccionesRecordatorio({ id, enlace }: { id: string; enlace: string | null }) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  async function marcar(estado: "manual" | "omitido") {
    setError(null);
    const r = await envio.ejecutar(() => marcarRecordatorio(id, estado));
    if (r.error) return setError(r.error);
    setExito(r.exito ?? "Listo");
    router.refresh();
  }
  return (
    <AccionesFormulario error={error} exito={exito}>
      {enlace && (
        <a
          href={enlace}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center rounded-md bg-menta px-4 text-sm font-semibold text-morado hover:bg-menta-hover"
          onClick={() => setExito("Se abrió WhatsApp. Cuando lo mandes, toca «Ya lo mandé».")}
        >
          Abrir en WhatsApp
        </a>
      )}
      <Button type="button" variante="secundario" className="min-h-10 px-3 text-sm" cargando={envio.cargando} onClick={() => marcar("manual")}>
        Ya lo mandé
      </Button>
      <Button type="button" variante="secundario" className="min-h-10 px-3 text-sm" cargando={envio.cargando} onClick={() => marcar("omitido")}>
        Omitir
      </Button>
    </AccionesFormulario>
  );
}
