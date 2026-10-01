import type { Articulo } from "../tipos";

/**
 * El reporte de comportamiento diario (guardería) y las fotos y videos de
 * los perros que están adentro (guardería y hotel). Cada botón y cada ruta
 * que se nombra aquí existe tal cual en la app: si cambia la pantalla,
 * cambia su artículo en el mismo cambio.
 */
export const ARTICULOS_REPORTE_Y_FOTOS: Articulo[] = [
  {
    slug: "llenar-el-reporte-de-comportamiento",
    titulo: "Cómo llenar el reporte de comportamiento",
    resumen: "Un reporte por perro al final del día, con botones grandes, y se lo mandas al dueño por WhatsApp.",
    grupo: "guarderia",
    modulo: "guarderia",
    roles: ["admin", "recepcion"],
    rutas: ["/guarderia/reportes"],
    palabras: ["reporte", "comportamiento", "tarjeta", "estado general", "buen día", "dueño", "whatsapp", "diario"],
    cuerpo: `Es la tarjeta con la que le cuentas al dueño cómo le fue a su perro: cómo estuvo, qué hizo, cómo se llevó con los demás, cómo comió y descansó. Se llena desde la tablet o el celular, con botones grandes.

> Lo llenan el admin y las personas de recepción a quienes el admin les dio el permiso **Reportes de guardería** (en [Permisos](/admin/permisos)).

1. Entra a **Guardería** y toca **Reportes del día**, o desde [Adentro ahora](/adentro) toca **Reporte** en el perro. Verás a los perros de guardería que están adentro hoy, con su estado: **Sin reporte**, **Borrador**, **Listo** o **Enviado**, los pendientes primero y el avance («12 de 20 listos»).
2. Toca al perro y marca lo que pasó en cada sección: estado general, actividades, socialización, conducta, alimentación, descanso, recomendaciones y resumen del día. En las de elegir una sola, tocar otra opción cambia la elección.
3. Se guarda solo como **Borrador** mientras escribes. Puedes dejarlo y volver.
4. Si fue un día normal, toca **Buen día**: llena las opciones habituales y tú cambias lo que sea distinto. Si el perro ya tuvo reporte, **Repetir el de ayer** copia el último como borrador. Ninguno de los dos manda nada: tú lo revisas.
5. Cuando esté, toca **Dejar listo**. Se dibuja la tarjeta con el logo y los colores de tu negocio.
6. Toca **Enviar por WhatsApp**: se abre la conversación con el dueño con un mensaje corto y la liga a la tarjeta. Tú das el último toque en WhatsApp.

## Después de enviarlo

- **Reenviar por WhatsApp** manda la liga otra vez. Ahí mismo ves quién lo envió y cuándo.
- **Descargar imagen** te baja la tarjeta.
- Para corregir un reporte ya enviado, cambia lo que haga falta y toca **Guardar corrección y generar imagen**. Queda guardada la versión anterior y hay que volver a enviarlo.
- Si la imagen ya se borró, toca **Generar imagen de nuevo**.

## Cosas que conviene saber

- Hay un reporte por perro por día. Nunca se genera ni se envía en bloque.
- La liga que recibe el dueño dura **7 días** (tu negocio puede cambiarlo) y no pide contraseña. Pasado ese tiempo la tarjeta y la liga dejan de funcionar, pero el reporte queda guardado y puedes generarlo otra vez.
- Si el dueño no tiene teléfono capturado, el botón te dice que falta y no manda nada.
- ¿Quieres otras opciones, otros nombres, otro subtítulo o tus colores? El admin lo cambia en [Reporte y fotos](/admin/reporte-guarderia): renombrar, apagar o agregar opciones. Lo que ya está guardado no cambia.`,
  },
  {
    slug: "enviar-fotos-y-videos",
    titulo: "Cómo enviar fotos y videos de un perro",
    resumen: "Toma una foto o un video, o elígelo de la galería, y mándale al dueño una liga por WhatsApp.",
    grupo: "guarderia",
    modulo: ["guarderia", "hotel"],
    roles: ["admin", "recepcion"],
    rutas: ["/adentro"],
    palabras: ["foto", "video", "galería", "fotos", "videos", "dueño", "whatsapp", "adentro ahora", "cámara", "hotel"],
    cuerpo: `Para que el dueño vea a su perro mientras está contigo, sin archivos pesados por WhatsApp: le mandas una liga a una galería con lo que tú escojas.

> Lo hacen el admin y las personas de recepción con el permiso **Reportes de guardería** (en [Permisos](/admin/permisos)).

1. Abre [Adentro ahora](/adentro) (también desde la cifra **Adentro ahora** del tablero). Los perros están separados en Hotel y Guardería; si uno está en los dos, sale una sola vez con las dos etiquetas.
2. En el perro toca **Tomar foto** o **Tomar video** para abrir la cámara, o **Elegir de la galería** para escoger fotos y videos del carrete (puedes marcar varios).
3. Espera la barra de progreso. Si se corta la conexión, vuelve a intentar solo.
4. En la vista previa marca los que quieres mandar y quita los que no. Puedes agregar más.
5. Toca **Enviar por WhatsApp**: se abre la conversación con el dueño con la liga a la galería. Las fotos y los videos se ven y se reproducen desde el navegador del celular.

## Límites

- Los videos duran **hasta 45 segundos** y pesan **hasta 60 MB**. Si se pasa, la app avisa: elige uno más corto o grábalo desde ahí mismo con **Tomar video**.
- Las fotos se acomodan solas (derechas y ligeras).

## Cuánto duran

Todo se borra solo a los **7 días** (tu negocio puede cambiar ese tiempo en [Reporte y fotos](/admin/reporte-guarderia)); la pantalla te lo recuerda con «Se borra en 7 días». La liga también deja de funcionar y avisa al dueño que venció. Nada de esto se guarda para siempre: si algo quieres conservar, descárgalo antes.

Si al perro le toca reporte de comportamiento, está en el botón **Reporte** del mismo renglón.`,
  },
];
