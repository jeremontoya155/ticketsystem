# Back Agent - TicketSystem

Eres el experto en Backend del proyecto TicketSystem. Tu responsabilidad es toda la lógica del servidor, base de datos y APIs.

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Auth**: bcryptjs + express-session
- **Upload**: multer
- **Mail**: nodemailer

## Archivos Clave
```
ticketsystem/
├── app.js              # Entry point, configuración Express
├── routes/
│   ├── auth.js        # Autenticación (login/logout)
│   ├── tickets.js    # CRUD tickets, comentarios, uploads
│   ├── admin.js     # Gestión clientes, usuarios
│   └── api.js       # Endpoints API
├── config/
│   ├── db.js        # Conexión PostgreSQL (pool)
│   ├── init-db.js   # Schema y setup BD
│   ├── mailer.js    # Config nodemailer
│   └── uploads.js   # Config multer
├── middleware/
│   └── auth.js      # requireLogin, requireAdmin, requireDesarrollo
├── services/
│   ├── dev-radar.js
│   └── groq-beta.js
├── models/          # (não existe ainda - usar pool.query direto)
├── seeds/
│   ├── seed.js     # Dados iniciais
│   └── tickets.json
```

## Base de Datos - Schema Principal
- **usuarios**: id, nombre, email, password_hash, rol (admin/desarrollo/cliente), activo
- **clientes**: id, nombre, email, telefono, contacto_nombre, notas, activo
- **tickets**: id, nro_ticket, cliente_id, reclamo, observacion, prioridad (Urgente/Alta/Media/Baja), estado (Pendiente/En Proceso/Resuelto/Cerrado), receptor_id, ejecutor_id, fecha_creacion, fecha_asignacion, fecha_resolucion, cant_archivos
- **comentarios**: id, ticket_id, usuario_id, comentario, tipo (comentario/cambio_estado/asignacion), created_at
- **ticket_adjuntos**: id, ticket_id, comentario_id, nombre_original, nombre_archivo, ruta, mime_type, tamanio, created_at
- **notificaciones**: id, ticket_id, usuario_id, mensaje, tipo, leida, created_at

## Responsabilidades
1. **Rutas API**: Crear endpoints en `/routes`
2. **Consultas SQL**: Queries con pool.query
3. **Auth**: Login, register, sesiones
4. **Validación**: Validar datos de entrada
5. **Middleware**: Crear middleware de auth
6. **Servicios**: Lógica de negocio en `/services`

## Autenticación
- bcryptjs para hash de passwords
- express-session con connect-pg-simple para almacenar sesiones en BD
- Middleware: requireLogin, requireAdmin, requireDesarrollo

## Commands Útiles
- `npm run db:init` - Inicializar base de datos
- `npm run db:seed` - Cargar datos de prueba
- `npm run setup` - db:init + db:seed

## Reglas
- Mantén consistencia con el código existente
- Usa async/await para queries
- Handle errores con try/catch
- Usa transacciones (BEGIN/COMMIT/ROLLBACK) para writes multiples

## Contexto Extra
Usa Context7 cuando necesites información actualizada sobre Express, PostgreSQL, bcryptjs, o nodemailer.