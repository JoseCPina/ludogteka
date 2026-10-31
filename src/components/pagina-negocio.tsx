import { negocioActual } from "@/lib/negocio/actual";
import { urlPublicaArchivo } from "@/lib/negocio/publico";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PaginaWeb, type FotoWeb } from "@/components/web-negocio/pagina-web";
import { giroPrincipal, type GiroWeb } from "@/lib/web-negocio/tema";
import { type ServicioWeb } from "@/lib/web-negocio/catalogo";
import { type HorarioSemana } from "@/lib/web-negocio/horario";
import { colorDeFoto, fotoChica } from "@/lib/web-negocio/color";
import { creditoFoto, hoyEn, lugarDeGoogle, resenasDestacadas } from "@/lib/web-negocio/google";
import { descripcionDe } from "@/lib/web-negocio/desde-prospecto";
import type { LugarParaPagina } from "@/lib/prospectos/places";
import { cerrarFrase } from "@/lib/texto/frases";

export type DatosPagina = {
  nombre: string;
  ciudad: string | null;
  zona?: string | null;
  descripcion: string | null;
  direccion: string | null;
  logo_path: string | null;
  tema?: GiroWeb | null;
  color?: string | null;
  google_place_id?: string | null;
  modulos?: string[] | null;
  fotos: string[];
  whatsapp: string | null;
  horario: string | null;
  horario_semana?: { dia: number; abre: string; cierra: string }[] | null;
  servicios: {
    clave?: string;
    categoria: string;
    nombre: string;
    unidad: string;
    duracion?: number | null;
    incluye: string[] | null;
    no_incluye: string | null;
    precios: { etiqueta: string | null; precio: number }[] | null;
  }[];
};

const GIROS: GiroWeb[] = ["veterinaria", "estetica", "guarderia", "hotel"];
const POR_UNIDAD: Record<string, string> = { hora: "la hora", noche: "la noche", dia: "el día" };

/** Los servicios del negocio (pagina_publica) como se ofrecen en su página: con su precio y cómo se piden. */
function catalogoDelNegocio(servicios: DatosPagina["servicios"]): ServicioWeb[] {
  return servicios
    .filter((s): s is DatosPagina["servicios"][number] & { categoria: GiroWeb } => GIROS.includes(s.categoria as GiroWeb))
    .map((s, i) => {
      const precios = (s.precios ?? []).map((p) => Number(p.precio)).filter((n) => n > 0);
      const varios = new Set(precios).size > 1;
      return {
        clave: s.clave ?? `servicio-${i}`,
        categoria: s.categoria,
        nombre: s.nombre,
        descripcion: s.incluye?.length ? cerrarFrase(`Incluye ${s.incluye.join(", ")}`) : null,
        modo: s.categoria === "hotel" ? "noches" : s.categoria === "guarderia" ? "dia" : "cita",
        duracionMin: s.duracion ?? (s.categoria === "veterinaria" ? 30 : 60),
        precio: precios.length ? Math.min(...precios) : null,
        unidad: varios ? "desde" : (POR_UNIDAD[s.unidad] ?? null),
      } satisfies ServicioWeb;
    });
}

/**
 * La página web de un negocio de PeluDesk (módulo «Página web»), con el diseño de su giro: su perfil (logo, fotos,
 * descripción, dirección), su horario, sus servicios con sus precios vigentes (pagina_publica()) y pedir cita en
 * línea, que abre WhatsApp con la solicitud al negocio. Mientras no suba fotos propias y tenga su lugar de Google
 * (viene de su vista previa), se ven sus fotos y reseñas de Google, pedidas al mostrarla y con tope al mes.
 */
export async function PaginaNegocio({ datos }: { datos: DatosPagina }) {
  const negocio = await negocioActual();
  const zona = datos.zona || negocio.zona_horaria || "America/Mexico_City";
  const propias = datos.fotos.map((p) => urlPublicaArchivo(p)).filter((u): u is string => Boolean(u));

  let g: LugarParaPagina | null = null;
  if (datos.google_place_id && propias.length === 0) {
    const { data: cuota } = await createSupabaseAdminClient(negocio.id).rpc("maps_reservar_consulta", { p_tipo: "pagina" });
    if ((cuota as { permitida?: boolean } | null)?.permitida) g = await lugarDeGoogle(datos.google_place_id, { fotos: 5, anchoFoto: 1000 });
  }

  const fotos: FotoWeb[] = propias.length ? propias.map((url) => ({ url })) : (g?.fotos ?? []).map((f) => ({ url: f.uri, credito: creditoFoto(f) }));
  const catalogo = catalogoDelNegocio(datos.servicios);
  const activos = (datos.modulos ?? []).filter((m): m is GiroWeb => GIROS.includes(m as GiroWeb));
  const servicios = activos.length ? activos : [...new Set(catalogo.map((s) => s.categoria))];
  const giro = datos.tema && GIROS.includes(datos.tema) ? datos.tema : giroPrincipal(servicios, null);
  const color = datos.color ?? (await colorDeFoto(fotoChica(fotos[0]?.url), 1500));
  const horario: HorarioSemana | null = datos.horario_semana?.length
    ? Array.from({ length: 7 }, (_, d) => {
        const f = datos.horario_semana!.find((x) => x.dia === d);
        return f ? { abre: f.abre, cierra: f.cierra } : null;
      })
    : null;
  const telefono = (datos.whatsapp ?? "").replace(/\D/g, "").slice(-10);
  // Reclamó su ficha del directorio de peludesk.mx y comprobó su WhatsApp: la página enseña «Negocio verificado».
  const { data: perfil } = await createSupabaseAdminClient(negocio.id).from("negocio_perfil").select("verificado_at").eq("negocio_id", negocio.id).is("deleted_at", null).maybeSingle();

  return (
    <PaginaWeb
      modo="real"
      datos={{
        verificado: Boolean(perfil?.verificado_at),
        nombre: datos.nombre,
        ciudad: datos.ciudad,
        direccion: datos.direccion ?? g?.direccion ?? null,
        telefono: telefono.length === 10 ? telefono : null,
        descripcion: datos.descripcion ?? descripcionDe(giro, servicios.length ? servicios : [giro], datos.ciudad),
        giro,
        servicios: servicios.length ? servicios : [giro],
        catalogo,
        preciosDeEjemplo: false,
        horario,
        calificacion: g?.calificacion ?? null,
        totalResenas: g?.resenas ?? null,
        resenas: resenasDestacadas(g),
        fotos,
        logoUrl: datos.logo_path ? urlPublicaArchivo(datos.logo_path) : null,
        color,
        mapsUri: g?.mapsUri ?? null,
        zona,
        deGoogle: Boolean(g),
        hoy: hoyEn(zona),
      }}
    />
  );
}
