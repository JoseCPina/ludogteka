// Datos del negocio de demostración "Patitas & Co." (Querétaro).
//
// TODO es inventado: personas, teléfonos, perros, precios, gastos. Nada
// sale de Ludogteka ni de ningún cliente real. Los teléfonos empiezan con
// 442 000: en México ningún número de abonado empieza con 0, así que no
// le pueden caer mensajes a nadie. Las fotos son de Unsplash (ver
// fotos/FUENTES.md) y la raza de cada una es la que se ve.

export const NEGOCIO = {
  slug: "patitasyco",
  nombre: "Patitas & Co.",
  ciudad: "Querétaro",
  zona: "America/Mexico_City",
  color: "#2f7d6d",
  telefono: "4420000100",
  direccion: "Av. Ejemplo 123, Col. Centro, Querétaro",
};

// El personal. `cuenta` = entra a la app (y es una de las cuentas de solo
// lectura del demo). Los demás son empleados sin cuenta.
export const PERSONAL = [
  { clave: "admin", nombre: "Mariana Olvera", puesto: "Dueña", rol: "admin", email: "demo.admin@peludesk.mx", telefono: "4420000101" },
  { clave: "recepcion", nombre: "Daniela Ríos", puesto: "Recepción", rol: "recepcion", email: "demo.recepcion@peludesk.mx", telefono: "4420000102",
    pago: { sueldo_monto: 4200, sueldo_periodicidad: "quincenal" }, horario: "completo" },
  { clave: "estetica", nombre: "Karla Méndez", puesto: "Estilista", rol: "estetica", email: "demo.estetica@peludesk.mx", telefono: "4420000103",
    pago: { sueldo_monto: 3000, sueldo_periodicidad: "quincenal", con_comision: true, comision_tipo: "porcentaje", comision_valor: 25, recibe_propinas: true }, horario: "completo" },
  { clave: "estetica2", nombre: "Luis Ángel Paredes", puesto: "Estilista", rol: "estetica", email: "demo.estetica2@peludesk.mx", telefono: "4420000104",
    pago: { pago_por_dia: 380, con_comision: true, comision_tipo: "porcentaje", comision_valor: 20, recibe_propinas: true }, horario: "tarde" },
  { clave: "cuidador", nombre: "Érick Salas", puesto: "Cuidador de guardería", telefono: "4420000105",
    pago: { sueldo_monto: 3800, sueldo_periodicidad: "quincenal" }, horario: "completo" },
  { clave: "limpieza", nombre: "Rosa Hernández", puesto: "Limpieza", telefono: "4420000106",
    pago: { pago_por_dia: 320 }, horario: "manana" },
];

// Horario del personal (1 = lunes … 6 = sábado).
export const HORARIOS = {
  completo: [1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, hora_entrada: "09:00", hora_salida: "18:00" })).concat([{ dia_semana: 6, hora_entrada: "10:00", hora_salida: "14:00" }]),
  tarde: [2, 3, 4, 5].map((d) => ({ dia_semana: d, hora_entrada: "11:00", hora_salida: "19:00" })).concat([{ dia_semana: 6, hora_entrada: "10:00", hora_salida: "14:00" }]),
  manana: [1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, hora_entrada: "08:00", hora_salida: "13:00" })),
};

// Precios inventados para el demo.
export const PRECIOS = {
  guarderia_hora: 40,
  guarderia_dia: 260,
  hotel_noche: { chico: 320, mediano: 360, grande: 420 },
  recoleccion: 12,
  // [completo, rapado, exprés] por grupo de raza; null = no aplica.
  estetica: {
    poodle_maltes: [420, 380, 240],
    pomerania: [460, 400, 260],
    shihtzu_similares: [430, 390, 250],
    pastor_corto: [520, null, 300],
    pastor_largo: [690, 620, 380],
    viejo_pastor: [860, 760, 450],
    pelo_corto: { chico: [300, null, 200], mediano: [380, null, 250], grande: [470, null, 300] },
  },
  pelo_maltratado_extra: 120,
  bonos: { bono_pases_10: 2300, bono_pases_20: 4300, bono_mensualidad: 4600 },
};

