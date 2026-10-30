"use client";

import { createContext, Fragment, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import type { ResultadoAccion } from "@/lib/empleados/tipos";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import { publicarRegistros } from "@/components/concurrencia/registro-vivo";
import { versionesConRegistros, type Conflicto, type ControlVersion, type RegistroFinal, type VersionLeida } from "@/lib/concurrencia/tipos";

/**
 * QA S15: un formulario dentro de un desplegable con `cerrarAlGuardar` se cierra al guardar y deja el aviso junto al
 * botón; al volver a abrirlo nace vacío (la vacuna del carnet seguía mostrando lo de antes).
 */
export const CierreDesplegable = createContext<((mensaje: string) => void) | null>(null);

// La versión que la pantalla leyó (QA N43): se toma al montar y se pone al día cuando la página se recarga o cuando el
// guardado devuelve cómo quedó el registro (QA S39, N138: también al guardar encima).
function useVersiones(versiones: VersionLeida[] | undefined) {
  const clave = JSON.stringify(versiones ?? []);
  const [leidas, setLeidas] = useState(versiones ?? []);
  const [vista, setVista] = useState(clave);
  if (clave !== vista) {
    setVista(clave);
    setLeidas(versiones ?? []);
  }
  const alGuardar = (registros: RegistroFinal[] | undefined) => {
    setLeidas((l) => versionesConRegistros(l, registros));
    publicarRegistros(registros);
  };
  return [leidas, alGuardar] as const;
}

/**
 * Un formulario de Empleados: los campos llegan como children (se
 * renderizan en el servidor), el envío pasa por la acción con tope y
 * spinner, y la confirmación o el error salen junto al botón.
 */
export function FormularioAccion({
  accion,
  textoBoton,
  textoExito = "Guardado",
  variante = "primario",
  reiniciar = false,
  children,
  className = "",
  otrosBotones,
  versiones,
  registro = "este registro",
}: {
  accion: (datos: FormData) => Promise<ResultadoAccion>;
  /** Versiones de lo que edita este formulario (se mandan en `__version`). */
  versiones?: VersionLeida[];
  /** «esta cita», «este empleado»… para el aviso de conflicto. */
  registro?: string;
  textoBoton: string;
  textoExito?: string;
  variante?: "primario" | "secundario" | "peligro" | "exito";
  reiniciar?: boolean;
  children?: ReactNode;
  className?: string;
  otrosBotones?: ReactNode;
}) {
  const router = useRouter();
  const envio = useEspera();
  const cerrarDesplegable = useContext(CierreDesplegable);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [leidas, alGuardar] = useVersiones(versiones);
  const [conflicto, setConflicto] = useState<{ c: Conflicto; datos: FormData } | null>(null);
  // Con `reiniciar`, los campos con estado propio (producto y lote de una vacuna) también vuelven a empezar.
  const [vuelta, setVuelta] = useState(0);

  async function enviar(datos: FormData, forzar: boolean) {
    setError(null);
    setExito(null);
    if (leidas.length) datos.set("__version", JSON.stringify(leidas));
    if (forzar) datos.set("__forzar", "1");
    else datos.delete("__forzar");
    const res = await envio.ejecutar(() => accion(datos));
    if (res.conflicto) {
      setConflicto({ c: res.conflicto, datos });
      return;
    }
    setConflicto(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    alGuardar(res.registros);
    if (res.ir) {
      // QA S19: lo que se guardó se dice junto al botón mientras se abre la pantalla siguiente.
      if (res.exito) setExito(res.exito);
      router.push(res.ir);
      return;
    }
    setExito(res.exito ?? textoExito);
    if (reiniciar) {
      form.current?.reset();
      setVuelta((v) => v + 1);
    }
    router.refresh();
    if (reiniciar && cerrarDesplegable) cerrarDesplegable(res.exito ?? textoExito);
  }

  return (
    <form method="post"
      ref={form}
      className={`flex flex-col gap-4 ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        await enviar(new FormData(e.currentTarget), false);
      }}
    >
      <Fragment key={vuelta}>{children}</Fragment>
      {conflicto && (
        <AvisoConflicto
          conflicto={conflicto.c}
          registro={registro}
          cargando={envio.cargando}
          onRecargar={() => setConflicto(null)}
          onGuardarEncima={() => enviar(conflicto.datos, true)}
        />
      )}
      <AccionesFormulario error={error} exito={exito}>
        <Button type="submit" variante={variante} cargando={envio.cargando}>
          {textoBoton}
        </Button>
        {otrosBotones}
      </AccionesFormulario>
    </form>
  );
}

/** Un botón que corre una acción sin datos (registrar entrada, aprobar…). */
export function BotonAccion({
  accion,
  texto,
  variante = "primario",
  textoExito,
  versiones,
  registro = "este registro",
  navegacionCompleta = false,
}: {
  accion: (control?: ControlVersion) => Promise<ResultadoAccion>;
  /** QA S19: abre `ir` con una carga completa DESPUÉS de la respuesta (si la pantalla actual se refresca a la vez, no se queda en ella). */
  navegacionCompleta?: boolean;
  texto: string;
  variante?: "primario" | "secundario" | "peligro" | "exito";
  textoExito?: string;
  versiones?: VersionLeida[];
  registro?: string;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [leidas, alGuardar] = useVersiones(versiones);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);
  async function correr(forzar: boolean) {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => accion({ versiones: leidas, forzar }));
    if (res.conflicto) {
      setConflicto(res.conflicto);
      return;
    }
    setConflicto(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    alGuardar(res.registros);
    if (res.ir) {
      if (navegacionCompleta) {
        setExito(res.exito ?? "Listo. Abriendo…");
        window.location.assign(res.ir);
      } else router.push(res.ir);
      return;
    }
    setExito(res.exito ?? textoExito ?? "Listo");
    router.refresh();
  }
  return (
    <>
      {conflicto && (
        <AvisoConflicto conflicto={conflicto} registro={registro} cargando={envio.cargando} onRecargar={() => setConflicto(null)} onGuardarEncima={() => correr(true)} />
      )}
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" variante={variante} cargando={envio.cargando} onClick={() => correr(false)}>
          {texto}
        </Button>
      </AccionesFormulario>
    </>
  );
}

/** Un formulario plegado detrás de un botón (corregir, rechazar, revertir…). */
export function Desplegable({
  texto,
  children,
  variante = "secundario",
  cerrarAlGuardar = false,
}: {
  texto: string;
  children: ReactNode;
  variante?: "primario" | "secundario" | "peligro";
  /** Al guardar el formulario de adentro (con `reiniciar`) se cierra y deja el aviso junto al botón. */
  cerrarAlGuardar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {/* QA N152: abre un formulario que guarda; con el negocio en solo lectura queda bloqueado desde el inicio. */}
        <Button type="button" variante={variante} data-escritura="" onClick={() => { setAviso(null); setAbierto(true); }}>
          {texto}
        </Button>
        {aviso && <p role="status" data-desplegable-aviso className="text-sm font-semibold text-menta-oscuro">{aviso}</p>}
      </div>
    );
  }
  const contenido = (
    <div className="flex w-full flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
      {children}
      <button type="button" className="w-fit text-sm font-semibold text-n-600 hover:underline" onClick={() => setAbierto(false)}>
        Cerrar
      </button>
    </div>
  );
  if (!cerrarAlGuardar) return contenido;
  return (
    <CierreDesplegable.Provider value={(m) => { setAviso(m); setAbierto(false); }}>
      {contenido}
    </CierreDesplegable.Provider>
  );
}
