// Configuración mínima para el refactor modular.
// Solo se activan dos reglas: `no-undef` (detecta referencias que un build no
// ve) y `no-unused-vars` (detecta restos de código al mover bloques).
// No se añaden reglas de estilo para no alterar el código existente.
export default [
  {
    files: ['main.js', 'src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        HTMLElement: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
    },
  },
];
