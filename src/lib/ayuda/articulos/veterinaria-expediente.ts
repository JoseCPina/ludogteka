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

> Una consulta firmada sin diagnóstico definitivo aún se puede completar con una adenda. Lo que lleva más de un día en borrador sale en **Necesita atención**.`,
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

**Enviar el estimado** genera una liga para el dueño. La liga se muestra **una sola vez**: cópiala o ábrela con **Abrir WhatsApp con el mensaje**. Si se pierde, **Generar una liga nueva** (la anterior deja de servir).

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
    resumen: "Textos con que arranca cada tipo de consulta, minutos de cada tipo de cita y si el dueño ve sus consultas en el portal.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/ajustes"],
    palabras: ["plantilla", "consulta", "duración", "cita", "portal", "dueño", "expediente", "ajustes"],
    cuerpo: `Todo esto está en [Ajustes de Veterinaria](/veterinaria/ajustes) y es de admin o de quien tenga **Configuración del negocio**.

## Portal del dueño

**Mostrar las consultas en el portal**: apagado por omisión. Si lo prendes, el dueño ve en su portal, por cada consulta **firmada**, la fecha, el médico, el **diagnóstico definitivo** y el **plan**. Nunca ve las notas internas, el tratamiento ni los datos de la firma, ni las consultas anuladas o en borrador.

## Tipos de cita y duración

En **Tipos de cita y su duración** cambia el nombre y los minutos de consulta, vacuna, cirugía, seguimiento y urgencia, o deja de ofrecer alguno. La agenda usa esos minutos para que un médico no tenga dos citas encimadas.

## Plantillas de consulta

En **Plantillas de consulta** abre un tipo y reescribe los textos con que arranca la consulta (anamnesis, examen físico, hallazgos, plan y tratamiento). **Guardar plantilla** crea una versión nueva: las consultas que ya se abrieron conservan la suya.`,
  },
];
