// Qué campos del perro sabe pedir el alta, en el orden en que se pintan.
//
// Vive fuera del componente porque lo necesitan los dos lados: la tarjeta
// ("use client") para decidir qué inputs dibuja, y la pantalla del alta
// (componente de servidor) para calcular qué le falta a un perro que ya
// existe. Importar una constante desde un módulo "use client" no devuelve
// el arreglo sino una referencia al cliente — y el servidor truena al
// intentar recorrerlo.
export const CAMPOS_BASE = [
  "raza",
  "sexo",
  "fecha_nacimiento",
  "tamano_id",
  "pelaje_id",
] as const;

// Lo que solo pide el flujo de guardería y hotel. A quien viene dos horas
// a bañar a su perro no se le pregunta el teléfono de su veterinario.
export const CAMPOS_EXPEDIENTE = [
  "alimentacion_notas",
  "contacto_emergencia_nombre",
  "contacto_emergencia_telefono",
  "veterinario_nombre",
  "veterinario_telefono",
  "veterinario_clinica",
] as const;

export type CampoPerro = (typeof CAMPOS_BASE)[number] | (typeof CAMPOS_EXPEDIENTE)[number];

export function camposDeTipo(expedienteCompleto: boolean): CampoPerro[] {
  return expedienteCompleto ? [...CAMPOS_BASE, ...CAMPOS_EXPEDIENTE] : [...CAMPOS_BASE];
}
