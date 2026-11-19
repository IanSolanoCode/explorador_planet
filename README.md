# Explorador Planet

Una web para descubrir el mundo mediante un globo 3D interactivo: haces clic en un país y ves **TV en vivo** o **radio** de ese lugar. Es un prototipo pensado para quien quiera explorar emisoras y canales públicos indexados por terceros, sin salir del navegador.

## Qué hace

- **Globo 3D clicable**: selecciona un país sobre un globo giratorio.
- **Radio y TV en vivo por país**: listas de emisoras y canales del país elegido.
- **Reproductores** con controles de volumen, silenciar, minimizar y cerrar (en móvil, el reproductor puede plegarse a una miniatura para seguir navegando).
- **Cuentas**: registro, inicio de sesión y cierre de sesión con tokens.
- **Favoritos**: guarda canales y emisoras para tenerlos a mano.
- **Panel de administrador**: bloquea contenido para que deje de mostrarse.
- **Verificación automática de canales caídos**: un comando programado comprueba los streams y oculta los que fallan de forma repetida.
- **Diseño adaptado a móvil**: layout mobile-first, hoja inferior y reproductores compactos.

## Cómo funciona

```
fuentes externas  →  api/ (Laravel)  →  front/ (globo 3D)
```

El frontend nunca llama directamente a las fuentes externas. La API descarga y normaliza los datos (radio de Radio Browser, TV de iptv-org), los guarda en caché durante 6 horas y los expone con un contrato estable. Sobre la caché se aplican dos filtros: los bloqueos del administrador y los canales marcados como caídos por la verificación automática.

## Tecnologías

Versiones leídas de `api/composer.json`, `api/composer.lock`, `front/package.json` y `front/package-lock.json`.

| Componente | Versión |
|---|---|
| PHP | 8.4.19 |
| Laravel | 13.39.0 |
| Laravel Sanctum | 4.3.3 |
| MySQL | sin versión fijada en el repositorio |
| Vite | 8.3.6 |
| globe.gl | 2.46.2 |
| three.js | 0.187.0 (dependencia transitiva de globe.gl) |
| hls.js | 1.7.4 |
| ESLint | 10.14.0 |

## Fuentes de datos y créditos

- **Radio Browser** (radio): los datos son de dominio público; el software del servidor se publica como software libre (GPL/AGPL-3.0). Verificado en radio-browser.info.
- **iptv-org** (TV): la API y la base de datos se publican bajo The Unlicense; las listas de canales de `iptv-org/iptv` se distribuyen como dominio público/CC0. Verificado en los repositorios de GitHub de iptv-org.
- **Natural Earth** (mapa de países, `ne_110m_admin_0_countries.geojson`): dominio público. Verificado en naturalearthdata.com.
- **Texturas del globo** (tierra, topografía y cielo nocturno): proceden de three-globe (librería bajo MIT). La licencia de cada textura individual queda **pendiente de verificar**.

## Aviso legal

Este proyecto no aloja ni retransmite contenido audiovisual. Solo enlaza streams públicos de terceros que están indexados por iptv-org. Los derechos de cada emisión pertenecen a sus titulares. El administrador puede retirar cualquier contenido mediante el panel de bloqueo.

## Puesta en marcha

Los pasos completos están en [`api/README.md`](api/README.md). Resumen mínimo, en dos terminales.

**Terminal 1 — API** (desde `api/`):

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

Antes de `php artisan migrate` hay que crear las bases de datos MySQL y rellenar las variables de `api/.env`; los detalles y el comando para migrar la base de test están en [`api/README.md`](api/README.md).

**Terminal 2 — Front** (desde `front/`):

```powershell
npm install
npm run dev
```

El front queda disponible en la URL que indique Vite (por defecto `http://localhost:5173`) y espera la API en `http://127.0.0.1:8000` (configurable con `VITE_API_URL` en `front/.env`).

**Tests de la API** (desde `api/`):

```powershell
php artisan test
```

Los tests usan la base `explorador_planet_test`, fijada en `phpunit.xml`, y nunca la base de desarrollo.

## Estructura de carpetas

```
explorador_planet/
├── api/                  # Laravel, solo API
│   ├── app/              # controladores, servicios, soporte, modelos y comandos
│   ├── routes/api.php    # endpoints de auth, favoritos, bloqueos, radio y TV
│   ├── database/         # migraciones
│   └── tests/            # suite de tests
├── front/                # globo 3D e interfaz
│   ├── main.js           # punto de entrada
│   ├── main.css          # estilos (mobile-first)
│   └── src/              # módulos (globo, panel, reproductores, auth, admin…)
├── AGENTS.md             # contexto y reglas de trabajo
├── PROGRESS.md           # estado del proyecto y decisiones
└── README.md             # este archivo
```

## Estado y límites

Es un prototipo. Limitaciones conocidas (documentadas en `PROGRESS.md`):

- Algunos canales o emisoras pueden no reproducirse por CORS o por ser contenido mixto.
- Los streams `http://` pueden bloquearse como contenido mixto si el front se sirve por HTTPS.
- El resultado de la verificación de canales caídos depende del país desde el que se ejecute el servidor (geobloqueo); es una decisión pendiente.
- Las emisoras de radio que emiten en HLS no se reproducen en el elemento `<audio>`.
- El diseño móvil no se ha probado en todos los dispositivos ni navegadores.

## Pendientes antes de publicar

- `APP_DEBUG=false`.
- Limitar CORS al dominio del front.
- Ajustar la memoria de PHP (el pico de TV es de ~94 MiB).
- Resolver los streams `http://` en un front HTTPS.
- Implementar recuperación de contraseña.
- Publicar una política de privacidad.
- Decidir la monetización de TV.
- Decidir el tratamiento del geobloqueo en la verificación de streams.
- Añadir una limpieza de `stream_checks` para filas sin comprobar en más de 30 días.
- Probar en navegador real: reproducción HLS, cuentas/favoritos y panel de administrador.

## Licencia

Pendiente de definir.

## Capturas

Capturas: pendiente
