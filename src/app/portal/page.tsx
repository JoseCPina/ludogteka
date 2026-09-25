import Link from "next/link";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { PerroFoto } from "@/app/(staff)/perros/perro-foto";
import { MisDatosForm } from "./mis-datos-form";
import { MisVisitas } from "./mis-visitas";
import { hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";

export default async function PortalPage() {
  const zona = await zonaActual();
  const sesion = await obtenerSesionConRol();
  if (!sesion) return null;

  if (!sesion.clienteId) {
    return (
      <div className="max-w-sm">
        <Alert variante="advertencia" titulo="Tu cuenta aún no está vinculada">
          Todavía no encontramos tu expediente de cliente. Contacta a recepción para que asocien
          tu cuenta.
        </Alert>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: cliente, error } = await supabase
    .from("clientes")
    .select("nombre, telefono, email")
    .eq("id", sesion.clienteId)
    .single();

  if (error || !cliente) {
    return (
      <div className="max-w-sm">
        <Alert variante="error" titulo="No pudimos cargar tu expediente">
          Recarga la página. Si el problema sigue, contacta a recepción.
        </Alert>
      </div>
    );
  }

  // RLS de perros ya combina "míos" + "acceso compartido" — no hace falta
  // filtrar por cliente_id aquí, la política lo hace por nosotros.
  const { data: perros } = await supabase
    .from("perros")
    .select("id, nombre, fallecido, foto_path, cliente_id")
    .is("deleted_at", null)
    .order("nombre");

  // Contratos que el dueño tiene que firmar (el de guardería llega al
  // comprar un paquete): se ven arriba, con liga a la ficha del perro,
  // que es donde se firma.
  const { data: porFirmar } = await supabase
    .from("contratos_por_atender")
    .select("contrato_id, perro_id, perro_nombre, tipo_nombre, paquete_nombre")
    .eq("situacion", "por_firmar")
    .order("created_at");

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);

  const urlsFotos = new Map<string, string>();
  await Promise.all(
    (perros ?? [])
      .filter((p) => p.foto_path)
      .map(async (p) => {
        const { data } = await supabase.storage
          .from("perros-archivos")
          .createSignedUrl(p.foto_path as string, 60 * 60);
        if (data?.signedUrl) urlsFotos.set(p.id, data.signedUrl);
      })
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Hola, {cliente.nombre}</h1>
        <p className="mt-1 text-n-600">Este es tu portal.</p>
      </div>

      {(porFirmar ?? []).length > 0 && (
        <Alert
          variante="advertencia"
          titulo={(porFirmar ?? []).length === 1 ? "Tienes un contrato por firmar" : `Tienes ${(porFirmar ?? []).length} contratos por firmar`}
        >
          <ul className="mt-1 flex flex-col gap-1">
            {(porFirmar ?? []).map((c) => (
              <li key={c.contrato_id}>
                {c.tipo_nombre} de {c.perro_nombre}
                {c.paquete_nombre ? ` (${c.paquete_nombre})` : ""}:{" "}
                <Link href={`/portal/perros/${c.perro_id}`} className="font-semibold text-morado underline">
                  firmarlo
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <MisVisitas supabase={supabase} hoy={hoy} />

      <MisDatosForm nombre={cliente.nombre} telefono={cliente.telefono} email={cliente.email} />

      <div>
        <h2 className="mb-4 text-lg font-bold text-n-900">Tus perros</h2>

        {!perros || perros.length === 0 ? (
          <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center">
            <p className="text-n-600">Todavía no tienes perros registrados con nosotros.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {perros.map((perro) => {
              const esPropio = perro.cliente_id === sesion.clienteId;
              return (
                <li key={perro.id}>
                  <Link
                    href={`/portal/perros/${perro.id}`}
                    className="flex items-center gap-3 rounded-md border-[1.5px] border-n-200 bg-white px-4 py-3 hover:border-morado"
                  >
                    <PerroFoto
                      perroId={perro.id}
                      urlInicial={urlsFotos.get(perro.id) ?? null}
                      tieneFotoInicial={Boolean(perro.foto_path)}
                      soloLectura
                      tamano="miniatura"
                    />
                    <span className="font-semibold text-n-900">{perro.nombre}</span>
                    {perro.fallecido && (
                      <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                        Falleció
                      </span>
                    )}
                    {!esPropio && (
                      <span className="rounded-full bg-menta-suave px-2 py-0.5 text-xs font-semibold text-menta-oscuro">
                        Acceso compartido
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
