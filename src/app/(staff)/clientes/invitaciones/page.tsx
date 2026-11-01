import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { esTipoLinkAlta, tiposDisponibles, type TipoLinkAlta } from "@/lib/alta/tipos-link";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { InvitacionesPanel, type InvitacionFila } from "./invitaciones-panel";
import { leerTodo } from "@/lib/supabase/paginar";
import { Enlace } from "@/components/ui/enlace";

// El tipo puede venir en la URL: es como los botones de "Nuevo cliente"
// de Guardería, Hotel y Estética llegan aquí con el flujo correcto ya
// escogido, en vez de dejar que recepción lo seleccione a mano cada vez
// (y lo escoja mal cuando anda con prisa).
export default async function InvitacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  // Solo los servicios que el negocio tiene prendidos (una veterinaria sin hotel ni estética no ve «Guardería y hotel»).
  const sesion = await obtenerSesionConRol();
  const tipos = tiposDisponibles(sesion?.modulos ?? []);
  const tipoInicial: TipoLinkAlta = tipo && esTipoLinkAlta(tipo) && tipos.includes(tipo) ? tipo : (tipos[0] ?? "guarderia_hotel");

  const supabase = await createSupabaseServerClient();
  // Todas las invitaciones de la historia del negocio: pasan de 1,000 con el tiempo.
  const { data, error } = await leerTodo<Record<string, unknown>>(() =>
    supabase
      .from("invitaciones_cliente_estado")
      .select(
        "id, nombre_referencia, telefono, tipo, es_complemento, expira_at, alta_completada_at, usada_at, cancelada_at, cliente_id, cliente_nombre, created_at, estado"
      )
      .order("created_at", { ascending: false })
      .order("id")
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Enlace href="/clientes" className="text-sm">
          ← Clientes
        </Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Altas por link</h1>
        <p className="mt-1 text-n-600">
          Links mandados, cuáles se usaron y cuáles siguen esperando.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar las invitaciones">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <InvitacionesPanel
          invitaciones={(data as InvitacionFila[]) ?? []}
          tipoInicial={tipoInicial}
          tipos={tipos}
        />
      )}
    </div>
  );
}
