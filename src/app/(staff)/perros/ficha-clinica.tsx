"use client";

import { useActionState, useState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { ESPECIES, ETIQUETA_ESPECIE, type Especie } from "@/lib/perros/ficha-clinica";
import { guardarFichaClinica, type EstadoFichaClinica } from "./ficha-clinica-actions";

const ESTADO_INICIAL: EstadoFichaClinica = { error: null };

export type FichaClinicaValores = {
  especie: Especie;
  especie_detalle: string | null;
  esterilizado: boolean | null;
  microchip: string | null;
  folio_registro: string | null;
  notas_clinicas: string | null;
};

function textoEsterilizado(v: boolean | null): string {
  return v === true ? "Sí" : v === false ? "No" : "Sin dato";
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-semibold uppercase tracking-wide text-n-500">{etiqueta}</dt>
      <dd className="text-n-900">{children}</dd>
    </div>
  );
}

/**
 * Ficha clínica de la mascota (solo con el módulo Veterinaria activo).
 * Junta lo nuevo (especie, microchip, folio, notas) con lo que ya existía
 * (esterilización, peso y alergias, que se siguen editando en su sección).
 */
export function FichaClinica({
  perroId,
  nombre,
  valores,
  puedeEditar,
  pesoActual,
  alergias,
}: {
  perroId: string;
  nombre: string;
  valores: FichaClinicaValores;
  puedeEditar: boolean;
  pesoActual: { peso_kg: number; fecha: string } | null;
  alergias: { alergeno: string; gravedad: string | null }[];
}) {
  const [estado, formAction, enviando] = useActionState(
    useAccionConTope(guardarFichaClinica.bind(null, perroId)),
    ESTADO_INICIAL
  );
  const [especie, setEspecie] = useState<Especie>(valores.especie);

  const resumenSoloLectura = (
    <dl className="grid gap-3 sm:grid-cols-2">
      <Dato etiqueta="Especie">
        {ETIQUETA_ESPECIE[valores.especie]}
        {valores.especie === "otro" && valores.especie_detalle ? ` · ${valores.especie_detalle}` : ""}
      </Dato>
      <Dato etiqueta="Esterilización">{textoEsterilizado(valores.esterilizado)}</Dato>
      <Dato etiqueta="Microchip">{valores.microchip ?? "Sin registrar"}</Dato>
      <Dato etiqueta="Folio de registro">{valores.folio_registro ?? "Sin registrar"}</Dato>
      <div className="sm:col-span-2">
        <Dato etiqueta="Notas clínicas">
          {valores.notas_clinicas ? (
            <span className="whitespace-pre-wrap">{valores.notas_clinicas}</span>
          ) : (
            "Sin notas"
          )}
        </Dato>
      </div>
    </dl>
  );

  return (
    <section id="ficha-clinica" className="flex scroll-mt-6 flex-col gap-4 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Ficha clínica</h2>

      <dl className="grid gap-3 rounded-md border border-n-200 bg-white px-4 py-3 sm:grid-cols-2">
        <Dato etiqueta="Peso actual">
          {pesoActual ? (
            <>
              {pesoActual.peso_kg} kg{" "}
              <span className="text-sm text-n-600">({pesoActual.fecha.slice(0, 10)})</span>
            </>
          ) : (
            "Sin registrar"
          )}{" "}
          <a href="#peso" className="text-sm font-semibold text-morado hover:underline">
            Ver historial
          </a>
        </Dato>
        <Dato etiqueta="Alergias">
          {alergias.length === 0 ? (
            "Ninguna registrada"
          ) : (
            <>
              {alergias.map((a) => a.alergeno + (a.gravedad === "grave" ? " (grave)" : "")).join(", ")}{" "}
              <a href="#alergias" className="text-sm font-semibold text-morado hover:underline">
                Ver detalle
              </a>
            </>
          )}
        </Dato>
      </dl>

      {!puedeEditar ? (
        <>
          {resumenSoloLectura}
          <p className="text-sm text-n-600">
            La ficha clínica la edita un admin o quien tenga el permiso «Editar ficha clínica». Si hay que
            corregir algo de {nombre}, pídeselo a un admin.
          </p>
        </>
      ) : (
        <form action={formAction} className="flex max-w-lg flex-col gap-4">
          {estado.error && (
            <Alert variante="error" titulo="No se pudo guardar">
              {estado.error}
            </Alert>
          )}
          {estado.ok && <Alert variante="exito" titulo="Ficha clínica guardada" />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Especie"
              name="especie"
              disabled={enviando}
              value={especie}
              onChange={(e) => setEspecie(e.target.value as Especie)}
            >
              {ESPECIES.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESPECIE[e]}
                </option>
              ))}
            </Select>
            {especie === "otro" && (
              <Field
                label="¿Cuál?"
                name="especie_detalle"
                required
                disabled={enviando}
                defaultValue={valores.especie_detalle ?? ""}
                ayuda="Por ejemplo: conejo, hurón."
              />
            )}
            <Select
              label="Esterilización"
              name="esterilizado"
              disabled={enviando}
              defaultValue={valores.esterilizado === true ? "si" : valores.esterilizado === false ? "no" : ""}
            >
              <option value="">Sin dato</option>
              <option value="si">Esterilizado</option>
              <option value="no">No esterilizado</option>
            </Select>
          </div>
          <Field
            label="Microchip"
            name="microchip"
            disabled={enviando}
            defaultValue={valores.microchip ?? ""}
            ayuda="De 9 a 20 letras o números, sin espacios (el estándar tiene 15 dígitos)."
          />
          <Field
            label="Folio de registro"
            name="folio_registro"
            disabled={enviando}
            defaultValue={valores.folio_registro ?? ""}
            ayuda="Por ejemplo, el folio del RUAC."
          />
          <Textarea
            label="Notas clínicas"
            name="notas_clinicas"
            disabled={enviando}
            defaultValue={valores.notas_clinicas ?? ""}
            ayuda="Son internas del negocio: el dueño no las ve."
          />
          <AccionesFormulario error={estado.error} exito={estado.ok && "Ficha clínica guardada"}>
            <Button type="submit" cargando={enviando}>
              {enviando ? "Guardando…" : "Guardar ficha clínica"}
            </Button>
          </AccionesFormulario>
        </form>
      )}
    </section>
  );
}
