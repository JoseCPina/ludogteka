import type { CSSProperties, ReactNode } from "react";
import { aclarar, oscurecer } from "./colores";
import { iconoDataUri } from "./iconos";
import type { ColoresTarjeta, ContenidoReporte, OpcionReporte, SeccionReporte } from "./tipos";

/**
 * La tarjeta del reporte (1080×1350) como árbol para satori (next/og): solo
 * flexbox. Cada negocio pinta su plantilla con su logo y sus colores. El
 * alto de la plantilla es variable (el admin agrega y quita opciones), así
 * que `escalaParaCaber` calcula un factor para que todo quepa sin recortar.
 */
export const ANCHO = 1080;
export const ALTO = 1350;
const PAD = 36;
const GAP = 20;

export type MarcaTarjeta = {
  nombre: string;
  color: string;
  logoDataUri: string | null;
  logoTexto: { texto: string; color: string }[] | null;
};

export type DatosTarjeta = {
  contenido: ContenidoReporte;
  perro: string;
  fechaTexto: string;
  colores: ColoresTarjeta;
  marca: MarcaTarjeta;
};

const FUENTE = "Montserrat";
const f = (extra: CSSProperties): CSSProperties => ({ display: "flex", ...extra });

// ── Estimación de alto ──────────────────────────────────────────────
// Satori no mide por nosotros: se estima con un ancho medio de letra
// (Montserrat ≈ 0.6 del cuerpo) y cada tarjeta recibe un alto explícito.

const ANCHO_COL = (ANCHO - PAD * 2 - GAP) / 2; // 494
const BORDE_Y_RELLENO = 6 + 40;

function columnasLista(s: SeccionReporte): number {
  if (s.columna === "completo") return 3;
  return s.opciones.length + (s.permite_otro ? 1 : 0) >= 4 ? 2 : 1;
}

function lineas(texto: string, ancho: number, fuente: number): number {
  const porLinea = Math.max(4, Math.floor(ancho / (fuente * 0.6)));
  let n = 1;
  let actual = 0;
  for (const palabra of texto.split(/\s+/)) {
    const largo = palabra.length + (actual ? 1 : 0);
    if (actual + largo > porLinea && actual > 0) {
      n += 1;
      actual = palabra.length;
    } else actual += largo;
  }
  return n;
}

const lineasDeTexto = (t: string | null, porLinea: number) => (t ? Math.max(1, Math.ceil(t.length / porLinea)) : 0);

const anchoInterior = (s: SeccionReporte) => (s.columna === "completo" ? ANCHO - PAD * 2 : ANCHO_COL) - BORDE_Y_RELLENO;

function altoCampoTexto(s: SeccionReporte, k: number): number {
  if (!s.etiqueta_texto) return 0;
  const n = Math.max(2, s.texto ? lineas(s.texto, anchoInterior(s), 19 * k) : 0);
  return (24 + 10 + n * 38) * k;
}

export function altoEstimado(s: SeccionReporte, k: number): number {
  const cabecera = 58 * k;
  const relleno = (18 + 8) * k;
  const ancho = anchoInterior(s);
  const todas = s.opciones.length + (s.permite_otro ? 1 : 0);
  let cuerpo = 0;
  if (s.presentacion === "caras") {
    const w = ancho / Math.max(1, s.opciones.length);
    const maxL = Math.max(1, ...s.opciones.map((o) => lineas(o.texto, w, 15 * k)));
    cuerpo = (78 + 8 + 24 + 8 + 10) * k + maxL * 15 * 1.2 * k;
  } else if (s.presentacion === "iconos") {
    const w = ancho / 4;
    const maxL = Math.max(1, ...s.opciones.map((o) => lineas(o.texto, w, 15 * k)));
    cuerpo = Math.ceil(todas / 4) * ((66 + 8 + 24 + 8 + 10) * k + maxL * 15 * 1.2 * k);
  } else if (s.presentacion === "lista") {
    const cols = columnasLista(s);
    const hayIcono = s.opciones.some((o) => o.icono);
    const textoAncho = ancho / cols - (26 + 12 + 8 + (hayIcono ? 52 : 0)) * k;
    let total = 0;
    for (let i = 0; i < todas; i += cols) {
      const fila = s.opciones.slice(i, i + cols);
      const maxL = Math.max(1, ...fila.map((o) => lineas(o.texto, textoAncho, 19 * k)));
      total += Math.max(maxL * 19 * 1.2, hayIcono ? 40 : 26) * k + 15 * k;
    }
    cuerpo = total;
  } else if (s.presentacion === "resumen") {
    cuerpo = 96 * k;
  } else {
    cuerpo = Math.max(4, 1 + (s.texto ? lineas(s.texto, ancho, 19 * k) : 0)) * 38 * k;
  }
  if (s.presentacion !== "texto") cuerpo += altoCampoTexto(s, k);
  return cabecera + relleno + cuerpo + 6;
}

