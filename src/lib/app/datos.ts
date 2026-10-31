import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlDelNegocio } from "@/lib/negocio/actual";

/**
 * Lo que la app para dueños lee de la base (docs/app-duenos/PLAN.md). Sus mascotas, directo (RLS: las suyas); en qué
 * negocios están y sus negocios, por las funciones de identidad (app_mis_vinculos, app_mis_negocios). Nunca dinero.
 */
export type Vinculo = { negocioId: string; negocioNombre: string; negocioSlug: string; negocioDominio: string | null; negocioUrl: string | null; perroId: string; perroFotoPath: string | null; perroRaza: string | null; portalUrl: string };
export type Mascota = {
  id: string;
  nombre: string;
  especie: "perro" | "gato" | "otro";
  especieDetalle: string | null;
  sexo: "macho" | "hembra" | null;
  fechaNacimiento: string | null;
  esterilizado: boolean | null;
  razaTexto: string | null;
  microchip: string | null;
  fotoPath: string | null;
  fallecido: boolean;
  fechaFallecimiento: string | null;
  origen: "app" | "negocio" | "qr";
  vinculos: Vinculo[];
  fotoUrl: string | null;
};
export type Negocio = { id: string; slug: string; nombre: string; dominio: string | null; urlPublica: string | null; ciudad: string | null; rol: string; url: string };
export type Aviso = { id: string; tipo: string; titulo: string; cuerpo: string; url: string | null; leidoAt: string | null; createdAt: string; mascotaId: string | null };

type FilaMascota = Record<string, unknown>;
type FilaVinculo = { mascota_id: string; negocio_id: string; negocio_nombre: string; negocio_slug: string; negocio_dominio: string | null; negocio_url_publica: string | null; perro_id: string; perro_foto_path: string | null; perro_raza: string | null };

const portalDe = (v: FilaVinculo) => `${urlDelNegocio({ slug: v.negocio_slug, dominio: v.negocio_dominio, url_publica: v.negocio_url_publica })}/portal/perros/${v.perro_id}`;

export async function misMascotas(): Promise<Mascota[]> {
  const supabase = await createSupabaseServerClient("portal");
  const [{ data: filas }, { data: vinculos }] = await Promise.all([
    supabase.from("mascotas").select("id, nombre, especie, especie_detalle, sexo, fecha_nacimiento, esterilizado, raza_texto, microchip, foto_path, fallecido, fecha_fallecimiento, origen").is("deleted_at", null).order("fallecido").order("nombre").order("id"),
    supabase.rpc("app_mis_vinculos"),
  ]);
  const porMascota = new Map<string, FilaVinculo[]>();
  for (const v of ((vinculos ?? []) as FilaVinculo[])) porMascota.set(v.mascota_id, [...(porMascota.get(v.mascota_id) ?? []), v]);
  const mascotas = ((filas ?? []) as FilaMascota[]).map((f) => armar(f, porMascota.get(f.id as string) ?? []));
  await Promise.all(mascotas.map(async (m) => { m.fotoUrl = await fotoDeMascota(m); }));
  return mascotas;
}

export async function miMascota(id: string): Promise<Mascota | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const supabase = await createSupabaseServerClient("portal");
  const [{ data: f }, { data: vinculos }] = await Promise.all([
    supabase.from("mascotas").select("id, nombre, especie, especie_detalle, sexo, fecha_nacimiento, esterilizado, raza_texto, microchip, foto_path, fallecido, fecha_fallecimiento, origen").eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.rpc("app_mis_vinculos"),
  ]);
  if (!f) return null;
  const m = armar(f as FilaMascota, ((vinculos ?? []) as FilaVinculo[]).filter((v) => v.mascota_id === id));
  m.fotoUrl = await fotoDeMascota(m);
  return m;
}

