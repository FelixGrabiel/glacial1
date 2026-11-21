# Supervisor en turno (quién está en cada área)

Cada **supervisor**, al entrar a su turno, indica en qué área está. Todos los módulos muestran, en una barra, **solo los nombres**.

## Áreas
- **Agua**: PET1, PET2, B7L, Cajas 20L y B20L.
- **Hielo**: hielo en cubos, premium y vasos.

## Cómo funciona
- Al iniciar sesión (o al cambiar el turno), a un supervisor con permiso de distribuir personal se le abre una pregunta: «¿En qué área estás en este turno?» con dos botones, Agua y Hielo. «Ahora no» la cierra hasta el próximo turno.
- La barra «Supervisor en turno · Agua: … · Hielo: …» aparece debajo de la cabecera en los módulos de Agua y arriba del contenido en el módulo de Hielo. Un área sin nadie dice «sin indicar». El supervisor ve «Cambiar mi área» (o «Indicar mi área» si aún no eligió).
- Quien cambia de área reemplaza su propia entrada; si hay dos supervisores en la misma área (por ejemplo Día e Intermedio), salen los dos nombres.
- Solo se muestra el nombre (nada de teléfono, hora ni rol).

## Datos
- Un documento por **fecha operativa y bloque** (Día incluye Intermedio; Noche aparte) en la colección que ya existe `distribucionPersonal`, con id `supervisores_AAAA-MM-DD_DIA|NOCHE`. Campos: `supervisores {uid: {uid, nombre, area, turno, desdeMs}}`, `version`, `tipo: 'SUPERVISORES'`.
- Usa las reglas que ya existen para esa colección (versión +1, hora del servidor, permiso `distribuirPersonal`, que el Supervisor tiene por defecto; leen todos con sesión). **No hay migración ni colección nueva.**
- Código: `js/personal/45-supervisor-en-turno.js`. Pruebas: `tests/supervisor-en-turno.test.js` (núcleo) y `tests/supervisor-en-turno.e2e.js` (navegador).

## Límites
- Quien no tenga el permiso «Distribuir personal» (o esté en modo visualización) solo ve la barra, no puede indicar su área.
- El Jefe de Producción y el Administrador no se preguntan: la pregunta es solo para el rol Supervisor.
