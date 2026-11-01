import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { tituloContratoPeluDesk, cuerpoContratoPeluDesk } from "@/lib/contratos/plantilla-peludesk";
import { VolverBienvenida } from "../volver";
import { EditorContrato } from "./editor-contrato";
import { Enlace } from "@/components/ui/enlace";

// «Contrato» (QA S16): la plantilla general de PeluDesk, ya con el nombre del negocio, lista para leer, ajustar y
// publicar con un clic. Publicada, la firma el dueño al dar de alta a su perro.
export default async function ContratoPage() {
  const supabase = await createSupabaseServerClient();
  const negocio = await cargarNegocioLanding();
  const { data: tipos } = await supabase
    .from("tipos_contrato")
    .select("id, nombre, categorias_servicio, se_genera_al, plantillas_contrato(titulo, cuerpo, activa, version)")
    .is("deleted_at", null)
    .eq("se_genera_al", "alta");
  const general = ((tipos ?? []) as { id: string; nombre: string; categorias_servicio: string[] | null; plantillas_contrato: { titulo: string; cuerpo: string; activa: boolean; version: number }[] | null }[]).find(
    (t) => (t.categorias_servicio ?? []).length === 0
  );
  const activa = (general?.plantillas_contrato ?? []).find((p) => p.activa) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <VolverBienvenida />
        <h1 className="mt-1 text-2xl font-bold text-n-900">Contrato</h1>
        <p className="mt-1 text-n-600">
          {activa
            ? `Tu contrato general ya está publicado (versión ${activa.version}). Lo firma el dueño al dar de alta a su perro. Si lo cambias aquí, se publica una versión nueva.`
            : "Te dejamos una plantilla general de PeluDesk para hotel y guardería. Léela, ajusta lo que quieras (cancelaciones, horarios, tu forma de trabajar) y publícala. Lo que va entre llaves dobles lo llena el sistema con los datos del cliente y de su perro."}
        </p>
        <p className="mt-1 text-sm text-n-600">
          Contratos aparte para hotel o para paquetes de guardería se crean en{" "}
          <Enlace href="/contratos" enTexto>
            Contratos
          </Enlace>
          .
        </p>
      </div>
      <EditorContrato
        tituloInicial={activa?.titulo ?? tituloContratoPeluDesk(negocio.nombre)}
        cuerpoInicial={activa?.cuerpo ?? cuerpoContratoPeluDesk(negocio.nombre)}
        publicado={Boolean(activa)}
      />
    </div>
  );
}
