# Runbook Integracion WhatsApp Externa

Este documento es para tu otro programa (el que recibe WhatsApp). Este sistema NO se conecta a WhatsApp directo: solo recibe requests HTTP desde afuera.

## 1. Objetivo

Flujo recomendado:

1. Tu programa recibe mensaje WhatsApp.
2. Tu programa autentica contra este sistema.
3. Tu programa consulta evaluacion de similares con dryRun.
4. Si conviene crear, envia request final de creacion.

## 2. Variables .env en TicketSystem

```env
WHATSAPP_AUTH_USER=mi_bot
WHATSAPP_AUTH_PASS=secreto_bot
WHATSAPP_AUTH_TOKEN=token_compartido
```

Notas:

- `WHATSAPP_AUTH_USER` y `WHATSAPP_AUTH_PASS`: credenciales para `/api/auth/whatsapp`.
- `WHATSAPP_AUTH_TOKEN`: token para `/api/webhooks/whatsapp`.

## 3. Endpoint de auth simple

URL:

`POST /api/auth/whatsapp`

Body:

```json
{
  "user": "mi_bot",
  "password": "secreto_bot"
}
```

Respuesta esperada:

```json
{
  "ok": true,
  "auth": "ok",
  "token": "token_compartido"
}
```

## 4. Endpoint de entrada WhatsApp

URL:

`POST /api/webhooks/whatsapp`

Headers:

- `Content-Type: application/json`
- `Authorization: Bearer <token>`

Body minimo:

```json
{
  "phone": "+54 9 351 555 0123",
  "name": "Cliente Demo",
  "text": "Tengo un error al cerrar recepcion"
}
```

Body recomendado:

```json
{
  "provider": "mi-programa-wsp",
  "messageId": "wsp-abc-001",
  "phone": "+54 9 351 555 0123",
  "name": "Cliente Demo",
  "company": "Empresa Demo SA",
  "clientCode": 101,
  "text": "Tengo un error al cerrar recepcion",
  "reference": "WSP-ABC-001",
  "process": "recepcion",
  "dryRun": true
}

Campos utiles para asociar empresa automaticamente:

- `clientCode` o `codigo_cliente` para asociar por `clientes.codigo_externo`.
- `company`, `companyName`, `empresa`, `cliente` para asociar por nombre de empresa.
```

## 5. Modo evaluacion (sin crear ticket)

Si `dryRun=true`, el sistema NO crea ticket y responde sugerencia:

```json
{
  "ok": true,
  "mode": "evaluation",
  "shouldCreateTicket": false,
  "similarTickets": [
    {
      "id": 123,
      "nro_ticket": 99100,
      "asunto": "Error al cerrar recepcion",
      "estado": "Pendiente",
      "prioridad": "Alta"
    }
  ],
  "clienteDetectado": {
    "id": 1,
    "nombre": "Alfa Retail S.A.",
    "email": "contacto@alfaretail.com",
    "telefono": "+54 9 351 555 1101"
  }
}
```

Decision:

- `shouldCreateTicket=true`: crear ticket.
- `shouldCreateTicket=false`: podrias evitar duplicado y continuar en ticket similar.

## 6. Creacion real de ticket

Para crear ticket, enviar mismo payload con `dryRun=false` o sin `dryRun`.

Respuesta esperada:

```json
{
  "ok": true,
  "ticket": {
    "id": 456,
    "nro_ticket": 99106,
    "canal_origen": "whatsapp",
    "cliente_asociado": true,
    "cliente_id": 1,
    "assigned_to_admin_suggestion": true,
    "resumen": "Tengo un error al cerrar recepcion"
  },
  "similarTickets": [],
  "reply": "Recibimos tu reclamo. Ticket #99106."
}

Nota: en WhatsApp, la asignacion inicial prioriza admin/admin_soporte para triage rapido.
```

## 7. Pruebas rapidas (PowerShell)

### 7.1 Auth

```powershell
$body = @{ user = "mi_bot"; password = "secreto_bot" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/auth/whatsapp" -ContentType "application/json" -Body $body
```

### 7.2 Evaluacion

```powershell
$token = "token_compartido"
$body = @{
  provider = "mi-programa-wsp"
  messageId = "wsp-eval-001"
  phone = "+54 9 351 555 1101"
  name = "Lucia Perez"
  text = "No puedo cerrar recepcion, tira error 500"
  reference = "WSP-EVAL-001"
  process = "recepcion"
  dryRun = $true
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/webhooks/whatsapp" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
```

### 7.3 Creacion

```powershell
$token = "token_compartido"
$body = @{
  provider = "mi-programa-wsp"
  messageId = "wsp-create-001"
  phone = "+54 9 351 555 1101"
  name = "Lucia Perez"
  text = "Sigue sin cerrar recepcion"
  reference = "WSP-CREATE-001"
  process = "recepcion"
  dryRun = $false
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/webhooks/whatsapp" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
```

## 8. Script ya incluido en proyecto

Tenes un script de prueba listo:

```bash
node scripts/test-whatsapp-webhook.js
```

Configurable por:

- `WHATSAPP_TEST_URL`
- `WHATSAPP_TEST_AUTH_URL`
- `WHATSAPP_AUTH_USER`
- `WHATSAPP_AUTH_PASS`
- `WHATSAPP_AUTH_TOKEN`
- `WHATSAPP_TEST_DRY_RUN`