export const BONOS = [
  { clave: "bono_pases_10", nombre: "Day pass — 10 pases", cantidad_incluida: 10, vigencia_dias: 30, ilimitado: false, orden: 90 },
  { clave: "bono_pases_20", nombre: "Day pass — 20 pases", cantidad_incluida: 20, vigencia_dias: 45, ilimitado: false, orden: 91 },
  { clave: "bono_mensualidad", nombre: "Mensualidad de guardería", cantidad_incluida: null, vigencia_dias: 30, ilimitado: true, orden: 92 },
];

// usos: G guardería frecuente, H hotel, E estética.
// vacunas: "vigentes" | { bordetella: "vence_pronto" } | { bordetella: "vencida" } | "sin_registro"
export const CLIENTES = [
  { nombre: "Fernanda Luna Arriaga", telefono: "4420000201", email: "fer.luna@ejemplo.com", portal: true, perros: [
    { nombre: "Canela", foto: "x5oPmHmY3kQ", sexo: "hembra", nacio: "2022-04-10", talla: "grande", esterilizado: true, usos: "GE",
      alerta: ["alergia_grave", "Alérgica al pollo: solo sus croquetas de salmón."], temperamento: "Juguetona, se lleva bien con perros grandes.", alimentacion: "Croquetas de salmón, 2 tazas en la mañana." , bono: "bono_mensualidad", bonoHace: 12 },
    { nombre: "Pimienta", foto: "8g0D8ZfFXyA", sexo: "hembra", nacio: "2019-11-02", talla: "chico", esterilizado: true, usos: "E", temperamento: "Tranquila, no le gusta la secadora fuerte." },
  ] },
  { nombre: "Rodrigo Salinas", telefono: "4420000202", perros: [
    { nombre: "Thor", foto: "cwwwHfTytSI", sexo: "macho", nacio: "2021-02-15", talla: "grande", esterilizado: true, usos: "HE", temperamento: "Aúlla cuando se queda solo la primera noche.", papel: true },
  ] },
  { nombre: "Ana Sofía Treviño", telefono: "4420000203", perros: [
    { nombre: "Mochi", foto: "CfDAo3C3bvQ", sexo: "macho", nacio: "2023-01-20", talla: "chico", esterilizado: false, usos: "HE" },
    { nombre: "Nube", foto: "NR2eMg9zXxA", sexo: "hembra", nacio: "2024-05-03", talla: "grande", esterilizado: false, usos: "", vacunas: "sin_registro", nueva: true },
  ] },
  { nombre: "Héctor Ibarra", telefono: "4420000204", perros: [
    { nombre: "Bruno", foto: "VzG64C5T7p4", sexo: "macho", nacio: "2022-08-30", talla: "chico", esterilizado: true, usos: "G",
      alerta: ["agresivo_comida", "Come separado de los demás."], bono: "bono_pases_10", bonoHace: 15 },
  ] },
  { nombre: "Valeria Montes", telefono: "4420000205", perros: [
    { nombre: "Lola", foto: "ASZX50HNskE", sexo: "hembra", nacio: "2020-06-12", talla: "chico", esterilizado: true, usos: "GE" },
    { nombre: "Kiwi", foto: "AjD4LorPIWc", sexo: "macho", nacio: "2021-03-08", talla: "chico", esterilizado: true, usos: "G" },
  ] },
  { nombre: "Diego Carranza", telefono: "4420000206", perros: [
    { nombre: "Rocco", foto: "WX4i1Jq_o0Y", sexo: "macho", nacio: "2020-10-01", talla: "grande", esterilizado: true, usos: "H", contratoHotelPendiente: true },
  ] },
  { nombre: "Paola Guerrero", telefono: "4420000207", perros: [
    { nombre: "Coco", foto: "nwe2qgAhT4k", sexo: "hembra", nacio: "2018-12-24", talla: "chico", esterilizado: true, usos: "E", temperamento: "Mayor; cortar uñas con calma." },
  ] },
  { nombre: "Mauricio Vélez", telefono: "4420000208", perros: [
    { nombre: "Zeus", foto: "5_nJw3UUgpQ", sexo: "macho", nacio: "2021-07-19", talla: "grande", esterilizado: true, usos: "G", vacunas: { bordetella: "vence_pronto" }, bono: "bono_pases_10", bonoHace: 20 },
  ] },
  { nombre: "Lucía Andrade", telefono: "4420000209", perros: [
    { nombre: "Frida", foto: "6uPsI12Xqjk", sexo: "hembra", nacio: "2022-02-02", talla: "chico", esterilizado: true, usos: "GE" },
  ] },
  { nombre: "Jorge Peña", telefono: "4420000210", perros: [
    { nombre: "Max", foto: "JKdIHsDLAu8", sexo: "macho", nacio: "2019-05-05", talla: "grande", esterilizado: true, usos: "GH" },
    { nombre: "Luna", foto: "9Iod_2fmhu4", sexo: "hembra", nacio: "2021-09-14", talla: "mediano", esterilizado: true, usos: "GH" },
  ] },
  { nombre: "Regina Solís", telefono: "4420000211", perros: [
    { nombre: "Toby", foto: "hbmDghIdYP0", sexo: "macho", nacio: "2020-01-28", talla: "mediano", esterilizado: true, usos: "G",
      alerta: ["se_escapa", "Brinca la reja de 1.20 m: en el patio, siempre con correa."], bono: "bono_pases_20", bonoHace: 21 },
  ] },
  { nombre: "Andrés Cortés", telefono: "4420000212", perros: [
    { nombre: "Simba", foto: "qHfPFK16PeM", sexo: "macho", nacio: "2018-03-17", talla: "grande", esterilizado: true, usos: "HE", vacunas: { bordetella: "vencida" } },
  ] },
  { nombre: "Carolina Ruiz", telefono: "4420000213", perros: [
    { nombre: "Bombón", foto: "VBkIK3qj3QE", sexo: "hembra", nacio: "2022-10-10", talla: "chico", esterilizado: false, usos: "E" },
    { nombre: "Chispa", foto: "Xz4oc-MbHEA", sexo: "hembra", nacio: "2023-06-01", talla: "chico", esterilizado: false, usos: "E" },
  ] },
  { nombre: "Ricardo Olmos", telefono: "4420000214", perros: [
    { nombre: "Rufo", foto: "pw2eI1iVNgk", sexo: "macho", nacio: "2021-11-11", talla: "mediano", esterilizado: true, usos: "G",
      alerta: ["ansiedad_separacion", "Llora la primera hora; ayuda dejarle su cobija."], vacunas: { desparasitacion_interna: "vence_pronto" } },
  ] },
  { nombre: "Ximena Castro", telefono: "4420000215", perros: [
    { nombre: "Oreo", foto: "sOegq0nnNgE", sexo: "macho", nacio: "2022-07-07", talla: "mediano", esterilizado: true, usos: "GH" },
    { nombre: "Milo", foto: "aFDgHo2u10M", sexo: "macho", nacio: "2020-04-22", talla: "chico", esterilizado: true, usos: "E" },
  ] },
  { nombre: "Emilio Navarro", telefono: "4420000216", perros: [
    { nombre: "Nala", foto: "ahX9bACpp9o", sexo: "hembra", nacio: "2022-12-01", talla: "mediano", esterilizado: true, usos: "G" },
    { nombre: "Pancho", foto: "vXjNwYi2B8M", sexo: "macho", nacio: "2021-08-18", talla: "mediano", esterilizado: true, usos: "E" },
    { nombre: "Duque", foto: "7Dn0hmvnCh8", sexo: "macho", nacio: "2019-09-09", talla: "grande", esterilizado: true, usos: "G" },
  ] },
  { nombre: "Sofía Herrera", telefono: "4420000217", perros: [
    { nombre: "Kira", foto: "hz_BchTSLX8", sexo: "hembra", nacio: "2023-03-03", talla: "chico", esterilizado: false, usos: "E" },
    { nombre: "Rocky", foto: "-UYxvgUJc8k", sexo: "macho", nacio: "2020-02-29", talla: "mediano", esterilizado: true, usos: "E" },
  ] },
];

