# Búsqueda de texto común (21/11/2026)

**Por qué**: en varios módulos el buscador pedía el texto completo, en el mismo orden y con las mismas tildes (por ejemplo «bolsa 3 kg» no encontraba «BOLSA 3KG», «Prefo» no encontraba PREFORMA en el artículo del lote, «Pérez María» no encontraba «María Pérez»).

**Qué hace ahora** (`js/nucleo/04b-busqueda.js`, `window.glacialBusqueda`; pruebas en `tests/busqueda-comun.test.js`):
- No importan las mayúsculas, las tildes ni los signos (guiones, comas, puntos y comas, apóstrofos: «Bell's» = «Bells»).
- **Todas** las palabras escritas deben aparecer, **en cualquier orden** y aunque estén en campos distintos (proveedor + lote, nombre + cargo…).
- Cada palabra puede ser el inicio de una palabra del texto («prefo» → PREFORMA). Con 3 letras o más (4 si lleva números) también vale dentro de la palabra, así un DNI o un lote se encuentra por sus últimas cifras. Un número corto como «3» solo vale al inicio (3 kg no coincide con 13 kg).
- «3 kg» = «3kg», «250 ml» = «250ml», «13,5» = «13.5».
- Una búsqueda vacía muestra todo.

**Dónde se usa**: Asistente (Inventario de insumos, Conteo, Conciliación, Auditoría, Evidencias, Lotes y almacén, artículo del catálogo al crear lote, Proveedores, Conversiones), Calidad (Validación de lotes), Mantenimiento (Intervenciones, Banco de paradas, Preventivos, Plan anual, identificación de técnicos, rotación), Personal (Trabajadores, Tareo: historial, general y resumen; Horas extras) y Administración (usuarios, trabajadores, auditoría, factores). En los sitios que ya buscaban de otra forma, lo que antes coincidía **sigue coincidiendo** (la regla nueva solo suma resultados).

**Para agregar un buscador nuevo**: `glacialBusqueda.coincide(textoOLista, consulta)` o `glacialBusqueda.filtrar(lista, consulta, x=>[x.nombre,x.codigo])`. En archivos que también corren en Node: `require('../nucleo/04b-busqueda.js')`.

**Artículo del catálogo al crear lote**: si el catálogo del Inventario todavía no cargó, falló o está vacío, la ventana lo dice (antes mostraba «Ningún artículo coincide»). Cuando no hay coincidencias dice cuántos artículos se buscaron.
