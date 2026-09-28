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
- Precios de estética: salen solos por raza o talla, con precio aparte si el perro llega con el pelo maltratado.
- Cupo: guardería y hotel cuentan del mismo cupo; no se acepta un perro que no cabe.
- Expediente de cada perro: foto, vacunas, alertas de manejo (si se escapa, si es alérgico, si come aparte), medicamentos y bitácora del día con fotos.
- Estética: agenda con una columna por estilista, sin citas encimadas. Al terminar la cita se descuenta del inventario lo que se usó.
- Caja: noches, guardería, baño y extras en una sola cuenta. Se cobra en efectivo, transferencia o tarjeta, se da cambio y en la noche se cuadra la caja (turno, retiros y arqueo).
- Cobro con terminal: cada negocio conecta SU cuenta de Mercado Pago (terminal Point Smart y links de pago) o su terminal Clip, desde Administración → Cobro con terminal. El cobro a mano funciona siempre. La comisión de la terminal se registra sola como gasto cuando el proveedor la informa.
- Day pass y mensualidades de guardería, por perro.
- Recolección a domicilio con cargo por kilómetro.
- Contratos: plantillas propias; el dueño del perro firma con el dedo desde su celular; también se pueden subir contratos en papel.
- Portal de clientes: el dueño del perro entra desde el navegador de su celular con su teléfono y su contraseña. Ve sus citas, vacunas, fotos del día, pases y contratos, y firma. Nunca ve los precios internos ni a otros clientes.
- Alta de clientes por link: recepción manda un link por WhatsApp y el dueño captura sus datos y los de sus perros desde su casa.
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
- Durante la prueba están abiertos los módulos del plan Completo, más la página web.
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
