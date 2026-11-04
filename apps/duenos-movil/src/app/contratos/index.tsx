import { router } from "expo-router";
import { usePantalla } from "@/lib/datos";
import { fechaCorta } from "@/lib/formato";
import { Pantalla } from "@/componentes/pantalla";
import { Fila, Grupo, Vacio } from "@/componentes/ui";
import { useColores } from "@/tema";

type Contrato = { id: string; negocioId: string; negocioNombre: string; tipoNombre: string; titulo: string; createdAt: string };

export default function Contratos() {
  const c = useColores();
  const p = usePantalla<{ contratos: Contrato[] }>("contratos");
  const lista = p.datos?.contratos ?? [];
  return (
    <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
      {p.datos && lista.length === 0 ? <Vacio icono="listo" titulo="Nada por firmar" texto="Cuando un negocio te mande un contrato, aparece aquí." /> : null}
      {lista.length ? (
        <Grupo titulo="Por firmar">
          {lista.map((k, i) => <Fila key={k.id} icono="firma" colorIcono={c.aviso} titulo={k.titulo || k.tipoNombre} detalle={`${k.negocioNombre} · ${fechaCorta(k.createdAt)}`} alTocar={() => router.push(`/contratos/${k.negocioId}/${k.id}`)} ultima={i === lista.length - 1} />)}
        </Grupo>
      ) : null}
    </Pantalla>
  );
}
