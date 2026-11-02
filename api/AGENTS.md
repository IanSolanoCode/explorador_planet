# AGENTS.md — api/

## Stack

- **Laravel 13.39** sobre PHP 8.4, configurado **solo como API**: sin `routes/web.php`, sin vistas Blade ni assets de frontend.
- Composer para dependencias. Sanctum `v4.3.3` instalado para tokens Bearer; sin Breeze ni Jetstream.
- **MySQL** como base de datos. La base local `explorador_planet_db` ya tiene las migraciones ejecutadas; las credenciales están en `.env` y no se versionan.
- Acceso a fuentes externas (TV en vivo, radio, atlas) exclusivamente desde aquí; el front nunca las llama directamente.

## Estructura relevante

- `routes/api.php` — endpoints actuales: auth (`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`) y módulos (`GET /api/countries/{code}/atlas`, `/radio`, `/tv` y `/tv/adult`). El middleware `admin` está registrado en `bootstrap/app.php`; no hay rutas de prueba en este archivo. Favoritos y administración de bloqueos se añadirán en etapas posteriores.
- `app/Http/Controllers/` — un controlador invocable por módulo y `AuthController`. `RadioController` usa Radio Browser, `TvController` usa iptv-org y atlas conserva datos mock (MX, ES, AR).
- `app/Http/Requests/` — `RegisterRequest` y `LoginRequest` validan y normalizan el email a minúsculas; el registro rechaza `role`.
- `app/Http/Resources/` — normalizan el JSON de cada módulo; `UserResource` expone solo `id`, `name`, `email` y `role`.
- `app/Services/` — `RadioBrowserService` e `IptvOrgService` implementados; `RestCountriesService` sigue como placeholder.
- `app/Console/Commands/AdminCreate.php` — comando `admin:create`; crea o actualiza el administrador desde `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`, sin imprimir la contraseña.
- `app/Http/Middleware/EnsureUserIsAdmin.php` — middleware `admin`; responde `403` JSON con `Solo administradores.` a usuarios autenticados sin rol admin.
- `app/Models/` — `User` con `HasApiTokens`, `isAdmin()`, `favorites()` y `blockedItems()`; modelos `Favorite` y `BlockedItem`.
- `database/migrations/` — migraciones por defecto, `personal_access_tokens`, rol de usuario, favoritos y bloqueos.
- `config/admin.php` — credenciales `ADMIN_*` usadas por `admin:create`.
- `config/cors.php` — CORS habilitado para `api/*` con `GET`, `POST`, `DELETE` y `OPTIONS`.
- `config/sanctum.php` — tokens con expiración de 30 días (`43200` minutos).
- `bootstrap/app.php` — registra solo las rutas de API, el health check nativo en `/up`, JSON para errores de `/api/*`, anula la redirección de invitados (401 JSON) y define el alias `admin`.
- `tests/Feature/AdminMiddlewareTest.php` — define una ruta temporal dentro del test para comprobar `401`, `403` y `200` con `auth:sanctum` + `admin`. Usa la base MySQL de test `explorador_planet_test`, `DatabaseTransactions` y una aserción de que la base activa es la de test.
- `tests/Feature/ExampleTest.php` — comprueba que `/up` responde 200.
- `phpunit.xml` — los tests usan MySQL con `DB_DATABASE=explorador_planet_test`; no usan SQLite.

## Reglas

Las reglas generales del proyecto están en [`../AGENTS.md`](../AGENTS.md).

- El código de `api/` lleva comentarios en español sobre intención, seguridad e invariantes.
- `ADMIN_PASSWORD` se usa solo para `php artisan admin:create`; debe borrarse del `.env` local después de crear el administrador.
