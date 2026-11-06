import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { llamar } from "@/lib/api";
import { distancia } from "@/lib/formato";
import { miUbicacion } from "@/lib/ubicacion";
import { Mapa, Pin, hayMapa, regionDe } from "@/componentes/mapa";
import { Boton, Mensaje, Segmentos, Vacio, sombra } from "@/componentes/ui";
import { TIPO_ALERTA, TarjetaAlerta, type AlertaLista } from "@/componentes/alerta";
import { coloresLugar, useColores } from "@/tema";
import { GuiaSeccion } from "@/componentes/onboarding";

const CENTRO_MX = { lat: 22.1565, lng: -100.9855 };

/**
 * Alertas (Fase 5): perros y gatos que la gente vio en la calle, en mapa o lista, a 10 km. El botón de subir una
 * alerta siempre a la vista. Referencias: Citizen y Nextdoor (app-mascota-perdida): foto grande, tipo y hace cuánto.
 */
export default function Alertas() {
  const c = useColores();
  const inset = useSafeAreaInsets();
  const [vista, setVista] = useState<"mapa" | "lista">(hayMapa ? "mapa" : "lista");
  const [aqui, setAqui] = useState<{ lat: number; lng: number } | null>(null);
  const [alertas, setAlertas] = useState<AlertaLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const u = (await miUbicacion()) ?? CENTRO_MX;
    setAqui({ lat: u.lat, lng: u.lng });
    const r = await llamar<{ alertas?: AlertaLista[] }>("alertasCerca", [u.lat, u.lng, 10]).catch(() => ({ error: "No hay conexión.", alertas: undefined }));
    setError(r.error);
    if (r.alertas) setAlertas(r.alertas);
    setCargando(false);
  }, []);
  useFocusEffect(useCallback(() => void cargar(), [cargar]));

  const activas = (alertas ?? []).filter((a) => a.estado === "sigue_ahi" || a.estado === "ya_no_esta");
  return (
    <>
      <GuiaSeccion seccion="alertas" />
      <Stack.Screen options={{ headerTitle: "Alertas", headerTransparent: vista === "mapa", headerStyle: vista === "mapa" ? { backgroundColor: "transparent" } : { backgroundColor: c.fondo } }} />
      <View style={{ flex: 1, backgroundColor: c.fondo }}>
        {vista === "mapa" ? (
          <Mapa style={{ flex: 1 }} initialRegion={regionDe((aqui ?? CENTRO_MX).lat, (aqui ?? CENTRO_MX).lng, 8)} region={aqui ? regionDe(aqui.lat, aqui.lng, 8) : undefined}>
            {(alertas ?? []).map((a) => (
              <Pin key={a.id} coordenada={{ latitude: a.lat, longitude: a.lng }} color={coloresLugar[a.tipo === "perdido" ? "perdido" : a.tipo]} icono={a.tipo === "herido" ? "curita" : a.tipo === "peligro" ? "cuidado" : "mascota"} alTocar={() => router.push(`/alertas/${a.id}`)} titulo={`${TIPO_ALERTA[a.tipo]}, ${distancia(a.distancia_m)}`} />
            ))}
          </Mapa>
        ) : (
          <FlatList
            data={alertas ?? []}
            keyExtractor={(a) => a.id}
            contentInsetAdjustmentBehavior="automatic"
            refreshing={cargando}
            onRefresh={cargar}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 140 + inset.bottom }}
            ListHeaderComponent={<Mensaje texto={error} />}
            ListEmptyComponent={!cargando ? <Vacio icono="alerta" titulo="Sin alertas cerca" texto="Si ves un perro o gato perdido, herido o en peligro, súbelo aquí y avisamos a la gente y a los negocios cerca." /> : undefined}
            renderItem={({ item: a }) => <TarjetaAlerta a={a} />}
          />
        )}
        <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: inset.bottom + 16, gap: 10 }}>
          {hayMapa ? (
            <View style={[{ alignSelf: "center", width: 220 }, sombra(c.sombra)]}>
              <Segmentos valor={vista} alCambiar={setVista} opciones={[{ valor: "mapa", texto: "Mapa" }, { valor: "lista", texto: `Lista${activas.length ? ` (${activas.length})` : ""}` }]} />
            </View>
          ) : null}
          <Boton titulo="Vi un animal en la calle" icono="camara" variante="peligro" alTocar={() => router.push("/alertas/nueva")} />
        </View>
      </View>
    </>
  );
}
