// Qué videos tutoriales explican cada artículo de ayuda: UN solo lugar.
// Lo usan el artículo (el video va arriba del texto, en la app y en peludesk.mx/ayuda), el bot de WhatsApp
// (ofrece el video junto con el artículo), la página de cada video («Si prefieres leerlo»), el catálogo de la
// serie (`scripts/tutoriales/catalogo.mjs` saca de aquí los artículos de cada video) y `cobertura.mjs`
// (falla si apunta a un artículo o a un video que no existe, o si un video queda sin artículo y sin motivo).
//
// El mapeo salió de lo que cada video ENSEÑA (su guion y las pantallas que recorre) contra lo que cada artículo
// EXPLICA, no de los títulos. Un artículo puede tener varios videos (el primero es el principal) y un video puede
// ir en varios artículos. Los videos se nombran por su número del catálogo ("04"). Archivo sin imports: lo leen
// el sitio y los scripts de Node.
//
// Un video nuevo se agrega aquí (o en VIDEOS_SIN_ARTICULO con su motivo). Un artículo sin video queda igual.
export const VIDEOS_DE_ARTICULO: Record<string, string[]> = {
  // ── El día a día y administración ──
  "leer-el-tablero-del-dia": ["04", "01"],
  "que-hacer-con-necesita-atencion": ["05"],
  "modulos-y-plan": ["06"],
  "horario-y-datos-del-negocio": ["07", "02"],
  "invitar-a-tu-equipo": ["08"],
  "permisos-extra-a-recepcion": ["09"],
  "conectar-mercado-pago-o-clip": ["50", "59"],
  "politicas-y-reglas": ["51"],
  "perfil-y-pagina-web": ["52", "02"],
  "pedir-ayuda": ["53", "01"],

  // ── Clientes y perros ──
  "capturar-cliente-en-mostrador": ["10"],
  "alta-de-cliente-con-link": ["11"],
  "vacunas-alertas-y-datos-del-perro": ["12"],
  "revisar-comprobante-sanitario": ["13"],
  "agregar-una-raza-que-no-aparece": ["14"],
  "portal-del-dueno": ["15", "18"],
  "restablecer-contrasena-de-cliente": ["03", "15"],

  // ── Contratos ──
  "mandar-a-firmar-un-contrato": ["17", "19", "16", "18"],

  // ── Estética ──
  "precios-de-estetica": ["20", "23"],
  "precio-de-estetica-mestizo": ["58"],
  "que-hacer-sin-precio-estetica": ["58", "23"],
  "agendar-cita-estetica": ["21", "23"],
  "atender-cita-estetica": ["22"],
  "corregir-servicio-de-una-cita": ["55"],
  "reprogramar-o-cancelar-cita-de-estetica": ["63"],
  "agregar-otro-perrito-en-estetica": ["63"],
  "tarifa-cliente-de-guarderia": ["64"],

  // ── Guardería y hotel ──
  "reservar-guarderia": ["25", "27", "28", "95"],
  "reservar-hotel": ["26", "28", "95"],
  "calendario-de-reservas": ["94"],
  "registrar-check-in": ["29", "28"],
  "registrar-check-out-y-cobrar": ["30"],
  "vender-day-pass-o-mensualidad": ["39"],
  "ajustar-dias-usados-de-un-pase": ["60"],
  "llenar-el-reporte-de-comportamiento": ["31"],
  "enviar-fotos-y-videos": ["31"],
  "cotizar-y-cobrar-recoleccion": ["54"],
  "agregar-servicios-extra": ["89"],
  "servicios-extra-del-dia-y-traslados": ["89"],
  "catalogo-de-servicios-extra": ["89"],
  "paquete-de-sesiones-de-un-servicio-extra": ["89"],

  // ── Caja y cobros ──
  "corte-de-caja": ["32"],
  "agregar-efectivo-a-caja": ["62"],
  "cobrar-una-cuenta": ["33", "94"],
  "cobrar-con-terminal": ["34", "59"],
  "terminal-no-recibe-el-cobro": ["59", "34"],
  "link-de-pago-whatsapp": ["34"],
  "tarjeta-registro-manual": ["56"],
  "revisar-tarjetas-manuales": ["56"],
  "devolver-un-cobro": ["38"],
  "reembolsos-mercado-pago": ["38"],
  "venta-rapida": ["35", "43"],
  "vender-producto-en-mostrador": ["43"],
  "cargo-suelto": ["36"],
  "aplicar-descuento": ["37"],
  "cobrar-varios-servicios-juntos": ["57"],
  "anular-o-corregir-un-cobro": ["61"],

  // ── Facturación ──
  "configurar-la-facturacion": ["65"],
  "datos-fiscales-de-un-cliente": ["65"],
  "facturar-un-cobro": ["65"],
  "facturar-un-cobro-junto": ["65", "57"],
  "mandar-una-factura-al-cliente": ["65"],
  "cancelar-o-sustituir-una-factura": ["65"],

  // ── Inventario, equipo, gastos y reportes ──
  "consumibles-compras-y-consumo": ["40", "42"],
  "receta-de-consumo-por-servicio": ["24"],
  "equipo-y-mantenimiento": ["41"],
  "entrada-y-salida-de-empleados": ["44"],
  "ausencias-y-vacaciones-de-empleados": ["45"],
  "pagar-la-nomina": ["46"],
  "registrar-gastos-del-local": ["47", "48"],
  "leer-los-reportes": ["49"],
  "ver-el-detalle-de-una-cifra": ["49"],

  // ── Importar y app ──
  "importar-clientes-y-mascotas": ["66"],
  "deshacer-una-importacion": ["67"],
  "recuperar-un-borrador": ["68"],
  "instalar-la-app-y-sin-conexion": ["69"],

  // ── Veterinaria ──
  "veterinaria-que-incluye": ["70"],
  "ficha-clinica-de-la-mascota": ["71"],
  "inventario-clinico-con-lotes": ["72"],
  "medicos-veterinarios-y-folios": ["73"],
  "establecimiento-y-permisos-veterinarios": ["73"],
  "carnet-de-la-mascota": ["74"],
  "carnet-verificable-y-recordatorios": ["75"],
  "certificado-de-salud": ["76"],
  "hospitalizar-una-mascota": ["77"],
  "consentimientos-informados": ["78"],
  "agenda-clinica-veterinaria": ["79"],
  "consulta-veterinaria-soap": ["80", "90"],
  "estudios-archivos-y-linea-de-tiempo": ["81"],
  "estimados-veterinarios": ["82"],
  "veterinaria-ajustes-consulta-y-portal": ["83"],
  "emitir-receta-veterinaria": ["84"],
  "registrar-receta-sitpv": ["85"],
  "surtir-producto-controlado": ["86"],
  "recetario-especial-veterinaria": ["86"],
  "libro-de-control-veterinaria": ["87"],
  "reporte-mensual-sitpv": ["88"],
  "dictar-la-consulta": ["90"],
  "agendar-y-atender-una-teleconsulta": ["91"],
  "entrar-a-una-teleconsulta-como-dueno": ["92"],
  "cobrar-una-consulta-veterinaria": ["93"],

  "corregir-un-cobro-con-terminal-mal-marcado": ["38"],
};

