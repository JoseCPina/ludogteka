import { notFound } from "next/navigation";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { ZONAS_MEXICO } from "@/lib/plataforma/tipos";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { actualizarNegocio, agregarAdmin, asignarPlan, cambiarPlan, eliminarNegocio } from "../../../acciones";
import { formatearFecha } from "@/lib/formato";
import { pesosDeCentavos } from "@/lib/cobro/iva";
import { estadoCobro } from "@/lib/cobro/estados";

type Cobro = {
  negocio_id: string; estado: string; plan_nombre: string | null; periodicidad: string | null; monto_centavos: number | null;
  periodo_fin: string | null; primer_fallo_at: string | null; cancela_al_terminar: boolean; stripe_customer_id: string | null;
  stripe_subscription_id: string | null; estado_stripe: string | null; modo: string | null;
};
type Pago = {
  stripe_invoice_id: string; numero: string | null; estado: string; monto_centavos: number; periodo_inicio: string | null;
  periodo_fin: string | null; pagado_at: string | null; fallo_at: string | null; url_factura: string | null; created_at: string;
};
const fechaMx = (iso: string | null) => (iso ? formatearFecha(iso, "America/Mexico_City") : "—");

type Fila = {
  id: string; slug: string; nombre: string; dominio: string | null; url_publica: string | null; zona_horaria: string;
  ciudad: string | null; activo: boolean; plan: "activo" | "prueba" | "demo"; prueba_termina_at: string | null;
  plan_id: string | null; plan_nombre: string | null; complementos: string[]; modulos_cortesia: string[]; web_gratis_at: string | null; marca: { color?: string | null; favicon?: string | null; logo?: string | null; imagen_compartir?: string | null } | null; admins: string[] | null;
};

// Se puede borrar un negocio en prueba o suspendido que no sea el demo ni el de
// la casa; la base decide el resto (cobros reales) y lo dice al intentarlo.
const puedeBorrarse = (n: { plan: string; activo: boolean }, exento: boolean) => !exento && n.plan !== "demo" && (n.plan === "prueba" || !n.activo);

