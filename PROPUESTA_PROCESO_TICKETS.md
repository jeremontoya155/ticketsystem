# Propuesta de Evolucion del Sistema de Tickets

## 1. Resumen ejecutivo

El proyecto actual es un sistema web de gestion de tickets desarrollado con Node.js, Express, EJS y PostgreSQL. La aplicacion ya permite registrar reclamos, administrar usuarios y empresas, adjuntar imagenes, asignar responsables, cambiar estados, dejar historial de comentarios, emitir notificaciones internas y enviar reportes por correo electronico.

La propuesta es evolucionar este sistema hacia una plataforma centralizada de atencion y seguimiento operativo, incorporando la recepcion automatica de solicitudes desde correo electronico y WhatsApp, la conexion con el sistema existente de VFP, y la trazabilidad de procesos asociados a recepciones, armado y gestion de tickets.

El objetivo es que todos los reclamos, solicitudes y novedades entren por canales controlados, queden registrados como tickets, puedan asignarse a responsables, se notifiquen por mail o WhatsApp segun corresponda, y mantengan historial completo para auditoria y seguimiento.

## 2. Estado actual del software

El sistema actual cuenta con las siguientes capacidades implementadas:

- Login de usuarios con roles.
- Roles principales: administrador, desarrollo y soporte.
- Alta, listado, busqueda y visualizacion de tickets.
- Estados de ticket: Pendiente, En Proceso, Resuelto y Cerrado.
- Prioridades: Baja, Media, Alta y Urgente.
- Asignacion de receptor y ejecutor.
- Gestion de empresas/clientes con datos de contacto.
- Comentarios e historial por ticket.
- Adjuntos e imagenes asociados al ticket o a comentarios.
- Notificaciones internas en pantalla.
- Configuracion de notificaciones por usuario.
- Envio de reportes por mail mediante Nodemailer.
- Confirmacion por mail al creador del ticket.
- Dashboard con metricas por estado, prioridad y tendencia semanal.
- Modulo administrativo para usuarios, empresas y preferencias de notificacion.
- Radar tecnico para sugerir antecedentes, palabras clave, checklist y borradores tecnicos.
- Integracion beta con Groq para asistencia tecnica sobre tickets.

Tecnologias actuales detectadas:

- Backend: Node.js + Express.
- Frontend server-rendered: EJS, HTML, CSS y JavaScript.
- Base de datos: PostgreSQL.
- Sesiones: express-session con connect-pg-simple.
- Mail: Nodemailer.
- Adjuntos: Multer.
- Autenticacion: bcryptjs.
- Graficos: Chart.js en frontend.
- IA opcional: Groq API.

## 3. Objetivo funcional

Centralizar en una unica plataforma las solicitudes que hoy pueden llegar por distintos canales, principalmente:

- Carga manual desde el sistema web.
- Correos electronicos recibidos en casillas operativas.
- Mensajes recibidos por WhatsApp.
- Solicitudes o datos provenientes del sistema de VFP.
- Novedades vinculadas a recepciones y armado.

El sistema debera transformar esas entradas en tickets trazables, asignables y notificables, evitando la dispersion de informacion en mails, celulares, planillas o conversaciones aisladas.

## 4. Alcance propuesto

### 4.1 Centralizacion de tickets por mail

Se desarrollara un modulo de recepcion de correos para que los mensajes entrantes puedan convertirse automaticamente en tickets.

Funcionalidades previstas:

- Lectura de una o mas casillas configuradas.
- Identificacion de remitente, asunto, cuerpo del mensaje y adjuntos.
- Creacion automatica de ticket desde un mail recibido.
- Asociacion del ticket a una empresa/cliente cuando el remitente coincida con un registro existente.
- Clasificacion inicial por prioridad o tipo segun reglas simples.
- Conservacion del contenido original del mail dentro del historial del ticket.
- Carga de adjuntos del mail como adjuntos del ticket.
- Respuesta o confirmacion automatica por mail cuando se genere el ticket.
- Envio de reportes de avance o cierre desde el ticket hacia el cliente.

