/**
 * Explorador Planet - Frontend
 * Módulo: Globo 3D interactivo con países clicables
 * 
 * Se usa globe.gl para el renderizado y fetch a la API local.
 * La URL de la API viene de VITE_API_URL en las variables de entorno.
 */

// Configuración: leer la URL de la API de las variables de entorno
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// Cargar datos GeoJSON de países desde el dataset datasets/geo-countries
// Este dataset usa: iso_a2 (2-letter), iso_a3 (3-letter), con campos _eh como alternativo para países con -99
const COUNTRIES_GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

// Estado activo
let currentCountry = null;
let globe = null;

// Mapeo para manejar códigos ISO -99 (Francia, Noruega usan campos _eh)
const isoMap = {
  // Los campos _eh contienen el código correcto cuando iso_a2/iso_a3 es -99
  // Se aplicará el mapeo dinámicamente al procesar cada país
};

/**
 * Obtiene el código ISO-2 correcto para un país del GeoJSON.
 * Si iso_a2 es "-99", usa iso_a2_eh en su lugar.
 */
function getIso2FromFeature(feature) {
  const props = feature.properties;
  if (props.iso_a2 && props.iso_a2 !== '-99') {
    return props.iso_a2;
  }
  // Campo alternativo para países con -99
  return props.iso_a2_eh || props.iso_a2 || '';
}

/**
 * Inicializa el globe.gl con los países.
 */
async function initGlobe() {
  // Cargar el GeoJSON de países
  const response = await fetch(COUNTRIES_GEOJSON_URL);
  const geojson = await response.json();

  // Inicializar globe.gl
  globe = GLGlob('globe', {
    // Configuración del globo
   uiControl: false,
    keyboardControl: false,
    zoomSpeed: 0.001,
    dragToRotate: true,
    dragToTilt: true,
  });

  // Añadir el relieve del terreno
  globe.addLayer('layer-terrain', GLTerrain() );

  // Añadir capa de países con click handling
  const countriesLayer = globe.addLayer('countries', GLSphereLayer, {
    mode: 'vector',
    polygon: true,
    // Usar el código ISO-2 como etiqueta/identificador
    getPolygon: (feature) => feature.geometry,
    getColor: (feature) => {
      // Color base de los países
      return [66, 135, 245, 0.8];
    },
    // Hover effect
    onHover: (feature, info) => {
      const iso2 = getIso2FromFeature(feature);
      // Podríamos resaltar aquí, pero usaremos el click para resaltar
    },
    onClick: async (feature, event) => {
      handleCountryClick(feature);
    },
  });

  // Añadir todas las features de países
  countriesLayer.setFeatures(geojson.features);
  
  // Ajustar la cámara para ver todo el globo
  globe.cameraControl.setState({
    lon: 0,
    lat: 0,
    zoom: 0.5,
  });
}

/**
 * Maneja el clic en un país.
 * - Resalta el país
 * - Muestra el nombre y código ISO en el panel lateral
 * - Carga datos de la API correspondiente
 */
async function handleCountryClick(feature) {
  const iso2 = getIso2FromFeature(feature).toUpperCase();
  const name = feature.properties.name || 'País desconocido';

  // Actualizar estado y UI
  currentCountry = iso2;
  updateCountrySidebar(iso2, name);

  // Resaltar el país clicado (cambiar color)
  if (globe) {
    globe.layers.forEach(layer => {
      if (layer.type === 'GLSphereLayer' && layer.props && layer.props.mode === 'vector') {
        // Marcar este país como activo - globe.gl no tiene fácil toggle por feature,
        // así que solo registramos el estado
        layer.activateFeature(feature);
      }
    });
  }

  // Cargar datos de la API (atlas, radio, tv) - pero NO conectar todavía
  // En el futuro: fetch(`${API_BASE}/countries/${iso2}/atlas`)
  console.log(`País seleccionado: ${iso2} - ${name}`);
}

/**
 * Actualiza el panel lateral con la información del país.
 */
function updateCountrySidebar(iso2, name) {
  const sidebar = document.getElementById('country-info');
  const countryName = document.getElementById('country-name');
  const countryCode = document.getElementById('country-code');

  countryName.textContent = name;
  countryCode.textContent = `Código ISO-2: ${iso2}`;
  sidebar.classList.remove('hidden');
}

/**
 * Cambia la pestaña activa en la barra de navegación.
 */
function setupToolbar() {
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Actualizar clase active
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Aquí más adelante se cargaría el módulo correspondiente
      const tab = btn.dataset.tab;
      console.log(`Modo cambiado a: ${tab}`);
    });
  });
}

/**
 * Oculta el panel lateral cuando se hace clic fuera.
 */
function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const globeDiv = document.getElementById('globe');

  globeDiv.addEventListener('click', (event) => {
    // Verificar si el clic fue en el área del globo (no en el sidebar)
    const rect = sidebar.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || 
        event.clientY < rect.top || event.clientY > rect.bottom) {
      sidebar.classList.add('hidden');
    }
  });
}

/**
 * Inicializa la aplicación.
 */
async function init() {
  await initGlobe();
  setupToolbar();
  setupSidebarToggle();

  // Verificar que la variable de entorno esté configurada
  if (!import.meta.env.VITE_API_URL) {
    console.warn('VITE_API_URL no está configurada. Usando URL por defecto.');
    console.log('Para configurar: VITE_API_URL=http://127.0.0.1:8000/api');
  }
}

init().catch(err => {
  console.error('Error inicializando la aplicación:', err);
});