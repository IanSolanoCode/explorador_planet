# Explorador Planet

Web para descubrir el mundo con un globo 3D interactivo. Al hacer clic en un país se muestran datos según el módulo activo: **TV en vivo**, **radio** o **atlas**.

El proyecto se divide en dos partes:

- `api/` — backend en Laravel, solo API. Centraliza el acceso a las fuentes externas.
- `front/` — el globo 3D y la interfaz de usuario.

Los datos externos nunca llegan directamente al front: pasan siempre por la api.

## Documentación

- [`AGENTS.md`](AGENTS.md) — contexto del proyecto, flujo de datos, estructura y reglas de trabajo.
- [`PROGRESS.md`](PROGRESS.md) — estado actual: hecho, en curso, pendiente, decisiones y problemas.
