/* theme.js — init del tema del portal, parser-blocking (en el <head>).
   Sin defer/module: diferido = flash claro→oscuro en cada carga. Chico a
   propósito (se paga en cada página). El toggle vive en el shell. */
(function () {
  try {
    var t = localStorage.getItem('sivo-portal_theme') || 'light'
    document.documentElement.setAttribute('data-theme', t)
  } catch (e) { /* localStorage bloqueado */ }
})()
