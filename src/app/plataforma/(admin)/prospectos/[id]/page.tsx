import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { COLUMNAS, type Prospecto } from "@/lib/prospectos/consulta";
import { CANALES, ETAPAS, GIROS, textoCanal, textoEtapa, textoGiro } from "@/lib/prospectos/textos";
import { actualizarDesdeGoogle, agregarNota, cambiarEtapa, guardarDatos } from "../acciones";

const ZONA = "America/Mexico_City";

type Evento = { id: string; tipo: string; etapa_anterior: string | null; etapa_nueva: string | null; canal: string | null; texto: string | null; created_at: string };

const enlace = (url: string | null, texto?: string) =>
  url ? (
    <a href={/^https?:\/\//.test(url) ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:underline">
      {texto ?? url}
    </a>
  ) : (
    "—"
  );

export default async function FichaProspecto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await exigirPlataforma();
  const [{ data }, { data: ev }, { data: extra }] = await Promise.all([
    supabase.from("prospectos").select(COLUMNAS).eq("id", id).is("deleted_at", null).maybeSingle(),
    supabase.from("prospectos_eventos").select("id, tipo, etapa_anterior, etapa_nueva, canal, texto, created_at").eq("prospecto_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
    supabase.from("prospectos").select("google_place_id, web_revisada_at, web_error").eq("id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const p = data as unknown as Prospecto;
  const eventos = (ev ?? []) as Evento[];
  const wa = (p.whatsapp ?? p.telefono)?.replace(/\D/g, "").slice(-10);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma/prospectos" className="text-sm font-semibold text-indigo-700 hover:underline">← Prospectos</Link>
        <h1 className="mt-2 text-2xl font-bold text-n-900">{p.nombre}</h1>
        <p className="text-n-600">
          {textoGiro(p.giro)} · {p.ciudad} · {textoEtapa(p.etapa)}
          {p.calificacion != null ? ` · ${p.calificacion} ★ (${p.resenas ?? 0} reseñas)` : ""}
        </p>
      </div>
      {p.negocio_cliente_id && (
        <Alert variante="info" titulo="Ya es negocio de PeluDesk">
          Se reconoció por {p.cliente_por === "telefono" ? "su teléfono" : p.cliente_por === "correo" ? "su correo" : "su nombre"}. No cuenta como prospecto.{" "}
          <Link href={`/plataforma/negocios/${p.negocio_cliente_id}`} className="font-semibold underline">Ver el negocio</Link>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-n-200 bg-white p-5 text-sm">
          <h2 className="text-lg font-bold text-n-900">Contacto</h2>
          <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
            <dt className="text-n-600">Teléfono</dt><dd>{p.telefono ?? "—"}</dd>
            <dt className="text-n-600">WhatsApp</dt><dd>{p.whatsapp ?? (p.telefono ? "Sin distinguir del teléfono" : "—")}</dd>
            <dt className="text-n-600">Correo</dt><dd>{p.correo ? <a href={`mailto:${p.correo}`} className="text-indigo-700 hover:underline">{p.correo}</a> : "—"}</dd>
            <dt className="text-n-600">Instagram</dt><dd>{enlace(p.instagram)}</dd>
            <dt className="text-n-600">Facebook</dt><dd>{enlace(p.facebook)}</dd>
            <dt className="text-n-600">Web</dt><dd className="break-all">{enlace(p.web)}</dd>
            <dt className="text-n-600">Dirección</dt><dd>{p.direccion ?? "—"}</dd>
            <dt className="text-n-600">Fuente</dt><dd>{p.fuente === "google_places" ? "Google Maps" : "A mano"} · alta {formatearFecha(p.created_at, ZONA)}</dd>
            {p.canal_ultimo_contacto && (<><dt className="text-n-600">Último contacto</dt><dd>{textoCanal(p.canal_ultimo_contacto)}{p.ultimo_contacto_at ? ` · ${formatearFecha(p.ultimo_contacto_at, ZONA)}` : ""}</dd></>)}
          </dl>
          {extra?.web_error && <p className="mt-2 text-ambar-oscuro">No se pudo leer su web: {extra.web_error}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            {wa && wa.length === 10 && (
              <a href={`https://wa.me/52${wa}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-700 hover:underline">Abrir en WhatsApp</a>
            )}
          </div>
          {extra?.google_place_id && (
            <FormularioPlataforma accion={actualizarDesdeGoogle.bind(null, p.id)} textoBoton="Actualizar desde Google" variante="secundario" className="mt-3" />
          )}
        </div>

        <div className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Cambiar etapa</h2>
          <FormularioPlataforma accion={cambiarEtapa.bind(null, p.id)} textoBoton="Guardar etapa" className="mt-3">
            <Select label="Etapa" name="etapa" defaultValue={p.etapa}>
              {ETAPAS.map((e) => <option key={e.clave} value={e.clave}>{e.texto}</option>)}
            </Select>
            <Select label="Canal del contacto (opcional)" name="canal" defaultValue="">
              <option value="">Sin cambiar</option>
              {CANALES.map((c) => <option key={c.clave} value={c.clave}>{c.texto}</option>)}
            </Select>
            <Textarea label="Nota (opcional)" name="nota" rows={2} maxLength={4000} />
          </FormularioPlataforma>
          <h2 className="mt-6 text-lg font-bold text-n-900">Agregar nota</h2>
          <FormularioPlataforma accion={agregarNota.bind(null, p.id)} textoBoton="Agregar nota" variante="secundario" reiniciar className="mt-3">
            <Textarea label="Nota" name="nota" rows={2} maxLength={4000} required />
          </FormularioPlataforma>
        </div>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Historial</h2>
        <ul className="mt-2 flex flex-col divide-y divide-n-200 text-sm" data-historial>
          {eventos.map((e) => (
            <li key={e.id} className="py-2">
              <span className="text-n-600">{formatearFecha(e.created_at, ZONA)} {horaLocalDeInstante(e.created_at, ZONA)} · </span>
              {e.tipo === "etapa" ? (
                <span>Etapa: {textoEtapa(e.etapa_anterior)} → <b>{textoEtapa(e.etapa_nueva)}</b>{e.canal ? ` (${textoCanal(e.canal)})` : ""}</span>
              ) : e.tipo === "alta" ? (
                <span>Alta como <b>{textoEtapa(e.etapa_nueva)}</b>{e.texto ? ` · ${e.texto}` : ""}</span>
              ) : (
                <span className="whitespace-pre-wrap">{e.texto}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Datos</h2>
        <FormularioPlataforma accion={guardarDatos.bind(null, p.id)} textoBoton="Guardar datos" variante="secundario" className="mt-3">
          <Field label="Nombre" name="nombre" defaultValue={p.nombre} required maxLength={200} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ciudad" name="ciudad" defaultValue={p.ciudad} required maxLength={80} />
            <Select label="Giro" name="giro" defaultValue={p.giro}>
              {GIROS.map((g) => <option key={g.clave} value={g.clave}>{g.texto}</option>)}
            </Select>
          </div>
          <Field label="Dirección" name="direccion" defaultValue={p.direccion ?? ""} maxLength={300} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Teléfono" name="telefono" type="tel" defaultValue={p.telefono ?? ""} />
            <Field label="WhatsApp" name="whatsapp" type="tel" defaultValue={p.whatsapp ?? ""} />
            <Field label="Correo" name="correo" type="email" defaultValue={p.correo ?? ""} />
            <Field label="Web" name="web" defaultValue={p.web ?? ""} />
            <Field label="Instagram" name="instagram" defaultValue={p.instagram ?? ""} />
            <Field label="Facebook" name="facebook" defaultValue={p.facebook ?? ""} />
          </div>
          <Textarea label="Notas" name="notas" rows={4} defaultValue={p.notas ?? ""} maxLength={4000} />
        </FormularioPlataforma>
      </section>
    </div>
  );
}
