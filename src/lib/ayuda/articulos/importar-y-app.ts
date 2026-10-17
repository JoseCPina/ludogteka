import type { Articulo } from "../tipos";

// Importar clientes y mascotas, borradores de formularios y app instalable (16 de octubre
// de 2026). Los botones y pantallas de aquí son los de la app; si una cambia, se cambia
// su artículo en el mismo cambio.
export const ARTICULOS_IMPORTAR_Y_APP: Articulo[] = [
  {
    slug: "importar-clientes-y-mascotas",
    titulo: "Cómo importar tus clientes y mascotas desde Excel",
    resumen: "Pasar tu lista de un Excel o CSV al sistema sin capturar uno por uno, con vista previa antes de aplicar.",
    grupo: "admin",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/admin/importar"],
    palabras: ["importar", "excel", "csv", "xlsx", "migrar", "subir lista", "cargar clientes", "plantilla", "masivo", "duplicados", "microchip"],
    cuerpo: `Lo hace el admin, o quien tenga el permiso **Importar clientes y mascotas**. Sirve para pasar la lista que ya tienes (un Excel o un CSV) y no capturar a cada dueño y a cada mascota.

1. Entra a [Importar](/admin/importar) en Administración.
2. Aprieta **Descargar plantilla** si quieres ver cómo acomodar tu lista. Cada fila es un dueño; si trae el nombre de una mascota, también se crea su ficha. Si un dueño tiene varias mascotas, repite sus datos en cada fila: se reconoce por el teléfono.
3. Escoge qué hacer con quien ya está registrado (mismo teléfono o mismo microchip): **Omitir** deja lo que ya hay, y **Actualizar** completa con lo que trae tu archivo (un dato vacío nunca borra lo que ya hay). Las mascotas nuevas de un dueño que ya existe siempre se agregan.
4. Aprieta **Elegir archivo** y sube tu Excel (.xlsx) o tu CSV.
5. Revisa a qué campo corresponde cada columna. Ya sugerimos las que reconocimos por su encabezado; cambia las que no. **Nombre del dueño** y **Teléfono (WhatsApp)** son obligatorios.
6. Aprieta **Revisar antes de importar**. Ves cuántas filas entran, cuáles tienen error (por ejemplo, un teléfono que no tiene 10 dígitos) y cuáles traen un aviso (un dato que no se entendió y se dejó vacío), y qué pasará con cada una: dueño nuevo, ya existe, mascota nueva o repetida. Con los filtros miras solo los errores.
7. Aprieta **Importar** y deja la pantalla abierta: avanza por lotes y muestra el progreso. Si se cierra a la mitad o se va la señal, no se pierde nada: retómala desde el historial con **Continuar la importación**; lo que ya entró no se duplica.

## Qué datos acepta

- **Del dueño:** nombre, teléfono, correo y dirección. Las notas del dueño (hasta 500 caracteres) pasan a las **Notas internas** de su ficha, que solo ve el personal. Si el dueño ya existía y su fila trae una nota, la nota se reemplaza; **Deshacer importación** regresa la anterior.
- **De la mascota:** nombre, raza, sexo, fecha de nacimiento (día/mes/año), tamaño, pelaje y si está esterilizada.
- **Clínicos**, solo si el módulo Veterinaria está prendido y tienes el permiso **Editar ficha clínica**: especie, peso, alergias, microchip y folio de registro.
- **Raza (o «Mestizo»), tamaño y pelaje:** con Estética, guardería u hotel, una mascota nueva sin raza se rechaza (la fila sale con error y el motivo: «A la mascota … le falta: raza»); con Estética, además tamaño y pelaje cuando la raza no fija sola el precio (mestizo, raza fuera del catálogo o grupo que cobra por tamaño y pelaje). Con Veterinaria sola no se exige.
- La raza se liga al catálogo cuando coincide con una sola. Lo que no coincide queda como texto y aparece en un resumen al terminar, con un enlace para corregirlo en [Perros → Razas](/perros/razas).

> Si tu archivo trae a una mascota cuyo microchip ya está en la ficha de otro dueño, el dueño entra pero esa mascota no: queda explicado en el detalle de la fila.`,
  },
  {
    slug: "deshacer-una-importacion",
    titulo: "Cómo deshacer una importación y ver su historial",
    resumen: "Revisar qué pasó con cada fila y, si te equivocaste de archivo, regresar todo a como estaba.",
    grupo: "admin",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/admin/importar/[id]"],
    palabras: ["deshacer importación", "revertir", "historial de importaciones", "me equivoqué de archivo", "importé mal"],
    cuerpo: `Cada importación queda en el historial de [Importar](/admin/importar), con su fecha, su archivo y lo que pasó con cada fila.

1. Abre la importación desde el historial.
2. Revisa los números y las filas: **Creadas**, **Actualizadas**, **Omitidas** y **Con error**. En cada fila ves el motivo.
3. Si necesitas regresar todo, aprieta **Revisar si se puede deshacer**. La app te dice si se puede o qué lo impide.
4. Si se puede, aprieta **Sí, deshacer la importación**.

Deshacer da de baja los dueños y mascotas que la importación creó y regresa a como estaban los que actualizó. Solo se puede si **nadie los modificó después** y **no tienen nada registrado** (citas, estancias, cobros, vacunas…). Nada se borra: quedan dados de baja, y los teléfonos quedan libres.

> Si ya hay movimiento en esos registros, no se deshace la importación completa: da de baja a mano lo que sobre desde cada ficha.

Si una importación quedó a medias, en su detalle aparece **Continuar la importación**.`,
  },
  {
    slug: "recuperar-un-borrador",
    titulo: "Cómo recuperar lo que estabas escribiendo (borradores)",
    resumen: "Los formularios largos se guardan solos mientras escribes; si cierras la pantalla, lo recuperas al volver.",
    grupo: "ayuda",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["borrador", "autoguardado", "se me perdió", "recuperar", "perdí lo que escribí", "se cerró la pantalla"],
    cuerpo: `Los formularios largos —el alta de un cliente, el alta de una mascota, el check-in y los contratos— se van guardando solos mientras escribes, para que no pierdas nada si se cierra la pantalla, se acaba la batería o te interrumpen.

1. Vuelve a abrir el mismo formulario.
2. Arriba aparece **Tienes un borrador sin guardar**. Aprieta **Recuperar borrador** y se llenan los campos como los dejaste, o **Descartar** para empezar de cero.
3. Termina y guarda como siempre: al guardar, el borrador se borra solo.

Cada persona tiene sus propios borradores: nadie más ve lo que tú dejaste a medias. Se guardan aunque cambies de computadora y se borran solos a los 30 días. Las contraseñas y las fotos nunca se guardan en un borrador. Sin conexión no se guarda el borrador.`,
  },
  {
    slug: "instalar-la-app-y-sin-conexion",
    titulo: "Cómo instalar la app en el celular y qué se ve sin conexión",
    resumen: "Poner el sistema en la pantalla de inicio y consultar la agenda del día aunque se vaya el internet.",
    grupo: "ayuda",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["instalar", "app", "pantalla de inicio", "pwa", "sin conexión", "sin internet", "offline", "icono", "celular"],
    cuerpo: `Puedes instalar el sistema como una app en tu celular o computadora: abre en pantalla completa y con el nombre y el logo de tu negocio.

## Instalarla

- **Android o computadora (Chrome):** aprieta **Instalar la app**, el botón que aparece abajo a la izquierda. Si no lo ves, abre el menú del navegador y escoge «Instalar aplicación».
- **iPhone (Safari):** aprieta el botón de compartir y escoge **Agregar a pantalla de inicio**.

## Qué pasa sin conexión

Cuando se va el internet aparece un aviso amarillo: **Sin conexión**. Mientras tanto puedes **consultar**, solo lo que ya abriste en ese equipo:

- El tablero del día y la agenda de estética.
- La ficha de un cliente y la de una mascota que ya abriste.

**No se guarda nada sin conexión**: registrar, cobrar o editar se detiene con un aviso, para que no creas que se guardó. Cuando vuelve la señal, recarga la pantalla y sigue.

Al cerrar sesión se borra lo que se había guardado para ver sin conexión.`,
  },
];
