# PROGRESS.md

Estado del proyecto **Explorador Planet**. Actualizar al terminar cada tarea.

Última actualización: 2026-10-29

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
- Un controlador por módulo (`AtlasController`, `RadioController`, `TvController`); TV y atlas con datos mock para MX, ES y AR, y radio con datos reales.
- API Resources: `CountryResource`, `RadioStationResource`, `TvChannelResource`.
- Services: `RadioBrowserService` implementado; `IptvOrgService` y `RestCountriesService` vacíos.
- CORS habilitado en `config/cors.php` para `api/*`.
- Validación de `{code}`: exactamente 2 letras; si no, `422` con mensaje claro en español.
- Pruebas con curl de los tres endpoints (MX, códigos inválidos y atlas sin datos). Sin migraciones ni modelos.
- Módulo de radio conectado a Radio Browser: `RadioBrowserService` consulta `/json/stations/bycountrycodeexact/{code}` con `hidebroken=true`, `order=votes`, `reverse=true` y `limit=50`.
- `RadioBrowserService` usa un User-Agent propio, timeout de conexión y respuesta de 5 s, y rotación de servidores (descubrimiento por DNS de `all.api.radio-browser.info` y respaldo `de1`/`de2`, en orden aleatorio).
- Normalización de emisoras: `stationuuid`→`id`, `name` con `trim`, `countrycode`→`country`, `url_resolved`→`streamUrl`, `favicon`→`logo` y `tags` separadas por coma, sin duplicados y con máximo de 5.
- Caché de 6 horas por país en el store `file`, con clave `radio-browser:stations:{CODE}`. También se cachea el resultado vacío para no repetir consultas.
- `RadioController` ya no usa mocks: si todos los servidores fallan responde `502` con `message` y `error: radio_browser_unavailable`; si el país no tiene emisoras responde `200` con `data: []`.
- Mocks de radio eliminados; los mocks de TV y atlas siguen intactos.
- Pruebas con curl del módulo de radio: PE y CO devuelven 50 emisoras; BV, TK y ZZ devuelven `200` con `data: []`; MEX y 1 devuelven `422`; fallo simulado de todos los servidores devuelve `502` y la recuperación posterior vuelve a `200`. Caché verificada con expiración de ~6 h y TV/atlas sin cambios.

## En curso

- Servidor de desarrollo `php artisan serve` activo en http://127.0.0.1:8000 (health check en `/up`).
- Sin tareas de código en curso; el módulo de radio queda cerrado a falta de las notas pendientes del front.

## Pendiente

- Definir el stack concreto del front (librería 3D, framework de UI, build).
- Crear el esqueleto de `front/` con el globo 3D.
- Implementar `IptvOrgService` y `RestCountriesService`, y sustituir los mocks de TV y atlas (el de radio ya está eliminado).
- Elegir y documentar las fuentes externas de TV en vivo y atlas.
- Definir la estrategia de caché de la api para TV y atlas (radio ya usa 6 h por país en archivos).
- Definir el modelo de datos de países y la relación con las fuentes.
- **Streams `http://` en frontend HTTPS**: muchas emisoras de Radio Browser devuelven `streamUrl` con `http://`. Un front servido por HTTPS los bloqueará por contenido mixto. Falta decidir entre priorizar emisoras HTTPS, omitir las HTTP o reproducir a través de un proxy de la api.
- **Registrar reproducción con `/json/url/{uuid}`**: al reproducir una emisora hay que llamar a Radio Browser para registrar el clic. Como el front no puede llamar a fuentes externas, falta definir un endpoint de la api (por ejemplo, un proxy fire-and-forget) y si el fallo debe ignorarse sin afectar la reproducción.

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
- Los mocks de TV y atlas existen solo para MX, ES y AR; sus URLs de streams y logos son ficticias (`example.com`). Radio ya usa datos reales.
- `IptvOrgService` y `RestCountriesService` se mantienen vacíos como puntos de integración futura; `RadioBrowserService` ya llama a Radio Browser.
- CORS permite `GET` y `OPTIONS` desde cualquier origen para `api/*`.
- Radio Browser es la fuente del módulo de radio. Se consulta el endpoint por código de país exacto y se piden solo emisoras no rotas, ordenadas por votos descendente y con un máximo de 50.
- El servicio de radio se identifica con un User-Agent propio (`ExploradorPlanet/1.0`) y aplica un timeout de 5 s por intento de servidor.
- La rotación de servidores combina descubrimiento DNS y servidores de respaldo, en orden aleatorio, y prueba el siguiente servidor ante error HTTP, respuesta no válida o excepción.
- La respuesta de Radio Browser se normaliza al contrato de radio antes de cachearse, de modo que el front no depende del formato externo.
- Las etiquetas se separan por coma, se recortan, se deduplican y se limitan a 5; los campos de texto se recortan y los ausentes se devuelven como cadena vacía.
- La caché de radio es de 6 h por país en el store `file`; se cachean también los resultados vacíos. Un fallo total de la fuente no se cachea.
- Si todos los servidores de radio fallan, la api responde `502` con un JSON claro; si el país no tiene emisoras, responde `200` con `data: []`. Los fallos de cada servidor se registran con `Log::warning`.
- Los mocks de radio se eliminan, pero TV y atlas mantienen sus mocks hasta integrar sus fuentes.
- El front seguirá sin llamar a Radio Browser directamente; el registro de reproducción mediante `/json/url/{uuid}` tendrá que pasar por la api.

### Problemas abiertos

- Credenciales de MySQL local sin configurar: `root` sin contraseña devuelve error 1045, así que la conexión real a la base no se ha verificado.
- Los mocks de TV y atlas usan URLs ficticias: todavía no hay streams ni logos reales en esos módulos.
- Stack del globo 3D sin decidir.
- La fuente de radio (Radio Browser) está integrada; quedan por evaluar las fuentes de TV en vivo y atlas (disponibilidad, licencias, geobloqueo, calidad del stream).
- Cobertura de países del atlas sin definir.
- Sin definir aún qué datos se muestran por país y por módulo.
- Muchas emisoras de Radio Browser devuelven `streamUrl` HTTP, incompatible con un front HTTPS sin proxy o filtro.
- No hay reintentos ante fallos de Radio Browser; la caché de 6 h y la rotación de servidores son la única mitigación.
- El registro de reproducción de Radio Browser (`/json/url/{uuid}`) aún no está implementado.
