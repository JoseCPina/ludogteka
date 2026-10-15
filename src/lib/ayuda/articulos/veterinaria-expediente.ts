import type { Articulo } from "../tipos";

/**
 * Veterinaria, Fase 3: agenda clínica, expediente por consulta (SOAP), diagnósticos, adjuntos y
 * resultados de laboratorio, línea de tiempo, estimados y la vista del dueño en el portal.
 * Cada botón y cada ruta que se nombra aquí existe tal cual en la app: si cambia la pantalla,
 * cambia su artículo en el mismo cambio.
 */
export const ARTICULOS_VETERINARIA_EXPEDIENTE: Articulo[] = [
  {
    slug: "agenda-clinica-veterinaria",
    titulo: "Cómo agendar y llevar la agenda clínica",
    resumen: "Citas por médico y por tipo, sin empalmes, con confirmar, iniciar consulta, mover y cancelar.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/agenda", "/veterinaria/agenda/nueva"],
    palabras: ["agenda", "cita", "agendar", "médico", "consulta", "vacuna", "cirugía", "seguimiento", "urgencia", "empalme", "reprogramar", "cancelar"],
    cuerpo: `La agenda clínica es de Veterinaria y funciona con varios médicos. Está en [Agenda clínica](/veterinaria/agenda): una columna por médico, del día o de la semana.

## Agendar

1. Aprieta **Agendar**.
2. Busca a la mascota por su nombre, el de su dueño o su teléfono y elígela.
3. Elige el **tipo de cita** (consulta, vacuna, cirugía, seguimiento o urgencia), el **médico**, la fecha y la hora. La duración sale del tipo; si hace falta, escríbela.
4. Aprieta **Agendar cita**.

Un médico **no puede tener dos citas encimadas**: si lo intentas, te dice a qué hora tiene su otra cita. Una **urgencia** sí entra aunque se empalme, y te avisa.

## En la agenda

- **Confirmar**: cuando el dueño avisó que sí viene.
- **Iniciar consulta**: abre el expediente de esa cita (lo hace quien atiende consultas).
- **Reprogramar**: cambia el día, la hora o el médico.
- **No llegó** y **Cancelar** (la cancelación pide el motivo).

Los filtros de arriba muestran solo a un médico. Cambiar cuánto dura cada tipo de cita se hace en [Ajustes de Veterinaria](/veterinaria/ajustes).

> Para agendar necesitas ser recepción, admin, médico o tener **Atender consultas**. Si no hay médicos, un admin los designa en Veterinaria → Médicos.`,
  },
  {
    slug: "consulta-veterinaria-soap",
    titulo: "Cómo hacer una consulta y firmarla",
    resumen: "Expediente por consulta con motivo, examen, diagnósticos, plan y tratamiento; se guarda solo y se firma con la cédula.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/expediente", "/veterinaria/expediente/[perroId]", "/veterinaria/consulta/[id]"],
    palabras: ["consulta", "expediente", "SOAP", "anamnesis", "examen físico", "diagnóstico", "plan", "tratamiento", "firmar", "cédula", "adenda", "borrador", "signos vitales", "peso"],
    cuerpo: `Cada consulta es un registro con sus partes: lo que cuenta el dueño (**motivo y anamnesis**), lo que encuentras (**signos vitales, examen físico y hallazgos**), el **diagnóstico** y el **plan y tratamiento**.

## Abrir una consulta

- Desde la agenda: **Iniciar consulta** en la cita.
- Desde el expediente: en [Expediente clínico](/veterinaria/expediente) busca a la mascota y aprieta **Nueva consulta**. Elige el tipo y el **médico a cargo**.

Nace como **borrador** con la plantilla de su tipo (el negocio la edita en Ajustes de Veterinaria).

## Escribirla

Se **guarda sola** unos segundos después de que dejas de escribir; arriba ves «Borrador guardado». Si se va la conexión o cierras la pestaña a medias, al volver sale «Tienes un borrador sin guardar» con **Recuperar borrador**. El peso que captures entra al historial de pesos cuando la firmas.

Para el diagnóstico, **Buscar diagnóstico**: escribe el nombre o como se le conoce («tos de perrera», «FLUTD»). Elígelo como **presuntivo** o **definitivo** y cámbialo cuando lo confirmes. Si no está, escríbelo y, si quieres, guárdalo en el catálogo de tu negocio.

Las **notas internas** son solo para el equipo: el dueño nunca las ve.

## Firmarla

**Firmar la consulta** la firma el médico a cargo, con su cédula. Al firmar:

- ya **no se edita ni se borra**;
- queda el nombre del médico, su cédula, la fecha y una huella del contenido;
- si necesitas corregir o completar algo, el médico agrega una **adenda** firmada;
- si se capturó en la mascota equivocada, **Anular la consulta** con su motivo (queda a la vista, tachada).

Una consulta de consulta, cirugía o urgencia pide al menos un diagnóstico para firmarse. Un borrador que no quieras se **descarta**.

Antes del botón de firmar está el recuadro **Cargos de esta consulta**: lo que pasará a Caja. Mira [Cómo se cobra una consulta veterinaria](/ayuda/cobrar-una-consulta-veterinaria).

> Una consulta firmada sin diagnóstico definitivo aún se puede completar con una adenda. Lo que lleva más de un día en borrador sale en **Necesita atención**.`,
  },
  {
    slug: "cobrar-una-consulta-veterinaria",
    titulo: "Cómo se cobra una consulta veterinaria",
    resumen: "Al firmar, la consulta pasa a Caja con su tipo, las vacunas, los medicamentos y los procedimientos; el médico ve el resumen antes y puede quitar o ajustar.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/consulta/[id]", "/servicios"],
    palabras: ["cobrar", "consulta", "cargo", "caja", "precio", "vacuna", "medicamento", "procedimiento", "firmar", "cuenta", "sin precio", "ajustar", "quitar"],
    cuerpo: `Cuando firmas una consulta, lo que se cobra pasa solo a la **cuenta de la mascota en Caja**: recepción la cobra como cualquier otra cuenta (efectivo, tarjeta, link), con descuentos, cobro junto y factura de siempre.

## Antes de empezar: los precios

En [Servicios y precios](/servicios) hay cuatro servicios de Veterinaria (aparecen solos al prender el módulo): **Consulta general**, **Consulta de urgencia**, **Revisión o seguimiento** y **Aplicación de vacuna**. Entra a cada uno y captura su precio. Si falta alguno, la consulta te lo pide al firmar (ver abajo). Los procedimientos (sutura, curación…) los puedes dar de alta como servicios nuevos de categoría **Veterinaria**.

## Qué trae el cobro

En la consulta, antes de **Firmar**, está el recuadro **Cargos de esta consulta**:

- El **tipo de consulta** que elegiste (consulta general, urgencia o seguimiento) con su precio. Una consulta de cirugía no trae cargo base: agrega el procedimiento.
- Las **vacunas** que registraste ese día a la mascota en su carnet.
- Los **medicamentos** que surtiste con esa consulta (los controlados salen solos con su receta) y los que agregues del inventario. Se cobran al precio de venta del inventario, por la unidad que usas.
- Los **procedimientos** que agregues desde tu catálogo o escribiendo el concepto y el precio.
- Una **vacuna** no se agrega como «otro procedimiento»: se aplica con el botón **Aplicar vacuna** (producto y lote del inventario, fecha y médico), queda en el carnet de la mascota y entra al cobro sola. Si escribes el nombre de una vacuna como procedimiento, la pantalla te manda a **Aplicar vacuna**.

## Si falta un precio

Una consulta **no se firma con un cargo sin precio**. El cargo sale con el recuadro amarillo **Precio de esta consulta**:

- **Poner el precio** lo captura para esta consulta. Si eres admin o tienes **Precios y tarifas**, marca **Guardar como precio de catálogo** y las próximas consultas ya lo traen.
- **Sin cobro** (con su motivo: cortesía, seguimiento incluido…) deja el cargo fuera de Caja. Lo marca el médico veterinario, el admin o quien tenga **Quitar o ajustar cargos de la consulta**.

Abajo ves el **total**. Al firmar, la pantalla te lo repite.

## Quitar o ajustar

- **Quitar** un cargo pide un motivo; **Ajustar** cambia la cantidad o el precio (cero si es cortesía) y pide el motivo. Lo hace el médico veterinario, el admin o quien tenga el permiso **Quitar o ajustar cargos de la consulta**. Quien atiende puede quitar lo que él mismo agregó.
- Un cargo quitado se puede **Restaurar** antes de firmar.

## A qué cuenta va

- Si la mascota está **hospitalizada**, a la cuenta de su hospitalización.
- Si hay un **estimado aceptado** de esa consulta, a la cuenta del estimado, y lo que el estimado ya cubre (procedimientos y medicamentos cotizados) **no se cobra otra vez**: sale como «ya está en el estimado». Si quieres cobrarlo aparte, **Cobrar aparte**.
- Si el estimado se acepta **después** de firmar la consulta, entra a la misma cuenta que ya tiene los cargos de la consulta y lo que el estimado cubre se descuenta de ella (esos cargos quedan cancelados con el motivo «Cubierto por el estimado», y la consulta los muestra como cubiertos). Así no se cobra dos veces. Si la cuenta ya tenía cobros, queda saldo a favor y se devuelve en Caja con la devolución de siempre.
- Si la teleconsulta se pagó por adelantado, la consulta no se cobra de nuevo.
- En cualquier otro caso se abre una cuenta nueva.

## Después de firmar

La consulta firmada muestra **Cobro de esta consulta** con sus cargos y el enlace **Abrir la cuenta en Caja**. Si una consulta firmada antes de este cambio quedó con un cargo **Sin precio**, captúralo en Servicios y precios y aprieta **Pasar a Caja lo que falta**.

Si **anulas** la consulta y su cuenta todavía no tiene cobros, los cargos se cancelan solos; si ya hay cobros, se quedan y se devuelve en Caja con la devolución de siempre.`,
  },
  {
    slug: "estudios-archivos-y-linea-de-tiempo",
    titulo: "Cómo capturar estudios, subir archivos y ver la línea de tiempo",
    resumen: "Resultados de laboratorio a mano, fotos y PDF privados, y todo el historial de la mascota en orden.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/expediente/[perroId]"],
    palabras: ["laboratorio", "estudio", "resultado", "biometría", "radiografía", "archivo", "adjunto", "foto", "PDF", "línea de tiempo", "historial", "quién abrió"],
    cuerpo: `Todo lo clínico de una mascota está en su expediente: [Expediente clínico](/veterinaria/expediente), la mascota y su **línea de tiempo**.

## La línea de tiempo

Junta, del más nuevo al más viejo: consultas, vacunas, desparasitaciones, hospitalizaciones, certificados, estudios, archivos y pesos. Toca una consulta, un archivo o una hospitalización para abrirlos.

## Capturar un resultado de laboratorio

1. **Capturar un resultado de laboratorio** (en el expediente o dentro de una consulta).
2. Escribe el estudio, la fecha y el laboratorio.
3. Agrega cada **parámetro** con su valor, unidad y rango (por ejemplo «37 - 55»). Si el valor y el rango son números, el sistema marca solo si está **alto** o **bajo**.
4. **Guardar resultado**.

## Subir un archivo

**Adjuntar una foto o PDF**: elige el archivo (hasta 15 MB) y, si quieres, escribe qué es. Se guarda en un lugar privado: solo lo abre quien atiende consultas, con un enlace que dura un par de minutos.

Un resultado o un archivo **no se borra**: se **anula** con su motivo y queda en el historial.

## Quién lo abrió

Cada vez que alguien abre un expediente, una consulta o un archivo queda anotado. El admin ve la lista al final del expediente: **Quién abrió este expediente**.

> Para ver el expediente necesitas ser médico veterinario, admin o tener **Atender consultas**.`,
  },
  {
    slug: "estimados-veterinarios",
    titulo: "Cómo hacer un estimado y que el dueño lo acepte",
    resumen: "Servicios, procedimientos e insumos con mínimo y máximo; el dueño acepta por una liga o en el mostrador y pasa a la cuenta.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/estimados", "/veterinaria/estimados/nuevo", "/veterinaria/estimados/[id]"],
    palabras: ["estimado", "presupuesto", "cotización", "cirugía", "costo", "aceptar", "firma", "mínimo", "máximo", "versión"],
    cuerpo: `Un estimado es lo que calculas que costará una consulta o una cirugía. Cada línea lleva un **precio mínimo** (lo seguro) y un **máximo**. Los estimados están en [Estimados](/veterinaria/estimados).

## Hacerlo

1. En el expediente de la mascota (o dentro de una consulta) aprieta **Nuevo estimado**.
2. Ponle un título y elige si es de **consulta** o de **cirugía**.
3. Agrega líneas con **+ Servicio**, **+ Procedimiento** o **+ Insumo**. Un insumo lo puedes elegir del inventario y trae su precio de venta; también puedes escribirlo.
4. **Guardar borrador**.

## Mandarlo

**Enviar el estimado** genera una liga para el dueño. La liga queda a la vista junto con el mensaje para WhatsApp (cópialos o ábrelos con **Abrir WhatsApp con el mensaje**). La liga no se puede volver a ver desde otra pantalla ni en otro navegador: si se pierde, **Generar una liga nueva** (la anterior deja de servir).

Al enviarlo, el contenido **queda congelado**. Si hay que cambiar algo, **Hacer una versión nueva**: reemplaza a la anterior y su liga deja de servir.

## Que lo acepte

- **Por la liga**: el dueño lo revisa, escribe su nombre, firma con el dedo y **Aceptar el estimado**. También puede decir que no.
- **En el mostrador**: **Registrar aceptación en mostrador** con el nombre de quien acepta (la firma en pantalla es opcional).

Al aceptarse, el **mínimo de cada línea pasa a la cuenta de la mascota** y se cobra en Caja, sola o junto con otras cuentas; si la mascota está hospitalizada, va a la cuenta de su hospitalización. Lo demás se agrega como cargo cuando ocurre, sin pasar del máximo. Un insumo en el estimado **no descuenta el inventario**: eso pasa cuando se usa.

Un estimado aceptado no se cambia; si hay algo más que cobrar, haz otro. Los enviados que el dueño no contesta en tres días salen en **Necesita atención**.

> Hace falta ser médico veterinario, admin o tener **Crear estimados**.`,
  },
  {
    slug: "veterinaria-ajustes-consulta-y-portal",
    titulo: "Cómo cambiar las plantillas de consulta, la duración de las citas y lo que ve el dueño",
    resumen: "Textos con que arranca cada tipo de consulta, minutos de cada tipo de cita y si el dueño ve el resumen de sus consultas en el portal.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/ajustes"],
    palabras: ["plantilla", "consulta", "duración", "cita", "portal", "dueño", "expediente", "ajustes"],
    cuerpo: `Todo esto está en [Ajustes de Veterinaria](/veterinaria/ajustes) y es de admin o de quien tenga **Configuración del negocio**.

## Dictado y teleconsulta

- **Dictado por voz → Conservar el audio**: apagado por omisión (el audio se borra al transcribirse). Si lo prendes, queda 30 días ligado a la consulta. Ver [Cómo dictar una consulta](/ayuda/dictar-la-consulta).
- **Teleconsulta → Cobro anticipado y precio**: si lo prendes, la sala solo abre cuando la teleconsulta está pagada. Ver [Cómo agendar y atender una teleconsulta](/ayuda/agendar-y-atender-una-teleconsulta).

## Portal del dueño

**Mostrar las consultas en el portal**: viene prendido; lo puedes apagar. Con él prendido, el dueño ve en su portal, por cada consulta **firmada**, un resumen: la fecha, el **motivo**, el **diagnóstico** y las **indicaciones** (plan y tratamiento). Nunca ve las notas internas, el examen, los signos vitales, el nombre del médico ni los datos de la firma, ni las consultas anuladas o en borrador.

## Tipos de cita y duración

En **Tipos de cita y su duración** cambia el nombre y los minutos de consulta, vacuna, cirugía, seguimiento y urgencia, o deja de ofrecer alguno. La agenda usa esos minutos para que un médico no tenga dos citas encimadas.

## Plantillas de consulta

En **Plantillas de consulta** abre un tipo y reescribe los textos con que arranca la consulta (anamnesis, examen físico, hallazgos, plan y tratamiento). **Guardar plantilla** crea una versión nueva: las consultas que ya se abrieron conservan la suya.`,
  },
];
