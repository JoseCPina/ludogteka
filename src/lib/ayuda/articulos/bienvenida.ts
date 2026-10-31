import type { Articulo } from "../tipos";

// La bienvenida de un negocio nuevo (QA S16, 19 de octubre de 2026). Cada paso se marca «Listo» solo cuando el negocio
// ya puede operar con él. Los botones y pantallas de aquí son los de la app; si una cambia, se cambia su artículo.
export const ARTICULOS_BIENVENIDA: Articulo[] = [
  {
    slug: "primeros-pasos-para-operar",
    titulo: "Primeros pasos: qué te falta para empezar a operar",
    resumen: "La bienvenida te dice, paso por paso, qué necesita tu negocio para atender de verdad, según lo que ofreces.",
    grupo: "inicio",
    modulo: null,
    roles: ["admin"],
    rutas: ["/bienvenida"],
    palabras: ["bienvenida", "empezar", "configurar", "primeros pasos", "listo", "puede operar", "checklist", "equipo", "médico", "contrato"],
    cuerpo: `Cuando abres tu negocio en PeluDesk llegas a **Bienvenida**. Arriba dice **Para operar te falta:** con la lista exacta de lo que falta (cada renglón te lleva a donde se resuelve) o, cuando ya está todo, **Tu negocio ya puede operar**. Un paso se marca **Listo** solo cuando de verdad ya puedes trabajar con él, no cuando capturaste «algo».

## Lo que piden todos

1. **Datos del negocio**: el **WhatsApp de recepción**, en [Administración](/admin#configuracion), y la **Dirección del negocio**, en [Perfil y página web](/admin/perfil). La dirección es una sola: la misma de tu página web.
2. **Servicios y precios**: todos los precios de lo que ofreces, en [Servicios](/servicios). Lo que no ofrezcas, márcalo **No aplica**. Lo de los servicios que no escogiste no sale ni se cuenta.
3. **Horario** (y **cupo**, si das hotel o guardería): en [Administración](/admin#horario), aprieta **Guardar horario**.

## Según tu giro

- **Estética — Quién atiende la estética**: para asignarle una cita a alguien, esa persona necesita cuenta. En [Tu equipo](/bienvenida/equipo) escoge **Invitar con cuenta** (nombre, correo y qué hace en la app) o, si tú haces los servicios, aprieta **Yo atiendo las citas**. Alguien dado de alta **Solo en nómina** (sin cuenta) no aparece en la agenda.
- **Veterinaria — Médico veterinario**: antes de agendar consultas hace falta un médico con cuenta y **cédula profesional** (7 u 8 números). Si tú eres el médico, en [Médico veterinario](/bienvenida/medico) escribe tu cédula y aprieta **Designarme médico**. Si es otra persona, invítala en Tu equipo y marca **Es médico veterinario**.
- **Hotel y guardería**: con tu cuenta basta para atender. Además:
  - **Requisitos para hospedar**: en [Requisitos para hospedar](/bienvenida/requisitos) decides si pides **Evaluación de comportamiento** y qué vacunas son obligatorias, con su vigencia en meses. Aprieta **Confirmar requisitos**.
  - **Contrato**: en [Contrato](/bienvenida/contrato) te dejamos una plantilla general de PeluDesk para hotel y guardería, ya con el nombre de tu negocio. Léela, ajústala y aprieta **Publicar contrato**. Lo firma el dueño al dar de alta a su perro.

**Tu primer cliente** sale al final como **Cuando quieras**: no hace falta para operar.

## Tu equipo, en un solo formulario

En [Tu equipo](/bienvenida/equipo) escribe el **Nombre completo** y escoge:

- **Invitar con cuenta**: escribe su **Correo** y aprieta **Invitar**. La app no manda correos: te damos el **Link de invitación** para mandárselo, con **Copiar** y **Mandar por WhatsApp** (a su teléfono si lo capturaste; si no, escoges el chat). Con él crea su contraseña.
- **Solo en nómina**: para quien no usa la app (limpieza, chofer). Aprieta **Dar de alta en nómina**.

En **Horario y forma de pago (opcional)** puedes dejar capturados sus días y horas y cuánto se le paga; si no, lo haces después en su ficha de Empleados.

## Avisos por WhatsApp

Los recordatorios de citas, llegadas y vacunas pueden salir solos, el día anterior: préndelos en [Recordatorios por WhatsApp](/admin/recordatorios). Además, en la cita, la reserva y la ficha del cliente hay botones como **Confirmación**, **Recordatorio**, **Listo para recoger** e **Invitar al portal**. Cada uno te enseña el mensaje y, con **Abrir WhatsApp con este mensaje**, abre WhatsApp con el texto ya escrito al número del cliente: esos los mandas tú.

## Si algo no sale

- «La cédula profesional son 7 u 8 números»: escríbela solo con números, como aparece en el Registro Nacional de Profesionistas.
- Un paso sigue sin **Listo**: abre el paso; abajo de la explicación dice exactamente qué falta.`,
  },
  {
    slug: "requisitos-para-hospedar",
    titulo: "Cómo decidir qué le pides a un perro para hospedarlo",
    resumen: "Prende o apaga la evaluación de comportamiento y cada vacuna obligatoria, y ajusta su vigencia.",
    grupo: "guarderia",
    modulo: ["guarderia", "hotel"],
    roles: ["admin"],
    rutas: ["/bienvenida/requisitos"],
    palabras: ["requisitos", "vacunas obligatorias", "evaluación", "comportamiento", "bordetella", "vigencia", "quitar requisito"],
    cuerpo: `Lo que le pides a un perro antes de recibirlo en guardería u hotel lo decides tú. Lo cambia admin o quien tenga el permiso «Configuración del negocio».

1. Entra a [Requisitos para hospedar](/bienvenida/requisitos) (también desde la bienvenida).
2. **Evaluación de comportamiento**: prendida, un perro sin evaluación no se puede reservar (un admin, o quien tenga «Excepciones al reservar», puede autorizar una excepción con motivo). Apagada, se reserva sin ella; la puedes seguir registrando en su expediente.
3. **Vacunas y desparasitación**: las prendidas tienen que estar vigentes para reservar. En **Vigencia** pon cuántos meses dura cada aplicación (de 1 a 60).
4. Aprieta **Confirmar requisitos** (o **Guardar cambios**).

Se aplican desde la siguiente reserva. El expediente del perro dice lo mismo que la reserva: si dice **Nada bloquea una reserva de guardería u hotel.**, la reserva entra; si algo falta, lo lista.

> Celo, gestación y las alertas que bloquean (por ejemplo, agresividad) bloquean siempre: no se apagan aquí.`,
  },
];
