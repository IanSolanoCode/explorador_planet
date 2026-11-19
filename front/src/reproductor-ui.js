// UI común de los reproductores: botón X (cerrar), botón minimizar y cierre
// por Escape. El estado minimizado es único y compartido entre radio y TV.

import { escribirEstado, leerEstado } from './estado.js';
import { detenerRegistrado } from './registro.js';

// Botón X que cierra el reproductor. Se coloca como overlay en una esquina.
export function crearBotonCerrar(alCerrar) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'reproductor-cerrar';
  boton.setAttribute('aria-label', 'Cerrar reproductor');
  boton.textContent = '×';
  boton.addEventListener('click', (evento) => {
    // No propaga el toque: cerrar no debe expandir la miniatura.
    evento.stopPropagation();
    // La X resetea la preferencia minimizada compartida.
    escribirEstado('reproductorMinimizado', false);
    alCerrar();
  });
  return boton;
}

// Botón minimizar/expandir; `alAlternar` se invoca al pulsarlo.
export function crearBotonMinimizar(alAlternar) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-control reproductor-minimizar';
  boton.setAttribute('aria-label', 'Minimizar reproductor');
  boton.setAttribute('aria-expanded', 'true');
  boton.textContent = '▁';
  boton.addEventListener('click', alAlternar);
  return boton;
}

// Refleja el estado minimizado compartido en la clase y en el aria.
export function aplicarMinimizado(contenedor, btnMinimizar) {
  const minimizado = !!leerEstado('reproductorMinimizado');
  contenedor.classList.toggle('minimizado', minimizado);
  btnMinimizar.setAttribute('aria-expanded', minimizado ? 'false' : 'true');
  btnMinimizar.setAttribute('aria-label', minimizado ? 'Expandir reproductor' : 'Minimizar reproductor');
}

export function alternarMinimizado(contenedor, btnMinimizar) {
  escribirEstado('reproductorMinimizado', !leerEstado('reproductorMinimizado'));
  aplicarMinimizado(contenedor, btnMinimizar);
}

export function hayModalAbierto() {
  return !!document.querySelector('.modal-auth:not([hidden]), .modal-bloqueo:not([hidden])');
}

// Cierre por Escape: una sola acción por pulsación. Cierra solo el reproductor
// expandido que tenga el foco dentro; nunca si hay un modal abierto (el modal
// se cierra primero) ni en pantalla completa (sale primero de ella).
let escapeInstalado = false;
export function instalarEscapeReproductor() {
  if (escapeInstalado) return;
  escapeInstalado = true;

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    if (hayModalAbierto()) return;
    if (document.fullscreenElement) return;

    const activo = document.activeElement;
    const radio = document.getElementById('radio-player');
    const tv = document.getElementById('tv-player');

    const radioCierra = radio && !radio.hidden && !radio.classList.contains('minimizado') && radio.contains(activo);
    const tvCierra = tv && !tv.hidden && !tv.classList.contains('minimizado') && tv.contains(activo);

    if (radioCierra) {
      escribirEstado('reproductorMinimizado', false);
      detenerRegistrado('radio');
    } else if (tvCierra) {
      escribirEstado('reproductorMinimizado', false);
      detenerRegistrado('tv');
    }
  });
}
