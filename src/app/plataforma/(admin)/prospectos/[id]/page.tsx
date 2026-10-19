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
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { linkDe } from "@/lib/prospectos/lista";
import { piezas } from "@/lib/prospectos/motor";
import { actualizarDesdeGoogle, agregarNota, cambiarEtapa, cambiarEtapaA, guardarDatos, noLeInteresa, revertirClasificacion, separarSucursal, bajaPublicidad, quitarBajaPublicidad } from "../acciones";

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
    supabase.from("prospectos").select("google_place_id, web_revisada_at, web_error, giro_busqueda, clasificacion_revertida_at").eq("id", id).maybeSingle(),
  ]);
  if (!data) notFound();
  const p = data as unknown as Prospecto;
  const eventos = (ev ?? []) as Evento[];
  type Suc = { id: string; nombre: string; ciudad: string; telefono: string | null; direccion: string | null };
  const [{ data: suc }, { data: pri }] = await Promise.all([
    supabase.from("prospectos").select("id, nombre, ciudad, telefono, direccion").eq("principal_id", p.id).is("deleted_at", null).order("nombre").limit(50),
    p.principal_id ? supabase.from("prospectos").select("id, nombre, ciudad").eq("id", p.principal_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sucursales = (suc ?? []) as Suc[];
  const principal = pri as { id: string; nombre: string; ciudad: string } | null;
  const linkPagina = linkDe(piezas().sitio, p.slug);
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

      {p.etapa === "descartado" && (
        <Alert variante="advertencia" titulo={p.descarte_tipo === "no_es_del_giro" ? "Descartado (no es del giro)" : p.descarte_tipo === "no_le_interesa" ? "Descartado: no le interesa" : "Descartado"}>
          {p.descarte_motivo ?? "Sin motivo."}
          {p.descarte_tipo === "no_es_del_giro" && (
            <FormularioPlataforma accion={revertirClasificacion.bind(null, p.id)} textoBoton="Revertir: sí es del giro" variante="secundario" className="mt-3" />
          )}
        </Alert>
      )}
      {p.etapa !== "descartado" && p.clasificacion?.motivo && (
        <div className="rounded-lg border border-n-200 bg-white p-4 text-sm" data-clasificacion>
          <p>
            <b>Clasificación:</b> {textoGiro(p.giro)} · {p.clasificacion.motivo}
            {extra?.giro_busqueda && extra.giro_busqueda !== p.giro ? <span className="text-n-600"> (la búsqueda decía {textoGiro(extra.giro_busqueda)})</span> : null}
          </p>
          {extra?.giro_busqueda && extra.giro_busqueda !== p.giro && !extra.clasificacion_revertida_at && (
            <FormularioPlataforma accion={revertirClasificacion.bind(null, p.id)} textoBoton="Revertir el giro" variante="secundario" className="mt-2" />
          )}
        </div>
      )}
      {principal && (
        <Alert variante="info" titulo="Es una sucursal">
          Se agrupó con <Link href={`/plataforma/prospectos/${principal.id}`} className="font-semibold underline">{principal.nombre}</Link> ({principal.ciudad}) porque comparten marca.
          <FormularioPlataforma accion={separarSucursal.bind(null, p.id)} textoBoton="Separar: es otro negocio" variante="secundario" className="mt-3" />
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-n-200 bg-white p-5 text-sm" data-su-pagina>
          <h2 className="text-lg font-bold text-n-900">Su página</h2>
          <p className="mt-1 text-n-600">La vista previa «Así se vería {p.nombre} en PeluDesk». Solo se llega por este link.</p>
          <div className="mt-3"><CampoCopiable valor={linkPagina} etiqueta="Link de su página" /></div>
          <a href={`/para/${p.slug}?interno=1`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-indigo-700 hover:underline">Ver su página (no cuenta como visita)</a>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
            <dt className="text-n-600">Visitas</dt><dd data-visitas>{p.visitas}{p.ultima_visita_at ? ` · la última ${formatearFecha(p.ultima_visita_at, ZONA)} ${horaLocalDeInstante(p.ultima_visita_at, ZONA)}` : ""}</dd>
            <dt className="text-n-600">Clic en prueba</dt><dd>{p.clic_prueba_at ? `${formatearFecha(p.clic_prueba_at, ZONA)} ${horaLocalDeInstante(p.clic_prueba_at, ZONA)}` : "No"}</dd>
            <dt className="text-n-600">Clic en WhatsApp</dt><dd>{p.clic_whatsapp_at ? `${formatearFecha(p.clic_whatsapp_at, ZONA)} ${horaLocalDeInstante(p.clic_whatsapp_at, ZONA)}` : "No"}</dd>
            <dt className="text-n-600">Seguimientos</dt><dd>{p.seguimientos}{p.contacto_pausado_at ? " · en pausa" : ""}</dd>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <FormularioPlataforma accion={cambiarEtapaA.bind(null, p.id, "respondio")} textoBoton="Respondió" variante="secundario" />
            {p.etapa !== "descartado" && <FormularioPlataforma accion={noLeInteresa.bind(null, p.id)} textoBoton="No le interesa" variante="secundario" />}
          </div>
          <div className="mt-4 border-t border-n-100 pt-3" data-publicidad>
            <h3 className="font-bold text-n-900">Publicidad en Meta</h3>
            {p.publicidad_baja_at ? (
              <>
                <p className="mt-1 text-n-700" data-publicidad-baja>
                  Fuera de las audiencias de Meta desde el {formatearFecha(p.publicidad_baja_at, ZONA)}{p.publicidad_baja_motivo ? ` (${p.publicidad_baja_motivo})` : ""}.
                </p>
                <FormularioPlataforma accion={quitarBajaPublicidad.bind(null, p.id)} textoBoton="Volver a incluirlo en publicidad" variante="secundario" className="mt-2" />
              </>
            ) : (
              <FormularioPlataforma accion={bajaPublicidad.bind(null, p.id)} textoBoton="Pidió baja de publicidad" variante="secundario" className="mt-2">
                <Field label="Motivo (opcional)" name="motivo" placeholder="ej. Lo pidió por WhatsApp" />
              </FormularioPlataforma>
            )}
            <p className="mt-1 text-xs text-n-500">Un descartado o una baja sale de todas las audiencias en la siguiente sincronización.</p>
          </div>
        </div>
        <div className="rounded-lg border border-n-200 bg-white p-5 text-sm" data-sucursales>
          <h2 className="text-lg font-bold text-n-900">Sucursales</h2>
          {sucursales.length === 0 ? (
            <p className="mt-1 text-n-600">{principal ? "Es sucursal de otro negocio (arriba)." : "Ninguna agrupada."}</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-n-100">
              {sucursales.map((x) => (
                <li key={x.id} className="py-2">
                  <Link href={`/plataforma/prospectos/${x.id}`} className="font-semibold text-indigo-700 hover:underline">{x.nombre}</Link>
                  <span className="block text-n-600">{[x.ciudad, x.telefono, x.direccion].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
