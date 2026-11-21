# AGENTS.md — front/

## Stack

- Vite 5 + JavaScript vanilla (sin framework)
- globe.gl para el globo 3D
- datasets/geo-countries para los datos GeoJSON de países
- hls.js (carga dinámica) para las transmisiones TV en vivo
- CSS simple (arquitectura BEM no aplicable, estilos en un solo archivo)
- Nunito (variable, OFL) autoalojada en `public/fonts/` como subconjunto latino woff2
- eslint como devDependency, solo para `no-undef` y `no-unused-vars`

## Puesta en marcha

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Instalar globe.gl y otras dependencias:
   ```bash
   npm install globe.gl @turf/turf
   ```
3. Levantar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. La aplicación estará disponible en http://localhost:5173
5. Asegurarse de que la API esté corriendo en http://127.0.0.1:8000
   - Desde api/: `php artisan serve`
   - La variable VITE_API_URL en front/.env apunta a http://127.0.0.1:8000/api por defecto
6. Comprobar el código antes de commitear:
   ```bash
   node --check main.js
   npx eslint main.js src
   npm run build
   ```

## Estructura de archivos

```
front/
├── index.html          # Página principal con canvas del globo
├── main.js             # Punto de entrada: imports e init()
├── main.css            # Estilos del globo, panel lateral y barra de pestañas
├── eslint.config.js    # Config mínima del refactor (no-undef y no-unused-vars)
├── src/
│   ├── estado.js       # Estado compartido mediante leerEstado/escribirEstado
│   ├── registro.js     # Registro de detenedores y oyentes de sesión
│   ├── utils.js        # API_BASE, volumen y logos
│   ├── paises.js       # Códigos ISO-2 y nombres de países
│   ├── tema.js         # Tema claro/oscuro (data-theme, localStorage, prefers-color-scheme)
│   ├── api.js          # peticionApi, mostrarAviso y hook del 401
│   ├── radio.js        # Carga de emisoras con AbortController
│   ├── tv.js           # Carga de canales con AbortController
│   ├── panel.js        # Panel lateral de radio y TV
│   ├── hoja.js         # Hoja inferior (móvil) / visibilidad y controles del panel
│   ├── favoritos.js    # Corazones, lista y peticiones de favoritos
│   ├── auth.js         # Token, cierre de sesión y /auth/me
│   ├── modal-auth.js   # Modal de login y registro
│   ├── cuenta.js       # Botón y menú de cuenta
│   ├── admin.js        # Botón Admin, botón Bloquear y formulario de bloqueo
│   ├── admin-bloqueos.js # Panel "Bloqueos" y desbloqueo
│   ├── globo.js        # Globo, clic de país, cámara y controles
│   ├── toolbar.js      # Pestañas Radio/TV
│   ├── reproductor-radio.js
│   ├── reproductor-tv.js
│   └── reproductor-ui.js # X (cerrar), minimizar y cierre por Escape compartidos
├── .env                # Variables de entorno (VITE_API_URL) - NUNCA versionar
├── .env.example        # Ejemplo de variables de entorno - SÍ versionar
├── .gitignore          # Ignora .env y node_modules front
└── node_modules/       # Dependencias (ignorado por git)
```

Los módulos de `src/` no tienen efectos secundarios al importarse: no crean
DOM, no registran eventos ni leen `localStorage`. Todo eso ocurre en funciones
que llama `init()`, en el mismo orden que el `main.js` original.

Para romper ciclos se usa `src/registro.js`: radio y TV se detienen entre sí con
`registrarDetenedor`/`detenerRegistrado`, y auth avisa de los cambios de sesión
con `alCambiarSesion`/`notificarCambioSesion`. El modal se inyecta en favoritos
con `configurarAperturaAuth`.

La administración se divide en `admin.js` (botón "Admin", botón "Bloquear" por
tarjeta y formulario de bloqueo) y `admin-bloqueos.js` (panel "Bloqueos" y
desbloqueo) para no superar ~500 líneas por archivo. El sentido de dependencia
es `admin.js` → `admin-bloqueos.js`; el segundo no importa al primero. La
visibilidad de la administración se controla con la clase `es-admin` en
`<body>`: los botones "Bloquear" se crean siempre y el CSS los muestra u oculta,
así las listas ya pintadas se actualizan al cambiar de sesión sin re-renderizar.

## Funcionalidades

