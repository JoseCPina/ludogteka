import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { TarifaGuarderiaForm } from "./tarifa-guarderia-form";

// La tarifa «Cliente de guardería» de la estética: el perro que viene a
// guardería paga su baño con el precio de otro servicio (el exprés). Aquí el
// negocio decide si la ofrece y a qué servicios se les aplica.
export default async function TarifaGuarderiaPage() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "tarifas")) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  const [{ data: config }, { data: servicios }] = await Promise.all([
    supabase.from("tarifa_guarderia_config").select("activa, servicio_tarifa_id, servicios_incluidos, dias_actividad").is("deleted_at", null).maybeSingle(),
    supabase.from("servicios_cotizables").select("id, nombre").eq("categoria", "estetica").order("orden"),
  ]);
  const conGuarderia = (sesion?.modulos ?? []).includes("guarderia");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Tarifa para clientes de guardería</h1>
        <p className="mt-1 text-n-700">
          Si tus clientes de guardería pagan su baño al precio del exprés, aquí lo dejas como una tarifa clara: al agendar, la cita de un perro de guardería propone ese precio
          (para su talla, pelaje y grupo) y se ve como tarifa, no como descuento. Quitarla o ponerla a mano a otro perro es de admin o de quien tenga «Excepciones al reservar».
        </p>
      </header>
      {!conGuarderia && (
        <Alert variante="advertencia" titulo="Tu negocio no tiene prendido el módulo de guardería">
          La tarifa se aplica a perros con guardería: sin ese módulo, solo se puede poner a mano en cada cita.
        </Alert>
      )}
      <TarifaGuarderiaForm
        activa={Boolean(config?.activa)}
        servicioTarifaId={(config?.servicio_tarifa_id as string | null) ?? ""}
        incluidos={((config?.servicios_incluidos as string[] | null) ?? [])}
        dias={Number(config?.dias_actividad ?? 60)}
        servicios={((servicios ?? []) as { id: string; nombre: string }[])}
      />
    </div>
  );
}
