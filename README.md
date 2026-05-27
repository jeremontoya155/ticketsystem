# TicketSystem

Sistema de gestion de tickets con Node.js, Express, EJS y PostgreSQL.

## Flujo de arranque

1. Instalar dependencias:

```bash
npm install
```

2. Configurar `.env`:

```env
DATABASE_URL=postgres://usuario:password@host:5432/base
SESSION_SECRET=ticketsystem_secret_2024
PORT=3000

# Auth simple para integracion WhatsApp externa
WHATSAPP_AUTH_USER=mi_bot
WHATSAPP_AUTH_PASS=secreto_bot
WHATSAPP_AUTH_TOKEN=token_compartido

# Generacion de cliente demo para pruebas de punta a punta
CLIENTE_DEMO_NOMBRE_EMPRESA=Cliente Demo S.A.
CLIENTE_DEMO_EMAIL=cliente.demo@empresa.com
CLIENTE_DEMO_CONTACTO=Contacto Demo
CLIENTE_DEMO_TELEFONO=+54 9 351 555 0101
CLIENTE_DEMO_USUARIO_NOMBRE=Usuario Cliente Demo
CLIENTE_DEMO_USUARIO_EMAIL=usuario.cliente@empresa.com
CLIENTE_DEMO_USUARIO_PASSWORD=una_password_segura
```

3. Inicializar la base de datos:

```bash
npm run db:init
```

4. Cargar los datos:

```bash
npm run db:seed
```

5. O hacer ambos pasos juntos:

```bash
npm run setup
```

6. Levantar la aplicacion:

```bash
npm start
```

## Scripts disponibles

- `npm run db:init`: ejecuta `config/schema.sql`.
- `npm run db:seed`: inicializa la BD si hace falta y luego carga `seeds/tickets.json`.
- `npm run client:user`: crea o actualiza una empresa demo + usuario cliente usando variables `CLIENTE_DEMO_*`.
- `npm run setup`: corre init + seed en orden.
- `npm start`: inicia Express despues de validar/aplicar el schema.
- `npm run dev`: arranque con nodemon.

## Estructura

```text
ticketsystem/
|-- app.js
|-- config/
|   |-- db.js
|   |-- init-db.js
|   |-- mailer.js
|   `-- schema.sql
|-- middleware/
|-- public/
|-- routes/
|-- scripts/
|   `-- init-db.js
|-- seeds/
|   |-- seed.js
|   `-- tickets.json
`-- views/
```

## Usuarios iniciales

- `admin@empresa.com` / `password`
- `jeremias@empresa.com` / `password`
- `soporte@empresa.com` / `password`

## Roles operativos

- `admin`: administracion general.
- `admin_soporte`: administra operacion de soporte y reasignaciones.
- `admin_desarrollo`: administra operacion de desarrollo y reasignaciones.
- `tecnico_soporte`: trabaja tickets asignados.
- `tecnico_desarrollo`: trabaja tickets asignados.
- `cliente`: solo ve y crea tickets de su empresa.

Tambien se aceptan roles legacy `soporte` y `desarrollo` (se normalizan automaticamente).
