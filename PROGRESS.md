# PROGRESS.md

Estado del proyecto **Explorador Planet**. Actualizar al terminar cada tarea.

Última actualización: 2026-10-28

## Hecho

- Estructura base de documentación del proyecto.
- `README.md` con la descripción del proyecto.
- `AGENTS.md` en la raíz con contexto, flujo de datos, estructura y reglas de trabajo.
- `AGENTS.md` locales en `api/` y `front/`.
- `.gitignore` inicial para el entorno Laravel + front.
- Proyecto Laravel 13.39 limpio instalado en `api/` (PHP 8.4), en modo API: solo `routes/api.php`, sin rutas web, vistas ni assets de frontend.
- `api/.env.example` configurado para MySQL (base `explorador_planet`). Sin migraciones ejecutadas ni tablas propias.
- Servidor de desarrollo levantado con `php artisan serve`; `/up` responde 200.
- Endpoints de ejemplo: `GET /api/countries/{code}/atlas`, `/radio` y `/tv`.
- Un controlador por módulo (`AtlasController`, `RadioController`, `TvController`) con datos mock para MX, ES y AR.
- API Resources: `CountryResource`, `RadioStationResource`, `TvChannelResource`.
- Services vacíos: `IptvOrgService`, `RadioBrowserService`, `RestCountriesService`.
- CORS habilitado en `config/cors.php` para `api/*`.
- Validación de `{code}`: exactamente 2 letras; si no, `422` con mensaje claro en español.
- Pruebas con curl de los tres endpoints (MX, códigos inválidos y atlas sin datos). Sin migraciones ni modelos.

## En curso

- Servidor de desarrollo `php artisan serve` activo en http://127.0.0.1:8000 (health check en `/up`).

## Pendiente

- Definir el stack concreto del front (librería 3D, framework de UI, build).
- Crear el esqueleto de `front/` con el globo 3D.
- Implementar los Services reales (IptvOrg, RadioBrowser, RestCountries) y sustituir los datos mock.
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
- `api/` usa Laravel 13 en modo API puro: rutas solo en `routes/api.php`, sin `routes/web.php`, vistas ni assets. Sin Breeze, Jetstream ni Sanctum.
- MySQL es la base de datos del proyecto; `.env.example` apunta a la base `explorador_planet` en `127.0.0.1:3306`.
- Caché y sesiones usan el driver `file`, y las colas `sync`, para no depender de tablas mientras no haya migraciones propias.
- Se conservan las migraciones por defecto de Laravel (users, cache, jobs) pero no se han ejecutado.
- El health check nativo de Laravel en `/up` se usa para verificar que el servicio está vivo.
- Los endpoints de módulos son `GET /api/countries/{code}/atlas`, `/radio` y `/tv`, con un controlador invocable por módulo.
- El código de país se normaliza a mayúsculas y debe ser exactamente 2 letras ASCII; si no, la api responde `422` con `message` y `errors.code`.
- Si el código es válido pero no hay datos de atlas, se responde `404` con un mensaje claro. TV y radio devuelven `{"data": []}`.
- Las respuestas usan API Resources y van envueltas en `data` (objeto para atlas, lista para TV y radio).
- El contrato de atlas incluye `code`, `name`, `officialName`, `capital`, `region`, `subregion`, `population`, `latlng`, `flag`, `languages` y `currencies`.
- Los mocks existen solo para MX, ES y AR; las URLs de streams y logos son ficticias (`example.com`).
- Los Services se crean vacíos como puntos de integración futura; los controladores no llaman a APIs externas.
- CORS permite `GET` y `OPTIONS` desde cualquier origen para `api/*`.

### Problemas abiertos

- Credenciales de MySQL local sin configurar: `root` sin contraseña devuelve error 1045, así que la conexión real a la base no se ha verificado.
- Los mocks usan URLs ficticias: todavía no hay streams ni logos reales.
- Stack del globo 3D sin decidir.
- Fuentes de TV en vivo y radio sin evaluar (disponibilidad, licencias, geobloqueo, calidad del stream).
- Cobertura de países del atlas sin definir.
- Sin definir aún qué datos se muestran por país y por módulo.
