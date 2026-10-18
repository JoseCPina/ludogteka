/**
 * Lo que la landing (peludesk.mx) y /veterinaria dicen de Veterinaria y de los tres módulos. Solo funciones que
 * la app hace (src/lib/whatsapp/conocimiento.ts es la fuente de verdad): si una función cambia, se cambia aquí.
 * Sin cifras de clientes, sin testimonios, sin sellos, sin nombrar a nadie más, y sin precios (esos viven en la base).
 */
export const MODULOS_TRES = [
  {
    clave: "guarderia-hotel",
    nombre: "Hotel y guardería",
    texto: "Reservas con cupo de toda la casa, check-in y check-out con cuenta, pases y mensualidades, contratos firmados desde el celular y vacunas al día.",
  },
  {
    clave: "estetica",
    nombre: "Estética",
    texto: "Agenda por estilista, precios por raza y pelaje, comisiones y propinas por persona, y la ficha de cada perro a la mano.",
  },
  {
    clave: "veterinaria",
    nombre: "Veterinaria",
    texto: "Expediente por consulta, carnet de vacunas, hospitalización, recetas, inventario con lotes y cotizaciones que el dueño firma desde su celular.",
    href: "/veterinaria",
  },
] as const;

export const FUNCIONES_VET: readonly { titulo: string; texto: string }[] = [
  { titulo: "Expediente por consulta, con dictado", texto: "La médica dicta, PeluDesk arma el borrador de la consulta y ella lo revisa y lo firma. Una consulta firmada ya no se edita: se le agrega una adenda." },
  { titulo: "Carnet de vacunas con QR", texto: "Vacunas y desparasitaciones con su lote y su próxima dosis. El dueño enseña un carnet que se verifica con un código QR, sin ver nada clínico." },
  { titulo: "Recordatorios por WhatsApp", texto: "Avisa al dueño que ya toca la dosis con un mensaje automático. Si el mensaje no llega, te lo marca en «Necesita atención» para que lo mandes tú." },
  { titulo: "Hospitalización con hoja de medicación", texto: "Ingreso, dosis programadas que se marcan al aplicarlas, monitoreo de signos y una cuenta abierta que se cobra al dar el alta." },
  { titulo: "Recetas y registro espejo del SITPV", texto: "Receta simple con los campos de la NOM-064 y registro espejo de las recetas del SITPV de SENASICA, con su libro de control. Un controlado no sale del inventario sin su receta." },
  { titulo: "Inventario con lotes y caducidades", texto: "Cada medicamento por lote, con aviso de caducidad. Se surte primero lo que caduca antes y cada salida queda ligada a la mascota." },
  { titulo: "Cotizaciones que se firman por link", texto: "Mandas la cotización por WhatsApp, el dueño lo acepta y firma desde su celular, y lo aceptado pasa a la cuenta para cobrarlo en Caja." },
  { titulo: "Teleconsulta por link", texto: "Videollamada que se abre desde el navegador, sin instalar nada, con el consentimiento firmado antes de entrar." },
  { titulo: "Factura CFDI desde el cobro", texto: "Facturas desde la misma cuenta que cobras, con tu proveedor autorizado de timbrado y sin capturar el cobro dos veces." },
];

export const CAPTURAS_VET: readonly { captura: string; titulo: string; texto: string; alt: string }[] = [
  { captura: "vet-expediente", titulo: "Todo lo de la mascota, en una línea de tiempo", texto: "Consultas, peso, vacunas, estudios y archivos, en orden. Quien abre el expediente queda registrado.", alt: "Expediente clínico de una perrita con su línea de tiempo: consulta, peso y vacunas." },
  { captura: "vet-agenda", titulo: "Agenda clínica por médico", texto: "Consulta, vacuna, cirugía, seguimiento o urgencia. No empalma dos citas del mismo médico, salvo una urgencia.", alt: "Agenda clínica del día con una cita de consulta y sus botones." },
  { captura: "vet-carnet", titulo: "Carnet de vacunas con lote y próxima dosis", texto: "Lo imprimes o lo mandas. Lo que el dueño ve no trae notas, médico ni lote.", alt: "Carnet de vacunación de una perrita con sus vacunas aplicadas." },
  { captura: "vet-receta", titulo: "Recetas con los campos que pide la norma", texto: "Original y copias, con la huella de lo emitido. Una receta firmada no se edita: se anula con motivo.", alt: "Receta veterinaria emitida con su diagnóstico y su medicamento." },
];

export const MENSAJES_CLAVE = [
  "Facturas CFDI dentro del sistema",
  "WhatsApp automático para recordatorios",
  "Recetas alineadas al SITPV de SENASICA",
  "Funciona en el celular y se instala como app",
  "Importa tus clientes y mascotas desde Excel",
  "Contratos, pases, turnos de caja y comisiones",
] as const;

export const PREGUNTAS_VET: readonly (readonly [string, string])[] = [
  ["¿PeluDesk sustituye al SITPV de SENASICA?", "No. El SITPV sigue siendo donde se emiten las recetas cuantificadas. PeluDesk guarda un registro espejo con el folio de cada médico, te lleva el libro de control y te recuerda el reporte mensual."],
  ["¿El dictado firma por el médico?", "No. El dictado arma un borrador de la consulta y el médico lo revisa, lo corrige y lo firma. Nada se firma solo."],
  ["¿Funciona en el celular?", "Sí. Se usa desde el navegador y se puede instalar como app. Sin conexión solo se consulta: nada se guarda hasta que haya señal."],
  ["¿Puedo pasar mis clientes y mascotas de Excel?", "Sí. Subes tu archivo, revisas qué se va a importar y, si algo no te gusta, deshaces la importación."],
  ["¿Cómo facturo?", "Desde el cobro. Conectas tu cuenta con un proveedor autorizado de timbrado y emites la factura CFDI 4.0 de esa misma cuenta."],
  ["¿Tengo que usar los tres módulos?", "No. Hotel y guardería, Estética y Veterinaria se prenden o se apagan desde el panel de administración. Apagar un módulo nunca borra lo que ya tenías."],
  ["¿Puedo verlo antes de registrarme?", "Sí. Abre el demo sin registrarte: es un negocio de ejemplo con clientes, expedientes, vacunas y recetas, y puedes entrar a cualquier pantalla."],
];

export const DESCRIPCION_VET =
  "Software para veterinarias: expediente por consulta con dictado, carnet de vacunas con QR, recetas con registro espejo del SITPV e inventario con lotes. 15 días gratis.";
