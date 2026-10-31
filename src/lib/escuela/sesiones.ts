// La Escuela PeluDesk: las seis primeras sesiones, su guía escrita y la herramienta de su tema. Las fechas, la liga en
// vivo y la grabación viven en la base (escuela_sesiones, las edita /plataforma/escuela). Sin imports de servidor.
export type Sesion = {
  clave: string;
  titulo: string;
  resumen: string;
  herramienta: { ruta: string; nombre: string };
  /** La guía escrita: párrafos y listas (una lista es un arreglo). */
  guia: (string | string[])[];
};

export const SESIONES: Sesion[] = [
  {
    clave: "cuanto-cobrar",
    titulo: "Cuánto cobrar",
    resumen: "Cómo poner precio a un baño, una noche o una consulta sin copiar al de enfrente ni regalar el trabajo.",
    herramienta: { ruta: "/precios-mercado", nombre: "Índice PeluDesk de precios" },
    guia: [
      "Un precio tiene dos pisos: lo que te cuesta dar el servicio y lo que cobra tu ciudad. Si estás abajo del primero pierdes dinero en cada cita; si estás muy arriba del segundo necesitas que el cliente note por qué.",
      "Empieza por el costo: minutos de trabajo, shampoo y agua por tamaño, luz, la parte de renta que le toca a cada servicio. Súmale lo que quieres ganar tú por hora. Ese es tu piso.",
      "Luego mira el rango de tu ciudad en el índice: la mitad de los negocios cobra entre el 25 % y el 75 %. Dentro de ese rango nadie se asusta; arriba del 75 % necesitas una razón que el cliente vea (local, trato, resultado, fotos).",
      ["Cobra por tamaño y tipo de pelo, no un precio único: el grande con nudos cuesta el doble de tiempo.", "Pon el recargo por pelo maltratado por escrito antes de empezar.", "Sube precios una vez al año, avisando un mes antes, y no a todos los clientes el mismo día."],
      "Lo que no sirve: copiar el precio del de enfrente sin saber sus costos, dar descuento al primero que regatea, y cobrar lo mismo a quien llega cada quince días que a quien viene una vez al año (al frecuente se le cuida con un paquete, no con un precio más bajo por servicio).",
      "Tarea: pon tu precio actual en el índice y mira dónde queda. Si está abajo del 25 % y tienes la agenda llena, estás regalando.",
    ],
  },
  {
    clave: "plantones-y-agenda-vacia",
    titulo: "Plantones y agenda vacía",
    resumen: "Por qué se caen las citas, qué recupera un recordatorio con confirmación y cómo llenar los huecos de la semana.",
    herramienta: { ruta: "/mensajes-whatsapp", nombre: "Mensajes de WhatsApp" },
    guia: [
      "Una cita que se cae no es solo el dinero de esa cita: es la hora de la estilista parada, el shampoo que no se usó y el cliente que sí quería ese horario y no lo tuvo.",
      "La mayoría de los plantones no son mala fe: la persona se le olvidó. Un recordatorio el día anterior con un botón de «Confirmo» recupera buena parte; el que no confirma te da tiempo de ofrecer el lugar a otro.",
      ["Recordatorio el día anterior, no el mismo día.", "Con botón de confirmar y otro de cambiar: que no tenga que escribir.", "Si no confirma a las 8 de la noche, mensaje corto: «¿Sigue en pie?».", "Tres plantones seguidos: la siguiente cita con anticipo."],
      "La agenda vacía se llena con el cliente que ya te conoce, no con uno nuevo: el aviso de vacuna, el «hace un mes que no vemos a Rocky» y el recordatorio de la siguiente cita al salir de la actual.",
      "Tarea: cuenta tus plantones de la semana pasada y multiplícalos por tu precio promedio. Ese número al mes es lo que está en juego.",
    ],
  },
  {
    clave: "cuanto-cuesta-abrir",
    titulo: "Cuánto cuesta abrir",
    resumen: "Renta, equipo, insumos y el primer mes sin clientes: la cuenta completa antes de firmar un contrato de local.",
    herramienta: { ruta: "/mapa-competencia", nombre: "Mapa de competencia" },
    guia: [
      "Antes del local, el mapa: cuántos negocios de tu giro hay a 2 km y cómo están calificados. Una zona sin competencia puede ser una zona sin clientes; una zona con cinco estéticas bien calificadas te obliga a ser mejor desde el día uno.",
      "La cuenta de abrir tiene cuatro cajones: lo de una sola vez (depósito, adecuaciones, equipo, permisos), lo del primer mes (renta, luz, agua, insumos iniciales), la nómina que vas a pagar aunque no haya clientes, y un colchón de tres meses porque el primer mes casi nunca sale parejo.",
      ["Equipo que no puede faltar y equipo que puede esperar: una buena mesa y una secadora decente antes que el letrero luminoso.", "Insumos: compra para un mes, no para seis; aprende primero cuánto gastas por servicio.", "Permisos y aviso de funcionamiento según tu municipio y giro: pregunta antes, no después."],
      "El primer mes se llena con los vecinos: la página web con cita en línea, el letrero con el WhatsApp y el precio de un servicio de entrada que no te deje en pérdida.",
      "Tarea: haz tu mapa de competencia y la lista de los cuatro cajones con números reales de tu ciudad.",
    ],
  },
  {
    clave: "caja-sin-sorpresas",
    titulo: "Caja sin sorpresas",
    resumen: "Cómo cerrar la caja todos los días en minutos y que cuadre: fondo, turno, cobros, retiros y arqueo.",
    herramienta: { ruta: "/diagnostico", nombre: "Diagnóstico de rentabilidad" },
    guia: [
      "La caja que no cuadra casi nunca es robo: son cobros que no se anotaron, cambios mal dados y cuentas que se quedaron «luego te pago».",
      "La regla es una: cada peso que entra o sale se registra en el momento, por quien lo movió. El cierre del día no es para descubrir qué pasó: es para confirmar que todo cuadra.",
      ["Abre el turno con un fondo contado.", "Cada cobro con su método: efectivo, transferencia, tarjeta.", "Los retiros, con motivo y firma.", "Al cerrar, cuenta sin ver lo esperado (corte ciego) y compara después."],
      "Si cerrar te toma más de media hora, el problema no es la caja, es cómo se registra durante el día.",
      "Tarea: haz el diagnóstico y mira cuánto te sale la fuga de caja al mes con tus números.",
    ],
  },
  {
    clave: "clientes-que-vuelven",
    titulo: "Clientes que vuelven",
    resumen: "Lo que hace que un cliente regrese sin que lo persigas: expediente, portal, avisos a tiempo y un buen cierre de visita.",
    herramienta: { ruta: "/mensajes-whatsapp", nombre: "Mensajes de WhatsApp" },
    guia: [
      "Conseguir un cliente nuevo cuesta publicidad y tiempo; que vuelva uno que ya te conoce cuesta un mensaje a tiempo.",
      "El cliente vuelve cuando siente que conoces a su mascota: su nombre, lo que no le gusta, su última vacuna. Eso no se guarda en la memoria: se guarda en un expediente que todo el equipo ve.",
      ["Al terminar la visita, deja agendada la siguiente o di cuándo toca.", "Aviso de vacuna o de siguiente corte cuando corresponde, no cuando te acuerdas.", "Un portal donde el dueño ve el carnet, las fotos y sus citas: deja de pedirte todo por WhatsApp.", "Pide la reseña al día siguiente, cuando todavía está contento."],
      "Mide una sola cosa: de cada 10 clientes nuevos del mes, cuántos regresan en 60 días. Si son menos de 7, el problema está en el cierre de la visita, no en la publicidad.",
      "Tarea: manda hoy un mensaje a cinco clientes que no han vuelto en tres meses. Usa la plantilla «Cliente que no ha vuelto».",
    ],
  },
  {
    clave: "lo-que-te-van-a-pedir",
    titulo: "Lo que te van a pedir",
    resumen: "Contrato, cartilla de vacunas, factura, aviso de privacidad: lo que tarde o temprano te pide un cliente, una autoridad o un accidente.",
    herramienta: { ruta: "/contrato-guarderia-hotel", nombre: "Generador de contrato" },
    guia: [
      "El día tranquilo nadie pide nada. El día del problema (un perro que se escapa, una mordida, una urgencia) te piden el contrato, la cartilla y el contacto de emergencia, y ya no es momento de armarlos.",
      ["Contrato o responsiva firmada antes del primer servicio, con las políticas por escrito.", "Cartilla de vacunas vigente antes de entrar a guardería u hotel.", "Contacto de emergencia y autorización veterinaria con tope de gasto.", "Factura: un cliente que la pide y no se la puedes dar no vuelve.", "Aviso de privacidad por los datos que guardas de tus clientes."],
      "Nada de esto es para desconfiar del cliente: es para que los dos sepan qué pasa cuando algo sale mal, y para que tú no cargues solo con la decisión en una urgencia.",
      "Tarea: arma tu contrato con el generador, imprime uno y léelo como si fueras el cliente. Lo que no entiendas, cámbialo.",
    ],
  },
];

export const sesionPorClave = (clave: string) => SESIONES.find((s) => s.clave === clave) ?? null;

/** El texto con el que la persona se inscribe por WhatsApp (el webhook lo reconoce por la clave). */
export const textoInscripcion = (s: Sesion) => `Quiero inscribirme a la Escuela PeluDesk: ${s.titulo} (${s.clave})`;
export const PATRON_INSCRIPCION = /inscribirme a la Escuela PeluDesk:?\s*.*?\(([a-z0-9-]{3,60})\)/i;

export function fechaEnTexto(iso: string | null | undefined, zona = "America/Mexico_City"): string | null {
  if (!iso) return null;
  const f = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: zona }).format(new Date(iso));
  return `${f} (hora del centro de México)`;
}
