# GLACIAL

App web de reportes de producción, tareo, planificación y mantenimiento de la planta. HTML + JavaScript **sin módulos ni empaquetador**;
los datos viven en **Supabase** (Firebase quedó cerrado como respaldo de solo lectura). Se usa en tiempo real desde PC, tablets y celulares.

## Abrir en Visual Studio Code
Archivo → *Abrir área de trabajo desde archivo…* → `glacial.code-workspace`. Agrupa la vista por área (Núcleo, Accesos, Producción,
Personal/Tareo, Mantenimiento, RRHH, Asistente, Supabase, Documentación, Pruebas) sin mover nada en disco. Instala las extensiones
que VS Code recomienda (`.vscode/extensions.json`).

## Probar en local
```
node tests/visual/servir.js        # abre http://localhost:5599
```
Cualquier dirección que no sea la de producción (`localhost`, `127.0.0.1`, otros dominios) abre el entorno de **PRUEBAS**.

## Correr las pruebas automáticas
```
node tests/correr-todo.js              # todas
node tests/correr-todo.js tareo plan   # solo las que contienen esas palabras
```

## Aviso importante: el orden de los scripts
`index.html` carga los `<script>` en un **orden fijo**. Las funciones son globales y varios archivos redefinen funciones de otros:
**el orden de carga es parte del código**. No lo cambies. Cada `<script>` y `<link>` lleva `?v=AAAAMMDD-xxx`: súbelo cuando cambies
el archivo para que los celulares no usen la versión vieja.

## Carpetas
| Carpeta | Contenido |
|---|---|
| `css/`, `assets/` | Estilos y logo |
| `js/` | Código de la página, por área |
| `supabase/` | Migraciones (ya aplicadas, no se tocan) y SQL sueltos |
| `docs/` | Documentación por tema |
| `tests/` | Pruebas automáticas y páginas de validación visual |
| `_archivo/` | Lo que ya no se usa (Firebase cerrado), con su nota |

Índice completo de archivos y orden de carga: [`INDICE.md`](INDICE.md).

## Trabajar desde varias PC
Con GitHub Desktop: *Fetch/Pull* antes de empezar a trabajar y *Push* al terminar.
