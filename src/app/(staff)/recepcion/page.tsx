import { TableroDia } from "../tablero-dia";
import { VideosInicio } from "@/components/ayuda/videos-inicio";

// El inicio de recepción: el tablero del día de toda la casa. Guardería,
// Hotel y Estética siguen teniendo su propia pantalla filtrada; esta es
// la que se abre primero. Arriba, los videos para empezar (si ya hay).
export default async function RecepcionPage() {
  return (
    <div className="flex flex-col gap-6">
      <VideosInicio />
      <TableroDia />
    </div>
  );
}
