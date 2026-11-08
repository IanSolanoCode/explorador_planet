import Globe from 'globe.gl';

// Se usará cuando conectemos la pestaña Radio
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// Países sin código válido en ISO_A2 ni en WB_A2
const ISO2_EXCEPTIONS = { Norway: 'NO' };

const COLOR_BASE = 'rgba(66, 135, 245, 0.8)';
const COLOR_SELECCION = 'rgba(255, 215, 0, 0.9)';

let globe = null;
let selectedFeature = null;

function esCodigoValido(c) {
  return typeof c === 'string' && c.length === 2 && c !== '-99';
}

function getIso2(props) {
  if (esCodigoValido(props.ISO_A2)) return props.ISO_A2;
  if (esCodigoValido(props.WB_A2)) return props.WB_A2;
  return ISO2_EXCEPTIONS[props.ADMIN] || '';
}

function getName(props) {
  return props.ADMIN || 'País desconocido';
}

function aplicarEstilos() {
  globe
    .polygonCapColor((f) => (f === selectedFeature ? COLOR_SELECCION : COLOR_BASE))
    .polygonAltitude((f) => (f === selectedFeature ? 0.08 : 0.01));
}

function actualizarPanel(props) {
  const iso2 = getIso2(props);
  const codigo = document.getElementById('country-code');

  document.getElementById('country-name').textContent = getName(props);
  if (iso2) {
    codigo.textContent = `Código ISO-2: ${iso2}`;
    codigo.style.color = '#e0e0e0';
  } else {
    codigo.textContent = 'Este territorio no tiene código de país';
    codigo.style.color = '#ff9999';
  }
  document.getElementById('country-info').classList.remove('hidden');
}

function handleCountryClick(feature) {
  selectedFeature = feature;
  aplicarEstilos();
  actualizarPanel(feature.properties);
}

async function initGlobe() {
  const res = await fetch('/countries/ne_110m_admin_0_countries.geojson');
  if (!res.ok) throw new Error(`No se pudo cargar el mapa (HTTP ${res.status})`);
  const { features } = await res.json();

  globe = Globe()(document.getElementById('globe'))
    .backgroundColor('#0a0a0f')
    .polygonsData(features)
    .polygonSideColor(() => 'rgba(0, 100, 200, 0.3)')
    .polygonStrokeColor(() => '#1a3a6e')
    .polygonLabel((f) => {
      const iso2 = getIso2(f.properties);
      const nombre = getName(f.properties);
      return iso2 ? `<b>${nombre}</b> (${iso2})` : `<b>${nombre}</b>`;
    })
    .onPolygonClick((f) => handleCountryClick(f));

  aplicarEstilos();
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.5;
}

function setupToolbar() {
  const botones = document.querySelectorAll('.tab-btn');
  botones.forEach((btn) => {
    btn.addEventListener('click', () => {
      botones.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

async function init() {
  await initGlobe();
  setupToolbar();
}

init().catch((err) => {
  console.error('Error inicializando la aplicación:', err);
});