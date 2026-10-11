import type { Articulo } from "../tipos";

/**
 * Veterinaria, Fase 5: dictado por voz en la consulta y teleconsulta. Cada botón y cada ruta que se
 * nombra aquí existe tal cual en la app: si cambia la pantalla, cambia su artículo en el mismo cambio.
 */
export const ARTICULOS_VETERINARIA_FASE5: Articulo[] = [
  {
    slug: "dictar-la-consulta",
    titulo: "Cómo dictar una consulta por voz",
    resumen: "Hablas, PeluDesk arma un borrador de la consulta y tú lo revisas y lo firmas; el audio no se guarda.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/consulta"],
    palabras: ["dictado", "voz", "micrófono", "grabar", "transcribir", "SOAP", "IA", "borrador", "minutos", "diagnóstico sugerido"],
    cuerpo: `El dictado está dentro de la consulta, en la tarjeta **Dictado por voz**. Lo puede usar un médico veterinario designado, un admin o quien tenga el permiso **Usar dictado**.

## Dictar

1. Abre la consulta en borrador y aprieta **Dictar**.
2. Lee el aviso y marca **Ya le avisé al dueño que voy a grabar mi dictado de esta consulta**. Sin esa casilla no empieza.
3. Habla como le hablarías a un colega: motivo, lo que cuenta el dueño, examen físico, hallazgos y plan.
4. Termina y espera unos segundos. Aparece el **Borrador hecho con IA** con los textos de cada sección, los signos vitales que dictaste y los **diagnósticos sugeridos del catálogo**.
5. Revisa cada parte, marca lo que quieres y aprieta **Pasar al expediente**: lo que ya tenías escrito no se pierde, el dictado se agrega al final. Después corriges y firmas como siempre.

> Nada se firma solo. Es un borrador: tú lo revisas y tú firmas con tu cédula.

## Qué pasa con el audio

- Se manda a servicios de terceros: ElevenLabs lo convierte en texto y Anthropic (Claude) ordena el texto en un borrador.
- Por omisión **el audio se borra en cuanto se transcribe** y la transcripción no se guarda: solo la ves en pantalla ahí mismo (**Ver la transcripción**).
- Si el negocio eligió conservar el audio 30 días, queda ligado a la consulta y el aviso lo dice antes de grabar. Eso se cambia en [Ajustes de Veterinaria](/veterinaria/ajustes), en **Dictado por voz**.

## Los minutos del mes

Cada negocio tiene un tope de minutos de dictado al mes. La consulta muestra cuántos llevas y avisa al acercarse. Al llegar al tope el dictado se detiene; puedes seguir escribiendo la consulta a mano. PeluDesk puede ampliar el tope de un negocio.

## Si algo falla

Si el micrófono no abre, revisa el permiso del navegador. Si el borrador no se armó, la transcripción queda en pantalla para que la copies. Cada dictado queda en el registro de uso de la consulta.`,
  },
  {
    slug: "agendar-y-atender-una-teleconsulta",
    titulo: "Cómo agendar y atender una teleconsulta",
    resumen: "Agendas una cita de Teleconsulta, le mandas la liga al dueño, entra a la sala y documentas la consulta.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/teleconsulta", "/veterinaria/agenda"],
    palabras: ["teleconsulta", "videollamada", "telemedicina", "video", "sala", "liga", "consentimiento", "pago anticipado", "a distancia"],
    cuerpo: `Una teleconsulta es una consulta por videollamada, desde el celular del dueño, sin instalar nada.

## Agendarla

1. En la [Agenda clínica](/veterinaria/agenda) aprieta **Agendar** y elige el tipo **Teleconsulta**.
2. Elige mascota, médico, fecha y hora.
3. Al guardar se crea la sala y te lleva a la pantalla de la teleconsulta.

## Mandarle la liga al dueño

1. Aprieta **Generar liga para el dueño**.
2. Cópiala, mándala con **Enviar por WhatsApp** (mensaje aprobado de PeluDesk) o con **Abrir en WhatsApp** para mandarla tú.
3. Una liga nueva deja sin efecto la anterior.

En esa liga el dueño ve la fecha, **firma el consentimiento de teleconsulta** y, si el negocio cobra por adelantado, **paga**. Solo entonces puede entrar.

## Cobro anticipado (opcional)

En [Ajustes de Veterinaria](/veterinaria/ajustes), en **Teleconsulta**, puedes pedir el pago antes de entrar y poner el precio. En la pantalla de la teleconsulta aprieta **Generar liga de pago**: la sala solo abre cuando está pagada.

## El día de la cita

- La sala abre **15 minutos antes** y se cierra poco después de la hora de término. Fuera de esa ventana nadie entra, ni con la liga.
- Aprieta **Entrar a la sala**. El video no se graba.
- Aprieta **Iniciar la consulta**: se documenta en el mismo expediente, marcada «telemedicina», y puedes [dictarla](/ayuda/dictar-la-consulta). La firmas como cualquier consulta.

> Una teleconsulta no sustituye la revisión física. Si hace falta, indícale al dueño que traiga a su mascota.

Atender teleconsultas es del médico veterinario designado, de un admin o de quien tenga el permiso **Atender teleconsultas**.`,
  },
  {
    slug: "entrar-a-una-teleconsulta-como-dueno",
    titulo: "Cómo entra el dueño a una teleconsulta",
    resumen: "Qué ve y qué hace el dueño con la liga: firma, paga si toca y entra a la sala desde su celular.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["teleconsulta", "dueño", "liga", "celular", "no abre", "no puede entrar", "cámara", "micrófono"],
    cuerpo: `Esto es lo que le pasa al dueño cuando abre la liga que le mandaste:

1. Ve el nombre de su mascota, el médico, la fecha y la hora.
2. Lee y firma el **consentimiento de teleconsulta** con su nombre. Sin firma no puede entrar.
3. Si el negocio cobra por adelantado, ve el botón de pago. Sin pago no puede entrar.
4. Cuando falta poco para la hora, la pantalla se actualiza sola y aparece **Entrar a la videollamada**. Su navegador le pide permiso para la cámara y el micrófono.

## Si dice que no puede entrar

- **Todavía no abre**: la sala abre 15 minutos antes de la cita.
- **Ya terminó**: la ventana de la cita pasó. Agenda otra y manda una liga nueva.
- **Falta el consentimiento o el pago**: debe completarlo en la misma liga.
- **La liga ya no sirve**: generaste otra. Mándale la más reciente desde la pantalla de la teleconsulta.
- **No ve ni oye**: que permita cámara y micrófono en su navegador y que abra la liga en Chrome o Safari.

La liga no muestra nada del expediente de su mascota.`,
  },
];
