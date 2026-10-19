"use client";

import { useState } from "react";
import { AvisoConflicto } from "./aviso-conflicto";
import type { Conflicto, ControlVersion, VersionLeida } from "@/lib/concurrencia/tipos";

type Pendiente = { c: Conflicto; reintentar: () => unknown };

/**
 * La versión que esta pantalla LEYÓ de un registro (QA N43) y el aviso cuando otra persona lo cambió.
 *   const ctl = useControlVersion("citas_estetica", citaId, version);
 *   const res = await accion(..., ctl.control(forzar));
 *   if (ctl.huboConflicto(res, () => guardar(true))) return;
 *   … y en la pantalla: <ctl.Aviso registro="esta cita" cargando={...} />
 * Cuando la página se recarga (la versión de la base cambió), la versión leída se pone al día sola.
 */
export function useControlVersion(tabla: string, id: string | null | undefined, version: string | null | undefined, extra: VersionLeida[] = []) {
  const [leida, setLeida] = useState(version ?? null);
  const [vista, setVista] = useState(version ?? null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  if ((version ?? null) !== vista) {
    setVista(version ?? null);
    setLeida(version ?? null);
  }
  const control = (forzar = false): ControlVersion => ({
    versiones: [...(id && leida ? [{ t: tabla, i: id, v: leida }] : []), ...extra],
    forzar,
  });
  const huboConflicto = (res: { conflicto?: Conflicto | null } | null | undefined, reintentar: () => unknown): boolean => {
    if (res?.conflicto) {
      setPendiente({ c: res.conflicto, reintentar });
      return true;
    }
    setPendiente(null);
    return false;
  };
  return { control, huboConflicto, pendiente, limpiar: () => setPendiente(null), marcarLeida: setLeida };
}

export type ControlDeVersion = ReturnType<typeof useControlVersion>;

/** El aviso de conflicto de un `useControlVersion` (nada si no hay). */
export function AvisoVersion({ ctl, registro, cargando = false, onRecargar }: { ctl: ControlDeVersion; registro: string; cargando?: boolean; onRecargar?: () => void }) {
  if (!ctl.pendiente) return null;
  const p = ctl.pendiente;
  return (
    <AvisoConflicto
      conflicto={p.c}
      registro={registro}
      cargando={cargando}
      onRecargar={() => {
        ctl.limpiar();
        onRecargar?.();
      }}
      onGuardarEncima={() => p.reintentar()}
    />
  );
}
