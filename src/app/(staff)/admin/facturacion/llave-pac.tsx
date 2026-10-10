"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha } from "@/lib/formato";
import { borrarLlavePac, guardarLlavePac } from "./actions";

// La llave del PAC (Facturapi) se guarda en la bóveda y nadie puede volver a
// leerla desde la app: solo se sabe si hay una y de qué modo es.
export function LlavePac({
  hay,
  modo,
  origen,
  guardadaAt,
}: {
  hay: boolean;
  modo: "pruebas" | "produccion" | null;
  origen: "negocio" | "entorno" | null;
  guardadaAt: string | null;
}) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const guardando = useEspera({ tope: 40_000 });
  const quitando = useEspera();
  const [llave, setLlave] = useState("");
  const [modoNuevo, setModoNuevo] = useState<"pruebas" | "produccion">("pruebas");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    const r = await guardando.ejecutar(() => guardarLlavePac(llave, modoNuevo));
    if (r.error) return setError(r.error);
    setLlave("");
    setExito(r.aviso ?? "Guardada");
    router.refresh();
  }
  async function quitar() {
    setError(null);
    setExito(null);
    const r = await quitando.ejecutar(() => borrarLlavePac());
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Quitada");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
      {hay ? (
        <Alert variante="exito" titulo={`Hay una llave ${modo === "produccion" ? "de producción" : "de pruebas"}`}>
          {origen === "entorno"
            ? "Se está usando la llave de pruebas del entorno de desarrollo; guarda la del negocio para que sea suya."
            : `Guardada${guardadaAt ? ` el ${formatearFecha(guardadaAt, zona)}` : ""}. Nadie puede volver a leerla desde la app.`}
        </Alert>
      ) : (
        <Alert variante="advertencia" titulo="Todavía no hay llave">
          Sin llave no se puede timbrar. La obtienes en tu cuenta de Facturapi (en pruebas empieza con sk_test).
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Para" value={modoNuevo} onChange={(e) => setModoNuevo(e.target.value as "pruebas" | "produccion")}>
          <option value="pruebas">Pruebas (sk_test…)</option>
          <option value="produccion">Producción (sk_live…)</option>
        </Select>
        <Field label={hay ? "Llave nueva (reemplaza la que hay)" : "Llave"} type="password" value={llave} onChange={(e) => setLlave(e.target.value)} autoComplete="off" />
      </div>
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={guardando.cargando} disabled={!llave.trim()} onClick={guardar}>
          {guardando.cargando ? "Probando y guardando…" : "Guardar llave"}
        </Button>
        {hay && origen === "negocio" && (
          <Button type="button" variante="peligro" cargando={quitando.cargando} onClick={quitar}>
            Quitar llave
          </Button>
        )}
      </AccionesFormulario>
    </div>
  );
}
