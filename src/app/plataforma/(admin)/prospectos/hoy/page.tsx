import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { formatearFecha, hoyNegocio, horaLocalDeInstante } from "@/lib/formato";
import { textoGiro } from "@/lib/prospectos/textos";
import { linkDe } from "@/lib/prospectos/lista";
import { piezas, ZONA_PROSPECTOS } from "@/lib/prospectos/motor";
import { armarListaHoy } from "../acciones";
import { TarjetaContacto, type DatosTarjeta } from "./tarjeta";

export const maxDuration = 300;

type Fila = {
  id: string; canal: "whatsapp" | "instagram"; tipo: string; mensaje: string; estado: string; enviado_at: string | null; orden: number;
  prospectos: { id: string; nombre: string; giro: string; ciudad: string; calificacion: number | null; resenas: number | null; telefono_norm: string | null; whatsapp: string | null; instagram: string | null; slug: string } | null;
};

// «Contactar hoy»: la lista que arma la tarea de las 7:00 (o «Armar la lista de hoy»), con el mensaje de cada uno ya
// escrito. Pensada para mandarse desde el celular: un toque abre WhatsApp con el mensaje, o copia el mensaje y abre
// su Instagram, y el prospecto pasa a «contactado».
export default async function ContactarHoy() {
  const { supabase } = await exigirPlataforma();
  const fecha = hoyNegocio(ZONA_PROSPECTOS);
  const { data, error } = await supabase
    .from("prospectos_contactos")
    .select("id, canal, tipo, mensaje, estado, enviado_at, orden, prospectos(id, nombre, giro, ciudad, calificacion, resenas, telefono_norm, whatsapp, instagram, slug)")
    .eq("fecha", fecha)
    .is("deleted_at", null)
    .order("orden")
    .limit(300);
  const filas = ((data ?? []) as unknown as Fila[]).filter((f) => f.prospectos);
  const { sitio } = piezas();
  const tarjeta = (f: Fila): DatosTarjeta => {
    const p = f.prospectos!;
    return {
      id: f.id,
      canal: f.canal,
      tipo: f.tipo,
      mensaje: f.mensaje,
      estado: f.estado,
      enviadoHora: f.enviado_at ? horaLocalDeInstante(f.enviado_at, ZONA_PROSPECTOS) : null,
      prospectoId: p.id,
      nombre: p.nombre,
      detalle: [textoGiro(p.giro), p.ciudad, p.calificacion != null ? `${p.calificacion} ★ (${p.resenas ?? 0})` : null].filter(Boolean).join(" · "),
      telefono: (p.whatsapp ?? p.telefono_norm)?.replace(/\D/g, "").slice(-10) ?? null,
      instagram: p.instagram,
      link: linkDe(sitio, p.slug),
    };
  };
  const secciones = (["whatsapp", "instagram"] as const).map((canal) => {
    const todas = filas.filter((f) => f.canal === canal);
    return { canal, pendientes: todas.filter((f) => f.estado === "pendiente"), hechas: todas.filter((f) => f.estado !== "pendiente") };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma/prospectos" className="text-sm font-semibold text-indigo-700 hover:underline">← Prospectos</Link>
        <h1 className="mt-2 text-2xl font-bold text-n-900">Contactar hoy</h1>
        <p className="mt-1 text-n-600">
          {formatearFecha(`${fecha}T12:00:00-06:00`, ZONA_PROSPECTOS)}. Primero los seguimientos (sin respuesta ni visita a su página), luego los mejores prospectos
          nuevos. Al tocar WhatsApp o Instagram, el prospecto queda como contactado.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar la lista">{error.message}</Alert>}
      {filas.length === 0 && !error && (
        <Alert variante="info" titulo="Todavía no hay lista de hoy">La arma la tarea de las 7:00. Si no salió, ármala aquí.</Alert>
      )}
      <FormularioPlataforma accion={armarListaHoy} textoBoton={filas.length ? "Completar la lista de hoy" : "Armar la lista de hoy"} variante={filas.length ? "secundario" : "primario"} />

      {secciones.map((s) => (
        <section key={s.canal} aria-labelledby={`t-${s.canal}`} data-seccion={s.canal} className="flex flex-col gap-3">
          <h2 id={`t-${s.canal}`} className="text-xl font-bold text-n-900">
            {s.canal === "whatsapp" ? "WhatsApp" : "Instagram"} <span className="text-base font-semibold text-n-600">· {s.pendientes.length} por mandar · {s.hechas.length} hechos</span>
          </h2>
          {s.pendientes.length === 0 && <p className="text-sm text-n-600">Nada pendiente por {s.canal === "whatsapp" ? "WhatsApp" : "Instagram"}.</p>}
          <ul className="flex flex-col gap-3">{s.pendientes.map((f) => <TarjetaContacto key={f.id} d={tarjeta(f)} />)}</ul>
          {s.hechas.length > 0 && (
            <details className="rounded-[14px] border border-n-200 bg-white p-4">
              <summary className="cursor-pointer font-semibold text-n-700">Ya atendidos hoy ({s.hechas.length})</summary>
              <ul className="mt-3 flex flex-col gap-3">{s.hechas.map((f) => <TarjetaContacto key={f.id} d={tarjeta(f)} />)}</ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