function armar(f: FilaMascota, vs: FilaVinculo[]): Mascota {
  return {
    id: f.id as string,
    nombre: f.nombre as string,
    especie: (f.especie as Mascota["especie"]) ?? "perro",
    especieDetalle: (f.especie_detalle as string | null) ?? null,
    sexo: (f.sexo as Mascota["sexo"]) ?? null,
    fechaNacimiento: (f.fecha_nacimiento as string | null) ?? null,
    esterilizado: (f.esterilizado as boolean | null) ?? null,
    razaTexto: (f.raza_texto as string | null) ?? vs.find((v) => v.perro_raza)?.perro_raza ?? null,
    microchip: (f.microchip as string | null) ?? null,
    fotoPath: (f.foto_path as string | null) ?? null,
    fallecido: Boolean(f.fallecido),
    fechaFallecimiento: (f.fecha_fallecimiento as string | null) ?? null,
    origen: (f.origen as Mascota["origen"]) ?? "app",
    vinculos: vs.map((v) => ({
      negocioId: v.negocio_id, negocioNombre: v.negocio_nombre, negocioSlug: v.negocio_slug, negocioDominio: v.negocio_dominio, negocioUrl: v.negocio_url_publica,
      perroId: v.perro_id, perroFotoPath: v.perro_foto_path, perroRaza: v.perro_raza, portalUrl: portalDe(v),
    })),
    fotoUrl: null,
  };
}

/**
 * La foto: la propia de la app (bucket app-mascotas, Fase 1) o la del expediente de un negocio (perros-archivos, firmada
 * con la llave del servidor acotada a ESE negocio; el vínculo ya dice que es del dueño).
 */
async function fotoDeMascota(m: Mascota): Promise<string | null> {
  try {
    if (m.fotoPath) {
      const { data } = await createSupabaseAdminClient().storage.from("app-mascotas").createSignedUrl(m.fotoPath, 3600);
      if (data?.signedUrl) return data.signedUrl;
    }
    const v = m.vinculos.find((x) => x.perroFotoPath);
    if (!v?.perroFotoPath) return null;
    const { data } = await createSupabaseAdminClient(v.negocioId).storage.from("perros-archivos").createSignedUrl(v.perroFotoPath, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function misNegocios(): Promise<Negocio[]> {
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.rpc("app_mis_negocios");
  return ((data ?? []) as { id: string; slug: string; nombre: string; dominio: string | null; url_publica: string | null; ciudad: string | null; rol: string }[])
    .filter((n) => n.rol === "cliente")
    .map((n) => ({ id: n.id, slug: n.slug, nombre: n.nombre, dominio: n.dominio, urlPublica: n.url_publica, ciudad: n.ciudad, rol: n.rol, url: urlDelNegocio({ slug: n.slug, dominio: n.dominio, url_publica: n.url_publica }) }));
}

export async function misAvisos(): Promise<Aviso[]> {
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.from("app_avisos").select("id, tipo, titulo, cuerpo, url, leido_at, created_at, mascota_id").is("deleted_at", null).order("created_at", { ascending: false }).order("id").limit(100);
  return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
    id: a.id as string, tipo: a.tipo as string, titulo: a.titulo as string, cuerpo: a.cuerpo as string, url: (a.url as string | null) ?? null,
    leidoAt: (a.leido_at as string | null) ?? null, createdAt: a.created_at as string, mascotaId: (a.mascota_id as string | null) ?? null,
  }));
}

/** «3 años», «8 meses», «2 semanas» a partir de la fecha de nacimiento (AAAA-MM-DD), en la zona del celular. */
export function edadTexto(fechaNacimiento: string | null, hoy = new Date()): string | null {
  if (!fechaNacimiento) return null;
  const [a, m, d] = fechaNacimiento.split("-").map(Number);
  if (!a || !m || !d) return null;
  const nac = new Date(a, m - 1, d);
  const dias = Math.floor((hoy.getTime() - nac.getTime()) / 86_400_000);
  if (dias < 0) return null;
  if (dias < 60) return dias < 14 ? `${dias} ${dias === 1 ? "día" : "días"}` : `${Math.floor(dias / 7)} semanas`;
  let meses = (hoy.getFullYear() - a) * 12 + (hoy.getMonth() + 1 - m);
  if (hoy.getDate() < d) meses -= 1;
  if (meses < 24) return `${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(meses / 12);
  return `${anios} ${anios === 1 ? "año" : "años"}`;
}

export const nombreEspecie = (m: Pick<Mascota, "especie" | "especieDetalle" | "sexo">): string => {
  if (m.especie === "perro") return m.sexo === "hembra" ? "Perra" : "Perro";
  if (m.especie === "gato") return m.sexo === "hembra" ? "Gata" : "Gato";
  return m.especieDetalle?.trim() || "Mascota";
};
