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
- **Códigos ISO-2**: Manejo del caso -99 usando campos alternativos iso_a2_eh/iso_a3_eh
- **Panel lateral**: Al hacer clic en un país, muestra su nombre y código ISO-2
- **Barra de pestañas**: "Radio" y "TV" - cambia el estado visual, funcionalidad pendiente
- **API**: Consume endpoints `/api/countries/{code}/atlas`, `/radio`, `/tv` desde la API Laravel

## Manejo de códigos ISO-2

El dataset `datasets/geo-countries` trae `-99` para países como Francia o Noruega
en los campos `iso_a2`/`iso_a3`. El código usa el campo alternativo `_eh`:
- Si `iso_a2` es `-99`, se usa `iso_a2_eh`
- Lo mismo para `iso_a3` → `iso_a3_eh`

Esto se aplica en la función `getIso2FromFeature()` en `main.js`.

## Reglas

- El front **nunca** llama directamente a fuentes externas; todo pasa por la api/
- Las variables de entorno van en `.env`, nunca escritas en el código fuente
- `front/.env` y `front/node_modules` están en `.gitignore` (archivo raíz)
- Documentar en `PROGRESS.md` cualquier decisión abierta
