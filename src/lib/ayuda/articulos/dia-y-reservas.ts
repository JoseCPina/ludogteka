import type { Articulo } from "../tipos";

/**
 * El día a día del mostrador: tablero, clientes, portal, contratos,
 * reservas de guardería y hotel, check-in, check-out, pases y recolección.
 * Cada botón y cada ruta que se nombra aquí existe tal cual en la app: si
 * cambia la pantalla, cambia su artículo en el mismo cambio.
 */
export const ARTICULOS_DIA_Y_RESERVAS: Articulo[] = [
  {
    slug: "leer-el-tablero-del-dia",
    titulo: "Cómo leer el tablero del día",
    resumen: "Toda la casa en una pantalla: quién llega, quién se va, quién sigue aquí y qué está pendiente.",
    grupo: "inicio",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/recepcion"],
    palabras: ["inicio", "hoy", "resumen", "llegadas", "salidas", "ocupación", "pantalla principal"],
    captura: "leer-el-tablero-del-dia.jpg",
    cuerpo: `Es lo primero que ves al abrir la app. Junta en un solo lugar lo que pasa hoy en tu negocio, para que no tengas que brincar de módulo en módulo.

1. Arriba están los números del día: **Llegan hoy**, **Se van hoy**, **Adentro ahora** y la ocupación de día (y de noche si tienes hotel). Si das estética, también **Citas hoy**, **En curso** y **Terminadas**.
2. Junto al título tienes los atajos: **Nuevo cliente**, **Check-in**, **Check-out**, **Nueva cita de estética** y **Nueva reserva**.
3. En **Necesita atención** está lo que alguien tiene que resolver. Cada aviso es un link a donde se arregla.
4. Abajo vienen las listas **Llegan hoy**, **Se van hoy** y **Siguen aquí ahora**. Toca un perro para ir directo a su check-in o su check-out.

> El admin ve una versión corta en [Administración](/admin): los números y lo pendiente. Con **Ver el tablero del día completo →** llega aquí.

## Si algo no sale

Si la ocupación dice «Cupo sin configurar», falta capturar el cupo de ese día y no se podrán hacer reservas.`,
  },
  {
    slug: "que-hacer-con-necesita-atencion",
    titulo: "Qué hacer con lo que «Necesita atención»",
    resumen: "Cada aviso dice cuánto lleva esperando y te lleva a la pantalla donde se resuelve.",
    grupo: "inicio",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/recepcion/saldos"],
    palabras: ["pendientes", "avisos", "alertas", "saldos", "reembolsos", "por hacer"],
    cuerpo: `Es la lista de lo que se está quedando atrás. Cada aviso dice cuánto lleva esperando («Esperando desde hace 3 días») y, si pasa de una semana, se resalta para que no se pierda.

1. Toca el aviso: te lleva a la lista donde se resuelve, ordenada del más viejo al más nuevo.
2. Resuelve primero lo resaltado.
3. Cuando ya no quede nada, verás «Nada pendiente por ahora.»

## Los avisos más comunes

- **Contratos que esperan la firma del dueño**: van a [Contratos por firmar](/recepcion/contratos), donde se lo recuerdas por WhatsApp.
- **Comprobantes sanitarios que esperan revisión**: los mandó el dueño desde su portal; se revisan en [Comprobantes por revisar](/recepcion/comprobantes).
- **Cuentas nuevas que esperan vincularse**: van a [Vinculación de cuentas](/vinculacion).
- **Cuentas con saldo pendiente** de perros que ya se fueron: van a la cuenta o a la lista de saldos.
- **Reembolsos de Mercado Pago**, por ejemplo uno hecho desde el panel de Mercado Pago: se revisan en Caja, en [Reembolsos](/caja/reembolsos).
- **Gastos del local vencidos o por vencer**: solo los ve quien tiene el permiso de Gastos.
- **No hay turno de caja abierto**: sin turno no se puede cobrar ni vender paquetes.
- Perros que llegan esta semana sin vacunas al día, sin evaluación o sin contrato: van a su expediente.`,
  },
  {
    slug: "alta-de-cliente-con-link",
    titulo: "Cómo dar de alta a un cliente con un link",
    resumen: "Le mandas un link por WhatsApp y el dueño captura sus datos y los de su perro desde su celular.",
    grupo: "clientes",
    modulo: "portal",
    roles: ["admin", "recepcion"],
    rutas: ["/clientes/invitaciones"],
    palabras: ["invitación", "registro", "nuevo cliente", "whatsapp", "alta por link", "dueño nuevo"],
    captura: "alta-de-cliente-con-link.jpg",
    cuerpo: `Es la forma más cómoda de dar de alta a alguien: el dueño conoce mejor que nadie los datos de su perro, y tú no tienes que dictarlos por teléfono. Con el link también crea su cuenta del portal.

1. En [Clientes](/clientes) toca **Mandar link de alta**. También puedes usar **Nuevo cliente** → **Mandarle un link** desde Guardería, Hotel o Estética.
2. Escribe **¿Para quién es?** (algo como «Ana, la del labrador») y su **Teléfono (WhatsApp)**.
3. Escoge **¿Para qué viene?**: guardería y hotel pide el expediente completo y el contrato; estética pide lo básico y le enseña el precio del baño.
4. Escoge la **Vigencia del link** y toca **Generar link**.
5. Toca **Abrir WhatsApp** para mandárselo, o **Copiar link**.

El link le sirve hasta que termine todo, datos y firma. Si lo deja a medias, lo vuelve a abrir y sigue. En **Links pendientes** puedes **Reenviar** o **Cancelar**.

## Si algo no sale

- «El teléfono debe tener 10 dígitos.»: revisa el número; puede llevar espacios o guiones.
- «Ya hay un link de este tipo esperando a ese cliente.»: reenvía el que ya existe o cancélalo antes de generar otro.`,
  },
  {
    slug: "capturar-cliente-en-mostrador",
    titulo: "Cómo capturar a un cliente y su perro en el mostrador",
    resumen: "Para cuando el dueño ya está enfrente: lo registras tú y luego a su perro.",
    grupo: "clientes",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/clientes/nuevo", "/clientes/[id]/perros/nuevo", "/clientes/[id]"],
    palabras: ["alta manual", "nuevo cliente", "registrar perro", "capturar a mano", "agregar perro"],
    cuerpo: `Cuando el dueño está parado en el mostrador con el perro en brazos, no le vas a pedir que llene un formulario en su celular. Lo capturas tú.

1. En [Clientes](/clientes) toca **Capturar a mano**. Desde un buscador (al reservar o cobrar) es **Nuevo cliente** → **Capturarlo yo**.
2. Llena **Nombre del dueño** y **Teléfono**. El correo y la dirección son opcionales.
3. Toca **Crear cliente**. Si venías de reservar o cobrar, el botón dice **Crear cliente y seguir con su perro**.
4. En la ficha del cliente, toca **Agregar perro**.
5. Llena **Nombre del perro**, **Raza**, **Tamaño** y lo que sepas, y toca **Guardar perro**.

> Si va a usar guardería u hotel, el contrato queda pendiente y se firma después. Lo que le falte al perro aparece en su ficha, en **Para guardería y hotel**.

## Si algo no sale

- «Ya hay un cliente activo con ese teléfono.»: búscalo en la lista; si es la misma persona, edítalo en lugar de crear otro.
- «El teléfono debe tener 10 dígitos.»: revisa el número.`,
  },
  {
    slug: "vacunas-alertas-y-datos-del-perro",
    titulo: "Cómo registrar vacunas, alertas y datos del perro",
    resumen: "Todo lo del perro vive en su expediente: vacunas, evaluación, celo, alertas, alergias y peso.",
    grupo: "clientes",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/perros/[id]"],
    palabras: ["expediente", "vacunas", "requisitos sanitarios", "evaluación", "celo", "alergias", "peso"],
    captura: "vacunas-alertas-y-datos-del-perro.jpg",
    cuerpo: `El expediente del perro es donde se guarda todo lo que necesitas saber antes de recibirlo. Se abre tocando al perro en la ficha de su dueño.

1. Arriba están sus datos: raza, tamaño, alimentación, contacto de emergencia y veterinario. Cambia lo que haga falta y toca **Guardar cambios**.
2. En **Requisitos sanitarios** escoge el **Tipo de requisito** y la **Fecha de aplicación**. Si tienes la foto del carnet, toca **Elegir foto**. Termina con **Registrar aplicación**.
3. En **Requisitos para guardería y hotel**, toca **Marcar evaluación hecha** cuando ya evaluaste su comportamiento. Si es hembra, marca **En celo** o **Gestante** cuando aplique.
4. En **Alertas de manejo** escoge la alerta en **Registrar alerta**, agrega notas y toca **Registrar alerta**.
5. En **Alergias** y **Peso** se registra cada cosa con su botón.

> Si le falta algo para guardería u hotel, arriba aparece la lista. Con **Capturar ahora** llenas solo lo vacío; con **Mandarle un link** el dueño lo completa desde su casa.

## Si algo no sale

Una perra marcada en celo o gestante, o un perro con una alerta que bloquea, no se puede reservar en guardería ni hotel. Quita la marca cuando ya no aplique.`,
  },
  {
    slug: "revisar-comprobante-sanitario",
    titulo: "Cómo revisar un comprobante sanitario que mandó el dueño",
    resumen: "El dueño sube la foto del carnet desde su portal y tú la confirmas o la rechazas.",
    grupo: "clientes",
    modulo: "portal",
    roles: ["admin", "recepcion"],
    rutas: ["/recepcion/comprobantes"],
    palabras: ["carnet", "vacuna del portal", "comprobante", "confirmar vacuna", "rechazar", "bandeja"],
    captura: "revisar-comprobante-sanitario.jpg",
    cuerpo: `Cuando un dueño sube la foto de una vacuna desde su portal, todavía no cuenta: alguien tiene que ver que la foto coincida con lo que dice. Hasta que la confirmes, el perro sigue con el requisito pendiente.

1. Entra a [Comprobantes por revisar](/recepcion/comprobantes). Llegas también desde el aviso del tablero.
2. Cada comprobante trae la foto, la **Aplicación (según el dueño)**, cuánto tiempo **Quedaría vigente** y desde cuándo espera.
3. Compara la foto con la fecha y el tipo de vacuna.
4. Si todo cuadra, toca **Confirmar y registrar**: queda como aplicación real en su expediente, con la misma foto.
5. Si no, toca **Rechazar…**, escribe **¿Por qué no se confirma?** y toca **Rechazar con este motivo**. El dueño lee el motivo en su portal.

Abajo, en **Últimos revisados**, ves lo que ya se resolvió.

## Si algo no sale

- «Para rechazar un comprobante hay que decir por qué: el dueño lo va a leer.»: escribe el motivo.
- «Ese comprobante ya se revisó.»: alguien más ya lo resolvió; recarga la página.`,
  },
  {
    slug: "restablecer-contrasena-de-cliente",
    titulo: "Cómo restablecer la contraseña de un cliente",
    resumen: "Si un dueño olvidó su contraseña del portal, le generas una temporal desde su ficha.",
    grupo: "clientes",
    modulo: "portal",
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["olvidé mi contraseña", "no puede entrar", "contraseña temporal", "portal", "acceso"],
    cuerpo: `La cuenta del dueño va con su teléfono y no hay correo de recuperación. Si te escribe diciendo que olvidó su contraseña, la restableces tú.

1. Abre la ficha del cliente desde [Clientes](/clientes).
2. Baja a **Contraseña del portal** y toca **Restablecer contraseña**.
3. Lee el aviso: su contraseña actual deja de servir en ese momento. Toca **Sí, restablecer**.
4. Aparece la **Contraseña temporal**. Toca **Mandársela por WhatsApp** o cópiala.
5. Dile que la cambie desde su portal en cuanto entre.

> La contraseña temporal se muestra una sola vez. Si cierras la pantalla sin mandarla, tendrás que generar otra.

## Si algo no sale

- Si la ficha dice que todavía no tiene cuenta, no hay nada que restablecer: mándale un link de alta y la crea él con su teléfono.
- «No pudimos cambiar la contraseña. Intenta de nuevo.»: vuelve a intentarlo en un momento.`,
  },
  {
    slug: "portal-del-dueno",
    titulo: "Qué ve el dueño en su portal y cómo entra",
    resumen: "El dueño entra con su teléfono y contraseña y ve a sus perros, sus visitas y sus contratos.",
    grupo: "portal",
    modulo: "portal",
    roles: ["admin", "recepcion"],
    rutas: ["/vinculacion"],
    palabras: ["cuenta del cliente", "vincular", "iniciar sesión", "acceso del dueño", "portal de clientes"],
    cuerpo: `El portal es la cuenta del dueño. La crea él mismo cuando llena su link de alta, con su teléfono y una contraseña.

## Cómo entra

1. Abre la [página de entrada](/login) de tu negocio, escribe su **Teléfono o correo** y su **Contraseña**, y toca **Entrar**.
2. Si la olvidó, la restableces tú desde su ficha.

## Qué ve

- **Citas y reservas**: las próximas y su historial, de guardería, hotel y estética.
- **Tus perros**: la ficha de cada uno, su estado de salud, la bitácora con fotos y notas, medicamentos y alergias.
- Sus contratos por firmar, con un aviso en la portada.
- **Tus datos**, que puede corregir él.

Nunca ve precios de otros clientes ni la caja del negocio. Para reservar, cambiar o cancelar te sigue escribiendo por WhatsApp.

## Cuentas sin vincular

Si alguien tiene cuenta pero no quedó ligada a su expediente, aparece en [Vinculación de cuentas](/vinculacion). Toca **Vincular**, busca al dueño y confirma con **Sí, vincular**. Revisa bien: le das acceso al historial de esa persona.`,
  },
  {
    slug: "mandar-a-firmar-un-contrato",
    titulo: "Cómo mandar a firmar un contrato y ver los pendientes",
    resumen: "Generas el contrato en el expediente del perro y el dueño lo firma desde su portal.",
    grupo: "contratos",
    modulo: "contratos",
    roles: ["admin", "recepcion"],
    rutas: ["/recepcion/contratos"],
    palabras: ["firma", "contrato pendiente", "recordatorio", "firmar en papel", "regenerar"],
    captura: "mandar-a-firmar-un-contrato.jpg",
    cuerpo: `El contrato general se firma dentro del link de alta. El de guardería se genera solo cuando vendes un day pass o una mensualidad. Si necesitas uno a mano, lo generas desde el expediente.

1. Abre el expediente del perro y baja a **Contrato**.
2. En el contrato que toca, toca **Generar contrato**. Queda **Pendiente de firma**.
3. El dueño lo ve en su portal con el aviso «Tienes un contrato por firmar», dibuja su firma y toca **Confirmar firma**.
4. Si lo firmó en papel, toca **Subir firmado en papel** y sube la foto o el PDF.

## Ver quién debe firma

1. Entra a [Contratos por firmar](/recepcion/contratos).
2. En **Pendientes de firma** ves cada contrato y desde cuándo espera. Toca **Recordar por WhatsApp**.
3. Si un contrato firmado salió con campos vacíos, aparece en **Hay que volver a generarlos**. Toca **Generar de nuevo**: el firmado se conserva.

## Si algo no sale

- «Ya hay un … pendiente de firma para este perro.»: cancela el pendiente antes de generar otro.
- «No hay una versión publicada de … todavía.»: un admin tiene que publicar la plantilla en [Contratos](/contratos).`,
  },
  {
    slug: "reservar-guarderia",
    titulo: "Cómo reservar guardería",
    resumen: "Apartas uno o varios días de guardería para uno o varios perros de la misma familia.",
    grupo: "guarderia",
    modulo: "guarderia",
    roles: ["admin", "recepcion"],
    rutas: ["/guarderia/nueva", "/guarderia/series", "/guarderia/walkin", "/guarderia"],
    palabras: ["reserva", "apartar día", "serie", "recurrente", "walk-in", "day care"],
    captura: "reservar-guarderia.jpg",
    cuerpo: `Una reserva aparta el lugar del perro y revisa, antes de guardar, que tenga todo en regla y que haya cupo.

1. En [Guardería](/guarderia) toca **Nueva reserva**.
2. Busca al dueño por perro, nombre o teléfono. Si es nuevo, usa **Nuevo cliente**.
3. Marca a cada perro que viene y escoge el **Servicio** y la **Fecha**. Si es por hora, pon las **Horas (estimado)**.
4. Si el perro tiene day pass o mensualidad, aparece **Tiene pases disponibles**: escoge si usa un pase o paga el día suelto.
5. Toca **Crear reserva**. Desde el resultado puedes **Hacer check-in ahora →**.

## Perros que vienen siempre los mismos días

En **Series recurrentes** toca **Nueva serie**, escoge el perro, el servicio y los días de la semana, y toca **Crear serie y generar horizonte**.

## Si algo no sale

- «Este perro tiene un requisito sanitario obligatorio vencido o sin registro.»: registra la vacuna en su expediente. Un admin puede autorizar una excepción con motivo.
- «Este perro no tiene evaluación previa de comportamiento.»: márcala en su expediente.
- «No hay cupo disponible (diurno) para el …»: ese día ya está lleno.
- «Guardería no abre en …»: escoge un día con horario.`,
  },
  {
    slug: "reservar-hotel",
    titulo: "Cómo reservar hotel",
    resumen: "Apartas las noches de un perro con su fecha de entrada y de salida.",
    grupo: "hotel",
    modulo: "hotel",
    roles: ["admin", "recepcion"],
    rutas: ["/hotel/nueva", "/hotel/series", "/hotel/walkin", "/hotel"],
    palabras: ["hospedaje", "noches", "pensión", "reserva de hotel", "dormir", "vacaciones"],
    cuerpo: `El hotel se reserva igual que la guardería, pero con entrada y salida: se cobran las noches que hay entre las dos fechas.

1. En [Hotel](/hotel) toca **Nueva reserva**.
2. Busca al dueño por perro, nombre o teléfono. Si es nuevo, usa **Nuevo cliente**.
3. Marca a cada perro que se queda, escoge el **Servicio** y pon la **Entrada** y la **Salida**.
4. Agrega **Notas (opcional)** si hay algo que el equipo deba saber.
5. Toca **Crear reserva** y luego **Ver reserva** para revisar la cuenta.

Si el perro ya está en la puerta sin reserva, usa **Walk-in (sin reserva)** desde el check-in de hotel.

> La ocupación que ves es la de toda la casa: guardería y hotel comparten el mismo espacio.

## Si algo no sale

- «No hay cupo disponible (nocturno) para el …»: esa noche ya está llena.
- «El hotel no recibe perros en …» o «El hotel no entrega perros en …»: cambia la llegada o la salida a un día con horario.
- «Este perro no tiene talla registrada y el precio depende de ella.»: captura su tamaño en el expediente.
- «Esta perra está marcada en celo…»: no se puede quedar mientras dure.`,
  },
  {
    slug: "registrar-check-in",
    titulo: "Cómo registrar un check-in",
    resumen: "Anotas quién deja al perro, cómo llega y qué trae, y queda adentro.",
    grupo: "guarderia",
    modulo: "guarderia",
    roles: ["admin", "recepcion"],
    rutas: ["/reservas/estancias/[id]/checkin", "/guarderia/checkin", "/hotel/checkin"],
    palabras: ["entrada", "llegada", "recibir perro", "pertenencias", "foto de llegada"],
    captura: "registrar-check-in.jpg",
    cuerpo: `El check-in es el momento en que el perro entra a tu cuidado. Queda registrado quién lo dejó, a qué hora y cómo llegó.

1. Toca **Check-in** en el tablero o en Guardería u Hotel, y escoge al perro de la lista.
2. Revisa los avisos de arriba: alertas de manejo, alergias graves, vacunas y contrato.
3. Si viene con pase, lo verás. Si **Tiene pases sin aplicar**, toca **Usar el pase para hoy**.
4. Escribe **Quién entrega al perro** y, si quieres, su teléfono.
5. Anota el **Estado del perro a la llegada (opcional)** y toca **Tomar/subir foto**.
6. En **Agregar pertenencia** escribe lo que trae (correa, cama, juguete) y toca **Agregar**.
7. Toca **Confirmar check-in**.

> Las vacunas vencidas, la falta de evaluación, el celo, la gestación y las alertas que bloquean se revisan al reservar: si el perro tiene reserva, ya pasó por ahí. Aun así, fíjate en los avisos antes de recibirlo.

## Si algo no sale

- «Registra quién entrega al perro.»: escribe el nombre de quien lo deja.
- Si no tiene reserva, usa **Walk-in (sin reserva)** en la lista de check-in.`,
  },
  {
    slug: "registrar-check-out-y-cobrar",
    titulo: "Cómo registrar un check-out y cobrar la estancia",
    resumen: "Entregas al perro con sus cosas, registras quién lo recoge y cobras la cuenta en Caja.",
    grupo: "guarderia",
    modulo: "guarderia",
    roles: ["admin", "recepcion"],
    rutas: ["/reservas/estancias/[id]/checkout", "/guarderia/checkout", "/hotel/checkout"],
    palabras: ["salida", "entrega", "recoger perro", "cobro", "cuenta", "noche extra"],
    cuerpo: `El check-out cierra la estancia: el perro sale con sus cosas y queda anotado quién se lo llevó. Después se cobra en Caja.

1. Toca **Check-out** en el tablero o en Guardería u Hotel, y escoge al perro.
2. Si hace falta, agrega cargos en **Aplicar cargo** y toca **Aplicar**.
3. Palomea cada pertenencia que entregas.
4. Escribe **Quién recoge al perro** y marca **Sí, es el dueño** o **No, persona autorizada**.
5. Toca **Confirmar salida**.

En hotel, si se queda una noche más, toca **Extender 1 noche**. Si un perro de guardería sigue aquí después del cierre, puedes **Convertir en noche de hotel**.

## Cobrar

1. Ve a [Caja](/caja) y toca su cuenta en **Cuentas abiertas de hoy**.
2. Escoge el **Método**, el **Monto** y la **Propina** si hay. Para pagar con dos métodos, toca **+ Repartir en otro método**.
3. Toca **Registrar cobro**.

## Si algo no sale

- «No hay turno de caja abierto. Ábrelo antes de cobrar.»: toca **Abrir turno**, pon el **Fondo inicial** y **Confirmar apertura**.
- «Registra quién recoge al perro.»: escribe el nombre.`,
  },
  {
    slug: "vender-day-pass-o-mensualidad",
    titulo: "Cómo vender un day pass o una mensualidad",
    resumen: "Vendes un paquete para un perro y sus reservas de guardería lo usan solas.",
    grupo: "bonos",
    modulo: "bonos",
    roles: ["admin", "recepcion"],
    rutas: ["/guarderia/pases", "/caja/pases"],
    palabras: ["paquete", "bono", "pases", "saldo de pases", "mensualidad", "vender"],
    captura: "vender-day-pass-o-mensualidad.jpg",
    cuerpo: `Un day pass o una mensualidad es de un solo perro: solo él lo usa. Si el dueño tiene dos perros, compra dos paquetes. Cuando reservas guardería de día completo, la reserva toma el pase sola.

1. Entra a [Day pass y mensualidad](/guarderia/pases) desde Guardería, o a **Vender pase o mensualidad** desde [Caja](/caja).
2. Busca al dueño por perro, nombre o teléfono.
3. Toca **Vender paquete**.
4. Escoge el **Perro** y el **Paquete**.
5. Escoge el **Método** y el **Monto**. Para pagar con dos métodos, usa **+ Repartir en otro método**.
6. Toca **Confirmar venta**.

En la misma pantalla ves los pases que le quedan a cada perro. Al venderlo se genera el contrato de guardería, que el dueño firma desde su portal.

## Si algo no sale

- «No hay turno de caja abierto. Ábrelo antes de vender un bono.»: abre el turno en [Caja](/caja).
- «Escoge el perro para el que es el paquete.»: el paquete siempre es de un perro.
- «Este perro está marcado como fallecido: no se le puede vender un paquete.»`,
  },
  {
    slug: "cotizar-y-cobrar-recoleccion",
    titulo: "Cómo cotizar y cobrar una recolección a domicilio",
    resumen: "Guardas la distancia del cliente una vez y la cobras por kilómetro en su estancia.",
    grupo: "recoleccion",
    modulo: "recoleccion",
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["recoger a domicilio", "kilómetros", "distancia", "transporte", "camioneta", "traslado"],
    cuerpo: `La recolección se cobra por kilómetro. La distancia de cada cliente se calcula una vez desde su dirección y se reutiliza cada vez que lo recoges.

## Calcular la distancia

1. Abre la ficha del cliente desde [Clientes](/clientes).
2. En **Dirección y distancia de recolección**, escribe la **Dirección** y toca **Guardar y calcular**.
3. Si la distancia no cuadra, toca **Ajustar distancia a mano**, escribe la **Distancia correcta (km)** y toca **Guardar ajuste**.

## Cobrarla

1. Abre la reserva o el check-out del perro.
2. En **Aplicar cargo**, escoge **Recolección a domicilio**.
3. Toca **Usar distancia guardada** o escribe los kilómetros en **Cantidad**.
4. Toca **Aplicar**. El cargo se suma a la cuenta y se cobra en [Caja](/caja) con lo demás.

## Si algo no sale

- «Falta la dirección de la base…» o «Falta la dirección del negocio…»: el admin la captura en Administración, en Ubicación para recolección. Mientras, pon la distancia a mano.
- «Tu negocio ya usó las … consultas de Google Maps de este mes.»: captura los kilómetros a mano; el mes que entra vuelve a calcularse solo.`,
  },
];
