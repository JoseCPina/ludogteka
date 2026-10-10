import type { Articulo } from "../tipos";

/**
 * Veterinaria, Fase 0: ficha clínica de la mascota, inventario clínico con
 * lotes, médicos veterinarios y datos del establecimiento. Cada botón y cada
 * ruta que se nombra aquí existe tal cual en la app: si cambia la pantalla,
 * cambia su artículo en el mismo cambio.
 */
export const ARTICULOS_VETERINARIA: Articulo[] = [
  {
    slug: "veterinaria-que-incluye",
    titulo: "Qué incluye el módulo Veterinaria y cómo prenderlo",
    resumen: "Ficha clínica, inventario con lotes y caducidades, médicos y permisos del establecimiento.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria"],
    palabras: ["veterinaria", "clínica", "veterinario", "consultorio", "gatos", "módulo"],
    cuerpo: `Veterinaria es un módulo aparte, como Hotel y guardería o Estética. Viene **apagado**: lo prendes cuando lo vayas a usar y, si lo apagas, no se borra nada.

## Qué trae hoy

- **Ficha clínica** de la mascota: especie, esterilización, peso, alergias, microchip, folio de registro y notas clínicas.
- **Inventario clínico** con lotes y caducidades, y la clasificación de cada producto.
- **Médicos veterinarios** con su cédula, su CPA del SITPV y sus folios.
- **Establecimiento y permisos**: tu aviso de funcionamiento, tu MVRA y tus permisos con su vencimiento.
- **Carnet** de vacunas y desparasitaciones (con QR verificable y recordatorios), **certificados de salud**, **hospitalización** con hoja de medicación y **consentimientos informados**.
- **Consultas y recetas**: vienen en las siguientes fases.

## Cómo prenderlo

1. Entra a [Módulos y plan](/admin/modulos) (el admin, o recepción con el permiso **Administrar módulos**).
2. En **Veterinaria** aprieta **Prender**. Necesita **Inventario** prendido.

Al prenderlo aparece **Veterinaria** en el menú. Al apagarlo desaparece del menú, del tablero y de los permisos, pero lo capturado se queda y regresa cuando lo vuelves a prender.

> Si hoy solo usas Hotel, guardería o Estética, nada cambia: no te pedimos ningún dato clínico.`,
  },
  {
    slug: "ficha-clinica-de-la-mascota",
    titulo: "Cómo llenar la ficha clínica de una mascota",
    resumen: "Especie, microchip, folio de registro y notas clínicas, junto al peso y las alergias de siempre.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: [],
    palabras: ["microchip", "RUAC", "especie", "gato", "esterilizado", "peso", "alergias", "notas clínicas", "folio de registro"],
    cuerpo: `La ficha clínica va en el expediente de la mascota, en la sección **Ficha clínica**.

1. Abre la mascota desde [Clientes](/clientes).
2. En **Ficha clínica** elige la **especie**: perro, gato u otro (si es otro, escribe cuál).
3. Escribe el **microchip** (de 9 a 20 letras o números; el estándar tiene 15 dígitos) y el **folio de registro** (por ejemplo, el RUAC). Un microchip no se puede repetir en otra mascota.
4. Anota las **notas clínicas** y marca si está esterilizada.
5. Aprieta **Guardar ficha clínica**.

El **peso** y las **alergias** se registran en sus secciones de siempre; la ficha los resume y te lleva a ellas. El peso queda con su historial por fecha.

## Quién puede editarla

El admin, y recepción con el permiso **Editar ficha clínica** (se da en [Permisos](/admin/permisos)). Los demás la ven sin poder cambiarla.

## Para tu cliente

En el alta por link, si tienes Veterinaria prendida, el dueño puede decir la especie, si está esterilizada y su microchip; es opcional. En su portal ve la especie, el microchip y el folio de su mascota. Las notas clínicas son tuyas y no las ve.

## Si algo no sale

- «Ese microchip ya está registrado en otra mascota»: revisa que no esté capturado en otro perro o gato.
- «…la edita un admin o quien tenga el permiso»: pídele a un admin el permiso **Editar ficha clínica**.`,
  },
  {
    slug: "inventario-clinico-con-lotes",
    titulo: "Cómo manejar el inventario clínico con lotes y caducidades",
    resumen: "Da de alta productos clínicos, registra cada lote y sigue su caducidad y su saldo.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/inventario"],
    palabras: ["lote", "caducidad", "caduca", "medicamento", "SENASICA", "grupo", "antimicrobiano", "receta", "merma", "surtir", "principio activo", "controlado"],
    cuerpo: `Un producto clínico es un producto de tu inventario que se maneja **por lotes**: cada caja que llega tiene su código y su fecha de caducidad, y el sistema sabe cuánto queda de cada una.

## Dar de alta un producto

1. Entra a [Inventario clínico](/veterinaria/inventario) y aprieta **Nuevo producto clínico**.
2. Escribe el nombre, el área, la unidad de compra y la de consumo, el stock mínimo y con cuántos días de anticipación quieres el aviso de caducidad.
3. Si eliges un **principio activo**, se llenan solas las dos clasificaciones; puedes cambiarlas.
4. Aprieta **Guardar producto**.

Si ya tienes el producto en [Inventario](/inventario), usa **Pasar a lotes**: lo que hay hoy queda en un lote «INICIAL».

## Las dos clasificaciones

Cada producto tiene dos, independientes entre sí y editables:

- **Grupo SENASICA**: I, II, III o ninguno.
- **Ley General de Salud**: estupefaciente (art. 234), psicotrópico fracción II, III o IV (art. 245), o ninguna.

Además puedes marcarlo como **Antimicrobiano**. Los principios activos precargados vienen de la lista de PeluDesk; los que dicen **por confirmar** son los que el Acuerdo no lista o se dejaron por analogía: confírmalos con tu médico responsable.

## Registrar un lote, un surtido o una baja

1. Abre el producto desde la lista.
2. **Registrar entrada**: código de lote, caducidad y cantidad.
3. En cada lote: **Surtir** (sale para un paciente), **Merma** (se rompió, se perdió; pide motivo), **Caducado** (se da de baja con motivo) o **Ajuste** (conteo físico; pide motivo).

Los movimientos no se editan ni se borran: un error se corrige con un ajuste. Cuando sacas producto sin escoger lote (por ejemplo, el consumo de una receta), sale primero del lote que caduca antes.

## Avisos

Los lotes caducados o por caducar y los productos bajo su mínimo salen en **Necesita atención** del [tablero](/recepcion), con cuánto llevan así.

> Si el producto es del Grupo I o está en la Ley General de Salud, más adelante el sistema pedirá el **folio de receta** al surtirlo. Por ahora puedes escribirlo en **Surtir** y, si lo dejas vacío, solo te avisa.

## Quién puede

El admin, y recepción con el permiso **Administrar lotes e inventario clínico**. No ven costos: eso sigue siendo de **Costos y compras de inventario**.`,
  },
  {
    slug: "medicos-veterinarios-y-folios",
    titulo: "Cómo designar a un médico veterinario y asignarle folios",
    resumen: "Registra la cédula y el CPA del SITPV de tu médico y los folios que tiene asignados.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin"],
    rutas: ["/veterinaria/medicos"],
    palabras: ["médico", "cédula", "CPA", "SITPV", "folios", "receta", "firma", "MVRA"],
    cuerpo: `El médico veterinario es la persona de tu equipo que firmará expediente y recetas en las siguientes fases. Hoy dejas lista su identidad y sus folios.

1. Invita antes a la persona en [Administración](/admin), si todavía no está en tu equipo.
2. Entra a [Médicos](/veterinaria/medicos), elige a la persona, escribe su **cédula profesional** y su **CPA del SITPV** y aprieta **Designar médico**.
3. Para sus folios, aprieta **Asignar bloque** y escribe el primer y el último folio (y el prefijo, si lo tiene). Si ya llevaba folios usados, anota cuántos.

Cada bloque muestra cuántos folios están **asignados**, **usados** y **disponibles**. El contador de usados lo lleva el sistema: cada vez que el médico use un folio se suma y no se puede deshacer ni repetir.

Para quitar la designación, aprieta **Quitar designación**: sus folios y los ya usados se conservan.

> Esta pantalla es solo del admin.`,
  },
  {
    slug: "establecimiento-y-permisos-veterinarios",
    titulo: "Cómo capturar los datos del establecimiento y sus permisos",
    resumen: "Aviso de funcionamiento, MVRA y tus permisos con su fecha de vencimiento y recordatorio.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin"],
    rutas: [],
    palabras: ["SENASICA", "aviso de inicio de funcionamiento", "MVRA", "licencia", "permiso", "vencimiento", "COFEPRIS"],
    cuerpo: `Con Veterinaria prendida, [Perfil y página web](/admin/perfil) trae al final la sección **Establecimiento veterinario**.

1. Escribe el número de tu **Aviso de Inicio de Funcionamiento ante SENASICA**.
2. Escoge a tu **MVRA** (médico veterinario responsable autorizado) entre tus médicos designados, o escribe su nombre y cédula.
3. Aprieta **Guardar establecimiento**.

## Tus permisos

Agrega cada permiso con su tipo, número, autoridad, nivel (federal, estatal o municipal), fecha de emisión y de vencimiento, y con cuántos días de anticipación quieres el recordatorio. Aprieta **Guardar permiso**.

Cada permiso dice si está vigente, por vencer o vencido. Los vencidos y los que están por vencer salen en **Necesita atención** del tablero, con cuánto llevan vencidos.

> Lo edita el admin o quien tenga **Configuración del negocio**.`,
  },

  {
    slug: "carnet-de-la-mascota",
    titulo: "Cómo usar el carnet de vacunas y desparasitaciones",
    resumen: "Registrar vacunas y desparasitaciones con su lote y su médico, anularlas con motivo e imprimir el carnet.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/carnet", "/veterinaria/carnet/[perroId]", "/veterinaria/carnet/[perroId]/imprimir"],
    palabras: ["carnet", "vacuna", "vacunas", "desparasitación", "desparasitar", "antirrábica", "lote", "próxima dosis", "cartilla"],
    cuerpo: `Cada mascota tiene un carnet con sus **vacunas** y **desparasitaciones**. Se abre desde [Carnets](/veterinaria/carnet): busca por el nombre de la mascota, del dueño o su teléfono.

## Registrar una vacuna

1. En el carnet, aprieta **Registrar vacuna**.
2. Elige la vacuna del inventario clínico y su **lote** (se descuenta una dosis del lote), o escríbela si no está en el inventario.
3. Pon la **fecha de aplicación**, la **próxima dosis** (con ella se programan los recordatorios) y el **médico veterinario que aplica**.
4. Aprieta **Registrar vacuna**.

Una vacuna cuenta como **vigente** hasta su próxima dosis; si no la pones, 12 meses (o lo que dure su requisito sanitario). Pasados los 30 días antes de vencer sale **Por vencer**.

Las **desparasitaciones** se registran igual con **Registrar desparasitación** (interna, externa o las dos).

## Si te equivocaste

Un registro **no se edita ni se borra**: aprieta **Anular**, escribe el motivo y captúralo de nuevo. El anulado queda en «Registros anulados» con tu nombre y el motivo. Lo que se descontó del lote no regresa solo: se corrige en el [inventario clínico](/veterinaria/inventario).

## Imprimir el carnet

**Ver e imprimir carnet** muestra una hoja con lo vigente (sin lo anulado) lista para **Imprimir o guardar PDF**.

## Quién puede

Un médico veterinario designado, el admin o quien tenga **Registrar vacunas y desparasitaciones** (se da en [Permisos](/admin/permisos); viene apagado). El dueño ve el carnet en su portal, solo lectura y sin notas del personal.

## Que cuente como comprobante en el check-in

En [Ajustes de Veterinaria](/veterinaria/ajustes) puedes prender **El carnet cuenta como comprobante de vacunas**. Entonces, al registrar una vacuna eliges a qué requisito cubre (por ejemplo, antirrábica) y el check-in de Hotel y Guardería ya no pide el documento. Solo cuenta lo que se registre a partir de ese momento.`,
  },
  {
    slug: "carnet-verificable-y-recordatorios",
    titulo: "Carnet verificable con QR y recordatorios de próxima dosis",
    resumen: "El enlace público del carnet y cómo recordar a los dueños la próxima vacuna o desparasitación.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/recordatorios", "/veterinaria/ajustes"],
    palabras: ["qr", "enlace", "verificable", "recordatorio", "recordatorios", "whatsapp", "próxima dosis", "avisar al dueño"],
    cuerpo: `## Carnet verificable

En el carnet de la mascota, **Generar enlace verificable** crea un enlace público y su **código QR**. Quien lo abre ve solo el nombre de la mascota, el de su dueño, las **vacunas vigentes** y el negocio que lo emite: nada de dinero ni datos clínicos. El enlace completo se muestra una sola vez; si lo pierdes, **Generar un enlace nuevo** (el anterior deja de funcionar). **Desactivar el enlace** lo apaga.

## Recordatorios de próxima dosis

Las vacunas y desparasitaciones con **próxima dosis** entran a [Recordatorios de dosis](/veterinaria/recordatorios) cuando faltan los días de anticipación que hayas puesto (7 por omisión) y hasta 30 días después de vencer. Una dosis que ya se renovó no se recuerda.

Cada recordatorio tiene tres botones:

- **Abrir en WhatsApp**: abre el chat del dueño con el mensaje ya escrito.
- **Ya lo mandé**: lo anota como enviado.
- **Omitir**: lo descarta.

### Envío automático

En [Ajustes de Veterinaria](/veterinaria/ajustes), **Envío automático por WhatsApp** → **Prendido**: los recordatorios salen solos, una vez por dosis, de 9:00 a 20:00, con una plantilla aprobada de WhatsApp. El mensaje sale del número de PeluDesk y dice que ese número no recibe respuestas y a qué teléfono del negocio llamar para agendar; por eso el negocio necesita tener un teléfono público. Si algo falla, el recordatorio queda en **Por mandar** para que lo mandes tú.

Para que una mascota no reciba recordatorios, en su carnet aprieta **Apagar recordatorios de esta mascota**.

Lo que está por mandar también sale en **Necesita atención** del tablero.`,
  },
  {
    slug: "certificado-de-salud",
    titulo: "Cómo emitir un certificado de salud",
    resumen: "Emitir, imprimir y anular un certificado de salud a nombre de un médico veterinario.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/certificados", "/veterinaria/certificados/nuevo", "/veterinaria/certificados/[id]"],
    palabras: ["certificado", "certificado de salud", "viaje", "cédula", "firma", "constancia"],
    cuerpo: `Un certificado de salud lleva el nombre y la cédula del médico veterinario que firma, los datos del establecimiento (aviso de funcionamiento y MVRA), los de la mascota y su dueño, la exploración y las vacunas y desparasitaciones **vigentes** al emitirlo.

## Emitirlo

1. Abre el carnet de la mascota y aprieta **Emitir certificado de salud**.
2. Elige el **médico veterinario que firma**, **para qué es** (viaje, hospedaje…) y el destino si lo hay.
3. Escribe la **exploración física** y, si quieres, observaciones y la **vigencia en días** (por omisión la de [Ajustes de Veterinaria](/veterinaria/ajustes), 30).
4. Aprieta **Emitir certificado**. Se abre el certificado: **Imprimir o guardar PDF** y que el médico lo firme.

Si quien lo emite es el propio médico y tiene folios disponibles, el certificado usa uno de los suyos.

## Qué pasa después

El certificado **no se edita**: lo que dice es una foto de ese día, aunque el carnet cambie. Si hubo un error, **Anular este certificado** con su motivo y emite otro. Los emitidos están en [Certificados de salud](/veterinaria/certificados), marcados como vigentes, vencidos o anulados.

Es de un médico veterinario, del admin o de quien tenga **Emitir certificados**.`,
  },
  {
    slug: "hospitalizar-una-mascota",
    titulo: "Cómo hospitalizar a una mascota",
    resumen: "Ingreso, hoja de medicación, monitoreo, cargos a la cuenta y alta.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/hospitalizacion", "/veterinaria/hospitalizacion/[id]"],
    palabras: ["hospitalización", "hospitalizar", "internar", "internado", "medicación", "dosis", "monitoreo", "alta", "depósito", "jaula"],
    cuerpo: `La hospitalización es del módulo Veterinaria: funciona aunque Hotel esté apagado. Los internados están en [Hospitalización](/veterinaria/hospitalizacion).

## Ingresar

1. En **Ingresar una mascota** busca a la mascota y elígela.
2. Escribe el **motivo**, el **médico responsable** y la ubicación (por ejemplo, jaula 3).
3. Si quieres, un **depósito inicial** y el **precio del día**.
4. Aprieta **Ingresar a hospitalización**.

Se abre una **cuenta** de su dueño. Todo lo que se cobra cuelga de ella y se paga en Caja, sola o junto con otras cuentas.

## Hoja de medicación

En la hospitalización, **Indicar medicación**: medicamento, dosis, vía, primera dosis, cada cuántas horas y cuántas dosis. Quedan programadas por horario. Cuando se aplica una, aprieta **Aplicar**, elige el lote (se descuenta del inventario clínico) y **Confirmar: ya se aplicó**: queda quién la aplicó y cuándo. Si no se aplicó, **No se aplicó** con el motivo. Las dosis que pasan de su hora salen **atrasadas** y en **Necesita atención**.

Si pones un precio por dosis, cada dosis aplicada se cobra en la cuenta.

## Monitoreo

**Registrar monitoreo**: temperatura, peso, frecuencias y notas; el turno (matutino, vespertino o nocturno) se pone solo. Un registro no se edita: agrega otro.

## Cargos y alta

**Agregar un procedimiento o cargo** suma lo que no es medicamento. Un día de hospitalización se cobra por cada fecha desde el ingreso. **Ver cuenta / cobrar** te lleva a Caja.

**Dar de alta** pide el resumen del alta, cierra las dosis pendientes, completa los días y aplica el depósito a la cuenta: si el depósito fue mayor a lo que se debe, queda un saldo a favor que se devuelve como cualquier devolución.

Hace falta ser médico veterinario, admin o tener **Hospitalizar y medicar**.`,
  },
  {
    slug: "consentimientos-informados",
    titulo: "Consentimientos informados: crear, firmar y editar los textos",
    resumen: "Hospitalización, cirugía, anestesia y eutanasia, con firma en pantalla y PDF sellado.",
    grupo: "veterinaria",
    modulo: "veterinaria",
    roles: ["admin", "recepcion"],
    rutas: ["/veterinaria/consentimientos", "/veterinaria/consentimientos/[id]"],
    palabras: ["consentimiento", "consentimiento informado", "firma", "cirugía", "anestesia", "eutanasia", "autorización"],
    cuerpo: `Hay cuatro consentimientos: **hospitalización, cirugía, anestesia y eutanasia**. Se ven y se editan en [Consentimientos](/veterinaria/consentimientos).

## Crear y firmar

1. En una hospitalización, aprieta **Crear un consentimiento**.
2. Elige el tipo, el procedimiento (en cirugía y anestesia) y el médico responsable, y aprieta **Crear y firmar**.
3. Lee el texto con el propietario y aprieta **Firmar en pantalla**: el propietario dibuja su firma y tú confirmas con **Confirmar firma**.

La firma genera un PDF sellado con la hora, la IP y un hash, igual que un contrato. Un consentimiento firmado ya no se modifica; uno pendiente se puede cancelar con su motivo.

## Editar los textos

Cada negocio tiene sus propias plantillas. **Editar el texto** → **Guardar como versión nueva**. Usa los campos entre dobles llaves (nombre del propietario, de la mascota, motivo, procedimiento, médico y su cédula, establecimiento, fecha). Los consentimientos ya creados conservan el texto con el que se crearon. Editar las plantillas es de admin o de quien tenga **Plantillas de contrato**.

> Los textos que vienen son una base: revísalos con tu asesor legal.

Lo que está esperando firma sale en **Necesita atención**.`,
  },
];
