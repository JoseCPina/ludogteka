import { pedirEntrada, estadoEntrada, canjearEntrada, entrarConContrasena, renovarSesionMovil } from "@/lib/app/entrada";
import { pedirCodigoEntrada, verificarCodigoEntrada } from "@/lib/app/entrada-codigo";
import { sesionApp } from "@/lib/app/sesion";
import { leerFotoDeCartilla } from "@/lib/app/cartilla-foto";
import { registrarDispositivo, quitarDispositivo } from "@/lib/movil/push";
import { miMascota } from "@/lib/app/datos";
import { cartillaDe } from "@/lib/app/cartilla";
import { generarPdfCartilla } from "@/lib/app/pdf-cartilla";
import { formatearFecha } from "@/lib/formato";
import * as P from "@/lib/movil/pantallas";
import { cercaDeMi, fichaDeLugar, type Categoria } from "@/lib/movil/cerca";
import { alertasCerca, detalleAlerta, crearAlerta, actualizarAlerta, reportarAlerta, mensajeAlerta } from "@/lib/movil/alertas";
import * as negocios from "@/app/app/(sesion)/negocios/acciones";
import * as avisos from "@/app/app/(sesion)/avisos/acciones";
import * as cerca from "@/app/app/(sesion)/cerca/acciones";
import * as yo from "@/app/app/(sesion)/yo/acciones";
import * as nueva from "@/app/app/(sesion)/mascotas/nueva/acciones";
import * as cartilla from "@/app/app/(sesion)/mascotas/[id]/cartilla/acciones";
import * as seguimiento from "@/app/app/(sesion)/mascotas/[id]/seguimiento/acciones";
import * as perdida from "@/app/app/(sesion)/mascotas/[id]/perdida/acciones";
import * as atenciones from "@/app/app/(sesion)/mascotas/[id]/acciones-atenciones";

/**
 * Lo que la app nativa (apps/duenos-movil) puede pedir por /api/movil/<accion>. Una lista cerrada: el nombre de la
 * acción es la llave y nada fuera de aquí se puede invocar. Cada función es la MISMA que usa la web (sus acciones del
 * servidor y sus cargadores), con la sesión del celular (src/lib/movil/contexto.ts): comprueban la sesión y la base
 * vuelve a comprobar con la RLS. Las «publicas» son solo las de entrar (todavía no hay sesión).
 *
 * `form`: la acción recibe un FormData (fotos). El celular manda multipart con `args` (JSON) y los archivos; donde un
 * argumento vale "$form" va el FormData completo.
 */
type Accion = { fn: (...args: never[]) => Promise<unknown>; publica?: boolean };

const origenMovil = { ip: null, userAgent: "PeluDesk app nativa" };