- **Globo 3D**: Países como Features clicables usando globe.gl + GeoJSON de datasets/geo-countries
- **Códigos ISO-2**: Lógica en main.js usa `ISO_A2` → `WB_A2` → excepciones `{ "Norway": "NO" }`; territorios sin código quedan vacíos
- **Panel lateral**: Al hacer clic en un país, muestra su nombre y código ISO-2
- **Barra de pestañas**: "Radio" y "TV" - cambia el estado visual, funcionalidad pendiente
- **API**: Consume endpoints `/api/countries/{code}/radio` y `/api/countries/{code}/tv` desde la API Laravel

## Diseño responsivo

- **Sistema de diseño**: tokens CSS en `:root` (radios 12/16/24/píldora, espaciado 4–32, tipografía 12–28, paletas oscura y clara, acento dorado solo como relleno con texto oscuro). Tema mediante `html[data-theme]` y `color-scheme`; sin elección sigue `prefers-color-scheme`, con elección se guarda en `localStorage` (try/catch). Script mínimo en el `<head>` fija el tema antes de pintar (anotado por si se adopta CSP). El globo y el cielo no cambian con el tema.
- **Mobile-first**: la base de `main.css` es para pantallas angostas; `@media (min-width: 768px)` restaura tablet/escritorio. `100vh` convive con `100dvh` (respaldo) y se respetan los `env(safe-area-inset-*)`.
- **Hoja inferior**: por debajo de 768 px, el `aside#sidebar` es una bottom sheet (`max-height: 55dvh`, scroll interno) con asa (plegar/expandir) y botón de cerrar; se abre con cualquier contenido (país, "Mis favoritos" o "Bloqueos") y se pliega sin destruir el contenido. En escritorio vuelve a ser columna derecha.
- **Paisaje corto**: `@media (orientation: landscape) and (max-height: 500px)` convierte el panel en columna lateral (~320 px) y limita la TV a ~45dvh.
- **Apilado**: la hoja sube por encima de la barra de radio con `:has()`; el respaldo sin `:has()` usa `--altura-reproductor` actualizado por JS.
- **Pantalla completa**: `requestFullscreen`/`webkitRequestFullscreen`; en iPhone se usa `video.webkitEnterFullscreen()` solo para el video. Si no hay ninguna vía, se oculta el botón.
- **Movimiento reducido**: `@media (prefers-reduced-motion: reduce)` desactiva las transiciones del panel, los reproductores y el indicador "sonando". `@media (forced-colors: active)` fuerza bordes visibles.
- **Reproductor en móvil**: botón **X** (`Cerrar reproductor`, 44 px) en la esquina; botón **Minimizar** (estado `minimizado` compartido entre radio y TV, conservado al cambiar de contenido y reseteado solo con la X). TV minimizada = miniatura 140×16:9 (el `<video>` no se destruye: solo CSS + clase); radio minimizada = barra delgada. La hoja reserva un margen inferior igual a la altura real del reproductor (`--altura-reproductor`) y a la barra superior (`--altura-barra`), medidas por un `ResizeObserver` en `hoja.js` que **nunca observa la hoja**. Escape cierra el reproductor expandido solo si el foco está dentro y no hay modal ni pantalla completa.

## Manejo de códigos ISO-2

El dataset `ne_110m_admin_0_countries.geojson` (Natural Earth 110m) usa los campos:
- `ISO_A2`: código ISO-2 de 2 letras (o "-99" si no disponible)
- `WB_A2`: código World Bank de 2 letras (alternativa cuando ISO_A2 es "-99")

**Lógica en `src/paises.js`** (función `getIso2`):
1. Si `ISO_A2` tiene 2 letras y no es "-99", úsalo
2. Si no, si `WB_A2` tiene 2 letras y no es "-99", úsalo
3. Si no, busca en excepciones manuales: `{ "Norway": "NO" }`
4. Si no hay nada, devuelve vacío (territorio sin código)

Países verificados:
- **Mexico**: ISO-2 = MX (directo)
- **France**: ISO-2 = -99 en ISO_A2, WB_A2 = "FR" → usa "FR" (via WB_A2)
- **Norway**: ISO-2 = -99 en ISO_A2, WB_A2 = "-99" → excepción manual → "NO"
- **Spain**: ISO-2 = ES (directo)
- **Colombia**: ISO-2 = CO (directo)
- **Kosovo**: ISO-2 = XK (directo)
- **Taiwan**: ISO-2 = TW (directo)
- **Northern Cyprus**: ISO-2 = -99 en ambos campos → vacío
- **Somaliland**: ISO-2 = -99 en ambos campos → vacío

## Reglas

- El front **nunca** llama directamente a fuentes externas; todo pasa por la api/
- Las variables de entorno van en `.env`, nunca escritas en el código fuente
- `front/.env` y `front/node_modules` están en `.gitignore` (archivo raíz)
- Documentar en `PROGRESS.md` cualquier decisión abierta