export const VETERINARIOS = [
  { nombre: "Dra. Paulina Reyes", clinica: "Clínica Veterinaria Ejemplo", telefono: "4420000301" },
  { nombre: "Dr. Tomás Aguilar", clinica: "Hospital Veterinario Demo", telefono: "4420000302" },
];

export const PROVEEDORES = [
  { nombre: "Distribuidora de Estética Canina (ejemplo)", contacto_nombre: "Arturo", telefono: "4420000401" },
  { nombre: "Croquetas y Más (ejemplo)", contacto_nombre: "Gabriela", telefono: "4420000402" },
  { nombre: "Limpieza Industrial (ejemplo)", contacto_nombre: "Rubén", telefono: "4420000403" },
];

// Consumibles: [nombre, área, unidad compra, unidad consumo, stock mínimo (consumo), compras [[cantidad, costo]], consumido (consumo)]
export const INSUMOS = [
  ["Shampoo hipoalergénico", "estetica", "galon", "ml", 3000, [[2, 420]], 9800],
  ["Acondicionador desenredante", "estetica", "galon", "ml", 1000, [[2, 390]], 6900],
  ["Perfume para perro", "estetica", "l", "ml", 250, [[2, 260]], 1420],
  ["Toallas desechables", "estetica", "pieza", "pieza", 150, [[300, 3.5]], 262],
  ["Moños y pañoletas", "estetica", "pieza", "pieza", 30, [[120, 6]], 71],
  ["Hojas para máquina #10", "estetica", "pieza", "pieza", 2, [[4, 380]], 1],
  ["Croquetas adulto (bulto 20 kg)", "guarderia_hotel", "kg", "g", 10000, [[60, 58]], 44500],
  ["Premios de entrenamiento", "guarderia_hotel", "kg", "g", 1000, [[4, 210]], 3100],
  ["Tapetes entrenadores", "guarderia_hotel", "pieza", "pieza", 40, [[100, 7]], 88],
  ["Desinfectante de amonio cuaternario", "limpieza", "galon", "ml", 3000, [[4, 310]], 9200],
  ["Bolsas para desechos", "limpieza", "pieza", "pieza", 200, [[1000, 0.6]], 640],
  ["Gasas estériles", "botiquin", "pieza", "pieza", 20, [[50, 2.5]], 12],
  ["Solución antiséptica", "botiquin", "l", "ml", 250, [[1, 180]], 180],
];

