import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FormularioTicket } from "./formulario-ticket";

// Crear un ticket, desde Ayuda, desde un artículo o desde el asistente
// (con la conversación: su primera pregunta y lo que contestó).
export default async function NuevoTicket({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; conversacion?: string; asunto?: string; sin?: string }>;
}) {
  const { desde, conversacion, asunto, sin } = await searchParams;
  const pantalla = desde && desde.startsWith("/") ? desde.slice(0, 200) : null;
  let conversacionId: string | null = null;
  let descripcion = "";
  if (conversacion && /^[0-9a-f-]{36}$/i.test(conversacion)) {
    const supabase = await createSupabaseServerClient();
    // Solo la propia: la RLS no deja leer la de otra persona.
    const { data } = await supabase
      .from("soporte_mensajes_asistente")
      .select("quien, texto")
      .eq("conversacion_id", conversacion)
      .order("created_at");
    if (data?.length) {
      conversacionId = conversacion;
      const preguntas = data.filter((m) => m.quien === "persona").map((m) => m.texto as string);
      descripcion = preguntas.join("\n");
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/ayuda" className="text-sm font-semibold text-morado hover:underline">
          ← Ayuda
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Crear ticket</h1>
        <p className="mt-1 text-n-600">Te contesta alguien de PeluDesk. Ves la respuesta aquí en Ayuda{" "}y, si eres admin, también por WhatsApp.</p>
      </div>
      <FormularioTicket
        asuntoInicial={(asunto ?? "").slice(0, 150)}
        descripcionInicial={descripcion}
        pantalla={pantalla}
        conversacionId={conversacionId}
        sinDocumentar={sin === "1"}
      />
    </div>
  );
}
