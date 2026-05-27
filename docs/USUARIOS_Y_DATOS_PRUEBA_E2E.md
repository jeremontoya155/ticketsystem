# Usuarios y Datos de Prueba E2E

Este archivo resume todo lo creado para que puedas correr el sistema con datos de demo y recorrer los flujos completos.

## 1. Scripts importantes

1. Inicializar schema:

```bash
npm run db:init
```

2. Crear/actualizar cliente demo por .env (opcional):

```bash
npm run client:user
```

3. Cargar seed E2E nuevo:

```bash
npm run db:seed:e2e
```

## 2. Password de usuarios seed

Por defecto:

- `password`

Si queres cambiarla para todos los usuarios del seed E2E:

```env
SEED_E2E_PASSWORD=tu_password
```

## 3. Usuarios internos creados por seed E2E

- `admin@empresa.com` | rol `admin`
- `admin.soporte@empresa.com` | rol `admin_soporte`
- `admin.desarrollo@empresa.com` | rol `admin_desarrollo`
- `soporte1@empresa.com` | rol `tecnico_soporte`
- `soporte2@empresa.com` | rol `tecnico_soporte`
- `dev1@empresa.com` | rol `tecnico_desarrollo`
- `dev2@empresa.com` | rol `tecnico_desarrollo`

## 4. Usuarios cliente creados por seed E2E

- `cliente.alfa@alfaretail.com` | rol `cliente` | empresa `Alfa Retail S.A.`
- `cliente.beta@betasalud.com` | rol `cliente` | empresa `Beta Salud SRL`
- `cliente.gamma@gammalogistica.com` | rol `cliente` | empresa `Gamma Logistica`

## 5. Empresas de prueba

- `Alfa Retail S.A.`
- `Beta Salud SRL`
- `Gamma Logistica`

## 6. Tickets de prueba cargados

El seed crea/actualiza estos tickets:

- `#99100` WhatsApp, soporte, pendiente, alta
- `#99101` Web, soporte, en proceso, media
- `#99102` Mail, desarrollo, en proceso, urgente
- `#99103` WhatsApp, desarrollo, pendiente, alta
- `#99104` Mail, soporte, resuelto, urgente
- `#99105` Web, desarrollo, cerrado, alta

Tambien agrega comentarios de ejemplo con visibilidad mixta:

- Comentarios visibles para cliente (`visible_cliente=true`)
- Comentarios internos (`visible_cliente=false`)

## 7. Recorrido recomendado de prueba

1. Login con `cliente.alfa@alfaretail.com`.
2. Crear ticket web y verificar sugerencia de similares antes de crear.
3. Ver detalle de ticket y comprobar que NO se ven comentarios internos.
4. Login con `admin.soporte@empresa.com`.
5. Reasignar ticket y mover bolsa soporte/desarrollo.
6. Agregar comentario interno y otro visible para cliente.
7. Probar webhook WhatsApp en modo `dryRun=true`.
8. Repetir webhook con `dryRun=false` para creacion real.

## 8. Archivos creados o usados para esto

- `seeds/seed-e2e.js`
- `scripts/create-client-user.js`
- `scripts/test-whatsapp-webhook.js`
- `docs/INTEGRACION_WSP_EXTERNA_RUNBOOK.md`

## 9. Comando rapido de setup demo

```bash
npm install
npm run db:init
npm run db:seed:e2e
npm start
```
