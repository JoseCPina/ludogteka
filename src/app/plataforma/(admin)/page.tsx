import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { telefonoDeCorreoSintetico } from "@/lib/auth/identidad";
import { formatearTelefono } from "@/lib/telefono";
import { textoDeOrigen, type Origen } from "@/lib/peludesk/origen";
import { cuentaEnPruebas, cuentaEnTotales, esDemo } from "@/lib/plataforma/metricas";

type Fila = {
  id: string; slug: string; nombre: string; dominio: string | null; url_publica: string | null;
  zona_horaria: string; ciudad: string | null; activo: boolean; admins: string[] | null; clientes: number;
  plan: "activo" | "prueba" | "demo"; prueba_termina_at: string | null; perros: number; reservas: number; cobros: number;
  ultima_actividad: string | null; ultimo_acceso: string | null;
  plan_nombre: string | null; complementos: string[]; modulos_cortesia: string[]; web_gratis_at: string | null;
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

function Negocio({ n, ahora, origen }: { n: Fila; ahora: number; origen?: Partial<Origen> | null }) {
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
        <span className="flex flex-wrap items-baseline gap-2">
          <Link href={`/plataforma/negocios/${n.id}`} className="text-lg font-bold text-n-900 hover:underline">{n.nombre}</Link>
          {esDemo(n) && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-morado">Demo</span>}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${estado.clase}`}>{estado.texto}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-n-800">
        Plan {n.plan_nombre ?? "sin asignar"}
        {n.complementos.includes("pagina_web") ? " + página web" : n.web_gratis_at ? " + página web (ganada)" : ""}
        {n.modulos_cortesia.length > 0 ? ` · cortesía: ${n.modulos_cortesia.join(", ")}` : ""}
      </p>
      <p className="mt-1 text-sm text-n-600">
        {urlDelNegocio(n)} · {n.zona_horaria}{n.ciudad ? ` · ${n.ciudad}` : ""}
      </p>
      <p className="mt-1 text-sm text-n-700 tabular-nums">
        Uso: {n.clientes} clientes · {n.perros} perros · {n.reservas} cuentas · {n.cobros} cobros · última actividad {fecha(n.ultima_actividad)} ·
        el personal entró por última vez {fecha(n.ultimo_acceso)}
      </p>
      {n.plan === "prueba" && (
        <p className="mt-1 text-sm text-n-700">
          <span className="font-semibold text-n-800">Llegó desde:</span> {textoDeOrigen(origen)}
        </p>
      )}
      <p className="mt-1 text-sm text-n-500">Admin: {(n.admins ?? []).map((a) => { const tel = telefonoDeCorreoSintetico(a); return tel ? `tel. ${formatearTelefono(tel)}` : a; }).join(", ") || "ninguno todavía"}</p>
    </li>
  );
}

export default async function NegociosPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("plataforma_negocios");
  const negocios = (data ?? []) as Fila[];
  // De qué campaña llegó cada negocio en prueba (registros_prueba: solo la plataforma la lee).
  const { data: registros } = await supabase
    .from("registros_prueba")
    .select("negocio_id, utm_source, utm_medium, utm_campaign, utm_content, fbclid, referente")
    .not("negocio_id", "is", null);
  const origenDe = new Map((registros ?? []).map((r) => [r.negocio_id as string, r as Partial<Origen>]));
  const ahora = instanteActual();
  // «En prueba» = negocios reales en plan prueba y sin suspender. El demo y
  // los suspendidos se ven abajo, pero no suman en ningún conteo.
  const pruebas = negocios
    .filter(cuentaEnPruebas)
    .sort((a, b) => (a.prueba_termina_at ?? "").localeCompare(b.prueba_termina_at ?? ""));
  const resto = negocios.filter((n) => !cuentaEnPruebas(n));
  // Cuántos negocios hay por plan (los que pagan, sin contar pruebas ni el demo).
  const porPlan = new Map<string, number>();
  for (const n of negocios.filter(cuentaEnTotales)) if (n.plan === "activo") porPlan.set(n.plan_nombre ?? "Sin plan", (porPlan.get(n.plan_nombre ?? "Sin plan") ?? 0) + 1);
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
      <section className="flex flex-wrap gap-3">
        {[...porPlan].map(([plan, cuantos]) => (
          <div key={plan} className="rounded-lg border border-n-200 bg-white px-4 py-3">
            <p className="text-sm text-n-600">Plan {plan}</p>
            <p className="text-2xl font-bold tabular-nums text-n-900">{cuantos}</p>
          </div>
        ))}
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">En prueba</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{pruebas.length}</p>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">En prueba gratis ({pruebas.length})</h2>
        <p className="-mt-2 text-sm text-n-600">
          Registrados desde peludesk.mx/registro, del que vence primero al último. Al vencer quedan en solo lectura.
        </p>
        {pruebas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-n-300 p-4 text-sm text-n-600">Nadie se ha registrado todavía.</p>
        ) : (
          <ul className="flex flex-col gap-3">{pruebas.map((n) => <Negocio key={n.id} n={n} ahora={ahora} origen={origenDe.get(n.id) ?? null} />)}</ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Clientes, demo y suspendidos ({resto.length})</h2>
        <p className="-mt-2 text-sm text-n-600">El demo y los negocios suspendidos están aquí pero no suman en los conteos de arriba.</p>
        <ul className="flex flex-col gap-3">{resto.map((n) => <Negocio key={n.id} n={n} ahora={ahora} />)}</ul>
      </section>
    </div>
  );
}
