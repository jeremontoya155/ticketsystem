# Recorrido operativo de tickets

Este documento resume como se forman, asignan, derivan y comunican los tickets en el sistema actual. Tambien deja ejemplos de uso y una conversacion inconclusa para validar el circuito con un caso realista.

## Estado validado

- Stack: Node.js, Express, EJS y PostgreSQL.
- Bandeja: `/tickets` centraliza tickets de `web`, `mail`, `whatsapp` y `vfp`.
- Intake de mail: `/tickets/mail-intake` previsualiza mails y permite importarlos como tickets.
- SMTP saliente: configurado y verificado correctamente con Nodemailer.
- IMAP entrante: configurado y probado correctamente con ImapFlow.
- Prueba realizada: se envio un mail de test por SMTP a la misma casilla configurada y aparecio por IMAP en el primer intento.
- No se imprimieron credenciales ni valores sensibles de `.env`.
- No se importo el mail de test como ticket para no ensuciar la base con un caso artificial.

Resultado de prueba de correo:

```text
SMTP_VERIFY=ok
IMAP_CONFIGURED=true
MAILBOX=INBOX
TEST_MAIL_SENT=TS-INTAKE-1780889872874
POLL_1=found
FOUND_UID=280
FOUND_PRIORITY=Media
FOUND_CLIENT_DETECTED=false
```

## Datos actuales observados

- Total de tickets en base: 31.
- Canales actuales: 17 `web`, 11 `whatsapp`, 3 `mail`.
- Estados actuales: 27 `Pendiente`, 2 `En Proceso`, 1 `Resuelto`, 1 `Cerrado`.
- Clientes: 11.
- Contactos activos de empresas: 5.
- Control a revisar: hay 8 tickets de `whatsapp` sin `receptor_id` o `ejecutor_id`. El flujo nuevo intenta asignar por defecto, pero conviene corregir esos datos historicos y verificar que los proximos tickets entren siempre con responsable.

## Conceptos del circuito

- Canal de origen: identifica por donde entro el caso. Valores: `web`, `mail`, `whatsapp`, `vfp`.
- Proceso: clasifica el tema operativo. Valores usados en pantalla: `soporte`, `desarrollo`, `recepcion`, `armado`, `operacion`.
- Bolsa asignada: area inicial de trabajo. Valores: `soporte`, `desarrollo`.
- Receptor: persona que toma o administra la recepcion del caso.
- Ejecutor: persona que debe trabajar tecnicamente el caso.
- Cliente detectado: empresa asociada automaticamente por codigo externo, email, telefono o nombre.
- Comunicacion: cada entrada externa queda guardada en `ticket_comunicaciones` para trazabilidad.

## Recorrido completo

1. El cliente o usuario interno envia una solicitud por web, mail, WhatsApp o VFP.
2. El sistema normaliza origen: email, telefono, codigo externo, empresa, asunto, cuerpo y referencia.
3. Busca empresa/cliente en este orden: `codigo_externo`, email principal, email de contacto, telefono principal, telefono de contacto, nombre exacto o parecido.
4. Calcula numero de ticket tomando el maximo `nro_ticket` actual y sumando 1.
5. Define estado inicial `Pendiente` y prioridad inicial. En mail, si el texto contiene `urgente`, `caido`, `no funciona`, `bloqueado` o `error`, sugiere `Alta`; si no, `Media`.
6. Define bolsa inicial. Por defecto entra a `soporte`; luego un administrador puede moverlo a `desarrollo`.
7. Define asignacion inicial.
8. Inserta el ticket en `tickets`.
9. Inserta un comentario interno de creacion o cambio de estado.
10. Si entro por canal externo, inserta auditoria en `ticket_comunicaciones`.
11. Notifica a receptor/ejecutor segun configuracion de pantalla y mail.
12. El equipo trabaja el caso: comenta, adjunta imagenes, cambia estado o reasigna.
13. Si hay que hablar con el cliente por mail, se usa `Enviar Reporte` desde el ticket.
14. Al resolver, se cambia a `Resuelto`; al finalizar administrativamente, se puede pasar a `Cerrado`.

## Asignacion automatica recomendada actual

### Web desde usuario cliente

- El cliente solo ve su empresa y no elige responsables.
- El sistema asigna `receptor_id` y `ejecutor_id` al primer usuario interno activo encontrado.
- Orden de preferencia: `tecnico_soporte` o `soporte`, luego `admin_soporte`, luego `admin`, luego `tecnico_desarrollo` o `desarrollo`, luego `admin_desarrollo`.
- Estado inicial: `Pendiente`.
- Canal: `web`.
- Bolsa: `soporte`.
- Envia confirmacion por mail al creador si SMTP esta disponible.

