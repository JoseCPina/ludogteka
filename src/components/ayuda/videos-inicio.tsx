import { tutorialesDeSesion } from "@/lib/tutoriales/de-sesion";
import { VideosParaEmpezar } from "./videos-para-empezar";
import { OcultableLocal } from "./ocultable-local";

// La tarjeta «Empieza con estos videos» del inicio de admin y de recepción.
// Se puede ocultar (queda en este navegador); sin videos publicados no sale.
// La lista es la misma que ya pidió el layout («¿Cómo se hace?»): una sola consulta por petición (tutorialesDeSesion).
export async function VideosInicio() {
  const videos = await tutorialesDeSesion();
  if (!videos.length) return null;
  return (
    <OcultableLocal clave="videos-inicio-oculto">
      <VideosParaEmpezar videos={videos} />
    </OcultableLocal>
  );
}
