// 66 · Importar tus clientes y mascotas desde Excel (admin)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { camposDisponibles } from "../../../src/lib/importador/campos.ts";

// El archivo de la grabación: CSV con teléfonos inventados y únicos en cada grabación (el demo se queda con lo importado).
const ARCHIVO = path.join(os.tmpdir(), "tutorial-importacion-clientes.csv");
const tel = () => `44200${String(Math.floor(Math.random() * 90000) + 10000)}`;
const campos = camposDisponibles(false);
const ETIQUETA = Object.fromEntries(campos.map((c) => [c.clave, c.etiqueta]));
const COLUMNAS = ["c_nombre", "c_telefono", "m_nombre", "m_raza", "m_sexo", "m_tamano", "m_esterilizado"];
const FILAS = [
  ["María Fernanda Ruiz", tel(), "Canela", "Labrador", "Hembra", "Grande", "Sí"],
  ["Jorge Salazar", tel(), "Rocco", "Mestizo", "Macho", "Mediano", "No"],
  ["Lucía Mora", tel(), "Pelusa", "Poodle", "Hembra", "Chico", "Sí"],
  ["Pedro Gil", "", "Kiwi", "Beagle", "Macho", "Mediano", "Sí"],
];
fs.writeFileSync(ARCHIVO, "﻿" + [COLUMNAS.map((k) => ETIQUETA[k]), ...FILAS].map((f) => f.join(",")).join("\r\n") + "\r\n", "utf8");

export default {
  rol: "admin",
  inicio: "/admin/importar",
  gancho: "¿Ya llevas tus clientes y sus mascotas en un Excel? No tienes que capturarlos uno por uno. Los importas desde un archivo, revisas lo que va a pasar, y si algo sale mal, lo deshaces.",
  escenas: [
    {
      titulo: "Descarga la plantilla",
      dice: "En Administración, «Importar clientes y mascotas». Si quieres, descarga la plantilla: trae los encabezados que el sistema reconoce solo, y dos filas de ejemplo. Acepta Excel y archivos CSV.",
      pasos: [["resaltar", "Descargar plantilla", 3000]],
    },
    {
      titulo: "Elige tu archivo",
      dice: "Elige tu archivo. El navegador lo lee aquí mismo y lo sube por partes. Tus columnas se emparejan solas con los campos del sistema, y tú puedes corregir cualquiera.",
      pasos: [["subir", "", ARCHIVO], ["esperar", 2500], ["resaltar", "Campo del sistema", 3200]],
    },
    {
      titulo: "Si alguien ya existe",
      dice: "Decide qué hacer si alguien ya está registrado, con el mismo teléfono o el mismo microchip: omitirlo, o actualizar solo lo que el archivo trae. Nunca se borra un dato con una celda vacía.",
      pasos: [["desplazar", "Revisar antes de importar"], ["resaltar", "Revisar antes de importar", 2800]],
    },
    {
      titulo: "Revisa antes de importar",
      dice: "Aprieta «Revisar antes de importar». Antes de guardar nada, ves cuántos dueños y mascotas son nuevos, cuáles ya existen y qué filas traen un error. Las que tienen error no entran, y te dice por qué.",
      pasos: [["clic", "Revisar antes de importar"], ["esperar", 3000], ["resaltar", "Con error (no entran)", 3200]],
    },
    {
      titulo: "Importar",
      dice: "Si todo se ve bien, aprieta «Importar». Se procesa por lotes, y si la conexión se corta, la retomas donde se quedó, sin duplicar nada. Al terminar, el resumen dice cuántos dueños y mascotas se crearon.",
      pasos: [["clic", "Importar 3 filas"], ["esperar", 6000], ["resaltar", "Importación terminada", 3200]],
    },
  ],
  resumen: ["Subes tu Excel o CSV y las columnas se emparejan solas.", "Antes de importar ves qué va a pasar, fila por fila.", "Lo que tiene error no entra, y todo se puede deshacer."],
};
