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
- **Diferencias entre la caja y Mercado Pago** y **cobros con terminal por confirmar**: salen cada hora de la conciliación (solo de pagos cobrados desde PeluDesk: los otros pagos de tu cuenta de Mercado Pago se ignoran) y se revisan en [Conciliación](/caja/conciliacion).
- **Servicios corregidos con ajuste de cuenta pendiente**: un cobro adicional por cobrar o un saldo a favor por devolver después de corregir el servicio de una cita ya cobrada. Van a [Ajustes por corrección de servicio](/caja/ajustes-servicio).
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
3. Escoge **¿Para qué viene?**. Solo salen los servicios que tu negocio tiene prendidos, y si tiene uno solo no te lo pregunta: usa ese. Guardería y hotel pide el expediente completo, las vacunas y el contrato; veterinaria es corta (datos del dueño y de su mascota, sin contrato de guardería); estética es corta: solo pide el nombre y la raza de su perro, su tamaño, su pelaje, y el nombre y WhatsApp del dueño (sin dirección, sin vacunas, sin correo ni contraseña, sin contrato), y le enseña el precio del baño según su raza.
4. Escoge la **Vigencia del link** y toca **Generar link**.
5. Toca **Abrir WhatsApp** para mandárselo, o **Copiar link**.

El link le sirve hasta que termine todo, datos y firma. Si lo deja a medias, lo vuelve a abrir y sigue. En **Links pendientes** puedes **Reenviar** o **Cancelar** (también uno que ya guardó sus datos y le falta firmar; al cancelarlo, su ficha deja de decir que hay un link esperando).

Si el cliente ya tiene cuenta activa en el portal, no se genera link: la ficha dice **Este cliente ya tiene cuenta activa** y el link de alta con su teléfono se rechaza con el mismo aviso. No hace falta mandarle nada.

## Las vacunas en el alta

Si tienes guardería u hotel prendidos, el link de guardería y hotel trae el paso **Vacunas**: el dueño sube la foto o el PDF del carnet con la fecha de cada vacuna y desparasitación que pides. Lo que sube te llega a [Comprobantes por revisar](/recepcion/comprobantes) y no cuenta hasta que lo confirmes. Si no lo sube, el perro queda **Sin registro**: el alta se lo dice, y la app no le deja reservar guardería ni hotel hasta que registres sus vacunas (con el carnet en el mostrador o confirmando lo que mande desde su portal).

## Si algo no sale

