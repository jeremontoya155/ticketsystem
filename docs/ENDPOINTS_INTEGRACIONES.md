# Endpoints de integracion

## WhatsApp externo

Endpoint para que el bot externo cree tickets en la bandeja centralizada.

### 1) Auth simple por `.env`

`POST /api/auth/whatsapp`

Body:

```json
{
  "user": "mi_bot",
  "password": "secreto_bot"
}
```

Si las credenciales hacen match con `WHATSAPP_AUTH_USER` y `WHATSAPP_AUTH_PASS`, responde:

```json
{
  "ok": true,
  "auth": "ok",
  "token": "token_compartido"
}
```

Este endpoint esta pensado para que tu otro programa valide acceso contra lo que defines en `.env`.

### 2) Webhook principal

`POST /api/webhooks/whatsapp`

Autenticacion opcional:

- Si existe `WHATSAPP_AUTH_TOKEN` o `WHATSAPP_WEBHOOK_TOKEN`, enviar `Authorization: Bearer <token>` o `x-webhook-token: <token>`.
- Si no existe esa variable, el endpoint queda abierto para pruebas locales.

Payload minimo:

```json
{
  "phone": "+54 9 351 555 0123",
  "name": "Cliente Demo",
  "text": "Necesito abrir un reclamo por un error urgente."
}
```

Payload recomendado:

```json
{
  "provider": "bot-externo",
  "messageId": "wsp-123456",
  "phone": "+54 9 351 555 0123",
  "name": "Cliente Demo",
  "company": "Empresa Demo SA",
  "clientCode": 101,
  "text": "Necesito abrir un reclamo por un error urgente.",
  "reference": "WSP-123456",
  "process": "recepcion",
  "dryRun": true
}
```

Si `dryRun=true`, el sistema **no crea ticket** y devuelve evaluacion para decidir si conviene crearlo o reutilizar uno similar:

```json
{
  "ok": true,
  "mode": "evaluation",
  "shouldCreateTicket": false,
  "similarTickets": [
    {
      "id": 11,
      "nro_ticket": 90011,
      "asunto": "Problema en recepcion",
      "estado": "En Proceso",
      "prioridad": "Alta"
    }
  ]
}
```

Con `dryRun=false` (o sin el campo), crea ticket con la logica normal de bolsa soporte + asignacion interna.
Para WhatsApp, la asignacion inicial prioriza un perfil `admin` / `admin_soporte` como triage rapido para que luego pueda derivar al equipo.

Respuesta esperada:

```json
{
  "ok": true,
  "ticket": {
    "id": 10,
    "nro_ticket": 90010,
    "canal_origen": "whatsapp",
    "cliente_asociado": false,
    "cliente_id": null,
    "assigned_to_admin_suggestion": true,
    "resumen": "Necesito abrir un reclamo..."
  },
  "reply": "Recibimos tu reclamo. Ticket #90010."
}
```

Script de prueba:

`node scripts/test-whatsapp-webhook.js`

Variables utiles para el script:

```env
WHATSAPP_TEST_URL=http://localhost:3000/api/webhooks/whatsapp
WHATSAPP_TEST_AUTH_URL=http://localhost:3000/api/auth/whatsapp
WHATSAPP_AUTH_USER=mi_bot
WHATSAPP_AUTH_PASS=secreto_bot
WHATSAPP_AUTH_TOKEN=token_compartido
WHATSAPP_WEBHOOK_TOKEN=token_compartido
WHATSAPP_TEST_PHONE=+54 9 351 555 0123
WHATSAPP_TEST_NAME=Cliente Demo
WHATSAPP_TEST_TEXT=Texto del reclamo
WHATSAPP_TEST_REFERENCE=WSP-DEMO-001
WHATSAPP_TEST_PROCESS=recepcion
WHATSAPP_TEST_DRY_RUN=true
```

## Mail entrante

Nota tecnica: SMTP sirve para enviar correo. Para leer casillas entrantes se usa IMAP. El sistema conserva Nodemailer para salida SMTP y suma IMAP para traer mails y convertirlos en tickets.

### Previsualizar mails

`GET /api/mail/intake/preview?limit=10`

Requiere login.

Devuelve los ultimos mails de la casilla, un resumen de posible ticket y si el remitente coincide con algun cliente por email.

Respuesta resumida:

```json
{
  "ok": true,
  "configured": true,
  "mailbox": "INBOX",
  "emails": [
    {
      "uid": 123,
      "messageId": "<mail-id>",
      "from": { "name": "Jeremias", "address": "jeremontoya155@gmail.com" },
      "subject": "Problema con recepcion",
      "text": "Resumen del cuerpo...",
      "possibleTicket": {
        "canal_origen": "mail",
        "asunto": "Problema con recepcion",
        "prioridad_sugerida": "Media",
        "cliente_detectado": { "id": 1, "nombre": "jeremontoya" },
        "requiere_clasificacion": false
      }
    }
  ]
}
```

### Importar un mail como ticket

`POST /api/mail/intake/import`

Requiere login.

Body por `messageId`:

```json
{
  "messageId": "<mail-id>",
  "limit": 50
}
```

Body por `uid`:

```json
{
  "uid": 123,
  "limit": 50
}
```

Respuesta:

```json
{
  "ok": true,
  "ticket": {
    "id": 11,
    "nro_ticket": 90011,
    "canal_origen": "mail",
    "cliente_asociado": true,
    "cliente_id": 1
  }
}
```

Variables de entorno para IMAP:

```env
MAIL_INTAKE_HOST=imap.gmail.com
MAIL_INTAKE_PORT=993
MAIL_INTAKE_SECURE=true
MAIL_INTAKE_USER=correo@gmail.com
MAIL_INTAKE_PASS=app_password
MAIL_INTAKE_MAILBOX=INBOX
```

Para Gmail se necesita una app password, no la clave normal de la cuenta.

## Campos agregados a tickets

- `canal_origen`: `web`, `mail`, `whatsapp`, `vfp`.
- `asunto`: resumen corto del caso.
- `origen_contacto`: nombre recibido desde canal externo.
- `origen_email`: email recibido desde canal externo.
- `origen_telefono`: telefono recibido desde canal externo.
- `origen_mensaje_id`: ID del mail o mensaje externo.
- `referencia_externa`: ID del bot, comprobante, recepcion o referencia VFP.
- `proceso`: `soporte`, `desarrollo`, `recepcion`, `armado`, `operacion`.

## Auditoria

Los mensajes externos quedan registrados en `ticket_comunicaciones` con canal, direccion, proveedor, remitente, asunto, cuerpo y payload original.
