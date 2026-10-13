import type { Articulo } from "../tipos";

/**
 * Veterinaria, Fase 4: recetas simples, espejo del SITPV (Grupo I), recetario especial, candado de
 * salida de productos controlados, libro de control y reporte mensual. Cada botón y cada ruta que se
 * nombra aquí existe tal cual en la app: si cambia la pantalla, cambia su artículo en el mismo cambio.
 * Los plazos, el número de copias y qué documento pide cada clasificación los fija la plataforma
 * (no el negocio): aquí se describen sin números fijos salvo los que dicen las reglas sembradas.
 */
export const ARTICULOS_VETERINARIA_RECETAS: Articulo[] = [
  {
    slug: "emitir-receta-veterinaria",
    titulo: "Cómo emitir una receta",
    resumen: "Receta simple a nombre del médico, con original y copias, para mandar al dueño; no se edita, se anula con motivo.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/recetas", "/veterinaria/recetas/nueva", "/veterinaria/recetas/[id]"],
    palabras: ["receta", "recetar", "medicamento", "dosis", "copias", "original", "cédula", "anular", "archivar", "WhatsApp", "NOM-064", "fracción", "diazepam", "tramadol", "fenobarbital"],
    cuerpo: `Las recetas están en [Recetas](/veterinaria/recetas). **Solo un médico veterinario designado puede emitirlas**, con su cédula: un admin que no es médico no puede, aunque tenga el permiso **Emitir recetas**. Si falta la designación, un admin la hace en Veterinaria → Médicos.

## Emitir una receta

1. Aprieta **Nueva receta** y elige a la mascota.
2. Si ya firmaste una consulta de esa mascota, puedes recetar **desde esa consulta**; si no, desde la ficha.
3. Agrega cada medicamento: del inventario clínico o escrito a mano. Cada uno pide **dosis, vía, frecuencia y duración en días**. El tiempo de retiro es opcional.
4. La **cantidad a surtir** se calcula sola con la dosis por toma, cada cuántas horas y los días; puedes escribir otra.
5. Aprieta **Emitir receta**.

La receta lleva tu nombre y cédula, los datos del establecimiento, del dueño y de la mascota, la leyenda de uso veterinario y tu firma.

## Qué se receta aquí y qué no

- **Grupos II y III** y los antimicrobianos: receta simple.
- **Fracciones III y IV** de la Ley General de Salud (por ejemplo diazepam, tramadol, fenobarbital): también receta simple pero **con cédula**, y se surten con límite: la fracción III una sola vez y la IV hasta tres veces en seis meses. Esos límites los fija la plataforma.
- **Grupo I**: no se receta aquí. Su receta cuantificada se emite en el SITPV y se registra en [Registro SITPV](/veterinaria/recetas/sitpv).
- **Estupefacientes y psicotrópicos de la fracción II**: van en el [Recetario especial](/veterinaria/recetas/especial).

## Imprimir, mandar y anular

- **Imprimir original y copias (o guardar PDF)** saca el original y las copias que marcan las reglas (hoy, 2).
- **Mandar al dueño por WhatsApp** genera una liga y abre WhatsApp con el mensaje listo. Solo se guarda una huella de la liga; si la generas otra vez, la anterior deja de servir. El dueño también la ve en su portal.
- **Anular esta receta** pide el motivo. No se borra ni se edita: queda anulada con tu nombre. Una receta que ya se surtió no se puede anular.
- **Archivar** esconde la receta de la lista cuando ya pasó su plazo de conservación (hoy 6 meses; 12 para las de cédula). Antes no deja.

> Toda lectura de una receta queda anotada. Si algo está mal, no la corrijas: anúlala y emite otra.`,
  },
  {
    slug: "registrar-receta-sitpv",
    titulo: "Cómo registrar una receta cuantificada del SITPV (Grupo I)",
    resumen: "PeluDesk no emite la receta del Grupo I: guarda su espejo con el mismo folio, para surtir, reportar y llevar el libro.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/recetas/sitpv", "/veterinaria/recetas/sitpv/nuevo", "/veterinaria/recetas/sitpv/[id]"],
    palabras: ["SITPV", "Grupo I", "cuantificada", "folio", "CPA", "espejo", "uso hospitalario", "parcialidades", "cancelar folio", "en ceros", "registro SENASICA", "SENASICA", "xilazina", "ketamina"],
    cuerpo: `La receta **cuantificada** de los productos del Grupo I se emite en el **SITPV de SENASICA**, con tu CPA, y trae un folio de tu bloque. PeluDesk **no la emite**: guarda su **registro espejo** para surtir contra él, reportarlo cada mes y llevar el libro de control. Ese registro no es la receta ni vale para surtir; el PDF de referencia lo dice.

Esto lo hace **solo un médico veterinario designado con su CPA** capturado en Veterinaria → Médicos (con el permiso **Registrar recetas SITPV**, que el médico ya tiene).

## Registrar una receta

1. Emítela en el SITPV.
2. En [Registro SITPV](/veterinaria/recetas/sitpv) aprieta **Registrar una receta del SITPV**.
3. Elige a la mascota, o **Es de uso hospitalario (sin paciente)** si el producto se ocupa en la clínica en varias aplicaciones.
4. Elige el producto (solo salen los de Grupo I), su número de registro SENASICA, el lote, la dosis, el intervalo, la duración, la **cantidad total que ampara** y el comprobante de compra.
5. Aprieta **Registrar**. El folio sale del siguiente de tu bloque y baja tu contador de folios.

En el uso hospitalario las observaciones llevan solas «USO HOSPITALARIO» con el nombre de la clínica y «se ocupará en parcialidades».

## En el registro

- **Abrir el SITPV en otra pestaña** y **Datos para copiar al SITPV**: cada dato con su botón para copiarlo.
- **Registrar una aplicación (parcialidad)**: saca del lote, ligado al folio, con paciente y fecha. No pasa de lo que ampara el folio.
- **Cancelar este folio (va en ceros)** pide el motivo; el folio no se borra ni se reutiliza y sale en ceros en el reporte del mes. Un folio con aplicaciones ya no se cancela.
- **Archivar** cuando pasa su plazo de conservación.

## Avisos

En la parte de arriba ves, por médico, los **folios que le quedan** (con menos de 10 sale el aviso; pide otro bloque en el SITPV y que un admin lo capture) y los **meses sin marcar como reportados**.

> Los antimicrobianos piden receta simple. Si el negocio prefiere llevarles espejo cuantificado, lo activa en [Ajustes de Veterinaria](/veterinaria/ajustes).`,
  },
  {
    slug: "surtir-producto-controlado",
    titulo: "Cómo sacar del inventario un producto controlado",
    resumen: "Un producto de Grupo I, estupefaciente o psicotrópico solo sale ligado a su receta; si no, la base lo rechaza.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/inventario/[id]"],
    palabras: ["controlado", "candado", "surtir", "salida", "venta de mostrador", "hospitalización", "folio", "lote", "libro de control", "no me deja", "rechaza", "receta"],
    cuerpo: `Los productos controlados tienen un **candado de salida**: no pueden salir de un lote si la salida no viene ligada a su receta. Ninguna pantalla lo salta: ni la venta de mostrador, ni el consumo de un servicio, ni Inventario clínico, ni la hospitalización.

Qué documento pide cada producto sale de sus clasificaciones y de las reglas de la plataforma (en la ficha del producto, arriba, dice «Pide: …»):

- **Grupo I** (y antimicrobianos si el negocio activó el espejo): el folio de su receta del SITPV.
- **Estupefacientes y psicotrópicos de la fracción II**: el folio del recetario especial.
- **Fracciones III y IV**: una receta con cédula, dentro de sus surtidos y su plazo.

## Cómo se surte

- **Receta con cédula**: en la receta, sección **Surtir del inventario**.
- **Grupo I**: en el registro del SITPV, **Registrar una aplicación (parcialidad)** o **Surtir**.
- **Recetario especial**: en el folio, **Surtir contra este folio**. La **Cantidad** (y la **Cantidad diaria** al registrar el folio) se escribe como número, con o sin unidad: `2` o `2 ml`.
- **Hospitalización**: al **Aplicar** la dosis de un producto de Grupo I, elige el **Folio del SITPV**; la aplicación queda como parcialidad con el paciente internado.

Cada salida baja el lote y entra al [Libro de control](/veterinaria/libro-control).

## Si no te deja

El mensaje dice qué falta: «es un producto controlado: solo sale del inventario con…». Registra primero la receta y surte desde ahí. En la venta de mostrador, un producto controlado no se puede vender sin ese documento.

Las **mermas, los caducados y los ajustes** no necesitan receta (no se surte a nadie) pero piden motivo y quedan en el libro.`,
  },
  {
    slug: "recetario-especial-veterinaria",
    titulo: "Cómo registrar un folio del recetario especial",
    resumen: "Estupefacientes y psicotrópicos de la fracción II: folio con código de barras, tratamiento de hasta 30 días y surtido contra el folio.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/recetas/especial"],
    palabras: ["recetario especial", "código de barras", "estupefaciente", "psicotrópico", "morfina", "fentanilo", "butorfanol", "30 días", "tratamiento", "folio"],
    cuerpo: `Los **estupefacientes** (artículo 234 de la Ley General de Salud) y los **psicotrópicos de la fracción II** (artículo 245) se recetan en el recetario especial, con **código de barras**. Lo registra **un médico veterinario designado** (con el permiso **Registrar recetas SITPV**).

## Registrar un folio

1. En [Recetario especial](/veterinaria/recetas/especial) aprieta **Registrar un folio** y elige a la mascota.
2. Elige el producto, escribe el **folio del recetario**, el **código de barras**, los **días de tratamiento** y la **cantidad diaria**.
3. Aprieta **Registrar**.

El tratamiento no puede pasar del tope de días que fija la plataforma (hoy, 30 días: artículos 240 y 241). La cantidad total es días por cantidad diaria.

## Surtir

En el folio, **Surtir contra este folio**: eliges el lote y la cantidad. No pasa de lo que ampara el folio y entra al [Libro de control](/veterinaria/libro-control).

Un folio sin usar se puede **cancelar** con motivo; uno ya surtido no. El mismo folio no se registra dos veces.`,
  },
  {
    slug: "libro-de-control-veterinaria",
    titulo: "Cómo consultar y exportar el libro de control",
    resumen: "Entradas, salidas y saldo de los productos controlados, con folio, lote, paciente y médico; en pantalla, PDF y Excel.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/libro-control"],
    palabras: ["libro de control", "libro", "controlados", "saldo", "exportar", "Excel", "PDF", "entradas", "salidas", "inspección", "auditoría"],
    cuerpo: `El [Libro de control](/veterinaria/libro-control) junta, por producto, cada movimiento de lote de los productos que las reglas de la plataforma marcan para llevar libro (hoy, el Grupo I y los estupefacientes y psicotrópicos de la fracción II): la fecha, el movimiento, el **folio de la receta**, el lote, la entrada, la salida, el **saldo que va quedando**, el paciente (o «USO HOSPITALARIO») y el médico.

Se arma solo de los movimientos de los lotes: **no se edita**. Si algo hay que corregir, se hace con un ajuste en el lote (con motivo) y aparece en el libro.

## Usarlo

1. Elige **Desde** y **Hasta**, y si quieres un solo producto.
2. Aprieta **Ver**.
3. **Imprimir o guardar PDF** o **Descargar Excel** para una revisión.

Cada vez que alguien abre el libro queda anotado quién y cuándo. Verlo es del médico veterinario designado, de admin o de quien tenga el permiso **Ver libro de control**.`,
  },
  {
    slug: "reporte-mensual-sitpv",
    titulo: "Cómo hacer el reporte mensual del SITPV",
    resumen: "Folios usados, cancelados en ceros, parcialidades y pacientes del mes, listos para capturar; se marca cuando ya se reportó.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/recetas/sitpv/reporte"],
    palabras: ["reporte mensual", "SITPV", "reportar", "reportado", "folios", "en ceros", "parcialidades", "pacientes", "recordatorio", "bloqueo"],
    cuerpo: `Cada mes hay que reportar en el SITPV los folios que usaste. Si pasan tres meses sin reporte, el SITPV deja de entregarte folios nuevos.

PeluDesk te lo recuerda en **Necesita atención** desde el primer día del mes y sube el tono unos días después (ambos días los fija la plataforma).

## Hacerlo

1. En [Registro SITPV](/veterinaria/recetas/sitpv) elige el mes pendiente de tu nombre.
2. Revisa el reporte: **folios usados**, **folios cancelados en ceros** (con su observación), **parcialidades** (con paciente o uso hospitalario y fecha) y **pacientes**.
3. Captúralo en el SITPV. Si quieres, **Imprimir o guardar PDF** para tenerlo a la mano.
4. Aprieta **Ya lo reporté en el SITPV**. Queda guardado quién lo marcó y cuándo.

Un mes se marca cuando ya terminó. Cada médico marca el suyo (un admin puede marcar el de cualquiera).`,
  },
];
