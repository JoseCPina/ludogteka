import type { Articulo } from "../tipos";

// Artículos de la parte de administración: inventario, empleados, gastos,
// reportes, la configuración del negocio y cómo pedir ayuda. Cada botón,
// campo y ruta que se nombra existe tal cual en la pantalla: si cambia la
// pantalla, cambia aquí en el mismo cambio.
export const ARTICULOS_ADMINISTRACION: Articulo[] = [
  // ─── Inventario ───────────────────────────────────────────────────────
  {
    slug: "consumibles-compras-y-consumo",
    titulo: "Cómo dar de alta consumibles y registrar compras, consumo y merma",
    resumen: "Lleva la existencia de shampoo, toallas, croquetas y todo lo que se gasta, con aviso cuando se está acabando.",
    grupo: "inventario",
    modulo: "inventario",
    roles: ["admin", "recepcion"],
    rutas: ["/inventario", "/inventario/nuevo", "/inventario/[id]"],
    palabras: ["insumos", "existencia", "stock", "shampoo", "compra", "merma", "se acabó", "ajuste"],
    captura: "consumibles-compras-y-consumo.jpg",
    cuerpo: `Los consumibles son lo que se gasta: shampoo, acondicionador, toallas desechables, croquetas. Con cada compra y cada salida, la existencia se mantiene al día y te avisa antes de que se acabe.

## Dar de alta un consumible

1. Entra a [Inventario](/inventario) y aprieta **Nuevo consumible**.
2. Escribe el **Nombre** y escoge el **Área**.
3. Escoge la **Unidad de compra** (como lo compras: galón, pieza) y la **Unidad de consumo** (como lo usas: ml, pieza).
4. Pon la **Existencia inicial** y el **Stock mínimo**: debajo de ese número, avisa.
5. Si caduca, marca **Este insumo caduca**.
6. Aprieta **Dar de alta**.

## Registrar lo que entra y lo que sale

Abre el consumible desde la lista y usa los botones de **Movimientos**:

- **Registrar entrada (compra)**: cantidad comprada, costo y proveedor (opcional).
- **Registrar salida**: escoge **Consumo** o **Merma**. La merma pide motivo.
- **Ajuste por conteo físico**: cuando cuentas y no cuadra con el sistema.

> Lo que se usa en una cita de estética con receta se descuenta solo al finalizarla.

## Si algo no sale

- ¿No ves **Registrar entrada (compra)**? Se necesita ser admin o tener el permiso «Costos y compras de inventario».
- «No hay suficiente existencia de este insumo»: registra la compra que falta o haz un ajuste por conteo.`,
  },
  {
    slug: "vender-producto-en-mostrador",
    titulo: "Cómo poner un producto a la venta en mostrador",
    resumen: "Marca un consumible para venderlo en Caja y que la venta se descuente solita del inventario.",
    grupo: "inventario",
    modulo: "inventario",
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["vender", "precio de venta", "productos", "mostrador", "tienda", "accesorios"],
    cuerpo: `Si vendes croquetas, shampoo o juguetes en el mostrador, dalos de alta como consumibles y márcalos para venta. Así se cobran en Caja y la existencia baja sola.

1. En [Inventario](/inventario), abre el consumible (o créalo con **Nuevo consumible**).
2. Marca la casilla **Se vende en mostrador**.
3. Escribe el **Precio de venta al público**. Es por unidad de compra: si lo compras por pieza, es el precio de una pieza.
4. Aprieta **Guardar cambios** (o **Dar de alta** si es nuevo).

## Venderlo

1. En [Caja](/caja), aprieta **Venta rápida**.
2. Escoge al cliente o déjalo como «Público en general».
3. En **Producto del inventario** escoge el producto y aprieta **Agregar producto**.
4. Pon la **Cantidad** y aprieta **Cobrar** (el botón trae el total): pasas a la pantalla de cobro de siempre.

> Lo vendido sale en [Reportes](/reportes), en **Ventas de mostrador**.

## Si algo no sale

- «No hay productos a la venta»: ningún consumible tiene marcada **Se vende en mostrador**.
- «No hay suficiente … en inventario»: registra la compra que falta o un ajuste por conteo en su ficha.`,
  },
  {
    slug: "equipo-y-mantenimiento",
    titulo: "Cómo llevar el equipo y su mantenimiento",
    resumen: "Anota cuántas máquinas, tijeras y secadoras tienes, en qué estado están y cuándo les toca mantenimiento.",
    grupo: "inventario",
    modulo: "inventario",
    roles: ["admin", "recepcion"],
    rutas: ["/inventario/equipo"],
    palabras: ["máquinas", "tijeras", "secadora", "descompuesto", "afilado", "herramientas"],
    cuerpo: `El equipo es lo que se usa y no se gasta: secadoras, máquinas, tijeras, jaulas. Aquí sabes cuántos hay, cuáles sirven y a cuáles les toca mantenimiento.

## Dar de alta un equipo

1. En [Inventario](/inventario), abre la pestaña **Equipo** y aprieta **Nuevo equipo**.
2. Escribe el **Nombre**, el **Área**, **Cuántos hay** y su **Estado**.
3. Si lleva mantenimiento, llena **Cada cuántos días** y **Qué se le hace** (afilado, cambio de cuchillas).
4. Aprieta **Dar de alta**.

## El día a día

Abre el equipo desde la lista y usa:

- **Registrar mantenimiento**: queda en buen estado y el aviso vuelve a empezar.
- **Cambiar estado**: bueno, necesita mantenimiento, descompuesto o dado de baja.
- **Corregir cuántos hay**.

Todo queda en la **Bitácora** del equipo.

> Si de tres tijeras se descompone una, dala de alta aparte: cada fila tiene un solo estado.

## Si algo no sale

- «Escribe qué pasó (descompuesto o de baja necesita una nota)»: llena **Qué pasó**.
- «La fecha del mantenimiento no puede ser futura»: pon la fecha en que sí se hizo.`,
  },

  // ─── Empleados ────────────────────────────────────────────────────────
  {
    slug: "entrada-y-salida-de-empleados",
    titulo: "Cómo registrar la entrada y salida de un empleado",
    resumen: "Lleva la asistencia del día: quién llegó, a qué hora y quién va tarde.",
    grupo: "empleados",
    modulo: "empleados",
    roles: ["admin", "recepcion"],
    rutas: ["/empleados", "/mi-trabajo"],
    palabras: ["asistencia", "checar", "llegada", "retardo", "faltas", "horario"],
    cuerpo: `La asistencia se registra al momento, y con eso la app cuenta retardos y faltas contra el horario de cada quien. Retardo es llegar más de 10 minutos tarde.

## Si el empleado tiene cuenta en la app

1. Entra a [Mi asistencia](/mi-trabajo).
2. Al llegar aprieta **Registrar mi entrada**; al irse, **Registrar mi salida**.

## Si no tiene cuenta (limpieza, chofer)

1. En [Empleados](/empleados) ves a todos con su horario de hoy.
2. Junto a su nombre aprieta **Registrar entrada** y, al irse, **Registrar salida**.

Recepción registra solo a quien no tiene cuenta; admin puede registrar a cualquiera.

## Corregir un registro

Solo admin: abre al empleado, busca el día y aprieta **Corregir** (o **Capturar asistencia** si no hay registro). Escribe el motivo: el registro original se queda guardado.

## Si algo no sale

- «Esta persona tiene cuenta en la app: registra su entrada y salida desde su propia sesión»: que lo haga desde su cuenta, o pídele a un admin.
- «Tu cuenta no está ligada a ningún empleado»: un admin tiene que darte de alta en Empleados y ligar tu cuenta.
- «No hay entrada registrada hoy»: primero va la entrada.`,
  },
  {
    slug: "pagar-la-nomina",
    titulo: "Cómo pagar la nómina",
    resumen: "Calcula lo que se le paga a cada quien en un periodo, con faltas, comisiones, propinas y adelantos, y márcalo pagado.",
    grupo: "empleados",
    modulo: "empleados",
    roles: ["admin", "recepcion"],
    rutas: ["/empleados/nomina", "/empleados/comisiones"],
    palabras: ["sueldo", "pago", "quincena", "comisiones", "propinas", "adelantos", "raya"],
    captura: "pagar-la-nomina.jpg",
    cuerpo: `La app saca la cuenta con la asistencia, las citas que atendió cada quien y los adelantos que ya se dieron. Tú revisas y la marcas pagada. Lo ve admin o quien tenga el permiso «Nómina».

## Antes de la primera vez

Abre a cada empleado en [Empleados](/empleados) y aprieta **Capturar esquema de pago**: sueldo o pago por día, y su comisión. Sin esto sale «Sin esquema de pago».

## Pagar un periodo

1. Entra a [Nómina](/empleados/nomina).
2. Pon **Desde** y **Hasta** y aprieta **Calcular**.
3. Aprieta el nombre de un empleado para ver el desglose: faltas, comisiones, propinas y adelantos.
4. Escoge el **Método** y la **Fecha de pago** y aprieta **Marcar pagado**.

## Si cambió la estilista de un servicio

Si en una cita ya terminada se corrige la estilista y la nómina de quien la tenía ya se había pagado, ese pago no se toca. En el desglose del siguiente periodo aparece **Ajustes por cambio de estilista**: menos para quien ya cobró de más, más para quien no cobró. Ya están sumados en comisiones y propinas. Mira [Cómo cambiar o corregir la estilista de una cita](/ayuda/cambiar-estilista-cita-estetica).

## Si te equivocaste

Un pago no se borra. En **Pagos registrados**, aprieta **Revertir este pago**, escribe por qué y vuelve a pagarlo. Los adelantos que descontó quedan pendientes otra vez.

## Si algo no sale

- «Este periodo todavía no termina»: se paga cuando termine, o calcula hasta hoy.
- «Los adelantos son más que lo que se le debe»: paga un periodo más largo o cancela un adelanto desde su ficha.`,
  },

  // ─── Gastos ───────────────────────────────────────────────────────────
  {
    slug: "registrar-gastos-del-local",
    titulo: "Cómo registrar un gasto del local y los gastos recurrentes",
    resumen: "Anota la renta, la luz, la gasolina y lo que pagues, y que la app te recuerde lo que se repite cada mes.",
    grupo: "gastos",
    modulo: "gastos",
    roles: ["admin", "recepcion"],
    rutas: ["/gastos", "/gastos/recurrentes"],
    palabras: ["renta", "luz", "gasolina", "pagos fijos", "egresos", "recibos", "comprobante", "cancelar gasto", "corregir gasto", "retiro de caja"],
    captura: "registrar-gastos-del-local.jpg",
    cuerpo: `Aquí va todo lo que sale del negocio que no es inventario ni nómina: renta, luz, internet, gasolina. Con eso la utilidad de los reportes sale completa. Lo ve admin o quien tenga el permiso «Gastos del local».

## Registrar un gasto

1. Entra a [Gastos](/gastos) y baja a **Registrar un gasto**.
2. Llena **Concepto**, **Categoría**, **Monto**, **Fecha de pago** y **Cómo se pagó**.
3. Si cubre varios meses (la luz bimestral), llena **Cubre desde (mes)** y **Hasta (mes)**.
4. Aprieta **Registrar gasto**.

Si pagaste con **Efectivo del cajón**, se registra solo el retiro en el turno de caja abierto.

## Gastos que se repiten

1. Aprieta **Gastos recurrentes** y llena **Nuevo gasto recurrente**: concepto, **Cada cuándo** y **Siguiente vencimiento**. Aprieta **Guardar**.
2. Cuando se acerca la fecha, aparece en **Por pagar**. Ahí aprietas **Marcar pagado** o **No se paga**.

## Si algo no sale

- «No hay turno de caja abierto»: abre el turno en Caja o escoge otro método de pago.
- ¿Te equivocaste de monto? Usa **Corregir monto**, escribe el **Monto correcto** y el **Motivo** y aprieta **Guardar corrección**: queda un ajuste por la diferencia.

## Cancelar un gasto

1. En [Gastos](/gastos) busca el gasto en la lista del mes y aprieta **Cancelar**.
2. Escribe **¿Por qué se cancela?** y aprieta **Cancelar gasto**.

El gasto se queda tachado con su motivo y ya no cuenta en la utilidad. Nada se borra.

> Si lo pagaste con **Efectivo del cajón** y ese turno sigue abierto, su retiro también se quita: el dinero se queda en el cajón y el corte cuadra. Si el turno ya se cerró, el retiro se queda en ese corte; si el dinero no salió, regrésalo al cajón y anótalo en el siguiente corte.`,
  },

  // ─── Reportes ─────────────────────────────────────────────────────────
  {
    slug: "leer-los-reportes",
    titulo: "Cómo leer los reportes",
    resumen: "Cuánto ganaste de verdad en un periodo: ingresos, utilidad, ventas de mostrador, costos y operación.",
    grupo: "reportes",
    modulo: "reportes",
    roles: ["admin", "recepcion"],
    rutas: ["/reportes"],
    palabras: ["utilidad", "ganancias", "ingresos", "cuánto gané", "números", "margen", "corte del mes"],
    captura: "leer-los-reportes.jpg",
    cuerpo: `Los reportes te dicen cuánto entró, cuánto costó y cuánto te quedó. Los ve admin o quien tenga el permiso «Reportes financieros».

1. Entra a [Reportes](/reportes).
2. Escoge **Desde** y **Hasta** y aprieta **Actualizar**, o usa **Último mes completo** o **Mes en curso**.

## Qué dice cada parte

- **Utilidad del periodo**: ingreso reconocido menos insumos consumidos, nómina y gastos del local. Al lado ves el periodo anterior para comparar.
- **Ingreso reconocido**: lo que ganaste en el periodo. Un paquete de day pass cuenta cuando se usa, no cuando se vende.
- **Ingreso neto de caja**: lo que de verdad entró al cajón y a la terminal. Es el que cuadra con tus cortes.
- **Ventas de mostrador**: lo vendido en Venta rápida, productos y conceptos libres.
- **Costos y margen — estética**: compras, costo de lo que se usó en cada servicio y merma.
- **Operación del periodo**: días de guardería, noches de hotel, citas y cancelaciones.
- **Días de pase: reales y ajustados a mano**: los días que cubrió un pase en una estancia, aparte de los que se corrigieron a mano en el saldo del pase (esos no son asistencia ni mueven dinero).

> Si ves «Mes en curso: es un mes parcial», los gastos fijos van prorrateados a los días que llevan. Para el número cerrado, usa **Último mes completo**.`,
  },

  // ─── Administración ───────────────────────────────────────────────────
  {
    slug: "invitar-a-tu-equipo",
    titulo: "Cómo invitar a alguien de tu equipo",
    resumen: "Dale su propia cuenta a quien trabaja en recepción o en estética.",
    grupo: "admin",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["personal", "usuarios", "cuenta", "recepcionista", "estilista", "dar acceso", "agregar persona"],
    cuerpo: `Cada persona de tu equipo entra con su propia cuenta: así cada quien ve lo que le toca y todo queda con su nombre. Invita admin o quien tenga el permiso «Personal».

1. Entra a [Administración](/admin) y baja a **Invitar personal**.
2. Escribe su **Correo** y escoge el **Rol**: Recepción o Estética.
3. Aprieta **Invitar**.
4. Sale un link: aprieta **Copiar link** y mándaselo por WhatsApp. Con él entra y escoge su contraseña.

> Cópialo en ese momento: el link no se vuelve a mostrar.

Si esa persona ya tiene cuenta en otro negocio de PeluDesk, no hay link: sale «Acceso dado» y entra con la contraseña que ya usa.

Para que alguien de recepción te ayude a administrar, dale permisos extra en [Permisos](/admin/permisos).

## Si algo no sale

- «Ya existe una cuenta con ese correo.»: esa persona ya tiene cuenta; usa otro correo o revisa si ya está en tu equipo.
- «No tienes permiso para invitar personal.»: pídele a un admin el permiso «Personal».`,
  },
  {
    slug: "permisos-extra-a-recepcion",
    titulo: "Cómo dar permisos extra a recepción",
    resumen: "Deja que una persona de recepción te ayude con la nómina, los gastos, los reportes o los precios.",
    grupo: "admin",
    modulo: null,
    roles: ["admin"],
    rutas: ["/admin/permisos"],
    palabras: ["accesos", "delegar", "roles", "encargada", "qué puede ver", "privilegios"],
    cuerpo: `Recepción de entrada no ve números del negocio. Si alguien de confianza te ayuda a administrar, le das solo lo que necesita, persona por persona.

1. Entra a [Permisos](/admin/permisos) (también desde **Administrar permisos →** en el panel de admin).
2. Busca a la persona: cada quien de recepción tiene su tarjeta.
3. Marca la casilla del permiso. Se guarda en ese momento; para quitarlo, desmárcala.

Cada casilla dice qué incluye. Por ejemplo:

- **Nómina**: empleados, sueldos, adelantos y pagar la nómina.
- **Gastos del local**: registrar y pagar gastos.
- **Reportes financieros**: los mismos reportes que ves tú.
- **Personal**: invitar a gente de recepción y estética.
- **Corregir estilista de servicios cerrados**: cambiar quién atendió un servicio que ya terminó.
- **Corregir servicio de citas**: cambiar el servicio de una cita de estética que se capturó mal (abierta o ya cobrada); el precio se recalcula y la cuenta se ajusta.
- **Ajustar días de pases**: corregir los días usados de un pase, deshacer un check-in hecho por error y registrar un pase que ya traía días usados. No mueve dinero. Viene apagado: dáselo solo a quien deba corregir saldos.
- **Registrar tarjeta manual**: cobrar con **Tarjeta (registro manual)** cuando la terminal no se puede usar. Viene prendido para toda la recepción; quítaselo a quien no deba. Esos cobros los revisas tú en [Conciliación](/caja/conciliacion).

Todo cambio queda en la **Bitácora** de abajo.

> Dar o quitar permisos, crear admins, el tope de descuentos y las devoluciones siguen siendo solo tuyos.

Un permiso de un módulo apagado no hace nada hasta que lo prendas.

## Si algo no sale

- «No hay nadie de recepción»: primero invita a alguien desde [Administración](/admin).`,
  },
  {
    slug: "modulos-y-plan",
    titulo: "Cómo prender o apagar módulos y contratar tu plan",
    resumen: "Deja a la vista solo lo que usas y contrata PeluDesk con tarjeta.",
    grupo: "admin",
    modulo: null,
    roles: ["admin"],
    rutas: ["/admin/modulos"],
    palabras: ["plan", "suscripción", "pagar PeluDesk", "cancelar", "factura", "tarjeta", "funciones"],
    captura: "modulos-y-plan.jpg",
    cuerpo: `Si no usas hotel o inventario, apágalos y dejan de estorbar en el menú. Aquí también contratas tu plan.

## Prender o apagar un módulo

1. Entra a [Módulos y plan](/admin/modulos).
2. Junto al módulo aprieta **Apagar** o **Prender**.
3. Si hay cosas pendientes, te dice cuántas. Aprieta **Apagar de todos modos** o **Cancelar**.

Apagar no borra nada: si lo vuelves a prender, todo sigue ahí. Caja y clientes siempre están. Lo que dice «Fuera de tu plan» se prende cambiando de plan.

## Contratar

1. Escoge **Mensual** o **Anual · 2 meses gratis**.
2. Escoge tu plan y revisa el **Resumen** con el IVA.
3. Aprieta **Pagar con tarjeta**. El pago lo procesa Stripe.

Si contratas durante la prueba, no pierdes días: el primer cobro es al terminar.

## Después

- **Cambiar a este plan**: subir es inmediato; bajar entra al final del periodo.
- **Tarjeta, facturas y cancelación**: cambias tarjeta, bajas facturas o cancelas. Sigues con acceso hasta el final de lo que pagaste.

> Si un cobro falla, todo sigue funcionando 7 días. Después el negocio queda en solo lectura hasta que se pague.`,
  },
  {
    slug: "conectar-mercado-pago-o-clip",
    titulo: "Cómo conectar Mercado Pago o Clip",
    resumen: "Cobra con tu terminal desde la Caja y que el cobro se registre solo.",
    grupo: "admin",
    modulo: null,
    roles: ["admin"],
    rutas: ["/admin/pagos"],
    palabras: ["terminal", "Point Smart", "cobro con tarjeta", "link de pago", "TPV", "integrar"],
    cuerpo: `Con tu terminal conectada, cobras desde la Caja y el pago se registra solo en el turno. El cobro a mano funciona siempre, conectes o no.

1. Entra a [Cobro con terminal](/admin/pagos).
2. En **¿Con qué cobras en el mostrador?** escoge **Mercado Pago**, **Clip** o **Solo manual**.

## Mercado Pago

1. Aprieta **Conectar Mercado Pago**, entra con la cuenta de tu negocio y autoriza.
2. Al regresar sale «Mercado Pago quedó conectado».
3. Aprieta **Ver las terminales de mi cuenta**.
4. Si tu Point Smart dice «No está en modo integrado (PDV)», aprieta **Poner en modo integrado**.
5. Aprieta **Usar esta**.

> **PeluDesk solo concilia los pagos que cobra desde aquí**; los demás pagos de tu cuenta de Mercado Pago (otra tienda, transferencias, otra terminal, cobros personales) se ignoran. Si quieres verlos solo como información, enciende **Mostrar también otros pagos de mi cuenta de Mercado Pago** en esta misma pantalla: salen en Caja → Conciliación, en **Otros pagos de tu cuenta (informativo)**, sin alertas.

Solo Point Smart recibe cobros desde la app. Con otras terminales, o si la terminal no se puede usar, registra el cobro con **Tarjeta (registro manual)** y el folio del voucher ([Cuándo usar Tarjeta (registro manual)](/ayuda/tarjeta-registro-manual)): con Mercado Pago o Clip elegidos, **Terminal** no se captura a mano.

## Clip

1. Llena **API key**, **Clave secreta**, **Número de serie de la terminal** y **Correo del usuario de Clip**. Las generas en el portal de desarrolladores de Clip.
2. Aprieta **Conectar Clip**.
3. Copia la URL de notificaciones con **Copiar URL** y pégala en ese mismo portal.

## Tope de alerta de tarjeta manual

Más abajo, en **Tarjeta registrada a mano**, pon el **Tope de alerta por cobro (MXN)** y aprieta **Guardar tope** (por omisión $2,000). Arriba de ese monto, una tarjeta registrada a mano se guarda igual pero sube a **Necesita atención** para que la revises ([Cómo revisar las tarjetas manuales](/ayuda/revisar-tarjetas-manuales)).

## Si algo no sale

- «Esa cuenta de Mercado Pago ya está conectada a otro negocio de PeluDesk»: cada cuenta conecta un solo negocio.
- «Tu cuenta no tiene terminales vinculadas»: vincula tu Point Smart desde la app de Mercado Pago y vuelve a apretar el botón.`,
  },
  {
    slug: "horario-y-datos-del-negocio",
    titulo: "Cómo cambiar el horario y los datos del negocio",
    resumen: "Ajusta los días y horas que abres, el cupo y el WhatsApp de recepción.",
    grupo: "admin",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/admin"],
    palabras: ["horario", "días que abre", "cupo", "teléfono", "WhatsApp", "configuración", "sábado"],
    cuerpo: `El horario manda en muchas cosas: qué días se puede reservar guardería, cuándo se entrega un perro de hotel y cuántos días trae una mensualidad. Lo cambia admin o quien tenga el permiso «Configuración del negocio».

## Horario

1. Entra a [Administración](/admin) y baja a **Horario de atención**.
2. Marca los días que abres y pon la hora de apertura y de cierre.
3. Aprieta **Guardar horario**.

## Cupo y WhatsApp

1. En **Configuración del negocio** llena el **WhatsApp de recepción**: ahí llega el «olvidé mi contraseña» de tus clientes.
2. Pon el **Cupo de día** (perros que caben en el área común) y el **Cupo de noche** (los que tienen dónde dormir).
3. Aprieta **Guardar configuración**.

> La descripción, la dirección, el logo y las fotos de tu página van en [Perfil y página web](/admin/perfil).

## Si algo no sale

- «Hay reservas en días que ya no abren»: no se cancelan solas. Revísalas en Guardería y Hotel.
- «Falta el WhatsApp de recepción»: sin él, un cliente que olvide su contraseña no tiene a dónde escribir.`,
  },

  // ─── Página web ───────────────────────────────────────────────────────
  {
    slug: "politicas-y-reglas",
    titulo: "Cómo escribir las políticas y reglas que ve el dueño",
    resumen: "Lo que le dices al cliente al registrarse por link y en su portal: evaluación, celo, cierre, cómo reservar, cancelaciones.",
    grupo: "admin",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/admin/politicas"],
    palabras: ["reglas", "políticas", "agresivos", "celo", "cancelación", "anticipo", "noche de hotel", "cómo reservar", "texto del alta"],
    cuerpo: `Cuando un dueño se registra por link o entra a su portal, la app le dice tus reglas: qué le vas a pedir a su perro y cómo se reserva. Esas reglas las escribes tú; nada viene escrito por PeluDesk salvo lo que la app hace igual para todos. Lo cambia admin o quien tenga el permiso «Configuración del negocio».

1. Entra a [Políticas y reglas](/admin/politicas).
2. Escribe cada regla con tus palabras, como se lo dirías en el mostrador. Si una no aplica en tu negocio, déjala vacía: no se menciona.
3. Aprieta **Guardar políticas**.

Cada regla solo se muestra con el módulo que la usa prendido: sin hotel no se habla de la noche de hotel, sin estética no sale lo de estética. Una regla apagada se ve en gris hasta que prendas el módulo.

> Las vacunas que pides y su vigencia no van aquí: salen del catálogo de requisitos sanitarios. El horario sale de [Administración](/admin).

## Si algo no sale

- «Solo un admin, o quien tenga el permiso «Configuración del negocio», puede cambiar las políticas del negocio.»
- Una regla en gris: falta prender el módulo en [Módulos y plan](/admin/modulos).`,
  },
  {
    slug: "perfil-y-pagina-web",
    titulo: "Cómo armar tu perfil y tu página web",
    resumen: "Sube tu logo, tus fotos y tu dirección, y tu página se arma sola con tus servicios y precios.",
    grupo: "pagina_web",
    modulo: "pagina_web",
    roles: ["admin", "recepcion"],
    rutas: ["/admin/perfil"],
    palabras: ["sitio web", "página", "logo", "fotos", "dirección", "web gratis", "internet"],
    captura: "perfil-y-pagina-web.jpg",
    cuerpo: `Tu página web se arma sola con tu perfil, tus servicios, tus precios y tu horario. Tú solo pones lo que la hace tuya: logo, fotos y dirección.

1. Entra a [Perfil y página web](/admin/perfil).
2. En **Datos** escribe una **Descripción** corta (qué ofreces y qué te hace distinto) y tu **Dirección**. Aprieta **Guardar datos**.
3. En **Logo**, escoge el archivo y aprieta **Subir logo**.
4. En **Fotos del negocio**, sube al menos 3 con **Agregar foto**: tu local, tu equipo, perros felices.

## Gánala gratis de por vida

Si en los primeros 7 días de tu prueba completas todo, la página web te queda gratis para siempre:

- Terminar los primeros pasos
- Subir tu logo y al menos 3 fotos
- Ponerle precio a un servicio
- Guardar tu horario
- Escribir tu dirección

Arriba de la pantalla ves cuántos llevas y cuántos días te quedan. Si no, la página es un complemento que se contrata aparte.

## Si algo no sale

- «La foto tiene que ser JPG, PNG o WebP.»
- «La foto pesa demasiado (máximo 6 MB).»: usa una foto más ligera.`,
  },

  // ─── Ayuda ────────────────────────────────────────────────────────────
  {
    slug: "pedir-ayuda",
    titulo: "Cómo pedir ayuda y crear un ticket de soporte",
    resumen: "Encuentra la respuesta en los artículos, en un video o con el asistente, y si no, escríbenos con un ticket.",
    grupo: "ayuda",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/ayuda", "/ayuda/videos"],
    palabras: ["soporte", "ticket", "problema", "no funciona", "asistente", "contacto", "reportar error", "videos", "tutoriales", "cómo se hace"],
    cuerpo: `Si algo no te sale, primero busca aquí: casi siempre hay un artículo con los pasos. Si no se resuelve, nos mandas un ticket y te contestamos.

1. En el menú, entra a **Ayuda**.
2. Busca lo que necesitas o pregúntale al asistente con tus palabras.
3. Si prefieres verlo, en **Videos** está la serie completa: cada tarea paso a paso, con subtítulos y a la velocidad que quieras. En cada pantalla, el botón **¿Cómo se hace?** (junto al **?**) te lleva directo al video de esa pantalla.
4. Si no se resolvió, aprieta **Crear ticket**.
5. Escribe un asunto y cuéntanos qué pasó. Si puedes, agrega una captura de pantalla.

No tienes que explicar dónde estabas: el ticket lleva sola la pantalla en la que estabas y tu conversación con el asistente.

## Después de mandarlo

- Cada ticket pasa por **abierto**, **en proceso** y **resuelto**.
- Cuando te contestemos, te sale un aviso arriba en la app. Si eres admin, también te llega por WhatsApp.
- Recepción ve sus propios tickets; el admin ve todos los del negocio.

> Entre más nos cuentes (qué apretaste, qué esperabas y qué salió), más rápido lo resolvemos.`,
  },
];
