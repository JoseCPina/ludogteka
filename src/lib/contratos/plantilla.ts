/**
 * De la plantilla de contrato al texto que va al PDF, en un solo lugar
 * (vista previa, firma en el portal y vista previa de la pantalla de
 * plantillas usan esto).
 *
 * El caso que lo motivó (contrato de Ronith, 23 de septiembre de 2026): la
 * plantilla del «Contrato general» se pegó desde una tabla (Excel/Word) y
 * trajo sus artefactos —cada celda entre comillas rectas, tabuladores entre
 * celdas, y la línea de firma, el nombre y "EL CLIENTE" pegados en un solo
 * renglón—; además traía {{Contacto de emergencia:}} (la etiqueta, no el
 * nombre de variable) y renglones "Teléfono: ______" que nadie llenaba.
 *
 * No se corrige la plantilla guardada (los contratos firmados conservan su
 * texto y la plantilla es del negocio); se hace tolerante el render:
 *   1. limpiarPlantilla: comillas y tabuladores de celda, y lo pegado.
 *   2. Variables tolerantes: mayúsculas, acentos, espacios, dos puntos y
 *      nombres "humanos" ({{Contacto de emergencia:}}) se reconocen.
 *   3. Rayitas con etiqueta conocida ("Teléfono: ____") se llenan con el
 *      dato del expediente.
 * Y la pantalla de plantillas avisa, antes de publicar, qué variables no
 * sabe llenar (variablesDesconocidas).
 */

export type CampoContrato = {
  clave: string;
  etiqueta: string;
  // Otras formas en que el negocio lo podría escribir (sin acentos, en
  // minúsculas): {{Nombre del cliente}}, "Teléfono: ____", etc.
  alias: string[];
  ejemplo: string;
  soloPaquete?: boolean;
};