### Web desde usuario interno

- El operador elige empresa, canal, prioridad, proceso, bolsa, receptor y ejecutor.
- Si no elige receptor/ejecutor, quedan con el usuario logueado.
- Puede iniciar en `Pendiente` o `En Proceso`.
- Puede marcar `Enviarme confirmacion por mail`.

### Mail entrante

- El sistema lee la casilla por IMAP desde `/tickets/mail-intake`.
- Muestra remitente, asunto, resumen, adjuntos detectados, cliente detectado y prioridad sugerida.
- El operador decide que mail importar.
- Al importar, crea ticket con canal `mail`, proveedor `imap`, asunto del mail y cuerpo resumido.
- La prioridad se calcula por palabras clave.
- La asignacion usa el mismo orden de usuario interno por defecto.
- Si no detecta cliente, queda `cliente_id=null` y observacion: `Pendiente de clasificar: no se encontro cliente por origen.`

### WhatsApp

- El sistema recibe mensajes por `POST /api/webhooks/whatsapp` desde un bot externo.
- Antes de crear, puede evaluarse con `dryRun=true` para detectar cliente y tickets similares.
- Para WhatsApp, la asignacion inicial prioriza un administrador para triage rapido.
- Orden de preferencia: `admin_soporte`, luego `admin`, luego `admin_desarrollo`.
- Si no hay administrador activo, cae al usuario interno por defecto.
- El ticket entra en bolsa `soporte` y canal `whatsapp`.
- La respuesta del endpoint devuelve texto para contestar al cliente: `Recibimos tu reclamo. Ticket #...`.

### Pull simple de WhatsApp

- En la bandeja `/tickets`, los usuarios internos tienen el boton `Tomar WhatsApp`.
- El boton busca el WhatsApp `Pendiente` mas antiguo en bolsa `soporte` que todavia no tenga tecnico real asignado o que este en triage de admin.
- Al tomarlo, el sistema asigna `receptor_id` y `ejecutor_id` al usuario logueado.
- Luego abre directamente el detalle del ticket.
- Se agrega un comentario interno: `WhatsApp tomado desde cola simple por ...`.
- Si no hay WhatsApp pendientes, vuelve a la bandeja filtrada por `canal=whatsapp` y `estado=Pendiente`.
- Esta es la tarea manual simple para operar el canal sin automatizar de mas: entrar, apretar `Tomar WhatsApp`, revisar, clasificar y derivar si hace falta.

### VFP o integracion externa

- El canal permitido es `vfp`.
- El dato mas fuerte para asociar empresa es `codigo_externo` contra `clientes.codigo_externo`.
- `referencia_externa` puede guardar comprobante, recepcion, armado, ID externo o correlativo de VFP.
- `proceso` permite separar si el caso es `recepcion`, `armado`, `operacion`, `soporte` o `desarrollo`.

## Derivacion interna

- Solo `admin`, `admin_soporte` y `admin_desarrollo` pueden reasignar.
- La derivacion cambia `bolsa_asignada`, `receptor_id` y `ejecutor_id`.
- Al reasignar se agrega comentario interno tipo `asignacion`.
- Se notifican receptor y ejecutor si tienen notificaciones habilitadas.
- Para casos funcionales, se recomienda dejar en `soporte` hasta confirmar datos.
- Para casos que requieren codigo, se recomienda mover a `desarrollo` con comentario claro de reproduccion, impacto y evidencia.

### Bolsa de tickets en Admin

- En `/admin` se muestra una `Bolsa de tickets` con dos carriles: `Soporte` y `Desarrollo`.
- Cada card muestra numero, prioridad, canal, cliente, antiguedad, receptor y ejecutor actual.
- Desde esa misma card se puede cambiar bolsa, receptor y ejecutor.
- Al derivar desde Admin, el sistema vuelve a `/admin` para seguir despachando tickets rapidamente.
- La bandeja principal `/tickets` sigue disponible para busqueda fina, filtros y detalle completo.

## Comunicacion con cliente por mail

### Entrante

- El cliente envia correo a la casilla operativa.
- IMAP lo previsualiza.
- El operador importa el mail como ticket.
- El mail original queda como comunicacion de entrada.

### Saliente

- Desde el detalle del ticket se usa `Enviar Reporte`.
- El sistema arma un mail HTML con numero de ticket, empresa, estado, prioridad, reclamo y observaciones.
- Se puede incluir adjuntos del ticket.
- Al enviarlo, se agrega comentario: `Se envio un reporte por mail a ...`.

### Punto recomendado para mejorar

