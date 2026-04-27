# Agentes disponibles

| Agente | Archivo | Descripción |
|--------|---------|-------------|
| Front | `.opencode/agents/front.md` | UI con EJS, CSS, Components |
| Back | `.opencode/agents/back.md` | Lógica servidor, BD, API |
| Testing | `.opencode/agents/testing.md` | Tests, Jest, Quality |

## Cómo Usar

Para activar un agente, simplemente menciona su nombre al inicio del prompt:

> "Front, necesito agregar un nuevo campo al formulario de tickets"

> "Back,帮我 crear un nuevo endpoint para exportar tickets"

> "Testing, quiero agregar tests para el middleware de auth"

Cada agente tiene su contexto específico del proyecto y sabe: