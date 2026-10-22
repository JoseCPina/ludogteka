// Prospección nacional: lista de ciudades por estado, zonas metropolitanas partidas por municipio (Google solo
// devuelve 60 lugares por consulta, así que una ciudad grande se busca municipio por municipio) y el estimador
// de costo de las llamadas a Places. Sin imports: lo usan la tarea, el endpoint protegido y las pruebas.
//
// FUENTE DE LA LISTA: INEGI (ver LISTA_NACIONAL_FUENTE y la regla abajo). Se generó con los datos abiertos del
// Censo 2020 y el anexo de Metrópolis de México 2020; para rehacerla, se aplica la misma regla.

export const LISTA_NACIONAL_FUENTE =
  "INEGI, Censo de Población y Vivienda 2020 (ITER) y SEDATU-CONAPO-INEGI, Metrópolis de México 2020";

export type CiudadNacional = {
  /** Nombre que se busca («Zapopan, Jalisco»). */
  nombre: string;
  estado: string;
  /** Metrópoli a la que pertenece cuando de ella se buscan varios municipios. */
  zona?: string;
  /** Población del municipio, Censo 2020. */
  poblacion: number;
  /** Clave INEGI del municipio. */
  clave: string;
};

// Regla (cotejada el 18 de octubre de 2026 contra INEGI): (1) cada municipio de las 92 metrópolis de «Metrópolis de
// México 2020» que tenga 100 mil habitantes o más, o una localidad de 100 mil o más, o sea capital (de una metrópoli
// de 100 mil o más sin municipios así, su municipio principal); (2) cada municipio con una localidad de 100 mil
// habitantes o más (ITER 2020), y (3) las 32 capitales. Se busca por municipio porque Google devuelve a lo más 60
// lugares por consulta; los municipios cuyo nombre no es como se dice la ciudad van con el de la ciudad (Centro →
// Villahermosa, Benito Juárez → Cancún, Cajeme → Ciudad Obregón…). De mayor a menor población.
export const CIUDADES_NACIONALES: CiudadNacional[] = [
  { nombre: "Tijuana, Baja California", estado: "Baja California", zona: "Tijuana", poblacion: 1922523, clave: "02004" },
  { nombre: "Iztapalapa, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 1835486, clave: "09007" },
  { nombre: "León, Guanajuato", estado: "Guanajuato", zona: "León", poblacion: 1721215, clave: "11020" },
  { nombre: "Puebla, Puebla", estado: "Puebla", zona: "Puebla-Tlaxcala", poblacion: 1692181, clave: "21114" },
  { nombre: "Ecatepec, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 1645352, clave: "15033" },
  { nombre: "Ciudad Juárez, Chihuahua", estado: "Chihuahua", poblacion: 1512450, clave: "08037" },
  { nombre: "Zapopan, Jalisco", estado: "Jalisco", zona: "Guadalajara", poblacion: 1476491, clave: "14120" },
  { nombre: "Guadalajara, Jalisco", estado: "Jalisco", zona: "Guadalajara", poblacion: 1385629, clave: "14039" },
  { nombre: "Gustavo A. Madero, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 1173351, clave: "09005" },
  { nombre: "Monterrey, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 1142994, clave: "19039" },
  { nombre: "Nezahualcóyotl, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 1077208, clave: "15058" },
  { nombre: "Mexicali, Baja California", estado: "Baja California", poblacion: 1049792, clave: "02002" },
  { nombre: "Querétaro, Querétaro", estado: "Querétaro", zona: "Querétaro", poblacion: 1049777, clave: "22014" },
  { nombre: "Culiacán, Sinaloa", estado: "Sinaloa", poblacion: 1003530, clave: "25006" },
  { nombre: "Mérida, Yucatán", estado: "Yucatán", zona: "Mérida", poblacion: 995129, clave: "31050" },
  { nombre: "Aguascalientes, Aguascalientes", estado: "Aguascalientes", zona: "Aguascalientes", poblacion: 948990, clave: "01001" },
  { nombre: "Chihuahua, Chihuahua", estado: "Chihuahua", poblacion: 937674, clave: "08019" },
  { nombre: "Hermosillo, Sonora", estado: "Sonora", poblacion: 936263, clave: "26030" },
  { nombre: "San Luis Potosí, San Luis Potosí", estado: "San Luis Potosí", zona: "San Luis Potosí", poblacion: 911908, clave: "24028" },
  { nombre: "Cancún, Quintana Roo", estado: "Quintana Roo", poblacion: 911503, clave: "23005" },
  { nombre: "Toluca, Estado de México", estado: "Estado de México", zona: "Toluca", poblacion: 910608, clave: "15106" },
  { nombre: "Saltillo, Coahuila", estado: "Coahuila", zona: "Saltillo", poblacion: 879958, clave: "05030" },
  { nombre: "Morelia, Michoacán", estado: "Michoacán", zona: "Morelia", poblacion: 849053, clave: "16053" },
  { nombre: "Naucalpan, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 834434, clave: "15057" },
  { nombre: "Acapulco, Guerrero", estado: "Guerrero", poblacion: 779566, clave: "12001" },
  { nombre: "Álvaro Obregón, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 759137, clave: "09010" },
  { nombre: "Tlajomulco de Zúñiga, Jalisco", estado: "Jalisco", zona: "Guadalajara", poblacion: 727750, clave: "14097" },
  { nombre: "Torreón, Coahuila", estado: "Coahuila", zona: "La Laguna", poblacion: 720848, clave: "05035" },
  { nombre: "Chimalhuacán, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 705193, clave: "15031" },
  { nombre: "Reynosa, Tamaulipas", estado: "Tamaulipas", zona: "Reynosa", poblacion: 704767, clave: "28032" },
  { nombre: "Tlalpan, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 699928, clave: "09012" },
  { nombre: "Durango, Durango", estado: "Durango", poblacion: 688697, clave: "10005" },
  { nombre: "San Pedro Tlaquepaque, Jalisco", estado: "Jalisco", zona: "Guadalajara", poblacion: 687127, clave: "14098" },
  { nombre: "Villahermosa, Tabasco", estado: "Tabasco", zona: "Villahermosa", poblacion: 683607, clave: "27004" },
  { nombre: "Tlalnepantla, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 672202, clave: "15104" },
  { nombre: "Apodaca, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 656464, clave: "19006" },
  { nombre: "Guadalupe, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 643143, clave: "19026" },
  { nombre: "Coyoacán, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 614447, clave: "09003" },
  { nombre: "Veracruz, Veracruz", estado: "Veracruz", zona: "Veracruz", poblacion: 607209, clave: "30193" },
  { nombre: "Tuxtla Gutiérrez, Chiapas", estado: "Chiapas", zona: "Tuxtla Gutiérrez", poblacion: 604147, clave: "07101" },
  { nombre: "Irapuato, Guanajuato", estado: "Guanajuato", poblacion: 592953, clave: "11017" },
  { nombre: "Tonalá, Jalisco", estado: "Jalisco", zona: "Guadalajara", poblacion: 569913, clave: "14101" },
  { nombre: "Cuautitlán Izcalli, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 555163, clave: "15121" },
  { nombre: "Tecámac, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 547503, clave: "15081" },
  { nombre: "Cuauhtémoc, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 545884, clave: "09015" },
  { nombre: "Ixtapaluca, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 542211, clave: "15039" },
  { nombre: "Matamoros, Tamaulipas", estado: "Tamaulipas", poblacion: 541979, clave: "28022" },
  { nombre: "Atizapán de Zaragoza, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 523674, clave: "15013" },
  { nombre: "Celaya, Guanajuato", estado: "Guanajuato", poblacion: 521169, clave: "11007" },
  { nombre: "Tultitlán, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 516341, clave: "15109" },
  { nombre: "Mazatlán, Sinaloa", estado: "Sinaloa", poblacion: 501441, clave: "25012" },
  { nombre: "Xalapa, Veracruz", estado: "Veracruz", poblacion: 488531, clave: "30087" },
  { nombre: "General Escobedo, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 481213, clave: "19021" },
  { nombre: "Juárez, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 471523, clave: "19031" },
  { nombre: "Los Mochis, Sinaloa", estado: "Sinaloa", poblacion: 459310, clave: "25001" },
  { nombre: "Ensenada, Baja California", estado: "Baja California", poblacion: 443807, clave: "02001" },
  { nombre: "Venustiano Carranza, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 443704, clave: "09017" },
  { nombre: "Xochimilco, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 442178, clave: "09013" },
  { nombre: "Ciudad Obregón, Sonora", estado: "Sonora", poblacion: 436484, clave: "26018" },
  { nombre: "Benito Juárez, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 434153, clave: "09014" },
  { nombre: "Azcapotzalco, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 432205, clave: "09002" },
  { nombre: "Nicolás Romero, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 430601, clave: "15060" },
  { nombre: "Tepic, Nayarit", estado: "Nayarit", poblacion: 425924, clave: "18017" },
  { nombre: "Nuevo Laredo, Tamaulipas", estado: "Tamaulipas", poblacion: 425058, clave: "28027" },
  { nombre: "Miguel Hidalgo, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 414470, clave: "09016" },
  { nombre: "San Nicolás de los Garza, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 412199, clave: "19046" },
  { nombre: "Iztacalco, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 404695, clave: "09006" },
  { nombre: "Chalco, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 400057, clave: "15025" },
  { nombre: "García, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 397205, clave: "19018" },
  { nombre: "Tláhuac, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 392313, clave: "09011" },
  { nombre: "Valle de Chalco Solidaridad, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 391731, clave: "15122" },
  { nombre: "Cuernavaca, Morelos", estado: "Morelos", zona: "Cuernavaca", poblacion: 378476, clave: "17007" },
  { nombre: "Gómez Palacio, Durango", estado: "Durango", zona: "La Laguna", poblacion: 372750, clave: "10007" },
  { nombre: "Uruapan, Michoacán", estado: "Michoacán", poblacion: 356786, clave: "16102" },
  { nombre: "Tapachula, Chiapas", estado: "Chiapas", poblacion: 353706, clave: "07089" },
  { nombre: "Los Cabos, Baja California Sur", estado: "Baja California Sur", poblacion: 351111, clave: "03008" },
  { nombre: "Ciudad Victoria, Tamaulipas", estado: "Tamaulipas", poblacion: 349688, clave: "28041" },
  { nombre: "Playa del Carmen, Quintana Roo", estado: "Quintana Roo", poblacion: 333800, clave: "23008" },
  { nombre: "Soledad de Graciano Sánchez, San Luis Potosí", estado: "San Luis Potosí", zona: "San Luis Potosí", poblacion: 332072, clave: "24035" },
  { nombre: "Tehuacán, Puebla", estado: "Puebla", poblacion: 327312, clave: "21156" },
  { nombre: "Pachuca, Hidalgo", estado: "Hidalgo", zona: "Pachuca", poblacion: 314331, clave: "13048" },
  { nombre: "Coatzacoalcos, Veracruz", estado: "Veracruz", poblacion: 310698, clave: "30039" },
  { nombre: "Santa Catarina, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 306322, clave: "19048" },
  { nombre: "La Paz, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 304088, clave: "15070" },
  { nombre: "San Juan del Río, Querétaro", estado: "Querétaro", poblacion: 297804, clave: "22016" },
  { nombre: "Tampico, Tamaulipas", estado: "Tamaulipas", zona: "Tampico", poblacion: 297562, clave: "28038" },
  { nombre: "Campeche, Campeche", estado: "Campeche", poblacion: 294077, clave: "04002" },
  { nombre: "Coacalco de Berriozábal, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 293444, clave: "15020" },
  { nombre: "La Paz, Baja California Sur", estado: "Baja California Sur", poblacion: 292241, clave: "03003" },
  { nombre: "Puerto Vallarta, Jalisco", estado: "Jalisco", zona: "Puerto Vallarta", poblacion: 291839, clave: "14067" },
  { nombre: "Huixquilucan, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 284965, clave: "15037" },
  { nombre: "Chilpancingo, Guerrero", estado: "Guerrero", poblacion: 283354, clave: "12029" },
  { nombre: "Zumpango, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 280455, clave: "15120" },
  { nombre: "Texcoco, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 277562, clave: "15099" },
  { nombre: "Salamanca, Guanajuato", estado: "Guanajuato", poblacion: 273417, clave: "11027" },
  { nombre: "Oaxaca de Juárez, Oaxaca", estado: "Oaxaca", zona: "Oaxaca", poblacion: 270955, clave: "20067" },
  { nombre: "Altamira, Tamaulipas", estado: "Tamaulipas", zona: "Tampico", poblacion: 269790, clave: "28003" },
  { nombre: "Nogales, Sonora", estado: "Sonora", poblacion: 264782, clave: "26043" },
  { nombre: "Ciudad del Carmen, Campeche", estado: "Campeche", poblacion: 248845, clave: "04003" },
  { nombre: "La Magdalena Contreras, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 247622, clave: "09008" },
  { nombre: "Metepec, Estado de México", estado: "Estado de México", zona: "Toluca", poblacion: 242307, clave: "15054" },
  { nombre: "Fresnillo, Zacatecas", estado: "Zacatecas", poblacion: 240532, clave: "32010" },
  { nombre: "Monclova, Coahuila", estado: "Coahuila", poblacion: 237951, clave: "05018" },
  { nombre: "Chetumal, Quintana Roo", estado: "Quintana Roo", poblacion: 233648, clave: "23004" },
  { nombre: "El Salto, Jalisco", estado: "Jalisco", zona: "Guadalajara", poblacion: 232852, clave: "14070" },
  { nombre: "El Marqués, Querétaro", estado: "Querétaro", zona: "Querétaro", poblacion: 231668, clave: "22011" },
  { nombre: "Cuajimalpa de Morelos, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 217686, clave: "09004" },
  { nombre: "San Cristóbal de las Casas, Chiapas", estado: "Chiapas", poblacion: 215874, clave: "07078" },
  { nombre: "Jiutepec, Morelos", estado: "Morelos", zona: "Cuernavaca", poblacion: 215357, clave: "17011" },
  { nombre: "Corregidora, Querétaro", estado: "Querétaro", zona: "Querétaro", poblacion: 212567, clave: "22006" },
  { nombre: "Guadalupe, Zacatecas", estado: "Zacatecas", zona: "Zacatecas-Guadalupe", poblacion: 211740, clave: "32017" },
  { nombre: "Ciudad Madero, Tamaulipas", estado: "Tamaulipas", zona: "Tampico", poblacion: 205933, clave: "28009" },
  { nombre: "Zamora, Michoacán", estado: "Michoacán", poblacion: 204860, clave: "16108" },
  { nombre: "Córdoba, Veracruz", estado: "Veracruz", poblacion: 204721, clave: "30044" },
  { nombre: "Zinacantepec, Estado de México", estado: "Estado de México", zona: "Toluca", poblacion: 203872, clave: "15118" },
  { nombre: "Silao de la Victoria, Guanajuato", estado: "Guanajuato", poblacion: 203556, clave: "11037" },
  { nombre: "Mineral de la Reforma, Hidalgo", estado: "Hidalgo", zona: "Pachuca", poblacion: 202749, clave: "13051" },
  { nombre: "Chicoloapan, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 200750, clave: "15029" },
  { nombre: "San Luis Río Colorado, Sonora", estado: "Sonora", poblacion: 199021, clave: "26055" },
  { nombre: "Lázaro Cárdenas, Michoacán", estado: "Michoacán", poblacion: 196003, clave: "16052" },
  { nombre: "Guanajuato, Guanajuato", estado: "Guanajuato", poblacion: 194500, clave: "11015" },
  { nombre: "Manzanillo, Colima", estado: "Colima", poblacion: 191031, clave: "06007" },
  { nombre: "Poza Rica de Hidalgo, Veracruz", estado: "Veracruz", poblacion: 189457, clave: "30131" },
  { nombre: "Bahía de Banderas, Nayarit", estado: "Nayarit", zona: "Puerto Vallarta", poblacion: 187632, clave: "18020" },
  { nombre: "Cuautla, Morelos", estado: "Morelos", poblacion: 187118, clave: "17006" },
  { nombre: "Cuauhtémoc, Chihuahua", estado: "Chihuahua", poblacion: 180638, clave: "08017" },
  { nombre: "Ciudad Valles, San Luis Potosí", estado: "San Luis Potosí", poblacion: 179371, clave: "24013" },
  { nombre: "Cuautitlán, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 178847, clave: "15024" },
  { nombre: "Piedras Negras, Coahuila", estado: "Coahuila", poblacion: 176327, clave: "05025" },
  { nombre: "Almoloya de Juárez, Estado de México", estado: "Estado de México", zona: "Toluca", poblacion: 174587, clave: "15005" },
  { nombre: "Lagos de Moreno, Jalisco", estado: "Jalisco", poblacion: 172403, clave: "14053" },
  { nombre: "Acolman, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 171507, clave: "15002" },
  { nombre: "Lerma, Estado de México", estado: "Estado de México", zona: "Toluca", poblacion: 170327, clave: "15051" },
  { nombre: "Tulancingo, Hidalgo", estado: "Hidalgo", poblacion: 168369, clave: "13077" },
  { nombre: "Tizayuca, Hidalgo", estado: "Hidalgo", zona: "Ciudad de México", poblacion: 168302, clave: "13069" },
  { nombre: "Comitán de Domínguez, Chiapas", estado: "Chiapas", poblacion: 166178, clave: "07019" },
  { nombre: "Navojoa, Sonora", estado: "Sonora", poblacion: 164387, clave: "26042" },
  { nombre: "Lerdo, Durango", estado: "Durango", zona: "La Laguna", poblacion: 163313, clave: "10012" },
  { nombre: "Huehuetoca, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 163244, clave: "15035" },
  { nombre: "Ciudad Acuña, Coahuila", estado: "Coahuila", poblacion: 163058, clave: "05002" },
  { nombre: "San Juan Bautista Tuxtepec, Oaxaca", estado: "Oaxaca", poblacion: 159452, clave: "20184" },
  { nombre: "Tultepec, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 157645, clave: "15108" },
  { nombre: "Colima, Colima", estado: "Colima", zona: "Colima-Villa de Álvarez", poblacion: 157048, clave: "06002" },
  { nombre: "Guaymas, Sonora", estado: "Sonora", poblacion: 156863, clave: "26029" },
  { nombre: "San Martín Texmelucan, Puebla", estado: "Puebla", poblacion: 155738, clave: "21132" },
  { nombre: "Pénjamo, Guanajuato", estado: "Guanajuato", zona: "La Piedad-Pénjamo", poblacion: 154960, clave: "11023" },
  { nombre: "San Andrés Cholula, Puebla", estado: "Puebla", zona: "Puebla-Tlaxcala", poblacion: 154448, clave: "21119" },
  { nombre: "Iguala de la Independencia, Guerrero", estado: "Guerrero", poblacion: 154173, clave: "12035" },
  { nombre: "Milpa Alta, Ciudad de México", estado: "Ciudad de México", zona: "Ciudad de México", poblacion: 152685, clave: "09009" },
  { nombre: "Delicias, Chihuahua", estado: "Chihuahua", poblacion: 150506, clave: "08021" },
  { nombre: "Nacajuca, Tabasco", estado: "Tabasco", zona: "Villahermosa", poblacion: 150300, clave: "27013" },
  { nombre: "Villa de Álvarez, Colima", estado: "Colima", zona: "Colima-Villa de Álvarez", poblacion: 149762, clave: "06010" },
  { nombre: "Zacatecas, Zacatecas", estado: "Zacatecas", zona: "Zacatecas-Guadalupe", poblacion: 149607, clave: "32056" },
  { nombre: "Pesquería, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 147624, clave: "19041" },
  { nombre: "Minatitlán, Veracruz", estado: "Veracruz", zona: "Minatitlán", poblacion: 144776, clave: "30108" },
  { nombre: "Boca del Río, Veracruz", estado: "Veracruz", zona: "Veracruz", poblacion: 144550, clave: "30028" },
  { nombre: "Kanasín, Yucatán", estado: "Yucatán", zona: "Mérida", poblacion: 141939, clave: "31041" },
  { nombre: "San Pedro Cholula, Puebla", estado: "Puebla", zona: "Puebla-Tlaxcala", poblacion: 138433, clave: "21140" },
  { nombre: "Cuautlancingo, Puebla", estado: "Puebla", zona: "Puebla-Tlaxcala", poblacion: 137435, clave: "21041" },
  { nombre: "Río Bravo, Tamaulipas", estado: "Tamaulipas", zona: "Reynosa", poblacion: 132484, clave: "28033" },
  { nombre: "San Pedro Garza García, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 132169, clave: "19019" },
  { nombre: "Cosoleacaque, Veracruz", estado: "Veracruz", zona: "Minatitlán", poblacion: 130903, clave: "30048" },
  { nombre: "San Francisco del Rincón, Guanajuato", estado: "Guanajuato", zona: "León", poblacion: 130871, clave: "11031" },
  { nombre: "Jesús María, Aguascalientes", estado: "Aguascalientes", zona: "Aguascalientes", poblacion: 129929, clave: "01005" },
  { nombre: "Playas de Rosarito, Baja California", estado: "Baja California", zona: "Tijuana", poblacion: 126890, clave: "02005" },
  { nombre: "Apatzingán, Michoacán", estado: "Michoacán", poblacion: 126191, clave: "16006" },
  { nombre: "Amozoc, Puebla", estado: "Puebla", zona: "Puebla-Tlaxcala", poblacion: 125876, clave: "21015" },
  { nombre: "Orizaba, Veracruz", estado: "Veracruz", poblacion: 123182, clave: "30118" },
  { nombre: "Cadereyta Jiménez, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 122337, clave: "19009" },
  { nombre: "Temixco, Morelos", estado: "Morelos", zona: "Cuernavaca", poblacion: 122263, clave: "17018" },
  { nombre: "Ramos Arizpe, Coahuila", estado: "Coahuila", zona: "Saltillo", poblacion: 122243, clave: "05027" },
  { nombre: "Matamoros, Coahuila", estado: "Coahuila", zona: "La Laguna", poblacion: 118337, clave: "05017" },
  { nombre: "Hidalgo del Parral, Chihuahua", estado: "Chihuahua", poblacion: 116662, clave: "08032" },
  { nombre: "Tecomán, Colima", estado: "Colima", poblacion: 116305, clave: "06009" },
  { nombre: "Zapotlán el Grande, Jalisco", estado: "Jalisco", poblacion: 115141, clave: "14023" },
  { nombre: "Tarímbaro, Michoacán", estado: "Michoacán", zona: "Morelia", poblacion: 114513, clave: "16088" },
  { nombre: "Juchitán de Zaragoza, Oaxaca", estado: "Oaxaca", poblacion: 113570, clave: "20043" },
  { nombre: "Chiapa de Corzo, Chiapas", estado: "Chiapas", zona: "Tuxtla Gutiérrez", poblacion: 112075, clave: "07027" },
  { nombre: "Emiliano Zapata, Morelos", estado: "Morelos", zona: "Cuernavaca", poblacion: 107053, clave: "17008" },
  { nombre: "La Piedad, Michoacán", estado: "Michoacán", zona: "La Piedad-Pénjamo", poblacion: 106490, clave: "16069" },
  { nombre: "Ocotlán, Jalisco", estado: "Jalisco", poblacion: 106050, clave: "14063" },
  { nombre: "Yautepec, Morelos", estado: "Morelos", zona: "Cuernavaca", poblacion: 105780, clave: "17029" },
  { nombre: "Temoaya, Estado de México", estado: "Estado de México", zona: "Toluca", poblacion: 105766, clave: "15087" },
  { nombre: "El Carmen, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 104478, clave: "19010" },
  { nombre: "Huauchinango, Puebla", estado: "Puebla", poblacion: 103946, clave: "21071" },
  { nombre: "Tepotzotlán, Estado de México", estado: "Estado de México", zona: "Ciudad de México", poblacion: 103696, clave: "15095" },
  { nombre: "Teziutlán, Puebla", estado: "Puebla", poblacion: 103583, clave: "21174" },
  { nombre: "Matehuala, San Luis Potosí", estado: "San Luis Potosí", poblacion: 102199, clave: "24020" },
  { nombre: "General Zuazua, Nuevo León", estado: "Nuevo León", zona: "Monterrey", poblacion: 102149, clave: "19025" },
  { nombre: "Santa Cruz Xoxocotlán, Oaxaca", estado: "Oaxaca", zona: "Oaxaca", poblacion: 100402, clave: "20385" },
  { nombre: "Tlaxcala, Tlaxcala", estado: "Tlaxcala", poblacion: 99896, clave: "29033" },
  { nombre: "Huamantla, Tlaxcala", estado: "Tlaxcala", poblacion: 98764, clave: "29013" },
  { nombre: "Rioverde, San Luis Potosí", estado: "San Luis Potosí", poblacion: 97943, clave: "24024" },
  { nombre: "Tianguistenco, Estado de México", estado: "Estado de México", poblacion: 84259, clave: "15101" },
  { nombre: "Acayucan, Veracruz", estado: "Veracruz", poblacion: 80815, clave: "30003" },
  { nombre: "Sahuayo, Michoacán", estado: "Michoacán", poblacion: 78477, clave: "16076" },
  { nombre: "Sabinas, Coahuila", estado: "Coahuila", poblacion: 64811, clave: "05028" },
  { nombre: "Uriangato, Guanajuato", estado: "Guanajuato", poblacion: 61494, clave: "11041" },
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
// (hasta 20 lugares). Verificado el 18 de octubre de 2026 en la tabla de precios de Google Maps Platform
// (developers.google.com/maps/billing-and-pricing/pricing): Text Search Enterprise $35 por mil (0–100 mil) con 1,000
// gratis al mes; Place Details Enterprise $20 por mil con 1,000 gratis. Se puede pasar otro en cada estimación.
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
