import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota, edadTexto, nombreEspecie } from "@/lib/app/datos";
import { cartillaDe, proximas, hoyMx, diasEntre, type RegistroCartilla } from "@/lib/app/cartilla";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatearFechaCalendario } from "@/lib/formato";
import { IconoFlecha, IconoFlechaArriba } from "@/components/app/iconos";
import { aAtencionDelDueno } from "@/lib/app/atenciones";
import { AtencionesDeNegocios } from "./atenciones";

// La ficha de una mascota en la app: lo que le toca, su cartilla, seguimiento, su QR, «¿se perdió?» y en qué
// negocios tiene expediente (cada uno abre su portal con la misma cuenta).
export default async function MascotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await miMascota(id);
  if (!m) notFound();
  const supabase = await createSupabaseServerClient("portal");
  const [registros, { data: pesoFila }, { count: medsActivos }, { data: atencionesCrudas }] = await Promise.all([
    cartillaDe(m.id),
    supabase.from("mascotas_pesos").select("peso_kg, fecha").eq("mascota_id", m.id).is("deleted_at", null).order("fecha", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("mascotas_medicamentos").select("id", { count: "exact", head: true }).eq("mascota_id", m.id).is("deleted_at", null).eq("activo", true),
    // Fase 2: lo que registraron negocios con el QR (sin columnas internas: por función).
    supabase.rpc("app_mis_atenciones", { p_mascota: m.id }),
  ]);
  const atenciones = ((atencionesCrudas ?? []) as Record<string, unknown>[]).map(aAtencionDelDueno);
  const edad = edadTexto(m.fechaNacimiento);
  const toca = proximas(registros).slice(0, 3);
  const hoy = hoyMx();
  const perdida = Boolean(m.perdidaAt && !m.encontradaAt);
  const chip = (r: RegistroCartilla) => {
    const d = diasEntre(hoy, r.proximaDosis!);
    if (d < 0) return { texto: `Pasó hace ${-d} ${-d === 1 ? "día" : "días"}`, clase: "apd-chip apd-chip-coral" };
    if (d === 0) return { texto: "Hoy", clase: "apd-chip apd-chip-ambar" };
    if (d <= 30) return { texto: `En ${d} ${d === 1 ? "día" : "días"}`, clase: "apd-chip apd-chip-ambar" };
    return { texto: formatearFechaCalendario(r.proximaDosis!), clase: "apd-chip" };
  };
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      {perdida && (
        <Link href={`/mascotas/${m.id}/perdida`} className="apd-aviso apd-aviso-error apd-aparece" style={{ marginTop: "0.75rem", fontWeight: 700, textDecoration: "none" }} data-aviso-perdida>
          {m.nombre} está marcada como perdida. Ver mensajes y cartel →
        </Link>
      )}
      <div className="apd-bandeja apd-aparece" style={{ marginTop: "1rem", ["--i" as string]: 1 }}>
        <div className="apd-tarjeta" style={{ padding: "0.5rem" }}>
          {m.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.fotoUrl} alt={m.nombre} className="apd-foto-grande" />
          ) : (
            <div className="apd-foto-grande apd-inicial" aria-hidden>{m.nombre.trim()[0]?.toUpperCase()}</div>
          )}
          <div style={{ padding: "1rem 0.75rem 0.75rem" }}>
            <h1 className="apd-titulo" style={{ marginTop: 0 }}>{m.nombre}</h1>
            <p className="apd-linea" style={{ marginTop: "0.25rem" }}>
              {nombreEspecie(m)}
              {m.razaTexto ? ` · ${m.razaTexto}` : ""}
              {edad ? ` · ${edad}` : ""}
              {pesoFila ? ` · ${Number(pesoFila.peso_kg)} kg` : ""}
            </p>
            {m.fallecido && <span className="apd-chip apd-chip-neutro" style={{ marginTop: "0.5rem" }}>En nuestro recuerdo{m.fechaFallecimiento ? ` desde el ${formatearFechaCalendario(m.fechaFallecimiento)}` : ""}</span>}
          </div>
        </div>
      </div>

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }} data-lo-que-toca>
        <h2 className="apd-seccion-titulo">Lo que le toca</h2>
        {toca.length === 0 ? (
          <div className="apd-tarjeta">
            <p style={{ fontWeight: 800 }}>{registros.length ? "Sin próximas dosis anotadas" : "Su cartilla está vacía"}</p>
            <p className="apd-nota" style={{ marginTop: "0.3rem" }}>{registros.length ? "Pon la próxima dosis en cada registro y te avisamos cuando toque." : "Tómale foto a su cartilla de papel y la pasamos a limpio, con sus recordatorios."}</p>
            <div className="apd-fila" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
              <Link href={`/mascotas/${m.id}/cartilla/leer`} className="apd-boton" data-ir-leer>Leer su cartilla con foto <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span></Link>
              <Link href={`/mascotas/${m.id}/cartilla?capturar=1`} className="apd-boton-suave">Anotar a mano</Link>
            </div>
          </div>
        ) : (
          <ul className="apd-lista">
            {toca.map((r) => {
              const c = chip(r);
              return (
                <li key={r.id} className="apd-tarjeta apd-fila" style={{ justifyContent: "space-between" }} data-toca>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 800 }}>{r.nombre}</span>
                    <span className="apd-nota" style={{ display: "block" }}>{r.tipo === "vacuna" ? "Vacuna" : "Desparasitación"} · próxima {formatearFechaCalendario(r.proximaDosis!)}</span>
                  </span>
                  <span className={c.clase} style={{ flex: "none" }}>{c.texto}</span>
                </li>
              );
            })}
            <li className="apd-fila" style={{ flexWrap: "wrap" }}>
              <Link href={`/mascotas/${m.id}/cartilla`} className="apd-boton-sec">Ver su cartilla</Link>
              <Link href={`/mascotas/${m.id}/cita`} className="apd-boton-suave">Pedir cita</Link>
            </li>
          </ul>
        )}
      </section>

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 3 }}>
        <ul className="apd-lista">
          <li>
            <Link href={`/mascotas/${m.id}/seguimiento`} className="apd-tarjeta apd-fila" data-ir-seguimiento>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 800 }}>Peso, medicinas y gastos</span>
                <span className="apd-nota" style={{ display: "block" }}>{pesoFila ? `Último peso ${Number(pesoFila.peso_kg)} kg` : "Sin peso anotado"}{medsActivos ? ` · ${medsActivos} ${medsActivos === 1 ? "medicamento activo" : "medicamentos activos"}` : ""}</span>
              </span>
              <IconoFlecha style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
            </Link>
          </li>
          <li>
            <Link href={`/mascotas/${m.id}/qr`} className="apd-tarjeta apd-fila" data-ir-qr>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 800 }}>Su QR para la placa</span>
                <span className="apd-nota" style={{ display: "block" }}>Quien la encuentre te escribe sin ver tu teléfono</span>
              </span>
              <IconoFlecha style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
            </Link>
          </li>
          {!m.fallecido && (
            <li>
              <Link href={`/mascotas/${m.id}/perdida`} className="apd-tarjeta apd-fila" data-ir-perdida>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 800 }}>{perdida ? "Está perdida: mensajes y cartel" : "¿Se perdió?"}</span>
                  <span className="apd-nota" style={{ display: "block" }}>{perdida ? "Revisa quién te escribió y márcala cuando aparezca" : "Un toque avisa a la gente de la app cerca y a los negocios de la zona"}</span>
                </span>
                <IconoFlecha style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
              </Link>
            </li>
          )}
        </ul>
      </section>

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 4 }}>
        <h2 className="apd-seccion-titulo">Sus datos</h2>
        <dl className="apd-datos">
          <div className="apd-dato"><dt>Nació</dt><dd>{m.fechaNacimiento ? formatearFechaCalendario(m.fechaNacimiento) : "Sin fecha"}</dd></div>
          <div className="apd-dato"><dt>Sexo</dt><dd>{m.sexo === "hembra" ? "Hembra" : m.sexo === "macho" ? "Macho" : "Sin dato"}</dd></div>
          <div className="apd-dato"><dt>Esterilización</dt><dd>{m.esterilizado === true ? "Sí" : m.esterilizado === false ? "No" : "Sin dato"}</dd></div>
          <div className="apd-dato"><dt>Microchip</dt><dd>{m.microchip || "Sin dato"}</dd></div>
        </dl>
      </section>

      {atenciones.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 5 }} data-atenciones-negocios>
          <h2 className="apd-seccion-titulo">Lo que registraron los negocios</h2>
          <p className="apd-nota" style={{ marginBottom: "0.75rem" }}>Lo registraron con el QR de su placa. Si algo no es de {m.nombre}, ocúltalo: deja de contar en su cartilla, pero el registro no se borra.</p>
          <AtencionesDeNegocios atenciones={atenciones} nombre={m.nombre} />
        </section>
      )}

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 6 }}>
        <h2 className="apd-seccion-titulo">Dónde la conocen</h2>
        {m.vinculos.length === 0 ? (
          <p className="apd-nota">Ningún negocio con PeluDesk la tiene registrada todavía. Cuando tu veterinaria o tu estética la den de alta con tu número, aparece aquí solo.</p>
        ) : (
          <ul className="apd-lista">
            {m.vinculos.map((v) => (
              <li key={v.perroId}>
                <a href={v.portalUrl} target="_blank" rel="noopener" className="apd-tarjeta apd-fila" data-vinculo>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800 }}>{v.negocioNombre}</span>
                    <span className="apd-nota" style={{ display: "block" }}>Su expediente, citas y estancias ahí</span>
                  </span>
                  <IconoFlechaArriba style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
