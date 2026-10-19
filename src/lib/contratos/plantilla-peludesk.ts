// El contrato general que PeluDesk le propone a un negocio de hotel y guardería en su bienvenida (QA S16).
// Tomado de la estructura del contrato real de un negocio que usa PeluDesk, SIN sus datos: ni nombre, ni domicilio,
// ni ciudad, ni horarios, ni montos. Lo propio del negocio (horario de guardería, autorizaciones del dueño) sale de
// las variables que el sistema ya sabe llenar (CAMPOS_CONTRATO). El negocio lo edita antes de publicarlo y, ya
// publicado, lo cambia en Contratos como cualquier otra versión.

export function tituloContratoPeluDesk(negocio: string): string {
  return `Contrato de prestación de servicios — ${negocio}`;
}

export function cuerpoContratoPeluDesk(negocio: string): string {
  const N = negocio.trim() || "EL NEGOCIO";
  return `CONTRATO DE PRESTACIÓN DE SERVICIOS DE HOTEL Y GUARDERÍA CANINA

Contrato que celebran ${N} (en adelante, «EL NEGOCIO») y la persona cuyos datos aparecen abajo (en adelante, «EL CLIENTE»), respecto del perro identificado en este documento.

DATOS DE CONTRATACIÓN

EL CLIENTE
Nombre: {{cliente_nombre}}
Teléfono: {{cliente_telefono}}
Correo: {{cliente_email}}

EL PERRO
Nombre: {{perro_nombre}}
Raza: {{perro_raza}}
Sexo: {{perro_sexo}}
Fecha de nacimiento: {{perro_fecha_nacimiento}}
Talla: {{perro_tamano}}

Servicios: {{servicios_disponibles}}
Horario de guardería: {{horario_guarderia}}
Contacto de emergencia: {{contacto_emergencia}}

DECLARACIONES
I. EL CLIENTE declara que es propietario, tutor o persona autorizada para contratar el servicio; que la información que da es verdadera y completa, y que informará cualquier enfermedad, alergia, medicamento, ansiedad, intento de escape, mordida, agresión o conducta relevante del perro.
II. EL NEGOCIO declara que prestará el servicio con personal y medidas razonables de cuidado, conforme a la disponibilidad contratada y a las políticas que le informa a EL CLIENTE.
III. Ambas partes reconocen que la convivencia entre perros implica riesgos que no se pueden eliminar por completo, aun con supervisión, evaluación de comportamiento y medidas preventivas.

CLÁUSULAS

1. Objeto
EL NEGOCIO dará alojamiento, cuidado, supervisión y las atenciones contratadas en las fechas confirmadas. La reservación, el comprobante de pago y la ficha de ingreso forman parte de este contrato. Los servicios adicionales (baño, estética, transporte, medicamentos especiales u otros) solo se prestan si se pidieron y aceptaron, con su costo.

2. Pago y estancia
La estancia se paga conforme a lo acordado al reservar. EL NEGOCIO puede no recibir al perro si hay saldo pendiente, falta documentación o no se cumplen los requisitos de ingreso. Una salida antes de la fecha reservada no genera devolución por los días no usados, salvo que EL NEGOCIO lo acepte.

3. Entrega y recogida
EL CLIENTE entrega y recoge al perro dentro de los días y horarios que EL NEGOCIO le informa. Si el perro no se recoge a tiempo, se queda bajo resguardo hasta el siguiente día hábil, con el cobro de las noches adicionales y los cuidados que se generen.

4. Alimento y pertenencias
EL CLIENTE entrega alimento suficiente e identificado para toda la estancia, con instrucciones de cantidad y horario. Si falta, EL NEGOCIO puede darle un alimento compatible y EL CLIENTE reembolsa su costo. Los objetos personales (camas, correas, juguetes, platos) ingresan bajo responsabilidad de EL CLIENTE.

5. Salud, vacunas y medicamentos
EL CLIENTE declara que el perro ingresa sano, con las vacunas y la desparasitación vigentes que pide EL NEGOCIO y sin síntomas de enfermedad contagiosa. EL NEGOCIO puede no recibirlo, aislarlo o pedir que lo recojan si presenta síntomas que pongan en riesgo su bienestar o el de otros perros. Los medicamentos se entregan en su envase original, con instrucciones por escrito.

6. Atención veterinaria
Ante enfermedad, lesión o accidente, EL NEGOCIO procurará contactar a EL CLIENTE y a su contacto de emergencia. EL CLIENTE autoriza el traslado y la atención veterinaria cuando haya urgencia o no se le pueda localizar a tiempo.
Instrucciones médicas autorizadas: {{autorizacion_medica_notas}}
Tope de gasto autorizado sin confirmación adicional: {{tope_gasto_autorizado}}. Este tope no limita la atención indispensable cuando hay riesgo grave y no se localiza a EL CLIENTE.
Los gastos veterinarios los cubre EL CLIENTE, salvo que el daño sea consecuencia de dolo, negligencia o incumplimiento de EL NEGOCIO.

7. Conducta
Si el perro muestra agresión, monta persistente, intentos de fuga, ansiedad intensa u otra conducta que afecte la seguridad del grupo, EL NEGOCIO puede separarlo, pedir que lo recojan o terminar el servicio, sin devolución por el periodo no usado.

8. Daños causados por el perro
EL CLIENTE responde por los daños que su perro cause a otros animales, personas o instalaciones, incluida la atención veterinaria razonable y comprobable. Esta cláusula no libera a EL NEGOCIO cuando la ley le atribuya responsabilidad.

9. Riesgos de la convivencia
EL CLIENTE acepta que en el juego normal pueden presentarse rasguños, pequeñas marcas, pérdida de pelo o lesiones superficiales aun con supervisión razonable, sin que eso sea por sí mismo negligencia. EL NEGOCIO avisará de cualquier lesión que amerite atención.

10. Comunicación
EL NEGOCIO informará oportunamente cualquier eventualidad relevante por los medios de contacto que dio EL CLIENTE. EL CLIENTE se mantiene localizable o deja un contacto de emergencia que pueda tomar decisiones.

11. Imagen y datos personales
Autorización para usar fotografías o videos del perro en redes sociales y materiales de EL NEGOCIO: {{consentimiento_imagen}}. Negarse no afecta el servicio y la autorización se puede revocar por escrito. Los datos personales se usan para dar el servicio y contactar a EL CLIENTE, conforme al aviso de privacidad de EL NEGOCIO.

12. Cancelación y terminación
Las cancelaciones y cambios de fecha siguen la política que EL NEGOCIO informa al reservar. EL NEGOCIO puede suspender o terminar el servicio por riesgo sanitario, conducta peligrosa, información falsa, falta de pago o causa de fuerza mayor. Ninguna cláusula se interpreta en contra de los derechos irrenunciables del consumidor.

13. Abandono
Si EL CLIENTE no recoge al perro en la fecha pactada y no responde, siguen generándose los cargos de hospedaje y cuidado, y EL NEGOCIO hace intentos razonables y documentados de contacto. La falta prolongada de recogida se atiende conforme a la ley aplicable.

14. Jurisdicción
Para interpretar y cumplir este contrato, las partes se sujetan a las leyes aplicables y a las autoridades competentes del domicilio de EL NEGOCIO, sin limitar el derecho de EL CLIENTE de acudir a la Procuraduría Federal del Consumidor.

ACEPTACIÓN
EL CLIENTE declara haber leído y aceptado este contrato y haber recibido información suficiente sobre precios, horarios y condiciones.

Fecha: {{fecha_firma}}
Observaciones de ingreso: {{observaciones_ingreso}}

EL CLIENTE: {{cliente_nombre}}`;
}
