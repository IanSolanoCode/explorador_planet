# PROGRESS.md

Estado del proyecto **Explorador Planet**. Actualizar al terminar cada tarea.

Última actualización: 2026-10-27

## Hecho

- Estructura base de documentación del proyecto.
- `README.md` con la descripción del proyecto.
- `AGENTS.md` en la raíz con contexto, flujo de datos, estructura y reglas de trabajo.
- `AGENTS.md` locales en `api/` y `front/`.
- `.gitignore` inicial para el entorno Laravel + front.

## En curso

- Nada por ahora.

## Pendiente

- Definir el stack concreto del front (librería 3D, framework de UI, build).
- Crear el esqueleto de `api/` con Laravel y su configuración solo API.
- Crear el esqueleto de `front/` con el globo 3D.
- Definir el contrato de la API: endpoints de países, módulos y datos.
- Elegir y documentar las fuentes externas de TV en vivo, radio y atlas.
- Definir la estrategia de caché de la api para las fuentes externas.
- Definir el modelo de datos de países y la relación con las fuentes.

## Decisiones y problemas

### Decisiones

- El proyecto se separa en `api/` (Laravel) y `front/` (globo 3D) como partes independientes del repositorio.
- La api es **solo API**: no sirve vistas ni assets del front.
- Todo dato externo pasa por la api antes de llegar al front. El front no consume fuentes externas directamente.
- La api normaliza las respuestas para que el front dependa de un contrato propio y no del formato de cada fuente.
- La documentación se escribe en español.

### Problemas abiertos

- Stack del globo 3D sin decidir.
- Fuentes de TV en vivo y radio sin evaluar (disponibilidad, licencias, geobloqueo, calidad del stream).
- Cobertura de países del atlas sin definir.
- Sin definir aún qué datos se muestran por país y por módulo.
