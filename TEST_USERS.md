# Usuarios de Prueba — Sistema de Tickets

> **Importante:** Antes de probar con estos usuarios, ejecutá el script para actualizar las contraseñas:
> ```
> node scripts/update-test-passwords.js
> ```

---

## Cuentas disponibles

| Rol | Nombre | Email | Contraseña | Acceso |
|-----|--------|-------|------------|--------|
| `admin` | Administrador | `admin@empresa.com` | `password` | Todo el sistema, usuarios, config |
| `tecnico_desarrollo` | Jeremias Montoya | `jeremias@empresa.com` | `Jeremias2025` | Tickets asignados, radar dev, Groq |
| `tecnico_soporte` | Soporte General | `soporte@empresa.com` | `Soporte2025` | Tickets asignados, cambio de estado |

> La contraseña del admin **no se modifica** con el script — queda en `password`.

---

## Qué puede hacer cada rol

### admin
- Crear/editar/desactivar usuarios
- Ver **todos** los tickets sin restricción
- Reasignar tickets entre bolsas y usuarios
- Configurar notificaciones globales

### tecnico_desarrollo (`jeremias@empresa.com`)
- Ve solo los tickets donde es receptor o ejecutor
- Accede al **Radar Dev** y al **Groq Beta** en la vista de ticket
- Puede cambiar estado, comentar, adjuntar archivos
- No puede crear usuarios

### tecnico_soporte (`soporte@empresa.com`)
- Ve solo los tickets donde es receptor o ejecutor
- Puede cambiar estado y comentar
- Sin acceso al Radar Dev
- No puede crear usuarios

---

## Funcionalidades nuevas a probar

### Alertas de demora
- Umbrales por prioridad (activo solo en tickets **no** Resueltos/Cerrados):

| Prioridad | Advertencia (amarillo) | Crítico (rojo pulsante) |
|-----------|------------------------|------------------------|
| Urgente   | 0 días                 | 1 día                  |
| Alta      | 1 día                  | 3 días                 |
| Media     | 3 días                 | 7 días                 |
| Baja      | 7 días                 | 14 días                |

- En la **lista** (`/tickets`): badge con fuego 🔥 en la columna "Días" + banner resumen arriba de la tabla.
- En el **detalle** (`/tickets/:id`): banner rojo/amarillo debajo del encabezado.

### Resumen Rápido
- Card en el sidebar del detalle de ticket (visible para usuarios internos).
- Genera automáticamente un texto con número, cliente, estado, prioridad, días, ejecutor y link.
- Botón **Copiar** para pegar en cualquier lado.
- Botón **WhatsApp** abre `wa.me` con el texto listo para enviar.

---

## Flujo de prueba sugerido

1. Loguear con `soporte@empresa.com / Soporte2025`
2. Ir a un ticket con prioridad **Urgente** y más de 1 día → verificar banner rojo
3. Ir a un ticket con prioridad **Media** y 4+ días → verificar banner amarillo
4. Abrir cualquier ticket → usar card **Resumen Rápido** y probar "Copiar"
5. Loguear con `jeremias@empresa.com / Jeremias2025` y repetir
6. Loguear con `admin@empresa.com / password` para ver todos los tickets y sus alertas en la lista
