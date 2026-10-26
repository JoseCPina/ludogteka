/**
 * ¿Puede esta persona abrir esta ruta? (QA N127, 25 de octubre de 2026). Una sola respuesta para el middleware
 * (que decide si la página se abre), para las páginas que vuelven a revisar y para la pantalla, que con lo mismo
 * esconde todo botón o enlace que llevaría a una página que esa persona no puede usar: así ningún botón «regresa»
 * a quien lo apretó. La base sigue siendo la que manda en cada operación; esto decide qué se ve.
 *
 * Sin dependencias de servidor: corre en el middleware, en el servidor y en el navegador (`usePuedeAbrir`).
 */
import { moduloDeRuta, moduloRequeridoActivo } from "@/lib/plan/modulos";

export type Acceso = {
  rol: string;
  // Permisos por persona (permisos_staff); admin los tiene todos.
  permisos: readonly string[];
  // Módulos prendidos del negocio. Sin la lista (el middleware cuando la ruta no es de un módulo) no se revisan.
  modulos?: readonly string[];
  // acceso_veterinaria(): médico designado o algún permiso del módulo, con cualquier rol.
  accesoVeterinaria?: boolean;
  // es_medico_veterinario(): un médico designado tiene los permisos clínicos (vet_puede).
  esMedico?: boolean;
};

/**
 * Quién abre cada zona. Gana la PRIMERA que coincide, así que lo más específico va primero.
 * - `roles`: los roles que entran.
 * - `permisos`: quien tenga CUALQUIERA de estos permisos por persona también entra.
 * - `accesoVeterinaria`: también quien tenga acceso a Veterinaria (sin importar el rol).
 * - `vet`: además de lo anterior, hace falta CUALQUIERA de estos permisos clínicos (`vet_puede`: el permiso o ser
 *   médico designado, con el módulo prendido). Lo pide la pantalla que, sin él, solo diría «No tienes acceso».
 * - `exacta`: solo la ruta misma, no lo que cuelga de ella. `patron`: en vez de prefijo.
 */
export type Zona = {
  prefijo: string;
  roles: readonly string[];
  permisos?: readonly string[];
  accesoVeterinaria?: boolean;
  vet?: readonly string[];
  exacta?: boolean;
  // Solo un médico veterinario designado.
  medico?: boolean;
  patron?: RegExp;
};

const VET = { roles: ["admin", "recepcion"], accesoVeterinaria: true } as const;

