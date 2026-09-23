"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { SelectorRaza, type RazaOpcion } from "@/components/selector-raza";
import { camposPorCapturar, type PendienteEstancia } from "@/lib/perros/pendientes-estancia";
import { completarParaEstancia, type EstadoPerroForm } from "./actions";
import type { CategoriaOpcion } from "./perro-form";

export type CatalogosPerro = { razas: RazaOpcion[]; tamanos: CategoriaOpcion[]; pelajes: CategoriaOpcion[] };

const ESTADO_INICIAL: EstadoPerroForm = { error: null };

/**
 * Qué le falta a un perro para guardería u hotel, y cómo resolverlo en el
 * mostrador.
 *
 * El caso: un perro que entró por estética ahora quiere guardería. Con el
 * dueño enfrente, recepción captura aquí mismo los datos que faltan
 * ("Capturar ahora"), registra vacunas y evaluación en su sección, y
 * genera el contrato para imprimirlo y subir el papel firmado. El link de
 * complemento sigue siendo la salida cuando el dueño no está.
 *
 * La lista sale de pendientes_para_estancia() en la base: las mismas
 * reglas que aplica la reserva, así que "no le falta nada" aquí quiere
 * decir que la base no la va a rechazar por esto.
 */
export function PendientesEstancia({
  perroId,
  perroNombre,
  clienteId,
  pendientes,
  catalogos,
  enSuExpediente,
  puedeEscribir,
}: {
  perroId: string;
  perroNombre: string;
  clienteId: string | null;
  pendientes: PendienteEstancia[];
  catalogos: CatalogosPerro;
  // En el expediente del perro las secciones están en la misma página; en
  // la ficha del cliente, los enlaces llevan al expediente.
  enSuExpediente: boolean;
  puedeEscribir: boolean;
}) {
  const [capturando, setCapturando] = useState(false);
  const base = enSuExpediente ? "" : `/perros/${perroId}`;

  if (pendientes.length === 0) {
    return (
      <p className="rounded-md border-l-4 border-verde bg-verde-suave px-4 py-3 text-sm font-semibold text-verde-oscuro">
        {perroNombre} tiene todo lo que se pide para guardería y hotel.
      </p>
    );
  }

  const bloquean = pendientes.filter((p) => p.grupo === "bloquea");
  const condiciones = pendientes.filter((p) => p.grupo === "condicion");
  const expediente = pendientes.filter((p) => p.grupo === "expediente");
  const contratos = pendientes.filter((p) => p.grupo === "contrato");
  const porCapturar = camposPorCapturar(pendientes);

  function accionDe(p: PendienteEstancia) {
    if (p.clave === "evaluacion") return { href: `${base}#requisitos-estancia`, texto: "Registrar evaluación" };
    if (p.clave.startsWith("sanitario:")) return { href: `${base}#sanitarios`, texto: "Registrar con el carnet" };
    if (p.grupo === "contrato") {
      return {
        href: `${base}#contrato`,
        texto: p.contratoPendienteId ? "Imprimir o subir el firmado" : "Generar, imprimir y subir el firmado",
      };
    }
    return null;
  }

  function Item({ p }: { p: PendienteEstancia }) {
    const accion = accionDe(p);
    return (
      <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span>{p.etiqueta}</span>
        {accion && (
          <Link href={accion.href} className="text-sm font-semibold text-azul hover:underline">
            {accion.texto} →
          </Link>
        )}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-amarillo bg-amarillo-suave/40 p-4">
      <p className="font-bold text-n-900">Para guardería y hotel, a {perroNombre} le falta:</p>

      {(bloquean.length > 0 || condiciones.length > 0) && (
        <div>
          <p className="text-sm font-bold text-naranja-oscuro">No se le puede reservar hasta que esto quede</p>
          <ul className="mt-1 flex flex-col gap-1 text-n-900">
            {bloquean.map((p) => (
              <Item key={p.clave} p={p} />
            ))}
            {condiciones.map((p) => (
              <Item key={p.clave} p={p} />
            ))}
          </ul>
          {bloquean.some((p) => p.clave === "evaluacion" || p.clave.startsWith("sanitario:")) && (
            <p className="mt-1 text-xs text-n-600">
              Vacunas y evaluación: un admin puede autorizar una excepción con motivo al reservar.
            </p>
          )}
        </div>
      )}

      {expediente.length > 0 && (
        <div>
          <p className="text-sm font-bold text-n-800">Datos del expediente que pide guardería y hotel</p>
          <p className="mt-1 text-n-900">{expediente.map((p) => p.etiqueta).join(", ")}.</p>
        </div>
      )}

      {contratos.length > 0 && (
        <div>
          <p className="text-sm font-bold text-n-800">Contrato</p>
          <ul className="mt-1 flex flex-col gap-1 text-n-900">
            {contratos.map((p) => (
              <Item key={p.clave} p={p} />
            ))}
          </ul>
        </div>
      )}

      {puedeEscribir && (
        <div className="flex flex-wrap gap-2">
          {porCapturar.length > 0 && !capturando && (
            <Button type="button" onClick={() => setCapturando(true)}>
              Capturar ahora
            </Button>
          )}
          {clienteId && (
            <Link href={`/clientes/${clienteId}#link-complemento`}>
              <Button type="button" variante="secundario">
                Mandarle un link
              </Button>
            </Link>
          )}
        </div>
      )}
      {puedeEscribir && (
        <p className="-mt-2 text-xs text-n-600">
          Capturar ahora es para cuando el dueño está enfrente. Si no está, el link le pide solo lo que falta.
        </p>
      )}

      {capturando && (
        <FormularioCaptura
          perroId={perroId}
          campos={porCapturar}
          catalogos={catalogos}
          onCerrar={() => setCapturando(false)}
        />
      )}
    </div>
  );
}

function FormularioCaptura({
  perroId,
  campos,
  catalogos,
  onCerrar,
}: {
  perroId: string;
  campos: string[];
  catalogos: CatalogosPerro;
  onCerrar: () => void;
}) {
  const [estado, formAction, enviando] = useActionState(
    useAccionConTope(completarParaEstancia.bind(null, perroId)),
    ESTADO_INICIAL
  );
  const pide = (c: string) => campos.includes(c);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-n-200 bg-white p-4">
      <p className="text-sm text-n-600">Solo aparecen los datos que faltan. Lo que dejes vacío sigue pendiente.</p>

      {pide("tamano_id") && (
        <Select label="Talla" name="tamano_id" disabled={enviando} defaultValue="">
          <option value="">Escoge la talla</option>
          {catalogos.tamanos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </Select>
      )}
      {pide("raza") && <SelectorRaza razas={catalogos.razas} label="Raza" disabled={enviando} mostrarGrupo />}
      {(pide("sexo") || pide("pelaje_id")) && (
        <div className="grid grid-cols-2 gap-4">
          {pide("sexo") && (
            <Select label="Sexo" name="sexo" disabled={enviando} defaultValue="">
              <option value="">Sin capturar</option>
              <option value="macho">Macho</option>
              <option value="hembra">Hembra</option>
            </Select>
          )}
          {pide("pelaje_id") && (
            <Select label="Pelaje" name="pelaje_id" disabled={enviando} defaultValue="">
              <option value="">Sin capturar</option>
              {catalogos.pelajes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
      {pide("fecha_nacimiento") && (
        <Field
          label="Fecha de nacimiento"
          name="fecha_nacimiento"
          type="date"
          disabled={enviando}
          ayuda="Aproximada está bien."
        />
      )}
      {pide("alimentacion_notas") && (
        <Textarea
          label="Alimentación"
          name="alimentacion_notas"
          disabled={enviando}
          placeholder="Qué come, cuánto y a qué horas. Si trae su propia comida."
        />
      )}
      {(pide("contacto_emergencia_nombre") || pide("contacto_emergencia_telefono")) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pide("contacto_emergencia_nombre") && (
            <Field label="Contacto de emergencia" name="contacto_emergencia_nombre" disabled={enviando} />
          )}
          {pide("contacto_emergencia_telefono") && (
            <Field label="Teléfono de emergencia" name="contacto_emergencia_telefono" inputMode="tel" disabled={enviando} />
          )}
        </div>
      )}
      {(pide("veterinario_nombre") || pide("veterinario_telefono")) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pide("veterinario_nombre") && <Field label="Veterinario" name="veterinario_nombre" disabled={enviando} />}
          {pide("veterinario_telefono") && (
            <Field label="Teléfono del veterinario" name="veterinario_telefono" inputMode="tel" disabled={enviando} />
          )}
        </div>
      )}
      {pide("veterinario_clinica") && (
        <Field label="Clínica del veterinario" name="veterinario_clinica" disabled={enviando} />
      )}

      <AccionesFormulario error={estado.error} exito={estado.ok && "Guardado"}>
        <Button type="submit" cargando={enviando}>
          {enviando ? "Guardando…" : "Guardar lo capturado"}
        </Button>
        <Button type="button" variante="secundario" onClick={onCerrar}>
          Cerrar
        </Button>
      </AccionesFormulario>
    </form>
  );
}
