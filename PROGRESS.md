# PROGRESS.md

Estado del proyecto **Explorador Planet**. Actualizar al terminar cada tarea.

Última actualización: 2026-10-31

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
- Un controlador por módulo (`AtlasController`, `RadioController`, `TvController`); TV y radio usan datos reales y atlas conserva mocks.
- API Resources: `CountryResource`, `RadioStationResource`, `TvChannelResource`.
- Services: `RadioBrowserService` y `IptvOrgService` implementados; `RestCountriesService` sigue vacío.
- CORS habilitado en `config/cors.php` para `api/*`.
- Validación de `{code}`: exactamente 2 letras; si no, `422` con mensaje claro en español.
- Pruebas con curl de los tres endpoints (MX, códigos inválidos y atlas sin datos). Sin migraciones ni modelos.
- Módulo de radio conectado a Radio Browser: `RadioBrowserService` consulta `/json/stations/bycountrycodeexact/{code}` con `hidebroken=true`, `order=votes`, `reverse=true` y `limit=50`.
- `RadioBrowserService` usa un User-Agent propio, timeout de conexión y respuesta de 5 s, y rotación de servidores (descubrimiento por DNS de `all.api.radio-browser.info` y respaldo `de1`/`de2`, en orden aleatorio).
- Normalización de emisoras: `stationuuid`→`id`, `name` con `trim`, `countrycode`→`country`, `url_resolved`→`streamUrl`, `favicon`→`logo` y `tags` separadas por coma, sin duplicados y con máximo de 5.
- Caché de radio de 6 horas por país en el store `file`, con clave `radio-browser:stations:{CODE}`. También se cachea el resultado vacío para no repetir consultas.
- `RadioController` ya no usa mocks: si todos los servidores fallan responde `502` con `message` y `error: radio_browser_unavailable`; si el país no tiene emisoras responde `200` con `data: []`.
- Mocks de radio eliminados; los mocks de atlas siguen intactos.
- Pruebas con curl del módulo de radio: PE y CO devuelven 50 emisoras; BV, TK y ZZ devuelven `200` con `data: []`; MEX y 1 devuelven `422`; fallo simulado de todos los servidores devuelve `502` y la recuperación posterior vuelve a `200`. Caché verificada con expiración de ~6 h y TV/atlas sin cambios.
- Módulo de TV conectado a iptv-org: `IptvOrgService` descarga `channels.json`, `streams.json`, `blocklist.json` y `logos.json` con timeout de 30 s, procesando un archivo cada vez y liberando cada array con `unset` antes de cargar el siguiente.
- Filtros de TV: excluye canales cerrados (`closed`), canales del blocklist, streams con `referrer` o `user_agent`, y separa adultos. Prefiere HTTPS sin descartar HTTP y elige el mejor stream por calidad.
- TV normalizada al contrato con `id`, `name`, `country`, `streamUrl`, `logo`, `category`, `source` (`iptv-org`) y `secure` (booleano según HTTPS).
- Logos tomados de `logos.json`: se prefiere `in_use: true`, `feed: null` y mayor área.
- Categoría: primera distinta de `general`; si todas son `general`, se usa `general`.
- Endpoint `/api/countries/{code}/tv` devuelve solo canales no adultos; `/api/countries/{code}/tv/adult` devuelve los adultos. Ambos comparten contrato.
- Caché de TV de 6 h por país en el store `file`, con claves `iptv:tv:{CODE}` e `iptv:tv:adult:{CODE}`. Los fallos no se cachean.
- Si falla la descarga de iptv-org, la API responde `502` con `message` y `error: iptv_org_unavailable`.
- Pruebas de TV: MX 172 canales, ES 216, CO 122, ZZ vacío, MEX `422` y MX adulto vacío. Primera llamada a MX 13,61 s y segunda 0,33 s (caché).
- Pico de memoria medido al construir la lista de TV: `98.566.144` bytes (94,0 MiB) con `memory_get_peak_usage(true)`.
- Fallo simulado de descarga de iptv-org: la API responde `502` con `iptv_org_unavailable` y no deja nada en caché.
- Tres streams HTTPS de MX verificados con `curl -I`: 8NTV (200), AcustikTV (200) y AlcanceTV (200); 15TV falló con HTTP 000 y se descartó de la muestra.

## En curso

- Servidor de desarrollo `php artisan serve` activo en http://127.0.0.1:8000 (health check en `/up`).
- Sin tareas de código en curso.

## Pendiente