- Hoy la confirmacion automatica al creador esta implementada para tickets web, especialmente usuario cliente.
- Para tickets importados por mail conviene agregar una confirmacion automatica opcional al remitente, por ejemplo: `Recibimos tu solicitud y generamos el ticket #...`.

## Ejemplo 1: ticket web de cliente

Entrada:

```text
Canal: web
Empresa: Tadicor S.A.
Asunto: Error al cargar bultos en recepcion
Proceso: recepcion
Prioridad: Media
Reclamo: En version 2.1.0, al cargar bultos recibidos, el sistema indica que excede la cantidad pedida.
```

Resultado esperado:

```text
Ticket: #nuevo
Estado: Pendiente
Canal: web
Bolsa: soporte
Receptor: primer tecnico/admin de soporte disponible
Ejecutor: primer tecnico/admin de soporte disponible
Comentario inicial: Ticket creado con estado: Pendiente
Mail al creador: si el usuario cliente lo crea, se intenta enviar confirmacion
```

Derivacion recomendada:

```text
Soporte revisa datos de OC y reproduce.
Si confirma bug, reasigna bolsa a desarrollo.
Comentario interno: Reproducido en prueba. OC X muestra bulto 1 pedido, pero front valida como excedido. Adjunta captura.
```

## Ejemplo 2: ticket por mail

Mail recibido:

```text
From: compras@cliente.com
Subject: Urgente - no funciona cierre de recepcion
Body: Buen dia, no podemos cerrar la recepcion 4587. Queda bloqueado al confirmar y necesitamos liberar la mercaderia.
```

Previsualizacion esperada:

```json
{
  "canal_origen": "mail",
  "asunto": "Urgente - no funciona cierre de recepcion",
  "prioridad_sugerida": "Alta",
  "cliente_detectado": "si coincide email o contacto",
  "requiere_clasificacion": false
}
```

Ticket formado:

```text
Canal: mail
Proveedor: imap
Origen email: compras@cliente.com
Asunto: Urgente - no funciona cierre de recepcion
Prioridad: Alta
Estado: Pendiente
Bolsa: soporte
Proceso: se completa como recepcion si corresponde
Comunicacion: entrada guardada en ticket_comunicaciones
```

Respuesta sugerida al cliente:

```text
Hola, recibimos la solicitud y la registramos como ticket #XXXXX.

Estamos revisando el cierre de recepcion 4587. Si tienen captura del error o usuario afectado, por favor responder este correo para sumarlo al seguimiento.
```

## Ejemplo 3: ticket por WhatsApp con evaluacion previa

Evaluacion sin crear:

```json
{
  "provider": "bot-onevision",
  "messageId": "wsp-20260608-001",
  "phone": "+54 9 351 555 1101",
  "name": "Lucia Perez",
  "company": "Alfa Retail S.A.",
  "text": "No puedo cerrar recepcion, tira error 500",
  "reference": "WSP-20260608-001",
  "process": "recepcion",
  "dryRun": true
}
```

Respuesta esperada:

```json
{
  "ok": true,
  "mode": "evaluation",
  "shouldCreateTicket": true,
  "similarTickets": [],
  "suggestedAssignment": {
    "mode": "admin-triage"
  }
}
```

Creacion real:

```json
{
  "provider": "bot-onevision",
  "messageId": "wsp-20260608-001",
  "phone": "+54 9 351 555 1101",
  "name": "Lucia Perez",
  "company": "Alfa Retail S.A.",
  "text": "No puedo cerrar recepcion, tira error 500",
  "reference": "WSP-20260608-001",
  "process": "recepcion",
  "dryRun": false
}
```

Respuesta para enviar por WhatsApp:

```text
Recibimos tu reclamo. Ticket #XXXXX.
```

Derivacion recomendada:

```text
Admin soporte recibe y clasifica.
Si es error operativo simple, asigna a tecnico soporte.
Si requiere cambio de codigo, mueve bolsa a desarrollo y asigna ejecutor dev.
```

## Ejemplo 4: ticket desde VFP

Entrada sugerida:

```json
{
  "canal": "vfp",
  "codigoExterno": 2591,
  "referenciaExterna": "REC-4587",
  "proceso": "recepcion",
  "asunto": "Diferencia de bultos al importar recepcion",
  "reclamo": "Desde VFP se detecta diferencia entre cantidad pedida y cantidad recibida en la recepcion REC-4587.",
  "prioridad": "Media"
}
```

Resultado esperado:

```text
Cliente: detectado por codigo_externo
Canal: vfp
Referencia: REC-4587
Proceso: recepcion
Bolsa: soporte
Estado: Pendiente
```

## Conversacion inconclusa para prueba

