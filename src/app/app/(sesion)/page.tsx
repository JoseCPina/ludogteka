import Link from "next/link";
import { misMascotas, misNegocios, edadTexto, nombreEspecie, type Mascota } from "@/lib/app/datos";
import { sesionApp } from "@/lib/app/sesion";
import { IconoFlecha, IconoHuella } from "@/components/app/iconos";

// Mis mascotas: la pantalla principal. Una tarjeta por mascota con su foto, qué es, su edad y en qué negocios la
// conocen. Sin mascotas: cómo van a aparecer (Fase 0 todavía no las da de alta aquí; eso llega en la Fase 1).
export default async function MisMascotasPage() {
  const [s, mascotas, negocios] = await Promise.all([sesionApp(), misMascotas(), misNegocios()]);
  const nombre = s?.dueno.nombre?.split(" ")[0] ?? null;
  const vivas = mascotas.filter((m) => !m.fallecido);
  const idas = mascotas.filter((m) => m.fallecido);
  return (
    <>
      <div className="apd-aparece">
        <span className="apd-ceja">Mis mascotas</span>
        <h1 className="apd-titulo">{nombre ? `Hola, ${nombre}` : "Hola"}</h1>
        <p className="apd-linea">
          {vivas.length === 0
            ? "Aquí van a vivir tus mascotas, con su cartilla y sus recordatorios."
            : vivas.length === 1
              ? `Aquí está ${vivas[0].nombre}, con todo lo que se sabe de ${vivas[0].sexo === "hembra" ? "ella" : "él"}.`
              : `Tienes ${vivas.length} mascotas aquí, con todo lo que se sabe de cada una.`}
        </p>
      </div>

      {vivas.length === 0 ? (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
          <div className="apd-vacio" data-sin-mascotas>
            <IconoHuella />
            <p style={{ fontWeight: 800, fontSize: "1.125rem" }}>Todavía no hay mascotas aquí</p>
            <p className="apd-nota" style={{ marginTop: "0.5rem" }}>
              Dala de alta en un minuto: su nombre, su foto y la foto de su cartilla; nosotros la pasamos a limpio y te avisamos cuando le toque cada vacuna.
              Si tu veterinaria o tu estética usa PeluDesk y te tiene con este número, sus mascotas aparecen solas.
            </p>
            <Link href="/mascotas/nueva" className="apd-boton" style={{ marginTop: "1rem" }} data-agregar-mascota>
              Agregar a mi mascota <span className="apd-boton-flecha"><IconoFlecha style={{ width: 16, height: 16 }} /></span>
            </Link>
            {negocios.length > 0 && (
              <p className="apd-nota" style={{ marginTop: "0.75rem" }}>
                Ya eres cliente en {negocios.map((n) => n.nombre).join(", ")}: en cuanto registren a tu mascota, la ves aquí.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="apd-seccion">
          <ul className="apd-lista" data-lista-mascotas>
            {vivas.map((m, i) => (
              <li key={m.id} className="apd-aparece" style={{ ["--i" as string]: i + 1 }}>
                <TarjetaMascota m={m} />
              </li>
            ))}
            <li className="apd-aparece" style={{ ["--i" as string]: vivas.length + 1 }}>
              <Link href="/mascotas/nueva" className="apd-boton-sec" data-agregar-mascota>Agregar otra mascota</Link>
            </li>
          </ul>
        </section>
      )}

      {idas.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: vivas.length + 1 }}>
          <h2 className="apd-seccion-titulo">Siempre con nosotros</h2>
          <ul className="apd-lista">
            {idas.map((m) => (
              <li key={m.id}>
                <TarjetaMascota m={m} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {negocios.length > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: mascotas.length + 2 }}>
          <h2 className="apd-seccion-titulo">Donde te conocen</h2>
          <ul className="apd-lista">
            {negocios.map((n) => (
              <li key={n.id}>
                <a href={`${n.url}/portal`} className="apd-tarjeta apd-fila" target="_blank" rel="noopener" data-negocio-portal>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800 }}>{n.nombre}</span>
                    <span className="apd-nota" style={{ display: "block" }}>Tus citas, estancias y contratos ahí, con la misma cuenta</span>
                  </span>
                  <IconoFlecha style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function TarjetaMascota({ m }: { m: Mascota }) {
  const edad = edadTexto(m.fechaNacimiento);
  return (
    <Link href={`/mascotas/${m.id}`} className="apd-tarjeta apd-fila" data-mascota={m.id}>
      {m.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.fotoUrl} alt="" className="apd-foto" />
      ) : (
        <span className="apd-foto apd-inicial" aria-hidden>{m.nombre.trim()[0]?.toUpperCase()}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 800, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>{m.nombre}</span>
        <span className="apd-nota" style={{ display: "block" }}>
          {nombreEspecie(m)}
          {m.razaTexto ? ` · ${m.razaTexto}` : ""}
          {edad ? ` · ${edad}` : ""}
        </span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.45rem" }}>
          {m.fallecido && <span className="apd-chip apd-chip-neutro">En nuestro recuerdo</span>}
          {m.vinculos.map((v) => (
            <span key={v.perroId} className="apd-chip">En {v.negocioNombre}</span>
          ))}
          {m.vinculos.length === 0 && !m.fallecido && <span className="apd-chip apd-chip-neutro">Solo en tu app</span>}
          {m.perdidaAt && !m.encontradaAt && <span className="apd-chip apd-chip-coral">Perdida</span>}
        </span>
      </span>
      <IconoFlecha style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
    </Link>
  );
}
