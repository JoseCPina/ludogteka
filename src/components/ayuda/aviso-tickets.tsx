import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Enlace } from "@/components/ui/enlace";

// El aviso de arriba cuando PeluDesk contestó un ticket tuyo y no lo has
// visto (se apaga al abrir el ticket).
export async function AvisoTickets() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("mis_tickets_con_respuesta");
  const lista = (data ?? []) as { id: string; numero: number; asunto: string }[];
  if (!lista.length) return null;
  const t = lista[0];
  return (
    <div className="border-b border-morado bg-morado-suave px-4 py-2 text-sm text-n-900 md:px-6" role="status" data-aviso-ticket>
      {lista.length === 1 ? (
        <>
          PeluDesk contestó tu ticket #{t.numero} «{t.asunto}».{" "}
          <Enlace href={`/ayuda/tickets/${t.id}`} enTexto>
            Ver la respuesta
          </Enlace>
        </>
      ) : (
        <>
          PeluDesk contestó {lista.length} tickets tuyos.{" "}
          <Enlace href="/ayuda" enTexto>
            Verlos en Ayuda
          </Enlace>
        </>
      )}
    </div>
  );
}