/**
 * Videos que no cabe en ningún artículo, con el motivo. `cobertura.mjs` exige que todo video publicado esté en
 * VIDEOS_DE_ARTICULO o aquí.
 */
export const VIDEOS_SIN_ARTICULO: Record<string, string> = {
  "00": "Avance de la serie: un recorrido de 40 segundos por todo el catálogo; no explica una tarea.",
};

/**
 * Artículos que hoy no tienen video, con el motivo (falta grabarlo). `cobertura.mjs` exige que todo artículo
 * tenga video en VIDEOS_DE_ARTICULO o aparezca aquí: un artículo nuevo sin video se decide a propósito.
 */
export const ARTICULOS_SIN_VIDEO: Record<string, string> = {
  "botones-y-enlaces": "Explica cómo se ven y responden todos los botones y enlaces; no es una tarea de una pantalla. Se enseña dentro de los videos de cada pantalla al regrabarlos.",
  "recordatorios-automaticos-por-whatsapp": "Pendiente de grabar: función nueva (recordatorios automáticos por WhatsApp, 25 de octubre de 2026); se graba con un negocio de prueba porque el demo no manda mensajes.",
  "alguien-mas-cambio-lo-que-editabas": "Pendiente de grabar: el aviso solo sale con dos personas editando lo mismo a la vez; se graba con dos sesiones del demo.",
  "cambiar-estilista-cita-estetica": "Pendiente de grabar: el guion del video 96 está listo; la grabación está en pausa.",
  "factura-global-publico-en-general": "Pendiente de grabar: el guion del video 98 está listo; la grabación está en pausa.",
  "iva-y-claves-sat-de-productos-y-servicios": "Pendiente de grabar: el guion del video 99 está listo; la grabación está en pausa.",
  "primeros-pasos-para-operar": "Pendiente de grabar: la bienvenida por giro (QA S16) cambió; se graba con un negocio de prueba nuevo, no con el demo.",
  "requisitos-para-hospedar": "Pendiente de grabar: pantalla nueva de la bienvenida (QA S16).",
  "ver-mis-facturas": "Pendiente de grabar: ningún video muestra las facturas en el portal del dueño. El folio 100 necesita que `tutoriales.numero` admita tres dígitos (migración).",
  "app-peludesk-para-duenos": "Pendiente de grabar: la app para dueños (app.peludesk.mx, Fase 0 del 31 de octubre de 2026) vive en otro dominio y se graba con una cuenta de dueño del demo cuando la grabación se retome.",
};

/** Los números de los videos de un artículo (el principal primero); [] si no tiene. */
export function videosDeArticulo(slug: string): string[] {
  return VIDEOS_DE_ARTICULO[slug] ?? [];
}

/** Los artículos que cubre un video, en el orden en que aparecen en el mapeo. */
export function articulosDeVideo(numero: string): string[] {
  return Object.entries(VIDEOS_DE_ARTICULO)
    .filter(([, vs]) => vs.includes(numero))
    .map(([slug]) => slug);
}
