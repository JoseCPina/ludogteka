/**
 * Lo que el bot de WhatsApp de PeluDesk puede afirmar (28 de septiembre de 2026).
 *
 * Regla: aquí solo entra lo que la app HACE HOY, con las palabras de la
 * landing. Los planes y precios NO van aquí: salen de la base en cada
 * conversación (tabla `planes`, que edita la plataforma). Si una función
 * cambia en la app, se cambia aquí también; si no está aquí, el bot no lo
 * sabe y lo pasa a Telegram. Lo que el operador enseña desde Telegram
 * (/aprender) se suma en `wa_aprendido` sin desplegar.
 */
export const CONOCIMIENTO = `
# Qué es PeluDesk
Software para guarderías, hoteles y estéticas caninas, hecho en México. Se usa desde el navegador: en la computadora del mostrador, en una tableta o en el celular de cualquiera del equipo. No hay que instalar nada.
PeluDesk es una marca de Menteo, S.A.S.
Cada negocio tiene su propia dirección: <su-nombre>.peludesk.mx.

# Qué le quita de encima al negocio
- En la mañana: abres y ya ves quién llega, quién se va, las citas de estética y el cupo de día y de noche. También lo que está esperando (contratos por firmar, cartillas por revisar, saldos), con los días que lleva cada uno.
- Vacunas: si una vacuna venció, no deja reservarle guardería ni hotel al perro, y dice cuál falta. En estética no bloquea.
- Precios de estética: tres baños (completo, rapado y exprés) con precio por grupo de raza o, para pelo corto, por talla; precio aparte si el perro llega con el pelo maltratado; el rapado solo para pelo medio o largo; un recargo manual con motivo lo registra quien tiene el permiso de excepciones, y el dueño ve la nota «el costo puede aumentar según el tipo de pelo y el cuidado previo». El alta de un cliente de solo estética es corta (nombre y WhatsApp del dueño; nombre, raza, tamaño y pelaje del perro). Al cliente que se dio de alta en el mostrador se le puede mandar un enlace de un solo uso (Invitar al portal, en su ficha) para que abra su cuenta. Si la raza no está en el catálogo, quien captura al perro la propone ahí mismo («No la encuentro: agregar esta raza», con nombre, otros nombres, talla, pelo y notas); la revisa PeluDesk y el negocio decide el grupo de precio de la raza: nunca se adivina, y sin grupo no se agenda la estética de ese perro.
- Cupo: guardería y hotel cuentan del mismo cupo; no se acepta un perro que no cabe.
- Expediente de cada perro: foto, vacunas, alertas de manejo (si se escapa, si es alérgico, si come aparte), medicamentos y bitácora del día con fotos.
- Reporte de comportamiento diario (guardería): por cada perro que está adentro, recepción llena en la tablet o el celular un formulario con botones grandes (estado general, actividades, socialización, conducta, alimentación, descanso, recomendaciones y resumen del día) y la app arma una tarjeta con la marca del negocio. Se manda por WhatsApp como una liga, no como archivo, y vence a los 7 días. Las opciones las edita el admin (renombrar, apagar o agregar). No se genera ni se envía nada en bloque: cada reporte lo revisa una persona.
- Fotos y videos de los perros adentro (guardería y hotel): en «Adentro ahora» cada perro trae «Tomar foto», «Tomar video» y «Elegir de la galería»; el personal escoge lo que quiere y se lo manda al dueño por WhatsApp como liga a una galería. Los videos pueden durar hasta 45 segundos y pesar hasta 60 MB. Todo se borra solo a los 7 días (el negocio puede cambiarlo) y la liga deja de funcionar. Lo usan admin y las personas de recepción a quienes el admin les da el permiso «Reportes de guardería».
- Estética: agenda con una columna por estilista, sin citas encimadas. Al terminar la cita se descuenta del inventario lo que se usó. La estilista de una cita se cambia desde el tablero del día o desde la cita: antes de empezar o en curso lo hace recepción o admin en un toque (también «Sin asignar»); corregirla cuando el servicio ya terminó es de admin o de quien tenga el permiso «Corregir estilista de servicios cerrados», con motivo, y queda un historial en la cita. Si la nómina ya se pagó, el pago no cambia: la diferencia de comisión y propina se ajusta en el siguiente pago.
- Corregir el servicio de una cita de estética (cuando se capturó uno que no era): en el detalle de la cita, «Corregir servicio», en cualquier momento (abierta, en curso o ya terminada y cobrada). Es de admin o de quien tenga el permiso «Corregir servicio de citas» (viene apagado; el admin lo da por persona en Permisos), con motivo obligatorio. El precio se recalcula con las reglas de la cita (grupo de precio, talla, pelo, excepciones) y se ve la diferencia antes de confirmar. El cobro original nunca se toca ni se borra: si había un cobro en la terminal o un link de pago abierto por el monto anterior, se cancela antes (nunca uno que Mercado Pago ya aprobó); si ya estaba cobrada y cuesta más, la cuenta queda con un cobro adicional que se cobra en Caja; si cuesta menos, queda un saldo a favor que un admin devuelve (con Mercado Pago, «Devolver con Mercado Pago»). Mientras esté pendiente sale en «Necesita atención» y en Caja → Ajustes por corrección de servicio. Si el servicio ya estaba terminado también se ajusta el inventario y, si la comisión ya se pagó, la diferencia sale como ajuste en el siguiente pago de nómina. Queda un historial inmutable en la cita (servicio y precio de antes y de ahora, quién, cuándo y motivo). Una cita vieja cuyo servicio se retiró del catálogo sigue mostrando el servicio con el que se registró y se corrige igual.
- Cobros con terminal: solo cuentan como cobrados cuando Mercado Pago confirma un pago aprobado (la app lo consulta directo: mismo monto, cuenta y referencia); si algo no cuadra la orden queda «Por confirmar con Mercado Pago» (no es dinero) y se resuelve con «Revisar con Mercado Pago». Con Mercado Pago o Clip elegidos, «Terminal» no se captura a mano: si la terminal no se puede usar (caída, sin señal, otra terminal) se registra el cobro con «Tarjeta (registro manual)», con el folio del voucher y el motivo; cuenta como pagado desde que se registra pero queda «Sin verificar» y aparece como línea aparte («Tarjeta manual (sin verificar)») en el turno, el corte y los reportes, nunca mezclado con la terminal verificada. El admin lo revisa en Caja → Conciliación («Revisado con voucher» o «Marcar como no recibida», con motivo y sin borrar nada); hay un tope de alerta por cobro (por omisión $2,000, lo cambia el admin en Cobro con terminal) y un aviso si se usa de más con la terminal conectada. Es un permiso, «Registrar tarjeta manual», que viene prendido para la recepción. Cada hora la app concilia los cobros con terminal contra Mercado Pago y marca las diferencias en «Necesita atención» (no corrige solo); el admin corrige un cobro a mano que no se recibió con «Marcar como no recibido» (se comprueba con Mercado Pago, con motivo e historial).
- Caja: noches, guardería, baño y extras en una sola cuenta. Se cobra en efectivo, transferencia o tarjeta, se da cambio y en la noche se cuadra la caja (turno, retiros y arqueo).
- Cobro con terminal: cada negocio conecta SU cuenta de Mercado Pago (terminal Point Smart y links de pago) o su terminal Clip, desde Administración → Cobro con terminal. Al desconectar Mercado Pago se cancelan las órdenes en cola y la app recuerda la terminal; al reconectar la misma cuenta la recupera, y si no, el admin la escoge en Administración → Cobro con terminal (mientras, «Cobrar con terminal» sale deshabilitado). Si la terminal pide cobros vinculados o no recibe el cobro: en la terminal, Más opciones → Ajustes → Modo de vinculación, para volver a modo independiente. El cobro a mano funciona siempre. La comisión de la terminal se registra sola como gasto cuando el proveedor la informa.
- Devoluciones: un cobro que entró por Mercado Pago (terminal o link) se devuelve desde la app, total o parcial; Mercado Pago lo reembolsa y queda en la caja en el mismo paso, y la comisión que regresa se quita de los gastos. Lo que se reembolse desde el panel de Mercado Pago también entra solo a la caja y sale en «Necesita atención». Con Clip, la devolución se hace en Clip y en la app se registra.
- Venta rápida en Caja: vender un producto del inventario (shampoo, croquetas, un collar) o cualquier concepto con su monto, sin reserva ni perro; con cliente o a «Público en general». Descuenta el inventario y sale aparte en el corte y los reportes.
- Ayuda dentro de la app: artículos paso a paso de cada pantalla (también en https://peludesk.mx/ayuda), un asistente que contesta con esos artículos y tickets de soporte con respuesta de una persona de PeluDesk.
- Day pass y mensualidades de guardería, por perro.
- Recolección a domicilio con cargo por kilómetro.
- Contratos: plantillas propias; el dueño del perro firma con el dedo desde su celular; también se pueden subir contratos en papel. Son de guardería y hotel: en estética no hay contratos (a una estética no le ofrezcas contratos).
- Portal de clientes: el dueño del perro entra desde el navegador de su celular con su teléfono y su contraseña. Ve sus citas, vacunas, fotos del día, pases y contratos, y firma. Nunca ve los precios internos ni a otros clientes.
- Alta de clientes por link: recepción manda un link por WhatsApp y el dueño captura sus datos y los de sus perros desde su casa. Con guardería u hotel prendidos, el link también le pide la foto o el PDF del carnet de vacunas; lo que sube lo revisa recepción antes de contar, y si no lo sube el perro queda «sin registro» y no puede reservar guardería ni hotel.
- Inventario: consumibles con mínimo de existencia y compras; equipo (secadoras, jaulas) con su mantenimiento.
- Empleados: asistencia, retardos, ausencias y vacaciones, comisiones de estética, propinas, adelantos y nómina.
- Gastos del local, con gastos recurrentes y comprobantes.
- Reportes: ingresos, costos, margen por servicio y utilidad (lo cobrado menos insumos, nómina y gastos del local), comparado con el periodo anterior.
- Página web del negocio con sus servicios, precios, fotos, horario y WhatsApp.
- Permisos: el admin le puede dar a una persona de recepción permisos extra (costos e inventario, tarifas, reportes, personal, configuración, gastos, nómina, entre otros) en Administración → Permisos.
- Roles: admin (dueño), recepción, estética y cliente (dueño del perro).
- Módulos: el admin prende y apaga los módulos de su plan en Administración → Módulos y plan. Apagar un módulo nunca borra nada.

# Prueba gratis
- 15 días gratis, sin tarjeta. Se registra en https://peludesk.mx/registro con su teléfono, una contraseña, el nombre del negocio, su ciudad y los servicios que ofrece (guardería, hotel, estética).
- Durante la prueba están disponibles los módulos del plan Completo, más la página web. Los servicios que NO escogió al registrarse (guardería, hotel o estética) arrancan apagados; los prende cuando quiera en Administración → Módulos y plan.
- Al entrar hay cinco primeros pasos para dejarlo listo.
- Página web gratis de por vida si en los primeros 7 días de la prueba completa su perfil: primeros pasos, logo, 3 fotos, al menos un precio, horario y dirección. Si no, la página web es un complemento con costo.
- Cuando termina la prueba no se borra nada: puede consultar todo y vuelve a capturar en cuanto contrata.
- En la prueba, mientras no conecte su cuenta de Mercado Pago o Clip, la terminal y los links funcionan en simulación (no mueven dinero). Si ya conectó su cuenta real, los cobros son de verdad.

# Demo
Hay un negocio de ejemplo, Patitas & Co., con dos meses de movimiento inventado. Se puede entrar como recepción, estilista, dueña del negocio o dueña de un perro. Es de solo lectura: nada se guarda.

# Contratar y pagar PeluDesk
- Se paga por negocio, al mes o al año. No se cobra por perro ni por cliente.
- Los precios son más IVA (16 %). Si paga el año, paga diez meses.
- Se contrata desde la app: Administración → Módulos y plan. El pago es con tarjeta, por Stripe.
- Si contrata durante la prueba no pierde días: el primer cobro es cuando termina la prueba.
- Subir de plan (o pasar de mensual a anual) es inmediato, cobrando la diferencia proporcional. Bajar de plan toma efecto al terminar el periodo pagado, y antes avisa qué módulos se apagan.
- Cambiar la tarjeta, ver facturas de Stripe o cancelar: desde Administración → Módulos y plan, en el portal de pagos.
- Cancelar: cuando quiera; lo sigue usando hasta que termina lo que ya pagó.
- Si un cobro falla: todo sigue funcionando 7 días (gracia) mientras actualiza la tarjeta. Desde el día 8 la cuenta queda en solo lectura: nada se borra y todo se puede consultar. En cuanto se paga, se reactiva solo.
- Factura fiscal (CFDI): PeluDesk no la emite desde la app. Eso se escala.

# Dudas frecuentes de uso (dónde está cada cosa)
- Entrar: con su teléfono o correo y su contraseña, en la dirección de su negocio.
- Invitar a alguien de su equipo: Administración (sección de personal).
- Precios y servicios: Servicios.
- Horario del negocio y datos: Administración.
- Perfil y página web: Administración → Perfil y página web.
- Conectar la terminal: Administración → Cobro con terminal.
- Plan, módulos y pago: Administración → Módulos y plan.
- El tablero del día está en la pantalla de inicio de recepción.
- Clientes y sus perros: Clientes. Reservas de guardería y hotel: Guardería y Hotel. Citas: Estética. Cobros: Caja.
- La contraseña de un cliente la restablece el negocio desde la ficha del cliente.
`.trim();
