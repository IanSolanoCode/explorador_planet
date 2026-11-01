# AGENTS.md — api/

## Stack

- **Laravel 13.39** sobre PHP 8.4, configurado **solo como API**: sin `routes/web.php`, sin vistas Blade ni assets de frontend.
- Composer para dependencias. Sanctum `v4.3.3` instalado para tokens Bearer; sin Breeze ni Jetstream.
- **MySQL** como base de datos. La base local `explorador_planet_db` ya tiene las migraciones ejecutadas; las credenciales están en `.env` y no se versionan.
- Acceso a fuentes externas (TV en vivo, radio, atlas) exclusivamente desde aquí; el front nunca las llama directamente.

## Estructura relevante

- `routes/api.php` — endpoints actuales: `GET /api/countries/{code}/atlas`, `/radio`, `/tv` y `/tv/adult`. Las rutas de auth, favoritos y administración se añadirán en etapas posteriores.
- `app/Http/Controllers/` — un controlador invocable por módulo. `RadioController` usa Radio Browser, `TvController` usa iptv-org y atlas conserva datos mock (MX, ES, AR).
- `app/Http/Resources/` — normalizan el JSON de cada módulo.
- `app/Services/` — `RadioBrowserService` e `IptvOrgService` implementados; `RestCountriesService` sigue como placeholder.
- `app/Models/` — `User` con `HasApiTokens`, `isAdmin()`, `favorites()` y `blockedItems()`; modelos `Favorite` y `BlockedItem`.
- `database/migrations/` — migraciones por defecto, `personal_access_tokens`, rol de usuario, favoritos y bloqueos.
- `config/cors.php` — CORS habilitado para `api/*` con `GET`, `POST`, `DELETE` y `OPTIONS`.
- `config/sanctum.php` — tokens con expiración de 30 días (`43200` minutos).
- `bootstrap/app.php` — registra solo las rutas de API y el health check nativo en `/up`.
- `tests/Feature/ExampleTest.php` — comprueba que `/up` responde 200.

## Reglas

Las reglas generales del proyecto están en [`../AGENTS.md`](../AGENTS.md).
