import { Esqueleto, EsqueletoColumnas, EsqueletoSeccion, EsqueletoTarjetas } from "@/components/ui/esqueleto";

// Tiempo del panel, cuarta vuelta (2 de noviembre de 2026): el tablero del día va dentro de <Suspense> en Recepción y en
// el Inicio del admin. El encabezado, el menú y el título salen sin esperar sus consultas; el tablero llega después en
// la MISMA respuesta (streaming) y mientras tanto se ve su forma.
export function EsqueletoTableroDia() {
  return (
    <Esqueleto etiqueta="el tablero del día">
      <EsqueletoTarjetas n={4} />
      <EsqueletoSeccion filas={2} />
      <EsqueletoColumnas n={3} filas={2} />
    </Esqueleto>
  );
}

export function EsqueletoSeccionesAdmin() {
  return (
    <Esqueleto etiqueta="la administración del negocio">
      <EsqueletoSeccion filas={3} />
      <EsqueletoSeccion filas={3} />
    </Esqueleto>
  );
}
