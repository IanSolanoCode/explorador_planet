// Lógica de países y códigos ISO-2. Este módulo no toca el DOM ni conoce
// globe.gl: solo normaliza los datos que recibe de las features o de la API.

import { leerEstado } from './estado.js';

// Países sin código válido en ISO_A2 ni en WB_A2
const ISO2_EXCEPTIONS = { Norway: 'NO' };

function esCodigoValido(c) {
  return typeof c === 'string' && c.length === 2 && c !== '-99';
}

export function getIso2(props) {
  if (esCodigoValido(props.ISO_A2)) return props.ISO_A2;
  if (esCodigoValido(props.WB_A2)) return props.WB_A2;
  return ISO2_EXCEPTIONS[props.ADMIN] || '';
}

export function getName(props) {
  return props.ADMIN || 'País desconocido';
}

// Normaliza un país a ISO-2 en mayúsculas. Si el item no trae un código
// válido, usa el país seleccionado como respaldo y, si tampoco sirve, ''.
export function normalizarCountry(valor, respaldo = '') {
  const propio = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  if (/^[A-Z]{2}$/.test(propio)) return propio;

  const alterno = typeof respaldo === 'string' ? respaldo.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(alterno) ? alterno : '';
}

// País seleccionado ahora mismo, como código ISO-2 (o '' si no hay).
export function paisSeleccionadoIso2() {
  const selectedFeature = leerEstado('selectedFeature');
  if (!selectedFeature || !selectedFeature.properties) return '';
  return getIso2(selectedFeature.properties);
}
