// El generador de contrato (/contrato-guarderia-hotel): a partir de la plantilla general de PeluDesk, la persona
// escoge sus políticas (entrega y recogida, recogida tardía, salud, responsabilidad veterinaria, cancelación) con
// textos ya redactados, y sale el contrato con el nombre de su negocio. Hotel y guardería usan el contrato completo
// (con las variables que PeluDesk sabe llenar: así se precarga tal cual en su cuenta); estética sale como
// «condiciones del servicio» (en la app no hay contratos de estética). Sin imports de servidor.
import { cuerpoContratoPeluDesk, tituloContratoPeluDesk } from "@/lib/contratos/plantilla-peludesk";
import { CAMPOS_CONTRATO } from "@/lib/contratos/plantilla";

export type TipoContrato = "hotel" | "guarderia" | "estetica";
export const TIPOS_CONTRATO: { clave: TipoContrato; nombre: string; detalle: string }[] = [
  { clave: "hotel", nombre: "Hotel", detalle: "estancias por noche" },
  { clave: "guarderia", nombre: "Guardería", detalle: "días y paquetes" },
  { clave: "estetica", nombre: "Estética", detalle: "condiciones del servicio" },
];

export type Opcion = { clave: string; nombre: string; texto: string };
export type Politica = { clave: string; titulo: string; opciones: Opcion[]; soloPara?: TipoContrato[] };

/** Las políticas con sus opciones ya redactadas (español de México, sin jerga). `{{negocio}}` se cambia por el nombre. */
export const POLITICAS: Politica[] = [
  {
    clave: "recogida_tardia",
    titulo: "Recogida tardía",
    opciones: [
      { clave: "noche_extra", nombre: "Se cobra una noche o día más", texto: "Si el perro no se recoge dentro del horario pactado, se cobra una noche (o un día de guardería) adicional con la tarifa vigente y queda bajo resguardo hasta el siguiente horario de entrega." },
      { clave: "por_hora", nombre: "Cargo por hora", texto: "Si el perro no se recoge dentro del horario pactado, se cobra un cargo por cada hora o fracción de retraso, con la tarifa que {{negocio}} tiene publicada." },
      { clave: "tolerancia", nombre: "30 minutos de tolerancia", texto: "Hay 30 minutos de tolerancia sobre el horario pactado; después se cobra un cargo por cada hora o fracción de retraso con la tarifa publicada." },
    ],
    soloPara: ["hotel", "guarderia"],
  },
  {
    clave: "salud",
    titulo: "Salud y vacunas",
    opciones: [
      { clave: "estricto", nombre: "Sin cartilla vigente no entra", texto: "Para ingresar, el perro presenta su cartilla con vacuna antirrábica y múltiple vigentes y desparasitación de los últimos 6 meses. Sin cartilla vigente no se recibe, sin excepción. {{negocio}} puede pedir además la vacuna contra bordetella." },
      { clave: "flexible", nombre: "Entra y presenta la cartilla en 7 días", texto: "Para ingresar, el perro debe estar vacunado y desparasitado. Si EL CLIENTE no trae la cartilla el día del ingreso, se compromete a presentarla en los siguientes 7 días; si no la presenta, {{negocio}} puede suspender el servicio." },
    ],
    soloPara: ["hotel", "guarderia"],
  },
  {
    clave: "veterinaria",
    titulo: "Atención veterinaria de urgencia",
    opciones: [
      { clave: "tope", nombre: "Hasta un tope sin avisar", texto: "En una urgencia, {{negocio}} intenta localizar a EL CLIENTE y a su contacto de emergencia. Si no los localiza, autoriza atención veterinaria hasta el tope de gasto que EL CLIENTE indica en este contrato; el costo lo cubre EL CLIENTE." },
      { clave: "siempre_avisar", nombre: "Siempre se avisa antes", texto: "En una urgencia, {{negocio}} contacta a EL CLIENTE o a su contacto de emergencia antes de cualquier atención veterinaria, salvo riesgo inmediato para la vida del perro, en cuyo caso actúa primero y avisa de inmediato; el costo lo cubre EL CLIENTE." },
      { clave: "total", nombre: "Autorización total", texto: "EL CLIENTE autoriza a {{negocio}} a llevar al perro al veterinario y a aprobar la atención necesaria en cualquier urgencia, avisándole en cuanto sea posible; el costo lo cubre EL CLIENTE." },
    ],
    soloPara: ["hotel", "guarderia"],
  },
  {
    clave: "cancelacion",
    titulo: "Cancelaciones y cambios",
    opciones: [
      { clave: "24h", nombre: "Gratis con 24 horas", texto: "Una cancelación o cambio de fecha con al menos 24 horas de anticipación no tiene cargo. Con menos tiempo, o si el perro no se presenta, se cobra el servicio del primer día o noche reservado." },
      { clave: "48h", nombre: "Gratis con 48 horas", texto: "Una cancelación o cambio de fecha con al menos 48 horas de anticipación no tiene cargo. Con menos tiempo se cobra el 50 % de la reservación; si el perro no se presenta, el total del primer día o noche." },
      { clave: "libre", nombre: "Cambio de fecha sin cargo", texto: "El cambio de fecha no tiene cargo si se avisa antes de la hora de ingreso. Una cancelación el mismo día se cobra como una noche o un día de guardería." },
    ],
  },
  {
    clave: "pelo",
    titulo: "Pelo maltratado y nudos",
    opciones: [
      { clave: "recargo", nombre: "Recargo por pelo maltratado", texto: "Si el pelo llega con nudos o maltratado, el servicio tarda más y tiene un recargo que {{negocio}} informa antes de empezar. Si los nudos no se pueden deshacer sin lastimar al perro, se rapan esas zonas, avisando a EL CLIENTE." },
      { clave: "rapar", nombre: "Se rapa si hace falta, sin recargo", texto: "Si el pelo llega con nudos que no se pueden deshacer sin lastimar al perro, {{negocio}} rapa esas zonas y avisa a EL CLIENTE; el precio del servicio no cambia." },
    ],
    soloPara: ["estetica"],
  },
  {
    clave: "parasitos",
    titulo: "Pulgas y garrapatas",
    opciones: [
      { clave: "bano_obligatorio", nombre: "Baño antiparasitario con cargo", texto: "Si el perro llega con pulgas o garrapatas, se le aplica un baño antiparasitario con cargo adicional para proteger a los demás perros, y se avisa a EL CLIENTE." },
      { clave: "no_se_recibe", nombre: "No se recibe", texto: "Si el perro llega con pulgas o garrapatas no se recibe ese día; se reagenda cuando el tratamiento haya hecho efecto." },
    ],
    soloPara: ["estetica"],
  },
  {
    clave: "entrega_estetica",
    titulo: "Entrega y espera",
    opciones: [
      { clave: "aviso", nombre: "Se avisa cuando está listo", texto: "{{negocio}} avisa a EL CLIENTE cuando el perro está listo. Si no se recoge dentro de la siguiente hora se cobra una cuota de espera por cada hora o fracción." },
      { clave: "misma_hora", nombre: "Se recoge a la hora acordada", texto: "El perro se recoge a la hora acordada al entregarlo. Si no se recoge en los 30 minutos siguientes se cobra una cuota de espera por cada hora o fracción." },
    ],
    soloPara: ["estetica"],
  },
];

