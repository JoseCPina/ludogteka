import { PilaDePestana } from "@/componentes/pila";

export default function Layout() {
  return <PilaDePestana titulo="Alertas" pantallas={[{ nombre: "nueva", titulo: "Nueva alerta", modal: true }, { nombre: "[id]", titulo: "Alerta" }]} />;
}
