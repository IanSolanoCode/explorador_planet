// Botón y menú de cuenta.
// auth.js avisa de los cambios de sesión mediante el registro compartido.

import { leerEstado } from './estado.js';
import { alCambiarSesion } from './registro.js';
import { abrirModalAuth } from './modal-auth.js';
import { cerrarSesionRemota } from './auth.js';

function actualizarBotonCuenta() {
  const boton = document.getElementById('btn-cuenta');
  const menu = document.getElementById('menu-cuenta');
  if (!boton) return;

  if (leerEstado('usuarioActual')) {
    const nombre = leerEstado('usuarioActual').name || 'Mi cuenta';
    boton.textContent = nombre;
    boton.setAttribute('aria-label', `Cuenta de ${nombre}`);
  } else {
    boton.textContent = 'Entrar';
    boton.setAttribute('aria-label', 'Entrar');
    if (menu) menu.hidden = true;
  }

  if (menu) {
    boton.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  }
}

function setupCuenta() {
  const boton = document.getElementById('btn-cuenta');
  const menu = document.getElementById('menu-cuenta');
  const botonSalir = document.getElementById('btn-salir');
  const contenedor = document.getElementById('cuenta');

  if (boton) {
    boton.addEventListener('click', (evento) => {
      evento.stopPropagation();
      if (!leerEstado('usuarioActual')) {
        abrirModalAuth('login');
        return;
      }
      if (!menu) return;
      menu.hidden = !menu.hidden;
      boton.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
  }

  if (botonSalir) {
    botonSalir.addEventListener('click', (evento) => {
      evento.stopPropagation();
      cerrarSesionRemota();
    });
  }

  if (contenedor) {
    document.addEventListener('click', (evento) => {
      if (!menu || menu.hidden) return;
      if (!contenedor.contains(evento.target)) {
        menu.hidden = true;
        if (boton) boton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // auth.js avisa de los cambios de sesión; el botón se actualiza aquí.
  alCambiarSesion(actualizarBotonCuenta);
  actualizarBotonCuenta();
}

export { actualizarBotonCuenta, setupCuenta };
