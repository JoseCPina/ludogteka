import { Pressable, Share, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { usePantalla, useAccion } from "@/lib/datos";
import { llamar } from "@/lib/api";
import { enCuanto, fechaCorta } from "@/lib/formato";
import { preguntarOrigen, tomarFoto } from "@/lib/fotos";
import { Pantalla } from "@/componentes/pantalla";
import { AvatarMascota, BotonIcono, Fila, Grupo, Insignia, Mensaje, Texto, sombra } from "@/componentes/ui";
import { Icono, type NombreIcono } from "@/componentes/icono";
import { radio, useColores } from "@/tema";

type Datos = {
  mascota: { id: string; nombre: string; especieTexto: string; edad: string | null; razaTexto: string | null; fotoUrl: string | null; sexo: string | null; perdidaAt: string | null; encontradaAt: string | null; fallecido: boolean; microchip: string | null; vinculos: { negocioId: string; negocioNombre: string }[] };
  proximas: { id: string; tipo: string; nombre: string; proximaDosis: string | null; dias: number | null }[];
  totalCartilla: number;
  peso: { kg: number; fecha: string } | null;
  medicamentosActivos: number;
  atenciones: { id: string; negocioNombre: string; resumen: string; fecha: string; oculto: boolean }[];
  perfilUrl: string;
};

/** La ficha de una mascota: foto grande, tres datos a la vista, lo que le toca y todo lo suyo en una lista. */
export default function Mascota() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColores();
  const p = usePantalla<Datos>("mascota", [id]);
  const foto = useAccion();
  const m = p.datos?.mascota;
  const perdida = Boolean(m?.perdidaAt && !m?.encontradaAt);

  const cambiarFoto = async () => {
    const origen = await preguntarOrigen(`Foto de ${m?.nombre ?? "tu mascota"}`);
    if (!origen) return;
    const f = await tomarFoto(origen, { recortar: true });
    if (!f) return;
    const r = await foto.ejecutar(() => llamar("cambiarFoto", [id, "$form"], [{ campo: "foto", uri: f.uri, nombre: f.nombre, tipo: f.tipo }]));
    if (r && !r.error) p.recargar();
  };

  const dato = (icono: NombreIcono, valor: string, etiqueta: string, ir: () => void) => (
    <Pressable onPress={ir} accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${valor}`} style={({ pressed }) => [{ flex: 1, backgroundColor: c.superficie, borderRadius: radio.tarjeta, padding: 14, gap: 8 }, pressed && { opacity: 0.8 }]}>
      <Icono nombre={icono} tamano={20} color={c.primario} />
      <View>
        <Texto v="encabezado" lineas={1}>{valor}</Texto>
        <Texto v="pie">{etiqueta}</Texto>
      </View>
    </Pressable>
  );

  return (
    <>
      <Stack.Screen options={{ title: m?.nombre ?? "", headerRight: () => (m ? <BotonIcono icono="compartir" etiqueta="Compartir su perfil" tamano={36} alTocar={() => Share.share({ message: `${m.nombre} en PeluDesk: ${p.datos!.perfilUrl}` })} /> : null) }} />
      <Pantalla cargando={p.cargando} error={p.error} refrescando={p.refrescando} alRefrescar={p.refrescar} alReintentar={p.refrescar}>
        {m && p.datos ? (
          <>
            <View style={{ alignItems: "center", gap: 12, paddingTop: 4 }}>
              <Pressable onPress={cambiarFoto} accessibilityRole="button" accessibilityLabel="Cambiar su foto" style={[{ borderRadius: 48 }, sombra(c.sombra)]}>
                <AvatarMascota nombre={m.nombre} foto={m.fotoUrl} tamano={148} />
                <View style={{ position: "absolute", right: -2, bottom: -2, width: 40, height: 40, borderRadius: 20, backgroundColor: c.primario, borderWidth: 3, borderColor: c.fondo, alignItems: "center", justifyContent: "center" }}>
                  <Icono nombre="camara" tamano={18} color={c.sobrePrimario} />
                </View>
              </Pressable>
              <View style={{ alignItems: "center", gap: 6 }}>
                <Texto v="titulo">{m.nombre}</Texto>
                <Texto v="secundario">{[m.especieTexto, m.razaTexto, m.edad].filter(Boolean).join(" · ")}</Texto>
                {perdida ? <Insignia texto="Perdida: la estamos buscando" tono="peligro" /> : m.fallecido ? <Insignia texto="En nuestro recuerdo" tono="neutro" /> : null}
              </View>
              <Mensaje texto={foto.ocupado ? null : foto.error} />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              {dato("peso", p.datos.peso ? `${p.datos.peso.kg} kg` : "Sin peso", p.datos.peso ? fechaCorta(p.datos.peso.fecha) : "Anótalo", () => router.push(`/mascotas/${id}/seguimiento`))}
              {dato("vacuna", String(p.datos.totalCartilla), p.datos.totalCartilla === 1 ? "registro" : "registros", () => router.push(`/mascotas/${id}/cartilla`))}
              {dato("medicina", String(p.datos.medicamentosActivos), p.datos.medicamentosActivos === 1 ? "medicina" : "medicinas", () => router.push(`/mascotas/${id}/seguimiento`))}
            </View>

            {p.datos.proximas.length ? (
              <Grupo titulo="Le toca">
                {p.datos.proximas.map((r, i) => (
                  <Fila key={r.id} icono="vacuna" colorIcono={r.dias !== null && r.dias < 0 ? c.peligro : c.primario} titulo={r.nombre} detalle={r.tipo === "vacuna" ? "Vacuna" : "Desparasitación"} derecha={<Insignia texto={enCuanto(r.dias)} tono={r.dias !== null && r.dias < 0 ? "peligro" : r.dias !== null && r.dias <= 30 ? "aviso" : "neutro"} />} alTocar={() => router.push(`/mascotas/${id}/cartilla`)} ultima={i === p.datos!.proximas.length - 1} />
                ))}
              </Grupo>
            ) : p.datos.totalCartilla === 0 ? (
              <Pressable onPress={() => router.push(`/mascotas/${id}/leer`)} style={{ backgroundColor: c.primario, borderRadius: radio.tarjeta, padding: 18, flexDirection: "row", gap: 14, alignItems: "center" }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}>
                  <Icono nombre="camara" tamano={24} color={c.sobrePrimario} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Texto v="encabezado" color={c.sobrePrimario}>Tómale foto a su cartilla</Texto>
                  <Texto v="secundario" color={c.sobrePrimario}>Leemos las vacunas y te avisamos cuando le toque cada una.</Texto>
                </View>
              </Pressable>
            ) : null}

            <Grupo titulo={`Todo de ${m.nombre}`}>
              <Fila icono="vacuna" titulo="Cartilla" detalle="Vacunas y desparasitaciones" alTocar={() => router.push(`/mascotas/${id}/cartilla`)} />
              <Fila icono="peso" titulo="Peso, medicinas y gastos" alTocar={() => router.push(`/mascotas/${id}/seguimiento`)} />
              <Fila icono="qr" titulo="Placa con QR" detalle="Quien la encuentre te escribe sin ver tu número" alTocar={() => router.push(`/mascotas/${id}/qr`)} />
              <Fila icono="calendario" titulo="Pedir cita" alTocar={() => router.push(`/mascotas/${id}/cita`)} />
              {m.vinculos.length ? <Fila icono="hotel" titulo="Reservar guardería u hotel" alTocar={() => router.push(`/mascotas/${id}/reservar`)} /> : null}
              <Fila icono="alerta" colorIcono={c.peligro} titulo={perdida ? "La estamos buscando" : "Se perdió"} detalle={perdida ? "Mensajes y cartel" : "Avisamos a la gente y los negocios cerca"} alTocar={() => router.push(`/mascotas/${id}/perdida`)} ultima />
            </Grupo>

            {m.vinculos.length ? (
              <Grupo titulo="Dónde la conocen" pie="Sus fotos del día, reportes, carnet y recetas de cada negocio.">
                {m.vinculos.map((v, i) => (
                  <Fila key={v.negocioId} icono="tienda2" titulo={v.negocioNombre} alTocar={() => router.push(`/mascotas/${id}/negocio/${v.negocioId}`)} ultima={i === m.vinculos.length - 1} />
                ))}
              </Grupo>
            ) : null}

            {p.datos.atenciones.filter((a) => !a.oculto).length ? (
              <Grupo titulo="Registrado con su QR">
                {p.datos.atenciones.filter((a) => !a.oculto).map((a, i, arr) => (
                  <Fila key={a.id} icono="veterinaria" titulo={a.negocioNombre} detalle={`${a.resumen} · ${fechaCorta(a.fecha)}`} ultima={i === arr.length - 1} />
                ))}
              </Grupo>
            ) : null}
          </>
        ) : null}
      </Pantalla>
    </>
  );
}
