import { escribirEstado } from './src/estado.js';
import { configurarManejador401 } from './src/api.js';
import { crearReproductor } from './src/reproductor-radio.js';
import { crearReproductorTv } from './src/reproductor-tv.js';
import { configurarAperturaAuth, setupFavoritos } from './src/favoritos.js';
import { initGlobe } from './src/globo.js';
import { setupToolbar } from './src/toolbar.js';
import { inicializarSesion, leerToken, cerrarSesionLocal } from './src/auth.js';
import { setupCuenta } from './src/cuenta.js';
import { setupAdmin } from './src/admin.js';
import { abrirModalAuth } from './src/modal-auth.js';
import { cargarVolumen } from './src/utils.js';
import { iniciarHoja } from './src/hoja.js';

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
  iniciarHoja();
  setupToolbar();
  // Favoritos no importa el modal: recibe la función que lo abre.
  configurarAperturaAuth(abrirModalAuth);
  setupCuenta();
  setupFavoritos();
  // Administración: crea el botón "Admin" y conecta el estado de sesión.
  setupAdmin();

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