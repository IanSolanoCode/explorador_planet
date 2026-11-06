# Explorador Planet — API

## Qué es

API en Laravel del proyecto **Explorador Planet**, una web para descubrir el mundo mediante un globo 3D interactivo: el usuario hace clic en un país y ve TV en vivo, radio o datos de atlas.

Esta API es la única puerta de entrada a las fuentes externas: consulta **Radio Browser** para la radio e **iptv-org** para la TV, normaliza el JSON, cachea los resultados y los expone al front con un contrato estable.

También gestiona cuentas con tokens Bearer de Sanctum, favoritos por usuario y bloqueos globales de administración que se aplican a TV, radio y favoritos.

El flujo es siempre el mismo: **fuentes externas → API → frontend**. El front nunca llama directamente a Radio Browser ni a iptv-org.

El módulo de atlas todavía devuelve datos de ejemplo para MX, ES y AR; la integración con una fuente real de países sigue pendiente.

## Requisitos

- PHP 8.3 o superior.
- Composer.
- MySQL.
- Los comandos de esta documentación están escritos para **Windows PowerShell**.

## Puesta en marcha

Ejecuta los bloques desde la carpeta `api/`, en orden, en una terminal de Windows PowerShell.

### 1. Instalar dependencias

```powershell
composer install
```

### 2. Crear el archivo de entorno

```powershell
Copy-Item .env.example .env
```

### 3. Generar la clave de la aplicación

```powershell
php artisan key:generate
```

### 4. Crear las bases de datos y el usuario del proyecto

Abre tu cliente de MySQL (MySQL Workbench, phpMyAdmin o el CLI `mysql` si está en el `PATH`) y ejecuta este SQL. Cambia `CAMBIAR_ESTA_CONTRASENA` por una contraseña real antes de usarlo.

```sql
CREATE DATABASE explorador_planet
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

CREATE DATABASE explorador_planet_test
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

CREATE USER 'explorador'@'127.0.0.1' IDENTIFIED BY 'CAMBIAR_ESTA_CONTRASENA';

GRANT ALL PRIVILEGES ON explorador_planet.* TO 'explorador'@'127.0.0.1';
GRANT ALL PRIVILEGES ON explorador_planet_test.* TO 'explorador'@'127.0.0.1';

FLUSH PRIVILEGES;
```

### 5. Rellenar `api/.env`

Estas son las variables que debes revisar. El resto puede quedarse como viene en `.env.example`.

| Variable | Qué significa |
|---|---|
| `APP_NAME` | Nombre de la aplicación en logs y correos. |
| `APP_ENV` | Entorno de ejecución; en local se usa `local`. |
| `APP_KEY` | Clave de cifrado de Laravel; la genera `php artisan key:generate`. |
| `APP_DEBUG` | Muestra detalles de error en desarrollo; en producción debe ser `false`. |
| `APP_URL` | URL base con la que se sirve la API. |
| `DB_CONNECTION` | Motor de base de datos; el proyecto usa `mysql`. |
| `DB_HOST` | Host donde escucha MySQL. |
| `DB_PORT` | Puerto de MySQL. |
| `DB_DATABASE` | Base de desarrollo: `explorador_planet`. |
| `DB_USERNAME` | Usuario creado en el paso anterior (`explorador`). |
| `DB_PASSWORD` | Contraseña de ese usuario; debe coincidir con la del SQL. |
| `ADMIN_NAME` | Nombre del administrador inicial. |
| `ADMIN_EMAIL` | Email del administrador inicial. |
| `ADMIN_PASSWORD` | Contraseña del administrador inicial; se borra después de crear la cuenta. |

### 6. Migrar la base de desarrollo

```powershell
php artisan migrate
```

### 7. Migrar la base de test

La suite no migra la base automáticamente y necesita `explorador_planet_test`.

```powershell
$env:DB_DATABASE='explorador_planet_test'; php artisan migrate --force; Remove-Item Env:DB_DATABASE
```

### 8. Crear el administrador

