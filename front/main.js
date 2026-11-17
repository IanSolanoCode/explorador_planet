import Globe from 'globe.gl';

import { leerEstado, escribirEstado } from './src/estado.js';
import { configurarManejador401 } from './src/api.js';
import {
  crearReproductor,
  detenerAudio,
} from './src/reproductor-radio.js';
import {
  crearReproductorTv,
  detenerTv,
} from './src/reproductor-tv.js';
import { cancelarCargaRadio, cargarRadio } from './src/radio.js';
import { cancelarCargaTv, cargarTv } from './src/tv.js';
import {
  configurarAperturaAuth,
  marcarVistaFavoritos,
  setupFavoritos,
} from './src/favoritos.js';
import { actualizarPanel, actualizarPanelTv } from './src/panel.js';
import { inicializarSesion, leerToken, cerrarSesionLocal } from './src/auth.js';
import { setupCuenta } from './src/cuenta.js';
import { abrirModalAuth } from './src/modal-auth.js';
import { cargarVolumen } from './src/utils.js';
import { getIso2, getName } from './src/paises.js';

// Colores de país casi transparentes para dejar ver la textura de la Tierra.
const COLOR_PAIS_BASE = 'rgba(120, 170, 255, 0.10)';
const COLOR_PAIS_HOVER = 'rgba(255, 215, 0, 0.18)';
const COLOR_PAIS_SELECCIONADO = 'rgba(255, 215, 0, 0.35)';

let timerRotacion = null;

// --- Estilos del globe.gl ---

function aplicarEstilos() {
  leerEstado('globe')
    .polygonCapColor((f) => {
      if (f === leerEstado('selectedFeature')) return COLOR_PAIS_SELECCIONADO;
      if (f === leerEstado('hoveredFeature')) return COLOR_PAIS_HOVER;
      return COLOR_PAIS_BASE;
    })
    .polygonAltitude((f) => {
      if (f === leerEstado('selectedFeature')) return 0.03;
      if (f === leerEstado('hoveredFeature')) return 0.02;
      return 0.005;
    });
}

// --- Cuentas y favoritos ---

function setupCuentaYFavoritos() {
  setupCuenta();
  setupFavoritos();
}

// --- Eventos del toolbar ---

function setupToolbar() {
  // Solo las pestañas reales; la cuenta y "Mis favoritos" usan otras acciones.
  const botones = document.querySelectorAll('.tab-btn[data-tab]');
  
  botones.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Quitar clase active de todos
      botones.forEach((b) => b.classList.remove('active'));
      // Añadir clase active al clicado
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      console.log('Modo cambiado a:', tab);
      escribirEstado('modoActual', tab);
      marcarVistaFavoritos(false);
      
      if (tab === 'tv') {
        // Detener lo que suene y cancelar la carga de radio en curso.
        detenerAudio();
        detenerTv();
        cancelarCargaRadio();

        const feature = leerEstado('selectedFeature');
        if (!feature) {
          const codigo = document.getElementById('country-code');
          codigo.textContent = 'Selecciona un país para ver canales de TV';
          codigo.style.color = '#aaa';
        } else {
          const iso2 = getIso2(feature.properties);
          if (iso2) {
            actualizarPanelTv(feature.properties, { loading: true });
            cargarTv(iso2).then((datos) => {
              // Descartar respuestas si el usuario cambió de pestaña o de país.
              if (leerEstado('modoActual') !== 'tv' || leerEstado('selectedFeature') !== feature) return;
              actualizarPanelTv(feature.properties, datos);
            });
          } else {
            actualizarPanelTv(feature.properties, null);
          }
        }
      } else if (tab === 'radio') {
        // Al volver a radio, cortar la TV y su carga pendiente.
        detenerTv();
        cancelarCargaTv();

        // Si hay un país seleccionado, recargar radio de ese país
        if (leerEstado('selectedFeature')) {
          const feature = leerEstado('selectedFeature');
          const iso2 = getIso2(feature.properties);
          if (iso2) {
            cargarRadio(iso2).then(datos => {
              if (leerEstado('modoActual') !== 'radio' || leerEstado('selectedFeature') !== feature) return;
              actualizarPanel(feature.properties, datos);
            });
          } else {
            actualizarPanel(feature.properties, { sinCodigo: true });
          }
        } else {
          // Si no hay país seleccionado, limpiar panel
          actualizarPanel({});
        }
      }
    });
  });
}

// --- Manejo de clic en país ---

// Centro aproximado del país: promedio de sus coordenadas, ajustando el
// antimeridiano (±360) para no cruzar el globo en países como Rusia o Fiyi.
function calcularCentro(feature) {
  const puntos = [];
  const recolectar = (arr) => {
    if (typeof arr[0] === 'number') {
      puntos.push(arr);
    } else {
      arr.forEach(recolectar);
    }
  };
  const geo = feature.geometry;
  if (geo && geo.coordinates) recolectar(geo.coordinates);
  if (!puntos.length) return { lat: 0, lng: 0 };

  const refLng = puntos[0][0];
  let sumLat = 0;
  let sumLng = 0;
  puntos.forEach(([lng, lat]) => {
    let l = lng;
    while (l - refLng > 180) l -= 360;
    while (l - refLng < -180) l += 360;
    sumLat += lat;
    sumLng += l;
  });
  return { lat: sumLat / puntos.length, lng: sumLng / puntos.length };
}

