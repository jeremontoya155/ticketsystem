# Historico de trabajo

## 2026-05-11

Pedido operativo:

- Mejorar fuerte el UX/UI del sistema de tickets.
- Corregir contraste de escritura en formularios para que el texto se vea blanco sobre fondo oscuro.
- Agregar canal de origen al ticket: web, mail, WhatsApp y VFP.
- Preparar ingreso de tickets desde mail entrante con resumen previo y deteccion de cliente por remitente.
- Agregar cliente de prueba `jeremontoya` con mail `jeremontoya155@gmail.com`.
- Preparar endpoint para bot externo de WhatsApp.
- Dejar documentados los endpoints y un script para simular tickets entrantes desde WhatsApp.

Decisiones tomadas:

- Para recibir mails se usa IMAP, no SMTP. SMTP queda para envio por Nodemailer.
- Para WhatsApp no se usa `whatsapp-web.js` en esta etapa porque el canal ya viene desde un bot externo.
- El bot externo crea tickets llamando a `POST /api/webhooks/whatsapp`.
- Los mensajes entrantes quedan auditados en `ticket_comunicaciones`.
- La bandeja actual sigue siendo el centro operativo; se extendio con canal, referencia y busqueda ampliada.

Archivos principales tocados:

- `config/schema.sql`
- `routes/api.js`
- `routes/tickets.js`
- `views/tickets/index.ejs`
- `views/tickets/nuevo.ejs`
- `views/tickets/ver.ejs`
- `public/css/style.css`
- `services/ticket-ingestion.js`
- `services/mail-intake.js`
- `scripts/test-whatsapp-webhook.js`
- `docs/ENDPOINTS_INTEGRACIONES.md`

Pendientes naturales:

- Pantalla administrativa para revisar mails entrantes sin usar API directa.
- Descarga/guardado de adjuntos desde mail.
- Envio real de respuesta WhatsApp usando la API del bot externo.
- Conexion con BD principal/VFP para sincronizar clientes.
