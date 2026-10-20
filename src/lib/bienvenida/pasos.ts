import type { SupabaseClient } from "@supabase/supabase-js";
import { usaEstancias } from "@/lib/plan/modulos";
import { cargarServiciosConHuecos } from "@/lib/tarifas/huecos";

// Los pasos de /bienvenida (QA S16). Un paso se marca «Listo» solo cuando el negocio ya puede operar con él, no
// cuando se capturó «algo»: el teléfono Y la dirección, todos los precios de lo que ofrece, alguien con cuenta que
// atienda las citas, un médico con cédula, los requisitos para hospedar revisados y el contrato publicado.
// `requerido = false` es un paso que ayuda pero no impide operar (el primer cliente, el equipo sin estética).

export type PasoBienvenida = {
  clave: "datos" | "precios" | "horario" | "equipo" | "medico" | "requisitos" | "contrato" | "cliente";
  titulo: string;
  que: string;
  href: string;
  accion: string;
  listo: boolean;
  requerido: boolean;
  // Lo que falta, en palabras (sale en la lista final de «Te falta para operar»).
  falta: string | null;
};

export type EstadoBienvenida = { pasos: PasoBienvenida[]; puedeOperar: boolean; faltan: PasoBienvenida[] };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export async function cargarPasosBienvenida(supabase: SupabaseClient, mods: readonly string[]): Promise<EstadoBienvenida> {
  const conEstancias = usaEstancias(mods);
  const conEstetica = mods.includes("estetica");
  const conVet = mods.includes("veterinaria");
  const conContratos = conEstancias && mods.includes("contratos");
  const cuenta = (tabla: string) => supabase.from(tabla).select("id", { count: "exact", head: true }).is("deleted_at", null);

  const [{ data: config }, { data: cupoPropio }, { data: perfil }, tarifas, conHuecos, clientes, { data: ajustes }, estilistas, medicos, tipos] =
    await Promise.all([
      supabase.rpc("resolver_cupo_configuracion"),
      // El cupo y el horario que trae un negocio nuevo son los de base (sin autor); en cuanto la administración guarda
      // los suyos, hay uno con autor.
      supabase.from("cupo_configuracion").select("id").not("created_by", "is", null).is("deleted_at", null).limit(1),
      supabase.from("negocio_perfil").select("direccion").is("deleted_at", null).maybeSingle(),
      cuenta("tarifas"),
      cargarServiciosConHuecos(supabase, mods),
      supabase.from("clientes").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("publico_general", false),
      supabase.from("negocio_ajustes_operacion").select("requisitos_revisados_at, dueno_atiende_estetica").is("deleted_at", null).maybeSingle(),
      conEstetica ? supabase.rpc("estilistas_asignables") : Promise.resolve({ data: [] as { rol: string }[] }),
      conVet ? cuenta("medicos_veterinarios") : Promise.resolve({ count: 0 }),
      conContratos
        ? supabase.from("tipos_contrato").select("id, categorias_servicio, se_genera_al, plantillas_contrato(activa)").is("deleted_at", null)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

  const vigente = (Array.isArray(config) ? config[0] : config) as { telefono_recepcion?: string | null } | null;
  const telefono = Boolean(vigente?.telefono_recepcion);
  // QA R22 (N61): la misma dirección que Perfil, la página web y Configuración (negocio_perfil.direccion).
  const direccion = Boolean((perfil?.direccion as string | null)?.trim());
  const huecos = conHuecos.reduce((s, h) => s + h.faltan, 0);
  const conEstilista = ((estilistas.data ?? []) as { rol: string }[]).some((e) => e.rol === "estetica") || Boolean(ajustes?.dueno_atiende_estetica);
  const nMedicos = (medicos as { count: number | null }).count ?? 0;
  const contratoPublicado = ((tipos.data ?? []) as { categorias_servicio: string[] | null; se_genera_al: string; plantillas_contrato: { activa: boolean }[] | null }[]).some(
    (t) => t.se_genera_al === "alta" && (t.plantillas_contrato ?? []).some((p) => p.activa)
  );

  const servicios = [mods.includes("guarderia") && "guardería", mods.includes("hotel") && "hotel", conEstetica && "estética", conVet && "veterinaria"].filter(Boolean).join(", ");
  const todos: (PasoBienvenida | false)[] = [
    {
      clave: "datos",
      titulo: "Datos del negocio",
      que: "El WhatsApp de recepción (al que te escriben tus clientes) y la dirección del negocio. La dirección es una sola: la misma de tu página web y del perfil.",
      href: "/admin#configuracion",
      accion: "Capturar datos",
      listo: telefono && direccion,
      requerido: true,
      falta: !telefono && !direccion ? "Falta el WhatsApp de recepción y la dirección." : !telefono ? "Falta el WhatsApp de recepción." : !direccion ? "Falta la dirección del negocio." : null,
    },
    {
      clave: "precios",
      titulo: "Servicios y precios",
      que: `Ya tienes dados de alta los servicios de ${servicios || "tu negocio"}. Ponles tu precio${conEstetica ? ": en estética, por grupo de raza o por talla y pelaje" : ""}${conEstancias ? "; en hotel, por talla; en guardería, por día o por hora" : ""}${conVet ? "; en veterinaria, la consulta, la urgencia, el seguimiento y la aplicación de vacuna" : ""}. Lo que no ofrezcas, márcalo «No aplica».`,
      href: "/servicios",
      accion: "Poner precios",
      listo: (tarifas.count ?? 0) > 0 && huecos === 0,
      requerido: true,
      falta:
        (tarifas.count ?? 0) === 0
          ? "No hay ningún precio capturado."
          : huecos > 0
            ? `Faltan ${plural(huecos, "precio", "precios")} en ${plural(conHuecos.length, "servicio", "servicios")}.`
            : null,
    },
    {
      clave: "horario",
      titulo: conEstancias ? "Horario y cupo" : "Horario",
      que: conEstancias
        ? "Qué días y a qué hora abres, y cuántos perros caben de día y de noche. Con eso se validan las reservas."
        : "Qué días y a qué hora abres. Con eso se proponen las horas al agendar y sale en tu página web.",
      href: "/admin#horario",
      accion: "Ajustar horario",
      listo: (cupoPropio?.length ?? 0) > 0,
      requerido: true,
      falta: (cupoPropio?.length ?? 0) > 0 ? null : conEstancias ? "Revisa y guarda tu horario y tu cupo." : "Revisa y guarda tu horario.",
    },
    conEstetica
      ? {
          clave: "equipo",
          titulo: "Quién atiende la estética",
          que: "Para asignarle una cita a alguien, esa persona necesita cuenta en PeluDesk. Invita a tus estilistas con su correo, o marca que tú mismo atiendes. Un empleado «solo en nómina» no puede atender citas.",
          href: "/bienvenida/equipo",
          accion: "Agregar a tu equipo",
          listo: conEstilista,
          requerido: true,
          falta: conEstilista ? null : "Nadie con cuenta atiende las citas de estética.",
        }
      : {
          clave: "equipo",
          titulo: "Tu equipo",
          que: conVet && !conEstancias
            ? "Recepción y asistentes, con cuenta o solo en nómina. Para operar basta tu cuenta y la del médico."
            : "Con tu cuenta basta para empezar. Si alguien más va a usar la app, invítalo con su correo; si solo le pagas, dalo de alta en nómina.",
          href: "/bienvenida/equipo",
          accion: "Agregar a tu equipo",
          listo: true,
          requerido: false,
          falta: null,
        },
    conVet && {
      clave: "medico",
      titulo: "Médico veterinario",
      que: "Antes de agendar consultas hace falta al menos un médico con cuenta y cédula profesional: las consultas, recetas y certificados van a su nombre. Si tú eres el médico, desígnate con tu cédula.",
      href: "/bienvenida/medico",
      accion: "Designar médico",
      listo: nMedicos > 0,
      requerido: true,
      falta: nMedicos > 0 ? null : "No hay un médico veterinario con cédula.",
    },
    conEstancias && {
      clave: "requisitos",
      titulo: "Requisitos para hospedar",
      que: "Qué le pides a un perro antes de recibirlo en guardería u hotel: evaluación de comportamiento y vacunas obligatorias. Puedes quitar o relajar cualquiera.",
      href: "/bienvenida/requisitos",
      accion: "Revisar requisitos",
      listo: Boolean(ajustes?.requisitos_revisados_at),
      requerido: true,
      falta: ajustes?.requisitos_revisados_at ? null : "Revisa y confirma los requisitos para hospedar.",
    },
    conContratos && {
      clave: "contrato",
      titulo: "Contrato",
      que: "El contrato que firma el dueño al dar de alta a su perro. Te dejamos una plantilla general de PeluDesk lista: léela, ajústala y publícala con un clic.",
      href: "/bienvenida/contrato",
      accion: "Revisar y publicar",
      listo: contratoPublicado,
      requerido: true,
      falta: contratoPublicado ? null : "El contrato no está publicado.",
    },
    {
      clave: "cliente",
      titulo: "Tu primer cliente",
      que: "Captúralo tú, o mándale un link por WhatsApp para que él llene sus datos y los de su mascota.",
      href: "/clientes/nuevo",
      accion: "Agregar cliente",
      listo: (clientes.count ?? 0) > 0,
      requerido: false,
      falta: null,
    },
  ];
  const pasos = todos.filter((p): p is PasoBienvenida => Boolean(p));
  const faltan = pasos.filter((p) => p.requerido && !p.listo);
  return { pasos, puedeOperar: faltan.length === 0, faltan };
}
