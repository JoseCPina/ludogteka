// Prospección nacional: lista de ciudades por estado, zonas metropolitanas partidas por municipio (Google solo
// devuelve 60 lugares por consulta, así que una ciudad grande se busca municipio por municipio) y el estimador
// de costo de las llamadas a Places. Sin imports: lo usan la tarea, el endpoint protegido y las pruebas.
//
// FUENTE DE LA LISTA: escrita de memoria, SIN fuente oficial (la red de la sesión no alcanza al INEGI). Está
// POR COTEJAR CON INEGI (zonas metropolitanas y localidades urbanas más pobladas) antes de darla por completa.

export const LISTA_NACIONAL_FUENTE = "por cotejar con INEGI";

export type CiudadNacional = {
  /** Nombre que se busca («Zapopan, Jalisco»). */
  nombre: string;
  estado: string;
  /** Zona metropolitana a la que pertenece, si la hay (se busca por municipio). */
  zona?: string;
};

const z = (zona: string, estado: string, municipios: string[]): CiudadNacional[] => municipios.map((m) => ({ nombre: `${m}, ${estado}`, estado, zona }));
const c = (estado: string, ciudades: string[]): CiudadNacional[] => ciudades.map((n) => ({ nombre: `${n}, ${estado}`, estado }));

export const CIUDADES_NACIONALES: CiudadNacional[] = [
  ...z("Valle de México", "Ciudad de México", ["Álvaro Obregón", "Azcapotzalco", "Benito Juárez", "Coyoacán", "Cuajimalpa", "Cuauhtémoc", "Gustavo A. Madero", "Iztacalco", "Iztapalapa", "Magdalena Contreras", "Miguel Hidalgo", "Milpa Alta", "Tláhuac", "Tlalpan", "Venustiano Carranza", "Xochimilco"]),
  ...z("Valle de México", "Estado de México", ["Naucalpan", "Tlalnepantla", "Ecatepec", "Nezahualcóyotl", "Atizapán de Zaragoza", "Huixquilucan", "Cuautitlán Izcalli", "Tecámac", "Chimalhuacán", "Texcoco", "Toluca", "Metepec"]),
  ...z("Guadalajara", "Jalisco", ["Guadalajara", "Zapopan", "San Pedro Tlaquepaque", "Tonalá", "Tlajomulco de Zúñiga", "El Salto"]),
  ...z("Monterrey", "Nuevo León", ["Monterrey", "San Pedro Garza García", "San Nicolás de los Garza", "Guadalupe", "Apodaca", "General Escobedo", "Santa Catarina", "Juárez"]),
  ...z("Puebla-Tlaxcala", "Puebla", ["Puebla", "San Andrés Cholula", "San Pedro Cholula"]),
  ...z("Querétaro", "Querétaro", ["Querétaro", "Corregidora", "El Marqués"]),
  ...z("La Laguna", "Coahuila", ["Torreón"]),
  ...z("Tijuana", "Baja California", ["Tijuana", "Playas de Rosarito"]),
  ...z("San Luis Potosí", "San Luis Potosí", ["San Luis Potosí", "Soledad de Graciano Sánchez"]),
  ...z("León", "Guanajuato", ["León", "Silao"]),
  ...z("Mérida", "Yucatán", ["Mérida"]),
  ...z("Cancún", "Quintana Roo", ["Benito Juárez", "Playa del Carmen"]),
  ...c("Aguascalientes", ["Aguascalientes"]),
  ...c("Baja California", ["Mexicali", "Ensenada", "Tecate"]),
  ...c("Baja California Sur", ["La Paz", "Los Cabos"]),
  ...c("Campeche", ["Campeche", "Ciudad del Carmen"]),
  ...c("Chiapas", ["Tuxtla Gutiérrez", "Tapachula", "San Cristóbal de las Casas"]),
  ...c("Chihuahua", ["Chihuahua", "Ciudad Juárez", "Cuauhtémoc"]),
  ...c("Coahuila", ["Saltillo", "Monclova", "Piedras Negras", "Ramos Arizpe"]),
  ...c("Colima", ["Colima", "Manzanillo"]),
  ...c("Durango", ["Durango", "Gómez Palacio"]),
  ...c("Guanajuato", ["Irapuato", "Celaya", "Salamanca", "Guanajuato", "San Miguel de Allende"]),
  ...c("Guerrero", ["Acapulco", "Chilpancingo", "Zihuatanejo"]),
  ...c("Hidalgo", ["Pachuca", "Tulancingo"]),
  ...c("Jalisco", ["Puerto Vallarta", "Tepatitlán"]),
  ...c("Estado de México", ["Tlalnepantla", "Chalco"]),
  ...c("Michoacán", ["Morelia", "Uruapan", "Zamora"]),
  ...c("Morelos", ["Cuernavaca", "Cuautla"]),
  ...c("Nayarit", ["Tepic", "Bahía de Banderas"]),
  ...c("Nuevo León", ["Cadereyta Jiménez"]),
  ...c("Oaxaca", ["Oaxaca de Juárez", "Salina Cruz"]),
  ...c("Puebla", ["Tehuacán", "Atlixco"]),
  ...c("Quintana Roo", ["Chetumal", "Tulum"]),
  ...c("Sinaloa", ["Culiacán", "Mazatlán", "Los Mochis"]),
  ...c("Sonora", ["Hermosillo", "Ciudad Obregón", "Nogales", "San Luis Río Colorado"]),
  ...c("Tabasco", ["Villahermosa", "Cárdenas"]),
  ...c("Tamaulipas", ["Reynosa", "Matamoros", "Nuevo Laredo", "Tampico", "Ciudad Victoria"]),
  ...c("Tlaxcala", ["Tlaxcala", "Apizaco"]),
  ...c("Veracruz", ["Veracruz", "Xalapa", "Coatzacoalcos", "Córdoba", "Poza Rica", "Boca del Río"]),
  ...c("Yucatán", ["Valladolid"]),
  ...c("Zacatecas", ["Zacatecas", "Fresnillo"]),
];

