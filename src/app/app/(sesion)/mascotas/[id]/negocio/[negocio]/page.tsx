import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { vinculoDe, fotosDelDiaApp, reportesDelDiaApp, carnetApp, expedienteApp, recetasApp, serviciosApp } from "@/lib/app/negocios";
import { formatearFechaCalendario } from "@/lib/formato";
import { CarnetCliente, type CarnetDelDueno } from "@/app/portal/perros/[id]/carnet-cliente";
import { ExpedienteCliente, type ExpedienteDelDueno } from "@/app/portal/perros/[id]/expediente-cliente";
import { RecetasCliente, type RecetaDelDueno } from "@/app/portal/perros/[id]/recetas-cliente";
import type { ContenidoReporte } from "@/lib/reporte/tipos";
import { IconoFlechaArriba } from "@/components/app/iconos";

/**
 * La mascota en UN negocio (App para dueños · Fase 3, pantalla 2): sus fotos del día, los reportes que le mandaron, su
 * carnet, sus consultas y recetas (las mismas vistas del portal, sin notas internas) y, arriba, pedir cita o reservar
 * ahí. Referencia: bloque card-nav de shadcn/studio y Mobbin app-cartilla (Fi: documentos por fecha con etiquetas).
 */
export default async function MascotaEnNegocioPage({ params }: { params: Promise<{ id: string; negocio: string }> }) {
  const { id, negocio } = await params;
  const m = await miMascota(id);
  if (!m) notFound();
  const v = await vinculoDe(m.id, negocio);
  if (!v) notFound();
  const [fotos, reportes, carnetCrudo, expedienteCrudo, recetasCrudo, servicios] = await Promise.all([
    fotosDelDiaApp(m.id, negocio, 24),
    reportesDelDiaApp(m.id, negocio),
    carnetApp(m.id, negocio),
    expedienteApp(m.id, negocio),
    recetasApp(m.id, negocio),
    serviciosApp(negocio),
  ]);
  const carnet = carnetCrudo && Array.isArray((carnetCrudo as { vacunas?: unknown }).vacunas) ? (carnetCrudo as unknown as CarnetDelDueno) : null;
  const expediente = expedienteCrudo && Array.isArray((expedienteCrudo as { consultas?: unknown }).consultas) ? (expedienteCrudo as unknown as ExpedienteDelDueno) : null;
  const recetas = recetasCrudo as RecetaDelDueno[];
  const conEstetica = servicios.some((s) => s.categoria === "estetica");
  const conEstancias = servicios.some((s) => s.categoria === "guarderia" || s.categoria === "hotel");
  const conFotos = fotos.filter((f) => f.fotoUrl);
  const nada = conFotos.length === 0 && reportes.length === 0 && !carnet?.vacunas.length && !carnet?.desparasitaciones.length && !expediente?.consultas.length && recetas.length === 0;
  const portal = m.vinculos.find((x) => x.negocioId === negocio)?.portalUrl ?? null;

  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>{m.nombre} en</span>
        <h1 className="apd-titulo">{v.negocioNombre}</h1>
      </div>

      {(conEstetica || conEstancias) && (
        <div className="apd-fila apd-aparece" style={{ flexWrap: "wrap", marginTop: "1rem", ["--i" as string]: 1 }}>
          {conEstetica && <Link href={`/mascotas/${m.id}/cita?negocio=${negocio}`} className="apd-boton" data-ir-pedir-cita>Pedir cita</Link>}
          {conEstancias && <Link href={`/mascotas/${m.id}/reservar?negocio=${negocio}`} className={conEstetica ? "apd-boton-sec" : "apd-boton"} data-ir-reservar>Reservar guardería u hotel</Link>}
        </div>
      )}

      {nada && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
          <div className="apd-vacio" data-sin-expediente>
            <p style={{ fontWeight: 800 }}>Todavía no hay nada que enseñar</p>
            <p className="apd-nota" style={{ marginTop: "0.4rem" }}>Aquí van a salir sus fotos del día, sus reportes, su carnet y sus recetas de {v.negocioNombre}.</p>
          </div>
        </section>
      )}

      {conFotos.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }} data-fotos-del-dia>
          <h2 className="apd-seccion-titulo">Fotos de sus días</h2>
          <div className="apd-galeria">
            {conFotos.map((f) => (
              <figure key={f.id} style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.fotoUrl!} alt={f.nota ?? `Foto del ${formatearFechaCalendario(f.fecha)}`} loading="lazy" />
                <figcaption className="apd-nota" style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>{formatearFechaCalendario(f.fecha)}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {reportes.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 3 }} data-reportes-del-dia>
          <h2 className="apd-seccion-titulo">Reportes de su día</h2>
          <ul className="apd-lista">
            {reportes.map((r) => {
              const c = r.contenido as Partial<ContenidoReporte>;
              return (
                <li key={r.id} className="apd-tarjeta" data-reporte={r.id}>
                  <span className="apd-ceja">{formatearFechaCalendario(r.fecha)}</span>
                  {r.tarjetaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.tarjetaUrl} alt={`Reporte del ${formatearFechaCalendario(r.fecha)}`} style={{ width: "100%", borderRadius: "1rem", marginTop: "0.5rem" }} loading="lazy" />
                  ) : (
                    <div style={{ marginTop: "0.4rem" }}>
                      {c.titulo && <p style={{ fontWeight: 800 }}>{c.titulo}</p>}
                      {(c.secciones ?? []).map((s) => {
                        const marcadas = (s.opciones ?? []).filter((o) => o.marcada).map((o) => o.texto);
                        const texto = [marcadas.join(", "), s.otro, s.texto].filter(Boolean).join(". ");
                        return texto ? (
                          <p key={s.clave} className="apd-nota" style={{ marginTop: "0.25rem" }}>
                            <strong>{s.titulo}:</strong> {texto}
                          </p>
                        ) : null;
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {carnet && (carnet.vacunas.length > 0 || carnet.desparasitaciones.length > 0) && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 4 }}>
          <CarnetCliente carnet={carnet} />
        </section>
      )}
      {expediente && expediente.habilitado && expediente.consultas.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 5 }}>
          <ExpedienteCliente expediente={expediente} />
        </section>
      )}
      {recetas.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 6 }}>
          <RecetasCliente recetas={recetas} />
        </section>
      )}

      {portal && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 7 }}>
          <a href={portal} target="_blank" rel="noopener" className="apd-tarjeta apd-fila" data-abrir-portal>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 800 }}>Todo su expediente en {v.negocioNombre}</span>
              <span className="apd-nota" style={{ display: "block" }}>Contratos firmados, requisitos y más, con la misma cuenta</span>
            </span>
            <IconoFlechaArriba style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
          </a>
        </section>
      )}
    </>
  );
}
