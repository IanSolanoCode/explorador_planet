# AGENTS.md — api/

## Stack

- **Laravel 13.39** sobre PHP 8.4, configurado **solo como API**: sin `routes/web.php`, sin vistas Blade ni assets de frontend.
- Composer para dependencias. Sanctum `v4.3.3` instalado para tokens Bearer; sin Breeze ni Jetstream.
- **MySQL** como base de datos. `.env.example` usa `explorador_planet` para desarrollo; la suite usa `explorador_planet_test` mediante `phpunit.xml`. Las credenciales viven en `.env` y no se versionan.
- Acceso a fuentes externas (TV en vivo, radio, atlas) exclusivamente desde aquí; el front nunca las llama directamente.

## Puesta en marcha

Desde `api/`:

1. `composer install`.
2. Copiar `.env.example` a `.env`: `Copy-Item .env.example .env` en Windows o `cp .env.example .env` en Unix.
3. `php artisan key:generate` y completar `DB_*` y `ADMIN_*` en `.env`.
4. Crear las bases MySQL:
   ```sql
   CREATE DATABASE explorador_planet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE explorador_planet_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
5. `php artisan migrate`.
6. Migrar la base de test (la suite no ejecuta migraciones automáticamente):
   ```powershell
   $env:DB_DATABASE='explorador_planet_test'; php artisan migrate --force; Remove-Item Env:DB_DATABASE
   ```
   En Bash: `DB_DATABASE=explorador_planet_test php artisan migrate --force`.
7. `php artisan admin:create`.
8. `php artisan serve`.
9. `php artisan test`.

`admin:create` usa `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`; después de crear el administrador, borrar `ADMIN_PASSWORD` del `.env`.

## Estructura relevante

- `routes/api.php` — auth (`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`), favoritos (`GET/POST /api/favorites`, `DELETE /api/favorites/{id}`), administración de bloqueos (`GET/POST /api/admin/blocked`, `DELETE /api/admin/blocked/{id}`) y módulos (`GET /api/countries/{code}/atlas`, `/radio`, `/tv` y `/tv/adult`). El middleware `admin` está registrado en `bootstrap/app.php`; no hay rutas de prueba en este archivo.
- `app/Http/Controllers/` — `AuthController`, `FavoriteController`, `AdminBlockedItemController` y un controlador invocable por módulo. `RadioController` usa Radio Browser, `TvController` usa iptv-org y atlas conserva datos mock (MX, ES, AR).
- `app/Http/Requests/` — `RegisterRequest`, `LoginRequest`, `StoreFavoriteRequest` y `StoreBlockedItemRequest`; validan y normalizan sus campos, y el registro rechaza `role`.
- `app/Http/Resources/` — normalizan el JSON de cada módulo; `UserResource` expone solo `id`, `name`, `email` y `role`; `FavoriteResource` y `BlockedItemResource` usan camelCase.
- `app/Services/` — `RadioBrowserService` e `IptvOrgService` implementados; `RestCountriesService` sigue como placeholder.
- `app/Support/BlockedItemFilter.php` — filtra TV y radio contra `blocked_items` después de leer la caché, con una sola consulta por petición.
- `app/Console/Commands/AdminCreate.php` — comando `admin:create`; crea o actualiza el administrador desde `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`, sin imprimir la contraseña.
- `app/Http/Middleware/EnsureUserIsAdmin.php` — middleware `admin`; responde `403` JSON con `Solo administradores.` a usuarios autenticados sin rol admin.
- `app/Models/` — `User` con `HasApiTokens`, `isAdmin()`, `favorites()` y `blockedItems()`; modelos `Favorite` y `BlockedItem`.
- `database/migrations/` — migraciones por defecto, `personal_access_tokens`, rol de usuario, favoritos y bloqueos.
- `config/admin.php` — credenciales `ADMIN_*` usadas por `admin:create`.
- `config/cors.php` — CORS habilitado para `api/*` con `GET`, `POST`, `DELETE` y `OPTIONS`.
- `config/sanctum.php` — tokens con expiración de 30 días (`43200` minutos).
- `bootstrap/app.php` — registra solo las rutas de API, el health check nativo en `/up`, JSON para errores de `/api/*`, anula la redirección de invitados (401 JSON) y define el alias `admin`.
- `tests/Feature/` — `AdminMiddlewareTest`, `FavoriteTest`, `AdminBlockedItemTest` y `BlockedContentFilterTest`; usan `explorador_planet_test` y `DatabaseTransactions` o `Http::fake` según el caso. `ExampleTest` comprueba `/up`.
- `phpunit.xml` — los tests usan MySQL con `DB_DATABASE=explorador_planet_test`; no usan SQLite.

## Reglas

Las reglas generales del proyecto están en [`../AGENTS.md`](../AGENTS.md).

- El código de `api/` lleva comentarios en español sobre intención, seguridad e invariantes.
- `ADMIN_PASSWORD` se usa solo para `php artisan admin:create`; debe borrarse del `.env` local después de crear el administrador.