/** Ciudades (sin repetir) para una corrida: todas, o solo los estados / zonas pedidos. */
export function ciudadesNacionales(f: { estados?: string[]; zonas?: string[] } = {}): string[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const estados = new Set((f.estados ?? []).map(norm));
  const zonas = new Set((f.zonas ?? []).map(norm));
  const vistas = new Set<string>();
  for (const x of CIUDADES_NACIONALES) {
    if (estados.size && !estados.has(norm(x.estado))) continue;
    if (zonas.size && !(x.zona && zonas.has(norm(x.zona)))) continue;
    vistas.add(x.nombre);
  }
  return [...vistas];
}

// Precio de Text Search (Places API New) con campos de teléfono y web = SKU Enterprise: se cobra por llamada
// (hasta 20 lugares), con 1,000 gratis al mes. El precio por mil llamadas es una ESTIMACIÓN a verificar contra la
// tabla de precios vigente de Google antes de una corrida grande; se puede pasar otro en cada estimación.
export const PRECIO_ENTERPRISE_POR_1000_USD = 35;
export const GRATIS_AL_MES = 1000;

export type Estimacion = {
  ciudades: number;
  consultasPorCiudad: number;
  llamadasMaximas: number;
  llamadasCobradas: number;
  costoUsd: number;
  /** Días que tarda con ese tope diario. */
  dias: number | null;
};

export function estimarCosto(o: { ciudades: number; consultasPorCiudad: number; paginasPorConsulta: number; yaUsadasEsteMes?: number; precioPor1000Usd?: number; topeDiario?: number }): Estimacion {
  const llamadasMaximas = Math.max(0, o.ciudades) * Math.max(0, o.consultasPorCiudad) * Math.max(1, o.paginasPorConsulta);
  const gratisRestantes = Math.max(0, GRATIS_AL_MES - (o.yaUsadasEsteMes ?? 0));
  const llamadasCobradas = Math.max(0, llamadasMaximas - gratisRestantes);
  const costoUsd = Math.round(((llamadasCobradas * (o.precioPor1000Usd ?? PRECIO_ENTERPRISE_POR_1000_USD)) / 1000) * 100) / 100;
  const dias = o.topeDiario && o.topeDiario > 0 ? Math.ceil(llamadasMaximas / o.topeDiario) : null;
  return { ciudades: o.ciudades, consultasPorCiudad: o.consultasPorCiudad, llamadasMaximas, llamadasCobradas, costoUsd, dias };
}