### 4.2 Integracion con WhatsApp usando whatsapp-web.js

Se incorporara WhatsApp como canal de entrada y salida utilizando `whatsapp-web.js`.

Funcionalidades previstas:

- Conexion de una cuenta operativa de WhatsApp mediante sesion web.
- Recepcion de mensajes entrantes.
- Alta automatica o asistida de tickets desde mensajes de WhatsApp.
- Identificacion por numero de telefono y asociacion con cliente/empresa.
- Registro del mensaje original dentro del historial del ticket.
- Soporte para imagenes o archivos enviados por WhatsApp, sujeto a validacion tecnica y permisos del entorno.
- Confirmacion automatica al cliente indicando que el ticket fue generado.
- Envio de novedades por WhatsApp ante cambios relevantes del ticket.
- Plantillas de respuesta para recepcion, avance, solicitud de informacion y cierre.

Consideracion tecnica: `whatsapp-web.js` depende de una sesion activa de WhatsApp Web. Para operacion estable se debera definir un servidor o equipo de ejecucion permanente, politicas de reconexion, monitoreo de sesion y resguardo de credenciales/sesion.

### 4.3 Union con el sistema de VFP

Se desarrollara una capa de integracion para vincular el sistema de tickets con el sistema existente en VFP.

Objetivos de la integracion:

- Consultar o sincronizar clientes/empresas desde VFP.
- Relacionar tickets con codigos externos ya utilizados por VFP.
- Evitar duplicacion de datos maestros.
- Permitir que la informacion operativa relevante quede conectada con el circuito actual.
- Incorporar datos de recepciones y armado cuando correspondan al reclamo o solicitud.

La forma exacta de integracion dependera del acceso disponible al sistema VFP. Las alternativas posibles son:

- Lectura directa de tablas DBF.
- Exportacion/importacion controlada mediante archivos intermedios.
- Conexion ODBC si el entorno lo permite.
- Servicio puente que exponga datos necesarios para el sistema web.

Durante el relevamiento se definira la opcion mas segura y mantenible, priorizando no afectar la operacion actual del sistema VFP.

### 4.4 Recepciones y armado

Se agregara soporte funcional para tickets relacionados con procesos de recepcion y armado.

Funcionalidades previstas:

- Tipificacion de tickets vinculados a recepcion, armado, soporte, desarrollo u operacion.
- Registro de datos especificos del proceso cuando aplique.
- Asociacion con cliente, comprobante, referencia externa o numero operativo proveniente de VFP.
- Historial de novedades por mail y WhatsApp.
- Notificaciones a responsables internos.
- Seguimiento del estado del caso hasta su resolucion o cierre.

El objetivo es que recepciones y armado no queden como conversaciones sueltas, sino como casos con responsable, evidencia, estado y trazabilidad.

### 4.5 Mejoras en gestion interna

Se propone fortalecer el flujo interno del sistema con:

- Bandejas por responsable, estado, prioridad y canal de origen.
- Identificacion del canal de entrada: web, mail, WhatsApp o VFP.
- Campos de origen y referencia externa.
- Mejora de busqueda por cliente, numero de ticket, telefono, email, asunto o referencia.
- Reglas iniciales de asignacion automatica.
- Mejoras en dashboard para medir volumen por canal, tiempos de respuesta y tickets vencidos.
- Reportes de avance y cierre.
- Auditoria de comunicaciones enviadas por mail y WhatsApp.

## 5. Flujo operativo propuesto

