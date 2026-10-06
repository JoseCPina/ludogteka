import type { Articulo } from "../tipos";

// Caja y cobros + Estética. Cada botón, campo y mensaje citado aquí existe
// tal cual en la app: si cambia la pantalla, cambia el artículo.
export const ARTICULOS_CAJA_Y_ESTETICA: Articulo[] = [
  {
    slug: "cobrar-una-cuenta",
    titulo: "Cómo cobrar una cuenta",
    resumen: "Cobrar en efectivo, transferencia o tarjeta, con propina y en varios métodos a la vez.",
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
4. En **Registrar cobro** escoge el **Método** (Efectivo, Transferencia o **Tarjeta (registro manual)**; **Terminal** solo si tu negocio no tiene Mercado Pago ni Clip), escribe el **Monto** y, si dejó, la **Propina**.
5. ¿Paga una parte en efectivo y otra con tarjeta? Aprieta **+ Repartir en otro método** y llena el segundo renglón.
6. Aprieta **Registrar cobro**. El saldo baja y el cobro queda en **Cobros de esta reserva**.

> El cobro con tarjeta se hace con **Cobrar con terminal** ([Cómo cobrar con la terminal](/ayuda/cobrar-con-terminal)): así se confirma solo con Mercado Pago. El método **Terminal** no se captura a mano en un negocio con Mercado Pago o Clip. Si la terminal no se puede usar, usa **Tarjeta (registro manual)** con el folio del voucher ([Cuándo usar Tarjeta (registro manual)](/ayuda/tarjeta-registro-manual)). A mano también: efectivo y transferencia.

Si el perro tiene day pass o mensualidad, junto a su línea sale **Pagar con bono**.

¿Un servicio de estética se capturó mal? Se corrige desde la cita y el saldo de la cuenta cambia solo, sin tocar lo ya cobrado: un **cobro adicional** aparece como saldo por cobrar. Mira [Cómo corregir el servicio de una cita](/ayuda/corregir-servicio-de-una-cita).

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
- Si la terminal no responde, ve [Qué hacer si la terminal no recibe el cobro](/ayuda/terminal-no-recibe-el-cobro).
- Si sale **Por confirmar con Mercado Pago**, mira la sección de abajo.

## Qué significa «Por confirmar»

Si la terminal no se puede usar (está caída, no hay señal, el cobro se hizo en otra terminal), no la dejes parada: usa **Tarjeta (registro manual)** con el folio del voucher ([Cuándo usar Tarjeta (registro manual)](/ayuda/tarjeta-registro-manual)). Ese cobro cuenta como pagado pero queda **sin verificar** hasta que el admin lo revisa.

Un cobro con terminal solo cuenta como cobrado cuando Mercado Pago confirma un **pago aprobado**: la app lo consulta directo, con el mismo monto y de tu cuenta. Si algo no cuadra (otro monto, el pago todavía no existe, no se pudo comprobar), la orden queda **Por confirmar con Mercado Pago**: **no cuenta como dinero** y aparece en **Necesita atención**.

1. Abre la cuenta y, en la orden por confirmar, aprieta **Revisar con Mercado Pago**.
2. Si el pago ya está aprobado, se registra el cobro (una sola vez). Si no, sigue por confirmar y te dice por qué.
3. Si el cliente no pagó, cancela la orden o cóbrale en efectivo o transferencia.

Una orden **cancelada**, **vencida**, **fallida** o en cola nunca marca nada como pagado.

> Una vez a la hora, la app compara los cobros con terminal contra los pagos de Mercado Pago y avisa en **Necesita atención** lo que no cuadra: mira [Conciliación con Mercado Pago](/ayuda/corregir-un-cobro-con-terminal-mal-marcado).

## Si desconectas y vuelves a conectar Mercado Pago

- Al **desconectar**, las órdenes que estaban en cola se cancelan (una que la terminal ya procesó no se cancela: se verifica con Mercado Pago como cualquier pago) y la app **se acuerda de la terminal** que usabas.
- Al **reconectar la misma cuenta**, la app busca esa terminal y la vuelve a dejar escogida y en modo integrado. Si no la encuentra, el admin la escoge en [Cobro con terminal](/admin/pagos).
- Mientras no haya terminal escogida, **Cobrar con terminal** sale deshabilitado y dice qué falta. Escoge la terminal en Administración → Cobro con terminal y se habilita.`,
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
- «La terminal no está en modo PDV (integrado).»: el admin aprieta **Poner en modo integrado** en [Cobro con terminal](/admin/pagos).
- «La terminal ya tiene una orden en curso.»: cancela esa orden en la terminal.
- Si pide cobros «vinculados» o no recibe nada: en la terminal, **Más opciones → Ajustes → Modo de vinculación**, y regrésala a modo independiente.

## Si pasan los 2 minutos

Sale «La terminal no ha respondido». Si el cliente no pagó, aprieta **Cancelar y registrar a mano** y cóbrale en **Registrar cobro** con efectivo o transferencia (con Mercado Pago o Clip elegidos, el método **Terminal** no se captura a mano: vuelve a mandarlo con **Cobrar con terminal**). Si el cliente SÍ pasó la tarjeta en otra terminal o en una que no responde, registra el cobro con **Tarjeta (registro manual)** y el folio del voucher ([Cuándo usar Tarjeta (registro manual)](/ayuda/tarjeta-registro-manual)). Si tienes duda, aprieta **Seguir esperando**.

> Si el cliente SÍ pagó en la terminal, no registres nada a mano: en cuanto el proveedor lo confirme, el cobro entra solo aunque hayas cancelado aquí.

Antes de los 2 minutos también puedes apretar **Cancelar cobro en terminal**.

## Pagos que llegaron sin turno

Si un pago se confirma sin turno abierto, la orden dice «Pagado, sin turno» y en [Caja](/caja) sale un aviso. Se registran solos al abrir el turno; si el turno ya estaba abierto, aprieta **Registrar en este turno** para que entren a este corte.`,
  },
  {
    slug: "corregir-un-cobro-con-terminal-mal-marcado",
    titulo: "Cómo corregir un cobro con terminal mal marcado y revisar la conciliación",
    resumen: "Cuando la caja dice que se cobró con terminal y nadie pasó la tarjeta: «Marcar como no recibido» y la conciliación con Mercado Pago.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/conciliacion"],
    palabras: ["no recibido", "cobro falso", "cobrado sin pago", "conciliación", "terminal", "corregir cobro", "diferencia", "mercado pago no tiene el pago"],
    cuerpo: `Cada hora la app compara los cobros con terminal contra los pagos de Mercado Pago y **marca** (no corrige) lo que no cuadra. Lo ves en **Necesita atención** del [tablero](/recepcion) y en [Conciliación](/caja/conciliacion), del más viejo al más nuevo.

Hay dos tipos de diferencia:

- **Cobrado en la app, sin pago aprobado en Mercado Pago**: la caja dice que se cobró con terminal y Mercado Pago no tiene el pago.
- **Pago aprobado en Mercado Pago, sin cobro en la caja**: Mercado Pago recibió dinero que la caja no tiene. Revisa en tu panel de Mercado Pago de quién es.

## Marcar como no recibido (solo admin)

Para un cobro a mano con método **Terminal** que en realidad no se recibió:

1. Pregúntale al cliente si pagó. Si pagó, **no lo marques**.
2. Abre la cuenta (desde [Conciliación](/caja/conciliacion) con **Abrir la cuenta**).
3. En el cobro, aprieta **Marcar como no recibido**.
4. Escribe el **Motivo (obligatorio)** y aprieta **Marcar como no recibido**.

Antes de cambiar nada, la app le **pregunta a Mercado Pago**: si tiene un pago aprobado del mismo monto que pueda ser de este cobro, **no te deja**. Si no lo tiene, el cobro queda como no recibido: la cuenta **vuelve a tener saldo** para cobrarse, y queda en el historial quién lo hizo, cuándo, el motivo y cómo estaba antes.

- El corte de un turno que ya cerró **no cambia**: la corrección se anota en el turno abierto.
- Para marcarlo, Mercado Pago tiene que estar conectado (para poder comprobarlo).
- Un cobro que entró con un pago confirmado por Mercado Pago **no** se marca así: si hay que devolverlo, usa **Devolver con Mercado Pago**.

## Si el cobro SÍ se recibió

Si ya confirmaste que el cliente pagó, el admin puede apretar **Dar por revisada** en la diferencia y escribir qué revisó.

## Tarjetas manuales por revisar

En la misma pantalla, el admin ve **Tarjetas manuales por revisar**: los cobros que se registraron con **Tarjeta (registro manual)** y nadie ha verificado, con su folio y su motivo. Cómo revisarlas: [Cómo revisar las tarjetas manuales](/ayuda/revisar-tarjetas-manuales).

## Si algo no sale

- «Mercado Pago SÍ tiene un pago aprobado… que podría ser de este cobro»: no se marca; confírmalo con el cliente.
- «…la cuenta no está conectada»: reconéctala en [Cobro con terminal](/admin/pagos) y vuelve a intentarlo.
- «No hay turno de caja abierto»: ábrelo; la corrección se anota en el turno abierto.`,
  },
  {
    slug: "tarjeta-registro-manual",
    titulo: "Cuándo usar «Tarjeta (registro manual)»",
    resumen: "Registrar un cobro con tarjeta cuando no se puede usar la terminal vinculada, con el folio del voucher.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["tarjeta manual", "registro manual", "voucher", "folio", "autorización", "terminal caída", "sin señal", "sin internet", "otra terminal", "terminal no responde", "sin verificar", "cobro con tarjeta a mano"],
    cuerpo: `El cobro con tarjeta se hace con **Cobrar con terminal** ([Cómo cobrar con la terminal](/ayuda/cobrar-con-terminal)): se confirma solo con Mercado Pago. Pero a veces no se puede: la terminal vinculada no responde, no hay señal o se cobró en otra terminal. Para eso existe **Tarjeta (registro manual)**: el cobro cuenta como pagado desde que lo registras, para que no se quede nadie esperando.

1. Abre la cuenta y, en **Registrar cobro**, escoge **Tarjeta (registro manual)** en **Método**.
2. Escribe el **Monto** (y la **Propina**, si dejó).
3. En **Folio o autorización del voucher** escribe el número del voucher (mínimo 4 caracteres, y no se repite).
4. En **¿Por qué no se cobró con la terminal vinculada?** elige: **Terminal vinculada no responde**, **Sin señal o sin internet**, **Cobro en otra terminal** u **Otro (escríbelo)**.
5. Si quieres, anota los **Últimos 4 dígitos** y el **Banco**. Nunca captures la tarjeta completa.
6. Aprieta **Registrar cobro**.

El cobro queda marcado **Sin verificar**: nadie lo confirmó con Mercado Pago ni con Clip. El admin lo contrasta con el voucher en [Conciliación](/caja/conciliacion) ([Cómo revisar las tarjetas manuales](/ayuda/revisar-tarjetas-manuales)).

- **No es lo mismo que Terminal.** En un negocio con Mercado Pago o Clip, **Terminal** no se captura a mano: solo entra cuando el proveedor confirma el pago.
- En el turno, el corte y los reportes sale en una línea aparte: **Tarjeta manual (sin verificar)**, separada de la terminal verificada. El total con tarjeta suma las dos, a la vista.
- Sirve igual para estética, guardería, hotel, venta rápida y venta de pases, y se puede repartir con otro método.
- Una devolución de un cobro con tarjeta manual es **manual**: la registra el admin con **Registrar devolución** y el método **Tarjeta (registro manual)**; no usa el reembolso de Mercado Pago.
- Si el monto pasa el tope de alerta del negocio, se registra igual y sube a **Necesita atención** para que el admin lo revise primero.

## Si algo no sale

- «Escribe el folio o número de autorización del voucher (mínimo 4 caracteres).»: sin folio no se guarda.
- «El folio … ya está registrado en otro cobro de este negocio.»: revisa el voucher; un mismo folio no se registra dos veces.
- «No tienes el permiso «Registrar tarjeta manual».»: pídeselo al admin en [Permisos](/admin/permisos). Viene prendido para toda la recepción.
- No ves **Tarjeta (registro manual)** en el método: tu cuenta no tiene ese permiso.`,
  },
  {
    slug: "revisar-tarjetas-manuales",
    titulo: "Cómo revisar las tarjetas manuales",
    resumen: "Contrastar con el voucher los cobros de «Tarjeta (registro manual)»: revisarlos o marcarlos como no recibidos, el tope de alerta y los avisos.",
    grupo: "caja",
    modulo: null,
    roles: ["admin"],
    rutas: ["/caja/conciliacion"],
    palabras: ["tarjeta manual", "revisado con voucher", "no recibida", "sin verificar", "tope de alerta", "tarjetas por revisar", "conciliación", "muchas tarjetas a mano"],
    cuerpo: `Los cobros de **Tarjeta (registro manual)** ([Cuándo usar Tarjeta (registro manual)](/ayuda/tarjeta-registro-manual)) cuentan como pagados, pero nadie los verificó. Tú, como admin, los contrastas con el voucher y el estado de cuenta.

Los ves en **Necesita atención** del [tablero](/recepcion) («tarjetas registradas a mano esperan revisión», del más viejo al más nuevo) y en [Conciliación](/caja/conciliacion), en **Tarjetas manuales por revisar**, con el folio, el motivo, quién lo registró y cuándo.

## Si el voucher es bueno

1. En la tarjeta aprieta **Revisado con voucher**.
2. Si quieres, escribe una **Nota (opcional)**.
3. Aprieta **Guardar como revisada**.

## Si el cobro no se recibió

1. En la tarjeta aprieta **Marcar como no recibida**.
2. Escribe el **Motivo (obligatorio)**.
3. Aprieta **Marcar como no recibida**.

El cobro no se borra: queda con su historial y la cuenta **vuelve a tener saldo** para cobrarse. La corrección entra como un movimiento aparte en el **turno abierto**: si el cobro era de un turno que ya cerró, ese corte **no cambia**. Para marcarla necesitas un turno abierto. No se marca una que ya tiene devoluciones ni una con propina.

## Tope de alerta

En [Cobro con terminal](/admin/pagos), **Tope de alerta por cobro (MXN)** (por omisión $2,000): arriba de ese monto la tarjeta se registra igual, pero sale marcada **arriba del tope** y en **Necesita atención** para que la revises primero.

## Si se usan de más

Si tu terminal está conectada y en un día se registran más de 3 tarjetas manuales, o más del 30 % de las tarjetas de un turno, sale en **Necesita atención** «Se están registrando muchas tarjetas a mano con la terminal conectada». Solo avisa: no bloquea a nadie. Puede ser una terminal con falla o un mal hábito en el mostrador.

## Si algo no sale

- «No hay turno de caja abierto…»: ábrelo; la corrección se anota en el turno abierto.
- «Este cobro ya tiene devoluciones…»: ya no se puede marcar como no recibida.
- Recepción no ve estas tarjetas ni los botones: es solo del admin.`,
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

## Cobro con Tarjeta (registro manual)

La devolución es **manual**: no usa el reembolso de Mercado Pago. Aprieta **Registrar devolución**, deja el método **Tarjeta (registro manual)** (solo se puede devolver hasta lo que ese cobro pasó por tarjeta manual), escribe el **Motivo** y **Confirmar devolución**. Devuelve el dinero por donde lo recibiste (en la terminal o con el banco). La devolución queda en caja y se ve en [Conciliación](/caja/conciliacion). Si el cobro nunca se recibió, no es una devolución: usa **Marcar como no recibida** ([Cómo revisar las tarjetas manuales](/ayuda/revisar-tarjetas-manuales)).

## Cobro de Clip

La devolución se hace en Clip (en la terminal o en su panel). Aquí solo aprietas **Registrar devolución** con el método «Terminal» para que cuadre la caja.

## Saldo a favor por corregir un servicio

Si se corrigió el servicio de una cita ya cobrada y ahora cuesta menos, la cuenta queda con un saldo a favor del cliente. Sale en **Necesita atención** y en [Ajustes por corrección de servicio](/caja/ajustes-servicio): ábrela y devuélvelo con **Registrar devolución** (o **Devolver con Mercado Pago** si el cobro fue por Mercado Pago). Cuando el saldo llega a cero, el aviso se quita solo.

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

## Correcciones de servicio

Corregir el servicio de una cita ya cobrada no mueve ningún corte: el cobro adicional o la devolución que resulten entran al turno en el que se hacen, y los cortes ya cerrados quedan igual.

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

«Mestizo», «criollo» y «corriente» ya son una raza del catálogo: **Mestizo**. A un mestizo se le pide su tamaño y su pelaje para cobrarle ([Cómo se cobra a un mestizo](/ayuda/precio-de-estetica-mestizo)).

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
    cuerpo: `Cada servicio de estética tiene un precio por **grupo de raza** (por ejemplo, poodle y maltés, o pastores de pelo largo). Un grupo especial, **Mestizo / sin raza**, es para mestizos y perros sin raza de catálogo: ahí el precio depende de su **tamaño** (chico, mediano o grande) y de su **pelaje** (corto, medio o largo). No hay talla gigante en estética. Mira [Cómo se cobra a un mestizo](/ayuda/precio-de-estetica-mestizo).

1. Abre [Servicios](/servicios) (necesitas el permiso «Precios y tarifas») y entra al servicio.
2. En la matriz, cada celda es un servicio, un grupo y, si aplica, un pelaje. Escribe el precio y guárdalo. Una celda vacía es «sin precio»: la app no cobra por adivinación.
3. El **precio de pelo maltratado** es una columna aparte del baño completo; en grupos donde no se cobra, queda vacío.
4. El **rapado** solo aplica a perros de pelo medio o largo.

Cambiar un precio solo vale para las citas nuevas. Las que ya están agendadas o cobradas conservan el que tenían.

## Qué grupo le toca a cada perro

Lo decide su raza. Las razas que todavía no tienen grupo en tu negocio salen en [Razas sin grupo de precio](/perros/razas/grupos): ahí las asignas. Mientras no tengan grupo, la cita pide asignar el grupo o registrar una excepción con motivo.

## Si una combinación no tiene precio

La celda vacía no se cobra por adivinación. Al agendar sale **un solo aviso**: «Esta combinación no tiene precio: agrega el precio en Servicios y precios, o registra una excepción con motivo». Mira [Qué hacer cuando no hay precio](/ayuda/que-hacer-sin-precio-estetica).

## Si algo no sale

- «Esta combinación no tiene precio»: el mensaje dice qué falta (servicio, grupo, talla o pelaje) y trae el link a la matriz para capturarlo.`,
  },
  {
    slug: "precio-de-estetica-mestizo",
    titulo: "Cómo se cobra a un mestizo (o perro sin raza de catálogo)",
    resumen: "El grupo «Mestizo / sin raza» cobra por tamaño y pelaje: cómo se captura el perro, cómo se llena la matriz y qué significa «Calculado».",
    grupo: "estetica",
    modulo: "estetica",
    roles: ["admin", "recepcion"],
    rutas: ["/servicios", "/clientes", "/perros"],
    palabras: ["mestizo", "criollo", "sin raza", "talla", "pelaje", "pelo largo", "pelo medio", "matriz", "calculado", "Osito", "precio de un mestizo", "alta de perro mestizo"],
    cuerpo: `A un perro **Mestizo** (o con una raza que tu negocio no mete en ningún grupo) se le cobra por **tamaño** y **pelaje**: chico, mediano o grande, y pelo corto, medio o largo. Eso son 9 combinaciones por servicio.

## Al dar de alta al perro

1. En **Raza** escribe y escoge **Mestizo**.
2. Salen marcados **Tamaño (obligatorio)** y **Pelaje (obligatorio)**, con un aviso: sin los dos no se puede agendar.
3. Elige el tamaño y el pelaje (corto, medio o largo) y guarda.

Si se te pasó, no pasa nada: al agendar la pantalla te los pide ahí mismo ([Cómo agendar una cita de estética](/ayuda/agendar-cita-estetica)).

## La matriz de precios (admin o «Precios y tarifas»)

1. Entra a [Servicios](/servicios) y abre el baño, el rapado o el exprés.
2. Busca **Mestizo / sin raza**: tiene un renglón por tamaño y pelaje (**Chico · pelo corto**, **Chico · pelo medio**…).
3. Escribe el precio en cada celda. En el baño completo, la segunda casilla es el precio **Si llega maltratado**.
4. El **rapado** solo se ofrece a pelo medio o largo (a pelo corto está en «No aplica»). El **exprés** tiene precio en los tres pelajes.
5. Aprieta **Revisar y guardar** y **Confirmar y guardar**.

En un negocio nuevo la matriz empieza **vacía**: hasta que pongas el precio, esa combinación pide una excepción con motivo.

## Qué significa «Calculado»

Para que pudieras agendar desde el primer día, a algunos negocios se les **calculó** el precio de pelo medio y largo por proporción a partir de sus propios grupos de raza. Esas celdas salen en ámbar con la marca **Calculado** y un aviso arriba.

- Si un precio no te cuadra, cámbialo y guárdalo: queda como tuyo y pierde la marca.
- Si te cuadran todos, aprieta **Confirmar los precios calculados**.

Cambiar la matriz solo vale para las citas nuevas.

## Si algo no sale

- «Este perro no tiene pelaje registrado»: capturalo en su expediente, o escógelo en el aviso al agendar.
- Un perro de pelo **rizado** no tiene celda en la matriz: pide excepción con motivo, o corrígele el pelaje si está mal capturado.`,
  },
  {
    slug: "que-hacer-sin-precio-estetica",
    titulo: "Qué hacer cuando no hay precio al agendar estética",
    resumen: "El aviso «Esta combinación no tiene precio»: agregar el precio o registrar una excepción con motivo.",
    grupo: "estetica",
    modulo: "estetica",
    roles: ["admin", "recepcion"],
    rutas: ["/estetica/nueva"],
    palabras: ["sin precio", "no tiene precio", "celda vacía", "excepción con motivo", "no me deja agendar", "no deja avanzar", "falta el precio", "no aplica", "falta talla", "falta pelaje"],
    cuerpo: `Al escoger perro y servicio, la pantalla de agendar calcula el precio. Si no se puede, sale **un solo aviso** que dice qué hacer. Nunca te quedas sin salida.

## Falta el tamaño o el pelaje

El aviso dice «Para calcular el precio falta el pelaje de …». Escógelo ahí mismo (**Tamaño** o **Pelaje**) y aprieta **Guardar en su expediente y calcular**: se guarda en el perro y el precio sale al instante.

## «Esta combinación no tiene precio»

La combinación de servicio, grupo, tamaño y pelaje no tiene precio capturado (o está en «No aplica»). Tienes dos salidas:

1. **Agregar el precio en Servicios y precios**: te lleva a la matriz de ese servicio. Necesitas ser admin o tener el permiso «Precios y tarifas».
2. **Registrar excepción con motivo**: escoge el **Grupo de precio** con el que quieres cobrar solo esta cita, escribe el **Motivo de la excepción** y el precio sale. Queda con tu nombre. Necesitas ser admin o tener el permiso «Excepciones al reservar».

## La raza no tiene grupo de precio

Es otra cosa: la raza es nueva y tu negocio no decidió su precio. Asigna el grupo o haz la excepción ([Cómo agregar una raza que no aparece](/ayuda/agregar-una-raza-que-no-aparece)).

> «Agendar cita» se activa cuando ya hay un precio.`,
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
5b. Debajo sale el **Precio** de la cita. Si falta el tamaño o el pelaje del perro, el aviso te los pide ahí mismo; si la combinación no tiene precio, te da dos salidas ([Qué hacer cuando no hay precio](/ayuda/que-hacer-sin-precio-estetica)). **Agendar cita** se activa cuando ya hay precio.
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
- «Esta combinación no tiene precio»: agrega el precio en Servicios y precios, o registra una excepción con motivo ([Qué hacer cuando no hay precio](/ayuda/que-hacer-sin-precio-estetica)). Un mestizo se cobra por tamaño y pelaje ([Cómo se cobra a un mestizo](/ayuda/precio-de-estetica-mestizo)).
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
    slug: "corregir-servicio-de-una-cita",
    titulo: "Cómo corregir el servicio de una cita",
    resumen: "Cuando se capturó un servicio que no era: cambiarlo, ver la diferencia de precio y qué pasa con el cobro.",
    grupo: "estetica",
    modulo: "estetica",
    roles: ["admin", "recepcion"],
    rutas: ["/estetica/[citaId]", "/caja/ajustes-servicio"],
    palabras: ["corregir servicio", "servicio equivocado", "cambiar servicio", "me equivoqué", "precio de la cita", "cobro de más", "cobro de menos", "saldo a favor", "cobro adicional", "el servicio de esta cita no existe"],
    cuerpo: `Si en recepción se capturó un servicio que no era (por ejemplo se capturó «Baño completo» y en realidad era el «Rapado»), se corrige desde la cita, en cualquier momento: antes de empezar, con el servicio en curso o ya terminado y cobrado.

Hace falta ser admin o tener el permiso **Corregir servicio de citas** (el admin lo da en [Permisos](/admin/permisos); viene apagado). Cambiar el servicio con otra herramienta no se puede: así queda siempre su historial.

## Cómo se corrige

1. Abre la cita desde [Estética](/estetica) y, en **Servicio de la cita**, aprieta **Corregir servicio**.
2. En **Servicio correcto** escoge el servicio. La app calcula el precio con las reglas de siempre: grupo de precio, talla, tipo de pelo y la tarifa de ese día.
3. Revisa el resumen: el precio de antes y el de ahora, la diferencia y qué pasará con la cuenta.
4. Escribe el **Motivo de la corrección (obligatorio)**.
5. Aprieta **Confirmar corrección**.

Si el perro no tiene grupo de precio para ese servicio, la app lo dice. Con el permiso **Excepciones al reservar** puedes escoger el grupo con el que se cobrará y su motivo; sin él, completa antes el grupo o el pelaje del perro en su expediente.

## Qué pasa con el cobro

El cobro original **nunca se toca ni se borra**. Lo que cambia es el saldo de la cuenta:

- **Cita abierta, sin cobrar:** la cuenta simplemente queda con el precio nuevo. Si había un cobro en la terminal esperando o un link de pago abierto por el monto equivocado, la app lo **cancela antes** de cambiar el servicio (y nunca cancela un pago que Mercado Pago ya aprobó).
- **Ya cobrada y ahora cuesta más:** la cuenta queda con un **cobro adicional** por cobrar. Lo cobras en [Caja](/caja) como cualquier saldo.
- **Ya cobrada y ahora cuesta menos:** queda un **saldo a favor** del cliente. Un admin lo devuelve desde la cuenta con **Registrar devolución** (si el cobro fue con Mercado Pago, con **Devolver con Mercado Pago**; mira [Cómo devolver un cobro](/ayuda/devolver-un-cobro)).

Mientras un cobro adicional o un saldo a favor siga sin resolverse, sale en **Necesita atención** y en [Ajustes por corrección de servicio](/caja/ajustes-servicio), con cuánto lleva esperando. Se quita solo cuando la cuenta queda en cero. Cada cobro o devolución entra al turno en el que se hace; los cortes ya cerrados no cambian.

> Si hay un cobro por confirmar con Mercado Pago, primero ábrelo en la cuenta y usa **Revisar con Mercado Pago**: no se corrige el servicio hasta que se resuelva.

## Inventario y comisión

Si el servicio ya estaba terminado, el inventario se ajusta: se regresa lo que consumió el servicio anterior y se consume lo del nuevo. La comisión y la propina de la estilista se recalculan; si su nómina de ese periodo ya se pagó, el pago no se toca y la diferencia sale como **Ajuste** en su siguiente pago, en [Nómina](/empleados/nomina).

## Qué queda registrado

En **Historial de servicio**, al pie de la cita: el servicio y el precio de antes y de ahora, quién lo corrigió, cuándo, el motivo y cómo quedó la cuenta. No se edita ni se borra.

## Si algo no sale

- «Corregir el servicio de una cita es de admin o de quien tenga el permiso…»: pídele al admin el permiso.
- «Hay un cobro por confirmar…»: revísalo primero en la cuenta con **Revisar con Mercado Pago**.
- «No se pudo cancelar el cobro en la terminal…»: cancélalo en la terminal y vuelve a intentarlo.
- «Esta cita se cubrió con un pase»: corrige primero el consumo del pase.
- «Esta cita está cerrada (cancelada o no llegó)»: una cita cancelada ya no tiene servicio que corregir.
- «El servicio de esta cita ya no se ofrece en el catálogo»: pasa con citas viejas cuyo servicio se retiró. La cita sigue mostrando el servicio con el que se registró; cámbialo aquí por el servicio vigente.`,
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

## Si el servicio estaba mal

¿Se capturó un servicio que no era? En cualquier momento (aun terminada y cobrada) se corrige con **Corregir servicio**; el precio se recalcula y la cuenta se ajusta. Mira [Cómo corregir el servicio de una cita](/ayuda/corregir-servicio-de-una-cita).

> El pelo maltratado se marca al agendar: cambia el precio del mismo baño, no es un cargo aparte.

## Si algo no sale

- «Solo se puede finalizar una cita que está en curso.»: primero iníciala.
- «Esta cita no tiene estilista asignada»: asígnale una antes de iniciarla o terminarla (arriba de los botones, en **Estilista**).`,
  },
];