const ALTO_CUERPO = ALTO - PAD * 2 - 112 - 64 - GAP * 2;

type Distribucion = { k: number; altos: Map<string, number> };

/** El mayor factor (≤ 1) con el que todo cabe y el alto explícito de cada tarjeta. */
export function distribuir(secciones: SeccionReporte[]): Distribucion {
  const izq = secciones.filter((s) => s.columna === "izq");
  const der = secciones.filter((s) => s.columna === "der");
  const completo = secciones.filter((s) => s.columna === "completo");
  const suma = (lista: SeccionReporte[], k: number) => lista.reduce((t, s) => t + altoEstimado(s, k), 0) + Math.max(0, lista.length - 1) * GAP;
  const total = (k: number) => Math.max(suma(izq, k), suma(der, k)) + (completo.length ? GAP + suma(completo, k) : 0);
  let k = 1;
  while (k > 0.55 && total(k) > ALTO_CUERPO) k -= 0.02;
  const altos = new Map<string, number>();
  for (const s of completo) altos.set(s.clave, altoEstimado(s, k));
  const disponible = ALTO_CUERPO - (completo.length ? GAP + suma(completo, k) : 0);
  for (const col of [izq, der]) {
    const base = suma(col, k);
    const sobra = Math.max(0, disponible - base);
    const peso = col.reduce((t, s) => t + altoEstimado(s, k), 0) || 1;
    for (const s of col) altos.set(s.clave, Math.floor(altoEstimado(s, k) + (sobra * altoEstimado(s, k)) / peso));
  }
  return { k, altos };
}

// ── Piezas ──────────────────────────────────────────────────────────

function Radio({ marcada, color, k, tam = 26 }: { marcada: boolean; color: string; k: number; tam?: number }) {
  const s = Math.round(tam * k);
  return (
    <div
      style={f({
        width: s,
        height: s,
        borderRadius: s,
        border: `${Math.max(2, Math.round(2.6 * k))}px solid ${color}`,
        background: marcada ? color : "#FFFFFF",
        flexShrink: 0,
      })}
    />
  );
}

function Icono({ nombre, color, tam, fondo }: { nombre: string | null; color: string; tam: number; fondo?: string }) {
  const src = iconoDataUri(nombre, { color });
  if (!src) return null;
  return (
    <div style={f({ width: tam, height: tam, alignItems: "center", justifyContent: "center", borderRadius: tam, background: fondo ?? "transparent" })}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={fondo ? Math.round(tam * 0.7) : tam} height={fondo ? Math.round(tam * 0.7) : tam} alt="" />
    </div>
  );
}

function Lineas({ n, color, k }: { n: number; color: string; k: number }) {
  return (
    <div style={f({ flexDirection: "column", width: "100%" })}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={f({ height: Math.round(38 * k), borderBottom: `${Math.max(2, Math.round(2 * k))}px solid ${color}`, width: "100%" })} />
      ))}
    </div>
  );
}

function CampoTexto({ s, k, tinta, rayas }: { s: SeccionReporte; k: number; tinta: string; rayas: string }) {
  if (!s.etiqueta_texto) return null;
  const porLinea = s.columna === "completo" ? 80 : 40;
  const lineas = Math.max(2, lineasDeTexto(s.texto, porLinea));
  return (
    <div style={f({ flexDirection: "column", marginTop: Math.round(10 * k), width: "100%" })}>
      <div style={f({ fontSize: Math.round(19 * k), fontWeight: 700, color: tinta })}>{s.etiqueta_texto}:</div>
      {s.texto ? (
        <div style={f({ flexDirection: "column", width: "100%", position: "relative" })}>
          <Lineas n={lineas} color={rayas} k={k} />
          <div style={f({ position: "absolute", top: Math.round(4 * k), left: 0, right: 0, fontSize: Math.round(19 * k), lineHeight: `${Math.round(38 * k)}px`, color: tinta, fontWeight: 600 })}>
            {s.texto}
          </div>
        </div>
      ) : (
        <Lineas n={2} color={rayas} k={k} />
      )}
    </div>
  );
}

