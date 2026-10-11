"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { esperarConTope } from "@/lib/ui/espera";
import { descartarBorrador, guardarBorrador, leerBorrador, type Borrador } from "./actions";

const ESPERA_MS = 1500;
const TOPE_MS = 15_000;

type Opciones<T extends Record<string, unknown>> = {
  /** Qué formulario es (a-z, números y _): una clave por pantalla. */
  formulario: string;
  /** Qué registro: el id del cliente al que se le agrega una mascota, la estancia del check-in… Vacío si es único. */
  clave?: string;
  /** Lo que hay ahora en el formulario. */
  valor: T;
  /** Cómo meter un borrador en el formulario. */
  alRecuperar: (datos: T) => void;
  /** ¿No hay nada escrito? Un formulario en blanco no se guarda como borrador. */
  esVacio: (valor: T) => boolean;
  /** false = apagado (por ejemplo, una edición que ya trae sus datos). */
  activo?: boolean;
};

export type EstadoBorrador = {
  pendiente: Borrador | null;
  recuperar: () => void;
  descartar: () => void;
  /** Lo llama el formulario al enviar: deja de guardar hasta que vuelvan a escribir. */
  pausar: () => void;
};

/**
 * Autoguardado de un formulario largo, por persona y por formulario. Guarda a
 * los 1.5 s de dejar de escribir (con conexión), y al volver ofrece
 * «Recuperar borrador». La acción que guarda de verdad borra el borrador
 * (descartarBorradorGuardado); aquí solo se ofrece, nunca se aplica solo.
 */
export function useAutoguardado<T extends Record<string, unknown>>(o: Opciones<T>): EstadoBorrador {
  const { formulario, clave = "", valor, alRecuperar, esVacio, activo = true } = o;
  const [pendiente, setPendiente] = useState<Borrador | null>(null);
  const ultimo = useRef<string>("");
  const pausado = useRef(false);
  const hayRemoto = useRef(false);
  const alRecuperarRef = useRef(alRecuperar);
  const esVacioRef = useRef(esVacio);
  const pendienteRef = useRef<Borrador | null>(null);
  useEffect(() => {
    alRecuperarRef.current = alRecuperar;
    esVacioRef.current = esVacio;
    pendienteRef.current = pendiente;
  });

  // Al llegar: ¿hay un borrador de otra vez?
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    (async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const r = await esperarConTope(() => leerBorrador(formulario, clave), TOPE_MS);
      if (!vivo || r.error || !("borrador" in r) || !r.borrador) return;
      hayRemoto.current = true;
      if (!esVacioRef.current(r.borrador.datos as T)) setPendiente(r.borrador);
    })();
    return () => {
      vivo = false;
    };
  }, [formulario, clave, activo]);

  // Cada cambio: guardar cuando se detenga la escritura.
  const serializado = JSON.stringify(valor);
  useEffect(() => {
    if (!activo || pendiente) return; // mientras se decide qué hacer con el borrador viejo, no se pisa
    if (serializado === ultimo.current) return;
    const primera = ultimo.current === "";
    ultimo.current = serializado;
    if (primera) return; // el estado inicial no es un cambio
    pausado.current = false;
    const t = setTimeout(async () => {
      if (pausado.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return; // sin conexión nada se escribe
      const datos = JSON.parse(serializado) as T;
      if (esVacioRef.current(datos)) {
        if (hayRemoto.current) {
          hayRemoto.current = false;
          await esperarConTope(() => descartarBorrador(formulario, clave), TOPE_MS);
        }
        return;
      }
      const r = await esperarConTope(() => guardarBorrador(formulario, clave, datos), TOPE_MS);
      if (!r.error) hayRemoto.current = true;
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [serializado, activo, pendiente, formulario, clave]);

  const recuperar = useCallback(() => {
    const p = pendienteRef.current;
    if (!p) return;
    // Fuera de cualquier render: aquí se escribe en el formulario y se avisa a sus campos.
    alRecuperarRef.current(p.datos as T);
    ultimo.current = "";
    setPendiente(null);
  }, []);
  const descartar = useCallback(() => {
    setPendiente(null);
    hayRemoto.current = false;
    void esperarConTope(() => descartarBorrador(formulario, clave), TOPE_MS);
  }, [formulario, clave]);
  const pausar = useCallback(() => {
    pausado.current = true;
  }, []);

  return { pendiente, recuperar, descartar, pausar };
}

function hace(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

/** El aviso de arriba del formulario: «Tienes un borrador…» con Recuperar y Descartar. */
export function AvisoBorrador({ estado }: { estado: EstadoBorrador }) {
  if (!estado.pendiente) return null;
  return (
    <div role="status" data-testid="aviso-borrador" className="flex flex-wrap items-center gap-3 rounded-lg border border-morado/30 bg-morado-suave p-3">
      <p className="min-w-[12rem] flex-1 text-n-900">
        <strong>Tienes un borrador sin guardar</strong> ({hace(estado.pendiente.guardadoAt)}).
      </p>
      <Button type="button" onClick={estado.recuperar}>
        Recuperar borrador
      </Button>
      <Button type="button" variante="secundario" onClick={estado.descartar}>
        Descartar
      </Button>
    </div>
  );
}
