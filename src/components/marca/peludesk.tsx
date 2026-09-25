// La marca de PeluDesk (kit: marca-peludesk/, láminas 02 y 03). El isotipo
// va redibujado en SVG a partir de la lámina: los PNG del kit son recortes
// rasterizados de las láminas (orillas crema, cortes) y no sirven a
// cualquier tamaño. El nombre va en Outfit, la letra del sistema.
//
// Dónde va PeluDesk y dónde no (docs/DISENO.md): la plataforma, la pantalla
// de un dominio sin negocio y el "Hecho con PeluDesk" discreto del staff.
// El dueño de un perro ve a su negocio (MarcaNegocio), nunca esto.

// El "desk" del logotipo es un menta más saturado que el de la paleta
// (medido en la lámina 02). Es solo del logo: un logotipo no está sujeto a
// las reglas de contraste de texto (WCAG 1.4.3).
const MENTA_LOGO = "#6fc3a9";

// Una sola fuente del dibujo: public/marca/peludesk/isotipo.svg (de ahí
// salen también los favicons: scripts/diseno/favicons-peludesk.mjs).
export function IsotipoPeluDesk({ tamano = 40, className = "" }: { tamano?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/marca/peludesk/isotipo.svg" width={tamano} height={tamano} alt="PeluDesk" className={className} />;
}

export function LogoPeluDesk({
  tamano = 36,
  lema = false,
  claro = false,
  className = "",
}: {
  tamano?: number;
  lema?: boolean;
  // Sobre fondo morado: el nombre en crema y menta.
  claro?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <IsotipoPeluDesk tamano={tamano} />
      <span className="flex flex-col leading-none">
        <span className="font-bold tracking-[-0.02em]" style={{ fontSize: tamano * 0.72 }}>
          <span className={claro ? "text-crema" : "text-morado"}>pelu</span>
          <span style={{ color: claro ? "#a7d8c8" : MENTA_LOGO }}>desk</span>
        </span>
        {lema && (
          <span className={`mt-1 font-medium ${claro ? "text-crema/90" : "text-n-600"}`} style={{ fontSize: Math.max(11, tamano * 0.3) }}>
            El escritorio digital para negocios caninos
          </span>
        )}
      </span>
    </span>
  );
}

// Discreto: al pie del menú del staff. El cliente no lo ve.
export function HechoConPeluDesk({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://peludesk.mx"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-n-600 hover:text-morado ${className}`}
    >
      Hecho con
      <IsotipoPeluDesk tamano={14} />
      <span className="font-semibold">
        <span className="text-morado">pelu</span>
        <span style={{ color: MENTA_LOGO }}>desk</span>
      </span>
    </a>
  );
}
