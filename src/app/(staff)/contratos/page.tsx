import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { PlantillasContrato, type TipoContratoVista } from "./plantillas-contrato";
import type { CategoriaServicioContrato } from "./plantilla-actions";

export default async function ContratosPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const [{ data: tipos, error }, { data: versiones }] = await Promise.all([
    supabase
      .from("tipos_contrato")
      .select("id, nombre, categorias_servicio, orden, deleted_at")
      .order("orden")
      .order("nombre"),
    supabase
      .from("plantillas_contrato")
      .select("id, tipo_contrato_id, version, titulo, cuerpo, activa, requiere_refirma")
      .order("version", { ascending: false }),
  ]);

  const versionesPorTipo = new Map<string, TipoContratoVista["versiones"]>();
  for (const v of versiones ?? []) {
    const lista = versionesPorTipo.get(v.tipo_contrato_id) ?? [];
    lista.push({
      id: v.id,
      version: v.version,
      titulo: v.titulo,
      cuerpo: v.cuerpo,
      activa: v.activa,
      requiere_refirma: v.requiere_refirma,
    });
    versionesPorTipo.set(v.tipo_contrato_id, lista);
  }

  const vistas: TipoContratoVista[] = (tipos ?? []).map((t) => ({
    id: t.id,
    nombre: t.nombre,
    categorias: (t.categorias_servicio ?? []) as CategoriaServicioContrato[],
    archivado: t.deleted_at !== null,
    versiones: versionesPorTipo.get(t.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Contratos</h1>
        <p className="mt-1 text-n-600">
          Cada contrato tiene su propio texto y su propio versionado. Al generarle uno a un perro se
          elige cuál se le manda.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los contratos">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <PlantillasContrato
          tipos={vistas.filter((t) => !t.archivado)}
          archivados={vistas.filter((t) => t.archivado)}
          esAdmin={sesion?.rol === "admin"}
        />
      )}
    </div>
  );
}
