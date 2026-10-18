import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prospectoPorSlug, serviciosDe } from "@/lib/prospectos/pagina";
import { colorDeFoto, fotoChica } from "./color";
import { descripcionDe } from "./desde-prospecto";
import { lugarDeGoogle } from "./google";
import { horarioDeGoogle } from "./horario";
import { giroPrincipal, type GiroWeb } from "./tema";

/**
 * Al registrarse desde su vista previa (peludesk.mx/para/<slug>), su página queda publicada en su subdominio con
 * lo que vio: el diseño de su giro y su color, su dirección, su horario de Google (lo puede cambiar en /admin), su
 * WhatsApp como el de recepción y el lugar de Google (las fotos y reseñas se piden al mostrar la página mientras
 * no suba las suyas). Corre con la secret key del negocio recién creado y nunca detiene el registro: si algo
 * falla, la página sale con lo que haya y el negocio la completa en su perfil.
 */
export async function publicarPaginaDeProspecto(negocioId: string, slug: string): Promise<void> {
  try {
    const p = await prospectoPorSlug(slug);
    if (!p) return;
    const admin = createSupabaseAdminClient(negocioId);
    const servicios = serviciosDe(p).filter((s): s is GiroWeb => ["veterinaria", "estetica", "guarderia", "hotel"].includes(s));
    const giro = giroPrincipal(servicios, p.giro);
    const g = await lugarDeGoogle(p.google_place_id, { fotos: 1, anchoFoto: 400 });
    const color = await colorDeFoto(fotoChica(g?.fotos[0]?.uri));

    const { data: perfil } = await admin.from("negocio_perfil").select("id, descripcion, direccion").eq("negocio_id", negocioId).is("deleted_at", null).maybeSingle();
    const fila = {
      descripcion: perfil?.descripcion ?? descripcionDe(giro, servicios.length ? servicios : [giro], p.ciudad),
      direccion: perfil?.direccion ?? p.direccion ?? g?.direccion ?? null,
      google_place_id: p.google_place_id,
      tema_web: giro,
      color_web: color,
    };
    const { error: ePerfil } = perfil
      ? await admin.from("negocio_perfil").update(fila).eq("id", perfil.id).eq("negocio_id", negocioId)
      : await admin.from("negocio_perfil").insert({ negocio_id: negocioId, ...fila });
    if (ePerfil) console.error("[publicar] perfil", ePerfil.message);

    const { data: cc } = await admin
      .from("cupo_configuracion")
      .select("id, telefono_recepcion")
      .eq("negocio_id", negocioId)
      .is("deleted_at", null)
      .order("vigencia_desde", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cc) return;
    if (p.telefono_norm && !cc.telefono_recepcion) {
      const { error } = await admin.from("cupo_configuracion").update({ telefono_recepcion: p.telefono_norm }).eq("id", cc.id).eq("negocio_id", negocioId);
      if (error) console.error("[publicar] teléfono", error.message);
    }

    const horario = horarioDeGoogle(g?.periodos);
    if (!horario) return;
    const { data: dias } = await admin.from("horario_semana").select("id, dia_semana").eq("negocio_id", negocioId).eq("cupo_configuracion_id", cc.id).is("deleted_at", null);
    for (let d = 0; d < 7; d++) {
      const h = horario[d];
      const valores = { hora_apertura: h?.abre ?? null, hora_cierre: h?.cierra ?? null };
      const existe = (dias ?? []).find((x) => x.dia_semana === d);
      const { error } = existe
        ? await admin.from("horario_semana").update(valores).eq("id", existe.id).eq("negocio_id", negocioId)
        : await admin.from("horario_semana").insert({ negocio_id: negocioId, cupo_configuracion_id: cc.id, dia_semana: d, ...valores });
      if (error) console.error("[publicar] horario", d, error.message);
    }
  } catch (e) {
    console.error("[publicar] página del prospecto", e instanceof Error ? e.message : e);
  }
}
