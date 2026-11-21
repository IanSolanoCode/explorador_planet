// Botón y menú de cuenta (icono + nombre). El menú incluye "Bloqueos" (solo
// para administradores) y "Salir".

import { leerEstado } from './estado.js';
import { alCambiarSesion } from './registro.js';
import { abrirModalAuth } from './modal-auth.js';
import { cerrarSesionRemota } from './auth.js';

function esAdmin() {
  const usuario = leerEstado('usuarioActual');
  return !!(usuario && usuario.role === 'admin');
}

function cerrarMenu(boton, menu) {
  if (!menu) return;
  menu.hidden = true;
  if (boton) boton.setAttribute('aria-expanded', 'false');
}

function actualizarBotonCuenta() {
  const boton = document.getElementById('btn-cuenta');
  const nombre = document.getElementById('cuenta-nombre');
  const menu = document.getElementById('menu-cuenta');
  const itemBloqueos = document.getElementById('btn-bloqueos');
  if (!boton) return;

  const usuario = leerEstado('usuarioActual');

  if (usuario) {
    if (nombre) nombre.textContent = usuario.name || 'Mi cuenta';
    // El nombre ya es texto visible: el nombre accesible no lo repite.
    boton.setAttribute('aria-label', 'Cuenta');
  } else {
    if (nombre) nombre.textContent = 'Entrar';
    boton.setAttribute('aria-label', 'Entrar');
  }

  // "Bloqueos" solo para administradores.
  if (itemBloqueos) itemBloqueos.hidden = !esAdmin();

  if (menu) boton.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
}

function setupCuenta() {
  const boton = document.getElementById('btn-cuenta');
  const menu = document.getElementById('menu-cuenta');
  const contenedor = document.getElementById('cuenta');
  const botonSalir = document.getElementById('btn-salir');

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
    botonSalir.addEventListener('click', () => {
      cerrarMenu(boton, menu);
      cerrarSesionRemota();
    });
  }

  if (menu) {
    // Cualquier clic en un item cierra el menú (Bloqueos lo abre admin.js).
    menu.addEventListener('click', (evento) => {
      if (evento.target.closest('[role="menuitem"]')) cerrarMenu(boton, menu);
    });
  }

  if (contenedor) {
    document.addEventListener('click', (evento) => {
      if (!menu || menu.hidden) return;
      if (!contenedor.contains(evento.target)) cerrarMenu(boton, menu);
    });

    // Escape cierra el menú y devuelve el foco al botón (salvo con modal abierto).
    document.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape' || !menu || menu.hidden) return;
      if (document.querySelector('.modal-auth:not([hidden]), .modal-bloqueo:not([hidden])')) return;
      cerrarMenu(boton, menu);
      if (boton) boton.focus();
    });
  }

  // auth.js avisa de los cambios de sesión; el botón se actualiza aquí.
  alCambiarSesion(actualizarBotonCuenta);
  actualizarBotonCuenta();
}

export { actualizarBotonCuenta, setupCuenta };