export default async function NegocioPlataforma({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigirPlataforma();
  const [{ data }, { data: planesCrudo }, { data: modulosCrudo }, { data: cobros }, { data: pagosCrudo }] = await Promise.all([
    supabase.rpc("plataforma_negocios"),
    supabase.from("planes").select("id, nombre, tipo, precio_mensual, modulos").eq("activo", true).order("orden"),
    supabase.from("modulos").select("clave, nombre").order("orden"),
    supabase.rpc("plataforma_cobros"),
    supabase.rpc("plataforma_pagos_negocio", { p_negocio_id: id }),
  ]);
  const cobro = ((cobros ?? []) as Cobro[]).find((c) => c.negocio_id === id) ?? null;
  const pagos = (pagosCrudo ?? []) as Pago[];
  const planes = (planesCrudo ?? []) as { id: string; nombre: string; tipo: string; precio_mensual: number; modulos: string[] }[];
  const modulos = (modulosCrudo ?? []) as { clave: string; nombre: string }[];
  const n = ((data ?? []) as Fila[]).find((x) => x.id === id);
  if (!n) notFound();
  const zonas = ZONAS_MEXICO.some((z) => z.zona === n.zona_horaria) ? ZONAS_MEXICO : [{ zona: n.zona_horaria, etiqueta: n.zona_horaria }, ...ZONAS_MEXICO];
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">{n.nombre}</h1>
        <p className="mt-1 text-n-600">
          <a href={urlDelNegocio(n)} className="text-morado hover:underline">{urlDelNegocio(n)}</a> · dirección corta «{n.slug}»
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-n-900">Cobro</h2>
          {cobro && <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${estadoCobro(cobro.estado).clase}`}>{estadoCobro(cobro.estado).texto}</span>}
        </div>
        {cobro?.stripe_subscription_id ? (
          <p className="text-sm text-n-700">
            {cobro.plan_nombre} · {cobro.periodicidad} · {cobro.monto_centavos != null ? `${pesosDeCentavos(cobro.monto_centavos)} con IVA` : ""} · periodo hasta el{" "}
            {fechaMx(cobro.periodo_fin)}
            {cobro.cancela_al_terminar ? " · cancela al terminar" : ""}
            {cobro.primer_fallo_at ? ` · primer cobro fallido el ${fechaMx(cobro.primer_fallo_at)}` : ""}
            <span className="block text-xs text-n-600">
              Stripe ({cobro.modo}): {cobro.stripe_customer_id} · {cobro.stripe_subscription_id} · {cobro.estado_stripe}
            </span>
          </p>
        ) : (
          <p className="text-sm text-n-600">Sin suscripción en Stripe.</p>
        )}
        <h3 className="text-sm font-semibold text-n-800">Historial de pagos</h3>
        {pagos.length === 0 ? (
          <p className="text-sm text-n-600">Todavía no hay pagos.</p>
        ) : (
          <ul className="divide-y divide-n-200 text-sm">
            {pagos.map((p) => (
              <li key={p.stripe_invoice_id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold text-n-900">{pesosDeCentavos(p.monto_centavos)}</span> ·{" "}
                  {p.estado === "pagado" ? `pagado el ${fechaMx(p.pagado_at)}` : p.estado === "fallido" ? `falló el ${fechaMx(p.fallo_at)}` : p.estado}
                  <span className="block text-xs text-n-600">
                    {p.numero ?? p.stripe_invoice_id} · periodo {fechaMx(p.periodo_inicio)} – {fechaMx(p.periodo_fin)}
                  </span>
                </span>
                {p.url_factura && (
                  <a href={p.url_factura} target="_blank" rel="noopener noreferrer" className="text-morado hover:underline">
                    Ver factura
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <FormularioPlataforma accion={actualizarNegocio.bind(null, n.id)} textoBoton="Guardar">
        <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="font-bold text-n-900">Configuración</h2>
          <Field label="Nombre" name="nombre" defaultValue={n.nombre} required />
          <Select label="Zona horaria" name="zona" defaultValue={n.zona_horaria}>
            {zonas.map((z) => (
              <option key={z.zona} value={z.zona}>{z.etiqueta}</option>
            ))}
          </Select>
          <Field label="Ciudad" name="ciudad" defaultValue={n.ciudad ?? ""} />
          <Field label="Dominio propio" name="dominio" defaultValue={n.dominio ?? ""} placeholder="ejemplo.mx" />
          <Field label="Dirección pública (opcional)" name="url_publica" defaultValue={n.url_publica ?? ""} placeholder="https://www.ejemplo.mx" ayuda="Solo si los links deben salir con otra dirección que https://<dominio> (p. ej. con www)." />
          <Field label="Color de la marca" name="color" defaultValue={n.marca?.color ?? ""} placeholder="#4b3f72" />
          <Field label="Logo (imagen)" name="logo" defaultValue={n.marca?.logo ?? ""} placeholder="/marca/negocios/logo.png o https://…" ayuda="Va en el encabezado de su staff, su portal, su login y su alta por link. Vacío: su logotipo de palabras si tiene, o su inicial y su nombre." />
          <Field label="Ícono de la pestaña (favicon)" name="favicon" defaultValue={n.marca?.favicon ?? ""} placeholder="/iconos/negocio.png o https://…" ayuda="Vacío: su inicial sobre el color de la marca." />
          <Field label="Imagen al compartir un link (WhatsApp)" name="imagen_compartir" defaultValue={n.marca?.imagen_compartir ?? ""} placeholder="/marca/negocios/compartir.jpg o https://…" ayuda="1200×630, JPG o PNG. Vacío: una tarjeta con su marca y su nombre (/imagen-negocio)." />
          <label className="flex items-center gap-2 text-n-800">
            <input type="checkbox" name="activo" defaultChecked={n.activo} className="h-5 w-5" />
            Activo (sin esto, su dominio responde «este sitio no existe»)
          </label>
        </section>
      </FormularioPlataforma>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="font-bold text-n-900">Plan contratado y módulos</h2>
        <p className="-mt-2 text-sm text-n-600">
          Los módulos disponibles salen del plan (en prueba: todo el Completo), más los complementos y la cortesía.
          {n.web_gratis_at ? " Se ganó la página web gratis de por vida." : ""} Bajar de plan no borra nada.
        </p>
        <FormularioPlataforma accion={asignarPlan.bind(null, n.id)} textoBoton="Guardar plan contratado" variante="secundario">
          <Select label="Plan" name="plan_id" defaultValue={n.plan_id ?? ""}>
            {planes.filter((p) => p.tipo === "plan").map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — ${Number(p.precio_mensual).toLocaleString("es-MX")} al mes
              </option>
            ))}
          </Select>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-n-800">Complementos contratados</legend>
            {planes.filter((p) => p.tipo === "complemento").map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-n-800">
                <input type="checkbox" name="complementos" value={p.modulos[0]} defaultChecked={n.complementos.includes(p.modulos[0])} className="h-4 w-4 accent-morado" />
                {p.nombre} — ${Number(p.precio_mensual).toLocaleString("es-MX")} al mes
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-n-800">Módulos de cortesía (fuera de su plan, sin costo)</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {modulos.map((m) => (
                <label key={m.clave} className="flex items-center gap-2 text-sm text-n-800">
                  <input type="checkbox" name="cortesia" value={m.clave} defaultChecked={n.modulos_cortesia.includes(m.clave)} className="h-4 w-4 accent-morado" />
                  {m.nombre}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Motivo" name="motivo" required placeholder="Contrató el plan Completo anual" />
        </FormularioPlataforma>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="font-bold text-n-900">Estado de la cuenta</h2>
        <p className="-mt-2 text-sm text-n-600">
          Una prueba vencida queda en solo lectura. Al activarlo, el negocio vuelve a poder guardar. Queda en la bitácora con el motivo.
        </p>
        <FormularioPlataforma accion={cambiarPlan.bind(null, n.id)} textoBoton="Guardar plan" variante="secundario">
          <Select label="Plan" name="plan" defaultValue={n.plan}>
            <option value="activo">Activo (cliente que paga)</option>
            <option value="prueba">Prueba gratis</option>
            <option value="demo">Demo (negocio de muestra)</option>
          </Select>
          <Field label="Prueba hasta (solo si es prueba)" name="prueba_hasta" type="date" defaultValue={n.prueba_termina_at ? new Date(n.prueba_termina_at).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }) : ""} />
          <Field label="Motivo" name="motivo" required placeholder="Pagó octubre por transferencia" />
        </FormularioPlataforma>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="font-bold text-n-900">Admins</h2>
        <p className="text-sm text-n-600">{(n.admins ?? []).join(", ") || "Ninguno todavía."}</p>
        <FormularioPlataforma accion={agregarAdmin.bind(null, n.id)} textoBoton="Agregar admin" variante="secundario" reiniciar>
          <Field label="Correo" name="admin_email" type="email" required />
          <Field label="Nombre" name="admin_nombre" />
        </FormularioPlataforma>
      </section>

      {puedeBorrarse(n, cobro?.estado === "exento") && (
        <section className="flex flex-col gap-4 rounded-lg border border-coral-oscuro/40 bg-white p-5">
          <h2 className="font-bold text-coral-oscuro">Borrar este negocio</h2>
          <p className="-mt-2 text-sm text-n-700">
            Borra el negocio completo: todos sus datos, sus archivos, su suscripción y cliente en Stripe, las credenciales de cobro que haya conectado y
            las cuentas que se queden sin negocio. No se puede deshacer. Solo para negocios de prueba o suspendidos sin cobros reales; si tiene cobros
            reales, la base lo rechaza. Queda en la bitácora.
          </p>
          <FormularioPlataforma accion={eliminarNegocio.bind(null, n.id)} textoBoton="Borrar el negocio para siempre" variante="peligro">
            <Field label={`Escribe «${n.nombre}» para confirmar`} name="confirmacion" required autoComplete="off" />
          </FormularioPlataforma>
        </section>
      )}
    </div>
  );
}
