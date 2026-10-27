import { camposDisponibles } from "./campos";

const EJEMPLOS: Record<string, [string, string]> = {
  c_nombre: ["María Hernández", "Luis Torres"],
  c_telefono: ["444 123 4567", "444 765 4321"],
  c_email: ["maria@correo.com", ""],
  c_direccion: ["Av. Carranza 100, Centro", ""],
  c_notas: ["Prefiere WhatsApp", ""],
  m_nombre: ["Rocky", "Misha"],
  m_especie: ["Perro", "Gato"],
  m_raza: ["Labrador", "Mestizo"],
  m_sexo: ["Macho", "Hembra"],
  m_nacimiento: ["15/03/2021", "02/11/2019"],
  m_tamano: ["Grande", "Chico"],
  m_pelaje: ["Corto", "Largo"],
  m_esterilizado: ["Sí", "No"],
  m_peso: ["28.5", "4.2"],
  m_alergias: ["Pollo; Polen", ""],
  m_microchip: ["985112345678901", ""],
  m_folio: ["RUAC-0001", ""],
};

const celda = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV de ejemplo con los encabezados que el importador reconoce solo. */
export function plantillaCsv(conClinicos: boolean, conVet: boolean = conClinicos): string {
  const campos = camposDisponibles(conClinicos, conVet);
  const filas = [
    campos.map((c) => c.etiqueta),
    campos.map((c) => EJEMPLOS[c.clave]?.[0] ?? ""),
    campos.map((c) => EJEMPLOS[c.clave]?.[1] ?? ""),
  ];
  // BOM para que Excel abra los acentos bien.
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}