export const CAMPOS_CONTRATO: CampoContrato[] = [
  { clave: "cliente_nombre", etiqueta: "Nombre del cliente", alias: ["nombre del cliente", "cliente", "nombre del dueno", "dueno", "propietario"], ejemplo: "Ana García López" },
  { clave: "cliente_telefono", etiqueta: "Teléfono del cliente", alias: ["telefono del cliente", "telefono cliente", "celular"], ejemplo: "444 123 4567" },
  { clave: "cliente_email", etiqueta: "Correo del cliente", alias: ["correo", "correo del cliente", "email", "correo electronico"], ejemplo: "ana@ejemplo.com" },
  { clave: "cliente_rfc", etiqueta: "RFC del cliente", alias: ["rfc"], ejemplo: "GALA800101ABC" },
  { clave: "perro_nombre", etiqueta: "Nombre del perro", alias: ["nombre del perro", "perro", "mascota", "nombre de la mascota"], ejemplo: "Motita" },
  { clave: "perro_raza", etiqueta: "Raza", alias: ["raza", "raza del perro"], ejemplo: "Schnauzer" },
  { clave: "perro_sexo", etiqueta: "Sexo", alias: ["sexo", "sexo del perro"], ejemplo: "Hembra" },
  { clave: "perro_fecha_nacimiento", etiqueta: "Fecha de nacimiento", alias: ["fecha de nacimiento", "nacimiento"], ejemplo: "15/03/2022" },
  { clave: "perro_tamano", etiqueta: "Talla", alias: ["talla", "tamano", "tamano del perro"], ejemplo: "Mediano" },
  { clave: "autorizacion_medica_notas", etiqueta: "Autorización médica", alias: ["autorizacion medica"], ejemplo: "Puede recibir antiinflamatorio si lo indica el veterinario" },
  { clave: "tope_gasto_autorizado", etiqueta: "Tope de gasto autorizado", alias: ["tope de gasto", "tope de gasto autorizado"], ejemplo: "$2,000.00" },
  { clave: "consentimiento_imagen", etiqueta: "Consentimiento de imagen", alias: ["consentimiento de imagen", "autorizacion de imagen"], ejemplo: "Sí autoriza" },
  { clave: "servicios_disponibles", etiqueta: "Servicios disponibles", alias: ["servicios", "servicios disponibles"], ejemplo: "Guardería, Hotel, Baño estético" },
  { clave: "fecha_firma", etiqueta: "Fecha de firma", alias: ["fecha", "fecha de firma"], ejemplo: "23/09/2026" },
  { clave: "horario_guarderia", etiqueta: "Horario de guardería", alias: ["horario", "horario de guarderia"], ejemplo: "lunes a viernes de 9:00 a 19:00 y sábado de 10:00 a 14:00" },
  { clave: "contacto_emergencia", etiqueta: "Contacto de emergencia (nombre y teléfono)", alias: ["contacto y telefono de emergencia"], ejemplo: "Luis García, tel. 444 765 4321" },
  { clave: "contacto_emergencia_nombre", etiqueta: "Contacto de emergencia", alias: ["contacto de emergencia", "contacto emergencia", "persona de emergencia"], ejemplo: "Luis García" },
  { clave: "contacto_emergencia_telefono", etiqueta: "Teléfono de emergencia", alias: ["telefono de emergencia", "telefono del contacto de emergencia", "telefono del contacto"], ejemplo: "444 765 4321" },
  { clave: "observaciones_ingreso", etiqueta: "Observaciones de ingreso", alias: ["observaciones de ingreso", "observaciones de ingreso / inventario", "observaciones de ingreso inventario", "observaciones"], ejemplo: "Alimentación: croquetas 2 veces al día · Alergias: pollo (grave)" },
  { clave: "paquete_guarderia", etiqueta: "Paquete de guardería", alias: ["paquete", "paquete de guarderia"], ejemplo: "Day pass — 10 pases", soloPaquete: true },
  { clave: "numero_day_pass", etiqueta: "Número de day pass", alias: ["numero de day pass", "day pass", "numero de pases"], ejemplo: "10", soloPaquete: true },
  { clave: "vigencia_inicio", etiqueta: "Inicio de vigencia", alias: ["inicio de vigencia", "vigencia desde"], ejemplo: "23/09/2026", soloPaquete: true },
  { clave: "vigencia_fin", etiqueta: "Fin de vigencia", alias: ["fin de vigencia", "vigencia hasta"], ejemplo: "23/10/2026", soloPaquete: true },
];

export function camposDeEjemplo(): Record<string, string> {
  return Object.fromEntries(CAMPOS_CONTRATO.map((c) => [c.clave, c.ejemplo]));
}

// "Contacto de emergencia:" → "contacto de emergencia"
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/[:.,;*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// El nombre exacto de una variable siempre gana sobre una etiqueta o un
// alias: "contacto_emergencia" es el campo con nombre y teléfono, aunque
// "contacto emergencia" también sea alias del que solo trae el nombre.
const CLAVES = new Set(CAMPOS_CONTRATO.map((c) => c.clave));
const POR_NOMBRE = new Map<string, string>();
for (const c of CAMPOS_CONTRATO) POR_NOMBRE.set(normalizar(c.clave), c.clave);
for (const c of CAMPOS_CONTRATO) {
  for (const nombre of [c.etiqueta, ...c.alias]) {
    const n = normalizar(nombre);
    if (!POR_NOMBRE.has(n)) POR_NOMBRE.set(n, c.clave);
  }
}

/** A qué campo se refiere lo que venga entre llaves, o null si a ninguno. */
export function claveDeVariable(adentro: string): string | null {
  if (CLAVES.has(adentro.trim())) return adentro.trim();
  return POR_NOMBRE.get(normalizar(adentro)) ?? null;
}

/** Artefactos de copiar y pegar desde una tabla, y renglones pegados. */
export function limpiarPlantilla(texto: string): string {
  let t = texto.replace(/\r\n?/g, "\n");
  // Separador de celdas de Excel: comilla, tabulador(es), comilla.
  t = t.replace(/"\t+"/g, "\n");
  t = t
    .split("\n")
    .map((linea) =>
      linea
        // Comilla recta de celda al inicio y al final del renglón (las
        // comillas del contrato de verdad son tipográficas “ ” y se quedan).
        .replace(/^[\s"]*"/, "")
        .replace(/"[\s"]*$/, "")
        .replace(/\t+/g, " ")
        .replace(/\s+$/, "")
    )
    .join("\n");
  // Línea de firma pegada a lo que va debajo: "_____Nombre" → "_____\nNombre".
  t = t.replace(/(_{5,})(?=[^\s_:])/g, "$1\n");
  // Una variable pegada a una palabra: "{{cliente_nombre}}EL CLIENTE".
  t = t.replace(/\}\}(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/g, "}}\n");
  // Más de dos renglones vacíos seguidos no dicen nada.
  return t.replace(/\n{3,}/g, "\n\n");
}