function OpcionLista({ o, s, k, color, tinta, ancho }: { o: OpcionReporte; s: SeccionReporte; k: number; color: string; tinta: string; ancho: string }) {
  void s;
  return (
    <div style={f({ alignItems: "center", gap: Math.round(12 * k), width: ancho, paddingBottom: Math.round(15 * k), paddingRight: Math.round(8 * k) })}>
      <Radio marcada={o.marcada} color={color} k={k} />
      {o.icono ? <Icono nombre={o.icono} color={color} tam={Math.round(40 * k)} /> : null}
      <div style={f({ fontSize: Math.round(19 * k), color: tinta, fontWeight: o.marcada ? 700 : 500, lineHeight: 1.2, flex: 1 })}>{o.texto}</div>
    </div>
  );
}

function OtroLista({ s, k, color, tinta, ancho }: { s: SeccionReporte; k: number; color: string; tinta: string; ancho: string }) {
  return (
    <div style={f({ alignItems: "center", gap: Math.round(12 * k), width: ancho, paddingBottom: Math.round(15 * k), paddingRight: Math.round(8 * k) })}>
      <Radio marcada={Boolean(s.otro)} color={color} k={k} />
      <div style={f({ fontSize: Math.round(19 * k), color: tinta, fontWeight: s.otro ? 700 : 500, flex: 1, borderBottom: `${Math.max(2, Math.round(2 * k))}px solid ${aclarar(color, 0.5)}` })}>
        Otro:{s.otro ? ` ${s.otro}` : " "}
      </div>
    </div>
  );
}

function ItemIcono({ o, color, tinta, k, tamIcono, ancho }: { o: OpcionReporte; color: string; tinta: string; k: number; tamIcono: number; ancho: string }) {
  return (
    <div style={f({ flexDirection: "column", alignItems: "center", width: ancho, gap: Math.round(8 * k), paddingBottom: Math.round(10 * k) })}>
      <Icono nombre={o.icono} color={o.marcada ? oscurecer(color, 0.1) : color} tam={Math.round(tamIcono * k)} fondo={aclarar(color, 0.82)} />
      <Radio marcada={o.marcada} color={color} k={k} tam={24} />
      <div style={f({ fontSize: Math.round(15 * k), color: tinta, textAlign: "center", fontWeight: o.marcada ? 700 : 500, lineHeight: 1.2, justifyContent: "center", paddingLeft: 2, paddingRight: 2 })}>
        {o.texto}
      </div>
    </div>
  );
}

