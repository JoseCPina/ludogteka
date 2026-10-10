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
- **Pacientes y consultas**: viene en las siguientes fases.

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
];
