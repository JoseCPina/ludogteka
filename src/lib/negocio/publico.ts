/**
 * Lo público del negocio (logo y fotos de su página web) vive en el bucket
 * `negocios-publico`, de lectura pública, bajo `{negocio_id}/…`. Lo sube el
 * servidor con la secret key después de comprobar el permiso
 * (src/app/(staff)/admin/perfil/actions.ts).
 */
export const BUCKET_PUBLICO = "negocios-publico";

export function urlPublicaArchivo(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PUBLICO}/${path}`;
}