1. El cliente o usuario interno envia una solicitud por mail, WhatsApp o carga web.
2. El sistema identifica el canal de entrada y los datos disponibles.
3. Si reconoce al cliente por email, telefono o codigo externo, lo asocia automaticamente.
4. Si no lo reconoce, deja el ticket pendiente de clasificacion o solicita completar datos.
5. Se crea el ticket con numero unico, estado inicial y prioridad sugerida.
6. Se asigna un receptor y/o ejecutor segun reglas de negocio.
7. El sistema envia confirmacion por mail o WhatsApp al solicitante.
8. El equipo interno trabaja el ticket, agrega comentarios, adjuntos y cambios de estado.
9. Cada cambio relevante puede notificar por pantalla, mail o WhatsApp.
10. Al resolverse, se envia reporte de cierre y el ticket queda con historial completo.

## 6. Cronograma de trabajo

La propuesta contempla una ejecucion general de 2 meses, con una etapa principal de desarrollo y testing de 4 semanas. El primer MVP utilizable se entregara en la semana 3.

### Semana 1: relevamiento, ajuste tecnico y base de integraciones

- Relevamiento funcional del circuito actual.
- Validacion de casillas de mail a utilizar.
- Validacion de cuenta de WhatsApp operativa.
- Analisis de acceso al sistema VFP.
- Definicion de campos adicionales necesarios en tickets.
- Diseno del flujo de canales: web, mail, WhatsApp y VFP.
- Preparacion tecnica del entorno de desarrollo/testing.

### Semana 2: desarrollo de entrada por mail y modelo de canales

- Modulo de lectura de correos entrantes.
- Creacion automatica de tickets desde mail.
- Asociacion inicial por remitente.
- Guardado de asunto, cuerpo, adjuntos y metadatos.
- Confirmacion de recepcion por correo.
- Incorporacion de campo canal de origen.
- Primeras reglas de asignacion y prioridad.

### Semana 3: MVP utilizable

Entrega del primer MVP operativo.

Incluye:

- Sistema actual funcionando con mejoras de canal de origen.
- Alta de tickets desde mail.
- Base de integracion con WhatsApp mediante `whatsapp-web.js`.
- Creacion inicial de tickets desde mensajes de WhatsApp.
- Confirmacion basica por WhatsApp o mail.
- Asociacion basica por email o telefono.
- Visualizacion de tickets centralizados en la bandeja actual.
- Pruebas funcionales iniciales con casos reales controlados.

Este MVP permitira empezar a usar el sistema como bandeja centralizada, aunque algunas automatizaciones avanzadas quedaran para las semanas siguientes.

### Semana 4: testing, estabilizacion e integracion VFP inicial

- Pruebas funcionales del flujo mail a ticket.
- Pruebas funcionales del flujo WhatsApp a ticket.
- Ajustes de reconexion y sesion de `whatsapp-web.js`.
- Validacion de adjuntos desde canales externos.
- Primer conector o mecanismo de intercambio con VFP.
- Sincronizacion o consulta inicial de clientes/codigos externos.
- Correccion de errores detectados en pruebas.
- Cierre de la etapa principal de desarrollo/testing.

### Semanas 5 y 6: ampliacion funcional y operacion controlada

- Mejora de reglas de clasificacion y asignacion.
- Ajustes de plantillas de respuesta por mail y WhatsApp.
- Mejoras para recepciones y armado.
- Reportes internos por canal, estado y responsable.
- Validacion con usuarios internos.
- Ajustes de permisos y perfiles.
- Documentacion de uso operativo.

### Semanas 7 y 8: cierre, capacitacion y entrega final

- Estabilizacion final.
- Pruebas de regresion.
- Revision de seguridad basica.
- Documentacion tecnica y funcional.
- Capacitacion de usuarios clave.
- Entrega final del proyecto.
- Acompanamiento inicial posterior a la puesta en marcha.

## 7. Entregables

- Sistema de tickets actualizado.
- Modulo de recepcion de tickets por mail.
- Modulo de integracion con WhatsApp usando `whatsapp-web.js`.
- Registro de canal de origen por ticket.
- Asociacion de tickets con clientes por email, telefono o codigo externo.
- Integracion inicial con VFP segun alternativa tecnica validada.
- Soporte para tickets vinculados a recepciones y armado.
- Plantillas de respuesta por mail y WhatsApp.
- Dashboard o metricas ampliadas por canal y estado.
- Documentacion tecnica de instalacion/configuracion.
- Documentacion funcional para usuarios.
- MVP utilizable en la semana 3.
- Version final estabilizada dentro del periodo de 2 meses.

