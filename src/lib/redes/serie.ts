/**
 * La serie de videos de PeluDesk en redes: qué sale, dónde, cuándo y con qué
 * pie. Es CONFIGURACIÓN de la marca (el calendario de scripts/videos/SERIE.md);
 * el código que publica no sabe nada de esto. «Cargar el calendario» en
 * /plataforma/redes agrega lo que falte (plataforma_redes_programar) y nunca
 * toca lo que ya salió ni una fecha reprogramada; el pie sí se corrige
 * mientras no haya salido.
 *
 * Pies: con el tono de la landing (de tú, de quien conoce el día a día), sin
 * cifras ni testimonios inventados, con peludesk.mx y los 15 días gratis, y
 * a lo más 3 hashtags. En Instagram un link no es pulsable (se queda como
 * texto): se escribe peludesk.mx igual. TikTok no lleva pie por la API (el
 * video llega al buzón): el aviso de Telegram lo trae para copiarlo.
 */

export type Red = "facebook" | "instagram" | "tiktok";
export type Formato = "reel" | "muro" | "borrador" | "imagen";

export const HORA_PUBLICACION = "13:00"; // hora de la Ciudad de México
const ZONA = "-06:00"; // México no cambia de horario desde 2022

type Entrada = {
  video: string;
  titulo: string;
  fecha: string; // AAAA-MM-DD
  hora?: string; // HH:MM de la Ciudad de México; si falta, HORA_PUBLICACION
  redes: { red: Red; formato: Formato }[];
  texto: string; // el cuerpo del pie, igual en todas las redes
  hashtags: string[];
};

const REEL_IG = { red: "instagram", formato: "reel" } as const;
const TIKTOK = { red: "tiktok", formato: "borrador" } as const;
const REEL_FB = { red: "facebook", formato: "reel" } as const;
const MURO_FB = { red: "facebook", formato: "muro" } as const;
const IMG_IG = { red: "instagram", formato: "imagen" } as const;
const IMG_FB = { red: "facebook", formato: "imagen" } as const;

export const SERIE: Entrada[] = [
  {
    video: "un-dia-en-tu-guarderia",
    titulo: "Un día en tu guardería",
    fecha: "2026-09-30",
    hora: "13:40",
    redes: [MURO_FB, REEL_IG],
    texto: "La libreta, los chats sin contestar y el cupo en la cabeza. Así empiezan muchas mañanas en una guardería.\n\nCon PeluDesk la agenda de estética, el cupo de hotel y guardería, las vacunas y la caja están en un solo lugar, y el dueño ve lo de su perro desde su celular.\n\nPruébalo 15 días gratis, sin tarjeta: peludesk.mx",
    hashtags: ["#guarderiacanina", "#hotelcanino", "#esteticacanina"],
  },
  {
    video: "ese-perro-no-esta-vacunado",
    titulo: "Ese perro no está vacunado",
    fecha: "2026-09-30",
    hora: "13:20",
    redes: [REEL_IG, TIKTOK, REEL_FB],
    texto: "¿Te enteraste de la vacuna vencida cuando el perro ya estaba adentro?\n\nEn PeluDesk, si a un perro se le venció una vacuna, no te deja reservarle guardería ni hotel, y te dice cuál le falta.\n\n15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#hotelcanino", "#vacunasperros"],
  },
  {
    video: "corte-de-caja",
    titulo: "Tu corte de caja, sin sorpresas",
    fecha: "2026-09-30",
    hora: "13:00",
    redes: [REEL_IG, TIKTOK, MURO_FB],
    texto: "¿Cierras el día y la caja no te cuadra?\n\nCobras con terminal, la propina se anota aparte, y al cerrar el corte te dice si cuadró, método por método.\n\nPruébalo 15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#esteticacanina", "#negociocanino"],
  },
  {
    video: "adios-a-la-impresora",
    titulo: "Adiós a la impresora",
    fecha: "2026-10-09",
    redes: [REEL_IG, TIKTOK, REEL_FB],
    texto: "¿Todavía imprimes cada contrato y esperas a que vengan a firmarlo?\n\nPeluDesk te dice qué contratos faltan y desde cuándo. El dueño lo firma con el dedo desde su celular y queda guardado en su portal.\n\n15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#hotelcanino", "#negociocanino"],
  },
  {
    video: "cada-raza-su-precio",
    titulo: "Cada raza, su precio",
    fecha: "2026-10-12",
    redes: [REEL_IG, TIKTOK, REEL_FB],
    texto: "¿Cuánto cobras por bañar a un husky? ¿Y a un poodle?\n\nLe pones precio a cada grupo de raza, y otro por si llega con el pelo maltratado. La cita toma sola el precio que le toca.\n\nPruébalo 15 días gratis en peludesk.mx",
    hashtags: ["#esteticacanina", "#groomer", "#negociocanino"],
  },
  {
    video: "tu-cliente-lo-ve-en-su-celular",
    titulo: "Tu cliente ve todo desde su celular",
    fecha: "2026-10-14",
    redes: [REEL_IG, TIKTOK, MURO_FB],
    texto: "¿Otra vez te preguntan por WhatsApp a qué hora es su baño?\n\nTu cliente entra desde su celular y ve sus próximas citas, sus reservas, sus vacunas y sus contratos. Tus precios y tus otros clientes, nunca.\n\n15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#esteticacanina", "#hotelcanino"],
  },
  {
    video: "cuanto-ganaste-de-verdad",
    titulo: "¿Cuánto ganaste de verdad?",
    fecha: "2026-10-16",
    redes: [REEL_IG, MURO_FB, TIKTOK],
    texto: "Vendiste bien este mes. ¿Pero cuánto ganaste de verdad?\n\nPeluDesk le resta a lo que cobraste los insumos, la nómina y los gastos del local, y te lo compara con el mes anterior. Sin sumar a mano.\n\nPruébalo 15 días gratis en peludesk.mx",
    hashtags: ["#negociocanino", "#guarderiacanina", "#emprendedores"],
  },
  {
    video: "tu-pagina-web-gratis",
    titulo: "Tu página web, gratis",
    fecha: "2026-10-19",
    redes: [REEL_IG, TIKTOK, REEL_FB],
    texto: "¿Tu negocio todavía no tiene página web?\n\nEn tu prueba, completa tu perfil la primera semana: logo, tres fotos, horario, dirección y un precio. Tu página queda gratis de por vida.\n\nEmpieza tus 15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#esteticacanina", "#paginaweb"],
  },
  // ── Tríptico «¿Eres dueña o dueño…?»: dos imágenes de la cuadrícula y el video con tomas de IA, con 3 minutos entre cada una ──
  {
    video: "2-de-cada-3",
    titulo: "2 de cada 3 negocios cierran antes de los 5 años (imagen)",
    fecha: "2026-09-30",
    hora: "23:42",
    redes: [IMG_IG, IMG_FB],
    texto: "Cerca de 2 de cada 3 negocios en México cierran antes de los 5 años (INEGI).\n\nLlevar la agenda, las vacunas y la caja en libreta y chats pesa más de lo que parece. En PeluDesk lo ves todo en un solo lugar. Pruébalo 15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#esteticacanina", "#emprendedoresmx"],
  },
  {
    video: "eres-duena-o-dueno",
    titulo: "¿Eres dueña o dueño de un negocio canino?",
    fecha: "2026-09-30",
    hora: "23:45",
    redes: [REEL_IG, REEL_FB, TIKTOK],
    texto: "¿Eres dueña o dueño de un negocio canino?\n\nSegún el INEGI, más de la mitad de los negocios en México cierra antes de cumplir 2 años. Una de las causas que más se repiten: administrar mal el negocio.\n\nCon PeluDesk ves tu agenda, cuidas las vacunas y cuadras la caja, sin libreta. Pruébalo 15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#esteticacanina", "#emprendedoresmx"],
  },
  {
    video: "52-de-cada-100",
    titulo: "52 de cada 100 negocios cierran antes de cumplir 2 años (imagen)",
    fecha: "2026-09-30",
    hora: "23:48",
    redes: [IMG_IG, IMG_FB],
    texto: "52 de cada 100 negocios en México cierran antes de cumplir 2 años (INEGI).\n\nTener las cuentas claras ayuda. PeluDesk junta tu agenda, tus vacunas y tu caja, sin libreta. 15 días gratis en peludesk.mx",
    hashtags: ["#guarderiacanina", "#esteticacanina", "#emprendedoresmx"],
  },
];

