# AGENTS.md — api/

## Stack

- **Laravel 13.39** sobre PHP 8.4, configurado **solo como API**: sin `routes/web.php`, sin vistas Blade ni assets de frontend.
- Composer para dependencias. Sin paquetes extra: sin Breeze, Jetstream ni Sanctum.
- **MySQL** como base de datos, configurado en `.env.example` (base `explorador_planet`). No se han ejecutado migraciones ni creado tablas propias.
- Acceso a fuentes externas (TV en vivo, radio, atlas) exclusivamente desde aquí; el front nunca las llama directamente.

## Estructura relevante

- `routes/api.php` — endpoints `GET /api/countries/{code}/atlas`, `/radio` y `/tv`.
- `app/Http/Controllers/` — un controlador invocable por módulo. `RadioController` usa Radio Browser; TV y atlas conservan datos mock (MX, ES, AR).
- `app/Http/Resources/` — normalizan el JSON de cada módulo.
- `app/Services/` — `RadioBrowserService` implementado; `IptvOrgService` y `RestCountriesService` siguen como placeholders.
- `config/cors.php` — CORS habilitado para `api/*`.
- `bootstrap/app.php` — registra solo las rutas de API y el health check nativo en `/up`.
- `tests/Feature/ExampleTest.php` — comprueba que `/up` responde 200.

## Reglas

Las reglas generales del proyecto están en [`../AGENTS.md`](../AGENTS.md).