// Receta por servicio de estética (ml o piezas por baño, sin importar talla para el demo).
export const RECETAS = {
  estetica_estetico: [["Shampoo hipoalergénico", 90], ["Acondicionador desenredante", 60], ["Perfume para perro", 8], ["Toallas desechables", 3], ["Moños y pañoletas", 1]],
  estetica_rapado: [["Shampoo hipoalergénico", 80], ["Acondicionador desenredante", 40], ["Perfume para perro", 8], ["Toallas desechables", 3]],
  estetica_expres: [["Shampoo hipoalergénico", 60], ["Perfume para perro", 5], ["Toallas desechables", 2]],
};

// Equipo: [nombre, área, cantidad, estado, frecuencia (días), qué mantenimiento, último mantenimiento (hace N días) | null, nota]
export const EQUIPOS = [
  ["Mesa de estética hidráulica", "estetica", 2, "bueno", 180, "Revisar pistón y tornillería", 40],
  ["Secadora de alta velocidad", "estetica", 2, "bueno", 90, "Limpiar filtro y revisar cable", 95],
  ["Secadora de alta velocidad", "estetica", 1, "mantenimiento", 90, "Limpiar filtro y revisar cable", 20, "Hace ruido al arrancar; en revisión con el proveedor."],
  ["Máquina de corte inalámbrica", "estetica", 3, "bueno", 60, "Afilar y aceitar cuchillas", 25],
  ["Tina de baño elevada", "estetica", 2, "bueno", null, null, null],
  ["Jaulas de descanso", "guarderia_hotel", 12, "bueno", 30, "Desinfección profunda", 34],
  ["Camas elevadas", "guarderia_hotel", 14, "bueno", null, null, null],
  ["Cámara de vigilancia", "guarderia_hotel", 4, "bueno", 365, "Revisar grabación y limpieza de lente", 120],
  ["Hidrolavadora", "limpieza", 1, "descompuesto", 120, "Revisar bomba", 200, "No levanta presión; cotizar reparación."],
  ["Botiquín de primeros auxilios", "botiquin", 1, "bueno", 90, "Revisar caducidades", 60],
];

