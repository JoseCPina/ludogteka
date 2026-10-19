"use client";

import { startTransition, useRef, useState } from "react";
import type { VersionLeida } from "@/lib/concurrencia/tipos";

/**
 * Campo oculto `__version` para formularios con FormData (QA N43): la versión que la pantalla leyó de lo que
 * edita. Se toma al montar y se pone al día cuando la página se recarga con otra versión. La acción del servidor
 * lo lee con `controlDeFormulario(formData)`.
 */
export function CampoVersion({ versiones }: { versiones: VersionLeida[] }) {
  const clave = JSON.stringify(versiones.filter((v) => v.v));
  const [leidas, setLeidas] = useState(clave);
  const [vista, setVista] = useState(clave);
  if (clave !== vista) {
    setVista(clave);
    setLeidas(clave);
  }
  return <input type="hidden" name="__version" value={leidas} readOnly />;
}

/** Copia de un FormData para volver a mandarlo con «guardar los míos encima». */
export function conForzar(fd: FormData): FormData {
  const copia = new FormData();
  fd.forEach((valor, campo) => copia.append(campo, valor));
  copia.set("__forzar", "1");
  return copia;
}

/**
 * Para formularios con `useActionState` (QA N43): se mandan a mano, sin `action=` (así React no vacía lo
 * escrito si otra persona cambió el registro), y «guardar los míos encima» reenvía lo mismo con `__forzar`.
 *   const v = useEnvioConVersion(formAction);
 *   <form onSubmit={v.onSubmit}> <CampoVersion …/> {estado.conflicto && <AvisoConflicto … onGuardarEncima={v.forzar} />}
 */
export function useEnvioConVersion(formAction: (fd: FormData) => void) {
  const ultimo = useRef<FormData | null>(null);
  return {
    onSubmit(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      ultimo.current = fd;
      startTransition(() => formAction(fd));
    },
    forzar() {
      if (!ultimo.current) return;
      const fd = conForzar(ultimo.current);
      startTransition(() => formAction(fd));
    },
  };
}
