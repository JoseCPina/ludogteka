import type { Articulo } from "../tipos";

// Caja y cobros + Estética. Cada botón, campo y mensaje citado aquí existe
// tal cual en la app: si cambia la pantalla, cambia el artículo.
export const ARTICULOS_CAJA_Y_ESTETICA: Articulo[] = [
  {
    slug: "cobrar-una-cuenta",
    titulo: "Cómo cobrar una cuenta",
    resumen: "Cobrar en efectivo, transferencia o terminal, con propina y en varios métodos a la vez.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja", "/caja/cobrar/[reservaId]", "/reservas/[id]/cobrar"],
    palabras: ["cobrar", "pagar", "saldo", "propina", "efectivo", "transferencia", "cuenta abierta"],
    captura: "cobrar-una-cuenta.jpg",
    cuerpo: `Todo lo que se le debe a un cliente (estancias, citas de estética, cargos y ventas) aparece en Caja con su saldo. Desde ahí lo cobras en uno o varios métodos.

1. Entra a [Caja](/caja) y busca la cuenta en **Cuentas abiertas de hoy**, o escribe el perro, el dueño o el teléfono en **¿A quién le cobras?**.
2. Abre la cuenta y revisa los conceptos y el **Saldo**.
3. Si no hay turno, aprieta **Abrir turno**, escribe el **Fondo inicial** y **Confirmar apertura**.
4. En **Registrar cobro** escoge el **Método** (Efectivo, Terminal o Transferencia), escribe el **Monto** y, si dejó, la **Propina**.
5. ¿Paga una parte en efectivo y otra con tarjeta? Aprieta **+ Repartir en otro método** y llena el segundo renglón.
6. Aprieta **Registrar cobro**. El saldo baja y el cobro queda en **Cobros de esta reserva**.

> El método **Terminal** de aquí es para una terminal que no está conectada a la app. Si tienes Mercado Pago o Clip conectados, usa [Cómo cobrar con la terminal](/ayuda/cobrar-con-terminal).

Si el perro tiene day pass o mensualidad, junto a su línea sale **Pagar con bono**.

## Si algo no sale

- «No hay turno de caja abierto. Ábrelo antes de cobrar.»: abre el turno en el mismo aviso.
- «Cada método debe tener un monto mayor a cero.»: quita el renglón vacío con **Quitar**.`,
  },
  {
    slug: "cobrar-con-terminal",
    titulo: "Cómo cobrar con la terminal",
    resumen: "Mandar el monto a la terminal de Mercado Pago o Clip y que el cobro se registre solo.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["terminal", "tarjeta", "Mercado Pago", "Clip", "Point Smart", "meses sin intereses"],
    captura: "cobrar-con-terminal.jpg",
    cuerpo: `Si tu negocio tiene conectada su terminal, mandas el monto desde la cuenta, el cliente paga con tarjeta y el cobro entra solo. No capturas nada a mano.

1. Abre la cuenta desde [Caja](/caja). Necesitas el turno abierto.
2. En el recuadro **Cobrar con** (dice Mercado Pago o Clip) aprieta **Cobrar con terminal**.
3. Revisa el **Monto**: viene con el saldo. Si quieres, escribe un **Concepto (opcional)**.
4. Con Mercado Pago puedes escoger **Meses sin intereses**.
5. Aprieta **Mandar a la terminal** y pídele al cliente que pague ahí.
6. Cuando la terminal lo confirma, sale «Pago confirmado. El cobro ya quedó registrado.» y el saldo baja.

> Los meses sin intereses los absorbe el negocio y tienen que estar activados en su cuenta de Mercado Pago.

> La terminal la conecta el admin en [Cobro con terminal](/admin/pagos). Con Mercado Pago funciona la Point Smart.

## Si algo no sale

- «Ya hay un cobro en la terminal para esta cuenta. Espéralo o cancélalo antes de mandar otro.»
- «No hay terminal escogida. El admin la escoge en Administración → Cobro con terminal; mientras, cobra a mano.»
- Si la terminal no responde, ve [Qué hacer si la terminal no recibe el cobro](/ayuda/terminal-no-recibe-el-cobro).`,
  },
  {
    slug: "terminal-no-recibe-el-cobro",
    titulo: "Qué hacer si la terminal no recibe el cobro",
    resumen: "Cuando el cobro no le llega a la terminal, la terminal no confirma o el pago llegó sin turno abierto.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["terminal no responde", "no llega", "no le llega", "no aparece en la terminal", "modo PDV", "cancelar cobro", "sin turno", "pago pendiente"],
    cuerpo: `La app espera la respuesta de la terminal unos 2 minutos. Si no llega, te da la salida para no dejar al cliente parado.

## Si la terminal no muestra el cobro

- Revisa que esté encendida y con internet.
- Con Mercado Pago, si sale «La terminal no está en modo PDV (integrado).», el admin aprieta **Poner en modo integrado** en [Cobro con terminal](/admin/pagos).
- Si sale «La terminal ya tiene una orden en curso.», cancela en la terminal la orden anterior.

## Si pasan los 2 minutos

Sale «La terminal no ha respondido».

1. Si el cliente no pagó, aprieta **Cancelar y registrar a mano** y cóbrale en **Registrar cobro**.
2. Si tienes duda, aprieta **Seguir esperando**.

> Si el cliente SÍ pagó en la terminal, no registres nada a mano: en cuanto el proveedor lo confirme, el cobro entra solo aunque hayas cancelado aquí.

Antes de los 2 minutos también puedes apretar **Cancelar cobro en terminal**.

## Pagos que llegaron sin turno

Si un pago se confirma sin turno abierto, la orden dice «Pagado, sin turno» y en [Caja](/caja) sale un aviso. Se registran solos al abrir el turno; si el turno ya estaba abierto, aprieta **Registrar en este turno** para que entren a este corte.`,
  },
  {
    slug: "link-de-pago-whatsapp",
    titulo: "Cómo mandar un link de pago por WhatsApp",
    resumen: "Cobrar un anticipo o un saldo sin que el cliente venga, con un link de Mercado Pago.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["link", "liga de pago", "anticipo", "WhatsApp", "pago a distancia", "Mercado Pago"],
    cuerpo: `Para el anticipo del hotel o el saldo de alguien que no va a pasar al mostrador. Funciona con Mercado Pago conectado y no necesita turno abierto.

1. Abre la cuenta del cliente desde [Caja](/caja).
2. En el recuadro de Mercado Pago aprieta **Mandar link de pago**.
3. Revisa el **Monto** y escribe el **Concepto** (por ejemplo, «Anticipo de hotel de Motita»).
4. Aprieta **Generar link**.
5. Aprieta **Mandar por WhatsApp** para abrir el chat con el mensaje listo, o **Copiar link** para mandarlo tú.

Cuando el cliente paga, el cobro se registra solo (método transferencia) y el saldo baja. Mientras, la orden dice «Esperando el pago»; si pasa una semana sin pagarse, dice «Venció sin pagarse».

> Si el cliente no tiene teléfono registrado, el link se genera igual, pero tendrás que mandarlo tú.

> Con Clip no hay links de pago: el botón no aparece.`,
  },
  {
    slug: "venta-rapida",
    titulo: "Cómo hacer una venta rápida",
    resumen: "Vender un producto o algo suelto en el mostrador, a un cliente o a público en general.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/venta"],
    palabras: ["vender", "producto", "mostrador", "público en general", "concepto libre", "tienda"],
    captura: "venta-rapida.jpg",
    cuerpo: `Para vender una correa, un shampoo o cualquier cosa que no venga de una reserva. Armas la venta y pasas directo a cobrarla.

1. En [Caja](/caja) aprieta **Venta rápida**.
2. En **¿A quién?** se queda en «Público en general». Si es cliente de la casa, aprieta **Escoger cliente** y la venta queda en su cuenta.
3. En **¿Qué se vende?** escoge el **Producto del inventario** y aprieta **Agregar producto**.
4. Para algo que no está en el inventario, aprieta **Agregar concepto libre** y escribe **Concepto** y **Precio**.
5. Ajusta la **Cantidad** de cada renglón.
6. Aprieta **Cobrar** (el botón trae el total) y cobra como cualquier cuenta.

> Solo salen los productos marcados «Se vende en mostrador» con su precio en [Inventario](/inventario). ¿Precio distinto? Aplica un descuento al cobrar.

Si te equivocaste de producto, en la pantalla de cobro aprieta **Quitar** en ese renglón y escribe por qué, antes de cobrar.

## Si algo no sale

- «No hay suficiente «…» en inventario (quedan …).»: si sí hay, registra la compra o un ajuste en Inventario.
- «Esta cuenta ya tiene cobros: primero registra la devolución y después cancela.»`,
  },
  {
    slug: "devolver-un-cobro",
    titulo: "Cómo devolver un cobro",
    resumen: "Regresarle dinero a un cliente: a mano, con Mercado Pago o registrando lo que se hizo en Clip.",
    grupo: "caja",
    modulo: null,
    roles: ["admin"],
    rutas: [],
    palabras: ["devolución", "reembolso", "regresar dinero", "cancelar cobro", "comisión"],
    cuerpo: `Solo un admin puede devolver. La devolución queda en caja con su motivo; el cobro original nunca se borra.

Abre la cuenta desde [Caja](/caja) y busca el cobro en **Cobros de esta reserva**.

## Cobro a mano (efectivo, transferencia o terminal no conectada)

1. Aprieta **Registrar devolución**.
2. Escoge el **Método**, escribe el **Monto** y el **Motivo**.
3. Aprieta **Confirmar devolución**.

## Cobro de Mercado Pago

1. Aprieta **Devolver con Mercado Pago**.
2. Deja el **Monto a devolver** completo o escribe una parte, y el **Motivo**.
3. Aprieta **Devolver con Mercado Pago**.

El dinero regresa a la tarjeta o cuenta del cliente y la devolución queda en caja en el mismo paso. Si Mercado Pago lo rechaza, no se registra nada. Si Mercado Pago regresa la comisión, se quita sola de los gastos.

## Cobro de Clip

La devolución se hace en Clip (en la terminal o en su panel). Aquí solo aprietas **Registrar devolución** con el método «Terminal» para que cuadre la caja.

## Si algo no sale

- «No hay turno de caja abierto. Ábrelo antes de registrar la devolución.»
- «Mercado Pago lo está procesando.»: se registra solo cuando lo confirme; lo ves en [Reembolsos](/caja/reembolsos).`,
  },
  {
    slug: "reembolsos-mercado-pago",
    titulo: "Qué es Caja → Reembolsos",
    resumen: "Revisar los reembolsos de Mercado Pago que se hicieron fuera del mostrador o que no se han confirmado.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/reembolsos"],
    palabras: ["reembolso", "panel de Mercado Pago", "enterado", "devolución pendiente", "consultar"],
    cuerpo: `Aquí caen los reembolsos de Mercado Pago que alguien tiene que ver, del más viejo al más nuevo. Llegas desde el aviso de **Necesita atención** en el tablero o directo en [Reembolsos](/caja/reembolsos).

Cada uno dice qué pasó:

- Se hizo desde el panel de Mercado Pago. Ya quedó en caja; aprieta **Enterado** para confirmar que lo conoces.
- Mercado Pago ya lo reembolsó pero falta de entrar a caja. Entra solo en cuanto haya un turno abierto.
- Se pidió desde la app y Mercado Pago no ha confirmado. Aprieta **Consultar a Mercado Pago**: si ya lo hizo, se registra en caja una sola vez.

Con **Ver la cuenta** abres la cuenta del cliente. Abajo, en **Últimos reembolsos**, ves los que ya se hicieron o que Mercado Pago rechazó.

> Un reembolso hecho en el panel de Mercado Pago no se vuelve a registrar a mano: la app ya lo trajo.

## Si algo no sale

- «Mercado Pago todavía no lo confirma.»: vuelve a consultar en un rato.
- «No hay reembolsos por revisar.»: todo está al día.`,
  },
  {
    slug: "corte-de-caja",
    titulo: "Cómo abrir el turno y hacer el corte de caja",
    resumen: "Abrir la caja con su fondo, registrar retiros y cerrar con el arqueo.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/turno"],
    palabras: ["corte", "arqueo", "cerrar caja", "abrir caja", "fondo", "retiro", "turno"],
    captura: "corte-de-caja.jpg",
    cuerpo: `El turno junta todo lo que entra y sale de la caja desde que abres hasta que cierras. Sin turno abierto no se puede cobrar.

## Abrir el turno

1. En [Caja](/caja) aprieta **Turno y arqueo**.
2. Escribe el **Fondo inicial** con el que arrancas y aprieta **Abrir turno**.

## Sacar dinero durante el día

Aprieta **Registrar retiro**, escribe **Monto** y **Motivo** y aprieta **Confirmar retiro**. El retiro aparece en **Retiros de este turno** con quién lo registró; lo ve todo el equipo de caja, aunque el turno lo haya abierto otra persona.

¿Se registró dos veces o con el monto equivocado? En ese retiro aprieta **Cancelar este retiro…**, escribe **¿Por qué se cancela?** y aprieta **Cancelar retiro**. Queda tachado con su motivo y ya no cuenta en el corte. Recepción cancela los suyos; un admin, cualquiera. Un retiro de un gasto pagado del cajón se cancela desde Gastos.

## Hacer el corte

1. Aprieta **Cerrar turno**.
2. Cuenta el efectivo y saca el reporte del lote de la terminal antes de seguir: la app no te enseña lo esperado hasta que mandas tu conteo.
3. Captura **Efectivo contado**, **Terminal (reporte del lote)** y **Transferencia** (0 si no hubo).
4. Aprieta **Enviar conteo**. Si cuadra, el turno se cierra.
5. Si no cuadra, ves lo contado, lo esperado y la diferencia. Escribe la **Explicación de la diferencia** y aprieta **Confirmar cierre**.

> Una diferencia nunca se ajusta en silencio: queda escrita con su explicación.

## Si algo no sale

- «Este turno lo abrió … con su cuenta: solo … o un admin pueden cerrarlo.»: recepción solo cierra el turno que abrió con su cuenta; un admin puede cerrar cualquiera (entra con su cuenta de admin y queda registrado que lo cerró). Mientras, puedes cobrar y registrar retiros en él.
- «El turno de este retiro ya se cerró»: el corte ya lo tomó en cuenta; anótalo en el siguiente.
- «Ya hay un turno de caja abierto.»`,
  },
  {
    slug: "cargo-suelto",
    titulo: "Cómo aplicar un cargo suelto",
    resumen: "Cobrar algo del catálogo de cargos sin que haya una reserva de por medio.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/cargo"],
    palabras: ["cargo", "cobro extra", "sin reserva", "comida especial", "monto libre"],
    cuerpo: `Para cobrar un cargo del catálogo cuando el perro no tiene una estancia abierta. La app arma la cuenta y te lleva directo a cobrarla.

1. En [Caja](/caja) busca al cliente en **¿A quién le cobras?** y aprieta **Cargo suelto**.
2. Escoge el **Cargo**.
3. Si es de un perro en particular, escógelo en **Perro (opcional)**.
4. Escribe la **Cantidad**. Si el cargo es de monto libre, escribe el **Importe** y llena **Qué se le dio (obligatorio)**.
5. Aprieta **Aplicar y cobrar** y cobra como cualquier cuenta.

> Si el perro está adentro, aplica el cargo desde su estancia: así queda en la misma cuenta.

## Si algo no sale

- «No hay cargos que se puedan aplicar sueltos»: los cargos que dependen del tamaño del perro se aplican desde su estancia; los demás necesitan precio en la matriz de tarifas.`,
  },
  {
    slug: "aplicar-descuento",
    titulo: "Cómo aplicar un descuento",
    resumen: "Descontar un porcentaje o un monto a una cuenta, con motivo y dentro del tope de recepción.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["descuento", "rebaja", "promoción", "tope", "cortesía"],
    cuerpo: `El descuento se aplica en la pantalla de cobro, antes de cobrar. Recepción puede descontar hasta un tope que pone el admin; arriba de eso, solo admin o quien tenga el permiso «Descuentos sin tope».

1. Abre la cuenta desde [Caja](/caja).
2. En **Descuentos** aprieta **Aplicar descuento**.
3. Escoge el **Motivo** y el **Tipo** (Porcentaje o Monto fijo) y escribe el valor.
4. Revisa cuánto equivale en pesos.
5. Si pasa el tope, llena **Motivo (obligatorio arriba del tope)**.
6. Aprieta **Confirmar descuento**. El saldo baja.

Para quitarlo, aprieta **Cancelar** en el descuento, escribe el **Motivo de la cancelación** y **Confirmar cancelación**. Queda tachado, no se borra.

> El tope lo cambia el admin en [Administración](/admin), en «Tope de descuentos de recepción».

## Si algo no sale

- «Este descuento ($…) pasa el tope de recepción ($…). Solo un admin, o quien tenga el permiso «Descuentos sin tope», puede aplicarlo.»
- «Ese descuento deja la cuenta en negativo»: baja el valor.
- Si no ves **Aplicar descuento**, la cuenta ya está descontada completa o no hay motivos de descuento dados de alta.`,
  },
  {
    slug: "agregar-una-raza-que-no-aparece",
    titulo: "Cómo agregar una raza que no aparece",
    resumen: "Proponer la raza que falta desde el mismo formulario del perro, ligar la que ya existe y darle su grupo de precio.",
    grupo: "clientes",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/perros", "/perros/razas", "/perros/razas/grupos"],
    palabras: ["raza", "razas", "calupoh", "mestizo", "criollo", "grupo de precio", "catálogo", "no aparece", "no la encuentro", "agregar esta raza", "fuera del catálogo", "normalizar", "propuesta"],
    cuerpo: `Al capturar o editar un perro, escribe la raza en **Raza**. Mientras escribes salen las razas de la lista que empiezan igual, que lo contienen o que se le parecen («¿Quisiste decir esta?»). Escoge la correcta y listo: de ahí sale el precio de estética.

## Si no está en la lista

1. Termina de escribir la raza y aprieta **No la encuentro: agregar esta raza**. En el celular se abre una hoja desde abajo.
2. Revisa el **Nombre de la raza** (ya viene con lo que escribiste) y, si quieres, pon los **Otros nombres con los que se le conoce**, separados por coma («calupo, kalupoh»).
3. Escoge la **Talla típica** y el **Tipo de pelaje**, y escribe en **Notas** a qué raza se parece o cómo se maneja.
4. Si eres admin o tienes el permiso «Precios y tarifas», puedes escoger también el **Grupo de precio de estética en este negocio**. Si no lo sabes todavía, déjalo vacío: nunca se adivina.
5. Aprieta **Guardar raza**. El perro queda ligado a la propuesta y sigues con el formulario.

PeluDesk revisa la propuesta, con tus notas. Cuando la aprueba, la raza entra al catálogo de todos los negocios y los perros ligados se cambian solos a ella. Si la rechaza, ves el motivo en [Razas sin catalogar](/perros/razas).

> Si el grupo de precio no está asignado, el formulario lo dice: **la estética de este perro necesita un grupo de precio antes de agendar**. Quien tiene «Precios y tarifas» entra desde ahí a [Razas sin grupo de precio](/perros/razas/grupos); a los demás les dice que se lo pidan a admin.

## Si la raza ya estaba escrita a mano

Un perro capturado antes puede tener la raza escrita pero sin ligar a la lista. Al abrirlo, si lo escrito es igual a una raza de la lista, el formulario te dice «está en el catálogo como …» y aprietas **Usar …**: se liga con un toque, nunca solo. Después aprieta **Guardar cambios**.

## Muchos perros a la vez

Entra a [Razas sin catalogar](/perros/razas). Arriba, en **Textos de raza fuera del catálogo**, los perros salen juntos por como se escribe, sin importar mayúsculas, acentos ni palabras como «perro» o «raza»: «Calupoh», «calupoh» y «Perro calupoh» son un solo renglón.

1. Mira las **Parecidas del catálogo**. Nada se junta solo: tú decides.
2. Aprieta **Es esta raza: …** en la correcta, o escoge otra en **O elige otra raza del catálogo** y aprieta **Es esta raza**.
3. Todos los perros del renglón cambian de una vez y el texto original queda guardado.
4. ¿Te equivocaste? Baja a **Asignaciones recientes** y aprieta **Deshacer**.
5. Si de verdad es una raza nueva, aprieta **Es una raza nueva** y llena la propuesta (la hace admin o quien tenga «Precios y tarifas»).

«Mestizo», «criollo» y «corriente» ya son una raza del catálogo: **Mestizo**.

## Su grupo de precio

Una raza nueva llega **sin grupo de precio** en tu negocio, porque cada negocio decide el suyo. Mientras no lo tenga, la app no adivina ningún precio. Te avisa en **Necesita atención** del tablero («La raza … no tiene grupo de precio», con los días que lleva esperando).

1. Aprieta el aviso, o entra a [Razas sin grupo de precio](/perros/razas/grupos).
2. En **Grupo de precio** escoge el grupo y aprieta **Guardar grupo**. Sirve para las razas del catálogo y también para las **Razas propuestas, en revisión**; al aprobarse una propuesta, ese grupo queda como el de la raza en tu negocio.

Si agendas una cita de estética antes de asignarlo, la pantalla te pide el grupo en ese momento. Quien tiene «Excepciones al reservar» puede marcar **Solo para esta cita, con el grupo que elegí (excepción)** y escribir el **Motivo de la excepción**: queda con su nombre.

> Un perro con una raza en revisión y sin grupo no se puede agendar en estética hasta que le des el grupo o hagas la excepción. Si PeluDesk rechaza la propuesta, el perro conserva la raza escrita y vuelve a cotizarse con el grupo por defecto.

## Si el dueño llena su propio link

En el link de alta, el dueño también puede apretar **No la encuentro: agregar esta raza**: solo escribe el nombre, otros nombres y cómo es. No ve precios ni grupos de precio. Su propuesta te llega igual, con sus notas, y la ves en [Razas sin catalogar](/perros/razas).`,
  },
  {
    slug: "precios-de-estetica",
    titulo: "Cómo funcionan los precios de estética",
    resumen: "El precio sale del servicio, del grupo de la raza y del pelaje del perro; nunca se adivina.",
    grupo: "estetica",
    modulo: "estetica",
    roles: ["admin", "recepcion"],
    rutas: ["/servicios", "/perros/razas/grupos"],
    palabras: ["tarifas", "precios", "baño", "rapado", "exprés", "grupo de raza", "pelaje", "talla"],
    cuerpo: `Cada servicio de estética tiene un precio por **grupo de raza** (por ejemplo, poodle y maltés, o pastores de pelo largo). Un grupo especial, **Por talla**, es para perros de pelo corto: ahí el precio depende de si es chico, mediano o grande. No hay talla gigante en estética.

1. Abre [Servicios](/servicios) (necesitas el permiso «Precios y tarifas») y entra al servicio.
2. En la matriz, cada celda es un servicio, un grupo y, si aplica, un pelaje. Escribe el precio y guárdalo. Una celda vacía es «sin precio»: la app no cobra por adivinación.
3. El **precio de pelo maltratado** es una columna aparte del baño completo; en grupos donde no se cobra, queda vacío.
4. El **rapado** solo aplica a perros de pelo medio o largo.

Cambiar un precio solo vale para las citas nuevas. Las que ya están agendadas o cobradas conservan el que tenían.

## Qué grupo le toca a cada perro

Lo decide su raza. Las razas que todavía no tienen grupo en tu negocio salen en [Razas sin grupo de precio](/perros/razas/grupos): ahí las asignas. Mientras no tengan grupo, el perro de pelo medio o largo no tiene precio automático y la cita pide asignar el grupo o registrar una excepción con motivo.

## Si algo no sale

- «No hay tarifa»: el mensaje dice qué falta (servicio, grupo o pelaje) y trae el link para capturarlo.`,
  },
  {
    slug: "agendar-cita-estetica",
    titulo: "Cómo agendar una cita de estética",
    resumen: "Apartar un baño o corte con el servicio, el estilista y la hora.",
    grupo: "estetica",
    modulo: "estetica",
    roles: ["admin", "recepcion"],
    rutas: ["/estetica", "/estetica/nueva"],
    palabras: ["cita", "baño", "corte", "agenda", "estilista", "grooming"],
    captura: "agendar-cita-estetica.jpg",
    cuerpo: `En [Estética](/estetica) ves la agenda de cada estilista, por **Día** o por **Semana**. Con **← Anterior**, **Hoy** y **Siguiente →** te mueves de fecha.

1. Aprieta **Agendar**.
2. Busca al cliente por perro, dueño o teléfono. Si es nuevo, dalo de alta con **Nuevo cliente**.
3. Escoge el **Perro**.
4. Si el perro ya está en guardería u hotel, puedes ligar la cita a esa estancia.
5. Escoge el **Servicio** y el **Empleado** que lo atiende. Son tres baños: el **completo** (baño, cepillado, deslanado o corte de pelo, uñas, orejas y dientes, corte higiénico, hidratación de nariz y huellitas), el **rapado** (igual, pero con corte de pelo rapado) y el **exprés** (baño con shampoo y secado).
6. Si el perro llegó con el pelo maltratado, marca **Llegó con el pelo maltratado**: cobra el precio alternativo del mismo baño. Es una condición de la cita, no otro servicio.
7. Si necesitas cobrar de más (mucho pelo, nudos, cuidado previo), escribe el **Recargo manual (opcional)** y su **Motivo del recargo**. Se suma al precio, y queda registrado con tu nombre y el motivo. Solo lo hace admin o quien tenga el permiso «Excepciones al reservar».
8. Pon la **Fecha y hora** y aprieta **Agendar cita**.

El precio sale del grupo de raza del perro, de su pelaje y del servicio; al dueño le aclaramos que **el costo puede aumentar según el tipo de pelo y el cuidado previo**. El rapado solo se ofrece a perros de pelo medio o largo. Cambiar las tarifas después no mueve el precio de las citas que ya están agendadas o cobradas. Para cambiar el recargo de una cita, ábrela y aprieta **Cambiar el recargo**.

Una cita fuera del horario sale resaltada en naranja en la agenda.

> Las vacunas no detienen una cita de estética. Si el perro también usa guardería u hotel y las trae vencidas, la app te avisa para ponerlo al día.

## Si algo no sale

- «Este perro no tiene talla registrada…»: captúrala en su expediente con el link del mensaje.
- «No hay nadie que pueda quedar como responsable de la cita»: falta dar de alta al personal de estética.
- ¿Escogiste mal a la estilista? Mira [Cómo cambiar o corregir la estilista de una cita](/ayuda/cambiar-estilista-cita-estetica).
- «El grupo de este perro no cobra automático a su pelaje»: pasa con un perro de pelo medio o largo sin grupo de precio (por ejemplo un mestizo). No se adivina un precio: corrige su pelaje en el expediente, asígnale su grupo, o con el permiso «Excepciones al reservar» registra una excepción con el grupo y el motivo, solo para esa cita.
- Sale el recuadro **La raza … todavía no tiene grupo de precio**: es una raza nueva (del catálogo o propuesta desde el formulario del perro) y tu negocio aún no decide su precio. Mira [Cómo agregar una raza que no aparece](/ayuda/agregar-una-raza-que-no-aparece).`,
  },
  {
    slug: "cambiar-estilista-cita-estetica",
    titulo: "Cómo cambiar o corregir la estilista de una cita",
    resumen: "Pasar un perro a otra estilista, dejarlo sin asignar o corregir quién lo atendió.",
    grupo: "estetica",
    modulo: "estetica",
    roles: ["admin", "recepcion"],
    rutas: ["/estetica/[citaId]", "/recepcion", "/admin"],
    palabras: ["estilista", "reasignar", "cambiar estilista", "sin asignar", "corregir", "comisión", "otra estilista", "quién atendió"],
    cuerpo: `La estilista de una cita se cambia desde el [tablero del día](/recepcion) (en **Citas de estética hoy**) y desde el detalle de la cita. Lo que puedes hacer depende de cómo va la cita:

## Antes de empezar (Reservada o Confirmada)

1. En la cita, abre la lista **Estilista** y escoge a otra persona. Queda en el momento, sin motivo.
2. Si todavía no sabes quién la va a atender, escoge **Sin asignar**. La cita aparece en una columna **Sin asignar** de la agenda.
3. Abajo de la lista verás un aviso verde con quién quedó y quién la tenía antes.

Una cita sin estilista no se puede iniciar: primero asígnale una.

## Con el servicio en curso

Por ejemplo, otra estilista toma al perro a la mitad.

1. Abre la cita y aprieta **Cambiar estilista**.
2. Escoge a quién se la pasas en **Pasar a**.
3. Si quieres, escribe el **Motivo (opcional)**.
4. Aprieta **Cambiar estilista**.

## Cuando ya terminó (Finalizada, cobrada o no)

Para corregir quién atendió un servicio que ya se cerró, hace falta ser admin o tener el permiso **Corregir estilista de servicios cerrados** (el admin lo da en [Permisos](/admin/permisos)).

1. Abre la cita y aprieta **Corregir estilista**.
2. Escoge a la estilista correcta.
3. Escribe el **Motivo de la corrección (obligatorio)**.
4. Aprieta **Corregir estilista**.

## Qué queda registrado

Cada cambio queda en **Historial de estilista**, al pie de la cita: de quién a quién, quién lo hizo, cuándo, en qué momento estaba la cita y el motivo. Nada se reescribe en silencio.

## Qué pasa con la comisión y la propina

- Los cobros y el corte de caja no cambian.
- Si la nómina de quien la tenía **todavía no se paga**, la comisión y la propina se van solas a la nueva estilista.
- Si esa nómina **ya se pagó**, el pago no se toca: la diferencia aparece como un **Ajuste por cambio de estilista** (negativo para quien ya cobró de más, positivo para quien no cobró) en el siguiente pago de cada una. Lo ves en [Nómina](/empleados/nomina).

## Si algo no sale

- «… ya tiene otra cita a esa hora»: esa estilista está ocupada; escoge a otra o mueve primero su otra cita.
- «Corregir la estilista de un servicio ya terminado es de admin…»: pídele al admin el permiso o que lo corrija él.
- Una cita **Cancelada** o **No llegó** ya no se reasigna.
- Solo aparecen estilistas activas del negocio; si falta alguien, revisa que esté dada de alta en el personal de estética (en [Administración](/admin)) y que no tenga baja.`,
  },
  {
    slug: "atender-cita-estetica",
    titulo: "Cómo atender y terminar una cita de estética",
    resumen: "Iniciar la cita al recibir al perro, cerrarla al entregarlo y descontar lo que se usó.",
    grupo: "estetica",
    modulo: "estetica",
    roles: ["admin", "recepcion"],
    rutas: ["/estetica/[citaId]"],
    palabras: ["iniciar cita", "finalizar", "entregar perro", "recoger", "no llegó", "reagendar", "consumo"],
    captura: "atender-cita-estetica.jpg",
    cuerpo: `Cada cita pasa por Reservada, En curso y Finalizada. También puede quedar Cancelada o No llegó.

## Cuando llega el perro

1. En [Estética](/estetica) abre la cita.
2. Aprieta **Iniciar cita**.
3. Si es una visita suelta, escribe **Quién entrega al perro** y, si quieres, su teléfono.
4. Aprieta **Confirmar inicio**.

## Cuando se lo llevan

1. Aprieta **Finalizar cita**.
2. Escribe **Quién recoge al perro** y marca **Sí, es el dueño** o **No, persona autorizada**.
3. Si el servicio tiene receta, revisa el **Consumo de inventario** y ajusta si se usó más o menos.
4. Aprieta **Confirmar cierre**. El consumo se descuenta del inventario y la cuenta queda en [Caja](/caja) para cobrarla.

Si la cita está ligada a una estancia, no se piden esos datos: el perro sigue adentro.

## Antes de iniciarla

Puedes **Reagendar**, **Marcar no llegó** o **Cancelar**. Si la estilista cambió, mira [Cómo cambiar o corregir la estilista de una cita](/ayuda/cambiar-estilista-cita-estetica).

> El pelo maltratado se marca al agendar: cambia el precio del mismo baño, no es un cargo aparte.

## Si algo no sale

- «Solo se puede finalizar una cita que está en curso.»: primero iníciala.
- «Esta cita no tiene estilista asignada»: asígnale una antes de iniciarla o terminarla (arriba de los botones, en **Estilista**).`,
  },
];
