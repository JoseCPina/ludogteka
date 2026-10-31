import Link from "next/link";
import { sesionApp } from "@/lib/app/sesion";
import { misNegocios } from "@/lib/app/datos";
import { formatearTelefono } from "@/lib/telefono";
import { IconoFlechaArriba } from "@/components/app/iconos";
import { BotonSalir, NombreForm } from "./yo";

// Mi cuenta: nombre, el número con el que entras, tus negocios y salir.
export default async function YoPage() {
  const [s, negocios] = await Promise.all([sesionApp(), misNegocios()]);
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece" style={{ ["--i" as string]: 1 }}>
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Mi cuenta</span>
        <h1 className="apd-titulo">{s?.dueno.nombre ? s.dueno.nombre : "Tu cuenta"}</h1>
        <p className="apd-linea">Entras con el número {s?.dueno.telefono ? formatearTelefono(s.dueno.telefono) : "de tu WhatsApp"}. Sin contraseña, sin correo.</p>
      </div>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
        <NombreForm nombre={s?.dueno.nombre ?? null} />
      </section>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 3 }}>
        <h2 className="apd-seccion-titulo">Donde eres cliente</h2>
        {negocios.length === 0 ? (
          <p className="apd-nota">Todavía ningún negocio con PeluDesk te tiene registrado con este número.</p>
        ) : (
          <ul className="apd-lista">
            {negocios.map((n) => (
              <li key={n.id}>
                <a href={`${n.url}/portal`} target="_blank" rel="noopener" className="apd-tarjeta apd-fila">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 800 }}>{n.nombre}</span>
                    <span className="apd-nota" style={{ display: "block" }}>{n.ciudad ? `${n.ciudad} · ` : ""}Abrir su portal con esta cuenta</span>
                  </span>
                  <IconoFlechaArriba style={{ width: 20, height: 20, color: "var(--apd-morado)", flex: "none" }} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 4 }}>
        <div className="apd-fila" style={{ flexWrap: "wrap" }}>
          <BotonSalir />
          <a href="https://peludesk.mx/aviso-de-privacidad" target="_blank" rel="noopener" className="apd-enlace">Aviso de privacidad</a>
        </div>
      </section>
    </>
  );
}