function handleCountryClick(feature) {
  escribirEstado('selectedFeature', feature);
  marcarVistaFavoritos(false);
  aplicarEstilos();

  // Vuelo suave de la cámara hacia el país seleccionado (~1 s).
  const centro = calcularCentro(feature);
  leerEstado('globe').pointOfView({ lat: centro.lat, lng: centro.lng, altitude: 1.6 }, 1000);

  const iso2 = getIso2(feature.properties);

  // La pestaña activa decide qué módulo cargar; ya no se fuerza radio.
  if (leerEstado('modoActual') === 'tv') {
    if (iso2) {
      actualizarPanelTv(feature.properties, { loading: true });
      cargarTv(iso2).then((datos) => {
        // Descartar respuestas si cambió la pestaña o el país seleccionado.
        if (leerEstado('modoActual') !== 'tv' || leerEstado('selectedFeature') !== feature) return;
        actualizarPanelTv(feature.properties, datos);
      });
    } else {
      // País sin código: mostrar mensaje y no llamar a API
      actualizarPanelTv(feature.properties, null);
    }
    return;
  }

  if (iso2) {
    // Cargar radio para este país
    cargarRadio(iso2).then(datos => {
      if (leerEstado('modoActual') !== 'radio' || leerEstado('selectedFeature') !== feature) return;
      actualizarPanel(feature.properties, datos);
    });
  } else {
    // País sin código: mostrar mensaje y no llamar a API
    actualizarPanel(feature.properties, { sinCodigo: true });
  }
}

// --- Inicialización del globe ---

async function initGlobe() {
  const res = await fetch('/countries/ne_110m_admin_0_countries.geojson');
  if (!res.ok) throw new Error(`No se pudo cargar el mapa (HTTP ${res.status})`);
  const { features } = await res.json();

  const globe = Globe()(document.getElementById('globe'))
    .backgroundColor('#0a0a0f')
    .globeImageUrl('/textures/earth-blue-marble.jpg')
    .bumpImageUrl('/textures/earth-topology.png')
    .backgroundImageUrl('/textures/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('lightskyblue')
    .atmosphereAltitude(0.1)
    .polygonsData(features)
    .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
    .polygonStrokeColor(() => 'rgba(160, 190, 255, 0.25)')
    .polygonsTransitionDuration(300)
    .polygonLabel((f) => {
      const iso2 = getIso2(f.properties);
      const nombre = getName(f.properties);
      return iso2 ? `<b>${nombre}</b> (${iso2})` : `<b>${nombre}</b>`;
    })
    .onPolygonClick((f) => handleCountryClick(f))
    .onPolygonHover((f) => {
      escribirEstado('hoveredFeature', f);
      aplicarEstilos();
    });

  escribirEstado('globe', globe);
  aplicarEstilos();
  configurarControles();
  leerEstado('globe').renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// Controles de cámara: inercia, zoom limitado y rotación que se pausa al interactuar
function configurarControles() {
  const c = leerEstado('globe').controls();
  c.enableDamping = true;
  c.dampingFactor = 0.08;
  c.minDistance = 150;
  c.maxDistance = 500;
  c.autoRotate = true;
  c.autoRotateSpeed = 0.3;

  c.addEventListener('start', () => {
    c.autoRotate = false;
    if (timerRotacion) {
      clearTimeout(timerRotacion);
      timerRotacion = null;
    }
  });

  c.addEventListener('end', () => {
    if (timerRotacion) clearTimeout(timerRotacion);
    timerRotacion = setTimeout(() => {
      c.autoRotate = true;
      timerRotacion = null;
    }, 3000);
  });
}

// --- Inicialización de la aplicación ---

async function init() {
  // El token y el volumen se leen al arrancar; los módulos no tocan
  // localStorage al importarse.
  escribirEstado('token', leerToken());
  escribirEstado('volumenRecordado', cargarVolumen());
  // El 401 se maneja aquí, fuera de api.js, para no crear un ciclo con auth.
  configurarManejador401(({ aviso }) => cerrarSesionLocal({ aviso }));

  await initGlobe();
  crearReproductor();
  crearReproductorTv();
  setupToolbar();
  // Favoritos no importa el modal: recibe la función que lo abre.
  configurarAperturaAuth(abrirModalAuth);
  setupCuentaYFavoritos();

  // La validación de sesión y la carga de favoritos no bloquean el globo.
  inicializarSesion().catch((err) => {
    console.error('Error comprobando la sesión:', err);
  });
  
  // Verificar que la variable de entorno esté configurada
  if (!import.meta.env.VITE_API_URL) {
    console.warn('VITE_API_URL no está configurada. Usando URL por defecto.');
    console.log('Para configurar: VITE_API_URL=http://127.0.0.1:8000/api');
  }
}

init().catch((err) => {
  console.error('Error inicializando la aplicación:', err);
});