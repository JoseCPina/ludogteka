"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useRouter } from "next/navigation";
import { marcarRecordatorio, reintentarRecordatorio } from "../carnet/actions";
import { Enlace } from "@/components/ui/enlace";

/** Mandarlo a mano (wa.me) y anotarlo, u omitirlo. */
export function AccionesRecordatorio({ id, enlace, fallido = false }: { id: string; enlace: string | null; fallido?: boolean }) {
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
  async function reintentar() {
    setError(null);
    const r = await envio.ejecutar(() => reintentarRecordatorio(id));
    if (r.error) return setError(r.error);
    setExito(r.exito ?? "Listo");
    router.refresh();
  }
  return (
    <AccionesFormulario error={error} exito={exito}>
      {enlace && (
        <Enlace href={enlace} target="_blank" rel="noreferrer" onClick={() => setExito("Se abrió WhatsApp. Cuando lo mandes, toca «Ya lo mandé».")}>
          Abrir en WhatsApp
        </Enlace>
      )}
      {fallido && (
        <Button type="button" variante="secundario" className="px-3 text-sm" tamano="compacto" cargando={envio.cargando} onClick={reintentar}>
          Reintentar envío
        </Button>
      )}
      <Button type="button" variante="secundario" className="px-3 text-sm" tamano="compacto" cargando={envio.cargando} onClick={() => marcar("manual")}>
        Ya lo mandé
      </Button>
      <Button type="button" variante="secundario" className="px-3 text-sm" tamano="compacto" cargando={envio.cargando} onClick={() => marcar("omitido")}>
        Omitir
      </Button>
    </AccionesFormulario>
  );
}
