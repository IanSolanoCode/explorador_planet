# Explorador Planet

Web para descubrir el mundo mediante un globo 3D interactivo. Al hacer clic en un país se muestran datos según el módulo activo: **TV en vivo**, **radio** o **atlas**.

## Estructura

- `api/` — backend Laravel, solo API. Consulta fuentes externas, normaliza y cachea los datos, y gestiona cuentas, favoritos y bloqueos.
- `front/` — globo 3D e interfaz de usuario. **En construcción.**

El front nunca llama a las fuentes externas: todo pasa por la API.

## Documentación

- [`api/README.md`](api/README.md) — instalación, endpoints, respuestas y problemas comunes.
- [`PROGRESS.md`](PROGRESS.md) — estado del proyecto y decisiones técnicas.