export const ZONAS: Zona[] = [
  // Dar y quitar permisos nunca se delega.
  { prefijo: "/admin/permisos", roles: ["admin"] },
  // Servicios extra (Hotel y guardería): el catálogo es de admin o de quien tenga el permiso.
  { prefijo: "/extras/catalogo", roles: ["admin"], permisos: ["editar_catalogo_extras"] },
  { prefijo: "/extras", roles: ["admin", "recepcion"] },
  // Con qué cobra el negocio y sus credenciales: solo admin, nunca se delega.
  { prefijo: "/admin/pagos", roles: ["admin"] },
  // La plantilla del reporte de guardería y los días de retención: solo admin.
  { prefijo: "/admin/reporte-guarderia", roles: ["admin"] },
  // Pagar el plan es de admin; prender y apagar módulos, también de quien tenga «Administrar módulos».
  { prefijo: "/admin/modulos/pago", roles: ["admin"] },
  { prefijo: "/admin/modulos", roles: ["admin"], permisos: ["administrar_modulos"] },
  // Facturación: datos fiscales, llave del PAC e IVA (solo admin o con permiso).
  { prefijo: "/admin/facturacion", roles: ["admin"], permisos: ["editar_datos_fiscales", "facturar"] },
  // Importar clientes y mascotas desde Excel o CSV (admin o con «Importar clientes y mascotas»).
  { prefijo: "/admin/importar", roles: ["admin"], permisos: ["importar_datos"] },
  { prefijo: "/admin/perfil", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { prefijo: "/admin/politicas", roles: ["admin"], permisos: ["configuracion_negocio"] },
  // Qué recordatorios por WhatsApp salen solos y a qué hora (el tope de gasto, en Módulos y plan).
  { prefijo: "/admin/recordatorios", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { prefijo: "/admin/configuracion", roles: ["admin"], permisos: ["configuracion_negocio"] },
  // Hotel y guardería: la política de salida anticipada.
  { prefijo: "/admin/hotel", roles: ["admin"], permisos: ["configuracion_negocio"] },
  { prefijo: "/admin/tarifa-guarderia", roles: ["admin"], permisos: ["tarifas"] },
  { prefijo: "/admin", roles: ["admin"], permisos: ["personal", "configuracion_negocio", "tarifas"] },
  { prefijo: "/recepcion", roles: ["recepcion", "admin"] },
  // Los primeros pasos de un negocio recién abierto en peludesk.mx.
  { prefijo: "/bienvenida", roles: ["admin"] },
  // /estetica es a la vez el aterrizaje del rol de estética y el módulo de la agenda, así que recepción también
  // entra. Estética agenda sus propias citas (la base solo le deja ponerse a sí misma).
  { prefijo: "/estetica", roles: ["admin", "recepcion", "estetica"] },
  { prefijo: "/portal", roles: ["cliente"] },
  { prefijo: "/clientes", roles: ["admin", "recepcion"] },
  // Lo que contestan los clientes a los recordatorios por WhatsApp (cambios, solicitudes, mensajes) y los enviados.
  { prefijo: "/recordatorios", roles: ["admin", "recepcion"] },
  { prefijo: "/vinculacion", roles: ["admin", "recepcion"] },
  // Estética entra a la ficha del perro: escribe peso/alergias/alertas, aunque no pueda tocar los datos base
  // (eso lo filtra RLS, no esta zona).
  { prefijo: "/perros", roles: ["admin", "recepcion", "estetica"] },
  // Con el permiso de tarifas solo le sirven las matrices de precios (crear y editar servicios es de admin).
  { prefijo: "/servicios/nuevo", roles: ["admin"] },
  { prefijo: "/servicios/:id", patron: /^\/servicios\/[^/]+$/, roles: ["admin"] },
  { prefijo: "/servicios", roles: ["admin"], permisos: ["tarifas"] },
  { prefijo: "/reservas", roles: ["admin", "recepcion"] },
  { prefijo: "/guarderia", roles: ["admin", "recepcion"] },
  // Quién está adentro ahora (hotel y guardería), con fotos, videos y reporte.
  { prefijo: "/adentro", roles: ["admin", "recepcion"] },
  { prefijo: "/hotel", roles: ["admin", "recepcion"] },
  // Las facturas: con «Facturar» o «Cancelar facturas».
  { prefijo: "/caja/facturas", roles: ["admin"], permisos: ["facturar", "cancelar_facturas"] },
  { prefijo: "/caja", roles: ["admin", "recepcion"] },
  // Veterinaria: entra cualquier rol del personal que sea médico veterinario designado o tenga algún permiso del
  // módulo (`acceso_veterinaria()`); las pantallas clínicas piden además su permiso.
  { prefijo: "/veterinaria/medicos", roles: ["admin"] },
  { prefijo: "/veterinaria/inventario/nuevo", roles: ["admin"], permisos: ["lotes_clinicos"] },
  { prefijo: "/veterinaria/estimados", ...VET, vet: ["crear_estimados"] },
  { prefijo: "/veterinaria/expediente/:id", patron: /^\/veterinaria\/expediente\/[^/]+/, ...VET, vet: ["atender_consultas", "firmar_expediente"] },
  // Una receta la emite solo un médico designado (con su cédula); el permiso deja verlas y mandarlas.
  { prefijo: "/veterinaria/recetas/nueva", ...VET, medico: true },
  { prefijo: "/veterinaria/teleconsulta", ...VET, vet: ["atender_teleconsultas"] },
  { prefijo: "/veterinaria", ...VET },
  { prefijo: "/contratos", roles: ["admin", "recepcion"] },
  // El catálogo de inventario lo dan de alta admin y recepción; estética registra consumo y merma.
  { prefijo: "/inventario/areas", roles: ["admin"] },
  { prefijo: "/inventario/sin-costo", roles: ["admin"], permisos: ["inventario_costos"] },
  { prefijo: "/inventario/nuevo", roles: ["admin", "recepcion"] },
  { prefijo: "/inventario/equipo/nuevo", roles: ["admin", "recepcion"] },
  { prefijo: "/inventario", roles: ["admin", "recepcion", "estetica"] },
  { prefijo: "/reportes", roles: ["admin"], permisos: ["reportes_financieros"] },
  // Gastos del local: con «Gastos»; las categorías, solo admin.
  { prefijo: "/gastos/categorias", roles: ["admin"] },
  { prefijo: "/gastos", roles: ["admin"], permisos: ["gastos"] },
  // Empleados: el dinero (nómina, comisiones) y el alta, solo con «Nómina».
  { prefijo: "/empleados/nomina", roles: ["admin"], permisos: ["nomina"] },
  { prefijo: "/empleados/comisiones", roles: ["admin"], permisos: ["nomina"] },
  { prefijo: "/empleados/nuevo", roles: ["admin"], permisos: ["nomina"] },
  { prefijo: "/empleados", roles: ["admin", "recepcion"] },
  // Ayuda: artículos, asistente y tickets (admin y recepción, sin permiso especial).
  { prefijo: "/ayuda", roles: ["admin", "recepcion"] },
  // Lo de cada quien: su asistencia, ausencias y pagos.
  { prefijo: "/mi-trabajo", roles: ["admin", "recepcion", "estetica"] },
];

// Zonas de API: nunca redirigen (un fetch no sabe qué hacer con un 302 a HTML), responden 401/403.
export const ZONAS_API: Zona[] = [{ prefijo: "/api/staff", roles: ["admin"], permisos: ["personal"] }];

const coincide = (z: Zona, ruta: string) =>
  z.patron ? z.patron.test(ruta) : z.exacta ? ruta === z.prefijo : ruta === z.prefijo || ruta.startsWith(`${z.prefijo}/`);

export function zonaDeRuta(ruta: string, zonas: readonly Zona[] = ZONAS): Zona | null {
  return zonas.find((z) => coincide(z, ruta)) ?? null;
}

/** ¿Hace falta saber los permisos por persona para decidir esta zona con este rol? (el middleware los pide solo entonces) */
export function zonaPidePermisos(zona: Zona, rol: string): boolean {
  return rol !== "admin" && ((!zona.roles.includes(rol) && (zona.permisos?.length ?? 0) > 0) || (zona.vet?.length ?? 0) > 0);
}

/** ¿Hace falta preguntar acceso_veterinaria() / es_medico_veterinario()? */
export function zonaPideVeterinaria(zona: Zona, rol: string): boolean {
  if (rol === "cliente") return false;
  if (zona.medico) return true;
  if ((zona.vet?.length ?? 0) > 0) return rol !== "admin";
  return Boolean(zona.accesoVeterinaria) && !zona.roles.includes(rol);
}

const tiene = (a: Acceso, permiso: string) => a.rol === "admin" || a.permisos.includes(permiso);

/** vet_puede(p) de la base: el permiso, o ser médico designado (con el módulo prendido). */
export function vetPuede(a: Acceso, permiso: string): boolean {
  if (a.modulos && !a.modulos.includes("veterinaria")) return false;
  return tiene(a, permiso) || a.esMedico === true;
}

/** ¿El rol, sus permisos y su acceso a Veterinaria abren esta zona? (sin mirar módulos) */
export function accesoAbreZona(a: Acceso, zona: Zona): boolean {
  if (a.rol === "anonimo") return false;
  const entra =
    zona.roles.includes(a.rol) ||
    (a.rol !== "cliente" && (zona.permisos ?? []).some((p) => tiene(a, p))) ||
    (Boolean(zona.accesoVeterinaria) && a.rol !== "cliente" && a.accesoVeterinaria === true);
  if (!entra) return false;
  if (zona.medico && a.esMedico !== true) return false;
  return !zona.vet?.length || zona.vet.some((p) => vetPuede(a, p));
}

/** La ruta de un href del mismo sitio (sin consulta ni ancla), o null si es de otro sitio o no es una página. */
export function rutaDeHref(href: string): string | null {
  if (!href || href.startsWith("#") || /^(mailto|tel|sms|whatsapp|javascript):/i.test(href)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith("//")) return null;
  if (!href.startsWith("/")) return null;
  return href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

/**
 * ¿Puede abrir este enlace? Lo que no es de una zona protegida (rutas públicas, otro sitio) siempre se puede.
 * Con `modulos`, también exige el módulo de la ruta (si no, la página manda a «módulo apagado»).
 */
export function puedeAbrir(a: Acceso | null | undefined, href: string): boolean {
  const ruta = rutaDeHref(href);
  if (ruta === null) return true;
  const zona = zonaDeRuta(ruta) ?? zonaDeRuta(ruta, ZONAS_API);
  if (!zona) return true;
  if (!a) return false;
  if (!accesoAbreZona(a, zona)) return false;
  const modulo = moduloDeRuta(ruta);
  return !modulo || !a.modulos || moduloRequeridoActivo(modulo, a.modulos);
}

/** La sesión de `obtenerSesionConRol()` como Acceso. */
export function accesoDeSesion(
  sesion: { rol: string; permisos: string[]; modulos: string[]; accesoVeterinaria: boolean; esMedico?: boolean } | null | undefined
): Acceso | null {
  return sesion
    ? { rol: sesion.rol, permisos: sesion.permisos, modulos: sesion.modulos, accesoVeterinaria: sesion.accesoVeterinaria, esMedico: sesion.esMedico ?? false }
    : null;
}