- «El teléfono debe tener 10 dígitos.»: revisa el número; puede llevar espacios o guiones.
- «Ya hay un link de este tipo esperando a ese cliente.»: reenvía el que ya existe o cancélalo antes de generar otro.
- «A tu perro le falta: raza, tamaño…»: el dueño no puede pasar del paso **Tus perros** sin la raza (puede escribir **Mestizo** y escogerlo) y, con Estética, el tamaño y el pelaje cuando la raza no fija sola el precio.`,
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

1. En [Clientes](/clientes) toca **Capturar a mano**. Desde un buscador (al reservar o cobrar), y desde Guardería, Hotel, Estética o el inicio, es **Nuevo cliente** → **Capturarlo yo**.
2. Llena **Nombre del dueño** y **Teléfono**. El correo y la dirección son opcionales.
3. Toca **Crear cliente**: se abre la ficha del cliente recién creado (ahí agregas a su perro). Si venías de reservar o cobrar, el botón dice **Crear cliente y seguir con su perro**. Si llegaste desde **Nuevo cliente** → **Capturarlo yo** de Guardería, Hotel, Estética o el inicio, también dice **Crear cliente y seguir con su perro** y abre el alta de su perro, con **Seguir sin registrar perro** si todavía no lo vas a capturar. Si tu negocio tiene Veterinaria, dice **Crear cliente y seguir con su mascota** y abre el alta de su mascota (con **Seguir sin registrar mascota** para quedarte en su ficha).
4. En la ficha del cliente, toca **Agregar perro**.
5. Llena **Nombre del perro**, **Raza (obligatoria)** y lo que sepas, y toca **Guardar perro**. Con Estética, guardería u hotel la raza es obligatoria (si es mestizo, escoge **Mestizo**); con Estética, si la raza no fija sola el precio (mestizo, sin raza de catálogo o un grupo que cobra por tamaño y pelaje), también **Tamaño (obligatorio)** y **Pelaje (obligatorio)**. Si falta algo, el aviso dice qué y lo que ya escribiste se queda en el formulario.

> Si vienes de agendar estética, el alta es corta: nombre del dueño y WhatsApp, y del perro nombre, raza, tamaño y pelaje. Sin dirección, vacunas, correo ni contraseña.

> Si va a usar guardería u hotel, el contrato queda pendiente y se firma después. Lo que le falte al perro aparece en su ficha, en **Para guardería y hotel**: lo que impide reservar (vacunas obligatorias y evaluación) sale por separado de lo **Recomendado para hotel y guardería**, que no impide reservar.

## Si algo no sale

- «Escribe la raza del perro. Si no sabes cuál es, escoge «Mestizo».»: sale junto a **Raza** cuando se queda vacía; escríbela o escoge **Mestizo**.
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
2. En **Requisitos sanitarios** escoge el **Tipo de requisito** y la **Fecha de aplicación**. Si tienes la foto del carnet, toca **Elegir foto**. Termina con **Registrar aplicación**. El registro aparece de inmediato en la tabla de abajo.
   - Si ya hay uno del mismo tipo y la misma fecha, la pantalla avisa y no lo duplica.
   - ¿Te equivocaste? En la tabla, **Corregir** cambia la fecha, el detalle o las notas (queda guardado lo que decía antes) y **Anular con motivo** lo marca como anulado sin borrarlo. Es de admin o de quien tenga «Registrar vacunas y desparasitaciones».
3. En **Requisitos para guardería y hotel**, toca **Marcar evaluación hecha** cuando ya evaluaste su comportamiento (si tu negocio no la pide, lo dice ahí; se decide en [Requisitos para hospedar](/bienvenida/requisitos)). Arriba dice **Nada bloquea una reserva de guardería u hotel.** solo cuando de verdad nada la bloquea: talla, evaluación, vacunas obligatorias, celo y alertas, con la misma regla que la reserva. Si es hembra, marca **En celo** o **Gestante** cuando aplique.
4. En **Alertas de manejo** escoge la alerta en **Registrar alerta**, agrega notas y toca **Registrar alerta**.
5. En **Alergias** y **Peso** se registra cada cosa con su botón.

> En un negocio con guardería u hotel, un perro nuevo muestra lo que le falta para guardería y hotel. El aviso **Solo estética · vacunas no requeridas** sale solo cuando el negocio da estética y el perro ya viene a estética sin haber usado guardería ni hotel; con Veterinaria sola, sin guardería ni hotel, no sale ningún aviso de requisitos.

> Si le falta algo para guardería u hotel, arriba aparece la lista. Con **Capturar ahora** llenas solo lo vacío; con **Mandarle un link** el dueño lo completa desde su casa.

## Si algo no sale

Una perra marcada en celo o gestante, o un perro con una alerta que bloquea, no se puede reservar en guardería ni hotel. Quita la marca cuando ya no aplique.`,
  },
  {
    slug: "revisar-comprobante-sanitario",
    titulo: "Cómo revisar un comprobante sanitario que mandó el dueño",
    resumen: "El dueño sube la foto o el PDF del carnet desde su portal o desde el alta por link, y tú la confirmas o la rechazas.",
    grupo: "clientes",
    modulo: "portal",
    roles: ["admin", "recepcion"],
    rutas: ["/recepcion/comprobantes"],
    palabras: ["carnet", "vacuna del portal", "comprobante", "confirmar vacuna", "rechazar", "bandeja"],
    captura: "revisar-comprobante-sanitario.jpg",
    cuerpo: `Cuando un dueño sube el comprobante de una vacuna (desde su portal o en el alta por link), todavía no cuenta: alguien tiene que ver que coincida con lo que dice. Hasta que lo confirmes, el perro sigue con el requisito pendiente y no puede reservar guardería ni hotel.

1. Entra a [Comprobantes por revisar](/recepcion/comprobantes). Llegas también desde el aviso del tablero.
2. Cada comprobante trae la foto (o el link **Abrir el PDF del comprobante**), la **Aplicación (según el dueño)**, cuánto tiempo **Quedaría vigente** y desde cuándo espera.
3. Compara el comprobante con la fecha y el tipo de vacuna.
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
    cuerpo: `El dueño entra con su teléfono y su contraseña. Si te escribe diciendo que olvidó su contraseña, se la restableces tú: le das una contraseña temporal para que entre y la cambie en su portal.

1. Abre la ficha del cliente desde [Clientes](/clientes).
2. Baja a **Contraseña del portal** y toca **Restablecer contraseña**.
3. Lee el aviso: su contraseña actual deja de servir en ese momento. Toca **Sí, restablecer**.
4. Aparece la **Contraseña temporal**. Toca **Mandársela por WhatsApp** o cópiala.
5. Cuando el dueño entra con la temporal, su portal le pide escoger una contraseña nueva antes de dejarlo ver cualquier otra cosa. Al guardarla, la temporal deja de servir.

> La contraseña temporal se muestra una sola vez. Si cierras la pantalla sin mandarla, tendrás que generar otra.

## Si algo no sale

- Si no ves **Contraseña del portal**, el cliente todavía no tiene cuenta: no hay nada que restablecer. Usa **Invitar al portal** (o un link de alta) y la crea él con su teléfono.
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
    palabras: ["invitar al portal", "enlace de un solo uso", "cuenta del cliente", "vincular", "iniciar sesión", "acceso del dueño", "portal de clientes"],
    cuerpo: `El portal es la cuenta del dueño. La crea él mismo cuando llena su link de alta, con su teléfono y una contraseña.

## Cómo entra

1. Abre la [página de entrada](/login) de tu negocio. Tiene dos pestañas: **Soy cliente** (la que abre de entrada, con el campo **Teléfono**, 10 dígitos) y **Soy del equipo** (con **Teléfono o correo**, para el personal). El dueño escribe su **Teléfono** y su **Contraseña** y toca **Entrar**.
2. Si se equivoca de contraseña, el aviso sale una vez junto al botón y su teléfono se queda escrito: solo vuelve a escribir la contraseña.
3. Si la olvidó, en **Soy cliente** el aviso de «¿Olvidaste tu contraseña?» le dice que le escriba a recepción por WhatsApp (o que llame o pase al mostrador), y tú se la restableces desde su ficha ([Cómo restablecer la contraseña de un cliente](/ayuda/restablecer-contrasena-de-cliente)). En **Soy del equipo**, el aviso dice que la contraseña del personal la restablece un admin del negocio desde **Empleados** → su ficha → **Restablecer contraseña** (o desde **Administración** → **Cuentas**); si quien la olvidó es el dueño y único admin, que escriba al WhatsApp de PeluDesk.
4. Con esa contraseña temporal, al entrar el portal le pide escoger una nueva (**Guardar contraseña**) antes de seguir.
5. Para cambiarla cuando quiera, en su portal toca **Cambiar mi contraseña**, debajo de **Tus datos**. Toda contraseña que escoge el dueño (al activar su cuenta, en el alta por link o al cambiarla) pide lo mismo: «Usa al menos 8 caracteres».

Arriba del portal hay una sola barra fija con el nombre de tu negocio y **Salir**.

## Qué ve

- **Citas y reservas**: las próximas y su historial, de guardería, hotel y estética.
- **Tus perros**: la ficha de cada uno, su estado de salud, la bitácora con fotos y notas, medicamentos y alergias. En **Tus datos** de cada perro corrige su contacto de emergencia; el veterinario de cabecera, la autorización médica, el tope de gasto y las notas de alimentación solo salen si tu negocio tiene hotel, guardería o Veterinaria.
- Sus contratos por firmar, con un aviso en la portada.
- **Tus datos**, que puede corregir él.

Nunca ve precios de otros clientes ni la caja del negocio. En cada visita y en cada tarjeta, el nombre de la mascota abre su ficha.

El portal tiene su propia sesión, aparte de la del personal: si alguien del equipo abre el portal en el mismo navegador, su sesión de trabajo no se cierra. Un dueño que ya tenía sesión abierta antes de este cambio entra una sola vez más con su teléfono y contraseña. Para reservar, cambiar o cancelar te sigue escribiendo por WhatsApp.

## Invitar al portal a un cliente que ya existe

Si lo diste de alta tú en el mostrador, todavía no tiene cuenta. En su ficha, baja a **Invitar al portal** y toca **Invitar al portal**: aparece un enlace de un solo uso (sirve 7 días). Toca **Invitar al portal** (junto a **Mandar por WhatsApp**): te enseña el mensaje con el enlace y **Abrir WhatsApp con este mensaje** lo abre ya escrito para que tú lo mandes; o cópialo. El dueño lo abre, escoge su contraseña y entra con su teléfono. Si lo pierdes, **Generar otro enlace** deja sin efecto el anterior. Si el dueño ya activó su cuenta (por ejemplo, en otra ventana) y tocas **Generar otro enlace**, la pantalla oculta el enlace usado y dice **Este cliente ya tiene cuenta activa**: ya no hace falta mandar nada.

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
- «No hay una versión publicada de … todavía.»: un admin tiene que publicar la plantilla en [Contratos](/contratos). Para cambiar el texto, en el contrato aprieta **Publicar nueva versión**: mientras se publica el botón dice **Publicando…** y al terminar sale **Versión N publicada**; los contratos ya firmados conservan su versión.`,
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
    cuerpo: `Si la mascota ya tiene otra reserva en esas fechas, de guardería o de hotel, el aviso sale al elegirla, dice con cuál choca y lleva al calendario de ese día; «Crear reserva» no se activa hasta cambiar las fechas o quitarla. Si faltan datos que se recomiendan para hotel y guardería (fecha de nacimiento, alimentación, contacto de emergencia, veterinario) sale un aviso que no impide reservar, con enlace a la ficha. Si la fecha que escogiste cae en un día que el negocio no atiende, el campo lo marca con la regla («El hotel no recibe perros los domingos») y **Crear reserva** se queda apagado hasta que cambies la fecha o marques **El negocio está cerrado ese día; registrar de todos modos**: con la casilla se guarda y la reserva lo enseña («Reservada con el negocio cerrado: entrada el domingo 1/11/2026»). Si abres **Nueva reserva** en un día cerrado (por ejemplo, desde el calendario), o es hoy y ya pasó la hora de cierre, el formulario se queda en ese día (nunca te cambia la fecha solo) y sale el aviso naranja **Fuera de horario: el negocio está cerrado ese día.** con el siguiente día abierto («Te propongo el lunes 2.») y el botón **Usar ese día**, que pone esa fecha de entrada; puedes registrarla igual en el día cerrado con la casilla. Si faltan vacunas o la evaluación de comportamiento, el aviso de abajo ofrece autorizar la excepción solo a quien tiene el permiso «Excepciones al reservar»; a los demás les dice qué falta y a quién pedírsela. Al marcar a cada perro sale su **Precio** («Precio: 2 noches × $450.00 = $900.00»). Si el precio de ese servicio depende de la talla y el perro no la tiene capturada, en su lugar sale, junto a los avisos de evaluación y vacunas, «Falta la talla de Nina: sin ella no se puede calcular el precio.» con el selector **Talla** ahí mismo: escógela y toca **Guardar en su expediente y calcular**; se guarda en su expediente y el precio sale sin salir de la pantalla. Mientras falte, **Crear reserva** se queda apagado y junto al botón dice qué falta. Un servicio cuyo precio no depende de la talla no la pide. Lo mismo en el walk-in y en **Nueva serie** (ahí el botón es **Crear serie y generar horizonte**).

Una reserva aparta el lugar del perro y revisa, antes de guardar, que tenga todo en regla y que haya cupo.

1. En [Guardería](/guarderia) toca **Nueva reserva**.
2. Busca al dueño por perro, nombre o teléfono. Con varias palabras, cada una tiene que estar en el dueño, en alguno de sus perros o, si es un número, en el teléfono («Motita Pérez» trae a Motita de Pérez). Si es nuevo, usa **Nuevo cliente**.
3. Marca a cada perro que viene y escoge el **Servicio** y la **Fecha**. Si es por hora, pon las **Horas (estimado)**.
4. Si el perro tiene day pass o mensualidad, aparece **Tiene pases disponibles**: escoge si usa un pase o paga el día suelto.
5. Toca **Crear reserva**. Desde el resultado puedes **Hacer check-in ahora →**.

## Perros que vienen siempre los mismos días

En **Series recurrentes** toca **Nueva serie**, escoge el perro, el servicio y los días de la semana, y toca **Crear serie y generar horizonte**.

## Si algo no sale

- «Falta … vigente de …» (vacunas vencidas o sin registro): el aviso sale en cuanto marcas a la mascota, con su enlace al expediente, y **Crear reserva** se queda apagado mientras falte algo. Registra la vacuna en su expediente. Un admin, o quien tenga el permiso «Excepciones al reservar», ve ahí mismo, bajo el aviso, la casilla **Autorizar excepción**; la marca, escribe el motivo y toca **Reintentar con excepción**. Quien no tiene ese permiso no ve la casilla: el aviso solo dice qué falta y que no se puede reservar, y que le pida la excepción a un admin o a quien tenga el permiso.
- «Este perro no tiene evaluación previa de comportamiento.»: el aviso sale en cuanto eliges a la mascota, con un enlace para completar la evaluación en su expediente. Un admin (o quien tenga el permiso de excepciones) puede reservar sin ella marcando la excepción ahí mismo y escribiendo el motivo; quien no lo tiene ve que no se puede reservar y a quién pedírsela.
- «No hay cupo disponible (diurno) para el …»: ese día ya está lleno.
- «Guardería no abre en …»: escoge un día con horario, o marca **El negocio está cerrado ese día; registrar de todos modos** si de verdad lo vas a recibir.
- «Nina ya tiene una reserva de guardería el … (reservada) que se traslapa con estas fechas»: el aviso dice con qué reserva choca (mascota, módulo, fechas y estado). Toca **el calendario** al final para ver ese día ([Calendario de reservas](/ayuda/calendario-de-reservas)). Una visita ya **Finalizada** no impide reservar otra el mismo día.`,
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
    cuerpo: `Si la mascota ya tiene otra reserva en esas fechas, de guardería o de hotel, el aviso sale al elegirla, dice con cuál choca y lleva al calendario de ese día; «Crear reserva» no se activa hasta cambiar las fechas o quitarla. Si faltan datos que se recomiendan para hotel y guardería (fecha de nacimiento, alimentación, contacto de emergencia, veterinario) sale un aviso que no impide reservar, con enlace a la ficha. Si la fecha que escogiste cae en un día que el negocio no atiende, el campo lo marca con la regla («El hotel no recibe perros los domingos») y **Crear reserva** se queda apagado hasta que cambies la fecha o marques **El negocio está cerrado ese día; registrar de todos modos**: con la casilla se guarda y la reserva lo enseña («Reservada con el negocio cerrado: entrada el domingo 1/11/2026»). Si abres **Nueva reserva** en un día cerrado (por ejemplo, desde el calendario), o es hoy y ya pasó la hora de cierre, el formulario se queda en ese día (nunca te cambia la fecha solo) y sale el aviso naranja **Fuera de horario: el negocio está cerrado ese día.** con el siguiente día abierto («Te propongo el lunes 2.») y el botón **Usar ese día**, que pone esa fecha de entrada; puedes registrarla igual en el día cerrado con la casilla. Si faltan vacunas o la evaluación de comportamiento, el aviso de abajo ofrece autorizar la excepción solo a quien tiene el permiso «Excepciones al reservar»; a los demás les dice qué falta y a quién pedírsela. Al marcar a cada perro sale su **Precio** («Precio: 2 noches × $450.00 = $900.00»). Si el precio de ese servicio depende de la talla y el perro no la tiene capturada, en su lugar sale, junto a los avisos de evaluación y vacunas, «Falta la talla de Nina: sin ella no se puede calcular el precio.» con el selector **Talla** ahí mismo: escógela y toca **Guardar en su expediente y calcular**; se guarda en su expediente y el precio sale sin salir de la pantalla. Mientras falte, **Crear reserva** se queda apagado y junto al botón dice qué falta. Un servicio cuyo precio no depende de la talla no la pide. Lo mismo en el walk-in y en **Nueva serie** (ahí el botón es **Crear serie y generar horizonte**).

El hotel se reserva igual que la guardería, pero con entrada y salida: se cobran las noches que hay entre las dos fechas.

1. En [Hotel](/hotel) toca **Nueva reserva**.
2. Busca al dueño por perro, nombre o teléfono. Con varias palabras, cada una tiene que estar en el dueño, en alguno de sus perros o, si es un número, en el teléfono («Motita Pérez» trae a Motita de Pérez). Si es nuevo, usa **Nuevo cliente**.
3. Marca a cada perro que se queda, escoge el **Servicio** y pon la **Entrada** y la **Salida**.
4. Agrega **Notas (opcional)** si hay algo que el equipo deba saber.
5. Toca **Crear reserva** y luego **Ver reserva** para revisar la cuenta.

Si el perro ya está en la puerta sin reserva, usa **Walk-in (sin reserva)** desde el check-in de hotel.

> La ocupación que ves es la de toda la casa: guardería y hotel comparten el mismo espacio.

## Si algo no sale

- «No hay cupo disponible (nocturno) para el …»: esa noche ya está llena.
- «El hotel no recibe perros en …» o «El hotel no entrega perros en …»: cambia la llegada o la salida a un día con horario, o marca **El negocio está cerrado ese día; registrar de todos modos**.
- «Falta la talla de …: sin ella no se puede calcular el precio.»: escoge la talla en el selector del aviso y toca **Guardar en su expediente y calcular**.
- «Esta perra está marcada en celo…»: no se puede quedar mientras dure.`,
  },
  {
    slug: "calendario-de-reservas",
    titulo: "Calendario de reservas de guardería y hotel",
    resumen: "Ves la ocupación de cada día contra el cupo y todas las reservas por venir, y las abres, mueves o cancelas desde ahí.",
    grupo: "guarderia",
    modulo: ["guarderia", "hotel"],
    roles: ["admin", "recepcion"],
    rutas: ["/reservas/calendario"],
    palabras: ["calendario", "cupo", "ocupación", "reservas futuras", "próximas reservas", "lista de reservas", "mover reserva", "cancelar reserva", "semana", "mes"],
    cuerpo: `El calendario junta la guardería y el hotel: cuántos perros hay cada día contra el cupo y todas las reservas por venir. Está en el menú, en **Calendario**.

## Ver la ocupación

1. Escoge **Semana** o **Mes**. Con **←**, **Hoy** y **→** te mueves de fecha.
2. Cada día dice cuántos perros hay contra el cupo (por ejemplo, 12/35) y, en pantallas grandes, cuántos son de guardería y cuántos de hotel (contra el cupo de noche). Verde: hay reservas; ámbar: casi lleno (80 % o más); rojo: lleno.
3. El cupo es el de toda la casa: guardería y hotel comparten el mismo espacio.

Cómo se cuenta cada día (igual aquí, en el tablero de Guardería y de Hotel, en el inicio y al reservar):
- **Hoy**: los perros que están adentro (con check-in y sin check-out), aunque su salida ya haya vencido, y las reservas que entran hoy y todavía no hacen check-in (llegadas pendientes). Al hacer el check-out, el lugar se libera en ese momento. Una llegada pendiente que marcas «No llegó» o cancelas deja de contar y libera su lugar. Con 8 adentro, 5 por llegar y cupo de 10, la app ya no deja reservar hoy.
- **Días pasados**: los que estuvieron adentro ese día.
- **Días que vienen**: las reservas vivas que cubren ese día y los perros que siguen adentro si su salida prevista llega hasta ese día.
- **Llegó antes de su reserva**: si haces el check-in antes de la fecha de entrada reservada, el perro cuenta desde el día en que de verdad llegó (y sale en el panel de ese día), no desde la fecha reservada.
- **Salió antes**: el check-out libera en ese momento todos los días que le quedaban; ya no cuenta en ninguno de los que siguen.
- **Se quedó de más**: un perro que sigue adentro después de su salida prevista cuenta hoy; en los días que vienen, solo hasta su salida prevista.
- Las canceladas y las de «No llegó» nunca cuentan.
- **Llegadas atrasadas**: una reserva cuya fecha de entrada ya pasó sin check-in deja de contar desde el día siguiente a su entrada, pero sigue viva. El tablero de Guardería y el de Hotel la enseñan arriba, en **Llegadas atrasadas**, con tres botones: **No llegó** (te pide confirmar), **Check-in tardío** (desde ese momento vuelve a contar como adentro; si con él la casa rebasa el cupo, te lo dice y pide confirmar) y **Reprogramar** (abre la reserva para mover sus fechas; con la entrada nueva, vuelve a contar).

## Ver las reservas de un día

Toca el día. Abajo salen sus reservas con la mascota, el dueño, el estado y la cuenta (por ejemplo, «Debe $350.00», «Pagada» o «Cuenta cancelada»). Una reserva cancelada dice «Total $0.00» y, si se cobró algo, cuánto se cobró y cuánto se devolvió («cobrado $100.00 · devuelto $100.00»).

## Próximas reservas

Al tocar un día, el panel enseña todas sus reservas, también las finalizadas y las canceladas, cada una con su estado, y el perro que sigue adentro con la salida vencida. Desde un día de hoy en adelante, **+ Reserva de hotel este día** y **+ Reserva de guardería este día** abren la reserva nueva con esa fecha de entrada.

Más abajo está la lista de lo que viene. Filtra por **Módulo**, **Estado** y **Desde** y toca **Filtrar**. De cada reserva puedes:

- **Abrir**: va a la reserva, con su cuenta y sus cargos.
- **Mover fechas**: escoge la nueva fecha (y la salida, si es hotel). Antes de guardar se ve en cuánto queda la cuenta («Total de la cuenta: $400 → $600 · Saldo…»); **Guardar fechas** solo se activa con esa vista previa. Si el total cambió mientras tanto, no se guarda y te lo vuelve a enseñar.
- **Cancelar**: pide confirmar; libera el cupo y, si usó un pase, se lo devuelve. Desde la reserva (**Cancelar toda la reserva** o **Cancelar** de un perro) también puedes escribir un **Motivo (opcional)**: queda en la bitácora con tu nombre y la hora, y la reserva lo enseña («Cancelada por … el …. Motivo: …»). La estancia cancelada ya no suma: en la reserva su total queda en **$0.00** (en el desglose de la estancia, «Base: $0.00 (no se cobra; era $…)», y el total sin esa base) y arriba ves el **Total**, lo **Cobrado** y lo **Devuelto**. Si se había cobrado un anticipo, queda como saldo a favor del cliente y se devuelve en **Cobrar** con **Registrar devolución**.

Solo se pueden mover o cancelar las reservas **Reservada** o **Confirmada**. Si el perro ya hizo check-in, la salida se hace desde su estancia.

## Cuando una cuenta se cancela pero la reserva sigue

Al cancelar una cuenta en [Caja](/caja), marca la casilla para cancelar también la reserva. Si no se marcó, la reserva sigue ocupando cupo: aquí la ves con **Cuenta cancelada** y la puedes cancelar.

## Si algo no sale

- «No hay cupo disponible…»: ese día ya está lleno; mira el calendario y escoge otro.
- «Este perro ya tiene una reserva en fechas que se traslapan» (o «… ya tiene una reserva de hotel … que se traslapa»): el aviso trae un enlace a **esa reserva** y otro al calendario en esa fecha.
- «No se guardó: alguien más cambió esta reserva»: otra persona la movió o la canceló mientras la tenías abierta. Mira [Qué hacer cuando alguien más cambió lo que estabas editando](/ayuda/alguien-mas-cambio-lo-que-editabas).
- Una reserva **cancelada** sin saldo no tiene botón de cobrar: dice «Reserva cancelada: no hay nada por cobrar». Si se usó algo que sí se cobra (un cargo), dice cuánto se debe y el botón dice **Cobrar** con el monto.`,
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
4. En **Quién entrega al perro** escoge al dueño o a su contacto de emergencia. Si lo trae alguien más, escoge **Otra persona (escribo su nombre)** y escribe su nombre en **Nombre de la otra persona** y, de preferencia, su teléfono: así queda claro que no fue el dueño.
5. Anota el **Estado del perro a la llegada (opcional)** y toca **Tomar/subir foto**.
6. En **Agregar pertenencia** escribe lo que trae (correa, cama, juguete) y toca **Agregar**. Las que se anotaron al reservar salen ahí como **Ya declaradas en la reserva**.
7. Toca **Confirmar check-in**. El formulario se cierra, queda **Check-in registrado a las** (la hora), la confirmación lista las **Pertenencias recibidas** y la estancia pasa a **en curso**.

> **Con la casa llena** (por ejemplo, el check-in tardío de una llegada atrasada): no se bloquea, pero antes de registrar te dice «La casa está llena (10/10); al registrar la entrada quedas en 11/10.» Toca **Registrar la entrada de todos modos** para confirmar o **Todavía no**. Lo confirmado queda anotado en la bitácora con tu nombre y la hora, y la reserva lo enseña: «Entró con la casa llena: quedó en 11/10 de día.»

> **Fuera del horario** (un día que el negocio no abre, o antes de abrir o después de cerrar): tampoco se bloquea. Al tocar **Confirmar check-in** te pregunta «El negocio está cerrado hoy; ¿registrar de todos modos?» (o «El negocio está cerrado a esta hora (hoy abre de 09:00 a 19:00); …»). Toca **Registrar la entrada de todos modos** o **Todavía no**. Lo confirmado queda en la bitácora y la reserva lo enseña: «Entró fuera del horario: domingo 25/10/2026, el negocio no abre ese día.»

> Las vacunas vencidas, la falta de evaluación, el celo, la gestación y las alertas que bloquean se revisan al reservar: si el perro tiene reserva, ya pasó por ahí. Aun así, fíjate en los avisos antes de recibirlo.

## Si algo no sale

- **Confirmar check-in** está apagado y junto a él dice «Falta: escoge quién entrega al perro.»: escoge de la lista (el campo lleva * y «obligatorio»). Con **Otra persona**, si falta el nombre, dice «Falta: el nombre de quien entrega al perro.».
- Si no tiene reserva, usa **Walk-in (sin reserva)** en la lista de check-in.
- Si el check-in se hizo por error y el perro venía con pase, quien tenga el permiso «Ajustar días de pases» toca **Deshacer este check-in** (ver [Cómo ajustar los días usados de un pase](/ayuda/ajustar-dias-usados-de-un-pase)).`,
  },
  {
    slug: "registrar-check-out-y-cobrar",
    titulo: "Cómo registrar un check-out y cobrar la estancia",
    resumen: "Entregas al perro con sus cosas, registras quién lo recoge y cobras la cuenta en Caja.",
    grupo: "guarderia",
    modulo: "guarderia",
    roles: ["admin", "recepcion"],
    rutas: ["/reservas/estancias/[id]/checkout", "/guarderia/checkout", "/hotel/checkout", "/admin/hotel"],
    palabras: ["salida", "entrega", "recoger perro", "cobro", "cuenta", "noche extra", "salida anticipada", "sale antes", "noches no usadas", "estancia completa", "configuración de hotel"],
    cuerpo: `El check-out cierra la estancia: el perro sale con sus cosas y queda anotado quién se lo llevó. Después se cobra en Caja.

1. Toca **Check-out** en el tablero o en Guardería u Hotel, y escoge al perro.
2. Si hace falta, agrega cargos en **Aplicar cargo** y toca **Aplicar**. Después de la salida, **Aplicar cargo** sigue en el bloque de la estancia de la reserva solo mientras la cuenta tenga saldo o no se haya cobrado; con la cuenta pagada ya no sale (para cambiarla, anula el cobro o registra una devolución).
3. Las pertenencias salen sin palomear: confirma cada una con su casilla, o toca **Entregué todo** para marcarlas de un toque. Si confirmas la salida con alguna **sin entregar**, escribe el **Motivo de lo que no se entrega**: es obligatorio y queda registrado. Al terminar, la pantalla de salida lista lo que se devolvió y lo que no, con ese motivo.
4. Escribe **Quién recoge al perro** y marca **Sí, es el dueño** o **No, persona autorizada**.
5. Toca **Confirmar salida**. Si es un día que el negocio no abre, o fuera de su horario, te pregunta «El negocio está cerrado hoy; ¿registrar de todos modos?»: toca **Registrar la salida de todos modos** (queda en la bitácora y en la reserva: «Salió fuera del horario: …») o **Todavía no**. Sale **Salida registrada** con el botón **Cobrar la cuenta**, que abre el cobro de esa reserva (también aparece en la pantalla de salida de un perro que ya salió). Si la cuenta ya no tiene saldo por cobrar, el botón dice **Ver cobros**.

En hotel, si se queda más, toca **Extender la salida**, escoge la nueva salida y revisa en cuánto queda la cuenta antes de guardar. Si un perro de guardería sigue aquí después del cierre, puedes **Convertir en noche de hotel**.

## Si sale antes de lo reservado

Cuando el perro sale antes de su salida prevista, la cuenta baja a las noches que usó (en una estancia de guardería cobrada por día, a los días que usó). La pantalla de salida lo dice antes de confirmar, en el aviso **Salida anticipada**: «Sale 1 noche antes: la cuenta baja de $450 a $270». Al tocar **Confirmar salida**, lo no usado se quita con una corrección de precio con el motivo «Salida anticipada» (en la cuenta sale como «Corrección de precio: … — 1 noche no usada»), con la misma tarifa calculada para lo que sí usó, y **Salida registrada** dice «Salió 1 noche antes: la cuenta se ajustó a lo que usó (motivo «Salida anticipada»)». La corrección se ve y se anula como cualquier otra ([Cómo anular o corregir un cobro](/ayuda/anular-o-corregir-un-cobro)). En la reserva, el bloque de la estancia dice las noches que usó («Precio: 1 noche × $450.00 (salió antes; tenía 2 noches reservadas)»), cada línea de su cuenta («Hotel (por noche): 2 noches reservadas × $450.00 = $900.00», «Ajuste por salida anticipada: −$450.00» con su motivo, sus cargos) y **Total de la estancia**: la misma cifra que el total de arriba, Caja y el calendario. En Reportes, **Noches de hotel** cuenta las que usó.

No se ajusta si la estancia está cubierta con pase («está cubierta con pase, la cuenta no cambia») ni si la línea ya tiene una corrección de precio («la línea ya tiene una corrección de precio, la cuenta no cambia»): ahí la ajustas tú desde la cuenta.

Si tu negocio cobra la estancia completa aunque el perro salga antes, el admin lo marca en [Configuración de hotel](/admin/hotel) (en el menú, **Configuración de hotel**; lo abre el admin o quien tenga el permiso «Configuración del negocio», con Guardería u Hotel prendido): casilla **Cobrar la estancia completa aunque salga antes** y **Guardar**. Con ella, el aviso dice «Se cobra la estancia completa ($450) por la política del negocio» y la cuenta no cambia.

## Cobrar

1. Toca **Cobrar la cuenta** al terminar el check-out, o ve a [Caja](/caja) y toca su cuenta en **Cuentas abiertas de hoy**.
2. Escoge el **Método**, el **Monto** y la **Propina** si hay. Para pagar con dos métodos, toca **+ Repartir en otro método**.
3. Toca **Registrar cobro**.

## Si algo no sale

- «No hay turno de caja abierto. Ábrelo antes de cobrar.»: toca **Abrir turno**, pon el **Fondo inicial** y **Confirmar apertura**.
- El campo **Quién recoge al perro** (o la pregunta del dueño) se marca en rojo y dice qué falta: escribe el nombre e indica si es el dueño.`,
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
2. Busca al dueño por perro, nombre o teléfono (con varias palabras, todas tienen que coincidir).
3. Toca **Vender paquete**.
4. Escoge el **Perro** y el **Paquete**.
5. Escoge el **Método** y el **Monto**. Para pagar con dos métodos, usa **+ Repartir en otro método**.
6. Toca **Confirmar venta**.

En la misma pantalla ves los pases que le quedan a cada perro. Al venderlo se genera el contrato de guardería, que el dueño firma desde su portal.

Si el pase ya se venía usando antes de registrarlo, marca **Este paquete ya lleva días usados** y escribe **Días que ya lleva usados** (así nace con el saldo descontado y sin cobrar nada de más). Eso y corregir días después lo explica [Cómo ajustar los días usados de un pase](/ayuda/ajustar-dias-usados-de-un-pase).

## Si algo no sale

- «No hay turno de caja abierto. Ábrelo antes de vender un bono.»: abre el turno en [Caja](/caja).
- «Escoge el perro para el que es el paquete.»: el paquete siempre es de un perro.
- «Este perro está marcado como fallecido: no se le puede vender un paquete.»
- «Registrar un pase con días ya usados requiere el permiso «Ajustar días de pases».»: pídeselo a un admin, o vende el pase completo.`,
  },
  {
    slug: "ajustar-dias-usados-de-un-pase",
    titulo: "Cómo ajustar los días usados de un pase",
    resumen: "Corriges cuántos días lleva usados un pase, con motivo y sin tocar dinero ni caja.",
    grupo: "bonos",
    modulo: "bonos",
    roles: ["admin", "recepcion"],
    rutas: ["/guarderia/pases", "/caja/pases"],
    palabras: ["días usados", "saldo del pase", "corregir pase", "pase de más", "pase de menos", "check-in por error", "pase que ya traía", "deshacer check-in", "devolver un día"],
    cuerpo: `Cada check-in con pase descuenta un día. Si se descontó de más, de menos o por error, o si el pase ya traía días usados de antes de PeluDesk, lo corriges aquí. Un ajuste solo cambia el saldo de días: no cobra nada, no mueve la caja ni los reportes de dinero, y queda en el historial del pase.

Necesitas el permiso «Ajustar días de pases» (los admin lo tienen siempre; a recepción se lo da un admin en [Permisos](/admin/permisos)).

## Corregir los días usados de un pase

1. Entra a [Day pass y mensualidad](/guarderia/pases), busca al dueño y ubica el pase del perro. También lo encuentras en el expediente del perro y en el check-in.
2. Toca **Ajustar días usados**.
3. Pon el total de días usados que debe llevar, o usa **−1** y **+1**.
4. Si sabes qué días fueron, pon sus fechas (son opcionales).
5. Elige el **Motivo**: Check-in marcado por error, Día no registrado, Uso previo a PeluDesk, u Otro (y escribe cuál).
6. Revisa el cuadro **Antes → después** (días usados, restantes y vencimiento) y toca **Confirmar ajuste**.

Si el pase se había acabado y el ajuste le devuelve días, te lo avisa: se reabre y se respeta su vigencia. Si ya venció, el ajuste se guarda pero el pase sigue vencido: un admin puede poner una nueva vigencia en **Extender la vigencia hasta**.

## Deshacer un check-in hecho por error

En el check-in de un perro que viene con pase y ya está adentro, toca **Deshacer este check-in**, elige el motivo y confirma. El perro vuelve a «reservada», el día regresa al pase y el check-in que se había capturado queda guardado en el historial del pase. Si el perro de verdad no llegó, cancela la estancia o márcala «no llegó».

## Ver qué se ajustó

Toca **Ver historial de ajustes** en el pase: cada renglón dice antes y después, fechas, motivo, quién y cuándo. No se edita ni se borra: un ajuste se corrige con otro ajuste. En [Reportes](/reportes), «Días de pase» separa los días reales de los ajustados a mano.

## Si algo no sale

- «Los días usados no pueden ser menos de 0.» o «Este pase es de N días: no puede llevar X usados.»: el total va de 0 al total del pase.
- «Con «Otro», escribe el motivo.»: explica en una frase qué pasó.
- «Marcaste X fecha(s) pero el ajuste es de Y día(s).»: pon una fecha por día o deja todas vacías.
- «No tienes el permiso «Ajustar días de pases».»: pídeselo a un admin.
- «Solo un admin puede cambiar la vigencia de un pase.»: pídele a un admin que la extienda.`,
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
    cuerpo: `La recolección se cobra por kilómetro. La distancia de cada cliente se calcula una vez desde su dirección y se reutiliza cada vez que lo recoges. El precio por kilómetro puede ir por tramos: el tramo lo decide la distancia **total** del viaje y luego se multiplica por los kilómetros (por ejemplo, de 1 a 5 km a $10 y desde 6 km a $8: un viaje de 7 km cuesta 7 × $8 = $56). Al editar el servicio (Servicios → el cargo) y en sus **Tarifas**, el recuadro **Cómo se cobra este servicio** enseña tus tramos y cuánto se cobra a 7 km con ellos; si todavía no tiene tramos, muestra un ejemplo con cifras de ejemplo y el botón **Capturar tramos**, que lleva directo a la matriz. Un **traslado a domicilio** del catálogo de Servicios extra se cobra por **zona**: un precio por viaje, sin multiplicar por kilómetro.

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

- «Falta ubicar la dirección del negocio en el mapa…»: el admin escribe la dirección en [Perfil y página web](/admin/perfil) y aprieta **Ubicar en el mapa** en Administración → Ubicación para recolección. Mientras, pon la distancia a mano.
- La ruta sale de la dirección del negocio. Si la camioneta sale de otro lado, el admin escribe ese **Punto de salida de recolección (solo si es distinto a la dirección del negocio)** en Ubicación para recolección.
- «Tu negocio ya usó las … consultas de Google Maps de este mes.»: captura los kilómetros a mano; el mes que entra vuelve a calcularse solo.`,
  },
  {
    slug: "alguien-mas-cambio-lo-que-editabas",
    titulo: "Qué hacer cuando alguien más cambió lo que estabas editando",
    resumen: "Si otra persona guardó cambios en la misma reserva, cita, cliente o ajuste mientras lo tenías abierto, no se guarda nada encima sin avisarte.",
    grupo: "inicio",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["conflicto", "otra persona", "alguien más", "se guardó encima", "recargar", "guardar encima", "dos personas", "al mismo tiempo", "cambios perdidos"],
    cuerpo: `Cuando dos personas tienen abierta la misma reserva, cita, consulta, ficha de cliente o mascota, precio, empleado (también su horario y su esquema de pago) o ajuste del negocio, PeluDesk no deja que una borre sin querer lo que guardó la otra.

## Qué ves

Si guardas y alguien más ya había cambiado ese registro, **no se guarda nada** y sale un aviso como:

> Ana cambió esta reserva hace 2 min: salida 21 oct, total $900. ¿Recargar con sus cambios o guardar los tuyos encima?

Lo que escribiste sigue en la pantalla.

## Qué hacer

- **Recargar con sus cambios**: la pantalla trae lo que guardó la otra persona. Revisa y, si hace falta, vuelve a hacer tu cambio.
- Desde el primer aviso ya ves qué pasaría si guardas lo tuyo: «Si guardas los tuyos encima: se guardaría tu cambio de servicio. Lo que puso Ana en fecha y hora se conservaría.» Es el mismo cálculo que la confirmación.
- **Guardar los míos encima**: antes de **Sí, guardar los míos encima** te dice exactamente qué pasa con lo de la otra persona, campo por campo. Hay pantallas que solo guardan lo que tocaste (reprogramar una cita, corregir su servicio, mover fechas, cada sección de la consulta): «Se guarda tu cambio de servicio. Lo que puso Ana en fecha y hora se conserva.» Otras mandan el formulario completo (la ficha del cliente o de la mascota): «Se guarda tu cambio de nombre. Lo que puso Ana en teléfono se sustituye por lo de esta pantalla.» En el horario o el esquema de pago de un empleado y en los precios se guarda lo de tu pantalla completo. Queda anotado quién lo hizo.

También te avisa si el cambio lo hiciste tú mismo en **otra pestaña**: el aviso dice «Cambiaste esta cita desde otra pestaña hace 40 s: …» con los mismos dos botones. Lo que se cuida es la versión que tiene tu pantalla, no quién la cambió. Lo único que no avisa es lo que hiciste en esta misma pestaña (por ejemplo, aplicar una vacuna y luego guardar la consulta).

## Mover fechas

Al mover las fechas de una reserva, antes de guardar ves en cuánto queda la cuenta. Si el total cambió entre que lo viste y que guardaste, no se guarda y te enseña el total nuevo.`,
  },
];