export type DatosContrato = {
  tipo: TipoContrato;
  negocio: string;
  ciudad: string;
  horario: string;
  elecciones: Record<string, string>;
};

export const politicasDe = (tipo: TipoContrato) => POLITICAS.filter((p) => !p.soloPara || p.soloPara.includes(tipo));

export const eleccionesPorOmision = (tipo: TipoContrato): Record<string, string> => Object.fromEntries(politicasDe(tipo).map((p) => [p.clave, p.opciones[0].clave]));

function textoDe(p: Politica, clave: string | undefined, negocio: string): string {
  const o = p.opciones.find((x) => x.clave === clave) ?? p.opciones[0];
  return o.texto.replace(/\{\{negocio\}\}/g, negocio || "EL NEGOCIO");
}

export function tituloContrato(d: DatosContrato): string {
  const n = d.negocio.trim() || "Mi negocio";
  return d.tipo === "estetica" ? `Condiciones del servicio de estética — ${n}` : tituloContratoPeluDesk(n);
}

/**
 * El cuerpo: hotel y guardería parten de la plantilla general de PeluDesk y le cambian las cláusulas de entrega,
 * salud, atención veterinaria y cancelación por las elegidas (las variables {{…}} se conservan: PeluDesk las llena
 * al firmar). Estética es un texto propio, corto, sin variables de hotel.
 */