function CuerpoSeccion({ s, k, color, tinta }: { s: SeccionReporte; k: number; color: string; tinta: string }) {
  const rayas = aclarar(color, 0.55);
  if (s.presentacion === "caras") {
    return (
      <div style={f({ width: "100%", justifyContent: "space-around" })}>
        {s.opciones.map((o) => (
          <ItemIcono key={o.clave} o={o} color={color} tinta={tinta} k={k} tamIcono={78} ancho={`${Math.floor(100 / Math.max(1, s.opciones.length))}%`} />
        ))}
      </div>
    );
  }
  if (s.presentacion === "iconos") {
    return (
      <div style={f({ flexDirection: "column", width: "100%" })}>
        <div style={f({ flexWrap: "wrap", width: "100%" })}>
          {s.opciones.map((o) => (
            <ItemIcono key={o.clave} o={o} color={color} tinta={tinta} k={k} tamIcono={66} ancho="25%" />
          ))}
          {s.permite_otro ? (
            <div style={f({ flexDirection: "column", alignItems: "center", width: "25%", gap: Math.round(8 * k), justifyContent: "flex-end", paddingBottom: Math.round(10 * k) })}>
              <Radio marcada={Boolean(s.otro)} color={color} k={k} tam={24} />
              <div style={f({ fontSize: Math.round(15 * k), color: tinta, fontWeight: s.otro ? 700 : 500, borderBottom: `${Math.max(2, Math.round(2 * k))}px solid ${rayas}`, minWidth: "70%", justifyContent: "center" })}>
                Otro:{s.otro ? ` ${s.otro}` : " "}
              </div>
            </div>
          ) : null}
        </div>
        <CampoTexto s={s} k={k} tinta={tinta} rayas={rayas} />
      </div>
    );
  }
  if (s.presentacion === "resumen") {
    return (
      <div style={f({ width: "100%", gap: Math.round(15 * k) })}>
        {s.opciones.map((o) => (
          <div
            key={o.clave}
            style={f({
              flex: 1,
              alignItems: "center",
              gap: Math.round(10 * k),
              border: `${Math.max(2, Math.round(2.4 * k))}px solid ${o.marcada ? color : aclarar(color, 0.6)}`,
              background: o.marcada ? aclarar(color, 0.88) : "#FFFFFF",
              borderRadius: Math.round(19 * k),
              padding: `${Math.round(10 * k)}px ${Math.round(12 * k)}px`,
            })}
          >
            <Radio marcada={o.marcada} color={color} k={k} tam={24} />
            <Icono nombre={o.icono} color={color} tam={Math.round(46 * k)} />
            <div style={f({ fontSize: Math.round(16 * k), color: tinta, fontWeight: o.marcada ? 700 : 500, lineHeight: 1.15, flex: 1 })}>{o.texto}</div>
          </div>
        ))}
      </div>
    );
  }
  if (s.presentacion === "texto") {
    const lineas = Math.max(4, lineasDeTexto(s.texto, s.columna === "completo" ? 80 : 40) + 1);
    return (
      <div style={f({ flexDirection: "column", width: "100%", position: "relative", flex: 1 })}>
        <Lineas n={lineas} color={rayas} k={k} />
        {s.texto ? (
          <div style={f({ position: "absolute", top: Math.round(4 * k), left: 0, right: 0, fontSize: Math.round(19 * k), lineHeight: `${Math.round(38 * k)}px`, color: tinta, fontWeight: 600 })}>
            {s.texto}
          </div>
        ) : null}
      </div>
    );
  }
  // lista
  const cols = columnasLista(s);
  const ancho = `${Math.floor(100 / cols)}%`;
  return (
    <div style={f({ flexDirection: "column", width: "100%" })}>
      <div style={f({ flexWrap: "wrap", width: "100%" })}>
        {s.opciones.map((o) => (
          <OpcionLista key={o.clave} o={o} s={s} k={k} color={color} tinta={tinta} ancho={ancho} />
        ))}
        {s.permite_otro ? <OtroLista s={s} k={k} color={color} tinta={tinta} ancho={ancho} /> : null}
      </div>
      <CampoTexto s={s} k={k} tinta={tinta} rayas={rayas} />
    </div>
  );
}

function TarjetaSeccion({ s, k, colores, tinta, alto }: { s: SeccionReporte; k: number; colores: ColoresTarjeta; tinta: string; alto: number }) {
  const color = colores[s.color];
  const colorTrazo = s.color === "acento" ? oscurecer(color, 0.18) : color;
  // Texto sobre el color de la cabecera: blanco, salvo el acento claro (ámbar), que lleva tinta.
  const sobreCabecera = s.color === "acento" ? tinta : "#FFFFFF";
  return (
    <div
      style={f({
        flexDirection: "column",
        width: "100%",
        height: alto,
        flexShrink: 0,
        border: `${Math.max(2, Math.round(3 * k))}px solid ${aclarar(color, 0.35)}`,
        borderRadius: Math.round(26 * k),
        overflow: "hidden",
        background: "#FFFFFF",
      })}
    >
      <div style={f({ alignItems: "center", gap: Math.round(15 * k), background: color, padding: `${Math.round(12 * k)}px ${Math.round(22 * k)}px`, minHeight: Math.round(58 * k) })}>
        {s.icono ? <Icono nombre={s.icono} color={sobreCabecera} tam={Math.round(36 * k)} /> : null}
        <div style={f({ fontSize: Math.round(23 * k), fontWeight: 700, color: sobreCabecera, textTransform: "uppercase", letterSpacing: 0.3 })}>{s.titulo}</div>
      </div>
      <div style={f({ padding: `${Math.round(19 * k)}px ${Math.round(20 * k)}px ${Math.round(8 * k)}px`, flex: 1 })}>
        <CuerpoSeccion s={s} k={k} color={colorTrazo} tinta={tinta} />
      </div>
    </div>
  );
}

