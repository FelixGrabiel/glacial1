# Aviso «HAY UNA ACTUALIZACIÓN NUEVA»

Cada vez que se publica una versión nueva (cada fusión a `main`), las páginas que estén abiertas lo avisan para que actualicen.

**Cómo funciona** (`js/nucleo/03-actualizacion.js`)
- Cada 3 minutos, al volver a la pestaña y al recuperar la conexión, la página baja `index.html` sin caché y lo compara con el que cargó:
  - el **sello de la publicación** (`<meta name="glacial-build">`), que pone `scripts/construir-publicacion.js` con el commit y la hora (`scripts/sello-build.js`);
  - las versiones `?v=…` de los scripts y estilos.
- Si cambió algo, sale una barra naranja arriba: **HAY UNA ACTUALIZACIÓN NUEVA · Actualizar ahora · Más tarde**. «Más tarde» la reduce a una etiqueta abajo a la derecha que vuelve a abrirse a los 10 minutos.
- **No recarga sola**, para no perder lo que alguien esté escribiendo.
- Una respuesta de error o incompleta no cuenta como actualización. Sin red no hace nada.

**Alcance**
- GitHub Pages (producción): avisa en cada publicación aunque no cambie ningún `?v=`.
- Vista previa de Vercel: no tiene sello; avisa cuando cambia alguna versión `?v=` (por eso cada cambio de código debe subir su `?v=`).
- Tarda hasta ~3 minutos en aparecer después de que termina «Publicar página».

Pruebas: `tests/aviso-actualizacion.test.js`.
