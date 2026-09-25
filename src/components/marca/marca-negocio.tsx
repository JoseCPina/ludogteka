import { fredoka } from "@/fuentes";
import type { MarcaNegocio as Marca } from "@/lib/landing/negocio";

/**
 * La marca DEL NEGOCIO encima del diseño base de PeluDesk: en el
 * encabezado del staff, el portal de clientes, el login y el alta por
 * link. El dueño de un perro ve a su guardería, no a PeluDesk. Sale de su
 * configuración (negocios.marca):
 *   logo        → su imagen
 *   logo_texto  → su logotipo de palabras con color (Ludogteka)
 *   nada        → su inicial sobre su color, y su nombre
 */
export function MarcaDelNegocio({
  nombre,
  marca,
  tamano = "normal",
  className = "",
}: {
  nombre: string;
  marca: Marca | null | undefined;
  tamano?: "normal" | "grande";
  className?: string;
}) {
  const alto = tamano === "grande" ? 48 : 32;
  if (marca?.logo && (/^\/(?!\/)/.test(marca.logo) || /^https:\/\//.test(marca.logo))) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={marca.logo} alt={nombre} style={{ height: alto }} className={`w-auto ${className}`} />;
  }
  if (marca?.logo_texto?.length) {
    const letra = marca.logo_fuente === "fredoka" ? `${fredoka.variable} font-[family-name:var(--font-fredoka)]` : "";
    return (
      <span
        role="img"
        aria-label={nombre}
        className={`inline-flex items-baseline font-bold leading-none tracking-[-0.02em] ${letra} ${className}`}
        style={{ fontSize: tamano === "grande" ? 40 : 27 }}
      >
        {marca.logo_texto.map((p, i) => (
          <span key={i} aria-hidden style={{ color: p.color }}>
            {p.texto}
          </span>
        ))}
      </span>
    );
  }
  const color = marca?.color && /^#[0-9a-fA-F]{6}$/.test(marca.color) ? marca.color : "#4b3f72";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="grid place-items-center rounded-[10px] font-bold text-white"
        style={{ width: alto, height: alto, background: color, fontSize: alto * 0.55, textShadow: "0 1px 1px rgb(0 0 0 / 0.25)" }}
      >
        {(nombre.trim()[0] ?? "·").toUpperCase()}
      </span>
      <span className="font-bold tracking-tight text-n-900" style={{ fontSize: tamano === "grande" ? 28 : 18 }}>
        {nombre}
      </span>
    </span>
  );
}
