import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota, edadTexto, nombreEspecie } from "@/lib/app/datos";
import { formatearFechaCalendario } from "@/lib/formato";
import { IconoFlechaArriba } from "@/components/app/iconos";

// La ficha de una mascota en la app: lo que se sabe de ella y en qué negocios tiene expediente (cada uno abre su portal,
// con la misma cuenta). La cartilla, el peso y los recordatorios propios llegan en la Fase 1.
export default async function MascotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await miMascota(id);
  if (!m) notFound();
  const edad = edadTexto(m.fechaNacimiento);
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
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
            </p>
            {m.fallecido && <span className="apd-chip apd-chip-neutro" style={{ marginTop: "0.5rem" }}>En nuestro recuerdo{m.fechaFallecimiento ? ` desde el ${formatearFechaCalendario(m.fechaFallecimiento)}` : ""}</span>}
          </div>
        </div>
      </div>

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
        <h2 className="apd-seccion-titulo">Sus datos</h2>
        <dl className="apd-datos">
          <div className="apd-dato"><dt>Nació</dt><dd>{m.fechaNacimiento ? formatearFechaCalendario(m.fechaNacimiento) : "Sin fecha"}</dd></div>
          <div className="apd-dato"><dt>Sexo</dt><dd>{m.sexo === "hembra" ? "Hembra" : m.sexo === "macho" ? "Macho" : "Sin dato"}</dd></div>
          <div className="apd-dato"><dt>Esterilización</dt><dd>{m.esterilizado === true ? "Sí" : m.esterilizado === false ? "No" : "Sin dato"}</dd></div>
          <div className="apd-dato"><dt>Microchip</dt><dd>{m.microchip || "Sin dato"}</dd></div>
        </dl>
      </section>

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 3 }}>
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

      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 4 }}>
        <div className="apd-tarjeta" style={{ background: "var(--apd-menta-suave)", boxShadow: "none" }}>
          <p style={{ fontWeight: 800 }}>Lo que sigue</p>
          <p className="apd-nota" style={{ marginTop: "0.35rem", color: "var(--apd-tinta-2)" }}>
            Muy pronto: la cartilla de vacunas con la foto de la de papel, los recordatorios de cada dosis, su peso y su QR para la placa.
          </p>
        </div>
      </section>
    </>
  );
}