// Gastos del mes: [concepto, categoría, monto, día de pago (del mes), método, cubre ("mes" | "bimestre" | null), notas]
export const GASTOS = [
  ["Renta del local", "renta", 18000, 2, "transferencia", "mes"],
  ["Luz (bimestre)", "luz", 3460, 6, "domiciliado", "bimestre"],
  ["Agua", "agua", 680, 8, "transferencia", "mes"],
  ["Gas estacionario", "gas", 1250, 11, "efectivo", "mes"],
  ["Internet y teléfono", "internet_telefono", 699, 5, "domiciliado", "mes"],
  ["Anuncios en redes sociales", "publicidad", 1500, 3, "tarjeta", "mes"],
  ["Mantenimiento de la puerta del patio", "mantenimiento_local", 850, 14, "efectivo", null],
  ["Papelería y tickets", "papeleria", 320, 9, "efectivo", null],
  ["Gasolina de la camioneta", "camioneta", 1400, 12, "tarjeta", null],
];

// Plantillas de contrato del demo: texto propio, con las variables que la app sabe llenar.
export const PLANTILLAS = {
  "Contrato general": {
    titulo: "Contrato de servicios — Patitas & Co.",
    cuerpo: `Contrato de prestación de servicios que celebran Patitas & Co. y {{cliente_nombre}} (teléfono {{cliente_telefono}}), responsable de {{perro_nombre}}, {{perro_raza}}, {{perro_sexo}}, talla {{perro_tamano}}.

1. Servicios. Patitas & Co. ofrece guardería, hotel y estética. El horario de guardería es {{horario_guarderia}}.

2. Salud. El responsable declara que el perro tiene sus vacunas y desparasitación al día y se compromete a mantenerlas vigentes. Sin comprobantes vigentes no se recibe al perro en guardería ni en hotel.

3. Emergencias. Si el perro necesita atención médica, se avisará de inmediato a {{contacto_emergencia}}. Autorización médica: {{autorizacion_medica_notas}}. Tope de gasto autorizado sin consultar: {{tope_gasto_autorizado}}.

4. Imagen. Consentimiento para publicar fotos del perro: {{consentimiento_imagen}}.

5. Observaciones de ingreso: {{observaciones_ingreso}}.

Este es un contrato de DEMOSTRACIÓN de PeluDesk: el negocio y las personas son ficticios.

Fecha de firma: {{fecha_firma}}.`,
  },
  "Contrato de hotel": {
    titulo: "Anexo de hotel — Patitas & Co.",
    cuerpo: `Anexo de hotel para {{perro_nombre}} ({{perro_raza}}), responsable {{cliente_nombre}}.

1. El hotel recibe y entrega perros en el horario del negocio: {{horario_guarderia}}.

2. El responsable entrega la comida del perro para toda la estancia, marcada con su nombre.

3. Si nadie recoge al perro en la fecha acordada, la estancia continúa por noche de hotel y se cobra a la tarifa vigente.

Contrato de DEMOSTRACIÓN de PeluDesk: el negocio y las personas son ficticios.

Fecha de firma: {{fecha_firma}}.`,
  },
  "Contrato de guardería": {
    titulo: "Paquete de guardería — Patitas & Co.",
    cuerpo: `{{cliente_nombre}} compra para {{perro_nombre}} el paquete {{paquete_guarderia}}, vigente del {{vigencia_inicio}} al {{vigencia_fin}}.

1. Los pases solo los usa {{perro_nombre}}; no se transfieren a otro perro.

2. Los pases que no se usen dentro de la vigencia se pierden.

Contrato de DEMOSTRACIÓN de PeluDesk: el negocio y las personas son ficticios.

Fecha de firma: {{fecha_firma}}.`,
  },
};

// Tipo de pelo por raza (el resto, corto).
export const PELAJE = {
  "Golden retriever": "largo", Samoyedo: "largo", Pomerania: "largo", "Shih tzu": "largo",
  "Husky siberiano": "medio", "Border collie": "medio", "West highland white terrier": "medio",
  "Schnauzer miniatura": "rizado", "Schnauzer mediano": "rizado",
};