Objetivo: dejar un ticket abierto con intercambio realista, donde el cliente todavia debe responder.

```text
[Mail cliente - entrada]
Asunto: No podemos cerrar recepcion 4587
Hola, desde ayer no podemos cerrar la recepcion 4587. Al confirmar queda pensando y despues muestra error. Necesitamos avanzar porque la mercaderia queda pendiente.

[Sistema]
Ticket #XXXXX creado desde mail. Cliente asociado automaticamente si el remitente coincide. Prioridad sugerida: Alta por contener error/bloqueo.

[Soporte - comentario visible al cliente]
Hola, recibimos el caso y lo estamos revisando. Para avanzar necesitamos una captura del error, usuario que intenta cerrar y si ocurre en todas las recepciones o solo en la 4587.

[Soporte - comentario interno]
Pendiente de respuesta del cliente. Revisar si hay antecedentes de validacion de bultos o error 500 en recepciones. No derivar a desarrollo hasta tener captura o pasos de reproduccion.

[Estado actual]
En Proceso

[Pendiente]
Cliente aun no respondio con captura ni usuario afectado.
```

## Controles operativos recomendados

- Todo ticket nuevo debe tener `canal_origen`, `estado`, `prioridad`, `bolsa_asignada`, `receptor_id` y `ejecutor_id`.
- Todo ticket externo debe guardar una fila en `ticket_comunicaciones`.
- Todo mail importado debe conservar `origen_email`, `origen_mensaje_id`, `asunto` y cuerpo resumido.
- Todo WhatsApp debe usar `dryRun=true` cuando sea posible para evitar duplicados.
- Si `cliente_id` queda vacio, soporte debe clasificarlo antes de derivar.
- Si pasa a desarrollo, el comentario de derivacion debe incluir impacto, pasos, evidencia y datos de reproduccion.
- Al enviar correo al cliente, registrar comentario visible o interno segun corresponda.
- Revisar periodicamente tickets con mas dias abiertos segun prioridad.

## Comandos utiles de validacion

Verificar SMTP sin enviar:

```powershell
node -e "require('dotenv').config(); const nodemailer=require('nodemailer'); const t=nodemailer.createTransport({host:process.env.MAIL_HOST||'smtp.gmail.com', port:parseInt(process.env.MAIL_PORT,10)||587, secure:false, auth:{user:process.env.MAIL_USER, pass:process.env.MAIL_PASS}}); t.verify().then(()=>console.log('SMTP ok')).catch(e=>console.log(e.message));"
```

Previsualizar ultimos mails sin importar:

```powershell
node -e "require('dotenv').config(); const {fetchRecentMailPreviews}=require('./services/mail-intake'); fetchRecentMailPreviews({limit:3}).then(r=>console.log(JSON.stringify({configured:r.configured, mailbox:r.mailbox, emails:r.emails?.length},null,2))).finally(()=>process.exit());"
```

Enviar mail de test y verificar que entre por IMAP:

```powershell
node -e "require('dotenv').config(); const nodemailer=require('nodemailer'); const {fetchRecentMailPreviews}=require('./services/mail-intake'); const to=process.env.MAIL_INTAKE_USER||process.env.IMAP_USER||process.env.MAIL_USER; const subject='[TicketSystem Test] Intake mail '+Date.now(); const t=nodemailer.createTransport({host:process.env.MAIL_HOST||'smtp.gmail.com', port:parseInt(process.env.MAIL_PORT,10)||587, secure:false, auth:{user:process.env.MAIL_USER, pass:process.env.MAIL_PASS}}); (async()=>{await t.sendMail({from:process.env.MAIL_FROM||process.env.MAIL_USER,to,subject,text:'Prueba controlada de intake por mail.'}); const r=await fetchRecentMailPreviews({limit:10}); console.log(r.emails.some(m=>m.subject===subject)?'found':'pending');})().finally(()=>process.exit());"
```

Enviar tres mails demo para mostrar intake:

```powershell
npm run mail:examples
```

El script manda ejemplos de recepcion urgente, armado y desarrollo a la casilla configurada. Luego se ven desde `/tickets/mail-intake` con prioridad sugerida y posible ticket.

## Criterio de producto bueno, bonito y barato

- Bueno: cada solicitud queda trazada, asignada, con estado y responsable.
- Bonito: la bandeja muestra canal, prioridad, demora, cliente y ejecutor sin buscar en varios lugares.
- Barato: se aprovechan SMTP/IMAP existentes, una sola casilla operativa y reglas simples antes de sumar automatizaciones mas caras.
- Que ande bien: antes de automatizar mas, controlar que no existan tickets sin responsable y que cada canal externo deje auditoria.
