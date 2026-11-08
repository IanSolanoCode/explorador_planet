# AGENTS.md — front/

## Stack

- Vite 5 + JavaScript vanilla (sin framework)
- globe.gl para el globo 3D
- datasets/geo-countries para los datos GeoJSON de países
- hls.js se añadirá después para soportar transmisiones TV en vivo
- CSS simple (arquitectura BEM no aplicable, estilos en un solo archivo)

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

## Estructura de archivos

```
front/
├── index.html          # Página principal con canvas del globo
├── main.js             # Lógica principal: globe.gl, GeoJSON, clicks, toolbar
├── main.css            # Estilos del globo, panel lateral y barra de pestañas
├── .env                # Variables de entorno (VITE_API_URL) - NUNCA versionar
├── .env.example        # Ejemplo de variables de entorno - SÍ versionar
├── .gitignore          # Ignora .env y node_modules front
└── node_modules/       # Dependencias (ignorado por git)
```

## Funcionalidades

- **Globo 3D**: Países como Features clicables usando globe.gl + GeoJSON de datasets/geo-countries
- **Códigos ISO-2**: Lógica en main.js usa `ISO_A2` → `WB_A2` → excepciones `{ "Norway": "NO" }`; territorios sin código quedan vacíos
- **Panel lateral**: Al hacer clic en un país, muestra su nombre y código ISO-2
- **Barra de pestañas**: "Radio" y "TV" - cambia el estado visual, funcionalidad pendiente
- **API**: Consume endpoints `/api/countries/{code}/atlas`, `/radio`, `/tv` desde la API Laravel

## Manejo de códigos ISO-2

El dataset `ne_110m_admin_0_countries.geojson` (Natural Earth 110m) usa los campos:
- `ISO_A2`: código ISO-2 de 2 letras (o "-99" si no disponible)
- `WB_A2`: código World Bank de 2 letras (alternativa cuando ISO_A2 es "-99")

**Lógica en main.js** (función `getIso2FromFeature`):
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
