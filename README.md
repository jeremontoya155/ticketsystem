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
