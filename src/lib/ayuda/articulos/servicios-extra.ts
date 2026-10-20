import type { Articulo } from "../tipos";

// Servicios extra cobrables de Hotel y guardería (17 de octubre de 2026). Los botones y
// pantallas de aquí son los de la app; si una cambia, se cambia su artículo en el mismo cambio.
export const ARTICULOS_SERVICIOS_EXTRA: Articulo[] = [
  {
    slug: "agregar-servicios-extra",
    titulo: "Cómo agregar un servicio extra a una estancia (paseo, entrenamiento, traslado…)",
    resumen: "Cobrar aparte lo que se le hace al perro durante su estancia, o programarlo para que salga en el tablero del día.",
    grupo: "guarderia",
    modulo: ["guarderia", "hotel"],
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["servicio extra", "paseo", "entrenamiento", "adiestramiento", "baño de salida", "medicamento", "cuidado nocturno", "traslado", "programar", "adicional", "cargo extra"],
    cuerpo: `Un servicio extra es algo que cobras aparte de la estancia: un paseo, una sesión de entrenamiento, el baño de salida, darle su medicamento, un cuidado especial por la noche o un traslado a domicilio. Lo que ofreces lo defines en el [catálogo de servicios extra](/extras/catalogo).

Se agrega desde el **check-in** o el **check-out** de la estancia (también para un día de guardería), en la sección **Servicios extra**. Necesitas el permiso **Agregar servicios extra** (recepción lo trae encendido).

## Si ya se hizo

1. En **Servicio extra** escoge el servicio.
2. En **¿Qué pasó?** deja **Ya se hizo (entra a la cuenta)**.
3. Pon la fecha, la **Cantidad** y, si quieres, una nota.
4. Aprieta **Registrar y cobrar en la cuenta**. El cargo ya está en la cuenta de la estancia y se cobra en Caja como cualquier otro.

## Si lo vas a hacer después

1. Escoge el servicio y deja **Programarlo (sale en el tablero)**.
2. Pon la fecha y la hora. Para algo diario (un paseo a las 10:00) llena **Repetir cada día hasta** con el último día de la estancia.
3. Aprieta **Programar**. Cada día sale como tarea en el tablero de recepción y en [Servicios extra](/extras); cuando alguien lo marca hecho, el cargo entra a la cuenta.

## Cancelar

En la lista de la sección, aprieta **Cancelar**, escribe el motivo y **Confirmar cancelación**. Si ya estaba hecho, se cancela también su cargo (y, si lo cubrió un paquete de sesiones, la sesión regresa al paquete). Nada se borra.

> El precio es el del catálogo **al momento de agregarlo**. Si después cambias el precio en el catálogo, lo que ya agregaste no se mueve.

> Si el perro tiene un paquete de sesiones de ese servicio, la sesión se descuenta del paquete y no se cobra aparte.`,
  },
  {
    slug: "servicios-extra-del-dia-y-traslados",
    titulo: "Cómo marcar los servicios extra del día y llevar la hoja de traslados",
    resumen: "Las tareas programadas salen en el tablero; al marcarlas hechas, el cargo entra a la cuenta. Los traslados llevan su dirección, horario y estado.",
    grupo: "guarderia",
    modulo: ["guarderia", "hotel"],
    roles: ["admin", "recepcion"],
    rutas: ["/extras"],
    palabras: ["tareas del día", "marcar hecho", "traslado", "hoja de traslados", "en camino", "entregado", "whatsapp", "paseo diario"],
    cuerpo: `Lo que programaste para hoy sale en el tablero de recepción, en **Servicios extra de hoy**, y completo en [Servicios extra](/extras). Lo que quedó pendiente de un día anterior sale marcado, para que no se te pase.

## Una tarea normal (paseo, baño de salida, medicamento…)

1. Cuando se hace, aprieta **Marcar hecho**.
2. Listo: el cargo entra a la cuenta de la estancia con el precio con el que se programó, y queda anotado quién lo hizo y cuándo.

## Un traslado a domicilio

La sección **Traslados** es la hoja del día: la hora, el perro, el dueño, la dirección y si es para recoger o para entregar.

1. Cuando sale el vehículo, aprieta **Salió el traslado**. Pasa a **En camino**.
2. Aprieta **Avisar por WhatsApp**: se abre WhatsApp con el mensaje al dueño listo para enviar (nada se manda solo).
3. Cuando llega, aprieta **Marcar entregado** (o **Marcar recogido**). Entonces el cargo del traslado entra a la cuenta.

Para ver otro día usa **Día anterior** y **Día siguiente**.

## Lo que se cobra aparte

Abajo, **Lo que se cobra aparte** junta todo lo que el negocio cobra fuera de la estancia: los servicios extra del catálogo (con su precio, y el traslado con sus zonas) y los **cargos adicionales** de Servicios (comida especial, recolección por kilómetro…), con cómo se cobra cada uno y **Ver cómo se cobra** para los que tienen tarifa. Si todavía no tienes **Traslado a domicilio**, ahí mismo te dice dónde crearlo. Un traslado se cobra por **zona** (un precio por viaje); la recolección por kilómetro, con el precio del tramo de la distancia total por los kilómetros.

> Si te equivocaste, aprieta **Cancelar** (o **Cancelar cargo** si ya estaba hecho) y escribe el motivo.`,
  },
  {
    slug: "catalogo-de-servicios-extra",
    titulo: "Cómo crear el catálogo de servicios extra, sus zonas y su facturación",
    resumen: "Definir qué servicios extra cobras, a qué precio y cómo se facturan, incluida la tarifa por zona de un traslado.",
    grupo: "admin",
    modulo: ["guarderia", "hotel"],
    roles: ["admin", "recepcion"],
    rutas: ["/extras/catalogo"],
    palabras: ["catálogo", "crear servicio extra", "precio", "unidad", "zona", "clave sat", "iva", "clase fiscal", "paquete", "traslado con zonas"],
    cuerpo: `Lo hace el admin, o quien tenga el permiso **Editar catálogo de servicios extra**. Entra a [Servicios extra](/extras) y aprieta **Catálogo de servicios extra**.

## Crear un servicio

1. Toca uno de los sugeridos (**+ Paseo**, **+ Entrenamiento (sesión)**, **+ Traslado a domicilio**, **+ Baño de salida**, **+ Administración de medicamento**, **+ Cuidado especial nocturno**) o **+ Otro servicio** para crear el tuyo.
2. Escribe el **Nombre** y, si quieres, qué incluye.
3. En **Se cobra** escoge la unidad: por vez, por día, por sesión o por viaje.
4. Pon el **Precio**: es lo que paga el cliente, con IVA incluido.
5. En **Clase fiscal (IVA)** escoge cómo se factura; ahí ves la tasa. Si tu contador te dio una **Clave del SAT** para este servicio, escríbela (8 números); si la dejas vacía se usa la de la clase fiscal.
6. Aprieta **Crear servicio extra**.

Para dejar de ofrecer uno sin perder su historia, quita la palomita de **Se ofrece al agregar servicios extra** y **Guardar cambios**.

## Traslado con zonas

Elige el tipo **Traslado a domicilio (con zonas)**. Cuando se crea, abajo aparecen las **Zonas y precio por zona**: escribe el nombre de la zona (por ejemplo, "Centro, hasta 5 km"), hasta cuántos km llega y su precio, y aprieta **Agregar zona**. Al agregar un traslado se escoge la zona y de ahí sale el precio.

## Paquete de sesiones

En un servicio normal aprieta **Venderlo también como paquete de sesiones**, pon cuántas sesiones, el precio del paquete y, si quieres, su vigencia en días, y **Guardar paquete**. Cómo se vende está en [Paquetes de sesiones](/ayuda/paquete-de-sesiones-de-un-servicio-extra).

> Cambiar un precio aquí **no** cambia lo que ya agregaste a una estancia.`,
  },
  {
    slug: "paquete-de-sesiones-de-un-servicio-extra",
    titulo: "Cómo vender un paquete de sesiones de un servicio extra y ver cuánto dejan",
    resumen: "Vender 5 paseos o 10 sesiones de entrenamiento en un solo cobro, y ver los ingresos por servicio y por empleado.",
    grupo: "bonos",
    modulo: ["guarderia", "hotel"],
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["paquete de sesiones", "bono", "entrenamiento", "paseos", "sesiones", "reporte servicios extra", "ingresos por empleado"],
    cuerpo: `Un paquete de sesiones usa el mismo motor que los pases de guardería. Primero el admin lo define en el [catálogo](/extras/catalogo) (**Venderlo también como paquete de sesiones**).

## Venderlo

1. Abre la ficha del cliente, en [Clientes](/clientes), y baja a **Paquetes**.
2. Escoge al **perro** (el paquete es de un solo perro), escoge el paquete (por ejemplo, "Paquete de 5 · Paseo") y cobra como siempre.

## Usarlo

No hay que hacer nada extra: cuando marcas una sesión de ese servicio como hecha para ese perro, la sesión se descuenta del paquete y no se cobra aparte (en la cuenta sale como cubierta por el paquete). Si cancelas la sesión, regresa al paquete. Si al paquete le quedan menos sesiones de las que pides, se cobra normal.

## Ver cuánto dejan

En [Reportes](/reportes) hay una sección **Servicios extra de Hotel y guardería** con los ingresos por servicio y por empleado (quien marcó el servicio como hecho). Lo que cubrió un paquete sale aparte, en **Cubierto con paquete**, porque ya se cobró cuando vendiste el paquete.`,
  },
];
