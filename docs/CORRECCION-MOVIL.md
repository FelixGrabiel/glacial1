# Botón Avance/Cierre y encabezado en celular

## Causa
- **Botón**: `avRestaurarPosicionFlotante` y el arrastre escribían `left/top` inline (coordenadas de escritorio guardadas en `glacial_avance_flotante_pos`) y anulaban `right/bottom`. En un teléfono eso podía dejar el botón sobre el encabezado o el horario del turno. Nada normalizaba el botón al girar o cambiar de tamaño, y el contenido no reservaba espacio bajo él.
- **Encabezado**: el título completo («Reporte Diario de Producción») competía en una fila con menú, campana y salida (se cortaba con «…»); varias capas de `mobile-glacial.css` fijaban los controles a 42 px con `!important`; y la campana tenía `overflow:hidden` + `font-size:0` en su `strong`, que recortaba o desplazaba el badge hacia «Salir».

## Corrección
- `29-avance-produccion.js`: `avEsMovil()` (mismo corte que el CSS: 700 px) y `avNormalizarBotonFlotante()`: en móvil quita las propiedades inline de posición y marca `data-modo="movil"`; en escritorio restaura la posición guardada válida (o la acomoda a la ventana). No se borra `localStorage`. En móvil no se aplica la posición guardada ni se arrastra; un solo toque abre (`click`). Se normaliza al cargar, al cambiar el tamaño, al girar y al cruzar el punto de corte (listeners registrados UNA vez; sin `requestAnimationFrame`, para que funcione también en pestañas en segundo plano). Una sola instancia (se eliminan duplicados). Se conservan las comprobaciones de sesión, permiso y pantalla operativa. Texto «Avance / Cierre» con `aria-label`.
- CSS (en el mismo archivo): en móvil fijo abajo a la derecha (`!important` también protege frente a estilos inline), 48 px de alto, margen 14 px + área segura, asa oculta; con un modal abierto el disparador se oculta y no recibe toques; mientras existe el botón, `body.av-con-flotante` reserva 84 px al final del contenido.
- `index.html` + `mobile-glacial.css`: título con `<span class="tt-full">` (nombre completo, accesible) y `<span class="tt-short">GLACIAL · Producción</span>` (móvil); el contenedor del título se reduce (`min-width:0`); menú, campana y salida de 44 × 44 px que no se encogen; el badge queda en la esquina de la campana. No se oculta el desbordamiento de la página.
- No hay navegación inferior en la app: el botón queda sobre el contenido (la barra «Viendo como» ya está 76 px por encima).

## Validación
Prueba automática: `tests/boton-flotante.test.js`. Revisión visual en el navegador integrado con la página real (usuario simulado, campana con el mismo marcado que `25-alertas-lineas.js`): 320, 360, 390 y 430 px, horizontal (844 × 390) y escritorio (1280 × 800); posición antigua guardada (120, 90); móvil ↔ escritorio; un toque abre y cierra el modal (el disparador se oculta y vuelve); sin permiso/sin sesión se retira el botón y el espacio reservado. Capturas: `docs/capturas-movil/` (antes: la campana de esa captura es simulada; después: 360 y 320 px).

## No comprobado
- En un teléfono o tablet reales (toque real, giro físico, barra del navegador y teclado). El emulador del navegador integrado no dispara `resize` al cambiar el tamaño: lo comprobé enviando el evento a mano.
- La pantalla con datos reales (campana con alertas reales, cronómetro del turno, Inicio con horario).
- En PRUEBAS, el modal de Avance queda parcialmente bajo la franja roja «BASE DE PRUEBAS» (ya ocurría antes; no se tocó).
