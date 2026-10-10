import type { Articulo } from "../tipos";

// Facturación CFDI 4.0 (14 de octubre de 2026). Los botones y pantallas de aquí
// son los de la app; si una cambia, se cambia su artículo en el mismo cambio.
export const ARTICULOS_FACTURACION: Articulo[] = [
  {
    slug: "configurar-la-facturacion",
    titulo: "Cómo configurar la facturación de tu negocio",
    resumen: "Los datos fiscales de tu negocio y la llave del PAC, que es quien timbra tus facturas.",
    grupo: "administracion",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/admin/facturacion"],
    palabras: ["cfdi", "factura", "facturar", "sat", "rfc", "pac", "facturapi", "timbrar", "llave", "régimen fiscal", "resico"],
    cuerpo: `Hay que hacerlo una sola vez. Lo hace el admin, o quien tenga el permiso **Editar datos fiscales**.

1. Entra a [Facturación](/admin/facturacion) en Administración.
2. Captura el **RFC**, la **razón social** (como viene en tu constancia de situación fiscal), el **régimen fiscal**, el **código postal de expedición**, si eres persona física, moral o sociedad civil, y la **serie** de tus facturas.
3. Escoge cómo quieres la **factura global**: diaria, semanal o mensual. Si tu régimen es RESICO, solo puede ser mensual.
4. Guarda la **llave del PAC** (la de Facturapi). Se prueba antes de guardarse y nadie puede volver a verla en la app. Mientras sea una llave de pruebas (empieza con sk_test), las facturas salen en el sandbox y **no tienen validez fiscal**.
5. Prende **Activar facturación** y guarda.

> Sin la llave del PAC no se puede timbrar nada. Los timbres tienen un tope al mes: la app te avisa cuando te acercas. Si necesitas más, escríbenos.`,
  },
  {
    slug: "datos-fiscales-de-un-cliente",
    titulo: "Cómo capturar los datos fiscales de un cliente",
    resumen: "Lo que pide el SAT para facturarle: RFC, nombre exacto, código postal, régimen y uso del CFDI.",
    grupo: "clientes",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["rfc", "constancia de situación fiscal", "uso del cfdi", "régimen", "datos para factura", "extranjero"],
    cuerpo: `Se capturan en la ficha del cliente, en la sección de datos fiscales, y hace falta el permiso **Editar datos fiscales**.

1. Abre al cliente en [Clientes](/clientes).
2. En datos fiscales aprieta **Editar datos fiscales**.
3. Copia del documento del cliente (su constancia de situación fiscal): el **RFC**, el **nombre o razón social tal cual** (sin el régimen de capital: sin «S.A. de C.V.»), el **código postal fiscal**, el **régimen fiscal** y el **uso del CFDI**.
4. Si quiere que le llegue por correo, escribe su **correo**.
5. Guarda.

La app revisa que el RFC tenga formato válido y que el régimen corresponda a persona física o moral. Si el nombre o el código postal no coinciden con el SAT, el PAC rechaza la factura y te dice qué falló.

- **Cliente extranjero sin RFC:** usa el RFC genérico **XEXX010101000**; la app pone el régimen 616 y el uso S01.
- **Público en general (XAXX010101000):** no se factura aparte; esas ventas van en la factura global del periodo.`,
  },
  {
    slug: "facturar-un-cobro",
    titulo: "Cómo facturar un cobro",
    resumen: "Sacar el CFDI de un cobro ya registrado y bajar el PDF y el XML.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/facturas"],
    palabras: ["factura", "cfdi", "timbrar", "pdf", "xml", "facturar", "descargar factura"],
    cuerpo: `Se factura **lo que se cobró**, sin la propina. Hace falta el permiso **Facturar**, que el cliente tenga sus [datos fiscales](/ayuda/datos-fiscales-de-un-cliente) y que la facturación esté [configurada](/ayuda/configurar-la-facturacion).

1. Cobra la cuenta como siempre.
2. En el cobro, aprieta **Facturar**. Si es una venta a «Público en general», la app te pide los datos fiscales de quien compra.
3. Espera unos segundos: la factura sale con su folio y UUID.
4. Bájala con **PDF** o **XML**, o mándala (mira [Cómo mandar una factura](/ayuda/mandar-una-factura-al-cliente)).

Todo queda en [Facturas](/caja/facturas), donde también ves las que están por timbrar o por revisar.

> Un cobro facturado **no se puede anular, corregir ni devolver** mientras su factura esté vigente. Primero se [cancela la factura](/ayuda/cancelar-o-sustituir-una-factura).

Si el internet se corta justo al timbrar, la factura queda **por revisar**: ábrela y aprieta **Revisar**; la app le pregunta al PAC si sí salió, sin timbrar dos veces.`,
  },
  {
    slug: "facturar-un-cobro-junto",
    titulo: "Cómo facturar un cobro junto en una sola factura",
    resumen: "Las cuentas que se cobraron juntas salen en una sola factura.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/recibo-junto"],
    palabras: ["cobro junto", "una factura", "varias cuentas", "recibo único"],
    cuerpo: `Cuando cobraste varias cuentas de la misma persona con [un solo pago](/ayuda/cobrar-varios-servicios-juntos), se factura todo junto.

1. Abre el recibo del cobro junto.
2. Aprieta **Facturar**.
3. Sale **una factura** con los conceptos de todas las cuentas, por lo que cobró cada una.

Necesitas el permiso **Facturar** y los [datos fiscales](/ayuda/datos-fiscales-de-un-cliente) del cliente. Si una de las cuentas ya tiene su propia factura vigente, la app te avisa cuál: cancélala primero o factura las demás por separado.`,
  },
  {
    slug: "factura-global-publico-en-general",
    titulo: "Cómo emitir la factura global al público en general",
    resumen: "Las ventas a quien no pidió factura se juntan en una factura por periodo, dentro de las 24 horas siguientes al cierre.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/caja/facturas"],
    palabras: ["factura global", "público en general", "xaxx", "periodo", "24 horas", "resico", "mensual"],
    cuerpo: `Los cobros que **no** se facturaron a nadie van en una **factura global** a «Público en general», con el IVA separado por tasa. Se emite por periodo (diario, semanal o mensual, según [tu configuración](/ayuda/configurar-la-facturacion); en RESICO, solo mensual) y **dentro de las 24 horas siguientes al cierre del periodo**.

1. Entra a [Facturas](/caja/facturas): arriba salen los periodos ya cerrados con cobros por facturar, cuántos cobros y cuánto suman, y hasta cuándo se puede emitir.
2. Aprieta **Emitir global** en el periodo.
3. Revisa que quede **vigente** y baja el PDF y el XML si los necesitas.

Si el periodo ya pasó de las 24 horas, sale marcado como vencido en «Necesita atención»: emítela de todos modos y no la dejes pasar.

> Solo entran los cobros desde el día en que se activó la facturación. Si prefieres que se emita sola, el admin puede prender **Emitir la global automáticamente** en Facturación (viene apagado).`,
  },
  {
    slug: "cancelar-o-sustituir-una-factura",
    titulo: "Cómo cancelar o sustituir una factura",
    resumen: "Los cuatro motivos del SAT, la sustitución por UUID y la espera de hasta 3 días.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["cancelar factura", "sustituir", "motivo 01", "motivo 02", "uuid", "corregir factura", "refacturar"],
    cuerpo: `Hace falta el permiso **Cancelar facturas**. Abre la factura en [Facturas](/caja/facturas).

## Si tiene un error y hay que rehacerla
Aprieta **Corregir y sustituir**. La app emite la factura nueva (relacionada con la anterior) y, solo si salió bien, cancela la vieja con el motivo **01** y el UUID de la nueva.

## Si solo hay que cancelarla
Aprieta **Cancelar factura** y escoge el motivo:

- **01** Emitida con errores, con relación (lleva el UUID de la que la sustituye).
- **02** Emitida con errores, sin relación.
- **03** No se llevó a cabo la operación.
- **04** Operación nominativa incluida en una factura global.

## Qué esperar
- Algunas cancelaciones necesitan que **el cliente las acepte**: la factura queda **pendiente de aceptación** hasta 3 días y sigue vigente mientras tanto. La app pregunta sola cómo va; también puedes apretar **Actualizar**. Si el cliente la rechaza, sigue vigente.
- Una factura que tiene **otra factura vigente relacionada** no se cancela hasta cancelar esa.
- Al cancelarse, los cobros quedan libres para facturarse otra vez.`,
  },
  {
    slug: "mandar-una-factura-al-cliente",
    titulo: "Cómo mandar una factura al cliente por WhatsApp o correo",
    resumen: "Un link para bajar el PDF y el XML, o el correo del PAC con los dos adjuntos.",
    grupo: "caja",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["enviar factura", "whatsapp factura", "correo factura", "mandar pdf", "mandar xml"],
    cuerpo: `Desde la factura vigente en [Facturas](/caja/facturas):

- **WhatsApp:** aprieta **Mandar por WhatsApp**. Se abre WhatsApp con un mensaje y un link para bajar el PDF y el XML. El link dura 30 días.
- **Correo:** escribe el correo y aprieta **Enviar por correo**. El PAC manda la factura con el PDF y el XML adjuntos.

La factura marca cuándo se mandó y por dónde. Si el cliente tiene portal, también la ve ahí (mira [Ver mis facturas](/ayuda/ver-mis-facturas)).`,
  },
  {
    slug: "iva-y-claves-sat-de-productos-y-servicios",
    titulo: "Cómo ajustar el IVA y las claves del SAT de lo que vendes",
    resumen: "Qué tasa de IVA lleva cada tipo de concepto, qué es «de patente» y cómo poner la clave del SAT.",
    grupo: "administracion",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["iva", "tasa 0", "exento", "de patente", "medicina", "alimento", "clave sat", "clave de producto", "unidad", "consulta veterinaria"],
    cuerpo: `En [Facturación](/admin/facturacion) cada concepto cae en una **clase** y cada clase tiene su IVA. Cambiarlo pide el permiso **Editar datos fiscales**. Los valores con los que arrancas:

- **Medicinas veterinarias de patente:** IVA 0 %.
- **Alimento procesado para mascotas:** IVA 16 %.
- **Estética, hospedaje y guardería:** IVA 16 %.
- **Consulta veterinaria:** exenta **solo** si tu negocio es persona física o sociedad civil; si no, 16 %.

## Productos que vendes
En la sección de productos marca cuáles son **de patente** y cuáles son alimento para mascotas. Lo que no marques se factura como producto con IVA 16 %.

## Servicios
Un servicio toma su clase solo (estética, guardería, hospedaje). Si uno no cae bien, escoge su clase a mano.

## Claves del SAT
Cada clase trae una clave de producto o servicio y una clave de unidad. Las de arranque son genéricas (01010101): **cámbialas** por las que te indique tu contador. Con **Buscar** consultas el catálogo del PAC.

El IVA sale desglosado por tasa en cada factura y en los reportes.`,
  },
  {
    slug: "ver-mis-facturas",
    titulo: "Cómo ver y bajar tus facturas (para el dueño)",
    resumen: "En tu portal, las facturas que te hizo el negocio, con su PDF y XML.",
    grupo: "portal",
    modulo: "portal",
    roles: ["admin", "recepcion"],
    rutas: ["/portal/facturas"],
    palabras: ["mis facturas", "portal facturas", "cfdi dueño", "descargar factura"],
    cuerpo: `Si el dueño tiene portal, ve sus facturas en **Mis facturas**: folio, fecha, total y si está vigente o cancelada. De cada una baja el **PDF** y el **XML**.

Solo ve las suyas. Para que le aparezca una factura, el negocio tiene que haberla timbrado a su nombre (con sus [datos fiscales](/ayuda/datos-fiscales-de-un-cliente)). Una factura de «Público en general» no sale en el portal de nadie.`,
  },
];
