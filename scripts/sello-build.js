/* GLACIAL · sello de cada publicación (13/11/2026)
   Agrega a index.html la marca <meta name="glacial-build" content="…"> con el identificador de la publicación (commit + fecha).
   La página abierta la compara con la que hay publicada para avisar «HAY UNA ACTUALIZACIÓN NUEVA» (js/nucleo/03-actualizacion.js).
   Lo usa scripts/construir-publicacion.js. Pura: recibe y devuelve texto. */
'use strict';
function sellar(html, id){
  const marca = '<meta name="glacial-build" content="' + String(id).replace(/[^A-Za-z0-9._:|-]/g, '') + '">';
  const sin = String(html).replace(/<meta\s+name=["']glacial-build["'][^>]*>\s*/i, '');   // repetir el armado no duplica la marca
  if (!/<\/head>/i.test(sin)) return sin;
  return sin.replace(/<\/head>/i, '    ' + marca + '\n</head>');
}
module.exports = { sellar };