- Definir el stack concreto del front (librería 3D, framework de UI, build).
- Crear el esqueleto de `front/` con el globo 3D.
- Implementar `RestCountriesService` y sustituir el mock de atlas (TV y radio ya usan datos reales).
- Definir la estrategia de caché de atlas.
- Definir el modelo de datos de países y la relación con las fuentes.
- **Monetización de TV**: falta decidir cómo se monetizará el módulo de TV; la decisión sigue pendiente.
- **Streams `http://` en frontend HTTPS**: en TV quedan 32 canales en MX, 16 en ES y 31 en CO con stream solo HTTP. Un front HTTPS los bloqueará por contenido mixto. Falta decidir entre excluirlos o proxearlos.
- **Registrar reproducción con `/json/url/{uuid}`** (radio): al reproducir una emisora hay que llamar a Radio Browser para registrar el clic. Como el front no puede llamar a fuentes externas, falta definir un endpoint de la api y si el fallo debe ignorarse.

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
- Los mocks de atlas existen solo para MX, ES y AR; sus URLs son ficticias. TV y radio ya usan datos reales.
- `RestCountriesService` se mantiene vacío como punto de integración futura.
- CORS permite `GET` y `OPTIONS` desde cualquier origen para `api/*`.
- Radio Browser es la fuente del módulo de radio. Se consulta el endpoint por código de país exacto y se piden solo emisoras no rotas, ordenadas por votos descendente y con un máximo de 50.
- El servicio de radio se identifica con un User-Agent propio (`ExploradorPlanet/1.0`) y aplica un timeout de 5 s por intento de servidor.
- La rotación de servidores de radio combina descubrimiento DNS y servidores de respaldo, en orden aleatorio, y prueba el siguiente servidor ante error HTTP, respuesta no válida o excepción.
- La respuesta de Radio Browser se normaliza al contrato de radio antes de cachearse, de modo que el front no depende del formato externo.
- Las etiquetas de radio se separan por coma, se recortan, se deduplican y se limitan a 5; los campos de texto se recortan y los ausentes se devuelven como cadena vacía.
- La caché de radio es de 6 h por país en el store `file`; se cachean también los resultados vacíos. Un fallo total de la fuente no se cachea.
- Si todos los servidores de radio fallan, la api responde `502` con un JSON claro; si el país no tiene emisoras, responde `200` con `data: []`. Los fallos de cada servidor se registran con `Log::warning`.
- iptv-org es la fuente del módulo de TV: `channels.json` aporta canal, país, categorías, `is_nsfw` y `closed`; `streams.json` aporta URL, calidad, `referrer` y `user_agent`; `blocklist.json` aporta canales bloqueados; `logos.json` aporta los logos.
- La fuente **no tiene un campo `isOfficial`** (ni en canales ni en streams). No se deriva ni se inventa: se añade `source: "iptv-org"` como trazabilidad de origen, no como garantía de autorización.
- El contrato de TV añade `source` y `secure`; `secure` es `true` si `streamUrl` empieza por `https://`.
- Procesar iptv-org un archivo a la vez y liberar cada array con `unset` mantiene el pico de memoria en 94,0 MiB, dentro del límite de 128 MB.
- La caché de TV es de 6 h por país, separada para adultos y no adultos, y se construye una sola vez por TTL; los fallos de descarga no se cachean.
- Si iptv-org falla, la api responde `502` con `iptv_org_unavailable`; un país sin canales responde `200` con `data: []`.
- El endpoint `/tv/adult` existe y está separado de `/tv`, pero **casi siempre devolverá `data: []`**: solo hay 2 canales NSFW con stream en todo el dataset de iptv-org y ninguno está en MX, ES o CO.

### Problemas abiertos

- Credenciales de MySQL local sin configurar: `root` sin contraseña devuelve error 1045, así que la conexión real a la base no se ha verificado.
- El mock de atlas usa URLs ficticias; todavía no hay fuente real de atlas.
- Stack del globo 3D sin decidir.
- La fuente de radio (Radio Browser) y la de TV (iptv-org) están integradas; queda por evaluar la fuente de atlas.
- Cobertura de países del atlas sin definir.
- Sin definir aún qué datos se muestran por país y por módulo.
- Muchas emisoras de radio devuelven `streamUrl` HTTP, incompatible con un front HTTPS sin proxy o filtro. En TV ocurre lo mismo con 32 canales de MX, 16 de ES y 31 de CO.
- La decisión de monetización del módulo de TV sigue pendiente.
- iptv-org no expone `isOfficial`; no se puede filtrar por origen autorizado sin una lista blanca propia.
- El endpoint `/tv/adult` está implementado, pero su utilidad práctica es casi nula con los datos actuales (2 canales NSFW con stream en todo el mundo).
- No hay reintentos ante fallos de Radio Browser; la caché de 6 h y la rotación de servidores son la única mitigación.
- El registro de reproducción de Radio Browser (`/json/url/{uuid}`) aún no está implementado.