export function archivoDe(video: string, formato: Formato): string {
  if (formato === "imagen") return `${video}.jpg`; // public/peludesk/redes/imagenes/
  return formato === "muro" ? `${video}-16x9.mp4` : `${video}-9x16-subtitulos.mp4`;
}

export function pieDe(e: Entrada, red: Red): string {
  const tags = e.hashtags.slice(0, 3).join(" ");
  // En TikTok (se pega a mano al publicar el borrador) va más corto.
  if (red === "tiktok") return `${e.texto.split("\n\n")[0]} 15 días gratis en peludesk.mx ${tags}`;
  return `${e.texto}\n\n${tags}`;
}

export function filasDeLaSerie() {
  return SERIE.flatMap((e) =>
    e.redes.map((r) => ({
      video: e.video,
      red: r.red,
      formato: r.formato,
      archivo: archivoDe(e.video, r.formato),
      programada_at: `${e.fecha}T${e.hora ?? HORA_PUBLICACION}:00${ZONA}`,
      pie: pieDe(e, r.red),
    })),
  );
}

/**
 * Lo que falta de un video en una red (o en todas): lo usa «Agregar a otra
 * red». El formato de esa red sale del video si ya lo tenía; si no, Reels en
 * Facebook. Si la fecha del calendario ya pasó, sale en la siguiente corrida
 * de la tarea (ahora), no en una fecha vieja.
 */
export function filasDeUnVideo(video: string, red: Red | "todas", ahora = new Date()) {
  const e = SERIE.find((x) => x.video === video);
  if (!e) return [];
  const redes: Red[] = red === "todas" ? ["facebook", "instagram", "tiktok"] : [red];
  return redes.map((r) => {
    const formato: Formato = e.redes.find((x) => x.red === r)?.formato ?? (r === "tiktok" ? "borrador" : "reel");
    const fecha = new Date(`${e.fecha}T${e.hora ?? HORA_PUBLICACION}:00${ZONA}`);
    return { video: e.video, red: r, formato, archivo: archivoDe(e.video, formato), programada_at: (fecha > ahora ? fecha : ahora).toISOString(), pie: pieDe(e, r) };
  });
}

export const TITULOS: Record<string, string> = Object.fromEntries(SERIE.map((e) => [e.video, e.titulo]));

/** La URL pública del video (Meta la descarga; TikTok la lee nuestro servidor). */
export function urlVideo(archivo: string, formato?: string): string {
  const base = (process.env.PELUDESK_VIDEOS_URL?.trim() || "https://peludesk.mx").replace(/\/$/, "");
  return `${base}/peludesk/redes/${formato === "imagen" ? "imagenes" : "videos"}/${archivo}`;
}

/** La portada pública de un video (la misma imagen que el reel lleva como cover): `<video>-9x16.jpg` o `<video>-16x9.jpg`. */
export function urlPortada(archivo: string): string {
  return urlVideo(archivo.replace(/(-subtitulos)?.mp4$/, ".jpg"));
}