export const ACCIONES: Record<string, Accion> = {
  // ── Entrar (sin sesión) ──
  pedirCodigoEntrada: { publica: true, fn: (async (telefono: string, canal?: "whatsapp" | "sms") => pedirCodigoEntrada({ telefono, canal, ip: null })) as Accion["fn"] },
  verificarCodigoEntrada: { publica: true, fn: (async (telefono: string, codigo: string) => verificarCodigoEntrada({ telefono, codigo, destino: "tokens" })) as Accion["fn"] },
  // Las tres de abajo son del flujo anterior: las sigue usando el APK ya instalado hasta que se actualice.
  pedirCodigo: { publica: true, fn: (async (telefono: string) => pedirEntrada({ telefono, ...origenMovil })) as Accion["fn"] },
  consultarEntrada: { publica: true, fn: (async (id: string) => ({ error: null, entrada: await estadoEntrada(id) })) as Accion["fn"] },
  canjearEntrada: { publica: true, fn: (async (id: string) => canjearEntrada(id, "tokens")) as Accion["fn"] },
  entrarConContrasena: { publica: true, fn: (async (telefono: string, password: string) => entrarConContrasena({ telefono, password }, "tokens")) as Accion["fn"] },
  renovarSesion: { publica: true, fn: (async (refreshToken: string) => renovarSesionMovil(refreshToken)) as Accion["fn"] },

  // ── Pantallas ──
  inicio: { fn: P.pantallaInicio },
  mascota: { fn: P.pantallaMascota },
  cartilla: { fn: P.pantallaCartilla },
  seguimiento: { fn: P.pantallaSeguimiento },
  perdida: { fn: P.pantallaPerdida },
  qr: { fn: P.pantallaQR },
  avisos: { fn: P.pantallaAvisos },
  yo: { fn: P.pantallaYo },
  negocioDeMascota: { fn: P.pantallaNegocioDeMascota },
  cita: { fn: P.pantallaCita },
  reservar: { fn: P.pantallaReservar },
  visitas: { fn: P.pantallaVisitas },
  pagos: { fn: P.pantallaPagos },
  pases: { fn: P.pantallaPases },
  contratos: { fn: P.pantallaContratos },

  // ── Mis mascotas, cartilla, seguimiento ──
  crearMascota: { fn: nueva.crearMascota },
  cambiarFoto: { fn: nueva.cambiarFoto },
  leerCartilla: { fn: (async (mascotaId: string, form: FormData) => leerFotoDeCartilla(mascotaId, form.get("foto"))) as Accion["fn"] },
  confirmarLectura: { fn: cartilla.confirmarLectura },
  // La cartilla en PDF para compartir con cualquier vet (la misma de /mascotas/<id>/cartilla/pdf), en base64.
  cartillaPdf: {
    fn: (async (mascotaId: string) => {
      const s = await sesionApp();
      const m = s ? await miMascota(mascotaId) : null;
      if (!s || !m) return null;
      const pdf = await generarPdfCartilla({
        mascota: { nombre: m.nombre, especie: m.especie, sexo: m.sexo, razaTexto: m.razaTexto, fechaNacimiento: m.fechaNacimiento, microchip: m.microchip },
        dueno: s.dueno.nombre,
        registros: await cartillaDe(m.id),
        generado: formatearFecha(new Date().toISOString(), "America/Mexico_City"),
      });
      return { error: null, nombre: `cartilla-${m.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, base64: Buffer.from(pdf).toString("base64") };
    }) as Accion["fn"],
  },
  agregarRegistro: { fn: cartilla.agregarRegistro },
  quitarRegistro: { fn: cartilla.quitarRegistro },
  recordatoriosDeMascota: { fn: cartilla.recordatoriosDeMascota },
  borrarFotosRevisadas: { fn: cartilla.borrarFotosRevisadas },
  agregarPeso: { fn: seguimiento.agregarPeso },
  quitarPeso: { fn: seguimiento.quitarPeso },
  agregarMedicamento: { fn: seguimiento.agregarMedicamento },
  terminarMedicamento: { fn: seguimiento.terminarMedicamento },
  agregarGasto: { fn: seguimiento.agregarGasto },
  quitarGasto: { fn: seguimiento.quitarGasto },
  cambiarOcultoAtencion: { fn: atenciones.cambiarOculto },

  // ── Mascota perdida ──
  marcarPerdida: { fn: perdida.marcarPerdida },
  marcarEncontrada: { fn: perdida.marcarEncontrada },
  responderHallador: { fn: perdida.responder },

  // ── Avisos y notificaciones nativas ──
  marcarLeido: { fn: avisos.marcarLeido },
  marcarTodosLeidos: { fn: avisos.marcarTodosLeidos },
  probarAviso: { fn: avisos.probarAviso },
  registrarDispositivo: {
    fn: (async (o: { token: string; plataforma: string; modelo?: string | null; versionApp?: string | null }) => {
      const s = await sesionApp();
      if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
      return registrarDispositivo(s.user.id, o);
    }) as Accion["fn"],
  },
  quitarDispositivo: {
    fn: (async (token: string) => {
      const s = await sesionApp();
      if (s) await quitarDispositivo(s.user.id, token);
      return { error: null };
    }) as Accion["fn"],
  },

  // ── Cerca de mí (Fase 4) y la cuenta ──
  buscarCerca: { fn: cerca.buscarCerca },
  cercaDeMi: {
    fn: (async (lat: number, lng: number, categoria: Categoria) => {
      if (!(await sesionApp())) return { error: "Tu sesión se cerró. Vuelve a entrar." };
      return cercaDeMi(Number(lat), Number(lng), categoria);
    }) as Accion["fn"],
  },
  fichaLugar: {
    fn: (async (o: { googlePlaceId: string | null; negocioId: string | null }) => {
      if (!(await sesionApp())) return { error: "Tu sesión se cerró. Vuelve a entrar." };
      return fichaDeLugar({ googlePlaceId: o?.googlePlaceId ?? null, negocioId: o?.negocioId ?? null });
    }) as Accion["fn"],
  },

  // ── Alertas de la calle (Fase 5) ──
  alertasCerca: { fn: (async (lat: number, lng: number, km?: number) => alertasCerca(Number(lat), Number(lng), Number(km) || 10)) as Accion["fn"] },
  alerta: { fn: detalleAlerta },
  crearAlerta: { fn: crearAlerta },
  actualizarAlerta: { fn: actualizarAlerta },
  reportarAlerta: { fn: reportarAlerta },
  mensajeAlerta: { fn: mensajeAlerta },
  guardarZona: { fn: cerca.guardarZona },
  guardarNombre: { fn: yo.guardarNombre },

  // ── Negocios con PeluDesk (Fase 3) ──
  confirmarVisita: { fn: negocios.confirmarVisitaApp },
  horas: { fn: negocios.horasApp },
  cupo: { fn: negocios.cupoApp },
  pedirCita: { fn: negocios.pedirCitaApp },
  cotizarRecoleccion: { fn: negocios.cotizarRecoleccionApp },
  direccionGuardada: { fn: negocios.direccionGuardadaApp },
  direccionDeMiUbicacion: { fn: negocios.direccionDeMiUbicacionApp },
  reservarEstancia: { fn: negocios.reservarApp },
  textoContrato: { fn: negocios.textoContratoApp },
  firmarContrato: { fn: negocios.firmarContratoApp },
  pedirLinkPago: { fn: negocios.pedirLinkPagoApp },
  resenar: { fn: negocios.resenarApp },
};
