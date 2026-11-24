# App instalable (PWA) · 16/11/2026

GLACIAL se puede **instalar como aplicación** en Android, iPhone/iPad y PC. Sigue siendo la misma página: un solo código, sin tiendas,
y cada publicación llega a todos los equipos igual que antes.

## Qué la forma
| Archivo | Para qué |
|---|---|
| `manifest.webmanifest` (raíz) | Nombre, colores, pantalla completa (`standalone`) e íconos |
| `sw.js` (raíz) | Service worker. **No guarda caché.** Solo muestra «Sin conexión» si se abre la página sin internet |
| `js/nucleo/03c-app-instalable.js` | Registra `sw.js` y ofrece «Instalar GLACIAL» en el inicio de sesión |
| `assets/img/icono-512.png`, `icono-maskable-192.png`, `icono-maskable-512.png` | Íconos de la app (salen de `logo_glacial.jpeg`) |

`scripts/construir-publicacion.js` copia `manifest.webmanifest` y `sw.js` a la raíz del sitio publicado. `sw.js` **debe** quedar junto a
`index.html`: un service worker solo cubre su carpeta y las de adentro.

## Por qué no guarda caché
GLACIAL es en tiempo real y se usa desde muchos equipos a la vez. Un service worker con caché puede dejar a un celular con código viejo.
Por eso `sw.js` no intercepta scripts, estilos, imágenes ni datos (Supabase): todo va a la red como siempre, y el aviso
«HAY UNA ACTUALIZACIÓN NUEVA» (`aviso-actualizacion.md`) y los `?v=` funcionan igual. Lo único que hace es responder con la pantalla
«Sin conexión» (que reintenta sola) cuando se **abre** la página sin red.

## Cómo se instala
- **Android / PC (Chrome, Edge):** en el inicio de sesión aparece «Instalar GLACIAL» → *Instalar*. También desde el menú del navegador.
- **iPhone / iPad (Safari):** *Compartir* → **«Agregar a pantalla de inicio»** (ahí no existe instalación automática; la página lo indica).
- «Ahora no» oculta la oferta 14 días. No aparece si ya está instalada, en modo TV ni dentro de la aplicación.

## Sin zoom dentro de la app (24/11/2026)
Solo cuando GLACIAL corre como **app instalada** (en el navegador el zoom sigue, por accesibilidad), `03c-app-instalable.js`:
- cambia el viewport a `maximum-scale=1.0, user-scalable=no`: sin zoom con dos dedos en Android y sin el zoom automático del iPhone
  al tocar un campo de texto;
- pone `html.app-instalada { touch-action: manipulation }`: sin zoom con doble toque;
- en iPhone (que ignora `user-scalable=no`) cancela el gesto de pellizco (`gesturestart` / `gesturechange`).

## Actualizaciones sin reinstalar (17/11/2026)
Quien ya instaló GLACIAL **no tiene que volver a instalarla** cuando se publica una versión nueva:
- **El código** lo trae el aviso «HAY UNA ACTUALIZACIÓN NUEVA» (`aviso-actualizacion.md`), igual que en el navegador: revisa cada 3 minutos
  y cada vez que se vuelve a la app. Si nadie está escribiendo ni guardando, se recarga sola; si no, muestra «Actualizar ahora».
  Funciona porque `sw.js` no guarda caché.
- **El propio `sw.js`** se registra con `updateViaCache: 'none'` y se revisa al volver a primer plano (como mucho cada 30 min). Uno nuevo
  toma el control solo (`skipWaiting` + `clients.claim`).
- **Nombre e íconos**: Android los renueva solo en la app instalada (puede tardar hasta un día). iPhone conserva el ícono anterior hasta
  reinstalar: es solo apariencia, el contenido sí se actualiza. Por eso **no se cambian** `id` ni `start_url` del manifiesto.

## Si cambia la dirección (dominio propio)
Las rutas del manifiesto son relativas (`./`), así que sirve en `…/glacial1/` y en un dominio propio sin tocar nada. Es lo **único** que obliga a reinstalar:
la app instalada queda atada a la dirección donde se instaló. Conviene que el personal la instale cuando GLACIAL ya esté en su dirección definitiva.

## Pruebas
`node tests/app-instalable.test.js`
