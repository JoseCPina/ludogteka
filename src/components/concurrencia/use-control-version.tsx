"use client";

import { useState } from "react";
import { AvisoConflicto } from "./aviso-conflicto";
import { publicarRegistros } from "./registro-vivo";
import type { Conflicto, ControlVersion, RegistroFinal, VersionLeida } from "@/lib/concurrencia/tipos";

type Pendiente = { c: Conflicto; reintentar: () => unknown };

/**
 * La versión que esta pantalla LEYÓ de un registro (QA N43) y el aviso cuando otra persona lo cambió.
 *   const ctl = useControlVersion("citas_estetica", citaId, version);
 *   const res = await accion(..., ctl.control(forzar));
 *   if (ctl.huboConflicto(res, () => guardar(true))) return;
 *   ctl.guardado("Cita reprogramada");   // el éxito, que vive aquí junto al conflicto
 *   … y en la pantalla: <AvisoVersion ctl={ctl} registro="esta cita" /> y {ctl.exito && …}
 * Cuando la página se recarga (la versión de la base cambió), la versión leída se pone al día sola.
 *
 * QA S39 (N138): el éxito y el conflicto son UN solo estado: un conflicto borra el «Guardado» anterior y un guardado
 * (también «guardar los míos encima») cierra el aviso de conflicto. Al guardar, la acción devuelve el registro final
 * (`registros`): su versión pasa a ser la leída y se publica para que lo que la pantalla muestra se pinte al momento.
 */
export function useControlVersion<E = string>(tabla: string, id: string | null | undefined, version: string | null | undefined, extra: VersionLeida[] = []) {
  const [leida, setLeida] = useState(version ?? null);
  const [vista, setVista] = useState(version ?? null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [exito, setExito] = useState<E | null>(null);
  if ((version ?? null) !== vista) {
    setVista(version ?? null);
    setLeida(version ?? null);
  }
  const control = (forzar = false): ControlVersion => ({
    versiones: [...(id && leida ? [{ t: tabla, i: id, v: leida }] : []), ...extra],
    forzar,
  });
  const huboConflicto = (
    res: { conflicto?: Conflicto | null; error?: string | null; registros?: RegistroFinal[] } | null | undefined,
    reintentar: () => unknown
  ): boolean => {
    if (res?.conflicto) {
      setExito(null);
      setPendiente({ c: res.conflicto, reintentar });
      return true;
    }
    setPendiente(null);
    if (res?.error) {
      setExito(null);
      return false;
    }
    const propio = res?.registros?.find((r) => r.t === tabla && r.i === id);
    if (propio?.version) setLeida(propio.version);
    publicarRegistros(res?.registros);
    return false;
  };
  /** Lo que se dice al guardar (cierra cualquier aviso de conflicto). */
  const guardado = (e: E) => {
    setPendiente(null);
    setExito(e);
  };
  return { control, huboConflicto, pendiente, exito, guardado, limpiarExito: () => setExito(null), limpiar: () => setPendiente(null), marcarLeida: setLeida };
}

export type ControlDeVersion = Pick<ReturnType<typeof useControlVersion>, "pendiente" | "limpiar">;

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
