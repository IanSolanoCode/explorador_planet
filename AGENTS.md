# AGENTS.md

## Proyecto

**Explorador Planet** es una web para descubrir el mundo mediante un globo 3D interactivo. El usuario hace clic en un país y ve datos según el módulo activo:

- **TV en vivo**
- **Radio**
- **Atlas**

El repositorio tiene dos partes independientes:

- `api/` — backend Laravel, solo API (sin vistas ni frontend).
- `front/` — el globo 3D y la interfaz de usuario.

## Flujo de datos

```
Fuentes externas  →  api/ (Laravel)  →  front/ (globo 3D)
```

Reglas del flujo:

1. El front **nunca** llama directamente a fuentes externas.
2. Toda integración externa (TV, radio, datos geográficos/atlas) se implementa en la api.
3. La api normaliza las respuestas y las expone al front con un contrato estable.
4. Si una fuente externa falla o cambia, el problema se resuelve en la api, no en el front.

## Estructura de carpetas

```
explorador_planet/
├── README.md
├── AGENTS.md            # este archivo: contexto y reglas generales
├── PROGRESS.md          # estado del proyecto
├── .gitignore
├── api/                 # Laravel, solo API
│   └── AGENTS.md
└── front/               # globo 3D e interfaz
    └── AGENTS.md
```

Cada subproyecto tiene su propio `AGENTS.md` con el stack y las particularidades locales. Las reglas generales de este archivo aplican a ambos.

## Reglas de trabajo

- **Al terminar cada tarea, actualiza `PROGRESS.md` con lo hecho, lo pendiente y las decisiones tomadas. Al iniciar una sesión, lee `AGENTS.md` y `PROGRESS.md` antes de tocar código.**
- No instalar dependencias ni generar código que no haya sido pedido explícitamente.
- Mantener la api como única puerta de entrada a datos externos.
- Documentar en `PROGRESS.md` cualquier decisión de arquitectura o problema abierto relevante.
- La documentación y los comentarios del proyecto se escriben en español.
