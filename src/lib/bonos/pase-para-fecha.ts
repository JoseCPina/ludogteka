/**
 * Qué pase usaría un perro en una fecha, ANTES de reservar, para que la
 * pantalla lo diga y deje escoger entre usarlo o pagar el día suelto.
 *
 * Es la misma regla que aplicar_bono_a_estancia() en la base (migración
 * 20260923161648): solo guardería de día completo (unidad 'dia'); solo los
 * paquetes de ESE perro cuyo servicio incluido es el de la estancia; vigente
 * el día de la estancia (o hoy, si la fecha ya pasó); con al menos un pase;
 * y de ellos, el que vence primero (sin vencimiento al final) y luego el
 * más antiguo. La base es la que decide al guardar: esto solo lo anticipa.
 */
export type PaqueteDePerro = {
  id: string;
  perro_id: string;
  servicio_nombre: string;
  servicio_incluido_id: string | null;
  cantidad_total: number;
  cantidad_disponible: number;
  fecha_compra: string;
  fecha_vencimiento: string | null;
  estado: string;
  ilimitado: boolean;
};

export type ServicioParaPase = { id: string; categoria: string; unidad: string };

export type PaseParaFecha =
  // Hotel o cualquier cosa que no es guardería: los pases no aplican y no
  // hay nada que decir.
  | { caso: "no_aplica" }
  // Guardería por hora con paquetes: se avisa que el pase no cubre la hora.
  | { caso: "por_hora"; paquetes: PaqueteDePerro[] }
  | { caso: "sin_paquetes" }
  | { caso: "no_cubre"; paquete: PaqueteDePerro; razon: "vence_antes" | "sin_pases" }
  | { caso: "cubre"; paquete: PaqueteDePerro; otros: number };

const vigenteEn = (p: PaqueteDePerro, fecha: string) => !p.fecha_vencimiento || p.fecha_vencimiento >= fecha;

function porVencimiento(a: PaqueteDePerro, b: PaqueteDePerro) {
  if (a.fecha_vencimiento !== b.fecha_vencimiento) {
    if (!a.fecha_vencimiento) return 1;
    if (!b.fecha_vencimiento) return -1;
    return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
  }
  return a.fecha_compra.localeCompare(b.fecha_compra);
}

export function paseParaFecha(
  paquetes: PaqueteDePerro[],
  perroId: string,
  servicio: ServicioParaPase | undefined,
  fecha: string,
  hoy: string
): PaseParaFecha {
  if (!servicio || servicio.categoria !== "guarderia") return { caso: "no_aplica" };
  const delPerro = paquetes.filter((p) => p.perro_id === perroId && p.estado !== "cancelado");

  if (servicio.unidad !== "dia") {
    const vivos = delPerro.filter((p) => p.cantidad_disponible > 0 && vigenteEn(p, hoy));
    return vivos.length ? { caso: "por_hora", paquetes: vivos } : { caso: "no_aplica" };
  }

  const deEsteServicio = delPerro.filter((p) => p.servicio_incluido_id === servicio.id);
  if (deEsteServicio.length === 0) return { caso: "sin_paquetes" };

  const referencia = fecha > hoy ? fecha : hoy;
  const candidatos = deEsteServicio
    .filter((p) => vigenteEn(p, referencia) && p.cantidad_disponible >= 1)
    .sort(porVencimiento);
  if (candidatos.length) return { caso: "cubre", paquete: candidatos[0], otros: candidatos.length - 1 };

  // No cubre: se explica con el paquete que llega más lejos (el que vence
  // más tarde), que es el que uno esperaría que alcanzara.
  const elQueMasDura = [...deEsteServicio].sort((a, b) => -porVencimiento(a, b))[0];
  const razon = elQueMasDura.cantidad_disponible >= 1 && !vigenteEn(elQueMasDura, referencia) ? "vence_antes" : "sin_pases";
  return { caso: "no_cubre", paquete: elQueMasDura, razon };
}