export function cuerpoContrato(d: DatosContrato): string {
  const n = d.negocio.trim() || "EL NEGOCIO";
  const pol = (clave: string) => {
    const p = POLITICAS.find((x) => x.clave === clave)!;
    return textoDe(p, d.elecciones[clave], n);
  };
  const horario = d.horario.trim() ? ` Horario de entrega y recogida: ${d.horario.trim()}.` : "";
  if (d.tipo === "estetica") {
    return `CONDICIONES DEL SERVICIO DE ESTÉTICA CANINA

${n}${d.ciudad ? ` (${d.ciudad.trim()})` : ""} presta servicios de baño, corte y arreglo para perros con estas condiciones, que EL CLIENTE acepta al dejar a su perro.

1. Entrega y espera
${pol("entrega_estetica")}${horario}

2. Pelo maltratado y nudos
${pol("pelo")}

3. Pulgas y garrapatas
${pol("parasitos")}

4. Salud y conducta
EL CLIENTE informa cualquier enfermedad, alergia, herida, medicamento o conducta relevante antes del servicio. Un perro agresivo o con mucha ansiedad puede necesitar un servicio más corto o no poder atenderse; ${n} lo avisa y no cobra lo que no hizo. Si durante el servicio el perro se lastima o presenta una reacción, ${n} avisa de inmediato a EL CLIENTE y procura atención veterinaria si hace falta.

5. Productos
Se usan productos para perros. Si EL CLIENTE trae su propio shampoo o medicamento, lo indica al entregar y se usa bajo su responsabilidad.

6. Precios y cambios
El precio depende del tamaño del perro, el tipo de pelo y su estado; cualquier recargo se informa antes de empezar. El servicio se paga al recoger al perro.

7. Cancelaciones y cambios
${pol("cancelacion")}

8. Imagen
${n} puede tomar fotos del perro durante el servicio para mostrárselas a EL CLIENTE. Para publicarlas en redes sociales pide su autorización, que se puede negar o retirar sin afectar el servicio.

Fecha: ____________________
EL CLIENTE: ______________________________  Firma: ____________________`;
  }

  const hotel = d.tipo === "hotel";
  let cuerpo = cuerpoContratoPeluDesk(n);
  cuerpo = cuerpo.replace("CONTRATO DE PRESTACIÓN DE SERVICIOS DE HOTEL Y GUARDERÍA CANINA", hotel ? "CONTRATO DE PRESTACIÓN DE SERVICIOS DE HOTEL CANINO" : "CONTRATO DE PRESTACIÓN DE SERVICIOS DE GUARDERÍA CANINA");
  cuerpo = cuerpo.replace(
    /3\. Entrega y recogida\n[^\n]+/,
    `3. Entrega y recogida\nEL CLIENTE entrega y recoge al perro dentro de los días y horarios que EL NEGOCIO le informa.${horario} ${pol("recogida_tardia")}`
  );
  cuerpo = cuerpo.replace(/5\. Salud, vacunas y medicamentos\n[^\n]+/, `5. Salud, vacunas y medicamentos\n${pol("salud")} EL NEGOCIO puede no recibirlo, aislarlo o pedir que lo recojan si presenta síntomas que pongan en riesgo su bienestar o el de otros perros. Los medicamentos se entregan en su envase original, con instrucciones por escrito.`);
  cuerpo = cuerpo.replace(/6\. Atención veterinaria\n[^\n]+/, `6. Atención veterinaria\n${pol("veterinaria")}`);
  cuerpo = cuerpo.replace(/12\. Cancelación y terminación\n[^\n]+/, `12. Cancelación y terminación\n${pol("cancelacion")} EL NEGOCIO puede suspender o terminar el servicio por riesgo sanitario, conducta peligrosa, información falsa, falta de pago o causa de fuerza mayor. Ninguna cláusula se interpreta en contra de los derechos irrenunciables del consumidor.`);
  return cuerpo;
}

/** El texto para el PDF público: cada {{variable}} se vuelve su etiqueta con una línea para llenar a mano. */
export function cuerpoParaPdf(cuerpo: string): string {
  const etiqueta = Object.fromEntries(CAMPOS_CONTRATO.map((c) => [c.clave, c.etiqueta]));
  return cuerpo.replace(/\{\{([a-z_]+)\}\}/g, (_, clave: string) => (etiqueta[clave] ? "______________________" : `{{${clave}}}`));
}

/** Resumen de una línea para el mensaje de WhatsApp. */
export function resumenContrato(d: DatosContrato): string {
  const partes = politicasDe(d.tipo).map((p) => `${p.titulo.toLowerCase()}: ${(p.opciones.find((o) => o.clave === d.elecciones[p.clave]) ?? p.opciones[0]).nombre.toLowerCase()}`);
  return `Tu ${d.tipo === "estetica" ? "hoja de condiciones de estética" : `contrato de ${d.tipo === "hotel" ? "hotel" : "guardería"}`} para ${d.negocio.trim() || "tu negocio"} con ${partes.join("; ")}.`;
}