Rellena `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `api/.env` y ejecuta el comando. Es idempotente: si el email ya existe, actualiza el usuario y le asigna el rol `admin`.

```powershell
php artisan admin:create
```

Después de crear el administrador, **borra la línea `ADMIN_PASSWORD` de `api/.env`**. La contraseña solo se necesita para este comando.

### 9. Arrancar el servidor

```powershell
php artisan serve
```

La API queda disponible en `http://127.0.0.1:8000`.

## Comprobaciones

Con el servidor en marcha, abre otra terminal de PowerShell y ejecuta estos bloques. La primera consulta de TV de un país puede tardar unos segundos porque construye la caché.

### Preparar la URL base

```powershell
$BASE = 'http://127.0.0.1:8000'
```

### Health check

```powershell
curl.exe -s -o NUL -w "%{http_code}" "$BASE/up"
```

**Esperado:** `200`.

### Radio de México

```powershell
Invoke-RestMethod "$BASE/api/countries/MX/radio" | Select-Object -ExpandProperty data | Select-Object -First 1
```

**Esperado:** un objeto con `id`, `name`, `country`, `streamUrl`, `logo` y `tags`. La lista completa puede tener hasta 50 emisoras.

### TV de México

```powershell
Invoke-RestMethod "$BASE/api/countries/MX/tv" | Select-Object -ExpandProperty data | Select-Object -First 1
```

**Esperado:** un objeto con `id`, `name`, `country`, `streamUrl`, `logo`, `category`, `source` y `secure`.

### Atlas de México

```powershell
Invoke-RestMethod "$BASE/api/countries/MX/atlas"
```

**Esperado:** `data.code` igual a `MX`, con `name`, `officialName`, `capital`, `region`, `subregion`, `population`, `latlng`, `flag`, `languages` y `currencies`.

### Código de país inválido

```powershell
curl.exe -s -w "`n%{http_code}" "$BASE/api/countries/MEX/atlas"
```

**Esperado:** `422` con `errors.code` y el mensaje `El código de país debe tener 2 letras.`

### Registro

```powershell
$body = @{
    name = 'Usuario de prueba'
    email = 'usuario.nuevo@example.com'
    password = 'Password123'
    password_confirmation = 'Password123'
} | ConvertTo-Json

Invoke-RestMethod "$BASE/api/auth/register" -Method Post -ContentType 'application/json' -Body $body
```

**Esperado:** `201` con `data.user` (rol `user`) y `data.token`. Si el email ya existe, cambia el valor de `email`.

### Login y token

```powershell
$body = @{
    email = 'usuario.nuevo@example.com'
    password = 'Password123'
} | ConvertTo-Json

$login = Invoke-RestMethod "$BASE/api/auth/login" -Method Post -ContentType 'application/json' -Body $body
$TOKEN = $login.data.token
$login.data.user.email
```

**Esperado:** el email del usuario. La variable `$TOKEN` queda lista para las peticiones autenticadas.

### Usuario autenticado

```powershell
Invoke-RestMethod "$BASE/api/auth/me" -Headers @{ Authorization = "Bearer $TOKEN" }
```

**Esperado:** `200` con `data.id`, `data.name`, `data.email` y `data.role`.

### Crear un favorito

```powershell
$body = @{
    type = 'tv'
    itemId = '15TV.mx'
    name = '15TV'
    country = 'MX'
    streamUrl = 'https://cdn.fastocloud.com/leonel.m3u8'
    logo = 'https://i.imgur.com/CZ8LKmA.png'
} | ConvertTo-Json

Invoke-RestMethod "$BASE/api/favorites" -Method Post -Headers @{ Authorization = "Bearer $TOKEN" } -ContentType 'application/json' -Body $body
```

**Esperado:** `201` con `data.id`, `data.type`, `data.itemId`, `data.name`, `data.country`, `data.streamUrl` y `data.logo`. Si repites el alta, responde `422` por duplicado.

### Listar favoritos

```powershell
Invoke-RestMethod "$BASE/api/favorites" -Headers @{ Authorization = "Bearer $TOKEN" }
```

**Esperado:** `200` con `data` como lista de favoritos; los bloqueados no aparecen.

### Token de administrador

Inicia sesión con la cuenta de administrador creada en la puesta en marcha. Sustituye los marcadores por los datos reales de esa cuenta; no los escribas en el README ni en el repositorio.

```powershell
$body = @{
    email = '<email del administrador>'
    password = '<contraseña del administrador>'
} | ConvertTo-Json

