import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";

// Los primeros pasos de un negocio recién abierto desde peludesk.mx. Cada
// paso manda a la pantalla donde se hace de verdad (no hay un asistente
// aparte que duplique formularios) y se marca solo cuando la base ya
// tiene el dato.
type Paso = { titulo: string; que: string; href: string; accion: string; listo: boolean };

export default async function BienvenidaPage() {
  const supabase = await createSupabaseServerClient();
  const negocio = await cargarNegocioLanding();
  const zona = await zonaActual();
  const cuenta = (tabla: string) => supabase.from(tabla).select("id", { count: "exact", head: true }).is("deleted_at", null);
  const [{ data: config }, { data: cupoPropio }, tarifas, empleados, clientes] = await Promise.all([
    supabase.rpc("resolver_cupo_configuracion"),
    // El cupo y el horario que trae un negocio nuevo son los de base (sin
    // autor); en cuanto la administración guarda los suyos, hay uno con autor.
    supabase.from("cupo_configuracion").select("id").not("created_by", "is", null).is("deleted_at", null).limit(1),
    cuenta("tarifas"),
    cuenta("empleados"),
    cuenta("clientes"),
  ]);
  const vigente = (Array.isArray(config) ? config[0] : config) as { telefono_recepcion?: string | null } | null;

  const pasos: Paso[] = [
    {
      titulo: "Datos del negocio",
      que: "El teléfono de recepción (al que te escriben tus clientes por WhatsApp) y la dirección desde donde sale la camioneta.",
      href: "/admin#configuracion",
      accion: "Capturar datos",
      listo: Boolean(vigente?.telefono_recepcion),
    },
    {
      titulo: "Servicios y precios",
      que: "Ya tienes guardería, hotel y estética dados de alta. Ponles tu precio: por talla, por grupo de raza o por hora.",
      href: "/servicios",
      accion: "Poner precios",
      listo: (tarifas.count ?? 0) > 0,
    },
    {
      titulo: "Horario y cupo",
      que: "Qué días y a qué hora abres, y cuántos perros caben de día y de noche. Con eso se validan las reservas.",
      href: "/admin#horario",
      accion: "Ajustar horario",
      listo: (cupoPropio?.length ?? 0) > 0,
    },
    {
      titulo: "Tu primer empleado",
      que: "Su horario y cómo se le paga. Si va a usar la app, invítalo con su correo desde Administración.",
      href: "/empleados/nuevo",
      accion: "Agregar empleado",
      listo: (empleados.count ?? 0) > 0,
    },
    {
      titulo: "Tu primer cliente",
      que: "Captúralo tú, o mándale un link por WhatsApp para que él llene sus datos y los de su perro.",
      href: "/clientes/nuevo",
      accion: "Agregar cliente",
      listo: (clientes.count ?? 0) > 0,
    },
  ];
  const hechos = pasos.filter((p) => p.listo).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Te damos la bienvenida a {negocio.nombre}</h1>
        <p className="mt-1 text-n-700">
          Cinco pasos para dejar tu negocio listo.{" "}
          {negocio.plan === "prueba" && negocio.prueba_termina_at && (
            <>Tu prueba gratis dura hasta el {formatearFecha(negocio.prueba_termina_at, zona)}.</>
          )}
        </p>
        <div className="mt-4 flex items-center gap-3" aria-label={`${hechos} de ${pasos.length} pasos listos`}>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-n-100">
            <div className="h-full rounded-full bg-morado" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
          </div>
          <span className="text-sm font-semibold text-n-700">
            {hechos} de {pasos.length}
          </span>
        </div>
      </header>
      <ol className="flex flex-col divide-y divide-n-200 rounded-xl border border-n-200 bg-white">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-5">
            <span
              aria-hidden
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${p.listo ? "bg-menta text-morado" : "border-[1.5px] border-borde text-n-700"}`}
            >
              {p.listo ? "✓" : i + 1}
            </span>
            <div className="flex-1">
              <h2 className="font-semibold text-n-900">
                {p.titulo}
                {p.listo && <span className="ml-2 text-sm font-medium text-menta-oscuro">Listo</span>}
              </h2>
              <p className="mt-0.5 text-sm text-n-700">{p.que}</p>
            </div>
            <Link
              href={p.href}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-4 text-sm font-semibold ${p.listo ? "border-[1.5px] border-borde text-n-800 hover:bg-crema" : "bg-morado text-white hover:bg-morado-oscuro"}`}
            >
              {p.listo ? "Revisar" : p.accion}
            </Link>
          </li>
        ))}
      </ol>
      <p className="text-sm text-n-600">
        Puedes volver a esta página cuando quieras desde el aviso de arriba.{" "}
        <Link href="/admin" className="font-semibold text-morado hover:underline">
          Ir a Administración
        </Link>
      </p>
    </div>
  );
}
