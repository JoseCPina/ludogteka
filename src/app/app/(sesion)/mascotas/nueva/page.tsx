import Link from "next/link";
import { NuevaMascota } from "./nueva";

export default function NuevaMascotaPage() {
  return (
    <>
      <Link href="/" className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← Mis mascotas</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Nueva mascota</span>
        <h1 className="apd-titulo">Cuéntanos de tu mascota</h1>
        <p className="apd-linea">Un minuto. Después le tomas foto a su cartilla y nosotros la pasamos a limpio.</p>
      </div>
      <section className="apd-seccion">
        <NuevaMascota />
      </section>
    </>
  );
}