$ADMIN_TOKEN = (Invoke-RestMethod "$BASE/api/auth/login" -Method Post -ContentType 'application/json' -Body $body).data.token
```

### Crear un bloqueo

```powershell
$body = @{
    type = 'tv'
    itemId = 'prueba-documentacion'
    reason = 'Prueba de documentacion'
} | ConvertTo-Json

$block = Invoke-RestMethod "$BASE/api/admin/blocked" -Method Post -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType 'application/json' -Body $body
$BLOCK_ID = $block.data.id
$BLOCK_ID
```

**Esperado:** `201` con `data.id`, `data.type`, `data.itemId`, `data.reason`, `data.blockedBy`, `data.createdAt` y `data.updatedAt`.

### Listar bloqueos

```powershell
Invoke-RestMethod "$BASE/api/admin/blocked" -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }
```

**Esperado:** `200` con `data` como lista de bloqueos, más recientes primero.

### Borrar el bloqueo de prueba

```powershell
curl.exe -s -o NUL -w "%{http_code}" -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/admin/blocked/$BLOCK_ID"
```

**Esperado:** `204`.

## Tests

```powershell
php artisan test
```

**Esperado:** la suite completa en verde. En el momento de escribir esta documentación son **34 tests y 140 aserciones**.

Los tests usan la base **`explorador_planet_test`**, fijada en `phpunit.xml`, y nunca la base de desarrollo. Por eso debes crearla y migrarla antes de ejecutar la suite.

## Referencia de endpoints

| Método | Ruta | Quién puede usarla | Para qué sirve |
|---|---|---|---|
| POST | `/api/auth/register` | Público, 5 intentos/min por IP | Crea un usuario y devuelve su token. |
| POST | `/api/auth/login` | Público, 5 intentos/min por email + IP | Valida credenciales y devuelve un token. |
| POST | `/api/auth/logout` | Usuario autenticado | Revoca el token de la petición actual. |
| GET | `/api/auth/me` | Usuario autenticado | Devuelve el usuario del token. |
| GET | `/api/favorites` | Usuario autenticado | Lista sus favoritos y oculta los bloqueados. |
| POST | `/api/favorites` | Usuario autenticado | Crea un favorito; rechaza duplicados, bloqueados y el límite de 200. |
| DELETE | `/api/favorites/{id}` | Propietario autenticado | Borra un favorito; `404` si no existe o es de otro usuario. |
| GET | `/api/admin/blocked` | Administrador | Lista todos los bloqueos. |
| POST | `/api/admin/blocked` | Administrador | Crea un bloqueo global. |
| DELETE | `/api/admin/blocked/{id}` | Administrador | Borra un bloqueo; `404` si no existe. |
| GET | `/api/countries/{code}/atlas` | Público | Datos del país; hoy son datos de ejemplo. |
| GET | `/api/countries/{code}/radio` | Público | Emisoras de radio del país. |
| GET | `/api/countries/{code}/tv` | Público | Canales de TV no adultos. |
| GET | `/api/countries/{code}/tv/adult` | Público | Canales de TV adultos, separados de `/tv`. |

`{code}` debe ser exactamente dos letras; si no, la API responde `422`. `/up` es el health check del framework y no forma parte de la API de negocio.

## Formato de las respuestas

Las respuestas usan API Resources y van envueltas en `data`.

### TV

```json
{
  "data": [
    {
      "id": "15TV.mx",
      "name": "15TV",
      "country": "MX",
      "streamUrl": "https://cdn.fastocloud.com/leonel.m3u8",
      "logo": "https://i.imgur.com/CZ8LKmA.png",
      "category": "general",
      "source": "iptv-org",
      "secure": true
    }
  ]
}
```

### Radio

```json
{
  "data": [
    {
      "id": "86fb3b9a-2b61-11e8-91bf-52543be04c81",
      "name": "Los 40 Principales México",
      "country": "MX",
      "streamUrl": "http://27053.live.streamtheworld.com:3690/LOS40_MEXICO_SC",
      "logo": "https://los40es00.epimg.net/estaticos/recursosgraficos/v1/img/app/los40_192.png",
      "tags": ["hits", "latin pop", "top 40"]
    }
  ]
}
```

### Atlas

```json
{
  "data": {
    "code": "MX",
    "name": "México",
    "officialName": "Estados Unidos Mexicanos",
    "capital": "Ciudad de México",
    "region": "Américas",
    "subregion": "América del Norte",
    "population": 128932753,
    "latlng": [23, -102],
    "flag": "https://flagcdn.com/w320/mx.png",
    "languages": ["Español"],
    "currencies": ["MXN - Peso mexicano"]
  }
}
```

### Favorito

```json
{
  "data": {
    "id": 1,
    "type": "tv",
    "itemId": "15TV.mx",
    "name": "15TV",
    "country": "MX",
    "streamUrl": "https://cdn.fastocloud.com/leonel.m3u8",
    "logo": "https://i.imgur.com/CZ8LKmA.png"
  }
}
```

### Bloqueo

```json
{
  "data": {
    "id": 1,
    "type": "tv",
    "itemId": "prueba-documentacion",
    "reason": "Prueba de documentacion",
    "blockedBy": 1,
    "createdAt": "2026-11-06T15:55:50+00:00",
    "updatedAt": "2026-11-06T15:55:50+00:00"
  }
}
```

### Error de validación 422

```json
{
  "message": "El código de país debe tener 2 letras.",
  "errors": {
    "code": ["El código de país debe tener 2 letras."]
  }
}
```

## Funcionamiento interno

- **Caché de 6 horas**: TV y radio guardan el resultado normalizado por país en el store `file`. TV usa las claves `iptv:tv:{CODE}` e `iptv:tv:adult:{CODE}`; radio usa `radio-browser:stations:{CODE}`. Los fallos de las fuentes no se cachean.
- **Bloqueos después de la caché**: `BlockedItemFilter` consulta `blocked_items` una sola vez por petición y elimina los ids bloqueados de la lista ya cacheada. Así un bloqueo nuevo surte efecto de inmediato, sin esperar a que caduque la caché.
- **TV y TV adulta**: `/tv` devuelve solo canales no adultos y `/tv/adult` los adultos. Ambos comparten el mismo contrato. Hoy `/tv/adult` suele devolver una lista vacía porque iptv-org tiene muy pocos canales NSFW con stream.
- **Cuentas**: Sanctum emite tokens Bearer que expiran a los 30 días. `logout` revoca solo el token usado en esa petición. Las contraseñas se guardan con bcrypt y nunca se devuelven.
- **Atlas**: el controlador conserva datos de ejemplo para MX, ES y AR; `RestCountriesService` es el punto de integración futuro.

## Pendientes y antes de publicar

- **Frontend**: construir el globo 3D y la interfaz en `front/`.
- **Atlas real**: implementar `RestCountriesService` y sustituir los datos de ejemplo.
- **Streams caídos**: verificar los `streamUrl` de TV y radio y descartar los que no respondan.
- **Caché de TV**: crear un comando que precalcule la caché por país; la primera consulta de cada país tarda unos 6 segundos.

Antes de publicar:

- `APP_DEBUG=false`.
- CORS limitado al dominio del front.
- Ajustar la memoria de PHP: el pico de TV es de 94 MiB.
- Resolver los streams `http://` en un front HTTPS.
- Implementar recuperación de contraseña.
- Publicar una política de privacidad.
- Decidir la monetización de TV.

## Problemas comunes

- **Falta la extensión PHP `intl`**: solo afecta a `php artisan db:show`, que falla al formatear la lista de tablas. `php artisan migrate`, `db:table --json` y la API funcionan con normalidad.
- **Error de certificado SSL con `curl.exe` en Windows**: si aparece un error de certificado, descarga `cacert.pem` desde <https://curl.se/ca/cacert.pem> y apunta a él con `--cacert`. `Invoke-RestMethod` suele usar el almacén de certificados de Windows y puede funcionar aunque `curl.exe` falle.
- **`429 Too Many Requests`**: el login permite 5 intentos por minuto por email + IP y el registro 5 altas por minuto por IP. Espera un minuto o cambia el email/IP de la prueba.
