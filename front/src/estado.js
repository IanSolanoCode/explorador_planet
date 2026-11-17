// Estado compartido entre módulos.
// No se exportan variables `let` sueltas: se leen y escriben mediante funciones
// para que cualquier módulo pueda cambiar un valor sin reasignar la referencia.
// `favoritos` se expone como Map mutable: se usa `mapaFavoritos()` y nunca se
// reasigna, porque las peticiones en curso dependen de esa misma instancia.

import { VOLUMEN_POR_DEFECTO } from './utils.js';

const estado = {
  globe: null,
  selectedFeature: null,
  hoveredFeature: null,
  modoActual: 'radio', // 'radio' o 'tv'
  token: '',
  usuarioActual: null,
  favoritos: new Map(), // clave `${type}:${itemId}` -> favorito de la API
  versionSesion: 0, // invalida respuestas de favoritos de una sesión anterior
  peticionFavoritosActual: 0,
  vistaFavoritos: false,
  volumenRecordado: VOLUMEN_POR_DEFECTO, // 0–1; se carga en init()
};

export function leerEstado(clave) {
  return estado[clave];
}

export function escribirEstado(clave, valor) {
  estado[clave] = valor;
}

export function mapaFavoritos() {
  return estado.favoritos;
}
