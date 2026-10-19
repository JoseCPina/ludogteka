"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { AvisoVersion, useControlVersion } from "@/components/concurrencia/use-control-version";
import { Alert } from "@/components/ui/alert";
import { CATALOGO_POLITICAS, LARGO_MAXIMO_POLITICA, politicaAplica, textoPolitica, type TextosPoliticas } from "@/lib/politicas/catalogo";
import { guardarPoliticas } from "./actions";

/**
 * Un cuadro por regla. Lo que el negocio deja vacío no se menciona; una
 * regla que no aplica con sus módulos se muestra apagada (se guarda igual,
 * por si prende el módulo después).
 */
export function PoliticasForm({
  textos,
  modulos,
  negocioId = null,
  version = null,
}: {
  textos: TextosPoliticas;
  modulos: string[];
  /** El negocio y la última vez que se guardaron sus políticas (QA N43). */
  negocioId?: string | null;
  version?: string | null;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CATALOGO_POLITICAS.map((p) => [p.clave, textoPolitica(textos, p.clave)]))
  );
  const guardando = useEspera();
  const ctl = useControlVersion("negocio_politicas", negocioId, version);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function guardar(forzar = false) {
    setError(null);
    setExito(null);
    const res = await guardando.ejecutar(() => guardarPoliticas(valores as TextosPoliticas, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => guardar(true))) return;
    if (res.error) return setError(res.error);
    setExito(res.exito ?? "Guardado");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}
      {CATALOGO_POLITICAS.map((p) => {
        const aplica = politicaAplica(p, modulos);
        return (
          <div key={p.clave} className={`flex flex-col gap-1 ${aplica ? "" : "opacity-60"}`} data-politica={p.clave} data-aplica={aplica ? "si" : "no"}>
            <Textarea
              label={p.etiqueta}
              rows={2}
              maxLength={LARGO_MAXIMO_POLITICA}
              value={valores[p.clave] ?? ""}
              onChange={(e) => setValores((prev) => ({ ...prev, [p.clave]: e.target.value }))}
              ayuda={aplica ? p.ayuda : `${p.ayuda} Hoy no se muestra: falta prender el módulo que la usa.`}
            />
          </div>
        );
      })}
      <AvisoVersion ctl={ctl} registro="las políticas del negocio" cargando={guardando.cargando} onRecargar={() => window.location.reload()} />
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={guardando.cargando} onClick={() => guardar(false)}>
          {guardando.cargando ? "Guardando…" : "Guardar políticas"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