## 8. Presupuesto

El presupuesto total estimado para el proyecto es de $800.000.

El monto contempla relevamiento, desarrollo, testing, ajustes, integracion inicial, documentacion y acompanamiento de puesta en marcha dentro del alcance definido.

### Distribucion del presupuesto

| Etapa | Momento | Monto | Condicion |
| --- | --- | ---: | --- |
| Pago 1 | Inicio del proyecto | $320.000 | Inicio de relevamiento, preparacion tecnica y desarrollo base |
| Pago 2 | Presentacion del MVP utilizable | $240.000 | Entrega de MVP en semana 3 con tickets centralizados por mail y base WhatsApp |
| Pago 3 | Entrega final y cierre | $240.000 | Finalizacion de integraciones, testing, documentacion y estabilizacion |
| **Total** | **2 meses** | **$800.000** | **Proyecto completo** |

## 9. Hitos de avance

- Hito 1: inicio y validacion tecnica de canales.
- Hito 2: tickets desde mail funcionando.
- Hito 3: MVP utilizable en semana 3.
- Hito 4: WhatsApp conectado con `whatsapp-web.js` y alta inicial de tickets.
- Hito 5: integracion inicial con VFP validada.
- Hito 6: recepciones y armado incorporados al flujo.
- Hito 7: testing, documentacion y entrega final.

## 10. Criterios de aceptacion del MVP

El MVP de la semana 3 se considerara utilizable si cumple con:

- Permite seguir usando el sistema web actual de tickets.
- Crea tickets desde correos entrantes de una casilla definida.
- Registra el canal de origen del ticket.
- Crea tickets desde mensajes de WhatsApp en un flujo basico controlado.
- Permite ver, asignar, comentar y cambiar estado de esos tickets desde la bandeja actual.
- Envia una confirmacion basica por mail o WhatsApp.
- Permite pruebas reales con un grupo reducido de usuarios.

## 11. Supuestos y dependencias

- El cliente proveera acceso a las casillas de correo necesarias.
- El cliente proveera una cuenta o numero de WhatsApp operativo para conectar con `whatsapp-web.js`.
- El entorno donde corra WhatsApp debera permanecer activo para mantener la sesion.
- Se debera validar la forma de acceso al sistema VFP antes de cerrar la integracion definitiva.
- La integracion con VFP se hara priorizando seguridad y no interrupcion del sistema actual.
- Los cambios fuera del alcance definido se presupuestaran aparte o se planificaran como una etapa posterior.

## 12. Riesgos controlados

- WhatsApp Web puede requerir reconexion o revalidacion de sesion.
- La disponibilidad de datos desde VFP puede depender del formato, permisos y version instalada.
- Los correos con formatos muy variados pueden requerir reglas adicionales de interpretacion.
- La asociacion automatica de clientes puede necesitar depuracion de emails y telefonos.
- El uso operativo real puede generar ajustes de prioridad, estados o reglas de asignacion.

## 13. Resultado esperado

Al finalizar el proyecto, la organizacion contara con una plataforma centralizada para gestionar tickets provenientes de web, mail, WhatsApp y datos vinculados al sistema VFP. Esto permitira reducir perdida de informacion, mejorar trazabilidad, ordenar responsabilidades, medir tiempos de respuesta y mantener comunicacion formal con clientes o usuarios internos por los canales que ya utilizan.

La primera version utilizable estara disponible en 3 semanas, y la entrega completa se proyecta dentro de un periodo de 2 meses, con 4 semanas principales dedicadas a desarrollo y testing y el resto orientado a estabilizacion, ajustes, documentacion y acompanamiento.