function Logo({ marca, k, lado }: { marca: MarcaTarjeta; k: number; lado: "izq" | "der" }): ReactNode {
  const caja = f({ width: Math.round(170 * k), height: Math.round(96 * k), alignItems: "center", justifyContent: lado === "izq" ? "flex-start" : "flex-end" });
  if (marca.logoDataUri) {
    return (
      <div style={caja}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={marca.logoDataUri} alt="" style={{ maxWidth: Math.round(170 * k), maxHeight: Math.round(96 * k), objectFit: "contain" }} />
      </div>
    );
  }
  if (marca.logoTexto?.length) {
    return (
      <div style={{ ...caja, fontSize: Math.round(30 * k), fontWeight: 800, letterSpacing: -0.5 }}>
        {marca.logoTexto.map((p, i) => (
          <div key={i} style={f({ color: p.color })}>
            {p.texto}
          </div>
        ))}
      </div>
    );
  }
  const tam = Math.round(78 * k);
  return (
    <div style={caja}>
      <div style={f({ width: tam, height: tam, borderRadius: Math.round(19 * k), background: marca.color, color: "#FFFFFF", fontSize: Math.round(46 * k), fontWeight: 800, alignItems: "center", justifyContent: "center" })}>
        {(marca.nombre.trim()[0] ?? "·").toUpperCase()}
      </div>
    </div>
  );
}

export function TarjetaReporte({ datos }: { datos: DatosTarjeta }) {
  const { contenido, colores, marca } = datos;
  const { k, altos } = distribuir(contenido.secciones);
  const tinta = oscurecer(colores.primario, 0.5);
  const izq = contenido.secciones.filter((s) => s.columna === "izq");
  const der = contenido.secciones.filter((s) => s.columna === "der");
  const completo = contenido.secciones.filter((s) => s.columna === "completo");
  const col = (lista: SeccionReporte[]) => (
    <div style={f({ flexDirection: "column", flex: 1, gap: GAP, width: ANCHO_COL })}>
      {lista.map((s) => (
        <TarjetaSeccion key={s.clave} s={s} k={k} colores={colores} tinta={tinta} alto={altos.get(s.clave) ?? 100} />
      ))}
    </div>
  );
  const huella = iconoDataUri("huella", { color: colores.secundario });
  return (
    <div
      style={f({
        width: ANCHO,
        height: ALTO,
        flexDirection: "column",
        background: "#FFFFFF",
        padding: PAD,
        fontFamily: FUENTE,
        gap: GAP,
      })}
    >
      <div style={f({ alignItems: "center", justifyContent: "space-between", height: 112 })}>
        <Logo marca={marca} k={0.8} lado="izq" />
        <div style={f({ flexDirection: "column", alignItems: "center", flex: 1, gap: 6 })}>
          <div style={f({ fontSize: 40, fontWeight: 800, color: tinta, textAlign: "center", lineHeight: 1.05, textTransform: "uppercase" })}>{contenido.titulo}</div>
          {contenido.subtitulo ? <div style={f({ fontSize: 21, fontWeight: 500, color: colores.primario, textAlign: "center" })}>{contenido.subtitulo}</div> : null}
        </div>
        <Logo marca={marca} k={0.8} lado="der" />
      </div>
      <div
        style={f({
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
          borderRadius: 32,
          background: aclarar(colores.secundario, 0.86),
          padding: "0 28px",
        })}
      >
        <div style={f({ alignItems: "center", gap: 12 })}>
          {huella ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={huella} width={30} height={30} alt="" />
          ) : null}
          <div style={f({ fontSize: 30, fontWeight: 800, color: tinta })}>{datos.perro}</div>
        </div>
        <div style={f({ fontSize: 22, fontWeight: 600, color: tinta })}>{datos.fechaTexto}</div>
      </div>
      <div style={f({ flex: 1, gap: GAP, flexDirection: "column" })}>
        <div style={f({ flex: 1, gap: GAP })}>
          {col(izq)}
          {col(der)}
        </div>
        {completo.map((s) => (
          <TarjetaSeccion key={s.clave} s={s} k={k} colores={colores} tinta={tinta} alto={altos.get(s.clave) ?? 100} />
        ))}
      </div>
    </div>
  );
}
