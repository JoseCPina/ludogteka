"use client";

import { Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { agregarAdenda, anularAdjunto, anularConsulta, anularResultado } from "./actions";

/** Anular un resultado o un archivo: nunca se borra, se anula con motivo y queda en el historial. */
export function AnularItem({ tipo, id, rutas }: { tipo: "resultado" | "adjunto"; id: string; rutas: string[] }) {
  return (
    <Desplegable texto="Anular" variante="secundario">
      <FormularioAccion accion={(fd) => (tipo === "resultado" ? anularResultado(id, rutas, fd) : anularAdjunto(id, rutas, fd))} textoBoton="Anular" variante="peligro" textoExito="Anulado">
        <Field label="¿Por qué se anula?" name="motivo" required />
      </FormularioAccion>
    </Desplegable>
  );
}

/** Lo que se hace con una consulta ya firmada: agregar una adenda firmada o anularla con motivo. */
export function AccionesFirmada({ id, puedeAdenda, puedeAnular }: { id: string; puedeAdenda: boolean; puedeAnular: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {puedeAdenda && (
        <FormularioAccion accion={(fd) => agregarAdenda(id, fd)} textoBoton="Firmar adenda" textoExito="Adenda agregada" reiniciar className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
          <Textarea label="Adenda" name="texto" rows={3} required ayuda="Corrige o completa lo firmado sin tocarlo: queda a continuación, con tu firma y la fecha." />
        </FormularioAccion>
      )}
      {puedeAnular && (
        <Desplegable texto="Anular la consulta" variante="peligro">
          <FormularioAccion accion={(fd) => anularConsulta(id, fd)} textoBoton="Anular la consulta" variante="peligro" textoExito="Consulta anulada">
            <Field label="Motivo de la anulación" name="motivo" required ayuda="Por ejemplo: se capturó en la mascota equivocada. La consulta queda visible, tachada, con este motivo." />
          </FormularioAccion>
        </Desplegable>
      )}
    </div>
  );
}