/** Variables que aparecen en el texto y que el sistema no sabe llenar. */
export function variablesDesconocidas(texto: string): string[] {
  const vistas = new Set<string>();
  for (const m of texto.matchAll(/\{\{([^{}]*)\}\}/g)) {
    if (!claveDeVariable(m[1])) vistas.add(`{{${m[1]}}}`);
  }
  return [...vistas];
}

/** Variables que el sistema sí reconoce aunque estén escritas "a mano". */
export function variablesToleradas(texto: string): { escrito: string; clave: string }[] {
  const salida = new Map<string, string>();
  for (const m of texto.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const clave = claveDeVariable(m[1]);
    if (clave && m[1] !== clave) salida.set(`{{${m[1]}}}`, clave);
  }
  return [...salida].map(([escrito, clave]) => ({ escrito, clave }));
}

/**
 * La plantilla lista para el PDF: limpia, con variables resueltas y las
 * rayitas con etiqueta conocida llenas.
 */
export function resolverPlantilla(texto: string, campos: Record<string, string>): string {
  const limpio = limpiarPlantilla(texto);

  // {{variable}}, tolerante. Si lo de adentro es una etiqueta con dos puntos
  // ({{Contacto de emergencia:}}) se deja la etiqueta: "Contacto de
  // emergencia:" y el paso de rayitas pone el dato.
  const conVariables = limpio.replace(/\{\{([^{}]*)\}\}/g, (original, adentro: string) => {
    const clave = claveDeVariable(adentro);
    if (!clave) return original;
    if (/:\s*$/.test(adentro)) return adentro.trim();
    return Object.prototype.hasOwnProperty.call(campos, clave) ? campos[clave] : original;
  });

  // "Etiqueta: ______" → "Etiqueta: dato". "Teléfono" a secas junto a un
  // contacto de emergencia es el teléfono de ese contacto.
  const lineas = conVariables.split("\n");
  let enEmergencia = false;
  return lineas
    .map((linea) => {
      const m = linea.match(/^(\s*)([^:_\n]{2,80}?):\s*_{3,}\s*$/);
      if (!m) {
        if (linea.trim()) enEmergencia = /emergencia/i.test(linea);
        return linea;
      }
      const etiqueta = m[2];
      let clave = claveDeVariable(etiqueta);
      const norm = normalizar(etiqueta);
      if (norm === "telefono") clave = enEmergencia ? "contacto_emergencia_telefono" : "cliente_telefono";
      enEmergencia = /emergencia/i.test(etiqueta) || (enEmergencia && norm === "telefono");
      // Sin el dato en el expediente, la rayita se queda para llenarse a mano.
      if (!clave || !campos[clave] || /^(no registrad|sin observaciones)/i.test(campos[clave])) return linea;
      return `${m[1]}${etiqueta}: ${campos[clave]}`;
    })
    .join("\n");
}
