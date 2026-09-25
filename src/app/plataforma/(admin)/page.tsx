import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { telefonoDeCorreoSintetico } from "@/lib/auth/identidad";
import { formatearTelefono } from "@/lib/telefono";

type Fila = {
  id: string; slug: string; nombre: string; dominio: string | null; url_publica: string | null;
  zona_horaria: string; ciudad: string | null; activo: boolean; admins: string[] | null; clientes: number;
  plan: "activo" | "prueba" | "demo"; prueba_termina_at: string | null; perros: number; reservas: number; cobros: number;
  ultima_actividad: string | null; ultimo_acceso: string | null;
};

// Las fechas de la plataforma se leen en la hora del centro de México.
const ZONA = "America/Mexico_City";
const fecha = (iso: string | null) => (iso ? formatearFecha(iso, ZONA) : "nunca");

// El instante de la petición, fuera del render (componente de servidor: una vez por petición).
function instanteActual(): number {
  return Date.now();
}

function diasRestantes(fin: string, ahora: number): number {
  return Math.ceil((Date.parse(fin) - ahora) / 86_400_000);
}

function Negocio({ n, ahora }: { n: Fila; ahora: number }) {
  const dias = n.plan === "prueba" && n.prueba_termina_at ? diasRestantes(n.prueba_termina_at, ahora) : null;
  const estado = !n.activo
    ? { texto: "Suspendido", clase: "bg-coral-suave text-coral-oscuro" }
    : n.plan === "demo"
      ? { texto: "Demo · solo lectura", clase: "bg-morado-suave text-morado" }
      : n.plan === "prueba"
        ? dias !== null && dias < 0
          ? { texto: `Prueba vencida el ${fecha(n.prueba_termina_at)}`, clase: "bg-ambar-suave text-ambar-oscuro" }
          : { texto: `Prueba: ${dias === 0 ? "termina hoy" : `${dias} ${dias === 1 ? "día" : "días"}`} (hasta el ${fecha(n.prueba_termina_at)})`, clase: "bg-menta-suave text-menta-oscuro" }
        : { texto: "Activo", clase: "bg-menta-suave text-menta-oscuro" };
  return (
    <li className="rounded-lg border border-n-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/plataforma/negocios/${n.id}`} className="text-lg font-bold text-n-900 hover:underline">{n.nombre}</Link>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${estado.clase}`}>{estado.texto}</span>
      </div>
      <p className="mt-1 text-sm text-n-600">
        {urlDelNegocio(n)} · {n.zona_horaria}{n.ciudad ? ` · ${n.ciudad}` : ""}
      </p>
      <p className="mt-1 text-sm text-n-700 tabular-nums">
        Uso: {n.clientes} clientes · {n.perros} perros · {n.reservas} cuentas · {n.cobros} cobros · última actividad {fecha(n.ultima_actividad)} ·
        el personal entró por última vez {fecha(n.ultimo_acceso)}
      </p>
      <p className="mt-1 text-sm text-n-500">Admin: {(n.admins ?? []).map((a) => { const tel = telefonoDeCorreoSintetico(a); return tel ? `tel. ${formatearTelefono(tel)}` : a; }).join(", ") || "ninguno todavía"}</p>
    </li>
  );
}

export default async function NegociosPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("plataforma_negocios");
  const negocios = (data ?? []) as Fila[];
  const ahora = instanteActual();
  const pruebas = negocios
    .filter((n) => n.plan === "prueba")
    .sort((a, b) => (a.prueba_termina_at ?? "").localeCompare(b.prueba_termina_at ?? ""));
  const resto = negocios.filter((n) => n.plan !== "prueba");
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Negocios</h1>
          <p className="mt-1 text-n-600">Cada negocio vive en su dominio, con sus datos aparte de los demás.</p>
        </div>
        <Link href="/plataforma/negocios/nuevo" className="inline-flex min-h-12 items-center rounded-md bg-morado px-5 font-semibold text-white hover:opacity-90">
          Dar de alta un negocio
        </Link>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar los negocios">{error.message}</Alert>}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">En prueba gratis ({pruebas.length})</h2>
        <p className="-mt-2 text-sm text-n-600">
          Registrados desde peludesk.mx/registro, del que vence primero al último. Al vencer quedan en solo lectura.
        </p>
        {pruebas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-n-300 p-4 text-sm text-n-600">Nadie se ha registrado todavía.</p>
        ) : (
          <ul className="flex flex-col gap-3">{pruebas.map((n) => <Negocio key={n.id} n={n} ahora={ahora} />)}</ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Clientes y demo ({resto.length})</h2>
        <ul className="flex flex-col gap-3">{resto.map((n) => <Negocio key={n.id} n={n} ahora={ahora} />)}</ul>
      </section>
    </div>
  );
}
