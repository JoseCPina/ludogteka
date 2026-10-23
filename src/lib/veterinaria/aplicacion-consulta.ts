// QA S27: lo que «Registrar vacuna» o «Registrar desparasitación» dentro de una consulta devuelve, para que la
// sección «Vacunas y desparasitación» y los cargos de la consulta se pinten al momento con la respuesta del
// servidor (antes esperaban a que se repintara la página entera: 3 a 4 s). El formulario lo avisa con un evento
// de ventana; la sección y el editor de la consulta lo escuchan.
import type { CargosConsulta } from "./cargos-consulta";
import type { RegistroDesparasitacion, RegistroVacuna } from "./carnet";

export const EVENTO_APLICACION_CONSULTA = "vet:aplicacion-consulta";

export type AplicacionConsulta = {
  consultaId: string;
  vacuna?: RegistroVacuna;
  desparasitacion?: RegistroDesparasitacion;
  cargos?: CargosConsulta | null;
};

export function avisarAplicacionConsulta(detalle: AplicacionConsulta) {
  window.dispatchEvent(new CustomEvent<AplicacionConsulta>(EVENTO_APLICACION_CONSULTA, { detail: detalle }));
}
