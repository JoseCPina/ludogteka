"use client";

import { useEffect, useRef, useState } from "react";
import { AvisoBorrador, useAutoguardado } from "./use-autoguardado";

type Valores = Record<string, string | boolean>;

// Qué campos NO entran a un borrador: contraseñas, archivos y lo que el sistema arma solo.
const SIN_BORRADOR = /^(\$ACTION|password|contrasena|clinico$|raza_propuesta$)/i;

function leerCampos(form: HTMLFormElement): Valores {
  const salida: Valores = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    const nombre = el.name;
    if (!nombre || el.disabled || SIN_BORRADOR.test(nombre) || el.hasAttribute("data-sin-borrador")) continue;
    if (el instanceof HTMLInputElement) {
      if (["password", "file", "submit", "button", "reset", "image"].includes(el.type)) continue;
      if (el.type === "hidden") continue;
      if (el.type === "checkbox") {
        salida[nombre] = el.checked;
        continue;
      }
      if (el.type === "radio") {
        if (el.checked) salida[nombre] = el.value;
        continue;
      }
    }
    salida[nombre] = el.value;
  }
  return salida;
}

function fijarValor(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, valor: string) {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype;
  const asignar = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  asignar?.call(el, valor);
  // React escucha estos eventos en la raíz: así sus campos controlados también se enteran.
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function ponerCampos(form: HTMLFormElement, valores: Valores) {
  // Primero lo que prende o apaga otros campos (casillas, selects), luego el resto.
  const orden = Object.entries(valores).sort(([, a], [, b]) => Number(typeof b === "boolean") - Number(typeof a === "boolean"));
  for (const [nombre, valor] of orden) {
    const els = Array.from(form.elements).filter(
      (e): e is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
        (e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement) && (e as HTMLInputElement).name === nombre
    );
    for (const el of els) {
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        if (el.checked !== Boolean(valor)) el.click();
      } else if (el instanceof HTMLInputElement && el.type === "radio") {
        if (el.value === valor && !el.checked) el.click();
      } else if (typeof valor === "string" && el.value !== valor) {
        fijarValor(el, valor);
      }
    }
  }
}

/**
 * Autoguardado de un formulario hecho con campos normales (`name=`). Se pone DENTRO
 * del <form>, arriba:
 *
 *   <form …><BorradorFormulario formulario="cliente_nuevo" /> … </form>
 *
 * Guarda lo escrito (menos contraseñas y archivos) y al volver ofrece «Recuperar
 * borrador». Un campo que no deba guardarse lleva `data-sin-borrador`. La acción
 * que guarda de verdad llama `descartarBorradorGuardado` para borrarlo.
 */
export function BorradorFormulario({ formulario, clave = "", activo = true }: { formulario: string; clave?: string; activo?: boolean }) {
  const ancla = useRef<HTMLSpanElement>(null);
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const [valor, setValor] = useState<Valores>({});
  const pausa = useRef<() => void>(() => {});
  // Cómo estaba el formulario al abrirlo (con sus valores de arranque: una especie «perro», un
  // select en su primera opción…): un borrador igual a eso NO es un borrador.
  const inicial = useRef<Valores>({});

  useEffect(() => {
    setForm(ancla.current?.closest("form") ?? null);
  }, []);

  useEffect(() => {
    if (!form || !activo) return;
    const alCambiar = () => setValor(leerCampos(form));
    const alEnviar = () => pausa.current();
    inicial.current = leerCampos(form);
    alCambiar();
    form.addEventListener("input", alCambiar);
    form.addEventListener("change", alCambiar);
    form.addEventListener("submit", alEnviar);
    return () => {
      form.removeEventListener("input", alCambiar);
      form.removeEventListener("change", alCambiar);
      form.removeEventListener("submit", alEnviar);
    };
  }, [form, activo]);

  const estado = useAutoguardado<Valores>({
    formulario,
    clave,
    valor,
    activo: activo && form !== null,
    esVacio: (v) => Object.entries(v).every(([k, x]) => x === (inicial.current[k] ?? (typeof x === "boolean" ? false : ""))),
    alRecuperar: (datos) => {
      if (!form) return;
      ponerCampos(form, datos);
      // Un campo que aparece al marcar una casilla existe hasta el siguiente cuadro.
      setTimeout(() => ponerCampos(form, datos), 80);
    },
  });
  useEffect(() => {
    pausa.current = estado.pausar;
  });

  return (
    <>
      <span ref={ancla} hidden />
      <AvisoBorrador estado={estado} />
    </>
  );
}
