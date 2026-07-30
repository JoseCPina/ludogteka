import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { PlantillaEditor } from "./plantilla-editor";

export default async function ContratosPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: plantilla, error } = await supabase
    .from("plantillas_contrato")
    .select("version, titulo, cuerpo")
    .eq("activa", true)
    .maybeSingle();

  const { data: historial } = await supabase
    .from("plantillas_contrato")
    .select("id, version, titulo, requiere_refirma")
    .order("version", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Contratos</h1>
        <p className="mt-1 text-n-600">Plantilla vigente y contratos generados.</p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la plantilla">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <PlantillaEditor
          version={plantilla?.version ?? null}
          titulo={plantilla?.titulo ?? null}
          cuerpo={plantilla?.cuerpo ?? null}
          esAdmin={sesion?.rol === "admin"}
          historial={historial ?? []}
        />
      )}
    </div>
  );
}
